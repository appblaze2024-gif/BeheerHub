'use client';

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';
import { Sidebar, SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/sidebar-nav';
import { SidebarHeader } from '@/components/ui/sidebar';
import { FirebaseClientProvider, useUser } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';


function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isUserLoading) return; // Wacht tot de gebruikerstatus bekend is

    const isAuthPage = pathname === '/login';

    if (!user && !isAuthPage) {
      router.push('/login');
    } else if (user && isAuthPage) {
      router.push('/');
    }
  }, [user, isUserLoading, pathname, router]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        Laden...
      </div>
    );
  }

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <body className={cn('font-body antialiased flex h-svh overflow-hidden')}>
      <Sheet>
        <Sidebar>
          <SidebarHeader>
            <Link href="/">
              <Image
                src="https://i.ibb.co/C3FgZFmf/8739741b-c5cd-451e-a742-9da981e051fa.png"
                alt="Logo"
                width={150}
                height={50}
                className="w-auto h-auto"
              />
            </Link>
          </SidebarHeader>
          <SidebarNav />
        </Sidebar>

        <div className="flex flex-1 flex-col min-h-0">
          <header className="flex items-center justify-between gap-4 p-4 md:hidden">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={cn('h-7 w-7')}>
                <PanelLeft />
                <span className="sr-only">Zijbalk wisselen</span>
              </Button>
            </SheetTrigger>
          </header>
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>

        <SheetContent side="left" className="p-0 w-64">
          <Sidebar>
            <SidebarHeader>
              <Link href="/">
                <Image
                  src="https://i.ibb.co/C3FgZFmf/8739741b-c5cd-451e-a742-9da981e051fa.png"
                  alt="Logo"
                  width={150}
                  height={50}
                  className="w-auto h-auto"
                />
              </Link>
            </SidebarHeader>
            <SidebarNav />
          </Sidebar>
        </SheetContent>
      </Sheet>
    </body>
  );
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <FirebaseClientProvider>
          <AppLayout>{children}</AppLayout>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
