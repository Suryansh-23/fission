import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import WalletConnect from './WalletConnect';
import EVMWalletConnect from './EVMWalletConnect';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="w-full bg-[#0B1426] border-b border-gray-800/50 relative flex-shrink-0">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <img
              src="/8d9ae74ad7d5cde26bb553b7b603dca4.jpg"
              alt="Fission Logo"
              className="w-8 h-8 rounded-lg object-cover"
            />
            <span className="text-white text-xl font-semibold">Fission</span>
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
              {/* Mobile Wallet Buttons */}
              <div className="space-y-2">
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