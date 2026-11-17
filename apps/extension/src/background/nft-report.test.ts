import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { inspectNftReport } from './nft-report';
import { compareNftReport, defaultNftReportAssumptions, nftReportCsvCell, type NftReportInspection } from '../shared/nft-report';
vi.mock('./nft-market-data', () => ({ fetchNftMarketData: vi.fn(async () => ({ source: 'Magic Eden', fetchedAt: 1, floorPriceSol: 0.001, lastSale: null, warnings: [] })) }));
vi.mock('@metaplex-foundation/mpl-token-metadata', () => ({ getMetadataAccountDataSerializer: () => ({ deserialize: () => [{ key: 4, mint: 'So11111111111111111111111111111111111111112', sellerFeeBasisPoints: 500 }] }) }));
const owner = '11111111111111111111111111111111', mint = 'So11111111111111111111111111111111111111112';
const token = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const metadata = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
let info: any, mintAccount: any, connection: any;
beforeEach(() => {
  info = { owner, mint, state: 'initialized', tokenAmount: { amount: '1' } };
  const data = Buffer.alloc(82); data.writeBigUInt64LE(1n, 36); data[45] = 1;
  mintAccount = { owner: token, data };
  connection = { getParsedTokenAccountsByOwner: vi.fn(async () => ({ value: [{ account: { owner: token, lamports: 2039280, data: { parsed: { info } } } }] })), getMultipleAccountsInfo: vi.fn(async () => [mintAccount, { owner: metadata, data: Buffer.alloc(1) }]) };
});
describe('NFT rent report reads', () => {
  it('reads actual token-account SOL and on-chain royalty without adding mint or metadata rent', async () => {
    const row = await inspectNftReport(connection, owner, mint);
    expect(row.tokenAccountRentLamports).toBe(2039280); expect(row.royaltyBps).toBe(500); expect(row.restriction).toBeNull();
  });
  it.each(['frozen', 'uninitialized'])('does not quote locked state %s', async state => {
    info.state = state; const row = await inspectNftReport(connection, owner, mint);
    expect(row.tokenAccountRentLamports).toBeNull(); expect(row.restriction).toBeTruthy();
  });
  it.each([{ delegate: mint }, { closeAuthority: mint }, { owner: mint }, { mint: owner }, { tokenAmount: { amount: '2' } }])('does not assume refund for invalid ownership/control %j', async overrides => {
    Object.assign(info, overrides); const row = await inspectNftReport(connection, owner, mint);
    expect(row.tokenAccountRentLamports).toBeNull(); expect(row.restriction).toBeTruthy();
  });
  it('keeps compressed or unsupported formats unknown instead of zero', async () => {
    mintAccount = null; const row = await inspectNftReport(connection, owner, mint); expect(row.tokenAccountRentLamports).toBeNull();
  });
  it('retains market data but no refund estimate when RPC fails', async () => {
    connection.getMultipleAccountsInfo.mockRejectedValue(new Error('offline'));
    const row = await inspectNftReport(connection, owner, mint); expect(row.tokenAccountRentLamports).toBeNull(); expect(row.market.floorPriceSol).toBe(0.001); expect(row.notes.join(' ')).toContain('unavailable');
  });
});
const row: NftReportInspection = { mint, fetchedAt: 1, market: { source: 'Magic Eden', fetchedAt: 1, floorPriceSol: 1, lastSale: null, warnings: [] }, tokenAccountRentLamports: 2039280, royaltyBps: 500, restriction: null, notes: [] };
describe('NFT report comparison', () => {
  it('deducts fees and actual creator royalty for the sale scenario', () => {
    expect(compareNftReport(row, defaultNftReportAssumptions).saleNetSol).toBeCloseTo(0.92999);
    expect(compareNftReport(row, defaultNftReportAssumptions).rentNetSol).toBeCloseTo(0.00202928);
  });
  it('does not treat a missing floor or old sale as zero current value', () => {
    const result = compareNftReport({ ...row, market: { ...row.market, floorPriceSol: null, lastSale: { priceSol: 5, timestamp: 1, signature: null } } }, defaultNftReportAssumptions);
    expect(result.saleNetSol).toBeNull(); expect(result.assessment).toBe('Unpriced · review manually');
  });
  it('uses the explicit fallback royalty only when unknown', () => {
    expect(compareNftReport({ ...row, royaltyBps: null }, defaultNftReportAssumptions).royaltyPercent).toBe(10);
  });
  it('flags restriction before suggesting a comparison', () => {
    expect(compareNftReport({ ...row, restriction: 'mission' }, defaultNftReportAssumptions).assessment).toBe('Restricted · review first');
  });
  it('compares low floors with rent but never recommends an automatic burn', () => {
    expect(compareNftReport({ ...row, market: { ...row.market, floorPriceSol: 0.001 } }, defaultNftReportAssumptions).assessment).toBe('Compare rent recovery');
  });
  it.each([NaN, -1, Infinity, 101])('rejects invalid marketplace percentage %s', value => {
    expect(() => compareNftReport(row, { ...defaultNftReportAssumptions, marketFeePercent: value })).toThrow();
  });
  it('shows a loss when the action cost exceeds the refund', () => {
    expect(compareNftReport(row, { ...defaultNftReportAssumptions, networkCostSol: 0.01 }).rentNetSol).toBeLessThan(0);
  });
  it('neutralizes spreadsheet formulas and quotes names', () => {
    expect(nftReportCsvCell(' =HYPERLINK("evil")')).toBe('"\' =HYPERLINK(""evil"")"');
    expect(nftReportCsvCell('Fox, "one"')).toBe('"Fox, ""one"""');
  });
});
