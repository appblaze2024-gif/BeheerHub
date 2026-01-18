'use client';

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Sidebar, SidebarProps } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/sidebar-nav';
import { SidebarHeader, SidebarFooter } from '@/components/ui/sidebar';
import {
  FirebaseClientProvider,
  useUser,
  useFirestore,
  useDoc,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
} from '@/firebase';
import { ProfileProvider } from '@/firebase/profile-provider';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelRightClose } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { doc } from 'firebase/firestore';
import { useIsMobile } from '@/hooks/use-mobile';

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const pathname = usePathname();
  const router = useRouter();
  const isTablet = useIsMobile(1024);

  const userProfileRef = useMemo(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<{
    sidebarCollapsed?: boolean;
  }>(userProfileRef);

  const [isCollapsed, setIsCollapsed] = useState<boolean | undefined>(
    undefined
  );

  // Set initial collapsed state from user profile or device size
  useEffect(() => {
    if (isUserLoading || isProfileLoading) {
      return; // Wait for all data to be loaded
    }

    if (userProfile?.sidebarCollapsed !== undefined) {
      setIsCollapsed(userProfile.sidebarCollapsed);
    } else {
      // Fallback for new users or users without the setting
      setIsCollapsed(true); // Default to collapsed
    }
  }, [userProfile, isUserLoading, isProfileLoading]);

  // Create user profile document if it doesn't exist
  useEffect(() => {
    const createProfile = async () => {
      if (
        user &&
        !isProfileLoading &&
        !userProfile &&
        userProfileRef
      ) {
        const initialProfile = {
          id: user.uid,
          email: user.email,
          sidebarCollapsed: true,
        };
        await setDocumentNonBlocking(userProfileRef, initialProfile, { merge: true });
      }
    };
    createProfile();
  }, [user, userProfile, isProfileLoading, userProfileRef]);

  useEffect(() => {
    if (isUserLoading) return; // Wait until user status is known

    const publicPaths = ['/login', '/reset-password'];
    const isPublicPage = publicPaths.includes(pathname);

    if (!user && !isPublicPage) {
      router.push('/login');
    } else if (user && pathname === '/login') {
      router.push('/');
    }
  }, [user, isUserLoading, pathname, router]);

  const handleToggleCollapse = () => {
    if (isCollapsed === undefined) return; // Don't allow toggle while loading
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);
    if (userProfileRef) {
      updateDocumentNonBlocking(userProfileRef, {
        sidebarCollapsed: newCollapsedState,
      });
    }
  };

  if (isUserLoading || isCollapsed === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        Laden...
      </div>
    );
  }

  const publicPaths = ['/login', '/reset-password'];
  if (publicPaths.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className={cn('font-body antialiased flex h-svh overflow-hidden')}>
      <Sidebar isCollapsed={isCollapsed}>
        <SidebarHeader isCollapsed={isCollapsed}>
          <Link href="/" className={cn(isCollapsed ? 'hidden' : 'block')}>
            <Image
              src="https://i.ibb.co/Fk1pVzqw/IMG-1314.png"
              alt="BeheerHub Logo"
              width={300}
              height={100}
              className="w-auto h-auto"
            />
          </Link>
          <Link href="/" className={cn(!isCollapsed ? 'hidden' : 'block')}>
            <Image
              src="https://i.ibb.co/fVxCTj33/Whats-App-Image-2026-01-16-at-12-09-08-1-removebg-preview.png"
              alt="BeheerHub Ingevouwen Logo"
              width={40}
              height={40}
            />
          </Link>
        </SidebarHeader>
        <SidebarNav isCollapsed={isCollapsed} />
        <SidebarFooter isCollapsed={isCollapsed}>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={handleToggleCollapse}
          >
            {isCollapsed ? <PanelRightClose /> : <PanelLeftClose />}
            <span className={cn(isCollapsed && 'hidden')}>Inklappen</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <main className="flex-1 flex flex-col overflow-auto bg-background">
        {children}
      </main>
      <Toaster />
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        <title>BeheerHub</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <FirebaseClientProvider>
          <ProfileProvider>
            <AppLayout>{children}</AppLayout>
          </ProfileProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
