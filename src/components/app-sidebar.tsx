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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { allMenuItems, type MenuItem, type SubMenuItem } from '@/lib/menu-config';
import { useUser, useCollection, useFirestore, useDoc, setDocumentNonBlocking } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, doc } from 'firebase/firestore';
import { Button } from './ui/button';
import { Settings, Camera, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProject } from '@/context/project-context';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type Project = {
  id: string;
  projectnaam: string;
  projectnummer: string;
};

export interface AppSidebarProps {
  onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const { profile } = useProfile();
  const firestore = useFirestore();
  const { selectedProjectId, setSelectedProjectId, isLoading: isLoadingProject } = useProject();
  const isMobile = useIsMobile();
  const [isVersionDialogOpen, setIsVersionDialogOpen] = React.useState(false);

  const settingsRef = React.useMemo(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'main');
  }, [firestore]);

  const { data: settings } = useDoc<{version: string}>(settingsRef);
  const version = settings?.version || 'V 1.8.1 P (176)';

  const [newVersion, setNewVersion] = React.useState(version);

  React.useEffect(() => {
    if (settings?.version) {
        setNewVersion(settings.version);
    } else {
        setNewVersion('V 1.8.1 P (176)');
    }
  }, [settings]);


  const handleVersionSave = async () => {
    if (!firestore) return;
    const settingsDocRef = doc(firestore, 'settings', 'main');
    await setDocumentNonBlocking(settingsDocRef, { version: newVersion }, { merge: true });
    setIsVersionDialogOpen(false);
  };
  
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
    <>
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
                  <span className="font-semibold text-base capitalize">{profile?.role || 'Rol Onbekend'}</span>
                  <span className="text-sm text-muted-foreground">{user?.email}</span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-2 no-scrollbar">
            <div className="px-2 pb-2">
              <Select
                value={selectedProjectId || ''}
                onValueChange={(value) => setSelectedProjectId(value === '' ? null : value)}
                disabled={isLoadingProjects || isLoadingProject}
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
                <SidebarMenuItem key={item.label}>
                  {item.subItems ? (
                    <Collapsible defaultOpen={pathname.startsWith(item.href)}>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={pathname.startsWith(item.href)}
                          className="h-12 text-base justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <item.icon className="h-6 w-6 text-primary" />
                            <span>{item.label}</span>
                          </div>
                          <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
                        <SidebarMenuSub>
                          {item.subItems.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.href}>
                              <Link href={subItem.href} passHref legacyBehavior>
                                <SidebarMenuSubButton onClick={onNavigate} isActive={pathname === subItem.href}>
                                  <span>{subItem.label}</span>
                                </SidebarMenuSubButton>
                              </Link>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <Link href={item.href} passHref onClick={onNavigate}>
                      <SidebarMenuButton
                        isActive={pathname === item.href}
                        className="h-12 text-base"
                      >
                        <item.icon className="h-6 w-6 text-primary" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
              <div className='p-4 text-center text-muted-foreground text-sm flex items-center justify-center gap-2'>
                  <span>{version}</span>
                  {isSuperUser && (
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setIsVersionDialogOpen(true)}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
              </div>
          </SidebarFooter>
      </Sidebar>
      <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Versiebeheer</DialogTitle>
                <DialogDescription>
                    Pas het versienummer van de applicatie aan.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label htmlFor="version-input">Versienummer</Label>
                <Input
                    id="version-input"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                />
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setIsVersionDialogOpen(false)}>Annuleren</Button>
                <Button onClick={handleVersionSave}>Opslaan</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
