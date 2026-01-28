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
  // This flag ensures we only set the initial project ID once.
  const [isInitialProjectLoaded, setIsInitialProjectLoaded] = useState(false);

  useEffect(() => {
    // Wait until the profile is fully loaded and we haven't loaded the initial project yet.
    if (!isProfileLoading && !isInitialProjectLoaded) {
      if (profile && profile.lastSelectedProjectId) {
        setSelectedProjectIdState(profile.lastSelectedProjectId);
      }
      // Mark that we have attempted to load the initial project.
      // This prevents this effect from running again and overwriting user selections.
      setIsInitialProjectLoaded(true);
    }
  }, [isProfileLoading, profile, isInitialProjectLoaded]);

  const handleSetSelectedProjectId = (projectId: string | null) => {
    setSelectedProjectIdState(projectId);
    if (user && firestore) {
      const userProfileRef = doc(firestore, 'users', user.uid);
      setDocumentNonBlocking(userProfileRef, { lastSelectedProjectId: projectId || null }, { merge: true });
    }
  };

  // The context is considered "loading" until the initial project ID has been loaded from the profile.
  const isLoading = !isInitialProjectLoaded;

  const value = useMemo(() => ({
    selectedProjectId, 
    setSelectedProjectId: handleSetSelectedProjectId,
    isLoading: isLoading,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [selectedProjectId, isLoading]);

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
