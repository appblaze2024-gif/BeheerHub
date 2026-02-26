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
  Bell, 
  User, 
  Settings, 
  LogOut as LogOutIcon,
  ChevronRight,
  Zap,
  HelpCircle,
  Cpu
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
import { NotificationCenter } from '@/components/notification-center';

function Header() {
  const auth = useAuth();
  const pathname = usePathname();
  const { user } = useUser();
  const { profile } = useProfile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const getPageTitle = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return 'Operations Control';
    const mapping: Record<string, string> = {
      'projects': 'Infrastructure',
      'employees': 'Human Capital',
      'vehicles': 'Fleet Engine',
      'issues': 'Signal Terminal',
      'objects': 'Asset Map',
      'iot': 'IoT Core',
      'mail': 'Comm Link',
      'profile': 'Account',
      'settings': 'Core Systems'
    };
    return mapping[parts[0].toLowerCase()] || parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  };

  return (
    <header className="h-20 flex items-center justify-between px-8 sticky top-0 z-50">
      <div className="flex items-center gap-8">
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden h-12 w-12 rounded-2xl hover:bg-white shadow-sm border border-white/40">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-none w-80 glass-panel">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setIsSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="flex items-center gap-4">
          <div className="bg-primary h-12 w-12 rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
            <Cpu className="h-6 w-6 text-white relative z-10" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-lg font-black tracking-tighter text-slate-900 uppercase">BeheerHub</span>
            <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mt-1 opacity-80">Tech Protocol</span>
          </div>
          <div className="h-8 w-[1px] bg-slate-200/60 mx-4 hidden sm:block" />
          <h1 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] hidden md:block pt-1">{getPageTitle()}</h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center bg-white/60 backdrop-blur-md rounded-2xl px-4 h-12 border border-white/40 w-80 group focus-within:ring-4 focus-within:ring-primary/10 transition-all shadow-sm">
          <Search className="h-4 w-4 text-slate-400 mr-3 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search telemetry..." 
            className="bg-transparent text-xs outline-none w-full font-bold text-slate-600 placeholder:text-slate-400"
          />
          <kbd className="hidden lg:inline-flex text-[9px] font-black text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg shadow-inner">⌘K</kbd>
        </div>

        <div className="flex items-center gap-2">
          <NotificationCenter />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-12 px-2 gap-4 rounded-2xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-white/40">
                <div className="hidden sm:flex flex-col items-end text-right">
                  <span className="text-xs font-black text-slate-900 leading-none">{profile?.firstName}</span>
                  <span className="text-[9px] font-bold text-primary uppercase tracking-tighter mt-1">{profile?.role}</span>
                </div>
                <Avatar className="h-9 w-9 rounded-xl border-2 border-white shadow-lg ring-1 ring-slate-100">
                  <AvatarImage src={user?.photoURL || undefined} />
                  <AvatarFallback className="text-[10px] bg-primary text-white font-black uppercase">
                    {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 mt-2 rounded-[2rem] shadow-2xl border-white/40 p-3 glass-panel animate-in slide-in-from-top-2">
              <DropdownMenuLabel className="font-normal px-4 py-4 bg-primary/5 rounded-[1.5rem] mb-2">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-black text-slate-900 leading-none">{profile?.displayName}</p>
                  <p className="text-[10px] font-bold text-slate-400 leading-none truncate mt-1">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <div className="space-y-1">
                <DropdownMenuItem asChild className="rounded-xl h-11 text-xs font-bold text-slate-600 hover:text-primary hover:bg-white transition-all cursor-pointer">
                  <Link href="/profile"><User className="mr-3 h-4 w-4" /> My Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-xl h-11 text-xs font-bold text-slate-600 hover:text-primary hover:bg-white transition-all cursor-pointer">
                  <Link href="/settings"><Settings className="mr-3 h-4 w-4" /> Core Config</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-xl h-11 text-xs font-bold text-slate-600 hover:text-primary hover:bg-white transition-all cursor-pointer">
                  <Link href="/help"><HelpCircle className="mr-3 h-4 w-4" /> Intel Base</Link>
                </DropdownMenuItem>
              </div>
              <DropdownMenuSeparator className="my-3 opacity-20" />
              <DropdownMenuItem 
                onClick={() => signOut(auth)}
                className="rounded-xl h-11 text-xs font-black text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
              >
                <LogOutIcon className="mr-3 h-4 w-4" /> Terminate Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
    <div className="flex flex-col h-screen overflow-hidden bg-tech">
      {isHeaderVisible && <Header />}
      <div className="flex flex-1 min-h-0 relative px-8 pb-8 gap-8">
        <aside className="hidden lg:block w-80 shrink-0 h-full">
          <div className="h-full glass-panel rounded-[3rem] overflow-hidden">
            <AppSidebar />
          </div>
        </aside>
        <main className="flex-1 overflow-auto relative custom-scrollbar">
          <div className="h-full rounded-[3rem] overflow-hidden bg-transparent">
            {children}
          </div>
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
    <html lang="en" className="h-full">
      <head>
        <title>BeheerHub | Aero Tech Intel</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full font-sans bg-slate-50">
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