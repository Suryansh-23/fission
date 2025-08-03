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
import { defineChain } from 'viem';
import { useState, useEffect } from 'react';
import Header from './components/Header';
import SwapInterface from './components/SwapInterface';
import StarBurst from './components/StarBurst';

// Config options for the networks you want to connect to
const { networkConfig } = createNetworkConfig({
  localnet: { url: getFullnodeUrl('localnet') },
  devnet: { url: getFullnodeUrl('devnet') },
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

// Define Tenderly Fork as a custom chain
const tenderlyFork = defineChain({
  id: 1, // Use mainnet chain ID since it's a fork
  name: 'Tenderly Fork',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://virtual.mainnet.eu.rpc.tenderly.co/1489665e-c55e-4476-b6d7-afa0b1c48342'], 
    },
  },
  blockExplorers: {
    default: { name: 'Tenderly', url: 'https://dashboard.tenderly.co' },
  },
  testnet: true, 
});

// Rainbow Kit configuration for EVM wallets
const wagmiConfig = getDefaultConfig({
  appName: 'Fission DEX',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'default_project_id',
  chains: [tenderlyFork, polygon, optimism, arbitrum, base, sepolia], // Add tenderlyFork first for priority
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
  const [showAnimation, setShowAnimation] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Trigger animation on component mount (page load/reload)
    setShowAnimation(true);
  }, []);

  const handleAnimationComplete = () => {
    setShowAnimation(false);
    setIsLoaded(true);
  };

  return (
    <div className="h-screen bg-gradient-to-br from-[#0B1426] via-[#1a2332] to-[#0B1426] flex flex-col overflow-hidden">
      {/* Star Burst Animation - shows on every reload */}
      {showAnimation && <StarBurst onAnimationComplete={handleAnimationComplete} />}
      
      {/* Main App Content */}
      <Header />
      <main className={`flex-1 flex items-center justify-center px-6 py-4 overflow-y-auto transition-opacity duration-500 ${
        isLoaded ? 'opacity-100' : 'opacity-50'
      }`}>
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