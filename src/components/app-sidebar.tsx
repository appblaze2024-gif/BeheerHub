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
          <SidebarHeader className="p-8 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-5 w-full group">
              <div className="h-12 w-12 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-110 transition-premium">
                <Image 
                  src="https://i.ibb.co/kgtwqH50/favicon-32x32.png" 
                  alt="BeheerHub" 
                  width={40} 
                  height={40} 
                  className="object-contain"
                />
              </div>
              <div className="flex flex-col min-w-0">
                  <span className="font-black text-slate-900 uppercase tracking-tighter text-2xl leading-none">BeheerHub</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">Smart Infra Management</span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-6 space-y-10 no-scrollbar overflow-y-auto">
            <div className="space-y-3 px-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Actief Project</Label>
              <Select
                value={selectedProjectId || ''}
                onValueChange={(value) => setSelectedProjectId(value === '' ? null : value)}
                disabled={isLoadingProjects || isLoadingProject}
              >
                <SelectTrigger className="bg-slate-50 border-none text-slate-900 h-14 font-black uppercase tracking-tighter shadow-inner-soft rounded-2xl focus:ring-primary/10 transition-premium">
                  <SelectValue placeholder="Kies project..." />
                </SelectTrigger>
                <SelectContent className="rounded-3xl shadow-2xl border-slate-100 p-3">
                  {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id!} className="font-bold rounded-2xl h-12 focus:bg-slate-50">
                      {project.projectnaam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SidebarMenu className="gap-2">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  {item.subItems ? (
                    <Collapsible defaultOpen={pathname.startsWith(item.href)} className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={pathname.startsWith(item.href)}
                          className={cn(
                            "h-14 text-[14px] font-black uppercase tracking-tight justify-between transition-premium rounded-2xl px-5",
                            pathname.startsWith(item.href) 
                              ? "bg-primary text-white shadow-2xl shadow-primary/20" 
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <item.icon className={cn("h-5 w-5", pathname.startsWith(item.href) ? "text-white" : "text-slate-400")} />
                            <span>{item.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.module === 'issues' && newMeldingenCount > 0 && (
                              <Badge variant="destructive" className="h-6 min-w-6 px-1.5 font-black text-[10px] bg-red-500 border-none shadow-lg">{newMeldingenCount}</Badge>
                            )}
                            <ChevronRight className="h-4 w-4 transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
                          </div>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
                        <SidebarMenuSub className="border-l-4 border-slate-100 ml-7 mt-3 space-y-2 pb-3">
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
                                    "flex justify-between w-full items-center h-11 px-5 rounded-2xl font-black text-[11px] uppercase tracking-tighter transition-premium",
                                    pathname === subItem.href ? "text-primary bg-primary/5" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                  )}
                                >
                                  <span>{subItem.label}</span>
                                  {subItem.id === 'portal' && newMeldingenCount > 0 && (
                                    <Badge variant="destructive" className="h-5 min-w-5 px-1 font-black text-[9px] bg-red-500 border-none">{newMeldingenCount}</Badge>
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
                        "h-14 text-[14px] font-black uppercase tracking-tight transition-premium rounded-2xl px-5",
                        pathname === item.href 
                          ? "bg-primary text-white shadow-2xl shadow-primary/20" 
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

          <SidebarFooter className="p-6 border-t border-slate-100 bg-slate-50/50 shrink-0">
              <div className="bg-white rounded-[2rem] p-5 flex items-center gap-4 shadow-xl border-2 border-white/50">
                <Avatar className="h-12 w-12 border-4 border-white shadow-2xl ring-1 ring-slate-100 shrink-0">
                  <AvatarImage src={user?.photoURL || undefined} />
                  <AvatarFallback className="bg-primary text-white font-black text-xs">
                    {getInitials(profile?.firstName, profile?.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <p className="text-xs font-black text-slate-900 truncate uppercase tracking-tight leading-none mb-1">{profile?.displayName}</p>
                  <p className="text-[10px] font-bold text-slate-400 truncate uppercase tracking-widest leading-none">{profile?.role}</p>
                </div>
              </div>
              <div className='mt-6 flex items-center justify-center gap-4'>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">{version}</span>
                  {isSuperUser && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-primary hover:bg-white rounded-full shadow-lg border border-transparent hover:border-slate-100 transition-premium" onClick={() => setIsVersionDialogOpen(true)}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
              </div>
          </SidebarFooter>
      </Sidebar>
      <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
        <DialogContent className="rounded-[2.5rem] border-none shadow-2xl">
            <DialogHeader className="p-4">
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Software Versiebeheer</DialogTitle>
                <DialogDescription className="font-bold text-slate-500">
                    Pas het versienummer van de applicatie aan voor alle gebruikers.
                </DialogDescription>
            </DialogHeader>
            <div className="py-8">
                <Label htmlFor="version-input" className="text-[10px] font-black uppercase text-slate-400 ml-2">Nieuw versienummer</Label>
                <Input
                    id="version-input"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="h-14 font-mono font-bold rounded-2xl mt-3 bg-slate-50 border-none shadow-inner-soft text-lg text-center"
                />
            </div>
            <DialogFooter className="p-4">
                <Button variant="ghost" onClick={() => setIsVersionDialogOpen(false)} className="font-black uppercase tracking-widest text-[10px] text-slate-400">Annuleren</Button>
                <Button onClick={handleVersionSave} className="h-14 px-12 font-black uppercase tracking-tight shadow-2xl shadow-primary/20 rounded-2xl">Bijwerken</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}