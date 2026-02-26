'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LayoutGrid, 
  MapPin, 
  Bell, 
  History, 
  TrendingUp, 
  Navigation,
  ArrowRight,
  Package,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit, orderBy } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useProject } from '@/context/project-context';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { selectedProjectId } = useProject();

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const issuesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', '==', 'Nieuw'), limit(10));
  }, [firestore]);

  const { data: objects } = useCollection<any>(objectsQuery);
  const { data: recentIssues } = useCollection<any>(issuesQuery);

  const stats = [
    { label: 'Totaal Objecten', value: objects?.length || 0, icon: MapPin, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Nieuwe Meldingen', value: recentIssues?.length || 0, icon: Bell, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Actieve Routes', value: 4, icon: Navigation, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Gereed Vandaag', value: '82%', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="p-6 md:p-8 space-y-10 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Welkom terug</h2>
          <p className="text-zinc-500 font-medium">Systeemoverzicht en operationele status voor vandaag.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10 font-bold border-zinc-200">Rapport Export</Button>
          <Button className="h-10 font-bold bg-zinc-900 shadow-xl shadow-black/10" onClick={() => router.push('/navigation-module')}>Start Navigatie</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-none shadow-sm bg-white ring-1 ring-zinc-200 rounded-xl overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2.5 rounded-lg", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 font-bold text-[10px]">+12%</Badge>
              </div>
              <p className="text-3xl font-extrabold tracking-tighter text-zinc-900">{stat.value}</p>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-8 border-none shadow-sm ring-1 ring-zinc-200 rounded-2xl overflow-hidden">
          <CardHeader className="p-6 border-b flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold">Nieuwe Meldingen</CardTitle>
              <p className="text-xs font-medium text-zinc-400">De meest recente meldingen die wachten op verwerking.</p>
            </div>
            <Button variant="ghost" size="sm" className="font-bold text-zinc-500" onClick={() => router.push('/issues/portal')}>Alles bekijken</Button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-zinc-100">
                {recentIssues?.map((issue) => (
                  <div key={issue.id} className="p-4 hover:bg-zinc-50 transition-colors group cursor-pointer flex items-center justify-between">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center font-bold text-zinc-400 group-hover:bg-zinc-200 transition-colors uppercase text-[10px]">
                        {issue.intakenummer?.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-900 truncate uppercase tracking-tight">{issue.subcategorie}</p>
                        <p className="text-xs font-medium text-zinc-500 truncate">{issue.straatnaam} {issue.huisnummer}, {issue.plaats}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">{issue.datum}</p>
                        <p className="text-[10px] font-bold text-zinc-900">{issue.tijdstip}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-900 transition-all group-hover:translate-x-1" />
                    </div>
                  </div>
                ))}
                {(!recentIssues || recentIssues.length === 0) && (
                  <div className="p-20 text-center text-zinc-300">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-10" />
                    <p className="font-bold uppercase text-xs tracking-widest">Geen nieuwe meldingen</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 border-none shadow-sm ring-1 ring-zinc-200 rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-6 border-b">
            <CardTitle className="text-lg font-bold">Inzet Status</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Voertuigen</span>
                <span className="text-xs font-extrabold">12 / 14</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-900 rounded-full" style={{ width: '85%' }} />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Personeel</span>
                <span className="text-xs font-extrabold">28 / 30</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-900 rounded-full" style={{ width: '92%' }} />
              </div>
            </div>

            <Separator className="bg-zinc-100" />

            <div className="space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Quick Links</h4>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-9 text-[10px] font-bold uppercase rounded-lg border-zinc-200" onClick={() => router.push('/objects')}>Units beheer</Button>
                <Button variant="outline" className="h-9 text-[10px] font-bold uppercase rounded-lg border-zinc-200" onClick={() => router.push('/employees')}>Rooster</Button>
                <Button variant="outline" className="h-9 text-[10px] font-bold uppercase rounded-lg border-zinc-200" onClick={() => router.push('/iot')}>IOT Status</Button>
                <Button variant="outline" className="h-9 text-[10px] font-bold uppercase rounded-lg border-zinc-200" onClick={() => router.push('/bestanden')}>Documenten</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
