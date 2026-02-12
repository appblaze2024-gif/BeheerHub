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
import { useUser, useCollection, useFirestore, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, doc, query, where } from 'firebase/firestore';
import { Button } from './ui/button';
import { Settings, Camera, ChevronRight, LayoutGrid } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

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

  const settingsRef = useMemoFirebase(() => {
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
  
  const projectsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const newMeldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', '==', 'Nieuw'));
  }, [firestore]);

  const { data: newMeldingen } = useCollection(newMeldingenQuery);
  const newMeldingenCount = newMeldingen?.length || 0;

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
      <Sidebar isCollapsed={false} className="w-full bg-slate-900 border-none">
          <SidebarHeader className="p-6 border-b border-white/5">
            <div className="flex items-center gap-4 w-full">
              <div className="bg-primary h-10 w-10 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <LayoutGrid className="text-white h-6 w-6" />
              </div>
              <div className="flex flex-col">
                  <span className="font-black text-white uppercase tracking-tighter text-lg leading-none">BeheerHub</span>
                  <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mt-1">Smart Infra</span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-4 space-y-6 no-scrollbar">
            <div className="space-y-2 px-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1">Actief Project</Label>
              <Select
                value={selectedProjectId || ''}
                onValueChange={(value) => setSelectedProjectId(value === '' ? null : value)}
                disabled={isLoadingProjects || isLoadingProject}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-11 font-bold">
                  <SelectValue placeholder="Kies een project..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white">
                  {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id!} className="focus:bg-primary focus:text-white">
                      {project.projectnaam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SidebarMenu className="gap-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  {item.subItems ? (
                    <Collapsible defaultOpen={pathname.startsWith(item.href)} className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={pathname.startsWith(item.href)}
                          className={cn(
                            "h-11 text-sm font-bold justify-between transition-all rounded-xl px-4",
                            pathname.startsWith(item.href) 
                              ? "bg-primary text-white shadow-lg shadow-primary/20" 
                              : "text-slate-400 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <item.icon className={cn("h-5 w-5", pathname.startsWith(item.href) ? "text-white" : "text-slate-500")} />
                            <span>{item.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.module === 'issues' && newMeldingenCount > 0 && (
                              <Badge variant="destructive" className="h-5 min-w-5 px-1 font-black text-[10px]">{newMeldingenCount}</Badge>
                            )}
                            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </div>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
                        <SidebarMenuSub className="border-l-2 border-white/5 ml-6 mt-1 space-y-1">
                          {item.subItems.filter(subItem => {
                              if (isSuperUser) return true;
                              if (!item.module) return true;
                              const tabPermissions = profile?.permissions?.[item.module]?.tabs;
                              return tabPermissions?.[subItem.id] ?? true; 
                            }).map((subItem) => (
                            <SidebarMenuSubItem key={subItem.href}>
                              <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
                                <Link 
                                  href={subItem.href} 
                                  onClick={onNavigate} 
                                  className={cn(
                                    "flex justify-between w-full items-center h-9 px-4 rounded-lg font-bold text-xs",
                                    pathname === subItem.href ? "text-white bg-white/10" : "text-slate-500 hover:text-white"
                                  )}
                                >
                                  <span>{subItem.label}</span>
                                  {subItem.id === 'portal' && newMeldingenCount > 0 && (
                                    <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px]">{newMeldingenCount}</Badge>
                                  )}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      className={cn(
                        "h-11 text-sm font-bold transition-all rounded-xl px-4",
                        pathname === item.href 
                          ? "bg-primary text-white shadow-lg shadow-primary/20" 
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Link href={item.href} onClick={onNavigate}>
                        <item.icon className={cn("h-5 w-5", pathname === item.href ? "text-white" : "text-slate-500")} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-white/5">
              <div className="bg-white/5 rounded-2xl p-3 flex items-center gap-3">
                <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                  <AvatarImage src={user?.photoURL || undefined} />
                  <AvatarFallback className="bg-primary text-white font-black text-xs">
                    {getInitials(profile?.firstName, profile?.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <p className="text-xs font-black text-white truncate">{profile?.displayName}</p>
                  <p className="text-[10px] font-bold text-slate-500 truncate uppercase tracking-tighter">{profile?.role}</p>
                </div>
              </div>
              <div className='mt-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center justify-center gap-2'>
                  <span>{version}</span>
                  {isSuperUser && (
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-600 hover:text-white" onClick={() => setIsVersionDialogOpen(true)}>
                      <Settings className="h-3 w-3" />
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
                    Pas het versienummer van de applicatie aan voor alle gebruikers.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label htmlFor="version-input">Versienummer</Label>
                <Input
                    id="version-input"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="font-mono"
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
