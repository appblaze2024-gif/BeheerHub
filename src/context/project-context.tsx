'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
import { useProfile } from '@/firebase/profile-provider';
import { useUser, useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';

interface ProjectContextType {
  selectedProjectId: string | null;
  setSelectedProjectId: (projectId: string | null) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { user } = useUser();
  const firestore = useFirestore();

  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Don't do anything until the profile has finished loading and we haven't initialized.
    if (isProfileLoading || isInitialized) {
      return;
    }
    
    // At this point, `isProfileLoading` is guaranteed to be false.
    // The `profile` object is now in its final initial state (either an object or null).
    // We can now initialize our own state.
    if (profile) {
      setSelectedProjectIdState(profile.lastSelectedProjectId || null);
    } else {
      setSelectedProjectIdState(null);
    }

    // Mark as initialized so this logic doesn't run on subsequent re-renders.
    setIsInitialized(true);

  }, [profile, isProfileLoading, isInitialized]);

  const handleSetSelectedProjectId = (projectId: string | null) => {
    setSelectedProjectIdState(projectId);
    if (user && firestore) {
      const userProfileRef = doc(firestore, 'users', user.uid);
      // Use null to clear the field in firestore
      setDocumentNonBlocking(userProfileRef, { lastSelectedProjectId: projectId || null }, { merge: true });
    }
  };

  const value = useMemo(() => ({
    selectedProjectId, 
    setSelectedProjectId: handleSetSelectedProjectId,
    isLoading: isProfileLoading || !isInitialized,
  }), [selectedProjectId, isProfileLoading, isInitialized]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
