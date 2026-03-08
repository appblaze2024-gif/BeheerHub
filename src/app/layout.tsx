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
import { Button } from '@/components/ui/button';
import { 
  Menu, 
  LogOut as LogOutIcon,
  Info,
  Home,
  User,
  Settings,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { signOut } from 'firebase/auth';
import { LoadingScreen } from '@/components/loading-screen';
import { NotificationCenter } from '@/components/notification-center';
import { AppInfoDialog } from '@/components/app-info-dialog';

function ProcessingOverlay() {
  const { isProcessing } = useGlobalLoading();
  
  if (!isProcessing) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-4 p-8 rounded-none bg-white shadow-2xl border border-slate-100 scale-110">
        <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-none" />
        <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">Verwerken...</p>
      </div>
    </div>
  );
}

function Header() {
  const auth = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  const menuItems = [
    { label: 'Hoofdmenu', icon: Home, href: '/' },
    { label: 'Mijn Profiel', icon: User, href: '/profile' },
    { label: 'Instellingen', icon: Settings, href: '/settings' },
  ];

  return (
    <header className="h-16 flex items-center justify-between px-4 lg:px-8 bg-[#3498db] text-white shadow-md sticky top-0 left-0 right-0 z-50">
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/10 rounded-none h-10 w-10"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 border-none rounded-none bg-white flex flex-col shadow-2xl">
            <SheetHeader className="p-6 bg-[#3498db] text-white shrink-0 space-y-4 rounded-none">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 border-2 border-white shadow-md rounded-none shrink-0">
                  <AvatarFallback className="bg-white/20 text-white font-black text-sm rounded-none uppercase">
                    {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="text-white text-lg font-black uppercase tracking-tight truncate leading-none mb-1">
                    {profile?.firstName} {profile?.lastName}
                  </SheetTitle>
                  <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest truncate">
                    {profile?.role || 'Beheerder'}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 py-4">
              <nav className="flex flex-col">
                {menuItems.map((item) => (
                  <SheetClose key={item.href} asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        "justify-start h-14 rounded-none px-6 gap-4 font-black uppercase text-xs tracking-widest text-slate-600 hover:bg-slate-50 hover:text-[#3498db]",
                        pathname === item.href && "bg-slate-50 text-[#3498db] border-r-4 border-[#3498db]"
                      )}
                      onClick={() => router.push(item.href)}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Button>
                  </SheetClose>
                ))}
              </nav>
            </div>

            <div className="p-4 border-t bg-slate-50 shrink-0">
              <Button 
                variant="destructive" 
                className="w-full h-12 rounded-none font-black uppercase tracking-widest text-xs gap-3 shadow-lg shadow-red-600/20"
                onClick={() => signOut(auth)}
              >
                <LogOutIcon className="h-4 w-4" />
                Uitloggen
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        
        <h1 
          className="text-lg font-black uppercase tracking-tighter cursor-pointer select-none"
          onClick={() => router.push('/')}
        >
          BEHEERHUB
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <NotificationCenter />
        <AppInfoDialog>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none text-white hover:bg-white/10">
            <Info className="h-4 w-4" />
          </Button>
        </AppInfoDialog>
        <div className="h-8 w-px bg-white/20 mx-2 hidden sm:block" />
        <div className="items-center gap-3 hidden sm:flex">
          <div className="text-right">
            <p className="text-[10px] font-bold text-white/70 leading-none mb-0.5 uppercase tracking-tight">
              {profile?.schouwenGemeente || 'Bodegraven-Reeuwijk'}
            </p>
            <p className="text-xs font-black leading-none">
              {profile?.firstName}
            </p>
          </div>
          <Avatar className="h-9 w-9 border-2 border-white/50 shadow-md rounded-none">
            <AvatarFallback className="text-xs bg-white/20 text-white font-black uppercase rounded-none">
              {profile?.firstName?.[0]}
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
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        {isHeaderVisible && <Header />}
        <main className="flex-1 overflow-auto custom-scrollbar relative">
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
      <body className="h-full font-sans antialiased">
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
