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
import { Toaster } from '@/components/ui/toaster';
import { AppSidebar } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { 
  Menu, 
  Search, 
  LogOut as LogOutIcon,
  ChevronLeft
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
      'iot': 'IoT Beheer',
      'mail': 'Mailberichten',
      'profile': 'Profiel',
      'settings': 'Instellingen'
    };
    return mapping[parts[0].toLowerCase()] || parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  };

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-[#3498db] text-white sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-4">
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden text-white hover:bg-white/10">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-none w-64 bg-white">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigatie</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setIsSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="bg-white text-[#3498db] p-1 rounded">
              <ChevronLeft className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Demo</span>
          </Link>
          <div className="h-6 w-[1px] bg-white/20 mx-2" />
          <h1 className="text-base font-semibold">{getPageTitle()}</h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center bg-white/10 rounded px-3 h-9 w-64 border border-white/20">
          <Input 
            type="text" 
            placeholder="Zoeken..." 
            className="bg-transparent border-none text-white text-sm placeholder:text-white/60 focus-visible:ring-0 h-full p-0"
          />
          <Search className="h-4 w-4 text-white/60 ml-2" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 px-2 gap-2 text-white hover:bg-white/10">
              <Avatar className="h-7 w-7 border border-white/40">
                <AvatarImage src={user?.photoURL || undefined} />
                <AvatarFallback className="text-[10px] bg-white text-[#3498db] font-bold">
                  {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-sm font-medium">{profile?.firstName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-1">
            <DropdownMenuLabel>Mijn Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/profile">Profielinstellingen</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/settings">Systeeminstellingen</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => signOut(auth)}
              className="text-red-600 cursor-pointer"
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
    <div className="flex flex-col h-screen overflow-hidden">
      {isHeaderVisible && <Header />}
      <div className="flex flex-1 min-h-0 relative">
        <aside className="hidden lg:block w-64 shrink-0 h-full border-r bg-white">
          <AppSidebar />
        </aside>
        <main className="flex-1 overflow-auto bg-slate-50 custom-scrollbar">
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