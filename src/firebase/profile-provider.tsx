'use client';

import { useUser, useDoc, useFirestore, updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import React, { createContext, useContext, ReactNode, useMemo, useEffect } from 'react';
import type { UserProfile } from '@/lib/types';
import { getDefaultPermissions } from '@/lib/permissions';

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

  // This effect now safely creates a user profile only if it truly doesn't exist,
  // preventing race conditions during first login.
  useEffect(() => {
    const createProfile = async () => {
      if (
        user &&
        !isProfileLoading &&
        !profile && // `profile` from useDoc is null, indicating it might not exist
        userProfileRef
      ) {
        // To prevent a race condition, we perform a direct `get` from the server to be certain.
        const docSnap = await getDocFromServer(userProfileRef);
        if (!docSnap.exists()) {
          // The document genuinely does not exist, so we can create it.
          const initialProfile: UserProfile = {
            id: user.uid,
            email: user.email,
            role: 'medewerkers',
            permissions: getDefaultPermissions(),
            status: 'Actief'
          };
          // Use `set` without merge, as we are creating a new document.
          await setDocumentNonBlocking(userProfileRef, initialProfile, {});
        }
        // If the document *does* exist, we do nothing. `useDoc` will eventually
        // receive the data and update the `profile` state.
      }
    };
    createProfile();
  }, [user, profile, isProfileLoading, userProfileRef, firestore]);


  // Grant Super Admin role to a specific user
  useEffect(() => {
    const grantAdminRole = async () => {
      // Check if this is the target user and they are not already an admin
      if (user && profile && user.email === 'dstoutenburg@meerlanden.nl' && profile.role !== 'Super admin' && userProfileRef) {
        
        const adminPermissions = getDefaultPermissions();
        // Grant all permissions
        Object.keys(adminPermissions).forEach(module => {
            Object.keys(adminPermissions[module]).forEach(action => {
              (adminPermissions as any)[module][action] = true;
            });
        });

        try {
          await updateDocumentNonBlocking(userProfileRef, { 
            role: 'Super admin',
            permissions: adminPermissions
          });
        } catch (error) {
            console.error("Failed to grant admin role:", error);
        }
      }
    };

    if (!isProfileLoading && !isUserLoading) {
      grantAdminRole();
    }
  }, [user, profile, isProfileLoading, isUserLoading, userProfileRef]);


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
