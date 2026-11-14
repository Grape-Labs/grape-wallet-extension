/** Shared default for the mobile wallet and browser extension. */
export const DEFAULT_SOLANA_MAINNET_RPC_URL = 'https://rpc.shyft.to/?api_key=iMp59oPaEKIYBdmB';

const defaultRpcApiKey = DEFAULT_SOLANA_MAINNET_RPC_URL.split('api_key=')[1];

/** Provider errors can echo their request URL. Keep connection credentials out of UI messages. */
export function redactRpcDetails(message: string | null | undefined): string {
  return (message ?? '')
    .replace(/https?:\/\/rpc\.shyft\.to\b[^\s"'<>)]*/gi, '[default Solana RPC]')
    .split(defaultRpcApiKey).join('[hidden]')
    .replace(/([?&](?:api[_-]?key|access[_-]?token|token)=)[^\s&"'<>)]*/gi, '$1[hidden]');
}
