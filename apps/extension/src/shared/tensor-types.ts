export type TensorStatus = {
  mint: string; owner: string; supported: boolean; reason?: string; name?: string;
  listing: null | { priceLamports: string; expiry: number; owner: string; currency: string | null };
};
export type TensorPreview = {
  id: string; mint: string; owner: string; action: 'list' | 'cancel';
  priceLamports: string | null; networkFeeLamports: number; estimatedDebitLamports: number;
  expiresAt: number;
};
export type TensorResult = { signature: string; confirmed: boolean; error?: string };
