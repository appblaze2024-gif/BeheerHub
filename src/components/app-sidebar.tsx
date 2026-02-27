
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

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { selectedProjectId } = useProject();
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
    <div className="flex flex-col h-full bg-white">
      <ScrollArea className="flex-1">
        <div className="flex flex-col py-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.subItems?.some(sub => pathname === sub.href));
            const hasNewIssues = item.module === 'issues' && unapprovedCount > 0;
            
            if (item.subItems) {
              return (
                <Collapsible key={item.label} defaultOpen={isActive}>
                  <CollapsibleTrigger asChild>
                    <button className={cn(
                      "flex items-center w-full px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#f0f7fd]",
                      isActive ? "text-[#3498db] bg-[#f0f7fd]" : "text-slate-600"
                    )}>
                      <Icon className="h-5 w-5 mr-3 shrink-0" />
                      <span className="flex-1 text-left flex items-center justify-between">
                        {item.label}
                        {hasNewIssues && (
                          <Badge variant="destructive" className="h-4 min-w-4 px-1 flex items-center justify-center font-black text-[8px] rounded-full mr-2">
                            {unapprovedCount}
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isActive ? "" : "-rotate-90")} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="bg-slate-50/50">
                    {item.subItems.map((sub) => {
                      const isSubPortal = sub.id === 'portal';
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center pl-12 pr-4 py-2 text-[13px] font-medium transition-colors hover:text-[#3498db]",
                            pathname === sub.href ? "text-[#3498db] font-bold" : "text-slate-500"
                          )}
                        >
                          <span className="flex-1 flex items-center justify-between">
                            {sub.label}
                            {isSubPortal && unapprovedCount > 0 && (
                              <Badge variant="destructive" className="h-4 min-w-4 px-1 flex items-center justify-center font-black text-[8px] rounded-full">
                                {unapprovedCount}
                              </Badge>
                            )}
                          </span>
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#f0f7fd]",
                  isActive ? "text-[#3498db] bg-[#f0f7fd] border-r-4 border-[#3498db]" : "text-slate-600"
                )}
              >
                <Icon className="h-5 w-5 mr-3 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Systeem Online</span>
        </div>
      </div>
    </div>
  );
}
