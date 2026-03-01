'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ChevronRight,
  ArrowLeft,
  LayoutDashboard
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { allMenuItems, MenuItem, SubMenuItem } from '@/lib/menu-config';

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const [activeModule, setActiveModule] = React.useState<MenuItem | null>(null);

  const bannerRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'dashboard_banner') : null, [firestore]);
  const { data: banner } = useDoc<any>(bannerRef);

  // Filter out 'Dashboard' itself from the grid to avoid recursion
  const mainNavItems = allMenuItems.filter(item => item.href !== '/');

  const handleCardClick = (item: MenuItem) => {
    if (item.subItems && item.subItems.length > 0) {
      setActiveModule(item);
    } else {
      router.push(item.href);
    }
  };

  const handleSubItemClick = (sub: SubMenuItem) => {
    router.push(sub.href);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 flex flex-col h-full bg-[#f8fafc] relative overflow-hidden">
      {/* Dynamic Banner Section */}
      {banner?.active && !activeModule && (
        <section className="relative h-40 w-full rounded-2xl overflow-hidden shadow-xl animate-in fade-in zoom-in duration-700 shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 to-transparent flex flex-col justify-center p-8 text-white">
            <Badge className="w-fit mb-2 bg-primary text-white border-none px-3 py-0.5 font-black uppercase tracking-[0.2em] text-[9px]">
              {banner.badgeText || "Operationeel: OK"}
            </Badge>
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-1 max-w-xl leading-none">
              {banner.title || "Welkom bij BeheerHub"}
            </h2>
            <p className="text-sm font-bold text-slate-300 max-w-lg leading-snug">
              {banner.description || "Centraal beheer van infra- en reinigingsprojecten."}
            </p>
          </div>
        </section>
      )}

      <header className="space-y-1 relative z-10">
        <div className="flex items-center gap-4">
          {activeModule && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 rounded-full bg-white shadow-sm border border-slate-100 text-[#3498db]"
              onClick={() => setActiveModule(null)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-[#3498db]">
              {activeModule ? activeModule.label : 'Systeem Menu'}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {activeModule ? `Submenu voor ${activeModule.label}` : 'Selecteer een module om te starten'}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative z-10">
        {!activeModule ? (
          <div className="grid grid-cols-4 grid-rows-3 gap-4 pb-6 h-full">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card 
                  key={item.label}
                  onClick={() => handleCardClick(item)}
                  className="group relative overflow-hidden rounded-2xl border-none shadow-sm hover:shadow-xl transition-all duration-500 cursor-pointer bg-white h-full"
                >
                  <CardContent className="p-4 h-full flex flex-col justify-between relative z-10">
                    <div className="flex justify-between items-start mb-2">
                      <div className="bg-slate-50 p-2.5 rounded-xl group-hover:bg-[#3498db] group-hover:text-white transition-all duration-500 shadow-inner">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 translate-x-4">
                        <ChevronRight className="h-4 w-4 text-[#3498db]" />
                      </div>
                    </div>
                    
                    <div className="relative">
                      <div className="mb-2">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-1 group-hover:text-[#3498db] transition-colors truncate">
                          {item.label}
                        </h3>
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-8 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#3498db] w-0 group-hover:w-full transition-all duration-700 ease-out" />
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">
                            {item.subItems ? 'Bekijk opties' : 'Openen'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <div className="absolute right-2 bottom-2 opacity-[0.05] group-hover:opacity-20 group-hover:text-[#3498db] transition-all duration-700 pointer-events-none transform">
                    <Icon className="h-20 w-20" />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-4 grid-rows-3 gap-4 pb-6 h-full animate-in fade-in slide-in-from-right-4 duration-500">
            {activeModule.subItems?.map((sub) => {
              const Icon = activeModule.icon; // Use parent icon for subs if no specific icon
              return (
                <Card 
                  key={sub.id}
                  onClick={() => handleSubItemClick(sub)}
                  className="group relative overflow-hidden rounded-2xl border-none shadow-sm hover:shadow-xl transition-all duration-500 cursor-pointer bg-white h-full"
                >
                  <CardContent className="p-4 h-full flex flex-col justify-between relative z-10">
                    <div className="flex justify-between items-start mb-2">
                      <div className="bg-slate-50 p-2.5 rounded-xl group-hover:bg-[#3498db] group-hover:text-white transition-all duration-500 shadow-inner">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 translate-x-4">
                        <ChevronRight className="h-4 w-4 text-[#3498db]" />
                      </div>
                    </div>
                    
                    <div className="relative">
                      <div className="mb-2">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-1 group-hover:text-[#3498db] transition-colors truncate">
                          {sub.label}
                        </h3>
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-8 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#3498db] w-0 group-hover:w-full transition-all duration-700 ease-out" />
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">
                            Uitvoeren
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <div className="absolute right-2 bottom-2 opacity-[0.05] group-hover:opacity-20 group-hover:text-[#3498db] transition-all duration-700 pointer-events-none transform">
                    <Icon className="h-20 w-20" />
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