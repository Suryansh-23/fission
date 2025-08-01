import React, { useState } from 'react';
import { ChevronDown, ArrowUpDown, Settings } from 'lucide-react';

interface Token {
  symbol: string;
  name: string;
  icon: string;
  balance?: string;
}

interface Chain {
  name: string;
  symbol: string;
}

const tokens: Token[] = [
  { symbol: 'ETH', name: 'Ether', icon: '🔵', balance: '~$53,439' },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', icon: '🟠', balance: '~$45,000' },
  { symbol: 'USDC', name: 'USD Coin', icon: '🔷', balance: '~$1,000' },
];

const chains: Chain[] = [
  { name: 'Ethereum', symbol: 'ETH' },
  { name: 'Sui', symbol: 'SUI' },
];

const SwapInterface: React.FC = () => {
  const [payToken, setPayToken] = useState<Token>(tokens[0]);
  const [receiveToken, setReceiveToken] = useState<Token | null>(null);
  const [payChain, setPayChain] = useState<Chain>(chains[0]);
  const [receiveChain, setReceiveChain] = useState<Chain>(chains[1]);
  const [payAmount, setPayAmount] = useState<string>('');
  const [receiveAmount, setReceiveAmount] = useState<string>('0');
  const [isQuoted, setIsQuoted] = useState<boolean>(false);
  const [singleFill, setSingleFill] = useState<boolean>(true);
  const [showPayTokens, setShowPayTokens] = useState<boolean>(false);
  const [showReceiveTokens, setShowReceiveTokens] = useState<boolean>(false);
  const [slippage, setSlippage] = useState<string>('0.5');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const handleGetQuote = () => {
    if (payAmount && receiveToken) {
      // Simulate quote calculation
      const mockReceiveAmount = (parseFloat(payAmount) * 0.998).toFixed(4);
      setReceiveAmount(mockReceiveAmount);
      setIsQuoted(true);
    }
  };

  const handleSwap = () => {
    console.log('Executing swap...');
    // Reset to initial state after swap
    setIsQuoted(false);
    setPayAmount('');
    setReceiveAmount('0');
  };

  const switchTokens = () => {
    const tempToken = payToken;
    const tempChain = payChain;
    setPayToken(receiveToken || tokens[1]);
    setReceiveToken(tempToken);
    setPayChain(receiveChain);
    setReceiveChain(tempChain);
    setIsQuoted(false);
    setReceiveAmount('0');
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
            <span className="text-gray-400 text-base">Chain: {payChain.name}</span>
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
                  {tokens.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => {
                        setPayToken(token);
                        setShowPayTokens(false);
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
              <div className="text-gray-400 text-base">{payToken.balance}</div>
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
            <span className="text-gray-400 text-base">Chain: {receiveChain.name}</span>
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
                  {tokens.filter(token => token.symbol !== payToken.symbol).map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => {
                        setReceiveToken(token);
                        setShowReceiveTokens(false);
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
            disabled={!payAmount || !receiveToken}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold text-lg transition-colors"
          >
            {isQuoted ? 'Confirm Swap' : 'Get Quote'}
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