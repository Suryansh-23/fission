import React from 'react';
import WalletConnect from './WalletConnect';

const Header: React.FC = () => {
  return (
    <header className="w-full bg-[#0B1426] border-b border-gray-800/50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">F</span>
              </div>
              <span className="text-white text-xl font-semibold">Fission</span>
            </div>
            
            <nav className="flex items-center space-x-6">
              <button className="text-gray-300 hover:text-white transition-colors flex items-center space-x-1">
                <span>Trade</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </nav>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center">
            <WalletConnect />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;