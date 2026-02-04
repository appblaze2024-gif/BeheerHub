'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage';

// Define a type for the global object to avoid TypeScript errors
declare global {
  // eslint-disable-next-line no-var
  var __firebase_services__: ReturnType<typeof getSdks> | undefined;
}

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  // In a client component context (due to 'use client'), `window` is available.
  // We use a global singleton to ensure Firebase services are initialized only once
  // and survive Hot Module Replacement (HMR) during development.
  if (!globalThis.__firebase_services__) {
    let firebaseApp;
    // Check if a Firebase app has already been initialized
    if (!getApps().length) {
      try {
        // Firebase App Hosting provides config via environment variables.
        // Attempt to initialize without an explicit config object.
        firebaseApp = initializeApp();
      } catch (e) {
        // Fallback to the local config file if auto-initialization fails.
        // This is the expected path for local development.
        firebaseApp = initializeApp(firebaseConfig);
      }
    } else {
      // If an app is already initialized, use it.
      firebaseApp = getApp();
    }
    globalThis.__firebase_services__ = getSdks(firebaseApp);
  }

  return globalThis.__firebase_services__;
}


export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
    storage: getStorage(firebaseApp)
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './firestore/use-memo-firebase';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
