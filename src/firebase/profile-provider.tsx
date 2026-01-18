'use client';

import { useUser, useDoc, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { UserProfile } from '@/lib/types';

interface ProfileContextValue {
  profile: UserProfile | null;
  isLoading: boolean;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userProfileRef = useMemo(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const value: ProfileContextValue = useMemo(() => ({
    profile,
    isLoading: isUserLoading || isProfileLoading,
  }), [profile, isUserLoading, isProfileLoading]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export const useProfile = (): ProfileContextValue => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
