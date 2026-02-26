'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  ChevronRight,
  Box,
  Layers,
  Activity,
  Zap
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
      <div className="p-8">
        <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4 block ml-1 opacity-60">Active Intelligence Space</label>
        <Select 
          value={selectedProjectId || ''} 
          onValueChange={v => setSelectedProjectId(v || null)}
        >
          <SelectTrigger className="h-14 font-black bg-white/80 border-white/60 rounded-2xl shadow-xl shadow-slate-200/40 focus:ring-primary/20 backdrop-blur-md transition-all hover:bg-white hover:scale-[1.02] active:scale-100">
            <SelectValue placeholder="System Select..." />
          </SelectTrigger>
          <SelectContent className="rounded-3xl shadow-2xl border-white/40 p-2 glass-panel">
            {projects?.map((p: any) => (
              <SelectItem key={p.id} value={p.id} className="font-black uppercase text-[10px] tracking-tight rounded-xl h-11 px-4 cursor-pointer">
                {p.projectnaam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1 px-6">
        <div className="space-y-10 pb-12">
          <div className="space-y-2">
            {menuItems.map((item) => (
              <div key={item.label} className="space-y-2">
                {item.subItems ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400/60 mt-6 border-b border-slate-100/50">
                      <Layers className="h-3 w-3" />
                      {item.label}
                    </div>
                    {item.subItems.map(sub => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-4 px-5 h-12 rounded-2xl text-[11px] font-black uppercase tracking-tight transition-all duration-500 group relative overflow-hidden",
                          pathname === sub.href 
                            ? "bg-primary text-white shadow-xl shadow-primary/30 translate-x-2" 
                            : "text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-md"
                        )}
                      >
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-700",
                          pathname === sub.href ? "bg-white scale-150 shadow-[0_0_8px_white]" : "bg-slate-300 group-hover:bg-primary"
                        )} />
                        <span className="truncate relative z-10">{sub.label}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-5 px-5 h-14 rounded-2xl text-xs font-black uppercase tracking-tight transition-all duration-500 group relative",
                      pathname === item.href 
                        ? "bg-slate-900 text-white shadow-2xl shadow-slate-900/20 translate-x-2" 
                        : "text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-lg"
                    )}
                  >
                    <item.icon className={cn(
                      "h-5 w-5 shrink-0 transition-all duration-500",
                      pathname === item.href ? "text-primary scale-125 rotate-3" : "text-slate-400 group-hover:text-primary group-hover:scale-110"
                    )} />
                    <span className="truncate relative z-10">{item.label}</span>
                    {pathname === item.href && (
                      <div className="ml-auto flex items-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                        <ChevronRight className="h-4 w-4 text-white/40 ml-2" />
                      </div>
                    )}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>

      <div className="p-8 mt-auto">
        <div className="bg-slate-900/5 backdrop-blur-sm p-5 rounded-[2rem] flex items-center justify-between group cursor-pointer hover:bg-white hover:shadow-xl transition-all duration-500 border border-transparent hover:border-white/40">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] leading-none mb-1.5">Intel Grid</span>
            <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">System Node Alpha</span>
          </div>
          <div className="relative">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]" />
            <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping opacity-40" />
          </div>
        </div>
      </div>
    </div>
  );
}