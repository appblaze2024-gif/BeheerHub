'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFirestore, useMemoFirebase, useCollection, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { allMenuItems, MenuItem, SubMenuItem } from '@/lib/menu-config';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProfile } from '@/firebase/profile-provider';
import type { Melding } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
  const isMobile = useIsMobile();
  const [activeModule, setActiveModule] = React.useState<MenuItem | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  const canViewModule = React.useCallback((moduleName?: string) => {
    if (profile?.role === 'Super admin') return true;
    if (!moduleName) return true;
    const modulePerms = profile?.permissions?.[moduleName];
    return !!modulePerms?.view || !!modulePerms?.use;
  }, [profile]);

  const canViewSubItem = React.useCallback((parentModule: string | undefined, sub: SubMenuItem) => {
    if (profile?.role === 'Super admin') return true;
    
    if (sub.module) {
      return !!profile?.permissions?.[sub.module]?.view;
    }

    if (parentModule) {
      const modulePerms = profile?.permissions?.[parentModule];
      if (modulePerms?.tabs) {
        return !!modulePerms.tabs[sub.id];
      }
    }

    return true;
  }, [profile]);

  React.useEffect(() => {
    if (!profile) return;
    
    const moduleParam = searchParams.get('module');
    if (moduleParam) {
      const item = allMenuItems.find(i => i.module === moduleParam);
      if (item && canViewModule(item.module)) {
        const visibleSubItems = item.subItems?.filter(sub => canViewSubItem(item.module, sub));
        if (visibleSubItems && visibleSubItems.length > 0) {
          setActiveModule({
            ...item,
            subItems: visibleSubItems
          });
        } else {
          setActiveModule(null);
        }
      } else {
        setActiveModule(null);
      }
    } else {
      setActiveModule(null);
    }
  }, [searchParams, profile, canViewModule, canViewSubItem]);

  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0;
    }
  }, [activeModule]);

  const portalQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'meldingen'), 
      where('status', '==', 'Nieuw')
    );
  }, [firestore, user]);

  const { data: newMeldingen } = useCollection<Melding>(portalQuery);
  const newCount = newMeldingen?.length || 0;

  const mainNavItems = React.useMemo(() => {
    return allMenuItems
      .filter(item => item.href !== '/')
      .filter(item => canViewModule(item.module));
  }, [profile, canViewModule]);

  const handleCardClick = (item: MenuItem) => {
    const visibleSubItems = item.subItems?.filter(sub => canViewSubItem(item.module, sub));
    
    if (visibleSubItems && visibleSubItems.length > 0) {
      router.push(`/?module=${item.module}`);
    } else {
      router.push(item.href);
    }
  };

  const handleSubItemClick = (sub: SubMenuItem) => {
    router.push(sub.href);
  };

  return (
    <div className="p-4 md:p-8 pt-0 md:pt-0 space-y-4 flex flex-col h-full bg-background relative overflow-hidden">
      <header className="space-y-1 relative z-10 pt-4 md:pt-0">
        <div className="flex items-center gap-4">
          {activeModule && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 rounded-none bg-white shadow-md border border-slate-100 text-primary"
              onClick={() => {
                router.push('/');
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-slate-900 leading-tight">
              {activeModule ? activeModule.label : 'Menu'}
            </h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              {activeModule ? `SUBMENU VOOR ${activeModule.label}` : 'SELECTEER EEN MODULE'}
            </p>
          </div>
        </div>
      </header>

      <div 
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto no-scrollbar relative z-10 pt-2"
      >
        {!activeModule ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card 
                  key={item.label}
                  onClick={() => handleCardClick(item)}
                  className="group relative overflow-hidden rounded-none border-none shadow-sm hover:shadow-xl transition-all duration-500 cursor-pointer bg-white h-36"
                >
                  <CardContent className="p-6 h-full flex flex-col justify-between relative z-10">
                    <div className="flex justify-between items-start">
                      <div className="bg-slate-50 p-2.5 rounded-none group-hover:bg-primary group-hover:text-white transition-all duration-500">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="h-8 w-8 rounded-none bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 translate-x-4">
                        <ChevronRight className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1 group-hover:text-primary transition-colors">
                        {item.label}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">
                          {item.subItems ? 'BEKIJK OPTIES' : 'OPENEN'}
                        </span>
                      </div>
                    </div>

                    {item.label === 'Meldingen' && newCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute top-4 right-4 h-6 min-w-6 flex items-center justify-center font-black rounded-none border-2 border-white shadow-lg animate-in zoom-in"
                      >
                        {newCount}
                      </Badge>
                    )}
                  </CardContent>
                  
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
                  className="group relative overflow-hidden rounded-none border-none shadow-sm hover:shadow-xl transition-all duration-500 cursor-pointer bg-white h-36"
                >
                  <CardContent className="p-6 h-full flex flex-col justify-between relative z-10">
                    <div className="flex justify-between items-start">
                      <div className="bg-slate-50 p-2.5 rounded-none group-hover:bg-primary group-hover:text-white transition-all duration-500">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="h-8 w-8 rounded-none bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 translate-x-4">
                        <ChevronRight className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1 group-hover:text-primary transition-colors">
                        {sub.label}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">
                          UITVOEREN
                        </span>
                      </div>
                    </div>

                    {isPortalSubItem && newCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute top-4 right-4 h-6 min-w-6 flex items-center justify-center font-black rounded-none border-2 border-white shadow-lg animate-in zoom-in"
                      >
                        {newCount}
                      </Badge>
                    )}
                  </CardContent>
                  
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
