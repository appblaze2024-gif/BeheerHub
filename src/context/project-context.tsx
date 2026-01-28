'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useRef } from 'react';
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
  const isInitialProjectSetRef = useRef(false);

  useEffect(() => {
    // Only run if the profile is loaded, and we haven't set the initial project ID yet.
    if (profile && !isInitialProjectSetRef.current) {
      if (profile.lastSelectedProjectId) {
        setSelectedProjectIdState(profile.lastSelectedProjectId);
      }
      // Mark that we have set the initial project.
      isInitialProjectSetRef.current = true;
    }
  }, [profile]); // Depend only on the profile object.

  const handleSetSelectedProjectId = (projectId: string | null) => {
    setSelectedProjectIdState(projectId);
    if (user && firestore) {
      const userProfileRef = doc(firestore, 'users', user.uid);
      setDocumentNonBlocking(userProfileRef, { lastSelectedProjectId: projectId || null }, { merge: true });
    }
  };

  // The context is "loading" if the profile is still loading and we haven't had a chance to set the project from it.
  const isLoading = isProfileLoading && !isInitialProjectSetRef.current;

  const value = useMemo(() => ({
    selectedProjectId,
    setSelectedProjectId: handleSetSelectedProjectId,
    isLoading,
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
