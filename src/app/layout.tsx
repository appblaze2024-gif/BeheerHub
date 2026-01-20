'use client';

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  FirebaseClientProvider,
  useUser,
  useAuth,
} from '@/firebase';
import { ProfileProvider, useProfile } from '@/firebase/profile-provider';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { NavigationUIProvider, useNavigationUI } from '@/context/navigation-ui-context';
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
  const auth = useAuth();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { isHeaderVisible } = useNavigationUI();
  
  const handleLogout = async () => {
    if(auth) {
      await signOut(auth);
    }
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
        <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b border-border px-6 shadow-sm z-30">
            <Link href="/" className="mr-4 flex items-center">
              <Image
                src="https://i.ibb.co/b54NVfJm/Whats-App-Image-2026-01-20-at-08-32-27-removebg-preview.png"
                alt="BeheerHub Logo"
                width={120}
                height={30}
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
  const searchParams = useSearchParams();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');

  // This handles the case where the password reset link from the email incorrectly points to any page other than the reset page.
  const isPasswordResetFlow = mode === 'resetPassword' && oobCode;

  useEffect(() => {
    if (isPasswordResetFlow && pathname !== '/reset-password') {
      router.replace(`/reset-password?${searchParams.toString()}`);
    }
  }, [isPasswordResetFlow, pathname, router, searchParams]);

  const isPublicPage = pathname === '/login' || pathname.startsWith('/reset-password');

  useEffect(() => {
    // Don't run auth checks until client is mounted, auth is resolved, and we're not in a password reset flow.
    if (!isMounted || isUserLoading || isPasswordResetFlow) {
      return;
    }

    if (!user && !isPublicPage) {
      router.push('/login');
    } else if (user && pathname === '/login') {
      router.push('/');
    }
  }, [user, isUserLoading, pathname, router, isPublicPage, isMounted, isPasswordResetFlow]);

  if (!isMounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        Laden...
      </div>
    );
  }

  // While redirecting for password reset, show a loading indicator.
  if (isPasswordResetFlow && pathname !== '/reset-password') {
    return <div className="flex h-screen items-center justify-center">Een ogenblik geduld...</div>;
  }
  
  if (isUserLoading && !isPublicPage) {
     return (
      <div className="flex h-screen items-center justify-center">
        Laden...
      </div>
    );
  }
  
  if (!user && !isPublicPage) {
    // This check is important, but we must make sure we don't block the reset flow
    if (isPasswordResetFlow) {
        return <>{children}</>;
    }
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

function AppLayoutFallback() {
    return <div className="flex h-screen items-center justify-center">Laden...</div>;
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
              <Suspense fallback={<AppLayoutFallback />}>
                <AppLayout>{children}</AppLayout>
              </Suspense>
            </NavigationUIProvider>
          </ProfileProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
