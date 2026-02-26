'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface GlobalLoadingContextType {
  isProcessing: boolean;
  setIsProcessing: (isLoading: boolean) => void;
  startProcessing: (duration?: number) => void;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextType | undefined>(undefined);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false);

  const startProcessing = useCallback((duration: number = 800) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
    }, duration);
  }, []);

  return (
    <GlobalLoadingContext.Provider value={{ isProcessing, setIsProcessing, startProcessing }}>
      {children}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);
  if (context === undefined) {
    throw new Error('useGlobalLoading must be used within a GlobalLoadingProvider');
  }
  return context;
}
