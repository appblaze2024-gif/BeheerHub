'use client';

import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Suspense, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  FirebaseClientProvider,
  useUser,
  useAuth,
} from '@/firebase';
import { ProfileProvider, useProfile } from '@/firebase/profile-provider';
import { NavigationUIProvider, useNavigationUI } from '@/context/navigation-ui-context';
import { ProjectProvider } from '@/context/project-context';
import { GlobalLoadingProvider, useGlobalLoading } from '@/context/global-loading-context';
import { Toaster } from '@/components/ui/toaster';
import { AppSidebar } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Menu, 
  Search, 
  LogOut as LogOutIcon,
  ChevronLeft,
  Loader2,
  Plus,
  User as UserIcon,
  Info,
  Mail
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from 'firebase/auth';
import { LoadingScreen } from '@/components/loading-screen';
import Link from 'next/link';
import { NotificationCenter } from '@/components/notification-center';

function ProcessingOverlay() {
  const { isProcessing } = useGlobalLoading();
  
  if (!isProcessing) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white shadow-2xl border border-slate-100 scale-110">
        <Loader2 className="h-10 w-10 animate-spin text-[#3b51a3]" />
        <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">Verwerken...</p>
      </div>
    </div>
  );
}

function Header() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useProfile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const getPageTitle = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return 'Dashboard';
    const mapping: Record<string, string> = {
      'projects': 'Projecten',
      'employees': 'Personeel',
      'vehicles': 'Wagenpark',
      'issues': 'Meldingen',
      'objects': 'Objecten',
      'iot': 'IoT Beheer',
      'mail': 'Mailberichten',
      'profile': 'Profiel',
      'settings': 'Instellingen',
      'work-planning': 'Werkplanning',
      'annual-planning': 'Jaarplanning',
      'weekly-reports': 'Weekstaten',
      'spec-reports': 'Besteksmeldingen',
      'navigation-module': 'Navigatie',
      'bestanden': 'Documenten',
      'minutes': 'Notulen'
    };
    const key = parts[0].toLowerCase();
    return mapping[key] || parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-white border-b sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden text-slate-600 hover:bg-slate-100">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 border-none w-64 sidebar-blue text-white">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigatie</SheetTitle>
              </SheetHeader>
              <AppSidebar onNavigate={() => setIsSidebarOpen(false)} />
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center">
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-700 leading-none">{getPageTitle()}</h1>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-slate-400 hover:text-primary">
            <UserIcon className="h-5 w-5" />
          </Button>
          <NotificationCenter />
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-slate-400 hover:text-primary">
            <Info className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 rounded-full text-slate-400 hover:text-red-600"
            onClick={() => signOut(auth)}
          >
            <LogOutIcon className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-3 pl-6 border-l border-slate-100">
          <div className="text-right hidden sm:block">
            <p className="text-[11px] font-black uppercase tracking-tight text-slate-900 leading-none mb-1">
              {profile?.schouwenGemeente || 'BeheerHub'}
            </p>
            <p className="text-xs font-bold text-slate-400 leading-none truncate max-w-[120px]">
              {profile?.firstName} {profile?.lastName}
            </p>
            <Badge variant="secondary" className="mt-1 h-4 text-[8px] font-black uppercase tracking-widest bg-primary/5 text-primary border-none">
              {profile?.role || 'Gebruiker'}
            </Badge>
          </div>
          <Avatar className="h-10 w-10 border-2 border-slate-50 shadow-sm">
            <AvatarImage src={undefined} />
            <AvatarFallback className="text-xs bg-slate-100 text-primary font-black uppercase">
              {profile?.firstName?.[0]}{profile?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const { isHeaderVisible } = useNavigationUI();
  const { isUserLoading } = useUser();
  const { isLoading: isProfileLoading } = useProfile();

  if (isUserLoading || isProfileLoading) {
    return <LoadingScreen className="h-screen" />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {isHeaderVisible && <Header />}
      <div className="flex flex-1 min-h-0 relative">
        <aside className="hidden lg:block w-20 xl:w-24 shrink-0 h-full sidebar-blue shadow-2xl relative z-20">
          <AppSidebar />
        </aside>
        <main className="flex-1 overflow-auto bg-slate-50 custom-scrollbar relative">
          <ProcessingOverlay />
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isPublicPage = pathname === '/login' || pathname.startsWith('/reset-password');

  useEffect(() => {
    if (mounted && !isUserLoading) {
      if (!user && !isPublicPage) router.push('/login');
      else if (user && pathname === '/login') router.push('/');
    }
  }, [user, isUserLoading, pathname, mounted, isPublicPage, router]);

  if (!mounted) return null;
  if (isPublicPage) return <>{children}</>;

  return <MainLayout>{children}</MainLayout>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className="h-full">
      <head>
        <title>BeheerHub | Beheer & Onderhoud</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className="h-full">
        <FirebaseClientProvider>
          <GlobalLoadingProvider>
            <ProfileProvider>
              <ProjectProvider>
                <NavigationUIProvider>
                  <Suspense fallback={null}>
                    <AuthWrapper>{children}</AuthWrapper>
                  </Suspense>
                </NavigationUIProvider>
              </ProjectProvider>
            </ProfileProvider>
          </GlobalLoadingProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
