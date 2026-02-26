'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MapPin, 
  Bell, 
  Navigation,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();

  const issuesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', '==', 'Nieuw'), limit(10));
  }, [firestore]);

  const { data: recentIssues } = useCollection<any>(issuesQuery);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dashboard Overzicht</h2>
          <p className="text-sm text-slate-500">Real-time status van al uw beheer-objecten en meldingen.</p>
        </div>
        <Button onClick={() => router.push('/navigation-module')} className="bg-[#3498db] hover:bg-[#2980b9] text-white font-bold h-10 px-6">
          <Navigation className="mr-2 h-4 w-4" /> Start Navigatie
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm h-full flex flex-col min-h-[500px]">
          <CardHeader className="border-b bg-white py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-600" />
              <CardTitle className="text-lg font-bold">Recente Meldingen</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="text-[#3498db] font-bold" onClick={() => router.push('/issues/portal')}>Alles bekijken</Button>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-[450px]">
              <div className="divide-y">
                {recentIssues?.map((issue) => (
                  <div key={issue.id} onClick={() => router.push('/issues/portal')} className="p-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between group">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded bg-slate-100 flex items-center justify-center font-bold text-slate-400 group-hover:bg-[#3498db] group-hover:text-white transition-colors">
                        {issue.intakenummer?.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate uppercase">{issue.subcategorie}</p>
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" /> {issue.straatnaam} {issue.huisnummer}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-[11px] font-bold text-slate-900">{issue.datum}</p>
                        <p className="text-[10px] text-slate-400">{issue.tijdstip}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#3498db]" />
                    </div>
                  </div>
                ))}
                {(!recentIssues || recentIssues.length === 0) && (
                  <div className="p-20 text-center text-slate-400">
                    <p className="font-medium">Geen nieuwe meldingen beschikbaar.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm h-full flex flex-col">
          <CardHeader className="border-b bg-white py-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#3498db]" />
              <CardTitle className="text-lg font-bold">Systeem Monitor</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-500">
                <span>Wagenpark Belasting</span>
                <span className="text-blue-600">85%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#3498db]" style={{ width: '85%' }} />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-500">
                <span>GIS Data Sync</span>
                <span className="text-green-600">Voltooid</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: '100%' }} />
              </div>
            </div>

            <div className="pt-4 grid grid-cols-1 gap-3">
              <Button variant="outline" className="w-full justify-start h-11 font-bold border-slate-200" onClick={() => router.push('/objects')}>
                <MapPin className="mr-3 h-4 w-4 text-[#3498db]" /> Objecten Terminal
              </Button>
              <Button variant="outline" className="w-full justify-start h-11 font-bold border-slate-200" onClick={() => router.push('/work-planning')}>
                <Activity className="mr-3 h-4 w-4 text-[#3498db]" /> Werkplanning Openen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
