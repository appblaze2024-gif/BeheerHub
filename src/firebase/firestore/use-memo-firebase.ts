'use client';

import { useMemo, DependencyList } from 'react';

/**
 * A utility hook to memoize Firestore references or queries.
 * It adds a internal flag that hooks like useCollection and useDoc 
 * use to verify that the reference is stable, preventing infinite loops.
 */
export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedValue = useMemo(factory, deps);
  
  if (memoizedValue && typeof memoizedValue === 'object') {
    (memoizedValue as any).__memo = true;
  }
  
  return memoizedValue;
}
