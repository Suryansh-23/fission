import React, { useEffect, useState } from 'react';

interface StarBurstProps {
  onAnimationComplete?: () => void;
}

const StarBurst: React.FC<StarBurstProps> = ({ onAnimationComplete }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [particles, setParticles] = useState<Array<{ id: number; delay: number; angle: number; distance: number; scale: number }>>([]);

  useEffect(() => {
    // Generate random particles for explosion effect
    const particleArray = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      delay: Math.random() * 0.5,
      angle: (i * 30) + Math.random() * 20 - 10, // Spread around 360 degrees
      distance: 100 + Math.random() * 150,
      scale: 0.3 + Math.random() * 0.7,
    }));
    setParticles(particleArray);

    // Hide animation after completion
    const timer = setTimeout(() => {
      setIsVisible(false);
      onAnimationComplete?.();
    }, 2000); // Reduced from 3000ms to 2000ms for faster animation

    return () => clearTimeout(timer);
  }, [onAnimationComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden">
      {/* Background overlay with fade effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-purple-900/30 to-blue-900/20 animate-fade-in-out" />
      
      {/* Main star with burst effect */}
      <div className="relative">
        {/* Glowing ring effects - Multiple layers for depth */}
        <div className="absolute inset-0 -inset-12 rounded-full animate-ring-expansion bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 opacity-50 blur-2xl" />
        <div className="absolute inset-0 -inset-8 rounded-full animate-ring-expansion-delayed bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 opacity-30 blur-xl" />
        <div className="absolute inset-0 -inset-4 rounded-full animate-ring-expansion bg-white/40 opacity-60 blur-lg" />
        
        {/* Central star image with zoom and glow */}
        <div className="relative animate-star-burst z-10">
          <img 
            src="/removed-background.png" 
            alt="Star Burst" 
            className="w-40 h-40 object-contain animate-pulse-glow filter drop-shadow-2xl"
          />
        </div>

        {/* Particle explosion effect - 4 directions */}
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute top-1/2 left-1/2 w-3 h-3 pointer-events-none animate-particle-burst"
            style={{
              '--delay': `${particle.delay}s`,
              '--distance': `${particle.distance}px`,
              '--scale': particle.scale,
              animationDelay: `${particle.delay}s`,
              transform: `translate(-50%, -50%) rotate(${particle.angle}deg)`,
            } as React.CSSProperties}
          >
            <div className="w-full h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 rounded-full blur-sm shadow-lg animate-twinkle" />
          </div>
        ))}

        {/* Additional sparkle effects */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`sparkle-${i}`}
            className="absolute animate-sparkle opacity-80"
            style={{
              top: `${20 + Math.random() * 60}%`,
              left: `${20 + Math.random() * 60}%`,
              animationDelay: `${0.5 + Math.random() * 1}s`,
              animationDuration: `${1 + Math.random() * 0.5}s`,
            }}
          >
            <div className="w-2 h-2 bg-white rounded-full animate-twinkle shadow-sm" />
          </div>
        ))}
      </div>

      {/* Shockwave rings - positioned to align with the main star center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-white/70 rounded-full animate-shockwave" />
        <div className="absolute w-4 h-4 border-2 border-yellow-400/50 rounded-full animate-shockwave-delayed" />
        <div className="absolute w-4 h-4 border-2 border-orange-500/40 rounded-full animate-shockwave-delayed-2" />
      </div>

      {/* Light rays effect - positioned relative to star center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`ray-${i}`}
            className="absolute w-1 bg-gradient-to-t from-transparent via-white/60 to-transparent animate-pulse-glow"
            style={{
              height: '250px',
              transform: `rotate(${i * 60}deg)`,
              transformOrigin: 'center center',
              animationDelay: `${i * 0.1}s`,
              animationDuration: '2s',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default StarBurst;
