/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAPE_MAINNET_RPC_URL?: string;
  readonly VITE_GRAPE_JUP_API_KEY?: string;
  readonly VITE_GRAPE_SHYFT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'qrcode' {
  type QRCodeOptions = {
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  export function toDataURL(text: string, options?: QRCodeOptions): Promise<string>;

  const QRCode: {
    toDataURL: typeof toDataURL;
  };

  export default QRCode;
}
