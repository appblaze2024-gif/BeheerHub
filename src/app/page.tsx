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
  Zap,
  Radio,
  Layers,
  Sparkles
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
    { label: 'Active Assets', value: objects?.length || 0, icon: MapPin, color: 'text-primary', bg: 'bg-primary/5', trend: '+4%' },
    { label: 'Signal Stream', value: recentIssues?.length || 0, icon: Bell, color: 'text-rose-500', bg: 'bg-rose-50', trend: '-2%' },
    { label: 'Live Tracks', value: 4, icon: Navigation, color: 'text-sky-500', bg: 'bg-sky-50', trend: 'ACTIVE' },
    { label: 'System Pulse', value: '98%', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50', trend: 'OPTIMAL' },
  ];

  return (
    <div className="p-8 lg:p-12 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
            <Badge className="bg-white/80 backdrop-blur-md text-primary border-primary/20 text-[10px] font-black uppercase tracking-[0.2em] px-4 h-7 rounded-full shadow-sm">BeheerHub Core v1.10</Badge>
          </div>
          <h2 className="text-5xl font-black tracking-tighter text-slate-900 uppercase">Mission Deck</h2>
          <p className="text-slate-400 font-bold text-sm tracking-tight flex items-center gap-3">
            Real-time telemetry analysis for 
            <span className="text-slate-900 bg-white px-3 py-1 rounded-xl shadow-sm border border-white/40">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" className="h-14 px-8 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl border-white/60 bg-white/40 backdrop-blur-md hover:bg-white hover:shadow-xl transition-all">Deep Analytics</Button>
          <Button className="h-14 px-10 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl bg-primary text-white shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all group" onClick={() => router.push('/navigation-module')}>
            Launch Navigation
            <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card rounded-[2.5rem] p-8 group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <stat.icon className="h-24 w-24" />
            </div>
            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className={cn("p-4 rounded-2xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner", stat.bg)}>
                <stat.icon className={cn("h-7 w-7", stat.color)} />
              </div>
              <div className="flex items-center gap-1 text-[9px] font-black text-slate-400 bg-slate-100/50 px-2 py-1 rounded-lg">
                <TrendingUp className="h-3 w-3" />
                {stat.trend}
              </div>
            </div>
            <p className="text-5xl font-black tracking-tighter text-slate-900 relative z-10">{stat.value}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3 ml-1 relative z-10">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <Card className="lg:col-span-8 glass-card border-none rounded-[3rem] overflow-hidden">
          <CardHeader className="p-10 border-b border-slate-100 flex flex-row items-center justify-between bg-white/60">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Radio className="h-5 w-5 text-rose-500 animate-pulse" />
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Active Signals</CardTitle>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Priority dispatches requiring immediate processing.</p>
            </div>
            <Button variant="ghost" size="sm" className="font-black text-[10px] uppercase tracking-[0.2em] text-primary hover:bg-primary/5 px-6 h-10 rounded-xl" onClick={() => router.push('/issues/portal')}>Access Link</Button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="divide-y divide-slate-50">
                {recentIssues?.map((issue) => (
                  <div key={issue.id} onClick={() => router.push('/issues/portal')} className="p-8 hover:bg-primary/[0.03] transition-all group cursor-pointer flex items-center justify-between">
                    <div className="flex items-start gap-6">
                      <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-slate-300 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all uppercase text-xs shadow-inner">
                        {issue.intakenummer?.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-black text-slate-900 truncate uppercase tracking-tight group-hover:text-primary transition-colors">{issue.subcategorie}</p>
                        <p className="text-xs font-bold text-slate-400 truncate mt-2 flex items-center gap-2 uppercase tracking-tighter">
                          <MapPin className="h-3 w-3 text-primary/60" />
                          {issue.straatnaam} {issue.huisnummer}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-black uppercase text-slate-900 tracking-widest">{issue.datum}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{issue.tijdstip}</p>
                      </div>
                      <div className="h-12 w-12 rounded-2xl border-2 border-slate-100 flex items-center justify-center group-hover:border-primary group-hover:bg-white group-hover:shadow-xl transition-all">
                        <ChevronRight className="h-6 w-6 text-slate-300 group-hover:text-primary transition-all group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                ))}
                {(!recentIssues || recentIssues.length === 0) && (
                  <div className="p-40 text-center">
                    <div className="bg-slate-50 h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-8 animate-glow">
                      <Radio className="h-10 w-10 text-slate-200" />
                    </div>
                    <p className="font-black uppercase text-[10px] tracking-[0.3em] text-slate-300">All sectors clear</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="lg:col-span-4 space-y-10">
          <Card className="glass-card border-none rounded-[3rem] overflow-hidden">
            <CardHeader className="p-10 border-b border-slate-100 bg-white/60">
              <div className="flex items-center gap-3">
                <Layers className="h-5 w-5 text-primary" />
                <CardTitle className="text-2xl font-black uppercase tracking-tight">System Deck</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-10 space-y-10">
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Heavy Fleet Load</span>
                  <span className="text-xs font-black text-slate-900">85% <span className="text-[10px] text-emerald-500 ml-2">NORMAL</span></span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-primary rounded-full animate-in slide-in-from-left duration-1000 shadow-[0_0_15px_rgba(37,99,235,0.4)]" style={{ width: '85%' }} />
                </div>
              </div>
              
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Field Intel Active</span>
                  <span className="text-xs font-black text-slate-900">92% <span className="text-[10px] text-emerald-500 ml-2">SYNCED</span></span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-slate-900 rounded-full animate-in slide-in-from-left duration-1000 delay-300" style={{ width: '92%' }} />
                </div>
              </div>

              <div className="pt-6 grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 shadow-sm group hover:bg-emerald-50 hover:border-emerald-100 transition-all cursor-default">
                  <ShieldCheck className="h-6 w-6 text-emerald-500 mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Security</p>
                  <p className="text-sm font-black uppercase text-slate-900">Verified</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 shadow-sm group hover:bg-primary/5 hover:border-primary/10 transition-all cursor-default">
                  <Zap className="h-6 w-6 text-primary mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Protocol</p>
                  <p className="text-sm font-black uppercase text-slate-900">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-20 -bottom-20 h-64 w-64 bg-primary/20 rounded-full blur-[80px] group-hover:scale-150 transition-transform duration-1000" />
            <div className="relative z-10 space-y-8">
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Quick Override</h4>
                <p className="text-xl font-black uppercase tracking-tight">Direct Terminal Access</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <Button className="w-full h-14 bg-white text-slate-900 hover:bg-slate-100 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl group/btn shadow-xl" onClick={() => router.push('/objects')}>
                  Asset Terminal
                  <ArrowUpRight className="ml-3 h-4 w-4 group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                </Button>
                <Button variant="ghost" className="w-full h-14 text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl border border-white/10" onClick={() => router.push('/work-planning')}>
                  Operational Grid
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}