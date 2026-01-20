'use client';

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  FirebaseClientProvider,
  useUser,
  useFirestore,
  useDoc,
  setDocumentNonBlocking,
  useAuth,
} from '@/firebase';
import { ProfileProvider, useProfile } from '@/firebase/profile-provider';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { doc } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { NavigationUIProvider, useNavigationUI } from '@/context/navigation-ui-context';
import { getDefaultPermissions } from '@/lib/permissions';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, Settings, ChevronDown } from 'lucide-react';


function ProtectedAppLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const auth = useAuth();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { isHeaderVisible } = useNavigationUI();

  const userProfileRef = useMemo(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile } = useDoc<UserProfile>(userProfileRef);

  // Create user profile document if it doesn't exist
  useEffect(() => {
    const createProfile = async () => {
      if (
        user &&
        !isProfileLoading &&
        !userProfile &&
        userProfileRef
      ) {
        const initialProfile: UserProfile = {
          id: user.uid,
          email: user.email,
          role: 'medewerkers',
          permissions: getDefaultPermissions(),
          status: 'Actief'
        };
        await setDocumentNonBlocking(userProfileRef, initialProfile, { merge: true });
      }
    };
    createProfile();
  }, [user, userProfile, isProfileLoading, userProfileRef, firestore]);
  
  const handleLogout = async () => {
    await signOut(auth);
  };
  
  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };
  
  if (isUserLoading || isProfileLoading) {
      return (
        <div className="flex h-screen items-center justify-center">
          Laden...
        </div>
      );
  }

  return (
    <div className={cn('font-body antialiased flex flex-col h-svh overflow-hidden')}>
      {isHeaderVisible && (
        <header className="bg-background flex h-16 shrink-0 items-center justify-between border-b border-border px-6 shadow-sm z-30">
            <Link href="/" className="mr-4 flex items-center">
              <Image
                src="https://i.ibb.co/XxdPbvks/Whats-App-Image-2026-01-20-at-08-32-27.jpg"
                alt="BeheerHub Logo"
                width={100}
                height={25}
              />
            </Link>
            
            <div className="flex items-center gap-4">
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user?.photoURL || undefined} />
                          <AvatarFallback>{getInitials(profile?.firstName, profile?.lastName)}</AvatarFallback>
                        </Avatar>
                        <span className="hidden md:inline">{profile?.displayName || profile?.email}</span>
                        <ChevronDown className="h-4 w-4 hidden md:inline" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Mijn Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <Link href="/profile" passHref><DropdownMenuItem>Profiel</DropdownMenuItem></Link>
                    <Link href="/settings" passHref><DropdownMenuItem>Instellingen</DropdownMenuItem></Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Uitloggen</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
            </div>
        </header>
      )}
      <main className="flex-1 flex flex-col overflow-auto bg-background">
        {children}
      </main>
      <Toaster />
    </div>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const publicPaths = ['/login', '/reset-password'];
  const isPublicPage = publicPaths.includes(pathname);

  useEffect(() => {
    // Return early if not mounted or auth is loading, to prevent premature redirects
    if (!isMounted || isUserLoading) return;

    if (!user && !isPublicPage) {
      router.push('/login');
    } else if (user && pathname === '/login') {
      router.push('/');
    }
  }, [user, isUserLoading, pathname, router, isPublicPage, isMounted]);

  // During server-side rendering and before the component mounts on the client,
  // we cannot reliably use client-side hooks like usePathname or check auth state.
  // Rendering a consistent, static loading state for all pages initially prevents hydration errors.
  if (!isMounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        Laden...
      </div>
    );
  }

  if (isUserLoading && !isPublicPage) {
     return (
      <div className="flex h-screen items-center justify-center">
        Laden...
      </div>
    );
  }
  
  if (!user && !isPublicPage) {
    return (
       <div className="flex h-screen items-center justify-center">
        Laden...
      </div>
    )
  }

  if (isPublicPage) {
    return <>{children}</>;
  }

  return <ProtectedAppLayout>{children}</ProtectedAppLayout>;
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
            <NavigationUIProvider>
              <AppLayout>{children}</AppLayout>
            </NavigationUIProvider>
          </ProfileProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
