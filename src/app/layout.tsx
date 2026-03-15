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
  LogOut as LogOutIcon,
  Info,
  Home,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('impersonatedUserProfileId');
      localStorage.removeItem('lastSelectedProjectId');
      await signOut(auth);
      router.replace('/login');
    } catch (error) {
      console.error("Logout error:", error);
      window.location.href = '/login';
    }
  };

  const goToHome = () => {
    router.push('/');
  };

  return (
    <header className="h-20 flex items-center justify-end px-4 lg:px-8 bg-transparent shrink-0 sticky top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="flex items-center gap-1 sm:gap-2 bg-white/80 backdrop-blur-lg px-2 sm:px-4 py-1 sm:py-1.5 rounded-full shadow-lg border border-slate-100/50 pointer-events-auto max-w-[90vw] sm:max-w-none">
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full text-primary hover:bg-primary/10"
            onClick={goToHome}
            title="Home"
          >
            <Home className="h-4 w-4" />
          </Button>
          <NotificationCenter />
          <AppInfoDialog>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-full text-primary hover:bg-primary/10">
              <Info className="h-4 w-4" />
            </Button>
          </AppInfoDialog>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full text-primary hover:bg-primary/10"
            onClick={handleSignOut}
          >
            <LogOutIcon className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="h-6 sm:h-8 w-px bg-slate-200 mx-1 sm:mx-2" />
        
        <div className="flex flex-col items-end mr-1 sm:mr-2 min-w-0">
          <p className="text-[7px] sm:text-[8px] font-bold text-slate-400 leading-none mb-0.5 uppercase tracking-widest truncate max-w-[80px] sm:max-w-[120px]">
            {profile?.schouwenGemeente || 'BODEGRAVEN-REEUWIJK'}
          </p>
          <p className="text-[10px] sm:text-[11px] font-black text-slate-900 leading-none truncate max-w-[100px] sm:max-w-[150px]">
            {profile?.firstName} {profile?.lastName}
          </p>
          {profile?.role && (
            <Badge className={cn(
              "mt-0.5 sm:mt-1 h-3.5 px-1.5 text-[7px] font-black uppercase border-none rounded-none",
              profile.role === 'Super admin' ? "bg-red-500 text-white" : "bg-primary text-white"
            )}>
              {profile.role}
            </Badge>
          )}
        </div>
        
        <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border-2 border-white shadow-md ring-1 ring-slate-100 shrink-0 rounded-full">
          <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-black uppercase rounded-full">
            {profile?.firstName?.[0]}{profile?.lastName?.[0]}
          </AvatarFallback>
        </Avatar>
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
    <div className="flex h-screen overflow-hidden bg-background">
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
      if (!user && !isPublicPage) {
        router.replace('/login');
      } else if (user && pathname === '/login') {
        router.replace('/');
      }
    }
  }, [user, isUserLoading, pathname, mounted, isPublicPage, router]);

  if (!mounted) return null;
  
  if (!user && !isPublicPage) {
    return <LoadingScreen className="h-screen" />;
  }

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
