import React from 'react';
import { Github, Twitter, ExternalLink } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-[#0B1426] border-t border-gray-800/50 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">F</span>
              </div>
              <span className="text-white text-xl font-semibold">Fission</span>
            </div>
            <p className="text-gray-400 text-sm mb-4 max-w-md">
              The most efficient cross-chain DEX aggregator. Swap tokens seamlessly across Sui and EVM chains with the best rates and minimal slippage.
            </p>
            <div className="flex items-center space-x-4">
              <a 
                href="#" 
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="GitHub"
              >
                <Github className="w-5 h-5" />
              </a>
              <a 
                href="#" 
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a 
                href="#" 
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Documentation"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Network Status */}
          <div className="flex flex-col justify-center">
            <h3 className="text-white font-semibold mb-4">Network Status</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-gray-400 text-sm">Sui Network Active</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-gray-400 text-sm">Ethereum Network Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 mt-8 border-t border-gray-800/50">
          <div className="text-gray-400 text-sm mb-4 md:mb-0">
            © 2025 Fission DEX. All rights reserved.
          </div>
          <div className="text-gray-400 text-sm">
            Cross-chain swaps powered by 1inch Fusion
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;