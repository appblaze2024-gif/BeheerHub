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
  LayoutGrid
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
    if (parts.length === 0) return 'Operations';
    const mapping: Record<string, string> = {
      'projects': 'Projects',
      'employees': 'Team',
      'vehicles': 'Fleet',
      'issues': 'Tickets',
      'objects': 'Assets',
      'iot': 'IoT Core',
      'mail': 'Communications',
      'profile': 'Account',
      'settings': 'System'
    };
    return mapping[parts[0].toLowerCase()] || parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  };

  return (
    <header className="h-16 border-b bg-white/60 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-6">
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden h-10 w-10 rounded-xl hover:bg-slate-100">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r w-72 shadow-2xl">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setIsSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/30 flex items-center justify-center animate-in zoom-in duration-500">
            <Zap className="h-5 w-5 text-white fill-current" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-black tracking-tighter text-slate-900 uppercase">BeheerHub</span>
            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mt-0.5">Control</span>
          </div>
          <div className="h-6 w-[1px] bg-slate-200 mx-3 hidden sm:block" />
          <h1 className="text-sm font-black text-slate-400 uppercase tracking-widest hidden md:block">{getPageTitle()}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center bg-slate-100/50 rounded-xl px-3 py-2 border border-slate-200/60 w-72 group focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Search className="h-4 w-4 text-slate-400 mr-2 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Global search..." 
            className="bg-transparent text-xs outline-none w-full font-bold text-slate-600 placeholder:text-slate-400"
          />
          <kbd className="hidden lg:inline-flex text-[9px] font-black text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md shadow-sm">⌘K</kbd>
        </div>

        <NotificationCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 px-2 gap-3 rounded-xl hover:bg-slate-100 transition-all">
              <Avatar className="h-8 w-8 rounded-lg border-2 border-white shadow-md ring-1 ring-slate-100">
                <AvatarImage src={user?.photoURL || undefined} />
                <AvatarFallback className="text-xs bg-primary text-white font-black uppercase">
                  {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col items-start text-left">
                <span className="text-xs font-black text-slate-900 leading-none">{profile?.firstName}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{profile?.role}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 mt-2 rounded-2xl shadow-2xl border-slate-100 p-2 animate-in slide-in-from-top-2">
            <DropdownMenuLabel className="font-normal px-3 py-3 bg-slate-50 rounded-xl mb-2">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-black text-slate-900 leading-none">{profile?.displayName}</p>
                <p className="text-[10px] font-bold text-slate-400 leading-none truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem asChild className="rounded-xl h-10 text-xs font-bold text-slate-600 hover:text-primary">
              <Link href="/profile"><User className="mr-3 h-4 w-4" /> My Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-xl h-10 text-xs font-bold text-slate-600 hover:text-primary">
              <Link href="/settings"><Settings className="mr-3 h-4 w-4" /> System Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-xl h-10 text-xs font-bold text-slate-600 hover:text-primary">
              <Link href="/help"><HelpCircle className="mr-3 h-4 w-4" /> Support Center</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem 
              onClick={() => signOut(auth)}
              className="rounded-xl h-10 text-xs font-bold text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <LogOutIcon className="mr-3 h-4 w-4" /> Terminate Session
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
    <div className="flex flex-col h-screen overflow-hidden bg-tech">
      {isHeaderVisible && <Header />}
      <div className="flex flex-1 min-h-0 relative">
        <aside className="hidden lg:block w-72 shrink-0 p-4">
          <div className="h-full glass-panel rounded-3xl overflow-hidden border-none">
            <AppSidebar />
          </div>
        </aside>
        <main className="flex-1 overflow-auto relative custom-scrollbar p-4 lg:pl-0">
          <div className="h-full rounded-3xl overflow-hidden bg-transparent">
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
        <title>BeheerHub | Aero Tech Control</title>
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