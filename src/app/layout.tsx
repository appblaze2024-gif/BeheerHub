'use client';

import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Suspense, useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  FirebaseClientProvider,
  useUser,
  useAuth,
} from '@/firebase';
import { ProfileProvider, useProfile } from '@/firebase/profile-provider';
import { NavigationUIProvider, useNavigationUI } from '@/context/navigation-ui-context';
import { ProjectProvider, useProject } from '@/context/project-context';
import { Toaster } from '@/components/ui/toaster';
import { AppSidebar } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { 
  Menu, 
  Search, 
  Bell, 
  User, 
  Settings, 
  LogOut, 
  ChevronRight,
  Command,
  HelpCircle,
  LogOut as LogOutIcon
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

function Header() {
  const auth = useAuth();
  const pathname = usePathname();
  const { user } = useUser();
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
      'iot': 'IoT Sensors',
      'mail': 'Berichten',
      'profile': 'Profiel',
      'settings': 'Instellingen'
    };
    return mapping[parts[0].toLowerCase()] || parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  };

  return (
    <header className="h-14 border-b bg-white/80 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9 rounded-md">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r w-72 shadow-xl">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigatie</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setIsSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="flex items-center gap-2">
          <div className="bg-zinc-950 p-1.5 rounded-lg flex items-center justify-center">
            <Command className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-zinc-900 hidden sm:inline-block">BeheerHub</span>
          <div className="h-4 w-[1px] bg-zinc-200 mx-2 hidden sm:block" />
          <h1 className="text-sm font-semibold text-zinc-600">{getPageTitle()}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center bg-zinc-100 rounded-lg px-2 py-1.5 border border-zinc-200 w-64">
          <Search className="h-3.5 w-3.5 text-zinc-400 mr-2" />
          <input 
            type="text" 
            placeholder="Snelzoeken..." 
            className="bg-transparent text-xs outline-none w-full font-medium"
          />
          <kbd className="text-[10px] font-bold text-zinc-400 bg-white border border-zinc-200 px-1.5 rounded">⌘K</kbd>
        </div>

        <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-500 rounded-md">
          <Bell className="h-4.5 w-4.5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 px-2 gap-2 rounded-md hover:bg-zinc-100 transition-colors">
              <Avatar className="h-6 w-6 rounded-md">
                <AvatarImage src={user?.photoURL || undefined} />
                <AvatarFallback className="text-[10px] bg-zinc-900 text-white font-bold">
                  {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-semibold text-zinc-700 hidden sm:inline-block">{profile?.firstName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-1 rounded-xl shadow-xl border-zinc-200 p-1.5">
            <DropdownMenuLabel className="font-normal px-2 py-2">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-bold leading-none">{profile?.displayName}</p>
                <p className="text-[10px] font-medium text-zinc-400 leading-none">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="rounded-lg h-9 text-xs font-semibold">
              <Link href="/profile"><User className="mr-2 h-4 w-4" /> Mijn Profiel</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg h-9 text-xs font-semibold">
              <Link href="/settings"><Settings className="mr-2 h-4 w-4" /> Instellingen</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg h-9 text-xs font-semibold">
              <Link href="/help"><HelpCircle className="mr-2 h-4 w-4" /> Help Center</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => signOut(auth)}
              className="rounded-lg h-9 text-xs font-semibold text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <LogOutIcon className="mr-2 h-4 w-4" /> Uitloggen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {isHeaderVisible && <Header />}
      <div className="flex flex-1 min-h-0 relative">
        <aside className="hidden lg:block w-64 border-r shrink-0">
          <AppSidebar />
        </aside>
        <main className="flex-1 overflow-auto bg-grid relative custom-scrollbar">
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
        <title>BeheerHub | Modern Infra Management</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full font-sans">
        <FirebaseClientProvider>
          <ProfileProvider>
            <ProjectProvider>
              <NavigationUIProvider>
                <Suspense fallback={null}>
                  <AuthWrapper>{children}</AuthWrapper>
                </Suspense>
              </NavigationUIProvider>
            </ProjectProvider>
          </ProfileProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}