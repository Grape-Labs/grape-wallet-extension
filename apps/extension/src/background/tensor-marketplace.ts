import { address, createNoopSigner } from '@solana/web3-v2';
import { Connection, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, VersionedTransaction } from '@solana/web3.js';
import { type ListLegacyInput, getListLegacyInstruction, getDelistLegacyInstruction, getListStateDecoder, LIST_STATE_DISCRIMINATOR, TENSOR_MARKETPLACE_PROGRAM_ADDRESS } from '@tensor-foundation/marketplace';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import type { TensorStatus } from '../shared/tensor-types';

export const TENSOR_PROGRAM = new PublicKey(TENSOR_MARKETPLACE_PROGRAM_ADDRESS);
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const METADATA = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const AUTH = 'auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg';
export const listingAddress = (mint: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('list_state'), mint.toBuffer()], TENSOR_PROGRAM)[0];
const ata = (owner: PublicKey, mint: PublicKey) => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ATA)[0];
const metadataPda = (mint: PublicKey, ...seeds: Buffer[]) => PublicKey.findProgramAddressSync([Buffer.from('metadata'), METADATA.toBuffer(), mint.toBuffer(), ...seeds], METADATA)[0];
const option = <T>(value: { __option: 'None' } | { __option: 'Some'; value: T }): T | null => value.__option === 'Some' ? value.value : null;

export function solPriceToLamports(value: string): bigint {
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,9})?$/.test(value)) throw new Error('Enter a SOL price with up to 9 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (amount <= 0n || amount > 18446744073709551615n) throw new Error('Listing price must be positive and within the supported range.');
  return amount;
}

export async function inspectTensorNft(connection: Connection, owner: string, mintString: string) {
  const mint = new PublicKey(mintString);
  const listState = listingAddress(mint);
  const [mintInfo, metadataInfo, listingInfo] = await connection.getMultipleAccountsInfo([mint, metadataPda(mint), listState], 'confirmed');
  const status: TensorStatus = { mint: mintString, owner, supported: false, listing: null };
  let listing = null;
  if (listingInfo) {
    if (!listingInfo.owner.equals(TENSOR_PROGRAM) || !Buffer.from(listingInfo.data.subarray(0, 8)).equals(Buffer.from(LIST_STATE_DISCRIMINATOR))) throw new Error('Unexpected Tensor listing account.');
    listing = getListStateDecoder().decode(listingInfo.data);
    if (listing.assetId !== mintString) throw new Error('Listing mint mismatch.');
    status.listing = { owner: listing.owner, priceLamports: listing.amount.toString(), expiry: Number(listing.expiry), currency: option(listing.currency) };
  }
  if (!mintInfo?.owner.equals(TOKEN) || mintInfo.data.length !== 82 || mintInfo.data[44] !== 0 || mintInfo.data[45] !== 1 || mintInfo.data.readBigUInt64LE(36) !== 1n) {
    status.reason = 'Native listing currently supports single-supply Metaplex NFTs using the original Solana Token Program. Open other NFT formats on Tensor.';
    return { status, listing, metadata: null, tokenAccount: null };
  }
  if (!metadataInfo?.owner.equals(METADATA)) {
    status.reason = 'Metaplex metadata is unavailable. Open this NFT on Tensor instead.';
    return { status, listing, metadata: null, tokenAccount: null };
  }
  const metadata = getMetadataAccountDataSerializer().deserialize(metadataInfo.data)[0];
  if (metadata.key !== 4 || metadata.mint !== mintString) throw new Error('NFT metadata mint mismatch.');
  status.name = metadata.name.replace(/\0/g, '').trim();
  const standard = option(metadata.tokenStandard);
  const config = option(metadata.programmableConfig);
  if (![0, 3, 4, 5, null].includes(standard) || (config && option(config.ruleSet))) {
    status.reason = 'This NFT uses rules that need an additional Tensor signing flow. Use Tensor to manage it.';
    return { status, listing, metadata, tokenAccount: null };
  }
  if (listing && listing.owner !== owner) {
    status.reason = 'This listing belongs to another wallet.';
    return { status, listing, metadata, tokenAccount: null };
  }
  if (listing?.cosigner) {
    status.reason = 'This listing requires an additional co-signer. Manage it on Tensor.';
    return { status, listing, metadata, tokenAccount: null };
  }
  let tokenAccount: PublicKey | null = null;
  if (!listing) {
    const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint }, 'confirmed');
    const match = accounts.value.find(account => {
      const info = account.account.data.parsed.info;
      return info.owner === owner && info.mint === mintString && info.tokenAmount.amount === '1' && !info.delegate &&
        (info.state === 'initialized' || ((standard === 4 || standard === 5) && info.state === 'frozen'));
    });
    if (!match) {
      status.reason = 'This wallet does not hold an eligible, undelegated NFT token account.';
      return { status, listing, metadata, tokenAccount: null };
    }
    tokenAccount = match.pubkey;
  }
  status.supported = true;
  return { status, listing, metadata, tokenAccount };
}

