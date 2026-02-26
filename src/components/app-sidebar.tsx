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
import Image from 'next/image';

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
  const version = settings?.version || 'V 1.8.5 P (182)';

  const [newVersion, setNewVersion] = React.useState(version);

  React.useEffect(() => {
    if (settings?.version) {
        setNewVersion(settings.version);
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
    if (!profile) return [];
    return allMenuItems.filter(item => {
      if (item.href === '/') return true;
      if (!item.module) return true;
      if (isSuperUser) return true;
      const modulePermissions = profile.permissions?.[item.module];
      return modulePermissions?.view || modulePermissions?.use || false;
    });
  }, [profile, isSuperUser]);
  
  return (
    <>
      <Sidebar isCollapsed={false} className="w-full bg-white border-r border-slate-100 shadow-none">
          <SidebarHeader className="p-6 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-4 w-full group">
              <div className="h-11 w-11 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-premium">
                <Image 
                  src="https://i.ibb.co/kgtwqH50/favicon-32x32.png" 
                  alt="BeheerHub" 
                  width={32} 
                  height={32} 
                  className="object-contain"
                />
              </div>
              <div className="flex flex-col min-w-0">
                  <span className="font-black text-slate-900 uppercase tracking-tighter text-xl leading-none">BeheerHub</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Smart Infra</span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-4 space-y-8 no-scrollbar overflow-y-auto">
            <div className="space-y-2.5 px-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Project Selectie</Label>
              <Select
                value={selectedProjectId || ''}
                onValueChange={(value) => setSelectedProjectId(value === '' ? null : value)}
                disabled={isLoadingProjects || isLoadingProject}
              >
                <SelectTrigger className="bg-slate-50 border-none text-slate-900 h-12 font-black uppercase tracking-tighter shadow-inner rounded-xl focus:ring-primary/10 transition-premium">
                  <SelectValue placeholder="Kies project..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-2xl border-slate-100 p-2">
                  {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id!} className="font-bold rounded-xl h-10 focus:bg-slate-50">
                      {project.projectnaam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SidebarMenu className="gap-1.5">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  {item.subItems ? (
                    <Collapsible defaultOpen={pathname.startsWith(item.href)} className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={pathname.startsWith(item.href)}
                          className={cn(
                            "h-12 text-[13px] font-black uppercase tracking-tight justify-between transition-premium rounded-2xl px-4",
                            pathname.startsWith(item.href) 
                              ? "bg-primary text-white shadow-xl shadow-primary/20" 
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <item.icon className={cn("h-5 w-5", pathname.startsWith(item.href) ? "text-white" : "text-slate-400")} />
                            <span>{item.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.module === 'issues' && newMeldingenCount > 0 && (
                              <Badge variant="destructive" className="h-5 min-w-5 px-1 font-black text-[10px] bg-red-500 border-none">{newMeldingenCount}</Badge>
                            )}
                            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </div>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
                        <SidebarMenuSub className="border-l-2 border-slate-100 ml-6 mt-2 space-y-1.5 pb-2">
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
                                    "flex justify-between w-full items-center h-10 px-4 rounded-xl font-bold text-xs transition-premium",
                                    pathname === subItem.href ? "text-primary bg-primary/5" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                  )}
                                >
                                  <span>{subItem.label}</span>
                                  {subItem.id === 'portal' && newMeldingenCount > 0 && (
                                    <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px] bg-red-500 border-none">{newMeldingenCount}</Badge>
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
                        "h-12 text-[13px] font-black uppercase tracking-tight transition-premium rounded-2xl px-4",
                        pathname === item.href 
                          ? "bg-primary text-white shadow-xl shadow-primary/20" 
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <Link href={item.href} onClick={onNavigate}>
                        <item.icon className={cn("h-5 w-5", pathname === item.href ? "text-white" : "text-slate-400")} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
              <div className="bg-white rounded-3xl p-4 flex items-center gap-4 shadow-sm border border-slate-100">
                <Avatar className="h-10 w-10 border-2 border-white shadow-md ring-1 ring-slate-100 shrink-0">
                  <AvatarImage src={user?.photoURL || undefined} />
                  <AvatarFallback className="bg-primary text-white font-black text-xs">
                    {getInitials(profile?.firstName, profile?.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <p className="text-xs font-black text-slate-900 truncate uppercase tracking-tight">{profile?.displayName}</p>
                  <p className="text-[10px] font-bold text-slate-400 truncate uppercase tracking-widest mt-0.5">{profile?.role}</p>
                </div>
              </div>
              <div className='mt-4 flex items-center justify-center gap-3'>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">{version}</span>
                  {isSuperUser && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-primary hover:bg-white rounded-full shadow-sm border border-transparent hover:border-slate-100 transition-premium" onClick={() => setIsVersionDialogOpen(true)}>
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                  )}
              </div>
          </SidebarFooter>
      </Sidebar>
      <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl">
            <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase tracking-tight">Software Versiebeheer</DialogTitle>
                <DialogDescription className="font-bold text-slate-500">
                    Pas het versienummer van de applicatie aan voor alle gebruikers.
                </DialogDescription>
            </DialogHeader>
            <div className="py-6">
                <Label htmlFor="version-input" className="text-[10px] font-black uppercase text-slate-400 ml-1">Nieuw versienummer</Label>
                <Input
                    id="version-input"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="h-12 font-mono font-bold rounded-xl mt-2 bg-slate-50 border-none shadow-inner"
                />
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setIsVersionDialogOpen(false)} className="font-bold text-slate-400">Annuleren</Button>
                <Button onClick={handleVersionSave} className="h-12 px-8 font-black uppercase tracking-tight shadow-xl shadow-primary/20">Opslaan</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}