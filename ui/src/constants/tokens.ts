// TODO: Complete token address mapping for all supported chains
// This file contains token addresses for EVM and Sui chains

import { NetworkEnum } from '@1inch/cross-chain-sdk';

export interface TokenInfo {
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
  address: string;
  chainId: number;
}

// EVM Token Addresses
export const EVM_TOKENS: Record<string, Record<string, TokenInfo>> = {
  // Ethereum Mainnet (1)
  "1": {
    ETH: {
      symbol: "WETH",
      name: "Wrapped Ether",
      icon: "🔵",
      decimals: 18,
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 
      chainId: 1,
    },
    USDC: {
      symbol: "USDC",
      name: "USD Coin",
      icon: "🔷",
      decimals: 6,
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 
      chainId: 1,
    },
    WBTC: {
      symbol: "WBTC",
      name: "Wrapped Bitcoin",
      icon: "🟠",
      decimals: 8,
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 
      chainId: 1,
    },
  }
};

// Sui Token Addresses (limited to USDC and SUI as per requirements)
export const SUI_TOKENS: Record<string, TokenInfo> = {
  SUI: {
    symbol: "SUI",
    name: "Sui",
    icon: "🔷",
    decimals: 9,
    address: "0x2::sui::SUI", 
    chainId: 101,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    icon: "🔷",
    decimals: 6,
    address: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    chainId: 101,
  },
};

// Chain Information
export interface ChainInfo {
  name: string;
  symbol: string;
  chainId: number;
  networkEnum: number; // For SDK integration
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: TokenInfo;
}

export const SUPPORTED_CHAINS: Record<string, ChainInfo> = {
  ethereum: {
    name: "Ethereum",
    symbol: "ETH",
    chainId: 1,
    networkEnum: NetworkEnum.ETHEREUM, // Using SDK NetworkEnum
    rpcUrl: "https://virtual.mainnet.eu.rpc.tenderly.co/7376d706-10d6-4d07-a8fd-c16c404805cc",
    blockExplorer: "https://etherscan.io",
    nativeCurrency: EVM_TOKENS["1"].ETH,
  },
  sui: {
    name: "Sui",
    symbol: "SUI",
    chainId: 101, // Custom Chain ID for Sui
    networkEnum: 999, // TODO: Map to SDK NetworkEnum for Sui
    rpcUrl: "https://fullnode.mainnet.sui.io:443", // Production mainnet
    blockExplorer: "https://suiexplorer.com",
    nativeCurrency: SUI_TOKENS.SUI,
  },
  // TODO: Add more chains as needed
};

// Helper functions
export function getTokenByAddress(chainId: number, address: string): TokenInfo | undefined {
  const tokens = EVM_TOKENS[chainId.toString()];
  if (!tokens) return undefined;
  
  return Object.values(tokens).find(token => 
    token.address.toLowerCase() === address.toLowerCase()
  );
}

export function getTokensByChain(chainId: number): TokenInfo[] {
  if (chainId === 0) {
    // Sui chain
    return Object.values(SUI_TOKENS);
  }
  
  const tokens = EVM_TOKENS[chainId.toString()];
  return tokens ? Object.values(tokens) : [];
}

export function getChainById(chainId: number): ChainInfo | undefined {
  return Object.values(SUPPORTED_CHAINS).find(chain => chain.chainId === chainId);
}

// Export default token lists for the UI
export const DEFAULT_EVM_TOKENS = [
  EVM_TOKENS["1"].ETH,
  EVM_TOKENS["1"].USDC,
  EVM_TOKENS["1"].WBTC,
];

export const DEFAULT_SUI_TOKENS = [
  SUI_TOKENS.SUI,
  SUI_TOKENS.USDC,
];
