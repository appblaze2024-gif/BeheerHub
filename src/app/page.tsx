'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Bell, 
  Map as MapIcon,
  ChevronRight,
  MapPin,
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapboxView } from '@/components/mapbox-view';
import { useProfile } from '@/firebase/profile-provider';
import { Badge } from '@/components/ui/badge';
import { useProject } from '@/context/project-context';
import Image from 'next/image';

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { profile } = useProfile();
  const { selectedProjectId } = useProject();

  const bannerRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'dashboard_banner') : null, [firestore]);
  const { data: banner } = useDoc<any>(bannerRef);

  const issuesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', '==', 'Nieuw'), limit(20));
  }, [firestore]);

  const { data: recentIssues } = useCollection<any>(issuesQuery);

  const projectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects } = useCollection<any>(projectsQuery);

  const wijkPolygons = React.useMemo(() => {
    if (!projects) return [];
    const projectsToUse = selectedProjectId 
      ? projects.filter((p: any) => p.id === selectedProjectId) 
      : projects;

    return projectsToUse.flatMap((p: any) => 
      (p.wijken || []).flatMap((wijk: any) => {
        try {
          const features = JSON.parse(wijk.subGebieden);
          return Array.isArray(features) ? features : [];
        } catch (e) {
          console.error("Error parsing wijk geometry:", e);
          return [];
        }
      })
    );
  }, [projects, selectedProjectId]);

  return (
    <div className="p-6 space-y-6 h-full flex flex-col">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 leading-none">Dashboard Overzicht</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time status van al uw beheer-objecten en meldingen.</p>
        </div>
      </header>

      {banner?.active && (
        <div className="relative h-56 w-full rounded-[3rem] overflow-hidden shadow-2xl mb-2 group shrink-0 border-4 border-white animate-in fade-in zoom-in duration-700">
          <Image 
            src={banner.imageUrl || "https://images.unsplash.com/photo-1541888946425-d81bb19480c5?auto=format&fit=crop&q=80&w=2070"} 
            alt="Hero Banner" 
            fill 
            className="object-cover transition-transform duration-[2000ms] group-hover:scale-105"
            priority
            data-ai-hint="construction road"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent flex flex-col justify-center px-12">
            {banner.badgeText && (
              <Badge className="w-fit mb-4 bg-primary border-none font-black text-[10px] uppercase tracking-[0.2em] h-6 px-4 rounded-full shadow-lg">
                {banner.badgeText}
              </Badge>
            )}
            <h1 className="text-5xl font-black text-white uppercase tracking-tighter leading-none mb-3 drop-shadow-2xl">
              {banner.title || 'BeheerHub Dashboard'}
            </h1>
            <p className="text-white/80 font-bold text-base max-w-lg leading-relaxed drop-shadow-lg">
              {banner.description || 'Real-time status van al uw beheer-objecten en meldingen binnen de gemeente.'}
            </p>
          </div>
          <div className="absolute bottom-6 right-8">
             <div className="h-3 w-3 rounded-full bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.8)] animate-pulse" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <Card className="rounded-[2.5rem] border-none shadow-xl flex flex-col overflow-hidden h-full bg-white">
          <CardHeader className="border-b bg-white py-5 px-8 flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-red-50 p-2 rounded-xl"><Bell className="h-5 w-5 text-red-600" /></div>
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Recente Meldingen</CardTitle>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary/5" 
              onClick={() => router.push('/issues/portal')}
            >
              Alles bekijken
            </Button>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="divide-y divide-slate-50">
                {recentIssues?.map((issue: any) => (
                  <div 
                    key={issue.id} 
                    onClick={() => router.push(`/issues/new?id=${issue.id}`)} 
                    className="px-8 py-5 hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-5 min-w-0">
                      <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                        {issue.intakenummer?.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate uppercase tracking-tight">{issue.subcategorie}</p>
                        <p className="text-[10px] text-slate-400 truncate font-bold flex items-center gap-1.5 mt-1 uppercase tracking-widest">
                          <MapPin className="h-3 w-3 text-primary" /> {issue.straatnaam} {issue.huisnummer}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0 ml-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">{issue.datum}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{issue.tijdstip}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-200 group-hover:text-primary transition-all group-hover:translate-x-1" />
                    </div>
                  </div>
                ))}
                {(!recentIssues || recentIssues.length === 0) && (
                  <div className="p-20 text-center text-slate-300 flex flex-col items-center">
                    <div className="bg-slate-50 p-6 rounded-full mb-4 opacity-50"><Bell className="h-10 w-10" /></div>
                    <p className="font-black uppercase text-[10px] tracking-widest">Geen nieuwe meldingen</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-xl flex flex-col overflow-hidden h-full bg-white">
          <CardHeader className="border-b bg-white py-5 px-8 flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 p-2 rounded-xl"><MapIcon className="h-5 w-5 text-primary" /></div>
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Gemeente Kaart</CardTitle>
            </div>
            {profile?.schouwenGemeente && (
              <Badge variant="outline" className="font-black uppercase text-[9px] tracking-widest border-2 h-6 px-3 bg-white">
                {profile.schouwenGemeente}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0 flex-1 relative min-h-[400px]">
            <MapboxView 
              interactive={true} 
              showHeatmap={false} 
              wijkPolygons={wijkPolygons}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
