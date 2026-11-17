import { Connection, PublicKey } from '@solana/web3.js';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { fetchNftMarketData } from './nft-market-data';
import type { NftReportInspection } from '../shared/nft-report';
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const METADATA = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
/** Read-only report. Token-account rent is a conservative subset, not a burn quote. */
export async function inspectNftReport(connection: Connection, ownerString: string, mintString: string): Promise<NftReportInspection> {
  const owner = new PublicKey(ownerString), mint = new PublicKey(mintString);
  const metadataPda = PublicKey.findProgramAddressSync([Buffer.from('metadata'), METADATA.toBuffer(), mint.toBuffer()], METADATA)[0];
  const market = await fetchNftMarketData(mintString);
  const row: NftReportInspection = { mint: mintString, fetchedAt: Date.now(), market, tokenAccountRentLamports: null, royaltyBps: null, restriction: null, notes: [] };
  try {
    const [accounts, infos] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed'),
      connection.getMultipleAccountsInfo([mint, metadataPda], 'confirmed')
    ]);
    const [mintInfo, metadataInfo] = infos;
    if (metadataInfo?.owner.equals(METADATA)) {
      try {
        const metadata = getMetadataAccountDataSerializer().deserialize(metadataInfo.data)[0];
        if (metadata.key === 4 && metadata.mint === mintString && metadata.sellerFeeBasisPoints <= 10000) row.royaltyBps = metadata.sellerFeeBasisPoints;
      } catch { row.notes.push('Creator royalty could not be decoded.'); }
    }
    if (!mintInfo?.owner.equals(TOKEN) || mintInfo.data.length !== 82 || mintInfo.data[44] !== 0 || mintInfo.data[45] !== 1 || mintInfo.data.readBigUInt64LE(36) !== 1n) {
      row.notes.push('Rent estimate supports original Token Program, single-supply NFTs only. Compressed, Core and Token-2022 assets need separate inspection.');
      return row;
    }
    const held = accounts.value.filter(account => account.account.owner.equals(TOKEN) && account.account.data.parsed.info.owner === ownerString && account.account.data.parsed.info.mint === mintString && account.account.data.parsed.info.tokenAmount?.amount === '1');
    if (held.length !== 1) { row.restriction = 'Current ownership could not be verified; this NFT may be listed or no longer held.'; return row; }
    const account = held[0], info = account.account.data.parsed.info;
    if (info.delegate || info.state !== 'initialized' || (info.closeAuthority && info.closeAuthority !== ownerString)) {
      row.restriction = 'Frozen, delegated or externally controlled account. Claim missions, unstake or cancel listings before reviewing disposal.';
      return row;
    }
    if (Number.isSafeInteger(account.account.lamports) && account.account.lamports > 0) row.tokenAccountRentLamports = account.account.lamports;
    row.notes.push('Token-account rent only, after a compatible burn and close. Mint rent is excluded; additional metadata/edition refunds need a full burn simulation.');
  } catch { row.notes.push('On-chain ownership and rent inspection unavailable. Retry before making a decision.'); }
  return row;
}
