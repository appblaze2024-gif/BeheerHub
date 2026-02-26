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
import { Menu, Search, Bell, User, Settings, LogOut, ChevronRight, LayoutGrid } from 'lucide-react';
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
import { LoadingScreen } from '@/components/loading-screen';
import { NotificationCenter } from '@/components/notification-center';


function Header() {
  const auth = useAuth();
  const pathname = usePathname();
  const { user } = useUser();
  const { profile } = useProfile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  const getPageTitle = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return 'Dashboard';
    
    const translations: Record<string, string> = {
      'projects': 'Projecten',
      'annual-planning': 'Jaarplanning',
      'bestanden': 'Documenten',
      'employees': 'Personeel',
      'work-planning': 'Werkplanning',
      'vehicles': 'Wagenpark',
      'weekly-reports': 'Weekstaten',
      'issues': 'Meldingen',
      'objects': 'Objecten',
      'spec-reports': 'Bestek',
      'navigation-module': 'Navigatie',
      'iot': 'Internet of Things',
      'mail': 'Mail',
      'profile': 'Mijn Profiel',
      'settings': 'Instellingen',
      'portal': 'Portaal',
      'archive': 'Archief'
    };

    const mainKey = parts[0].toLowerCase();
    const main = translations[mainKey] || parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return main;
  };

  return (
    <header className="bg-white/80 backdrop-blur-2xl flex h-20 shrink-0 items-center justify-between border-b px-6 md:px-10 z-40 sticky top-0 transition-all duration-500">
      <div className="flex items-center gap-6">
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:bg-slate-100 rounded-2xl h-12 w-12 text-slate-600 transition-premium">
              <Menu className="h-7 w-7" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-none w-[340px] shadow-2xl">
            <SheetHeader className="sr-only">
                <SheetTitle>Navigatie Menu</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setIsSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="flex flex-col">
            <h2 className="text-sm font-black uppercase tracking-tighter text-slate-900 leading-none">{getPageTitle()}</h2>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center relative mr-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Snel zoeken..."
              className="pl-11 h-12 w-72 bg-slate-50 border-none focus:ring-4 focus:ring-primary/5 rounded-[1.25rem] text-sm font-bold outline-none transition-premium shadow-inner-soft"
            />
        </div>

        <NotificationCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-12 w-12 rounded-2xl p-0 hover:bg-slate-50 transition-premium ml-1">
              <Avatar className="h-10 w-10 rounded-2xl border-4 border-white shadow-xl ring-1 ring-slate-100">
                <AvatarImage src={user?.photoURL || undefined} alt={profile?.displayName || ''} />
                <AvatarFallback className="bg-primary text-white font-black text-[10px]">
                  {getInitials(profile?.firstName, profile?.lastName)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72 mt-4 rounded-[2rem] shadow-2xl border-slate-100 p-3" align="end">
            <DropdownMenuLabel className="font-normal p-5">
              <div className="flex flex-col space-y-1.5">
                <p className="text-base font-black leading-none text-slate-900 uppercase tracking-tight">{profile?.displayName}</p>
                <p className="text-[10px] font-black leading-none text-muted-foreground mt-1 uppercase tracking-widest">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-50" />
            <div className="p-1.5 space-y-1.5">
                <DropdownMenuItem asChild className="rounded-2xl h-12 font-bold focus:bg-slate-50 cursor-pointer">
                    <Link href="/profile" className="flex items-center w-full">
                        <User className="mr-4 h-5 w-5 text-primary" />
                        <span>Mijn Profiel</span>
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-2xl h-12 font-bold focus:bg-slate-50 cursor-pointer">
                    <Link href="/settings" className="flex items-center w-full">
                        <Settings className="mr-4 h-5 w-5 text-primary" />
                        <span>Instellingen</span>
                    </Link>
                </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator className="bg-slate-50" />
            <div className="p-1.5">
                <DropdownMenuItem 
                    onClick={() => {
                        localStorage.removeItem('impersonatedUserProfileId');
                        signOut(auth);
                    }}
                    className="rounded-2xl h-12 font-black uppercase tracking-tight text-red-600 focus:bg-red-50 focus:text-red-600 cursor-pointer"
                >
                    <LogOut className="mr-4 h-5 w-5" />
                    Uitloggen
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
    <div className={cn('font-body antialiased flex flex-col h-svh overflow-hidden bg-slate-50')}>
      {isHeaderVisible && <Header />}
      <main className="flex-1 flex flex-col overflow-auto no-scrollbar">
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
    <html lang="nl" suppressHydrationWarning className="h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizer-content, viewport-fit=cover" />
        <title>BeheerHub | Smart Infra Management</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/png" sizes="32x32" href="https://i.ibb.co/kgtwqH50/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="https://i.ibb.co/kgtwqH50/favicon-32x32.png" />
      </head>
      <body className="h-full overflow-hidden bg-slate-50 antialiased">
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