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

  const [isCollapsed, setIsCollapsed] = useState(false);

  // Set initial collapsed state from user profile or device size
  useEffect(() => {
    if (userProfile?.sidebarCollapsed !== undefined) {
      setIsCollapsed(userProfile.sidebarCollapsed);
    } else if (isTablet !== undefined) {
      setIsCollapsed(isTablet);
    }
  }, [userProfile, isTablet]);

  // Create user profile document if it doesn't exist
  useEffect(() => {
    if (
      user &&
      !isProfileLoading &&
      !userProfile &&
      userProfileRef &&
      isTablet !== undefined
    ) {
      const initialProfile = {
        id: user.uid,
        email: user.email,
        displayName: user.displayName,
        sidebarCollapsed: isTablet,
      };
      // Use setDoc with merge to avoid overwriting if it's created between check and set
      setDocumentNonBlocking(userProfileRef, initialProfile, { merge: true });
    }
  }, [user, userProfile, isProfileLoading, userProfileRef, isTablet]);

  useEffect(() => {
    if (isUserLoading) return; // Wacht tot de gebruikerstatus bekend is

    const isAuthPage = pathname === '/login';

    if (!user && !isAuthPage) {
      router.push('/login');
    } else if (user && isAuthPage) {
      router.push('/');
    }
  }, [user, isUserLoading, pathname, router]);

  const handleToggleCollapse = () => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);
    if (userProfileRef) {
      updateDocumentNonBlocking(userProfileRef, {
        sidebarCollapsed: newCollapsedState,
      });
    }
  };

  if (isUserLoading || (user && isProfileLoading) || isTablet === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        Laden...
      </div>
    );
  }

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className={cn('font-body antialiased flex h-svh overflow-hidden')}>
      <Sidebar isCollapsed={isCollapsed}>
        <SidebarHeader isCollapsed={isCollapsed}>
          <Link href="/" className={cn(isCollapsed ? 'hidden' : 'block')}>
            <Image
              src="https://i.ibb.co/Fk1pVzqw/IMG-1314.png"
              alt="Logo"
              width={300}
              height={100}
              className="w-auto h-auto"
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
          <AppLayout>{children}</AppLayout>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
