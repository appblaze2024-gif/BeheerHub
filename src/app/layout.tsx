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
import { useEffect, useState, Suspense, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { NavigationUIProvider, useNavigationUI } from '@/context/navigation-ui-context';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { Menu, Search, Bell, User, Settings } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';


function Header() {
  const auth = useAuth();
  const { user } = useUser();
  const { profile } = useProfile();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  return (
    <header className="bg-background flex h-16 shrink-0 items-center justify-between border-b border-border px-4 md:px-6 shadow-sm z-10">
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-80">
            <SheetHeader>
                <SheetTitle className="sr-only">Zijmenu</SheetTitle>
            </SheetHeader>
            <AppSidebar />
          </SheetContent>
        </Sheet>
        {isSearchOpen ? (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Zoeken..."
              className="pl-9"
              autoFocus
              onBlur={() => setIsSearchOpen(false)}
            />
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setIsSearchOpen(true)}>
            <Search className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.photoURL || undefined} alt={profile?.displayName || ''} />
                <AvatarFallback>
                  {getInitials(profile?.firstName, profile?.lastName)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{profile?.displayName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    <span>Mijn Profiel</span>
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Instellingen</span>
                </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut(auth)}>
              Log uit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
