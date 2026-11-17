import type { NftMarketData } from './tensor-types';
export type NftReportInspection = {
  mint: string; fetchedAt: number; market: NftMarketData;
  tokenAccountRentLamports: number | null; royaltyBps: number | null;
  restriction: string | null; notes: string[];
};
export type NftReportAssumptions = { marketFeePercent: number; fallbackRoyaltyPercent: number; networkCostSol: number };
export const defaultNftReportAssumptions: NftReportAssumptions = { marketFeePercent: 2, fallbackRoyaltyPercent: 10, networkCostSol: 0.00001 };
export function compareNftReport(row: NftReportInspection, assumptions: NftReportAssumptions) {
  const { marketFeePercent, fallbackRoyaltyPercent, networkCostSol } = assumptions;
  if (![marketFeePercent, fallbackRoyaltyPercent, networkCostSol].every(Number.isFinite) || marketFeePercent < 0 || marketFeePercent > 100 || fallbackRoyaltyPercent < 0 || fallbackRoyaltyPercent > 100 || networkCostSol < 0) throw new Error('Enter valid fee assumptions.');
  const royaltyPercent = row.royaltyBps === null ? fallbackRoyaltyPercent : row.royaltyBps / 100;
  const floor = row.market.floorPriceSol;
  const saleNetSol = floor === null ? null : floor * Math.max(0, 1 - (marketFeePercent + royaltyPercent) / 100) - networkCostSol;
  const rentNetSol = row.tokenAccountRentLamports === null ? null : row.tokenAccountRentLamports / 1e9 - networkCostSol;
  const assessment = row.restriction ? 'Restricted · review first' : floor === null ? 'Unpriced · review manually' : rentNetSol === null ? 'Rent unavailable' : saleNetSol! > rentNetSol ? 'Explore selling' : 'Compare rent recovery';
  return { saleNetSol, rentNetSol, royaltyPercent, assessment };
}
// CSV cells must never become formulas when opened in a spreadsheet.
export function nftReportCsvCell(value: unknown) {
  const text = String(value ?? '');
  return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
}
