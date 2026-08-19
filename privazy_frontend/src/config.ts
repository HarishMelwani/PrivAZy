// Aztec Testnet — the only supported network.
export const PRIVAZY_CONTRACT_ADDRESS =
  '0x258ca097730c46529b8c634ece466205117aaa44824e22fb5a5b82242bae8813';

export function getNodeUrl(): string {
  const env = (import.meta as unknown as { env?: { VITE_AZTEC_NODE_URL?: string } })
    .env;
  return (
    env?.VITE_AZTEC_NODE_URL || 'https://v5.testnet.rpc.aztec-labs.com'
  );
}