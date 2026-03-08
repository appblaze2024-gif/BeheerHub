'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { allMenuItems, MenuItem, SubMenuItem } from '@/lib/menu-config';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProfile } from '@/firebase/profile-provider';
import type { Melding } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { profile } = useProfile();
  const isMobile = useIsMobile();
  const [activeModule, setActiveModule] = React.useState<MenuItem | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  // Reset scroll position when switching between main menu and submenus
  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0;
    }
  }, [activeModule]);

  // Fetch new reports for the notification badge
  const portalQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'), 
      where('status', '==', 'Nieuw')
    );
  }, [firestore]);

  const { data: newMeldingen } = useCollection<Melding>(portalQuery);
  const newCount = newMeldingen?.length || 0;

  // Permissie helpers
  const canViewModule = (moduleName?: string) => {
    if (profile?.role === 'Super admin') return true;
    if (!moduleName) return true;
    const modulePerms = profile?.permissions?.[moduleName];
    return !!modulePerms?.view || !!modulePerms?.use;
  };

  const canViewSubItem = (parentModule: string | undefined, sub: SubMenuItem) => {
    if (profile?.role === 'Super admin') return true;
    
    // Als het sub-item naar een eigen module verwijst
    if (sub.module) {
      return !!profile?.permissions?.[sub.module]?.view;
    }

    // Als het een tab is in de module van de ouder
    if (parentModule) {
      const modulePerms = profile?.permissions?.[parentModule];
      if (modulePerms?.tabs) {
        return !!modulePerms.tabs[sub.id];
      }
    }

    return true;
  };

  // Filter modules voor de grid
  const mainNavItems = React.useMemo(() => {
    return allMenuItems
      .filter(item => item.href !== '/') // Dashboard zelf niet tonen
      .filter(item => canViewModule(item.module));
  }, [profile]);

  const handleCardClick = (item: MenuItem) => {
    // Filter subItems op permissies
    const visibleSubItems = item.subItems?.filter(sub => canViewSubItem(item.module, sub));
    
    if (visibleSubItems && visibleSubItems.length > 0) {
      setActiveModule({
        ...item,
        subItems: visibleSubItems
      });
    } else {
      router.push(item.href);
    }
  };

  const handleSubItemClick = (sub: SubMenuItem) => {
    router.push(sub.href);
  };

  return (
    <div className="p-4 md:p-8 pt-4 md:pt-6 space-y-6 flex flex-col h-full bg-[#f8fafc] relative overflow-hidden">
      <header className="space-y-1 relative z-10">
        <div className="flex items-center gap-4">
          {activeModule && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 rounded-full bg-white shadow-md border border-slate-100 text-primary"
              onClick={() => setActiveModule(null)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-primary leading-tight">
              {activeModule ? activeModule.label : 'SYSTEEM MENU'}
            </h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              {activeModule ? `SUBMENU VOOR ${activeModule.label}` : 'SELECTEER EEN MODULE OM TE STARTEN'}
            </p>
          </div>
        </div>
      </header>

      <div 
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto no-scrollbar relative z-10"
      >
        {!activeModule ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card 
                  key={item.label}
                  onClick={() => handleCardClick(item)}
                  className="group relative overflow-hidden rounded-[2rem] border-none shadow-sm hover:shadow-2xl transition-all duration-500 cursor-pointer bg-white h-32"
                >
                  <CardContent className="p-5 h-full flex flex-col justify-between relative z-10">
                    <div className="flex justify-between items-start">
                      <div className="bg-slate-50 p-2 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-inner">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="h-7 w-7 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 translate-x-4">
                        <ChevronRight className="h-3.5 w-3.5 text-primary" />
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-1 group-hover:text-primary transition-colors">
                        {item.label}
                      </h3>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-6 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary w-1/3 group-hover:w-full transition-all duration-700 ease-out" />
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">
                          {item.subItems ? 'Bekijk opties' : 'Openen'}
                        </span>
                      </div>
                    </div>

                    {/* Notification Badge for Meldingen card */}
                    {item.label === 'Meldingen' && newCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute top-4 right-4 h-5 min-w-5 flex items-center justify-center font-black rounded-full border-2 border-white shadow-lg animate-in zoom-in"
                      >
                        {newCount}
                      </Badge>
                    )}
                  </CardContent>
                  
                  {/* Large faint background icon */}
                  <div className="absolute right-4 bottom-4 opacity-[0.03] group-hover:opacity-10 group-hover:text-primary transition-all duration-700 pointer-events-none transform translate-x-4 translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0">
                    <Icon className="h-24 w-24" />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20 animate-in fade-in slide-in-from-right-4 duration-500">
            {activeModule.subItems?.map((sub) => {
              const Icon = activeModule.icon; 
              const isPortalSubItem = sub.label === 'Portaal' || sub.id === 'portal';
              
              return (
                <Card 
                  key={sub.id}
                  onClick={() => handleSubItemClick(sub)}
                  className="group relative overflow-hidden rounded-[2rem] border-none shadow-sm hover:shadow-2xl transition-all duration-500 cursor-pointer bg-white h-32"
                >
                  <CardContent className="p-5 h-full flex flex-col justify-between relative z-10">
                    <div className="flex justify-between items-start">
                      <div className="bg-slate-50 p-2 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-inner">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="h-7 w-7 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 translate-x-4">
                        <ChevronRight className="h-3.5 w-3.5 text-primary" />
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-1 group-hover:text-primary transition-colors">
                        {sub.label}
                      </h3>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-6 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary w-full transition-all duration-700 ease-out" />
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">
                          Uitvoeren
                        </span>
                      </div>
                    </div>

                    {/* Notification Badge for Portaal sub-item */}
                    {isPortalSubItem && newCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute top-4 right-4 h-5 min-w-5 flex items-center justify-center font-black rounded-full border-2 border-white shadow-lg animate-in zoom-in"
                      >
                        {newCount}
                      </Badge>
                    )}
                  </CardContent>
                  
                  {/* Large faint background icon */}
                  <div className="absolute right-4 bottom-4 opacity-[0.03] group-hover:opacity-10 group-hover:text-primary transition-all duration-700 pointer-events-none transform translate-x-4 translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0">
                    <Icon className="h-24 w-24" />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
