'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MapPin, 
  Bell, 
  Navigation,
  Activity,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Cpu,
  ArrowUpRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const firestore = useFirestore();

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
    { label: 'Active Assets', value: objects?.length || 0, icon: MapPin, color: 'text-sky-500', bg: 'bg-sky-50', trend: '+4%' },
    { label: 'Unprocessed', value: recentIssues?.length || 0, icon: Bell, color: 'text-rose-500', bg: 'bg-rose-50', trend: '-2%' },
    { label: 'Live Routes', value: 4, icon: Navigation, color: 'text-indigo-500', bg: 'bg-indigo-50', trend: 'STABLE' },
    { label: 'Efficiency', value: '94%', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50', trend: '+1.2%' },
  ];

  return (
    <div className="p-6 lg:p-10 space-y-10 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-primary/10 text-primary border-none text-[10px] font-black uppercase tracking-widest px-3 h-6">Aero Tech Protocol Active</Badge>
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          </div>
          <h2 className="text-4xl font-black tracking-tighter text-slate-900 uppercase">Mission Center</h2>
          <p className="text-slate-500 font-bold text-sm tracking-tight">System analysis and real-time operational status for <span className="text-slate-900">{new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</span></p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="h-12 px-6 font-black uppercase text-xs tracking-widest rounded-2xl border-slate-200 hover:bg-white transition-all">Analytics Engine</Button>
          <Button className="h-12 px-8 font-black uppercase text-xs tracking-widest rounded-2xl bg-primary text-white shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all" onClick={() => router.push('/navigation-module')}>Initiate Navigation</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card rounded-[2rem] p-6 group">
            <div className="flex items-center justify-between mb-6">
              <div className={cn("p-3 rounded-2xl transition-transform duration-500 group-hover:scale-110", stat.bg)}>
                <stat.icon className={cn("h-6 w-6", stat.color)} />
              </div>
              <div className="flex items-center gap-1 text-[10px] font-black text-slate-400">
                <TrendingUp className="h-3 w-3" />
                {stat.trend}
              </div>
            </div>
            <p className="text-4xl font-black tracking-tighter text-slate-900">{stat.value}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 ml-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-8 glass-card border-none rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 border-b border-slate-100 flex flex-row items-center justify-between bg-white/40">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                <CardTitle className="text-xl font-black uppercase tracking-tight">Recent Signals</CardTitle>
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Incoming mission reports awaiting dispatch.</p>
            </div>
            <Button variant="ghost" size="sm" className="font-black text-[10px] uppercase tracking-widest text-primary hover:bg-primary/5" onClick={() => router.push('/issues/portal')}>Access Terminal</Button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[450px]">
              <div className="divide-y divide-slate-100">
                {recentIssues?.map((issue) => (
                  <div key={issue.id} onClick={() => router.push('/issues/portal')} className="p-6 hover:bg-primary/[0.02] transition-all group cursor-pointer flex items-center justify-between">
                    <div className="flex items-start gap-5">
                      <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-400 group-hover:bg-primary group-hover:text-white transition-all uppercase text-xs shadow-inner">
                        {issue.intakenummer?.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-black text-slate-900 truncate uppercase tracking-tight group-hover:text-primary transition-colors">{issue.subcategorie}</p>
                        <p className="text-xs font-bold text-slate-400 truncate mt-1 flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          {issue.straatnaam} {issue.huisnummer}, {issue.plaats}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-black uppercase text-slate-900 tracking-tighter">{issue.datum}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{issue.tijdstip}</p>
                      </div>
                      <div className="h-10 w-10 rounded-full border-2 border-slate-100 flex items-center justify-center group-hover:border-primary group-hover:bg-primary/5 transition-all">
                        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </div>
                ))}
                {(!recentIssues || recentIssues.length === 0) && (
                  <div className="p-32 text-center text-slate-300">
                    <Activity className="h-16 w-16 mx-auto mb-6 opacity-10 animate-pulse" />
                    <p className="font-black uppercase text-xs tracking-[0.2em]">Silence on all frequencies</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="lg:col-span-4 space-y-8">
          <Card className="glass-card border-none rounded-[2.5rem] overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-100 bg-white/40">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                <CardTitle className="text-xl font-black uppercase tracking-tight">Fleet Engine</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Heavy Machinery</span>
                  <span className="text-xs font-black text-slate-900">12 / 14 <span className="text-slate-300 ml-1">DEPLOYED</span></span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-primary rounded-full animate-in slide-in-from-left duration-1000" style={{ width: '85%' }} />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Field Personnel</span>
                  <span className="text-xs font-black text-slate-900">28 / 30 <span className="text-slate-300 ml-1">ACTIVE</span></span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-slate-900 rounded-full animate-in slide-in-from-left duration-1000 delay-300" style={{ width: '92%' }} />
                </div>
              </div>

              <div className="pt-4 grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <ShieldCheck className="h-5 w-5 text-green-500 mb-2" />
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Safety</p>
                  <p className="text-sm font-black uppercase">Cleared</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <Activity className="h-5 w-5 text-primary mb-2" />
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Status</p>
                  <p className="text-sm font-black uppercase">Optimal</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary p-8 rounded-[2.5rem] text-white shadow-2xl shadow-primary/40 relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 h-40 w-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            <div className="relative z-10">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-4">Quick Deployment</h4>
              <div className="grid grid-cols-1 gap-3">
                <Button className="w-full h-12 bg-white text-primary hover:bg-white/90 font-black uppercase text-[10px] tracking-widest rounded-2xl group/btn" onClick={() => router.push('/objects')}>
                  Asset Terminal
                  <ArrowUpRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                </Button>
                <Button className="w-full h-12 bg-primary-foreground/10 text-white hover:bg-primary-foreground/20 font-black uppercase text-[10px] tracking-widest rounded-2xl border border-white/20" onClick={() => router.push('/work-planning')}>
                  Master Schedule
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}