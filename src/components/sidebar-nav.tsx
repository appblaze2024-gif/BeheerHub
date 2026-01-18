'use client';

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
import { useAuth } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const allMenuItems = [
  { href: '/', label: 'Dashboard', icon: Home, adminOnly: false },
  { href: '/projects', label: 'Projecten', icon: ClipboardList, adminOnly: true },
  { href: '/employees', label: 'Medewerkers', icon: Users, adminOnly: true },
  { href: '/work-planning', label: 'Werkplanning', icon: CalendarCheck, adminOnly: true },
  { href: '/weekly-reports', label: 'Weekstaten', icon: Newspaper, adminOnly: true },
  { href: '/reports', label: 'Rapportages', icon: FileText, adminOnly: true },
  { href: '/vehicles', label: 'Wagenpark', icon: Truck, adminOnly: true },
  { href: '/objects', label: 'Objecten', icon: Building2, adminOnly: false },
  { href: '/inventory', label: 'Voorraadbeheer', icon: Package, adminOnly: false },
  { href: '/issues', label: 'Meldingen', icon: Bell, adminOnly: false },
  { href: '/navigation-module', label: 'Navigatiemodule', icon: Map, adminOnly: false },
  { href: '/mail', label: 'Mail', icon: Mail, adminOnly: false },
];

export function SidebarNav({ isCollapsed }: { isCollapsed: boolean }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { profile, isLoading } = useProfile();

  const handleLogout = async () => {
    await signOut(auth);
  };
  
  const menuItems = React.useMemo(() => {
    if (isLoading) return [];
    if (profile?.role === 'admin') {
      return allMenuItems;
    }
    return allMenuItems.filter(item => !item.adminOnly);
  }, [profile, isLoading]);


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
