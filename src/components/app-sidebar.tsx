'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProject } from '@/context/project-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { allMenuItems } from '@/lib/menu-config';
import { useProfile } from '@/firebase/profile-provider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile } = useProfile();
  const firestore = useFirestore();

  const isSuperUser = profile?.role === 'Super admin';

  // Fetch count of new issues for the portal badge
  const newIssuesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', '==', 'Nieuw'));
  }, [firestore]);

  const { data: newIssues } = useCollection<any>(newIssuesQuery);
  const unapprovedCount = newIssues?.length || 0;

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
    <div className="flex flex-col h-full sidebar-blue text-white items-center">
      <div className="py-6 shrink-0 flex items-center justify-center">
        <div className="h-10 w-10 relative">
          <Image 
            src="https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png" 
            alt="Logo" 
            fill 
            className="object-contain filter brightness-0 invert" 
          />
        </div>
      </div>

      <ScrollArea className="flex-1 w-full">
        <TooltipProvider delayDuration={0}>
          <div className="flex flex-col py-4 gap-4 items-center">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.subItems?.some(sub => pathname === sub.href));
              const hasNewIssues = item.module === 'issues' && unapprovedCount > 0;
              
              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "relative flex items-center justify-center h-12 w-12 rounded-full transition-all duration-300",
                        isActive 
                          ? "bg-white text-primary shadow-lg scale-110" 
                          : "text-blue-100 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      {hasNewIssues && (
                        <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center font-black text-[8px] rounded-full border-2 border-[#3b51a3]">
                          {unapprovedCount}
                        </Badge>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={15} className="font-black uppercase tracking-widest text-[10px] bg-slate-900 text-white border-none py-2 px-3">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </ScrollArea>

      <div className="p-6 shrink-0">
        <div className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)] animate-pulse" />
      </div>
    </div>
  );
}
