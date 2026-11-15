import { Buffer } from 'buffer';
import { Authorized, Keypair, Lockup, PublicKey, StakeProgram, Transaction, ValidatorInfo, VALIDATOR_INFO_KEY } from '@solana/web3.js';
import { discoverStakeAccountsByAuthority, parseStakeAmount, type NativeStakeAccount, type NativeStakeValidator } from '@grape/core';
import { solanaSwapRpc } from './solanaSwapRpc';

export type MobileStakeRequest = { action: 'stake'; amount: string; voteAccount: string } | { action: 'deactivate'; stakeAccount: string } | { action: 'withdraw'; stakeAccount: string; amount: string };
export type PreparedMobileStake = {
  request: MobileStakeRequest; walletId: string; owner: string; rpcUrl: string; transaction: Transaction;
  stakeAccount: string; feeLamports: number; depositLamports: number; debitLamports: number;
  message: string; createdAt: number; consumed: boolean;
};
type ParsedStake = { pubkey: string; account: { lamports: number; owner?: string; data: { parsed?: { type?: string; info?: { meta?: { authorized?: { staker?: string; withdrawer?: string } }; stake?: { delegation?: { voter?: string; stake?: string; deactivationEpoch?: string } } } } } } };
type Rpc = typeof solanaSwapRpc;
const safeLamports = (value: number) => { if (!Number.isSafeInteger(value) || value < 0) throw new Error('The network returned an invalid SOL amount. Refresh and try again.'); return value; };

