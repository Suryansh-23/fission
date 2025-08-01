import React, { useState } from 'react';
import { useCurrentAccount, useConnectWallet, useDisconnectWallet, useWallets } from '@mysten/dapp-kit';

const WalletConnect: React.FC = () => {
  const currentAccount = useCurrentAccount();
  const { mutate: connect, isPending } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const wallets = useWallets();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletList, setShowWalletList] = useState(false);

  const handleConnect = async (selectedWallet?: any) => {
    setIsConnecting(true);
    
    try {
      const walletToConnect = selectedWallet || wallets[0];
      
      if (!walletToConnect) {
        console.error('No wallet available to connect');
        alert('No Sui wallets detected. Please install a Sui wallet extension.');
        setIsConnecting(false);
        return;
      }

      connect(
        { wallet: walletToConnect },
        {
          onSuccess: () => {
            console.log('Sui wallet connected successfully');
            setIsConnecting(false);
            setShowWalletList(false);
          },
          onError: (error) => {
            console.error('Failed to connect Sui wallet:', error);
            alert(`Failed to connect: ${error.message}`);
            setIsConnecting(false);
          }
        }
      );
    } catch (error) {
      console.error('Error during Sui wallet connection:', error);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    console.log('🔌 Disconnecting wallet');
    disconnect();
  };

  // If wallet is connected, show disconnect button
  if (currentAccount) {
    return (
      <div className="flex items-center space-x-2">
        <div className="text-green-400 text-sm">
          Connected: {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
        </div>
        <button
          onClick={handleDisconnect}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-medium transition-colors text-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Show wallet selection if multiple wallets available
  if (showWalletList && wallets.length > 1) {
    return (
      <div className="relative">
        <div className="absolute top-full mt-2 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 min-w-48">
          <div className="p-2">
            <div className="text-white text-sm font-medium mb-2">Select Wallet:</div>
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                onClick={() => handleConnect(wallet)}
                disabled={isConnecting || isPending}
                className="w-full flex items-center space-x-3 px-3 py-2 hover:bg-gray-700/50 rounded-lg transition-colors text-left"
              >
                <img 
                  src={wallet.icon} 
                  alt={wallet.name}
                  className="w-6 h-6"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="text-white text-sm">{wallet.name}</span>
              </button>
            ))}
            <button
              onClick={() => setShowWalletList(false)}
              className="w-full mt-2 px-3 py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => wallets.length > 1 ? setShowWalletList(true) : handleConnect()}
      disabled={isConnecting || isPending}
      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-xl font-medium transition-colors text-sm"
    >
      {isConnecting || isPending ? 'Connecting...' : 'Connect Sui Wallet'}
    </button>
  );
};

export default WalletConnect;
