import React from 'react';
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Header from './components/Header';
import SwapInterface from './components/SwapInterface';
import Footer from './components/Footer';

// Config options for the networks you want to connect to
const { networkConfig } = createNetworkConfig({
  localnet: { url: getFullnodeUrl('localnet') },
  devnet: { url: getFullnodeUrl('devnet') },
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Debug the network config
console.log('🌐 Network config:', networkConfig);

function YourApp() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1426] via-[#1a2332] to-[#0B1426] flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <SwapInterface />
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="devnet">
        <WalletProvider 
          autoConnect={true}
          enableUnsafeBurner={true}
        >
          <YourApp />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

export default App;