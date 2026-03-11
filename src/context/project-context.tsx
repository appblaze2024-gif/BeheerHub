'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useRef } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, collection, orderBy, query } from 'firebase/firestore';
import type { Project } from '@/lib/types';

interface ProjectContextType {
  selectedProjectId: string | null;
  setSelectedProjectId: (projectId: string | null) => void;
  projects: Project[] | null;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const firestore = useFirestore();

  // Fetch projects ONLY when user is authenticated
  const projectsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'projects'), orderBy('projectnaam', 'asc'));
  }, [firestore, user]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);

  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const isInitialProjectSetRef = useRef(false);

  useEffect(() => {
    const fetchInitialSelection = async () => {
        if (!user || !firestore || isInitialProjectSetRef.current) return;
        const savedId = localStorage.getItem('lastSelectedProjectId');
        if (savedId) {
            setSelectedProjectIdState(savedId);
        }
        isInitialProjectSetRef.current = true;
    };
    fetchInitialSelection();
  }, [user, firestore]);

  const handleSetSelectedProjectId = (projectId: string | null) => {
    setSelectedProjectIdState(projectId);
    if (projectId) {
        localStorage.setItem('lastSelectedProjectId', projectId);
    } else {
        localStorage.removeItem('lastSelectedProjectId');
    }
    if (user && firestore) {
      const userRef = doc(firestore, 'users', user.uid);
      setDocumentNonBlocking(userRef, { lastSelectedProjectId: projectId || null }, { merge: true });
    }
  };

  const value = useMemo(() => ({
    selectedProjectId,
    setSelectedProjectId: handleSetSelectedProjectId,
    projects,
    isLoading: isLoadingProjects,
  }), [selectedProjectId, projects, isLoadingProjects]);

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
