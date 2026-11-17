import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, ComputeBudgetProgram, VersionedTransaction, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_INSTRUCTIONS_PUBKEY, SYSVAR_CLOCK_PUBKEY, type AccountInfo } from '@solana/web3.js';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { FOX_COLLECTIONS, type FoxMissionStatus } from '../shared/fox-missions';
import idl from './fox-missions-interface.json';

export const FOX_PROGRAM = new PublicKey('6NcdQ5WTnrPoMLbP4kvpLYa4YSwKqkNHRRE8XVf5hmv9');
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), ATA = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const META = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'), RULES = new PublicKey('auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg');
const CHEST = new PublicKey('ChEsTBFtT4PNEDTEfpvREFUoALMjaUhM5HyCh1jJnQn2');
const pda = (...seeds: (PublicKey | string)[]) => PublicKey.findProgramAddressSync(seeds.map(s => typeof s === 'string' ? Buffer.from(s) : s.toBuffer()), FOX_PROGRAM);
const metadataPda = (mint: PublicKey, ...tail: Buffer[]) => PublicKey.findProgramAddressSync([Buffer.from('metadata'), META.toBuffer(), mint.toBuffer(), ...tail], META)[0];
const ata = (owner: PublicKey, mint: PublicKey) => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ATA)[0];
const option = (value: any): any => value?.__option === 'Some' ? value.value : null;
export async function foxDiscriminator(namespace: 'account' | 'global', name: string) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${namespace}:${name}`))).subarray(0, 8);
}
export async function decodeFoxAccount(name: string, info: AccountInfo<Buffer> | null): Promise<Record<string, any> | null> {
  if (!info) return null;
  const schema = idl.accounts.find(a => a.name === name);
  const anchorName = name[0].toUpperCase() + name.slice(1);
  if (!schema || !info.owner.equals(FOX_PROGRAM) || !info.data.subarray(0, 8).equals(await foxDiscriminator('account', anchorName))) throw new Error(`Invalid Famous Fox ${name} account.`);
  let offset = 8;
  function read(type: any): any {
    function bytes(n: number) { if (offset + n > info!.data.length) throw new Error('Unsupported Fox account layout.'); const b = info!.data.subarray(offset, offset + n); offset += n; return b; }
    if (type === 'publicKey') return new PublicKey(bytes(32));
    if (type === 'u64') return bytes(8).readBigUInt64LE();
    if (type === 'u16') return bytes(2).readUInt16LE();
    if (type === 'u8') return bytes(1)[0];
    if (type === 'bool') { const b = bytes(1)[0]; if (b > 1) throw new Error('Invalid Fox boolean.'); return !!b; }
    if (type.option) { const present = bytes(1)[0]; if (present > 1) throw new Error('Invalid Fox option.'); return present ? read(type.option) : null; }
    if (type.array?.[0] === 'u8') return bytes(type.array[1]);
    throw new Error('Unsupported Fox field.');
  }
  return Object.fromEntries(schema.type.fields.map(field => [field.name, read(field.type)]));
}
async function instruction(name: string, accounts: Record<string, PublicKey | undefined>, args = Buffer.alloc(0)) {
  const schema = idl.instructions.find(i => i.name === name);
  if (!schema) throw new Error('Unknown Fox instruction.');
  const snake = name.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
  return new TransactionInstruction({ programId: FOX_PROGRAM, data: Buffer.concat([await foxDiscriminator('global', snake), args]), keys: schema.accounts.map(a => {
    const key = accounts[a.name];
    if (!key && !('isOptional' in a && a.isOptional)) throw new Error(`Missing Fox instruction account: ${a.name}`);
    return { pubkey: key ?? FOX_PROGRAM, isSigner: key ? a.isSigner : false, isWritable: key ? a.isMut : false };
  }) });
}
let metadataCache: { expires: number; entries: any[] } | undefined;
async function missionDirectory() {
  if (metadataCache && metadataCache.expires > Date.now()) return metadataCache.entries;
  const response = await fetch('https://dens.famousfoxes.com/missions.json', { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error('Famous Fox mission directory is unavailable.');
  const data = await response.json();
  if (!Array.isArray(data) || data.length > 2000) throw new Error('Invalid Fox mission directory.');
  const entries = data.filter(x => !x.hidden && x.version === 3 && typeof x.address === 'string' && typeof x.name === 'string' && Number.isSafeInteger(x.id));
  metadataCache = { expires: Date.now() + 60_000, entries };
  return entries;
}
export function missionWindow(mission: Record<string, any>, now: number) {
  const opensAt = Number(mission.lockstart), closesAt = Number(mission.lockend), endsAt = closesAt + Number(mission.timelock);
  if (![opensAt, closesAt, endsAt, now].every(Number.isSafeInteger) || opensAt >= closesAt || closesAt > endsAt) throw new Error('Invalid mission timing.');
  return { opensAt, closesAt, endsAt, accepting: !mission.end && now >= opensAt && now < closesAt, complete: now >= endsAt };
}
export async function inspectFoxMission(connection: Connection, ownerString: string, mintString: string) {
  const owner = new PublicKey(ownerString), mint = new PublicKey(mintString), foxAddress = pda(mint, 'fox')[0];
  const [programInfo, mintInfo, metadataInfo, foxInfo, clock] = await connection.getMultipleAccountsInfo([FOX_PROGRAM, mint, metadataPda(mint), foxAddress, SYSVAR_CLOCK_PUBKEY], 'confirmed');
  if (!programInfo?.executable || !clock || clock.data.length < 40) throw new Error('Famous Fox program or chain clock unavailable.');
  const now = Number(clock.data.readBigInt64LE(32));
  const status: FoxMissionStatus = { eligible: false, mint: mintString, owner: ownerString, state: 'unavailable', canStart: false, canClaim: false };
  if (!mintInfo?.owner.equals(TOKEN) || mintInfo.data.length !== 82 || mintInfo.data.readBigUInt64LE(36) !== 1n || mintInfo.data[44] !== 0 || !metadataInfo?.owner.equals(META)) return { status: { ...status, reason: 'A single-supply Metaplex Fox NFT is required.' } };
  const metadata = getMetadataAccountDataSerializer().deserialize(metadataInfo.data)[0];
  const collection = option(metadata.collection);
  if (metadata.mint !== mintString || metadata.key !== 4 || !collection?.verified || !(FOX_COLLECTIONS as readonly string[]).includes(collection.key)) return { status: { ...status, reason: 'This NFT is not in a verified eligible Famous Fox collection.' } };
  status.eligible = true;
  const standard = option(metadata.tokenStandard);
  if (![null, 0, 4].includes(standard)) return { status: { ...status, reason: 'This Fox token format is not supported by native missions yet.' } };
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed');
  const held = accounts.value.filter(a => a.account.owner.equals(TOKEN) && a.account.data.parsed.info.owner === ownerString && a.account.data.parsed.info.mint === mintString && a.account.data.parsed.info.tokenAmount.amount === '1');
  if (held.length !== 1) return { status: { ...status, held: false, reason: 'The selected wallet no longer holds this Fox.' } };
  status.held = true;
  const token = held[0], tokenState = token.account.data.parsed.info;
  const fox = await decodeFoxAccount('fox', foxInfo);
  if (fox && !fox.fox.equals(mint)) throw new Error('Fox profile mint mismatch.');
  status.fame = String(fox?.xp ?? 0); status.completedMissions = String(fox?.missions ?? 0);
  const active = fox && !fox.mission.equals(PublicKey.default) && tokenState.delegate === pda(fox.mission, 'auth', owner)[0].toBase58();
  const directory = await missionDirectory();
  const candidates = active ? directory.filter(x => x.address === fox.mission.toBase58()) : directory.slice(-8);
  if (active && candidates.length !== 1) return { status: { ...status, state: 'locked' as const, reason: 'This Fox is on a classic or unsupported mission. Claim it on Famous Foxes.' } };
  const addresses = candidates.map(x => new PublicKey(x.address));
  const infos = addresses.length ? await connection.getMultipleAccountsInfo(addresses, 'confirmed') : [];
  const missions = await Promise.all(infos.map(async (info, index) => {
    const data = await decodeFoxAccount('mission', info); if (!data || data.id !== BigInt(candidates[index].id) || data.version !== 3) throw new Error('Mission directory does not match the on-chain mission.');
    return { data, address: addresses[index], label: candidates[index].name.slice(0, 160), window: missionWindow(data, now) };
  }));
  const selected = active ? missions[0] : [...missions].sort((a, b) => b.window.opensAt - a.window.opensAt).find(m => m.window.opensAt <= now) ?? missions[0];
  if (!selected) return { status: { ...status, reason: 'No supported weekly mission is available.' } };
  const { data: mission, window, address: missionAddress } = selected;
  status.mission = { address: missionAddress.toBase58(), name: selected.label, opensAt: window.opensAt, closesAt: window.closesAt, endsAt: window.endsAt, fame: mission.xpreward.toString() };
  const programmable = standard === 4, config = option(metadata.programmableConfig), rules = config ? option(config.ruleSet) : null;
  const base = { connection, owner, mint, status, fox, foxAddress, tokenAddress: token.pubkey, metadata, programmable, rules, mission, missionAddress, now };
  if (active) {
    if (!fox.owner.equals(owner)) throw new Error('Mission Fox owner mismatch.');
    const account = fox.missionAccount;
    const missionAccount = await decodeFoxAccount('missionAccount', await connection.getAccountInfo(account, 'confirmed'));
    if (!missionAccount || !missionAccount.owner.equals(owner) || !missionAccount.mission.equals(missionAddress) || !missionAccount.started || missionAccount.ended) throw new Error('Invalid active Fox mission account.');
    status.state = window.complete ? 'claimable' : 'locked';
    const solo = missionAccount.count === 1n && missionAccount.denMint.equals(PublicKey.default) && missionAccount.consumable.equals(PublicKey.default) && missionAccount.partnerMint.equals(PublicKey.default) && !missionAccount.denRoom;
    status.canClaim = window.complete && solo && missionAccount.rareChestCount === 0 && mission.reward.equals(CHEST);
    if (missionAccount.rareChestCount > 0 || !mission.reward.equals(CHEST)) status.reason = 'This mission includes special rewards. Claim the Fox and rewards on Famous Foxes.';
    if (!solo) status.reason = 'This Fox belongs to a squad with other assets. Claim the complete squad on Famous Foxes.';
    return { ...base, activeAccount: account, missionAccount };
  }
  status.state = 'ready';
  if (tokenState.delegate || (tokenState.state === 'frozen' && !programmable)) { status.state = 'unavailable'; status.reason = 'This Fox is staked or delegated. Unstake or release it on Famous Foxes before starting here.'; }
  else if (!window.accepting) status.reason = window.complete ? 'This mission has ended. Check back for the next entry window.' : now < window.opensAt ? 'Mission entries have not opened yet.' : 'The entry window is closed. Check back for the next weekly mission.';
  else if (mission.needother || mission.xp > (fox?.xp ?? 0n) || (mission.maxxp > 0n && (fox?.xp ?? 0n) >= mission.maxxp)) status.reason = 'This mission has requirements not supported by the single-Fox flow.';
  else status.canStart = true;
  return base;
}
export async function buildFoxMission(connection: Connection, owner: string, mint: string, action: 'start' | 'claim') {
  const inspected = await inspectFoxMission(connection, owner, mint);
  if (!('tokenAddress' in inspected) || !inspected.status.mission || !(action === 'start' ? inspected.status.canStart : inspected.status.canClaim)) throw new Error(inspected.status.reason || 'This mission action is not available.');
  const x = inspected, ixs: TransactionInstruction[] = [];
  const common: Record<string, PublicKey | undefined> = { mission: x.missionAddress, authority: pda(x.missionAddress, 'auth', x.owner)[0], fox: x.foxAddress, owner: x.owner, fromAccount: x.tokenAddress, toAccount: x.tokenAddress, mint: x.mint, metaplexAcc: META, masterEdition: metadataPda(x.mint, Buffer.from('edition')), metadata: metadataPda(x.mint), tokenProgram: TOKEN, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY, sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY, foxUpgrade: pda(x.mint, 'upgrade')[0], ownerTokenRecord: x.programmable ? metadataPda(x.mint, Buffer.from('token_record'), x.tokenAddress.toBuffer()) : undefined, rulesAcc: x.rules ? new PublicKey(x.rules) : undefined, authRules: x.programmable ? RULES : undefined };
  if (action === 'start') {
    if (!x.fox) ixs.push(await instruction('initFox', common));
    const existing = await connection.getProgramAccounts(FOX_PROGRAM, { commitment: 'confirmed', filters: [{ memcmp: { offset: 9, bytes: owner } }, { memcmp: { offset: 69, bytes: x.missionAddress.toBase58() } }] });
    let index = 0;
    for (const entry of existing) { const a = await decodeFoxAccount('missionAccount', entry.account); index = Math.max(index, (a!.missionIndexV2 ?? a!.missionIndex) + 1); }
    if (index > 65535) throw new Error('Mission index limit reached.');
    const key = Keypair.generate().publicKey, [account, bump] = pda(key, 'mission');
    const args = Buffer.alloc(3); args[0] = bump; args.writeUInt16LE(index, 1);
    ixs.push(await instruction('initMissionAccount', { ...common, key, missionAccount: account }, args));
    ixs.push(await instruction('startMission', { ...common, missionAccount: account }, Buffer.from([pda(x.missionAddress, 'auth', x.owner)[1]])));
  } else {
    if (!('activeAccount' in x) || !x.activeAccount || !x.missionAccount) throw new Error('No claimable mission account.');
    ixs.push(await instruction('endMissionV3', { ...common, missionAccount: x.activeAccount }));
    if (x.missionAccount.rareChestCount > 0) throw new Error('This mission includes a Rare Chest. Claim all rewards on Famous Foxes.');
    if (!x.mission.reward.equals(CHEST)) throw new Error('This mission uses an unsupported reward. Claim on Famous Foxes.');
    const userReward = ata(x.owner, CHEST);
    if (!await connection.getAccountInfo(userReward, 'confirmed')) ixs.push(new TransactionInstruction({ programId: ATA, keys: [{ pubkey: x.owner, isSigner: true, isWritable: true }, { pubkey: userReward, isSigner: false, isWritable: true }, { pubkey: x.owner, isSigner: false, isWritable: false }, { pubkey: CHEST, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: TOKEN, isSigner: false, isWritable: false }], data: Buffer.from([1]) }));
    const rewardAuthority = pda(x.missionAddress, 'auth')[0];
    ixs.push(await instruction('claimReward', { ...common, authority: rewardAuthority, missionAccount: x.activeAccount, reward: CHEST, rewardAccount: ata(rewardAuthority, CHEST), userRewardAccount: userReward }));
  }
  const lifetime = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({ feePayer: x.owner, recentBlockhash: lifetime.blockhash }).add(ComputeBudgetProgram.setComputeUnitLimit({ units: 650_000 }), ...ixs);
  if (transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length > 1232) throw new Error('This Fox requires a larger transaction. Use Famous Foxes.');
  const [fee, balance, simulation] = await Promise.all([connection.getFeeForMessage(transaction.compileMessage(), 'confirmed'), connection.getBalance(x.owner, 'confirmed'), connection.simulateTransaction(new VersionedTransaction(transaction.compileMessage()), { sigVerify: false, commitment: 'confirmed', accounts: { encoding: 'base64', addresses: [owner] } })]);
  if (simulation.value.err) throw new Error(`Mission simulation failed (${JSON.stringify(simulation.value.err)}). No transaction was sent. Refresh or use Famous Foxes.`);
  if (fee.value == null || !simulation.value.accounts?.[0]) throw new Error('Unable to estimate mission fees.');
  return { transaction, lifetime, status: x.status, networkFeeLamports: fee.value, estimatedDebitLamports: Math.max(0, balance - simulation.value.accounts[0].lamports) };
}

/** Keep signing bound to the exact wallet session and RPC reviewed by the user. */
export function assertFoxReviewContext(review: { owner: string; walletId: string; rpc: string; epoch: number; expiresAt: number }, context: { owner: string; walletId: string; rpc: string; epoch: number }, now = Date.now()) {
  if (review.owner !== context.owner || review.walletId !== context.walletId || review.rpc !== context.rpc || review.epoch !== context.epoch || now >= review.expiresAt) throw new Error('Wallet session changed or mission review expired. Review again.');
}
