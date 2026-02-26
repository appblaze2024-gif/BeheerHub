'use client';

import React from 'react';
import { Cpu } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
  className?: string;
}

export function LoadingScreen({ message = "BeheerHub Intel Link...", className }: LoadingScreenProps) {
  return (
    <div className={`flex h-full w-full items-center justify-center bg-white/40 backdrop-blur-3xl ${className}`}>
      <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-1000">
        <div className="relative">
          <div className="h-24 w-24 border-2 border-primary/10 rounded-[2.5rem] animate-spin duration-[3000ms]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-primary/5 p-4 rounded-2xl animate-pulse">
              <Cpu className="h-8 w-8 text-primary shadow-[0_0_20px_rgba(37,99,235,0.2)]" />
            </div>
          </div>
          <div className="absolute -top-2 -right-2 h-4 w-4 bg-primary rounded-full animate-glow" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-900 animate-pulse">{message}</p>
          <div className="h-1 w-48 bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-primary animate-loading-bar rounded-full" />
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes loading-bar {
          0% { width: 0%; transform: translateX(-100%); }
          50% { width: 100%; transform: translateX(0%); }
          100% { width: 0%; transform: translateX(100%); }
        }
        .animate-loading-bar {
          animation: loading-bar 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}