'use client';

import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Suspense, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Script from 'next/script';
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
import { 
  Menu, 
  LogOut as LogOutIcon,
  Info,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { signOut } from 'firebase/auth';
import { LoadingScreen } from '@/components/loading-screen';
import { NotificationCenter } from '@/components/notification-center';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppInfoDialog } from '@/components/app-info-dialog';
import { LanguageSelector } from '@/components/language-selector';

function ProcessingOverlay() {
  const { isProcessing } = useGlobalLoading();
  
  if (!isProcessing) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white shadow-2xl border border-slate-100 scale-110">
        <div className="h-10 w-10 animate-spin border-4 border-primary border-t-transparent rounded-full" />
        <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">Verwerken...</p>
      </div>
    </div>
  );
}

function Header() {
  const auth = useAuth();
  const { profile } = useProfile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <header className="h-16 lg:h-20 flex items-center justify-between px-4 lg:px-10 bg-transparent absolute top-0 left-0 right-0 z-50">
      <div className="flex items-center gap-2">
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden text-slate-600 hover:bg-slate-100 bg-white/90 backdrop-blur-sm rounded-full shadow-sm h-10 w-10">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-none w-20 sidebar-blue text-white">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigatie</SheetTitle>
            </SheetHeader>
            <AppSidebar onNavigate={() => setIsSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        
        {isMobile && (
          <div className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-tighter text-slate-900 truncate max-w-[100px]">
              {profile?.firstName}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm p-1 rounded-full shadow-sm border border-slate-100">
        <div className="flex items-center gap-0.5 md:gap-1 md:pr-4 md:border-r border-slate-100">
          <LanguageSelector />
          <div className="relative">
            <NotificationCenter />
          </div>
          {!isMobile && (
            <AppInfoDialog>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#3498db] hover:bg-blue-50">
                <Info className="h-4 w-4" />
              </Button>
            </AppInfoDialog>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 rounded-full text-[#3498db] hover:bg-red-50 hover:text-red-600"
            onClick={() => signOut(auth)}
          >
            <LogOutIcon className="h-4 w-4" />
          </Button>
        </div>

        {!isMobile && (
          <div className="flex items-center gap-3 pl-2">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-bold text-slate-400 leading-none mb-1 uppercase tracking-tight">
                {profile?.schouwenGemeente || 'Bodegraven-Reeuwijk'}
              </p>
              <p className="text-xs font-black text-slate-900 leading-none">
                {profile?.firstName} {profile?.lastName}
              </p>
              <Badge className="mt-1 h-4 text-[7px] font-black uppercase bg-red-500 text-white border-none py-0 heart-pulse px-2 rounded-sm">
                {profile?.role || 'Beheerder'}
              </Badge>
            </div>
            <Avatar className="h-10 w-10 border-2 border-white shadow-md ring-1 ring-slate-100">
              <AvatarFallback className="text-xs bg-slate-100 text-[#3498db] font-black uppercase">
                {profile?.firstName?.[0]}{profile?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>
    </header>
  );
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const { isHeaderVisible } = useNavigationUI();
  const { isUserLoading } = useUser();
  const { isLoading: isProfileLoading } = useProfile();
  const pathname = usePathname();

  // Re-trigger translation when navigation occurs to ensure whole page is translated
  useEffect(() => {
    const triggerTranslation = () => {
      const select = document.querySelector('.goog-te-combo') as HTMLSelectElement;
      if (select) {
        // Read cookie to see what language we should be in
        const match = document.cookie.match(/googtrans=\/nl\/([^;]+)/);
        const targetLang = match ? match[1] : 'nl';
        
        if (select.value !== targetLang) {
          select.value = targetLang;
          select.dispatchEvent(new Event('change'));
        }
      }
    };
    
    // Small delay to ensure React has rendered new components, then force translation engine to re-scan
    const timer = setTimeout(triggerTranslation, 500);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (isUserLoading || isProfileLoading) {
    return <LoadingScreen className="h-screen" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      <aside className="hidden lg:block w-16 shrink-0 h-full sidebar-blue relative z-20">
        <AppSidebar />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 relative">
        {isHeaderVisible && <Header />}
        <main className="flex-1 overflow-auto custom-scrollbar relative pt-20 lg:pt-20">
          <ProcessingOverlay />
          {children}
        </main>
      </div>
      <Toaster />
      <div id="google_translate_element" style={{ position: 'fixed', top: '-10000px', left: '-10000px' }} />
      <Script
        id="google-translate-init"
        strategy="afterInteractive"
      >
        {`
          function googleTranslateElementInit() {
            new google.translate.TranslateElement({
              pageLanguage: 'nl',
              includedLanguages: 'nl,en,pl,uk,de,hu',
              autoDisplay: false,
              layout: google.translate.TranslateElement.InlineLayout.SIMPLE
            }, 'google_translate_element');
          }
        `}
      </Script>
      <Script
        src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        strategy="afterInteractive"
      />
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
