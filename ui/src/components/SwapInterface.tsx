import React, { useState, useEffect } from 'react';
import { ChevronDown, ArrowUpDown, Clock, CheckCircle, Loader, AlertTriangle } from 'lucide-react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { DEFAULT_EVM_TOKENS, DEFAULT_SUI_TOKENS } from '../constants/tokens';
import { 
  OrderStatus, 
  type Quote
} from '../blockchain/sdk/cross-chain-service';

// Token interface
interface Token {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  chainId: number;
  logoUri?: string;
  icon?: string;
}

// Chain interface
interface Chain {
  name: string;
  symbol: string;
  chainId: number;
}

const chains: Chain[] = [
  { name: 'Ethereum', symbol: 'ETH', chainId: 1 },
  { name: 'Sui', symbol: 'SUI', chainId: 0 }, // Using 0 for Sui as in original
];

// Helper functions to get tokens for specific chains
const getTokensForChain = (chainId: number): Token[] => {
  if (chainId === 0) {
    // Sui chain - only SUI and USDC
    return DEFAULT_SUI_TOKENS;
  } else if (chainId === 1) {
    // Ethereum chain - USDC, WETH, WBTC
    return DEFAULT_EVM_TOKENS;
  }
  return [];
};

// Order status UI mapping - using string keys to match SDK values
const ORDER_STATUS_UI: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  'pending': { label: 'Pending', color: 'text-yellow-400', icon: Clock },
  'executed': { label: 'Completed', color: 'text-green-400', icon: CheckCircle },
  'expired': { label: 'Expired', color: 'text-red-400', icon: AlertTriangle },
  'refunded': { label: 'Refunded', color: 'text-orange-400', icon: AlertTriangle },
  'cancelled': { label: 'Cancelled', color: 'text-gray-400', icon: AlertTriangle },
  'refunding': { label: 'Refunding', color: 'text-orange-400', icon: Clock },
};

