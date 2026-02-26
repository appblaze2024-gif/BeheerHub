'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Bell, 
  Map as MapIcon,
  ChevronRight,
  MapPin,
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapboxView } from '@/components/mapbox-view';
import { useProfile } from '@/firebase/profile-provider';
import { Badge } from '@/components/ui/badge';
import { useProject } from '@/context/project-context';

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { profile } = useProfile();
  const { selectedProjectId } = useProject();

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
    // Als er een project geselecteerd is, toon alleen die grenzen. Anders toon alles.
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
          <h2 className="text-2xl font-bold text-slate-900">Dashboard Overzicht</h2>
          <p className="text-sm text-slate-500">Real-time status van al uw beheer-objecten en meldingen.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Meldingen Paneel (50%) */}
        <Card className="border-none shadow-sm flex flex-col overflow-hidden h-full">
          <CardHeader className="border-b bg-white py-4 flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-600" />
              <CardTitle className="text-lg font-bold">Recente Meldingen</CardTitle>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[#3498db] font-bold" 
              onClick={() => router.push('/issues/portal')}
            >
              Alles bekijken
            </Button>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="divide-y">
                {recentIssues?.map((issue: any) => (
                  <div 
                    key={issue.id} 
                    onClick={() => router.push(`/issues/new?id=${issue.id}`)} 
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between group"
                  >
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

        {/* Kaart Paneel (50%) */}
        <Card className="border-none shadow-sm flex flex-col overflow-hidden h-full">
          <CardHeader className="border-b bg-white py-4 flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-[#3498db]" />
              <CardTitle className="text-lg font-bold">Gemeente Kaart</CardTitle>
            </div>
            {profile?.schouwenGemeente && (
              <Badge variant="outline" className="font-bold border-[#3498db] text-[#3498db]">
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