export async function buildTensorTransaction(connection: Connection, owner: string, mintString: string, action: 'list' | 'cancel', price?: string) {
  const inspected = await inspectTensorNft(connection, owner, mintString);
  if (!inspected.status.supported || !inspected.metadata) throw new Error(inspected.status.reason || 'NFT not supported.');
  if (action === 'list' && inspected.listing) throw new Error('An existing listing already exists. Cancel it before listing again.');
  if (action === 'cancel' && !inspected.listing) throw new Error('This NFT is no longer listed.');
  const mint = new PublicKey(mintString), ownerKey = new PublicKey(owner), state = listingAddress(mint);
  const ownerTa = action === 'list' ? inspected.tokenAccount! : ata(ownerKey, mint);
  const listTa = ata(state, mint);
  const standard = option(inspected.metadata.tokenStandard);
  const programmable = standard === 4 || standard === 5;
  const optional = address(TENSOR_MARKETPLACE_PROGRAM_ADDRESS);
  // Supply all optional accounts explicitly: SDK 1.0 defaults a zero-valued tokenStandard to pNFT.
  const input: Omit<ListLegacyInput, 'amount'> = {
    owner: createNoopSigner(address(owner)), mint: address(mintString),
    ownerTa: address(ownerTa.toBase58()), listTa: address(listTa.toBase58()), listState: address(state.toBase58()),
    metadata: address(metadataPda(mint).toBase58()), edition: address(metadataPda(mint, Buffer.from('edition')).toBase58()),
    ownerTokenRecord: programmable ? address(metadataPda(mint, Buffer.from('token_record'), ownerTa.toBuffer()).toBase58()) : optional,
    listTokenRecord: programmable ? address(metadataPda(mint, Buffer.from('token_record'), listTa.toBuffer()).toBase58()) : optional,
    authorizationRules: optional, authorizationRulesProgram: programmable ? address(AUTH) : optional,
    tokenMetadataProgram: address(METADATA.toBase58()),
    sysvarInstructions: address('Sysvar1nstructions1111111111111111111111111')
  };
  const priceLamports = action === 'list' ? solPriceToLamports(price ?? '') : null;
  const ix = action === 'list'
    ? getListLegacyInstruction({ ...input, amount: priceLamports!, expireInSec: 7n * 24n * 60n * 60n })
    : getDelistLegacyInstruction({ ...input, rentDestination: address(inspected.listing?.rentPayer ?? owner) });
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    new TransactionInstruction({
      programId: new PublicKey(ix.programAddress),
      keys: ix.accounts.map(account => ({ pubkey: new PublicKey(account.address), isSigner: account.role >= 2, isWritable: account.role % 2 === 1 })),
      data: Buffer.from(ix.data)
    })
  );
  const lifetime = await connection.getLatestBlockhash('confirmed');
  transaction.feePayer = ownerKey;
  transaction.recentBlockhash = lifetime.blockhash;
  const [fee, balance, simulation] = await Promise.all([
    connection.getFeeForMessage(transaction.compileMessage(), 'confirmed'),
    connection.getBalance(ownerKey, 'confirmed'),
    connection.simulateTransaction(new VersionedTransaction(transaction.compileMessage()), { sigVerify: false, commitment: 'confirmed', accounts: { encoding: 'base64', addresses: [owner] } })
  ]);
  if (simulation.value.err) throw new Error('Tensor could not simulate this transaction. Refresh the NFT or manage it on Tensor. ' + JSON.stringify(simulation.value.err));
  if (fee.value == null || !simulation.value.accounts?.[0]) throw new Error('Unable to estimate network costs. Please retry.');
  return { transaction, lifetime, priceLamports: priceLamports?.toString() ?? null, networkFeeLamports: fee.value,
    estimatedDebitLamports: Math.max(0, balance - simulation.value.accounts[0].lamports) };
}
