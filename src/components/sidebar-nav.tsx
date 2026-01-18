'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  ClipboardList,
  FileText,
  CalendarCheck,
  Truck,
  Building2,
  Map,
  Package,
  Bell,
  Home,
  Newspaper,
  User,
  Settings,
  LogOut,
  Mail,
  ChevronDown
} from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


const allMenuItems: { href: string; label: string; icon: React.ElementType; module?: string }[] = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/projects', label: 'Projecten', icon: ClipboardList, module: 'projects' },
  { href: '/employees', label: 'Medewerkers', icon: Users, module: 'employees' },
  { href: '/work-planning', label: 'Werkplanning', icon: CalendarCheck, module: 'workPlanning' },
  { href: '/weekly-reports', label: 'Weekstaten', icon: Newspaper, module: 'weeklyReports' },
  { href: '/reports', label: 'Rapportages', icon: FileText, module: 'reports' },
  { href: '/vehicles', label: 'Wagenpark', icon: Truck, module: 'vehicles' },
  { href: '/objects', label: 'Objecten', icon: Building2, module: 'objects' },
  { href: '/inventory', label: 'Voorraadbeheer', icon: Package, module: 'inventory' },
  { href: '/issues', label: 'Meldingen', icon: Bell, module: 'issues' },
  { href: '/navigation-module', label: 'Navigatiemodule', icon: Map, module: 'navigation' },
  { href: '/mail', label: 'Mail', icon: Mail, module: 'mail' },
];


export function SidebarNav() {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { profile, isLoading: isProfileLoading } = useProfile();

  const handleLogout = async () => {
    await signOut(auth);
  };
  
  const menuItems = React.useMemo(() => {
    const isLoading = isUserLoading || isProfileLoading;
    if (isLoading) return [];
    
    const isSuperUser = profile?.role === 'Super admin';
    const permissions = profile?.permissions || {};

    return allMenuItems.filter(item => {
      if (isSuperUser) return true;
      if (!item.module) return true; // Items without a module are visible to everyone
      const modulePermissions = permissions[item.module];
      if (!modulePermissions) return false;
      return !!modulePermissions.view || !!modulePermissions.use;
    });
  }, [profile, isProfileLoading, isUserLoading]);

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  return (
    <div className="flex items-center justify-between w-full">
        <nav className="flex items-center gap-1">
            {menuItems.map((item) => (
                <Link key={item.label} href={item.href} passHref>
                  <Button 
                    variant={pathname === item.href ? 'secondary' : 'ghost'} 
                    size="sm"
                  >
                    {item.label}
                  </Button>
                </Link>
            ))}
        </nav>

        <div className="flex items-center gap-4">
           {/* User profile dropdown */}
           <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                       <AvatarImage src={user?.photoURL || undefined} />
                       <AvatarFallback>{getInitials(profile?.firstName, profile?.lastName)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline">{profile?.displayName || profile?.email}</span>
                    <ChevronDown className="h-4 w-4 hidden md:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Mijn Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Link href="/profile" passHref><DropdownMenuItem>Profiel</DropdownMenuItem></Link>
                <Link href="/settings" passHref><DropdownMenuItem>Instellingen</DropdownMenuItem></Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Uitloggen</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
           </DropdownMenu>
        </div>
    </div>
  );
}
