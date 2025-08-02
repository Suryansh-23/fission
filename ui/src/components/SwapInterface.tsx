import React, { useState, useEffect } from 'react';
import { ChevronDown, ArrowUpDown, Settings, Clock, CheckCircle, Loader } from 'lucide-react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useAccount } from 'wagmi';
import { DEFAULT_EVM_TOKENS, DEFAULT_SUI_TOKENS } from '../constants/tokens';
import crossChainSDKInstance, { OrderStatus, PresetEnum } from '../services/crossChainSDK';
import type { Quote } from '@1inch/cross-chain-sdk';

interface Token {
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
  address: string;
  chainId: number;
}

interface Chain {
  name: string;
  symbol: string;
  chainId: number;
}

const chains: Chain[] = [
  { name: 'Ethereum', symbol: 'ETH', chainId: 1 },
  { name: 'Sui', symbol: 'SUI', chainId: 0 },
];

// Helper functions to get tokens for specific chains
const getTokensForChain = (chainId: number): Token[] => {
  if (chainId === 0) {
    // Sui chain - only SUI and USDC
    return DEFAULT_SUI_TOKENS;
  } else if (chainId === 1) {
    // Ethereum chain - ETH, USDC, WBTC
    return DEFAULT_EVM_TOKENS;
  }
  return [];
};

