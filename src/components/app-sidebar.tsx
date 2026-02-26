'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ClipboardList, 
  MapPin, 
  Users, 
  Folder, 
  Truck, 
  Bell, 
  Navigation, 
  Mail, 
  Settings, 
  User, 
  FileWarning, 
  Cpu,
  ChevronRight,
  LayoutGrid,
  History,
  Command
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProject } from '@/context/project-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { allMenuItems, type MenuItem } from '@/lib/menu-config';
import { useProfile } from '@/firebase/profile-provider';

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { profile } = useProfile();
  const firestore = useFirestore();

  const projectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);
  const { data: projects } = useCollection<any>(projectsQuery);

  const isSuperUser = profile?.role === 'Super admin';

  const menuItems = React.useMemo(() => {
    return allMenuItems.filter(item => {
      if (item.href === '/') return true;
      if (!item.module) return true;
      if (isSuperUser) return true;
      const modulePermissions = profile?.permissions?.[item.module];
      return modulePermissions?.view || modulePermissions?.use || false;
    });
  }, [profile, isSuperUser]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b">
        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 block ml-1">Actief Project</label>
        <Select 
          value={selectedProjectId || ''} 
          onValueChange={v => setSelectedProjectId(v || null)}
        >
          <SelectTrigger className="h-10 font-bold bg-zinc-50 border-zinc-200 rounded-lg shadow-sm focus:ring-primary/10">
            <SelectValue placeholder="Kies project..." />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-2xl border-zinc-200">
            {projects?.map((p: any) => (
              <SelectItem key={p.id} value={p.id} className="font-semibold rounded-lg h-9">
                {p.projectnaam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 py-4 space-y-6">
          <div className="space-y-1">
            {menuItems.map((item) => (
              <div key={item.label} className="space-y-1">
                {item.subItems ? (
                  <div className="space-y-1">
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-tighter text-zinc-400 mt-2 ml-1"
                    )}>
                      {item.label}
                    </div>
                    {item.subItems.map(sub => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-semibold transition-all group",
                          pathname === sub.href 
                            ? "bg-zinc-900 text-white shadow-lg" 
                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        )}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          pathname === sub.href ? "bg-white" : "bg-zinc-300 group-hover:bg-zinc-400"
                        )} />
                        <span className="truncate">{sub.label}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-semibold transition-all group",
                      pathname === item.href 
                        ? "bg-zinc-900 text-white shadow-lg shadow-black/10" 
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <item.icon className={cn(
                      "h-4.5 w-4.5 shrink-0 transition-colors",
                      pathname === item.href ? "text-white" : "text-zinc-400 group-hover:text-zinc-900"
                    )} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-zinc-50/50">
        <div className="flex items-center justify-between px-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">v 1.9.0 Pro</span>
          <Link href="/help" className="text-zinc-400 hover:text-zinc-900 transition-colors">
            <Settings className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