export function createMobileStakingService(rpcUrl: string, rpc: Rpc = solanaSwapRpc, now = Date.now) {
  async function accounts(owner: string): Promise<{ accounts: NativeStakeAccount[]; warnings: string[] }> {
    const address = new PublicKey(owner).toBase58();
    const found = await discoverStakeAccountsByAuthority(offset => rpc<ParsedStake[]>(rpcUrl, 'getProgramAccounts', [StakeProgram.programId.toBase58(), { encoding: 'jsonParsed', commitment: 'confirmed', filters: [{ dataSize: StakeProgram.space }, { memcmp: { offset, bytes: address } }] }]));
    const rows = new Map<string, NativeStakeAccount>();
    let unreadable = false;
    for (const item of found.accounts) {
      const parsed = item.account.data.parsed;
      const info = parsed?.info;
      const delegated = Number(info?.stake?.delegation?.stake ?? '0');
      if (!info) unreadable = true;
      rows.set(item.pubkey, { address: item.pubkey, lamports: safeLamports(item.account.lamports), delegatedLamports: safeLamports(delegated), state: parsed?.type ?? 'unknown',
        voter: info?.stake?.delegation?.voter ?? null, staker: info?.meta?.authorized?.staker ?? null, withdrawer: info?.meta?.authorized?.withdrawer ?? null,
        deactivationEpoch: info?.stake?.delegation?.deactivationEpoch ?? null });
    }
    return { accounts: [...rows.values()].sort((a, b) => b.lamports - a.lamports), warnings: [...found.warnings, ...(unreadable ? ['Some account details could not be decoded. Refresh before managing these accounts.'] : [])] };
  }
  async function validators(): Promise<NativeStakeValidator[]> {
    const votes = await rpc<{ current: Array<{ votePubkey: string; nodePubkey: string; commission: number; activatedStake: number; lastVote: number; rootSlot?: number }> }>(rpcUrl, 'getVoteAccounts', [{ commitment: 'confirmed' }]);
    const names = new Map<string, string>();
    try {
      const metadata = await rpc<Array<{ account: { data: [string, string] } }>>(rpcUrl, 'getProgramAccounts', ['Config1111111111111111111111111111111111111', { encoding: 'base64', commitment: 'confirmed', filters: [{ memcmp: { offset: 1, bytes: VALIDATOR_INFO_KEY.toBase58() } }] }]);
      for (const entry of metadata) {
        try { const info = ValidatorInfo.fromConfigData(Buffer.from(entry.account.data[0], 'base64')); if (info?.info.name?.trim()) names.set(info.key.toBase58(), info.info.name.trim()); } catch { /* Names are optional; vote addresses still identify validators. */ }
      }
    } catch { /* A provider may not support validator metadata discovery. */ }
    return votes.current.map(item => ({ voteAccount: item.votePubkey, nodePubkey: item.nodePubkey, name: names.get(item.nodePubkey) ?? null, commission: item.commission, activatedStakeLamports: safeLamports(Number(item.activatedStake)), lastVote: item.lastVote, rootSlot: item.rootSlot ?? item.lastVote })).sort((a, b) => b.activatedStakeLamports - a.activatedStakeLamports);
  }
  async function check(transaction: Transaction, owner: string) {
    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
    const message = transaction.serializeMessage().toString('base64');
    const [simulation, fee, balance] = await Promise.all([
      rpc<{ value: { err: unknown } }>(rpcUrl, 'simulateTransaction', [serialized, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed' }]),
      rpc<{ value: number | null }>(rpcUrl, 'getFeeForMessage', [message, { commitment: 'confirmed' }]),
      rpc<{ value: number }>(rpcUrl, 'getBalance', [owner, { commitment: 'confirmed' }])
    ]);
    if (simulation.value.err) throw new Error('The network could not simulate this staking action. Check the amount, validator, account permissions, and withdrawal availability, then review again.');
    if (fee.value == null) throw new Error('The staking network fee is unavailable. Refresh and review again.');
    return { fee: safeLamports(fee.value), balance: safeLamports(balance.value), message };
  }
  async function prepare(wallet: { id: string; address: string }, request: MobileStakeRequest): Promise<PreparedMobileStake> {
    const owner = new PublicKey(wallet.address);
    const transaction = new Transaction();
    let depositLamports = 0, debitLamports = 0, stakeAccount = request.action === 'stake' ? '' : request.stakeAccount;
    let stakeKey: Keypair | undefined;
    if (request.action === 'stake') {
      const amount = parseStakeAmount(request.amount); if (amount == null) throw new Error('Enter a positive SOL amount with up to 9 decimals.');
      depositLamports = safeLamports(await rpc<number>(rpcUrl, 'getMinimumBalanceForRentExemption', [StakeProgram.space, { commitment: 'confirmed' }]));
      if (amount + BigInt(depositLamports) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Stake amount is too large.');
      debitLamports = Number(amount) + depositLamports;
      stakeKey = Keypair.generate(); stakeAccount = stakeKey.publicKey.toBase58();
      transaction.add(StakeProgram.createAccount({ fromPubkey: owner, stakePubkey: stakeKey.publicKey, authorized: new Authorized(owner, owner), lockup: Lockup.default, lamports: debitLamports }));
      transaction.add(StakeProgram.delegate({ stakePubkey: stakeKey.publicKey, authorizedPubkey: owner, votePubkey: new PublicKey(request.voteAccount.trim()) }));
    } else if (request.action === 'deactivate') transaction.add(StakeProgram.deactivate({ stakePubkey: new PublicKey(request.stakeAccount), authorizedPubkey: owner }));
    else {
      const amount = parseStakeAmount(request.amount); if (amount == null) throw new Error('Enter a positive SOL amount with up to 9 decimals.');
      transaction.add(StakeProgram.withdraw({ stakePubkey: new PublicKey(request.stakeAccount), authorizedPubkey: owner, toPubkey: owner, lamports: Number(amount) }));
    }
    const block = await rpc<{ value: { blockhash: string } }>(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
    transaction.recentBlockhash = block.value.blockhash; transaction.feePayer = owner;
    if (stakeKey) transaction.partialSign(stakeKey);
    const checked = await check(transaction, owner.toBase58());
    if (BigInt(checked.balance) < BigInt(debitLamports) + BigInt(checked.fee)) throw new Error('Not enough SOL for this stake, the account deposit, and network fee.');
    return { request: { ...request }, walletId: wallet.id, owner: owner.toBase58(), rpcUrl, transaction, stakeAccount, depositLamports, debitLamports, feeLamports: checked.fee, message: checked.message, createdAt: now(), consumed: false };
  }
  async function validate(wallet: { id: string; address: string }, prepared: PreparedMobileStake) {
    if (prepared.consumed) throw new Error('This staking approval has already been used. Check Activity before trying again.');
    if (prepared.walletId !== wallet.id || prepared.owner !== wallet.address || prepared.rpcUrl !== rpcUrl) throw new Error('The wallet or RPC changed. Review the staking action again.');
    if (now() - prepared.createdAt >= 60_000) throw new Error('This staking review expired. Review again.');
    if (prepared.transaction.serializeMessage().toString('base64') !== prepared.message) throw new Error('The staking transaction changed. Review again.');
    const checked = await check(prepared.transaction, prepared.owner);
    if (now() - prepared.createdAt >= 60_000) throw new Error('This staking review expired. Review again.');
    if (checked.fee > prepared.feeLamports) throw new Error('The network fee increased. Review the updated staking fee again.');
    if (BigInt(checked.balance) < BigInt(prepared.debitLamports) + BigInt(checked.fee)) throw new Error('SOL balance changed. Review staking again.');
  }
  async function submit(wallet: { id: string; address: string }, prepared: PreparedMobileStake, authorize: () => void, sign: (transaction: Transaction) => Promise<string>) {
    await validate(wallet, prepared);
    authorize();
    if (prepared.consumed) throw new Error('This staking approval has already been used. Check Activity before retrying.');
    prepared.consumed = true;
    return sign(prepared.transaction);
  }
  return { accounts, validators, prepare, validate, submit };
}
