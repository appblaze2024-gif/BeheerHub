'use client';

import React from 'react';

interface LoadingScreenProps {
  message?: string;
  className?: string;
}

export function LoadingScreen({ message = "BeheerHub Laden...", className }: LoadingScreenProps) {
  return (
    <div className={`flex h-full w-full items-center justify-center bg-slate-50/50 ${className}`}>
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">{message}</p>
      </div>
    </div>
  );
}
