// Shared chain configuration used across all JellyOS modules
// Single source of truth for chain names, Alchemy networks, and symbols

export interface ChainInfo {
  name: string;
  alchemyNetwork: string;
  symbol: string;
  chainId: number;
  enabled: boolean;
}

export const CHAINS: Record<string, ChainInfo> = {
  bsc: { name: 'bsc', alchemyNetwork: 'bnb-mainnet', symbol: 'BNB', chainId: 56, enabled: true },
  ethereum: { name: 'ethereum', alchemyNetwork: 'eth-mainnet', symbol: 'ETH', chainId: 1, enabled: true },
  base: { name: 'base', alchemyNetwork: 'base-mainnet', symbol: 'ETH', chainId: 8453, enabled: true },
  arbitrum: { name: 'arbitrum', alchemyNetwork: 'arb-mainnet', symbol: 'ETH', chainId: 42161, enabled: true },
  polygon: { name: 'polygon', alchemyNetwork: 'polygon-mainnet', symbol: 'MATIC', chainId: 137, enabled: true },
  avalanche: { name: 'avalanche', alchemyNetwork: 'avax-mainnet', symbol: 'AVAX', chainId: 43114, enabled: true },
  optimism: { name: 'optimism', alchemyNetwork: 'opt-mainnet', symbol: 'ETH', chainId: 10, enabled: true },
  fantom: { name: 'fantom', alchemyNetwork: 'fantom-mainnet', symbol: 'FTM', chainId: 250, enabled: true },
  gnosis: { name: 'gnosis', alchemyNetwork: 'gnosis-mainnet', symbol: 'xDAI', chainId: 100, enabled: true },
  celo: { name: 'celo', alchemyNetwork: 'celo-mainnet', symbol: 'CELO', chainId: 42220, enabled: true },
  scroll: { name: 'scroll', alchemyNetwork: 'scroll-mainnet', symbol: 'ETH', chainId: 534352, enabled: true },
  linea: { name: 'linea', alchemyNetwork: 'linea-mainnet', symbol: 'ETH', chainId: 59144, enabled: true },
  zksync: { name: 'zksync', alchemyNetwork: 'zksync-mainnet', symbol: 'ETH', chainId: 324, enabled: true },
  mantle: { name: 'mantle', alchemyNetwork: 'mantle-mainnet', symbol: 'MNT', chainId: 5000, enabled: true },
  blast: { name: 'blast', alchemyNetwork: 'blast-mainnet', symbol: 'ETH', chainId: 81457, enabled: true },
};

export const CHAIN_NETWORKS: Record<string, string> = Object.fromEntries(
  Object.entries(CHAINS).map(([key, info]) => [key, info.alchemyNetwork])
);

export const CHAIN_SYMBOLS: Record<string, string> = Object.fromEntries(
  Object.entries(CHAINS).map(([key, info]) => [key, info.symbol])
);

export function getAlchemyNetwork(chain: string): string {
  return CHAIN_NETWORKS[chain] || 'eth-mainnet';
}

export function getChainSymbol(chain: string): string {
  return CHAIN_SYMBOLS[chain] || 'ETH';
}

export function getSupportedChains(): string[] {
  return Object.keys(CHAINS);
}