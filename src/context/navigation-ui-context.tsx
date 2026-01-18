'use client';

import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';

interface NavigationUIContextType {
  isHeaderVisible: boolean;
  setIsHeaderVisible: Dispatch<SetStateAction<boolean>>;
}

const NavigationUIContext = createContext<NavigationUIContextType | undefined>(undefined);

export function NavigationUIProvider({ children }: { children: ReactNode }) {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  
  const value = { isHeaderVisible, setIsHeaderVisible };

  return (
    <NavigationUIContext.Provider value={value}>
      {children}
    </NavigationUIContext.Provider>
  );
}

export function useNavigationUI() {
  const context = useContext(NavigationUIContext);
  if (context === undefined) {
    throw new Error('useNavigationUI must be used within a NavigationUIProvider');
  }
  return context;
}
