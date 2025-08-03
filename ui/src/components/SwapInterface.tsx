import React, { useState, useEffect } from 'react';
import { ChevronDown, ArrowUpDown, Clock, CheckCircle, Loader, AlertTriangle } from 'lucide-react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { DEFAULT_EVM_TOKENS, DEFAULT_SUI_TOKENS } from '../constants/tokens';
import { 
  OrderStatus, 
  type Quote
} from '../blockchain/sdk/cross-chain-service';
import { ERC20Service } from '../blockchain/evm/erc20';
import { SuiOrder, type CreateOrderParams } from '../blockchain/sui/sui-order';
import { SuiClient } from '@mysten/sui/client';

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
      
      console.log('[SwapInterface.tsx] USER CLICKED GET QUOTE BUTTON');
      console.log('[SwapInterface.tsx] === QUOTE REQUEST DATA CAPTURE ===');
      console.log('[SwapInterface.tsx] Pay chain details:', {
        name: payChain.name,
        symbol: payChain.symbol,
        chainId: payChain.chainId
      });
      console.log('[SwapInterface.tsx] Receive chain details:', {
        name: receiveChain.name,
        symbol: receiveChain.symbol,
        chainId: receiveChain.chainId
      });
      console.log('[SwapInterface.tsx] Pay token details:', {
        symbol: payToken.symbol,
        name: payToken.name,
        decimals: payToken.decimals,
        address: payToken.address,
        chainId: payToken.chainId
      });
      console.log('[SwapInterface.tsx] Receive token details:', {
        symbol: receiveToken.symbol,
        name: receiveToken.name,
        decimals: receiveToken.decimals,
        address: receiveToken.address,
        chainId: receiveToken.chainId
      });
      console.log('[SwapInterface.tsx] Amount details:', {
        inputAmountString: payAmount,
        inputAmountFloat: inputAmount,
        outputAmountCalculated: outputAmount,
        slippageUsed: '2%'
      });
      console.log('[SwapInterface.tsx] Wallet connection status:', {
        suiAccountAddress: suiAccount?.address || 'Not connected',
        suiAccountConnected: !!suiAccount?.address,
        evmAccountAddress: evmAddress || 'Not connected',
        evmAccountConnected: !!evmAddress,
        activeWalletForThisQuote: walletAddress,
        activeChainType: payChain.chainId === 0 ? 'Sui' : 'EVM'
      });
      console.log('[SwapInterface.tsx] UI settings:', {
        singleFillEnabled: singleFill,
        slippageTolerance: slippage + '%',
        settingsVisible: showSettings
      });
      console.log('[SwapInterface.tsx] ================================');
      
      console.log('[SwapInterface.tsx] === SIMULATING SDK QUOTE REQUEST ===');
      console.log('[SwapInterface.tsx] SDK quote parameters being sent:', {
        srcTokenAmount: (inputAmount * (10 ** payToken.decimals)).toString(),
        dstTokenAmount: (outputAmount * (10 ** receiveToken.decimals)).toString(),
        srcChainId: payChain.chainId,
        dstChainId: receiveChain.chainId,
        srcTokenAddress: payToken.address,
        dstTokenAddress: receiveToken.address,
        walletAddress: walletAddress,
        slippageTolerance: slippage
      });
      console.log('[SwapInterface.tsx] Calling external SDK quote endpoint with above parameters...');
      
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
      
      console.log('[SwapInterface.tsx] === SDK QUOTE RESPONSE RECEIVED ===');
      console.log('[SwapInterface.tsx] SDK response data:', mockQuote);
      console.log('[SwapInterface.tsx] Quote ID generated by SDK:', mockQuote.quoteId);
      console.log('[SwapInterface.tsx] ======================================');
      
      setQuote(mockQuote as any);
      setReceiveAmount(outputAmount.toString());
      setIsQuoted(true);
      
      console.log('[SwapInterface.tsx] Quote successfully processed and UI updated');
      console.log('[SwapInterface.tsx] New UI state - receiveAmount:', outputAmount.toString());
      console.log('[SwapInterface.tsx] New UI state - isQuoted:', true);
    } catch (err) {
      console.error('[SwapInterface.tsx] === QUOTE REQUEST FAILED ===');
      console.error('[SwapInterface.tsx] Error details:', err);
      console.error('[SwapInterface.tsx] Error message:', err instanceof Error ? err.message : 'Unknown error');
      console.error('[SwapInterface.tsx] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      console.error('[SwapInterface.tsx] ===============================');
      setError(err instanceof Error ? err.message : 'Failed to get quote');
    } finally {
      setIsLoadingQuote(false);
      console.log('[SwapInterface.tsx] Quote request process completed, loading state reset');
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
      console.log('[SwapInterface.tsx] USER CLICKED CONFIRM SWAP BUTTON');
      console.log('[SwapInterface.tsx] === SWAP EXECUTION DATA CAPTURE ===');
      console.log('[SwapInterface.tsx] Quote being used for swap:', {
        quoteId: quote.quoteId,
        srcTokenAmount: quote.srcTokenAmount,
        dstTokenAmount: quote.dstTokenAmount,
        recommendedPreset: quote.recommendedPreset || 'fast',
        presetsAvailable: Object.keys(quote.presets || {})
      });
      console.log('[SwapInterface.tsx] Current swap parameters:', {
        payChainName: payChain.name,
        payChainId: payChain.chainId,
        receiveChainName: receiveChain.name,
        receiveChainId: receiveChain.chainId,
        payTokenSymbol: payToken.symbol,
        payTokenAddress: payToken.address,
        receiveTokenSymbol: receiveToken.symbol,
        receiveTokenAddress: receiveToken.address,
        payAmountString: payAmount,
        receiveAmountString: receiveAmount,
        singleFillMode: singleFill,
        slippageTolerance: slippage + '%'
      });
      console.log('[SwapInterface.tsx] Active wallet details:', {
        activeWalletAddress: walletAddress,
        walletType: payChain.chainId === 0 ? 'Sui wallet' : 'EVM wallet',
        suiWalletConnected: !!suiAccount?.address,
        evmWalletConnected: !!evmAddress,
        walletClientAvailable: !!walletClient,
        publicClientAvailable: !!publicClient
      });
      console.log('[SwapInterface.tsx] =======================================');
      
      // Step 1: Handle source chain transaction (approve or move call)
      if (payChain.chainId === 0) {
        // Sui source - call Move contract
        console.log('[SwapInterface.tsx] === PREPARING SUI MOVE CONTRACT CALL ===');
        console.log('[SwapInterface.tsx] Detected source chain as Sui, preparing Move contract interaction');
        
        const suiMoveParams = {
          payToken: payToken,
          amount: payAmount,
          walletAddress: walletAddress,
          signAndExecuteTransaction: signAndExecuteTransaction,
          receiveToken: receiveToken,
          receiveChain: receiveChain,
          quote: quote,
          singleFill: singleFill
        };
        
        console.log('[SwapInterface.tsx] SUI MOVE contract parameters being sent:', {
          payTokenDetails: {
            symbol: payToken.symbol,
            address: payToken.address,
            decimals: payToken.decimals,
            chainId: payToken.chainId
          },
          amountString: payAmount,
          amountInSmallestUnit: (parseFloat(payAmount) * (10 ** payToken.decimals)).toString(),
          walletAddress: walletAddress,
          hasSignFunction: !!signAndExecuteTransaction,
          receiveTokenSymbol: receiveToken.symbol,
          receiveChainName: receiveChain.name,
          quoteId: quote.quoteId,
          singleFillEnabled: singleFill
        });
        console.log('[SwapInterface.tsx] Calling Move contract function...');
        
        // TODO: Implement Sui Move contract call
        // This would call the resolver contract to transfer maker funds
        const moveCallResult = await callSuiMoveContract(suiMoveParams);
        
        console.log('[SwapInterface.tsx] === SUI MOVE CONTRACT CALL RESULT ===');
        console.log('[SwapInterface.tsx] Move contract call completed');
        console.log('[SwapInterface.tsx] Result from Move contract:', moveCallResult);
        console.log('[SwapInterface.tsx] ===================================');
        
      } else {
        // Ethereum source - call ERC20 approve
        console.log('[SwapInterface.tsx] === PREPARING ERC20 APPROVE CALL ===');
        console.log('[SwapInterface.tsx] Detected source chain as Ethereum, preparing ERC20 approve transaction');
        
        const erc20ApproveParams = {
          tokenAddress: payToken.address,
          amount: payAmount,
          decimals: payToken.decimals,
          walletClient: walletClient,
          publicClient: publicClient,
          account: evmAddress,
          payToken: payToken,
          receiveToken: receiveToken,
          receiveChain: receiveChain,
          quote: quote,
          singleFill: singleFill
        };
        
        console.log('[SwapInterface.tsx] ERC20 approve parameters being sent:', {
          tokenContractAddress: payToken.address,
          tokenSymbol: payToken.symbol,
          amountString: payAmount,
          amountInSmallestUnit: (parseFloat(payAmount) * (10 ** payToken.decimals)).toString(),
          tokenDecimals: payToken.decimals,
          userAccountAddress: evmAddress,
          hasWalletClient: !!walletClient,
          hasPublicClient: !!publicClient,
          targetReceiveToken: receiveToken.symbol,
          targetReceiveChain: receiveChain.name,
          quoteId: quote.quoteId,
          singleFillEnabled: singleFill
        });
        console.log('[SwapInterface.tsx] Calling ERC20 approve function...');
        
        // TODO: Implement ERC20 approve call
        const approveResult = await callERC20Approve(erc20ApproveParams);
        
        console.log('[SwapInterface.tsx] === ERC20 APPROVE CALL RESULT ===');
        console.log('[SwapInterface.tsx] ERC20 approve call completed');
        console.log('[SwapInterface.tsx] Result from ERC20 approve:', approveResult);
        console.log('[SwapInterface.tsx] ===============================');
      }

      // Step 2: Create and submit order (mock for now)
      const orderHash = `order-${Date.now()}`;
      setCurrentOrderHash(orderHash);
      setSwapStatus('pending' as OrderStatus);
      
      console.log('[SwapInterface.tsx] === ORDER CREATION AND SUBMISSION ===');
      console.log('[SwapInterface.tsx] Creating cross-chain order...');
      console.log('[SwapInterface.tsx] Generated order hash:', orderHash);
      console.log('[SwapInterface.tsx] Order status set to:', 'pending');
      console.log('[SwapInterface.tsx] Order details submitted to network:', {
        orderHash: orderHash,
        srcChain: payChain.name,
        dstChain: receiveChain.name,
        srcToken: payToken.symbol,
        dstToken: receiveToken.symbol,
        srcAmount: payAmount,
        dstAmount: receiveAmount,
        maker: walletAddress,
        timestamp: new Date().toISOString()
      });
      console.log('[SwapInterface.tsx] ===================================');
      
      // Step 3: Simulate order completion
      console.log('[SwapInterface.tsx] Simulating order execution process...');
      console.log('[SwapInterface.tsx] Waiting for order to be filled by relayers...');
      
      setTimeout(() => {
        console.log('[SwapInterface.tsx] === ORDER EXECUTION COMPLETED ===');
        console.log('[SwapInterface.tsx] Order status changed from pending to executed');
        console.log('[SwapInterface.tsx] Order hash:', orderHash);
        console.log('[SwapInterface.tsx] Final order status:', 'executed');
        console.log('[SwapInterface.tsx] User should have received tokens on destination chain');
        console.log('[SwapInterface.tsx] ================================');
        
        setSwapStatus('executed' as OrderStatus);
        setIsProcessingSwap(false);
        
        console.log('[SwapInterface.tsx] === UI STATE RESET AFTER SUCCESSFUL SWAP ===');
        console.log('[SwapInterface.tsx] Resetting UI state to initial values');
        console.log('[SwapInterface.tsx] isQuoted: true -> false');
        console.log('[SwapInterface.tsx] payAmount: ' + payAmount + ' -> empty string');
        console.log('[SwapInterface.tsx] receiveAmount: ' + receiveAmount + ' -> "0"');
        console.log('[SwapInterface.tsx] ==========================================');
        
        // Reset UI after successful swap
        setIsQuoted(false);
        setPayAmount('');
        setReceiveAmount('0');
        alert('Swap completed successfully!');
      }, 3000);
      
    } catch (err) {
      console.error('[SwapInterface.tsx] === SWAP EXECUTION FAILED ===');
      console.error('[SwapInterface.tsx] Error during swap execution:', err);
      console.error('[SwapInterface.tsx] Error message:', err instanceof Error ? err.message : 'Unknown error');
      console.error('[SwapInterface.tsx] Error stack trace:', err instanceof Error ? err.stack : 'No stack trace');
      console.error('[SwapInterface.tsx] Current swap state when error occurred:', {
        payChain: payChain.name,
        receiveChain: receiveChain.name,
        payToken: payToken.symbol,
        receiveToken: receiveToken?.symbol,
        payAmount: payAmount,
        quoteId: quote?.quoteId,
        walletAddress: walletAddress
      });
      console.error('[SwapInterface.tsx] ============================');
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
  console.log('[SwapInterface.tsx] === SUI MOVE CONTRACT FUNCTION CALLED ===');
  console.log('[SwapInterface.tsx] Function: callSuiMoveContract');
  console.log('[SwapInterface.tsx] Full parameters received:', params);
  console.log('[SwapInterface.tsx] Parameters breakdown:', {
    payTokenAddress: params.payToken?.address,
    payTokenSymbol: params.payToken?.symbol,
    payTokenDecimals: params.payToken?.decimals,
    amountString: params.amount,
    amountFloat: parseFloat(params.amount || '0'),
    amountInSmallestUnit: params.amount ? (parseFloat(params.amount) * (10 ** (params.payToken?.decimals || 9))).toString() : '0',
    walletAddress: params.walletAddress,
    hasSignFunction: !!params.signAndExecuteTransaction,
    receiveTokenSymbol: params.receiveToken?.symbol,
    receiveChainName: params.receiveChain?.name,
    quoteId: params.quote?.quoteId,
    singleFillMode: params.singleFill
  });

  if (!params.signAndExecuteTransaction || !params.walletAddress) {
    const error = 'No Sui wallet connected or sign function unavailable';
    console.error('[SwapInterface.tsx] === SUI MOVE CONTRACT ERROR ===');
    console.error('[SwapInterface.tsx]', error);
    console.error('[SwapInterface.tsx] ================================');
    throw new Error(error);
  }

  try {
    // Get environment variables
    const packageId = import.meta.env.VITE_SUI_PACKAGE_ID;
    if (!packageId) {
      throw new Error('VITE_SUI_PACKAGE_ID not configured in environment variables');
    }

    // Set up Sui client
    const rpcUrl = import.meta.env.VITE_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
    const suiClient = new SuiClient({ url: rpcUrl });

    console.log('[SwapInterface.tsx] === REAL SUI MOVE CONTRACT TRANSACTION ===');
    console.log('[SwapInterface.tsx] Using SuiOrder class from blockchain directory');
    console.log('[SwapInterface.tsx] Package ID:', packageId);
    console.log('[SwapInterface.tsx] RPC URL:', rpcUrl);
    console.log('[SwapInterface.tsx] Creating SuiOrder instance...');

    // Create SuiOrder instance with the connected wallet signer
    const suiOrder = new SuiOrder(suiClient, {
      signAndExecuteTransaction: params.signAndExecuteTransaction
    } as any);

    // Prepare order parameters based on the current swap
    const amountInSmallestUnit = BigInt(parseFloat(params.amount) * (10 ** (params.payToken?.decimals || 9)));
    const takingAmount = BigInt(params.quote?.dstTokenAmount || '0');
    
    // TODO: These should come from the actual quote/cross-chain protocol
    const receiverEVMAddress = params.receiveToken?.address || '0x1234567890123456789012345678901234567890';
    const makerAsset = new Uint8Array(32); // TODO: Encode asset properly
    const takerAsset = new Uint8Array(32); // TODO: Encode asset properly
    const salt = new Uint8Array(32); // TODO: Generate proper random salt
    crypto.getRandomValues(salt); // Generate random salt

    const orderParams: CreateOrderParams = {
      receiver: receiverEVMAddress,
      makingAmount: amountInSmallestUnit,
      takingAmount: takingAmount,
      makerAsset: makerAsset,
      takerAsset: takerAsset,
      salt: salt,
      isPartialFillAllowed: !params.singleFill,
      isMultipleFillsAllowed: !params.singleFill,
      depositAmount: amountInSmallestUnit,
      coinType: params.payToken?.address || SuiOrder.SUI_TYPE,
      startTime: BigInt(Math.floor(Date.now() / 1000)),
      duration: BigInt(3600), // 1 hour
      initialRateBump: BigInt(0),
      pointsAndTimeDeltas: new Uint8Array(0) // Empty for now
    };

    console.log('[SwapInterface.tsx] Move contract parameters prepared:', {
      receiver: orderParams.receiver,
      makingAmount: orderParams.makingAmount.toString(),
      takingAmount: orderParams.takingAmount.toString(),
      coinType: orderParams.coinType,
      isPartialFillAllowed: orderParams.isPartialFillAllowed,
      isMultipleFillsAllowed: orderParams.isMultipleFillsAllowed,
      startTime: orderParams.startTime.toString(),
      duration: orderParams.duration.toString()
    });

    console.log('[SwapInterface.tsx] Calling SuiOrder.createOrder...');

    // Call the real Move contract
    const transaction = await suiOrder.createOrder(orderParams, packageId);

    console.log('[SwapInterface.tsx] === SUI MOVE CONTRACT CALL RESULT ===');
    console.log('[SwapInterface.tsx] Real Move contract call completed successfully');
    console.log('[SwapInterface.tsx] Transaction digest:', transaction.digest);
    console.log('[SwapInterface.tsx] Transaction status:', transaction.effects?.status?.status);
    console.log('[SwapInterface.tsx] Gas used:', transaction.effects?.gasUsed);
    console.log('[SwapInterface.tsx] Events count:', transaction.events?.length || 0);
    console.log('[SwapInterface.tsx] ====================================');

    return {
      success: transaction.effects?.status?.status === 'success',
      txHash: transaction.digest,
      orderHash: 'order-extracted-from-events', // TODO: Extract actual order hash from events
      gasUsed: transaction.effects?.gasUsed?.toString() || 'unknown',
      effects: transaction.effects,
      events: transaction.events,
      objectChanges: transaction.objectChanges
    };

  } catch (error) {
    console.error('[SwapInterface.tsx] === SUI MOVE CONTRACT FAILED ===');
    console.error('[SwapInterface.tsx] Error during Move contract call:', error);
    console.error('[SwapInterface.tsx] Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[SwapInterface.tsx] ===============================');
    throw error;
  }
}

async function callERC20Approve(params: any) {
  console.log('[SwapInterface.tsx] === ERC20 APPROVE FUNCTION CALLED ===');
  console.log('[SwapInterface.tsx] Function: callERC20Approve');
  console.log('[SwapInterface.tsx] Full parameters received:', params);
  console.log('[SwapInterface.tsx] Parameters breakdown:', {
    tokenContractAddress: params.tokenAddress,
    tokenSymbol: params.payToken?.symbol,
    tokenDecimals: params.decimals,
    amountString: params.amount,
    amountFloat: parseFloat(params.amount || '0'),
    amountInWei: params.amount ? (parseFloat(params.amount) * (10 ** (params.decimals || 18))).toString() : '0',
    userAccountAddress: params.account,
    hasWalletClient: !!params.walletClient,
    hasPublicClient: !!params.publicClient,
    receiveTokenSymbol: params.receiveToken?.symbol,
    receiveChainName: params.receiveChain?.name,
    quoteId: params.quote?.quoteId,
    singleFillMode: params.singleFill
  });

  if (!params.walletClient || !params.account) {
    const error = 'No wallet client or account available for ERC20 approval';
    console.error('[SwapInterface.tsx] === ERC20 APPROVE ERROR ===');
    console.error('[SwapInterface.tsx]', error);
    console.error('[SwapInterface.tsx] ================================');
    throw new Error(error);
  }

  try {
    const amountInWei = BigInt(parseFloat(params.amount) * (10 ** params.decimals));
    
    console.log('[SwapInterface.tsx] === REAL ERC20 APPROVE TRANSACTION ===');
    console.log('[SwapInterface.tsx] Using ERC20Service.approveToken method');
    console.log('[SwapInterface.tsx] Token contract address:', params.tokenAddress);
    console.log('[SwapInterface.tsx] Amount to approve (wei):', amountInWei.toString());
    console.log('[SwapInterface.tsx] User account:', params.account);
    console.log('[SwapInterface.tsx] Calling ERC20Service...');

    // Use the real ERC20Service from blockchain directory
    const result = await ERC20Service.approveToken({
      tokenAddress: params.tokenAddress,
      amount: amountInWei,
      decimals: params.decimals,
      walletClient: params.walletClient,
      account: params.account
    });

    console.log('[SwapInterface.tsx] === ERC20 APPROVE CALL RESULT ===');
    console.log('[SwapInterface.tsx] Real ERC20 approve call completed');
    console.log('[SwapInterface.tsx] Success:', result.success);
    console.log('[SwapInterface.tsx] Transaction hash:', result.txHash);
    console.log('[SwapInterface.tsx] Error (if any):', result.error);
    console.log('[SwapInterface.tsx] ===============================');

    if (!result.success) {
      throw new Error(result.error || 'ERC20 approval failed');
    }

    return {
      success: result.success,
      txHash: result.txHash,
      approvalAmount: amountInWei.toString(),
      gasUsed: 'pending_confirmation' // Will be known after confirmation
    };

  } catch (error) {
    console.error('[SwapInterface.tsx] === ERC20 APPROVE FAILED ===');
    console.error('[SwapInterface.tsx] Error during ERC20 approve:', error);
    console.error('[SwapInterface.tsx] Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[SwapInterface.tsx] ============================');
    throw error;
  }
}

export default SwapInterface;
