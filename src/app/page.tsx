'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ChevronRight,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { allMenuItems } from '@/lib/menu-config';

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();

  const bannerRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'dashboard_banner') : null, [firestore]);
  const { data: banner } = useDoc<any>(bannerRef);

  // Filter out 'Dashboard' itself from the grid to avoid recursion
  const navItems = allMenuItems.filter(item => item.href !== '/');

  return (
    <div className="p-10 space-y-10 flex flex-col h-full bg-[#f8fafc] relative">
      {/* Background Graphic Illustration - Compact and in Color */}
      <div className="absolute top-0 right-0 w-[500px] h-[400px] opacity-[0.15] pointer-events-none transition-all duration-1000">
        <Image 
          src="https://i.ibb.co/qMLXjXqz/top-view-paper-style-community-map-1.jpg" 
          alt="Community Map Illustration" 
          fill
          className="object-contain object-right-top"
          priority
        />
      </div>

      {/* Dynamic Banner Section */}
      {banner?.active && (
        <section className="relative h-64 w-full rounded-[2.5rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-700 shrink-0">
          <Image 
            src={banner.imageUrl || "https://images.unsplash.com/photo-1541888946425-d81bb19480c5?auto=format&fit=crop&q=80&w=2070"} 
            alt="Hero" 
            fill 
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 to-transparent flex flex-col justify-center p-12 text-white">
            <Badge className="w-fit mb-4 bg-primary text-white border-none px-4 py-1 font-black uppercase tracking-[0.2em] text-[10px]">
              {banner.badgeText || "Operationeel: OK"}
            </Badge>
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-2 max-w-xl leading-none">
              {banner.title || "Welkom bij BeheerHub"}
            </h2>
            <p className="text-lg font-bold text-slate-300 max-w-lg leading-snug">
              {banner.description || "Centraal beheer van infra- en reinigingsprojecten."}
            </p>
          </div>
        </section>
      )}

      <header className="space-y-2 relative z-10">
        <h1 className="text-3xl font-black uppercase tracking-tight text-[#4a5ab5]">Systeem Menu</h1>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Selecteer een module om te starten</p>
      </header>

      <ScrollArea className="flex-1 -mx-4 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-10">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card 
                key={item.label}
                onClick={() => router.push(item.href)}
                className="group relative overflow-hidden rounded-[2.5rem] border-none shadow-sm hover:shadow-2xl transition-all duration-500 cursor-pointer bg-white h-48"
              >
                <CardContent className="p-8 h-full flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div className="bg-slate-50 p-4 rounded-2xl group-hover:bg-[#4a5ab5] group-hover:text-white transition-all duration-500 shadow-inner">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 translate-x-4">
                      <ChevronRight className="h-5 w-5 text-[#4a5ab5]" />
                    </div>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-1 group-hover:text-[#4a5ab5] transition-colors">
                      {item.label}
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#4a5ab5] w-0 group-hover:w-full transition-all duration-700 ease-out" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">Module openen</span>
                    </div>
                  </div>
                </CardContent>
                
                {/* Large background decorative icon */}
                <div className="absolute -right-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 pointer-events-none transform group-hover:scale-110 group-hover:-rotate-12">
                  <Icon className="h-40 w-40" />
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
