import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-[#0B1426] border-t border-gray-800/50 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-gray-400 text-sm">
            © 2025 1inch
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-gray-400 text-sm">23047914</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;