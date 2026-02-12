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
import { ProjectProvider, useProject } from '@/context/project-context';
import { signOut } from 'firebase/auth';
import { format, isAfter } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { Menu, Search, Bell, User, Settings, LogOut, ChevronRight } from 'lucide-react';
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
import { LoadingScreen } from '@/components/loading-screen';


function Header() {
  const auth = useAuth();
  const pathname = usePathname();
  const { user } = useUser();
  const { profile } = useProfile();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  /**
   * Universele paginatitel-generator.
   * Vertaalt technische routes naar de standaard BeheerHub stijl.
   */
  const getPageTitle = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return 'Dashboard';
    
    const translations: Record<string, string> = {
      'projects': 'Projecten',
      'bestanden': 'Documenten',
      'employees': 'Personeel',
      'work-planning': 'Werkplanning',
      'vehicles': 'Wagenpark',
      'weekly-reports': 'Weekstaten',
      'issues': 'Meldingen',
      'objects': 'Objecten',
      'spec-reports': 'Bestek',
      'navigation-module': 'Navigatie',
      'iot': 'IoT',
      'mail': 'Mail',
      'profile': 'Mijn Profiel',
      'settings': 'Instellingen',
      'open': 'Openstaand',
      'new': 'Melding maken',
      'portal': 'Portaal',
      'archive': 'Archief'
    };

    const mainKey = parts[0].toLowerCase();
    const main = translations[mainKey] || parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    
    if (parts.length > 1) {
        const subKey = parts[1].toLowerCase();
        const sub = translations[subKey] || parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
        return `${main} > ${sub}`;
    }
    return main;
  };

  return (
    <header className="bg-background flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-8 z-10">
      <div className="flex items-center gap-6">
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:bg-slate-100 rounded-xl">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-none w-80">
            <SheetHeader className="sr-only">
                <SheetTitle>Navigatie Menu</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setIsSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="flex flex-col">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">{getPageTitle()}</h2>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center relative mr-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Snel zoeken..."
              className="pl-9 h-10 w-64 bg-slate-50 border-transparent focus:bg-white focus:border-slate-200 rounded-xl"
            />
        </div>

        <Button variant="ghost" size="icon" className="rounded-xl relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-white" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-xl p-0 hover:bg-slate-50 transition-all">
              <Avatar className="h-10 w-10 rounded-xl border-2 border-white shadow-sm">
                <AvatarImage src={user?.photoURL || undefined} alt={profile?.displayName || ''} />
                <AvatarFallback className="bg-primary text-white font-black text-xs">
                  {getInitials(profile?.firstName, profile?.lastName)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 mt-2 rounded-2xl shadow-xl border-slate-100 p-2" align="end" forceMount>
            <DropdownMenuLabel className="font-normal p-4">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-black leading-none">{profile?.displayName}</p>
                <p className="text-xs font-bold leading-none text-muted-foreground mt-1">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-100" />
            <div className="p-1 space-y-1">
                <DropdownMenuItem asChild className="rounded-xl h-10 font-bold focus:bg-slate-50">
                    <Link href="/profile" className="flex items-center w-full">
                        <User className="mr-3 h-4 w-4 text-primary" />
                        <span>Mijn Profiel</span>
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-xl h-10 font-bold focus:bg-slate-50">
                    <Link href="/settings" className="flex items-center w-full">
                        <Settings className="mr-3 h-4 w-4 text-primary" />
                        <span>Instellingen</span>
                    </Link>
                </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator className="bg-slate-100" />
            <div className="p-1">
                <DropdownMenuItem 
                    onClick={() => {
                        localStorage.removeItem('impersonatedUserProfileId');
                        signOut(auth);
                    }}
                    className="rounded-xl h-10 font-bold text-red-600 focus:bg-red-50 focus:text-red-600"
                >
                    <LogOut className="mr-3 h-4 w-4" />
                    Log uit
                </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}


function ProtectedAppLayout({ children }: { children: React.ReactNode }) {
  const { isHeaderVisible } = useNavigationUI();
  const { isUserLoading } = useUser();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const auth = useAuth();

  // Auto-logout logic for 'medewerkers'
  useEffect(() => {
    if (isProfileLoading || !profile || profile.role !== 'medewerkers' || !profile.urenPerDag) {
      return;
    }

    const dayName = format(new Date(), 'eeee', { locale: nl }).toLowerCase() as keyof typeof profile.urenPerDag;
    const shift = profile.urenPerDag[dayName];

    if (!shift || !shift.eind) {
      return;
    }

    try {
      const [hours, minutes] = shift.eind.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) return;

      const now = new Date();
      const endTimeToday = new Date();
      endTimeToday.setHours(hours, minutes, 0, 0);

      if (now.getTime() > endTimeToday.getTime()) {
        if (auth.currentUser?.metadata.lastSignInTime) {
          const lastLoginTime = new Date(auth.currentUser.metadata.lastSignInTime);
          if (isAfter(lastLoginTime, endTimeToday)) return;
        }
        signOut(auth);
        return;
      }

      const timeUntilLogout = endTimeToday.getTime() - now.getTime();
      const logoutTimer = setTimeout(() => signOut(auth), timeUntilLogout);
      return () => clearTimeout(logoutTimer);
    } catch (e) {
      console.error("Auto-logout error:", e);
    }
  }, [profile, isProfileLoading, auth]);

  if (isUserLoading || isProfileLoading) {
      return <LoadingScreen className="h-screen" />;
  }

  return (
    <div className={cn('font-body antialiased flex flex-col h-svh overflow-hidden')}>
      {isHeaderVisible && <Header />}
      <main className="flex-1 flex flex-col overflow-auto bg-[#F8FAFC]">
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
  useEffect(() => setIsMounted(true), []);

  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');
  const isPasswordResetFlow = mode === 'resetPassword' && oobCode;

  useEffect(() => {
    if (isPasswordResetFlow && pathname !== '/reset-password') {
      router.replace(`/reset-password?${searchParams.toString()}`);
    }
  }, [isPasswordResetFlow, pathname, router, searchParams]);

  const isPublicPage = pathname === '/login' || pathname.startsWith('/reset-password');

  useEffect(() => {
    if (!isMounted || isUserLoading || isPasswordResetFlow) return;
    if (!user && !isPublicPage) router.push('/login');
    else if (user && pathname === '/login') router.push('/');
  }, [user, isUserLoading, pathname, router, isPublicPage, isMounted, isPasswordResetFlow]);

  if (!isMounted) return null;

  if (isPublicPage) return <>{children}</>;

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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <title>BeheerHub | Smart Infra Management</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
      </head>
      <body className="no-scrollbar">
        <FirebaseClientProvider>
          <ProfileProvider>
            <ProjectProvider>
              <NavigationUIProvider>
                <Suspense fallback={null}>
                  <AppLayout>{children}</AppLayout>
                </Suspense>
              </NavigationUIProvider>
            </ProjectProvider>
          </ProfileProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
