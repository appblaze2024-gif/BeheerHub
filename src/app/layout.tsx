'use client';

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';
import { Sidebar, SidebarProps } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/sidebar-nav';
import { SidebarHeader, SidebarFooter } from '@/components/ui/sidebar';
import { FirebaseClientProvider, useUser } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelRightClose } from 'lucide-react';

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(true);

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
    <div className={cn('font-body antialiased flex h-svh overflow-hidden')}>
      <Sidebar isCollapsed={isCollapsed}>
        <SidebarHeader isCollapsed={isCollapsed}>
          <Link href="/">
            <Image
              src="https://i.ibb.co/C3FgZFmf/8739741b-c5cd-451e-a742-9da981e051fa.png"
              alt="Logo"
              width={150}
              height={50}
              className={cn(
                'w-auto h-auto transition-all',
                isCollapsed ? 'h-0 w-0' : 'h-auto w-auto'
              )}
            />
             <div className={cn(isCollapsed ? 'block' : 'hidden')}>
                 <Image
                    src="https://i.ibb.co/L5T5T5V/logo-icon.png"
                    alt="Logo Icon"
                    width={24}
                    height={24}
                    />
            </div>
          </Link>
        </SidebarHeader>
        <SidebarNav isCollapsed={isCollapsed} />
         <SidebarFooter isCollapsed={isCollapsed}>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? <PanelRightClose /> : <PanelLeftClose />}
              <span className={cn(isCollapsed && 'hidden')}>Inklappen</span>
            </Button>
          </SidebarFooter>
      </Sidebar>
      <main className="flex-1 flex flex-col overflow-auto bg-background">
        {children}
      </main>
    </div>
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
      </body>
    </html>
  );
}
