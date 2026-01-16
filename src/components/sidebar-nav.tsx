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
  Wrench,
  Building2,
  Map,
  Package,
  Bell,
  Home,
  Newspaper,
  User,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/projects', label: 'Projecten', icon: ClipboardList },
  { href: '/employees', label: 'Medewerkers', icon: Users },
  { href: '/work-planning', label: 'Werkplanning', icon: CalendarCheck },
  { href: '/weekly-reports', label: 'Weekstaten', icon: Newspaper },
  { href: '/reports', label: 'Rapportages', icon: FileText },
  { href: '/vehicles', label: 'Materieel', icon: Truck },
  { href: '/objects', label: 'Objecten', icon: Building2 },
  { href: '/inventory', label: 'Voorraadbeheer', icon: Package },
  { href: '/issues', label: 'Meldingen', icon: Bell },
  { href: '/navigation-module', label: 'Navigatiemodule', icon: Map },
];

export function SidebarNav({ isCollapsed }: { isCollapsed: boolean }) {
  const pathname = usePathname();
  const auth = useAuth();

  const handleLogout = async () => {
    await signOut(auth);
  };

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
