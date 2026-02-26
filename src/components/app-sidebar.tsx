'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  ChevronRight,
  Box,
  Layers,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProject } from '@/context/project-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { allMenuItems } from '@/lib/menu-config';
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
    <div className="flex flex-col h-full bg-transparent">
      <div className="p-6">
        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 block ml-1">Current Active Space</label>
        <Select 
          value={selectedProjectId || ''} 
          onValueChange={v => setSelectedProjectId(v || null)}
        >
          <SelectTrigger className="h-12 font-black bg-white/50 border-white/40 rounded-2xl shadow-sm focus:ring-primary/20 backdrop-blur-sm transition-all hover:bg-white">
            <SelectValue placeholder="Select space..." />
          </SelectTrigger>
          <SelectContent className="rounded-2xl shadow-2xl border-slate-100 p-1">
            {projects?.map((p: any) => (
              <SelectItem key={p.id} value={p.id} className="font-bold rounded-xl h-10 px-3 cursor-pointer">
                {p.projectnaam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-8 pb-10">
          <div className="space-y-1">
            {menuItems.map((item) => (
              <div key={item.label} className="space-y-1">
                {item.subItems ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mt-4 mb-1">
                      <Layers className="h-3 w-3" />
                      {item.label}
                    </div>
                    {item.subItems.map(sub => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 px-4 h-11 rounded-2xl text-xs font-black uppercase tracking-tight transition-all duration-300 group",
                          pathname === sub.href 
                            ? "bg-primary text-white shadow-lg shadow-primary/30 translate-x-1" 
                            : "text-slate-500 hover:bg-white hover:text-slate-900"
                        )}
                      >
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-500",
                          pathname === sub.href ? "bg-white animate-glow" : "bg-slate-300 group-hover:bg-primary"
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
                      "flex items-center gap-4 px-4 h-12 rounded-2xl text-xs font-black uppercase tracking-tight transition-all duration-300 group",
                      pathname === item.href 
                        ? "bg-slate-900 text-white shadow-xl shadow-slate-900/20 translate-x-1" 
                        : "text-slate-500 hover:bg-white hover:text-slate-900"
                    )}
                  >
                    <item.icon className={cn(
                      "h-5 w-5 shrink-0 transition-all duration-300",
                      pathname === item.href ? "text-primary scale-110" : "text-slate-400 group-hover:text-primary"
                    )} />
                    <span className="truncate">{item.label}</span>
                    {pathname === item.href && (
                      <ChevronRight className="ml-auto h-4 w-4 text-white/40" />
                    )}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>

      <div className="p-6 border-t border-white/20">
        <div className="bg-slate-900/5 p-4 rounded-2xl flex items-center justify-between group cursor-pointer hover:bg-slate-900/10 transition-colors">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">System Engine</span>
            <span className="text-xs font-black text-slate-900 mt-1">v1.10.4-PRO</span>
          </div>
          <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}