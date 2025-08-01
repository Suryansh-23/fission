import React, { useState } from 'react';
import { ChevronDown, Menu, X, BarChart3, ArrowLeftRight, Link } from 'lucide-react';
import WalletConnect from './WalletConnect';
import EVMWalletConnect from './EVMWalletConnect';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTradeMenuOpen, setIsTradeMenuOpen] = useState(false);

  return (
    <header className="w-full bg-[#0B1426] border-b border-gray-800/50 relative flex-shrink-0">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">F</span>
              </div>
              <span className="text-white text-xl font-semibold">Fission</span>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
              <div className="relative">
                <button 
                  className="text-gray-300 hover:text-white transition-colors flex items-center space-x-1"
                  onMouseEnter={() => setIsTradeMenuOpen(true)}
                  onMouseLeave={() => setIsTradeMenuOpen(false)}
                >
                  <span>Trade</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                
                {/* Trade Dropdown */}
                {isTradeMenuOpen && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50"
                    onMouseEnter={() => setIsTradeMenuOpen(true)}
                    onMouseLeave={() => setIsTradeMenuOpen(false)}
                  >
                    <div className="p-2">
                      <a href="#" className="flex items-center space-x-3 px-3 py-2 hover:bg-gray-700/50 rounded-lg transition-colors text-gray-300 hover:text-white">
                        <ArrowLeftRight className="w-4 h-4" />
                        <span>Swap</span>
                      </a>
                      <a href="#" className="flex items-center space-x-3 px-3 py-2 hover:bg-gray-700/50 rounded-lg transition-colors text-gray-300 hover:text-white">
                        <Link className="w-4 h-4" />
                        <span>Bridge</span>
                      </a>
                      <a href="#" className="flex items-center space-x-3 px-3 py-2 hover:bg-gray-700/50 rounded-lg transition-colors text-gray-300 hover:text-white">
                        <BarChart3 className="w-4 h-4" />
                        <span>Analytics</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
              
              <a href="#" className="text-gray-300 hover:text-white transition-colors">
                Pools
              </a>
              <a href="#" className="text-gray-300 hover:text-white transition-colors">
                Analytics
              </a>
              <a href="#" className="text-gray-300 hover:text-white transition-colors">
                Docs
              </a>
            </nav>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-3">
            {/* Desktop Wallet Buttons */}
            <div className="hidden md:flex items-center space-x-3">
              <WalletConnect />
              <EVMWalletConnect />
            </div>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden text-gray-300 hover:text-white transition-colors"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-3 pb-3 border-t border-gray-800/50 pt-3">
            <div className="space-y-3">
              <div className="space-y-1">
                <a href="#" className="block text-gray-300 hover:text-white transition-colors">Swap</a>
                <a href="#" className="block text-gray-300 hover:text-white transition-colors">Bridge</a>
                <a href="#" className="block text-gray-300 hover:text-white transition-colors">Pools</a>
                <a href="#" className="block text-gray-300 hover:text-white transition-colors">Analytics</a>
                <a href="#" className="block text-gray-300 hover:text-white transition-colors">Docs</a>
              </div>
              
              {/* Mobile Wallet Buttons */}
              <div className="space-y-2 pt-3 border-t border-gray-800/50">
                <WalletConnect />
                <EVMWalletConnect />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;