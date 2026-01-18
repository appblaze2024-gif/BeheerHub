'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
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
} from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type { UserPermission } from '@/lib/types';


const allMenuItems: { href: string; label: string; icon: React.ElementType; permission?: UserPermission }[] = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/projects', label: 'Projecten', icon: ClipboardList, permission: 'manageProjects' },
  { href: '/employees', label: 'Medewerkers', icon: Users, permission: 'manageEmployees' },
  { href: '/work-planning', label: 'Werkplanning', icon: CalendarCheck, permission: 'manageWorkPlanning' },
  { href: '/weekly-reports', label: 'Weekstaten', icon: Newspaper, permission: 'manageWeeklyReports' },
  { href: '/reports', label: 'Rapportages', icon: FileText, permission: 'viewReports' },
  { href: '/vehicles', label: 'Wagenpark', icon: Truck, permission: 'manageVehicles' },
  { href: '/objects', label: 'Objecten', icon: Building2, permission: 'manageObjects' },
  { href: '/inventory', label: 'Voorraadbeheer', icon: Package, permission: 'manageInventory' },
  { href: '/issues', label: 'Meldingen', icon: Bell, permission: 'manageIssues' },
  { href: '/navigation-module', label: 'Navigatiemodule', icon: Map, permission: 'useNavigation' },
  { href: '/mail', label: 'Mail', icon: Mail, permission: 'useMail' },
];


export function SidebarNav({ isCollapsed }: { isCollapsed: boolean }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { isUserLoading } = useUser();
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
      if (!item.permission) return true; // Items without a permission are visible to everyone
      return !!permissions[item.permission];
    });
  }, [profile, isProfileLoading, isUserLoading]);


  const bottomMenuItems = [
    { href: '/profile', label: 'Profiel', icon: User },
    { href: '/settings', label: 'Instellingen', icon: Settings },
    {
      label: 'Uitloggen',
      icon: LogOut,
      onClick: handleLogout,
      href: '#',
    },
  ];

  const renderMenuItem = (item: any) => {
    const content = (
      <SidebarMenuButton
        isActive={pathname === item.href}
        className={cn('w-full', isCollapsed && 'justify-center')}
        onClick={item.onClick}
      >
        <item.icon />
        <span className={cn(isCollapsed && 'hidden')}>{item.label}</span>
      </SidebarMenuButton>
    );

    const link = item.onClick ? (
      content
    ) : (
      <Link href={item.href}>{content}</Link>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider delayDuration={0}>
            <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                    <p>{item.label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
      );
    }
    return link;
  }

  return (
    <SidebarContent>
      <SidebarMenu>
        {menuItems.map((item) => (
          <SidebarMenuItem key={item.label}>
            {renderMenuItem(item)}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>

      <SidebarMenu className="mt-auto">
        {bottomMenuItems.map((item) => (
          <SidebarMenuItem key={item.label}>
            {renderMenuItem(item)}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarContent>
  );
}
