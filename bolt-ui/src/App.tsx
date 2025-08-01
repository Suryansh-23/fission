import React from 'react';
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';
import {
  getDefaultConfig,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import {
  mainnet,
  polygon,
  optimism,
  arbitrum,
  base,
  sepolia,
} from 'wagmi/chains';
import Header from './components/Header';
import SwapInterface from './components/SwapInterface';

// Config options for the networks you want to connect to
const { networkConfig } = createNetworkConfig({
  localnet: { url: getFullnodeUrl('localnet') },
  devnet: { url: getFullnodeUrl('devnet') },
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

// Rainbow Kit configuration for EVM wallets
const wagmiConfig = getDefaultConfig({
  appName: 'Fission DEX',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'default_project_id',
  chains: [mainnet, polygon, optimism, arbitrum, base, sepolia],
  ssr: false, // Since this is a Vite app, not server-side rendered
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function YourApp() {
  return (
    <div className="h-screen bg-gradient-to-br from-[#0B1426] via-[#1a2332] to-[#0B1426] flex flex-col overflow-hidden">
      <Header />
      <main className="flex-1 flex items-center justify-center px-6 py-4 overflow-y-auto">
        <SwapInterface />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitProvider>
          <SuiClientProvider networks={networkConfig} defaultNetwork="devnet">
            <WalletProvider 
              autoConnect={true}
              enableUnsafeBurner={true}
            >
              <YourApp />
            </WalletProvider>
          </SuiClientProvider>
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}

export default App;