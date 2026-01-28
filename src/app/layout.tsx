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
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Search, Trees, Crosshair, Wifi, Send, ListFilter } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { useIsMobile } from '@/hooks/use-mobile';


function Header() {
    return (
        <header className="bg-background flex h-16 shrink-0 items-center justify-between border-b border-border px-4 shadow-sm z-10">
            <div className="flex items-center gap-1">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Menu className="h-6 w-6" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-80">
                        <AppSidebar />
                    </SheetContent>
                </Sheet>
                <Button variant="ghost" size="icon"><Trees className="h-6 w-6" /></Button>
                <Button variant="ghost" size="icon"><Crosshair className="h-6 w-6" /></Button>
                <Button variant="ghost" size="icon"><Search className="h-6 w-6" /></Button>
            </div>
            <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon"><Wifi className="h-6 w-6" /></Button>
                <Button variant="ghost" size="icon"><Send className="h-6 w-6" /></Button>
                <Button variant="ghost" size="icon"><ListFilter className="h-6 w-6" /></Button>
            </div>
        </header>
    );
}


function ProtectedAppLayout({ children }: { children: React.ReactNode }) {
  const { isHeaderVisible } = useNavigationUI();
  const { isUserLoading } = useUser();
  const { isLoading: isProfileLoading } = useProfile();
  
  if (isUserLoading || isProfileLoading) {
      return (
        <div className="flex h-screen items-center justify-center">
          Laden...
        </div>
      );
  }

  return (
    <div className={cn('font-body antialiased flex flex-col h-svh overflow-hidden')}>
      {isHeaderVisible && <Header />}
      <main className="flex-1 flex flex-col overflow-auto bg-gray-100 dark:bg-gray-900">
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
