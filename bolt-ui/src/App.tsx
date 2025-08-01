import React from 'react';
import Header from './components/Header';
import SwapInterface from './components/SwapInterface';
import Footer from './components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1426] via-[#1a2332] to-[#0B1426] flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <SwapInterface />
      </main>
      <Footer />
    </div>
  );
}

export default App;