const SwapInterface: React.FC = () => {
  const suiAccount = useCurrentAccount();
  const { address: evmAddress } = useAccount();
  
  const [payChain, setPayChain] = useState<Chain>(chains[0]); // Default to Ethereum
  const [receiveChain, setReceiveChain] = useState<Chain>(chains[1]); // Default to Sui
  const [payToken, setPayToken] = useState<Token>(getTokensForChain(chains[0].chainId)[0]); // First token of Ethereum
  const [receiveToken, setReceiveToken] = useState<Token | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [receiveAmount, setReceiveAmount] = useState<string>('0');
  const [isQuoted, setIsQuoted] = useState<boolean>(false);
  const [singleFill, setSingleFill] = useState<boolean>(true);
  const [showPayTokens, setShowPayTokens] = useState<boolean>(false);
  const [showReceiveTokens, setShowReceiveTokens] = useState<boolean>(false);
  const [showPayChains, setShowPayChains] = useState<boolean>(false);
  const [showReceiveChains, setShowReceiveChains] = useState<boolean>(false);
  const [slippage, setSlippage] = useState<string>('0.5');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Cross-chain swap state
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState<boolean>(false);
  const [isProcessingSwap, setIsProcessingSwap] = useState<boolean>(false);
  const [swapStatus, setSwapStatus] = useState<OrderStatus | null>(null);
  const [currentOrderHash, setCurrentOrderHash] = useState<string | null>(null);

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
      alert('Please connect your wallet first');
      return;
    }

    setIsLoadingQuote(true);
    try {
      console.log('🔍 Getting cross-chain quote...');
      
      const quoteResponse = await crossChainSDKInstance.getQuote({
        amount: (BigInt(payAmount) * BigInt(10 ** payToken.decimals)).toString(),
        srcChainId: payChain.chainId,
        dstChainId: receiveChain.chainId,
        srcTokenAddress: payToken.address,
        dstTokenAddress: receiveToken.address,
        walletAddress,
        enableEstimate: true,
      });

      setQuote(quoteResponse);
      // Convert bigint to number for display - SDK Quote uses bigint for amounts
      const dstAmount = Number(quoteResponse.dstTokenAmount) / (10 ** receiveToken.decimals);
      setReceiveAmount(dstAmount.toString());
      setIsQuoted(true);
      
      console.log('✅ Quote received:', quoteResponse);
    } catch (error) {
      console.error('❌ Failed to get quote:', error);
      alert('Failed to get quote. Please try again.');
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleSwap = async () => {
    if (!quote || !payAmount || !receiveToken) return;

    const walletAddress = payChain.chainId === 0 ? suiAccount?.address : evmAddress;
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }

    setIsProcessingSwap(true);
    try {
      console.log('🚀 Starting cross-chain swap...');
      
      // Step 1: Generate secrets
      const presetKey = singleFill ? PresetEnum.fast : PresetEnum.medium;
      const secretCount = quote.presets[presetKey].secretsCount;
      const generatedSecrets = crossChainSDKInstance.generateSecrets(secretCount);
      
      // Step 2: Create hash lock
      const hashLock = crossChainSDKInstance.createHashLock(generatedSecrets);
      const secretHashes = crossChainSDKInstance.hashSecrets(generatedSecrets);
      
      // Step 3: Create order
      // Create order with the quote
      const orderInfo = await crossChainSDKInstance.createOrder(quote, {
        walletAddress: walletAddress,
        hashLock: hashLock,
        preset: PresetEnum.fast, // Use SDK enum
        source: 'fusion-ui',
        secretHashes: secretHashes,
        nonce: BigInt(Date.now())
      });
      
      setCurrentOrderHash(orderInfo.hash);
      console.log('📝 Order created:', orderInfo.hash);
      
      // Step 4: Submit order
      await crossChainSDKInstance.submitOrder(
        quote.srcChainId,
        orderInfo.order,
        orderInfo.quoteId,
        secretHashes
      );
      
      console.log('📤 Order submitted successfully');
      
      // Step 5: Wait for completion
      const finalStatus = await crossChainSDKInstance.waitForOrderCompletion(
        orderInfo.hash,
        generatedSecrets,
        (status: OrderStatus) => {
          setSwapStatus(status);
          console.log('📊 Order status update:', status);
        }
      );
      
      setSwapStatus(finalStatus.status as OrderStatus);
      console.log('🏁 Swap completed with status:', finalStatus.status);
      
      // Reset UI after successful swap
      if (finalStatus.status === OrderStatus.Executed) {
        setIsQuoted(false);
        setPayAmount('');
        setReceiveAmount('0');
        alert('Swap completed successfully!');
      }
      
    } catch (error) {
      console.error('❌ Swap failed:', error);
      alert('Swap failed. Please try again.');
    } finally {
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
              <span className="text-gray-400 text-base">Single Fill</span>
              <button
                onClick={() => setSingleFill(!singleFill)}
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
              <span className="text-gray-400 text-base">Multi Fill</span>
            </div>
            
            <button 
              className="p-2 text-gray-400 hover:text-white transition-colors"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-5 h-5" />
            </button>
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
                <div className="flex items-center space-x-2">
                  {['0.1', '0.5', '1.0'].map((value) => (
                    <button
                      key={value}
                      onClick={() => setSlippage(value)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        slippage === value 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {value}%
                    </button>
                  ))}
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="bg-gray-700/50 text-white px-3 py-2 rounded-lg text-sm w-20 outline-none"
                    placeholder="Custom"
                    step="0.1"
                    min="0.1"
                    max="50"
                  />
                  <span className="text-gray-400 text-sm">%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Swap Status Display */}
        {(isProcessingSwap || swapStatus) && (
          <div className="bg-blue-800/30 border border-blue-700/50 rounded-xl p-4 mb-4">
            <div className="flex items-center space-x-3">
              {isProcessingSwap ? (
                <Loader className="w-5 h-5 text-blue-400 animate-spin" />
              ) : swapStatus === OrderStatus.Executed ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <Clock className="w-5 h-5 text-yellow-400" />
              )}
              <div>
                <div className="text-white font-medium">
                  {isProcessingSwap ? 'Processing Swap...' : `Status: ${swapStatus}`}
                </div>
                <div className="text-gray-400 text-sm">
                  {isProcessingSwap 
                    ? 'Creating order and submitting to cross-chain protocol'
                    : currentOrderHash && `Order: ${currentOrderHash.slice(0, 10)}...`
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quote Info */}
        {isQuoted && (
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Rate</span>
              <span className="text-white">1 {payToken.symbol} = {(parseFloat(receiveAmount) / parseFloat(payAmount)).toFixed(6)} {receiveToken?.symbol}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-400">Slippage Tolerance</span>
              <span className="text-white">{slippage}%</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-400">Network Fee</span>
              <span className="text-white">~$0.50</span>
            </div>
          </div>
        )}

        {/* You Pay Section */}
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4 mb-2">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-base font-medium">You pay</span>
            <div className="relative">
              <button
                onClick={() => setShowPayChains(!showPayChains)}
                className="text-gray-400 hover:text-white text-sm flex items-center space-x-1 transition-colors"
              >
                <span>{payChain.name}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showPayChains && (
                <div className="absolute top-full right-0 mt-2 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
                  {chains.map((chain) => (
                    <button
                      key={chain.chainId}
                      onClick={() => {
                        setPayChain(chain);
                        setShowPayChains(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                        chain.chainId === payChain.chainId
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700/50'
                      }`}
                    >
                      {chain.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="relative">
              <button
                onClick={() => setShowPayTokens(!showPayTokens)}
                className="flex items-center space-x-3 bg-gray-700/50 hover:bg-gray-700 px-4 py-3 rounded-lg transition-colors"
              >
                <span className="text-2xl">{payToken.icon}</span>
                <div className="text-left">
                  <div className="text-white font-semibold text-lg">{payToken.symbol}</div>
                  <div className="text-gray-400 text-sm">on {payChain.name}</div>
                </div>
                <ChevronDown className="w-5 h-5 text-gray-400" />
              </button>
              
              {showPayTokens && (
                <div className="absolute top-full mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10">
                  {availablePayTokens.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => {
                        setPayToken(token);
                        setShowPayTokens(false);
                        setIsQuoted(false); // Reset quote when token changes
                        setQuote(null);
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-700/50 transition-colors"
                    >
                      <span className="text-xl">{token.icon}</span>
                      <div className="text-left">
                        <div className="text-white text-base font-medium">{token.symbol}</div>
                        <div className="text-gray-400 text-sm">{token.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="text-right">
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0"
                className="bg-transparent text-white text-3xl font-medium text-right outline-none w-40"
              />
              <div className="text-gray-400 text-base">Balance: --</div>
            </div>
          </div>
        </div>

        {/* Switch Button */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={switchTokens}
            className="bg-gray-800 border border-gray-700 p-3 rounded-xl hover:bg-gray-700 transition-colors"
          >
            <ArrowUpDown className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* You Receive Section */}
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-base font-medium">You receive</span>
            <div className="relative">
              <button
                onClick={() => setShowReceiveChains(!showReceiveChains)}
                className="text-gray-400 hover:text-white text-sm flex items-center space-x-1 transition-colors"
              >
                <span>{receiveChain.name}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showReceiveChains && (
                <div className="absolute top-full right-0 mt-2 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
                  {chains.filter(chain => chain.chainId !== payChain.chainId).map((chain) => (
                    <button
                      key={chain.chainId}
                      onClick={() => {
                        setReceiveChain(chain);
                        setShowReceiveChains(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                        chain.chainId === receiveChain.chainId
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700/50'
                      }`}
                    >
                      {chain.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="relative">
              {receiveToken ? (
                <button
                  onClick={() => setShowReceiveTokens(!showReceiveTokens)}
                  className="flex items-center space-x-3 bg-gray-700/50 hover:bg-gray-700 px-4 py-3 rounded-lg transition-colors"
                >
                  <span className="text-2xl">{receiveToken.icon}</span>
                  <div className="text-left">
                    <div className="text-white font-semibold text-lg">{receiveToken.symbol}</div>
                    <div className="text-gray-400 text-sm">on {receiveChain.name}</div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </button>
              ) : (
                <button
                  onClick={() => setShowReceiveTokens(!showReceiveTokens)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg transition-colors flex items-center space-x-2 text-base font-medium"
                >
                  <span>Select a token</span>
                  <ChevronDown className="w-5 h-5" />
                </button>
              )}
              
              {showReceiveTokens && (
                <div className="absolute top-full mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10">
                  {availableReceiveTokens.map((token) => (
                    <button
                      key={`${token.symbol}-${token.chainId}`}
                      onClick={() => {
                        setReceiveToken(token);
                        setShowReceiveTokens(false);
                        setIsQuoted(false); // Reset quote when token changes
                        setQuote(null);
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-700/50 transition-colors"
                    >
                      <span className="text-xl">{token.icon}</span>
                      <div className="text-left">
                        <div className="text-white text-base font-medium">{token.symbol}</div>
                        <div className="text-gray-400 text-sm">{token.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="text-right">
              <div className="text-white text-3xl font-medium">{receiveAmount}</div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="space-y-3">
          <button
            onClick={isQuoted ? handleSwap : handleGetQuote}
            disabled={!payAmount || !receiveToken || isLoadingQuote || isProcessingSwap}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold text-lg transition-colors flex items-center justify-center space-x-2"
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

export default SwapInterface;