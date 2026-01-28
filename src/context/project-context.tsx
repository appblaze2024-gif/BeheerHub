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
  const [initialProjectSet, setInitialProjectSet] = useState(false);

  useEffect(() => {
    // Only set the initial project ID if the profile is loaded and we haven't set it yet.
    if (!isProfileLoading && profile && !initialProjectSet) {
      setSelectedProjectIdState(profile.lastSelectedProjectId || null);
      setInitialProjectSet(true); // Mark as set
    }
     // If profile loading is done, but there's no profile, we can also mark as initialized.
    if (!isProfileLoading && !profile && !initialProjectSet) {
      setInitialProjectSet(true);
    }
  }, [isProfileLoading, profile, initialProjectSet]);

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
    isLoading: isProfileLoading || !initialProjectSet,
  }), [selectedProjectId, isProfileLoading, initialProjectSet]);

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