const SwapInterface: React.FC = () => {
  // Wallet connections
  const { address: evmAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const suiAccount = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  // Chain and token state
  const [payChain, setPayChain] = useState<Chain>(chains[0]); // Default to Ethereum
  const [receiveChain, setReceiveChain] = useState<Chain>(chains[1]); // Default to Sui
  const [payToken, setPayToken] = useState<Token>(getTokensForChain(chains[0].chainId)[0]); // First token of Ethereum
  const [receiveToken, setReceiveToken] = useState<Token | null>(null);
  
  // UI State
  const [payAmount, setPayAmount] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('0');
  const [isQuoted, setIsQuoted] = useState(false);
  const [singleFill, setSingleFill] = useState(true);
  const [showPayTokens, setShowPayTokens] = useState(false);
  const [showReceiveTokens, setShowReceiveTokens] = useState(false);
  const [showPayChains, setShowPayChains] = useState(false);
  const [showReceiveChains, setShowReceiveChains] = useState(false);
  const [slippage, setSlippage] = useState('0.5');
  const [showSettings, setShowSettings] = useState(false);
  
  // Swap State
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isProcessingSwap, setIsProcessingSwap] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [swapStatus, setSwapStatus] = useState<OrderStatus | null>(null);
  const [currentOrderHash, setCurrentOrderHash] = useState<string | null>(null);
  
  // Error handling
  const [error, setError] = useState<string | null>(null);

  // Update tokens when chain changes
  useEffect(() => {
    const availableTokens = getTokensForChain(payChain.chainId);
    if (availableTokens.length > 0) {
      setPayToken(availableTokens[0]);
    }
    setIsQuoted(false); // Reset quote when chain changes
    setQuote(null);
    
    // Ensure receive chain is different from pay chain
    if (receiveChain.chainId === payChain.chainId) {
      const differentChain = chains.find(chain => chain.chainId !== payChain.chainId);
      if (differentChain) {
        setReceiveChain(differentChain);
      }
    }
  }, [payChain]);

  useEffect(() => {
    setReceiveToken(null); // Reset receive token when chain changes
    setIsQuoted(false);
    setQuote(null);
    
    // Ensure pay chain is different from receive chain
    if (payChain.chainId === receiveChain.chainId) {
      const differentChain = chains.find(chain => chain.chainId !== receiveChain.chainId);
      if (differentChain) {
        setPayChain(differentChain);
      }
    }
  }, [receiveChain]);

  // Get available tokens for current chains
  const availablePayTokens = getTokensForChain(payChain.chainId);
  const availableReceiveTokens = getTokensForChain(receiveChain.chainId).filter(
    token => token.symbol !== payToken.symbol || token.chainId !== payToken.chainId
  );

  const handleGetQuote = async () => {
    if (!payAmount || !receiveToken) return;

    const walletAddress = payChain.chainId === 0 ? suiAccount?.address : evmAddress;
    if (!walletAddress) {
      setError('Please connect your wallet first');
      return;
    }

    setIsLoadingQuote(true);
    setError(null);

    try {
      // Calculate amounts based on input
      const inputAmount = parseFloat(payAmount);
      const outputAmount = inputAmount * 0.98; // 2% slippage simulation
      
      console.log('🔍 Getting cross-chain quote...');
      console.log('[SwapInterface] === UI DATA CAPTURE ===');
      console.log('[SwapInterface] Pay chain:', payChain);
      console.log('[SwapInterface] Receive chain:', receiveChain);
      console.log('[SwapInterface] Pay token selected:', payToken);
      console.log('[SwapInterface] Receive token selected:', receiveToken);
      console.log('[SwapInterface] Input amount:', payAmount);
      console.log('[SwapInterface] Calculated output amount:', outputAmount.toString());
      console.log('[SwapInterface] Connected wallets:', {
        suiWallet: suiAccount?.address || 'Not connected',
        evmWallet: evmAddress || 'Not connected'
      });
      console.log('[SwapInterface] ================================');
      
      // For now, simulate quote with mock data
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API delay
      
      // Create mock quote with dynamic amounts
      const mockQuote = {
        quoteId: `quote-${Date.now()}`,
        srcTokenAmount: (inputAmount * (10 ** payToken.decimals)).toString(),
        dstTokenAmount: (outputAmount * (10 ** receiveToken.decimals)).toString(),
        srcChainId: payChain.chainId,
        dstChainId: receiveChain.chainId,
        srcTokenAddress: payToken.address,
        dstTokenAddress: receiveToken.address,
        presets: {
          fast: {
            secretsCount: 1,
            auctionDuration: 180,
            startAmount: (inputAmount * (10 ** payToken.decimals)).toString(),
          },
        },
      };
      
      setQuote(mockQuote as any);
      setReceiveAmount(outputAmount.toString());
      setIsQuoted(true);
      
      console.log('✅ Mock quote received:', mockQuote.quoteId);
    } catch (err) {
      console.error('❌ Failed to get quote:', err);
      setError(err instanceof Error ? err.message : 'Failed to get quote');
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleSwap = async () => {
    if (!quote || !payAmount || !receiveToken) return;

    const walletAddress = payChain.chainId === 0 ? suiAccount?.address : evmAddress;
    if (!walletAddress) {
      setError('Please connect your wallet first');
      return;
    }

    setIsProcessingSwap(true);
    setError(null);

    try {
      console.log('🚀 Starting cross-chain swap...');
      console.log('[SwapInterface] Source chain:', payChain.name);
      console.log('[SwapInterface] Destination chain:', receiveChain.name);
      
      // Step 1: Handle source chain transaction (approve or move call)
      if (payChain.chainId === 0) {
        // Sui source - call Move contract
        console.log('[SwapInterface] Calling Sui Move contract for order transfer...');
        
        // TODO: Implement Sui Move contract call
        // This would call the resolver contract to transfer maker funds
        const moveCallResult = await callSuiMoveContract({
          payToken,
          amount: payAmount,
          walletAddress,
          signAndExecuteTransaction,
        });
        
        console.log('[SwapInterface] Sui Move call result:', moveCallResult);
        
      } else {
        // Ethereum source - call ERC20 approve
        console.log('[SwapInterface] Calling ERC20 approve for token transfer...');
        
        // TODO: Implement ERC20 approve call
        const approveResult = await callERC20Approve({
          tokenAddress: payToken.address,
          amount: payAmount,
          decimals: payToken.decimals,
          walletClient,
          publicClient,
          account: evmAddress,
        });
        
        console.log('[SwapInterface] ERC20 approve result:', approveResult);
      }

      // Step 2: Create and submit order (mock for now)
      const orderHash = `order-${Date.now()}`;
      setCurrentOrderHash(orderHash);
      setSwapStatus('pending' as OrderStatus);
      
      console.log('[SwapInterface] Order created with hash:', orderHash);
      
      // Step 3: Simulate order completion
      setTimeout(() => {
        setSwapStatus('executed' as OrderStatus);
        setIsProcessingSwap(false);
        console.log('✅ Swap completed successfully!');
        
        // Reset UI after successful swap
        setIsQuoted(false);
        setPayAmount('');
        setReceiveAmount('0');
        alert('Swap completed successfully!');
      }, 3000);
      
    } catch (err) {
      console.error('❌ Swap failed:', err);
      setError(err instanceof Error ? err.message : 'Swap failed. Please try again.');
      setIsProcessingSwap(false);
    }
  };

  const switchTokens = () => {
    const tempToken = payToken;
    const tempChain = payChain;
    
    // Switch chains
    setPayChain(receiveChain);
    setReceiveChain(tempChain);
    
    // Switch tokens if possible
    if (receiveToken) {
      setPayToken(receiveToken);
      setReceiveToken(tempToken);
    }
    
    // Switch amounts
    setPayAmount(receiveAmount);
    setReceiveAmount('0');
    setIsQuoted(false);
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-6">
        {/* Header with Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-white text-2xl font-semibold">Swap</h2>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Single/Multi Fill Toggle */}
            <div className="flex items-center space-x-3">
              <span className="text-gray-400 text-base">Multi Fill</span>
              <button
                onClick={() => {
                  const newSingleFill = !singleFill;
                  console.log('[SwapInterface] Toggle clicked - changing singleFill from', singleFill, 'to', newSingleFill);
                  setSingleFill(newSingleFill);
                }}
                className={`w-12 h-7 rounded-full transition-colors duration-200 ${
                  singleFill ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                    singleFill ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-gray-400 text-base">Single Fill</span>
            </div>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-white text-base font-medium">Transaction Settings</span>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Slippage Tolerance</label>
                <div className="flex space-x-2">
                  {['0.1', '0.5', '1.0'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setSlippage(preset)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        slippage === preset 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="px-3 py-2 bg-gray-700 text-white rounded-lg text-sm w-20"
                    placeholder="Custom"
                    step="0.1"
                    min="0"
                    max="50"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pay Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">You pay</span>
          </div>
          
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              {/* Chain Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowPayChains(!showPayChains)}
                  className="flex items-center space-x-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="text-white text-sm font-medium">{payChain.name}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                
                {showPayChains && (
                  <div className="absolute top-full left-0 mt-2 w-40 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-50">
                    {chains.filter(chain => chain.chainId !== receiveChain.chainId).map((chain) => (
                      <button
                        key={chain.chainId}
                        onClick={() => {
                          setPayChain(chain);
                          setShowPayChains(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-700 text-white text-sm transition-colors"
                      >
                        {chain.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Token Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowPayTokens(!showPayTokens)}
                  className="flex items-center space-x-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="font-medium text-white">{payToken.symbol}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                
                {showPayTokens && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-50 max-h-60 overflow-y-auto">
                    {availablePayTokens.map((token) => (
                      <button
                        key={token.address}
                        onClick={() => {
                          setPayToken(token);
                          setShowPayTokens(false);
                          setIsQuoted(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-700 flex items-center space-x-3 transition-colors"
                      >
                        <div>
                          <div className="font-medium text-white">{token.symbol}</div>
                          <div className="text-sm text-gray-400">{token.name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <input
              type="number"
              value={payAmount}
              onChange={(e) => {
                setPayAmount(e.target.value);
                setIsQuoted(false);
              }}
              placeholder="0.0"
              className="w-full bg-transparent text-white text-2xl font-semibold placeholder-gray-400 outline-none"
              disabled={isLoadingQuote || isProcessingSwap}
            />
          </div>
        </div>

        {/* Switch Button */}
        <div className="flex justify-center my-4">
          <button
            onClick={switchTokens}
            disabled={isLoadingQuote || isProcessingSwap}
            className="p-2 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg transition-colors disabled:opacity-50"
          >
            <ArrowUpDown className="w-5 h-5 text-blue-400" />
          </button>
        </div>

        {/* Receive Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">You receive</span>
          </div>
          
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              {/* Chain Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowReceiveChains(!showReceiveChains)}
                  className="flex items-center space-x-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="text-white text-sm font-medium">{receiveChain.name}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                
                {showReceiveChains && (
                  <div className="absolute top-full left-0 mt-2 w-40 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-50">
                    {chains.filter(chain => chain.chainId !== payChain.chainId).map((chain) => (
                      <button
                        key={chain.chainId}
                        onClick={() => {
                          setReceiveChain(chain);
                          setShowReceiveChains(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-700 text-white text-sm transition-colors"
                      >
                        {chain.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Token Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowReceiveTokens(!showReceiveTokens)}
                  className="flex items-center space-x-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="font-medium text-white">
                    {receiveToken ? receiveToken.symbol : 'Select token'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                
                {showReceiveTokens && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-50 max-h-60 overflow-y-auto">
                    {availableReceiveTokens.map((token) => (
                      <button
                        key={token.address}
                        onClick={() => {
                          setReceiveToken(token);
                          setShowReceiveTokens(false);
                          setIsQuoted(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-700 flex items-center space-x-3 transition-colors"
                      >
                        <div>
                          <div className="font-medium text-white">{token.symbol}</div>
                          <div className="text-sm text-gray-400">{token.name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-2xl font-semibold text-gray-400">
              {receiveAmount}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Quote Details */}
        {quote && (
          <div className="mb-4 p-3 bg-gray-800/30 border border-gray-700/50 rounded-xl">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Expected Output</span>
              <span className="text-white">{receiveAmount} {receiveToken?.symbol}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-400">Quote ID</span>
              <span className="text-white text-xs font-mono">{quote.quoteId?.slice(0, 8)}...</span>
            </div>
          </div>
        )}

        {/* Order Status */}
        {swapStatus && (
          <div className="mb-4 p-3 bg-blue-600/10 border border-blue-600/20 rounded-xl">
            <div className="flex items-center space-x-2">
              {React.createElement(ORDER_STATUS_UI[swapStatus.toLowerCase()]?.icon || Clock, {
                className: `w-4 h-4 ${ORDER_STATUS_UI[swapStatus.toLowerCase()]?.color || 'text-gray-400'}`
              })}
              <span className="text-white text-sm">
                {ORDER_STATUS_UI[swapStatus.toLowerCase()]?.label || swapStatus}
              </span>
            </div>
            {currentOrderHash && (
              <p className="text-xs text-gray-400 mt-1 font-mono">
                Order: {currentOrderHash.slice(0, 10)}...
              </p>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="space-y-3">
          <button
            onClick={isQuoted ? handleSwap : handleGetQuote}
            disabled={(!payAmount || !receiveToken) || isLoadingQuote || isProcessingSwap}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center space-x-2"
          >
            {isLoadingQuote ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Getting Quote...</span>
              </>
            ) : isProcessingSwap ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Processing Swap...</span>
              </>
            ) : isQuoted ? (
              <span>Confirm Swap</span>
            ) : (
              <span>Get Quote</span>
            )}
          </button>
          
          {!payAmount && (
            <p className="text-gray-400 text-sm text-center">Enter an amount to continue</p>
          )}
          
          {payAmount && !receiveToken && (
            <p className="text-gray-400 text-sm text-center">Select a token to receive</p>
          )}
          
          {isQuoted && (
            <p className="text-gray-400 text-xs text-center">
              Output is estimated. You will receive at least{' '}
              <span className="text-white">
                {(parseFloat(receiveAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6)} {receiveToken?.symbol}
              </span>{' '}
              or the transaction will revert.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// TODO: Implement these functions
async function callSuiMoveContract(params: any) {
  console.log('🔄 Calling Sui Move contract with params:', params);
  // This will call the resolver Move contract to transfer maker funds
  // Implementation needed based on your Move contract
  return { success: true, txHash: 'sui-tx-' + Date.now() };
}

async function callERC20Approve(params: any) {
  console.log('🔄 Calling ERC20 approve with params:', params);
  // This will call the ERC20 approve function
  // Implementation needed using your ERC20 ABI
  return { success: true, txHash: 'eth-tx-' + Date.now() };
}

export default SwapInterface;
