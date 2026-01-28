'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { allMenuItems } from '@/lib/menu-config';
import { useUser, useCollection, useFirestore } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection } from 'firebase/firestore';
import { Button } from './ui/button';
import { Settings, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

type Project = {
  id: string;
  projectnaam: string;
  projectnummer: string;
};

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { profile } = useProfile();
  const firestore = useFirestore();
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | undefined>();
  const isMobile = useIsMobile();
  
  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };
  
  const isSuperUser = profile?.role === 'Super admin';

  const menuItems = React.useMemo(() => {
    if (!profile) {
      return [];
    }

    return allMenuItems.filter(item => {
      if (item.href === '/') {
        return true;
      }
      if (!item.module) {
        return true;
      }
      if (isSuperUser) {
        return true;
      }
      const modulePermissions = profile.permissions?.[item.module];
      if (!modulePermissions) {
        return false;
      }
      return modulePermissions.view || modulePermissions.use || false;
    });
  }, [profile, isSuperUser]);
  
  return (
    <Sidebar isCollapsed={false} className="w-full">
        <SidebarHeader>
          <div className="flex items-center gap-3 w-full p-2">
            <Avatar className="h-14 w-14 border-2 border-green-500 relative">
              <AvatarImage src={user?.photoURL || undefined} />
              <AvatarFallback>
                {!user?.photoURL && <Camera className="h-6 w-6 text-muted-foreground" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
                <span className="font-semibold text-base">{profile?.displayName || 'Gebruiker'}</span>
                <span className="text-sm text-muted-foreground">{profile?.email}</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="p-2">
          <div className="px-2 pb-2">
            <Select
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              disabled={isLoadingProjects}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecteer project" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id!}>
                    {project.projectnaam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} passHref>
                    <SidebarMenuButton
                        isActive={pathname === item.href}
                        className="h-12 text-base"
                    >
                        <item.icon className="h-6 w-6 text-primary" />
                        <span>{item.label}</span>
                    </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
            <div className='p-4 text-center text-muted-foreground text-sm flex items-center justify-center gap-2'>
                <span>V 1.8.1 P (176)</span>
                <Settings className="h-4 w-4" />
            </div>
        </SidebarFooter>
    </Sidebar>
  );
}
