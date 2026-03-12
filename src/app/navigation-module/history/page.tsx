'use client';

import * as React from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, limit } from 'firebase/firestore';
import { Loader2, Calendar, User as UserIcon, CheckCircle2, XCircle, Clock, History, ArrowLeft, Search, Filter, LayoutGrid, Navigation } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import type { UserProfile, Route } from '@/lib/types';

export default function RouteHistoryPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  
  const [selectedUserId, setSelectedUserId] = React.useState<string>('');
  const [selectedRoute, setSelectedRoute] = React.useState<Route | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);

  const routesQuery = useMemoFirebase(() => {
    if (!firestore || !selectedUserId) return null;
    return query(
      collection(firestore, 'users', selectedUserId, 'routes'),
      orderBy('startTime', 'desc'),
      limit(50)
    );
  }, [firestore, selectedUserId]);

  const { data: routes, isLoading: isLoadingRoutes } = useCollection<Route>(routesQuery);

  const filteredRoutes = React.useMemo(() => {
    if (!routes) return [];
    if (!searchTerm.trim()) return routes;
    const q = searchTerm.toLowerCase();
    return routes.filter(r => r.routeName.toLowerCase().includes(q));
  }, [routes, searchTerm]);

  // Safe date formatting helper
  const safeFormat = (dateStr: string | undefined, formatStr: string, options?: any) => {
    if (!dateStr) return '--:--';
    const date = new Date(dateStr);
    if (!isValid(date)) return '??:??';
    return format(date, formatStr, options);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 overflow-hidden">
      <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={() => router.push('/')}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Routegeschiedenis</h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 font-black px-3 h-7">
            {routes?.length || 0} Ritten Gevonden
          </Badge>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-80 border-r flex flex-col p-6 gap-6 bg-white shrink-0">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Selecteer Medewerker</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers}>
              <SelectTrigger className="h-12 font-bold border-2 rounded-2xl focus:ring-primary/20 bg-slate-50/50">
                <SelectValue placeholder="Kies medewerker..." />
              </SelectTrigger>
              <SelectContent className="rounded-2xl shadow-2xl">
                {users?.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.displayName || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 px-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gereden Ritten</Label>
                <div className="relative w-32">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
                    <Input 
                        placeholder="Filter..." 
                        className="h-7 pl-7 text-[9px] font-bold rounded-lg border-slate-100 bg-slate-50"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <ScrollArea className="flex-1 -mx-2 px-2">
              {isLoadingRoutes ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-20">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Laden...</p>
                </div>
              ) : filteredRoutes.length > 0 ? (
                <div className="space-y-3 pb-8">
                  {filteredRoutes.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoute(r)}
                      className={cn(
                        "w-full text-left p-4 rounded-2xl border-2 transition-all flex flex-col gap-2 hover:border-primary/30 active:scale-95",
                        selectedRoute?.id === r.id ? "bg-white border-primary shadow-xl scale-[1.02]" : "bg-white border-slate-50 hover:bg-slate-50 shadow-sm"
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-black text-xs uppercase tracking-tight text-slate-900 truncate pr-2 leading-none">{r.routeName}</span>
                        <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                          {safeFormat(r.startTime, 'dd MMM')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>{safeFormat(r.startTime, 'HH:mm')} - {safeFormat(r.endTime, 'HH:mm')}</span>
                      </div>
                      <div className="mt-1 space-y-1.5">
                          <Progress value={((r.completedObjects?.length || 0) / (r.totalObjects || 1)) * 100} className="h-1 bg-slate-100" />
                          <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                              <span className={cn(
                                  ((r.completedObjects?.length || 0) / (r.totalObjects || 1)) >= 1 ? "text-green-600" : "text-slate-400"
                              )}>{r.completedObjects?.length || 0} / {r.totalObjects || 0} Units</span>
                              <span className="text-slate-400">{Math.round(((r.completedObjects?.length || 0) / (r.totalObjects || 1)) * 100)}%</span>
                          </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : selectedUserId ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300 text-center gap-4">
                    <History className="h-12 w-12 opacity-10" />
                    <p className="text-[10px] font-black uppercase tracking-widest max-w-[150px]">Geen ritten gevonden voor deze gebruiker</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300 text-center gap-4">
                    <UserIcon className="h-12 w-12 opacity-10" />
                    <p className="text-[10px] font-black uppercase tracking-widest max-w-[150px]">Selecteer eerst een medewerker bovenaan</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col min-h-0 bg-slate-50">
          {selectedRoute ? (
            <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-500">
              <div className="p-8 bg-white border-b flex flex-col md:flex-row justify-between items-start md:items-end gap-6 shadow-sm">
                <div className="space-y-2">
                  <Badge variant="outline" className="border-2 border-primary/20 text-primary bg-primary/5 px-3 py-0.5 text-[9px] font-black uppercase tracking-widest">Rit Details</Badge>
                  <h3 className="text-3xl font-black uppercase tracking-tighter leading-none text-slate-900">{selectedRoute.routeName}</h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500 pt-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-300" /> 
                        {safeFormat(selectedRoute.startTime, 'eeee d MMMM yyyy', { locale: nl })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-300" /> 
                        {safeFormat(selectedRoute.startTime, 'HH:mm')} start
                      </div>
                      {selectedRoute.endTime && (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" /> 
                          {safeFormat(selectedRoute.endTime, 'HH:mm')} eind
                        </div>
                      )}
                  </div>
                </div>
                <div className="bg-slate-900 text-white p-6 rounded-[2rem] flex items-center gap-8 shadow-2xl">
                    <div className="text-center">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Voortgang</p>
                        <p className="text-2xl font-black">{Math.round(((selectedRoute.completedObjects?.length || 0) / (selectedRoute.totalObjects || 1)) * 100)}%</p>
                    </div>
                    <Separator orientation="vertical" className="h-8 bg-white/10" />
                    <div className="text-center">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Units</p>
                        <p className="text-2xl font-black">{selectedRoute.completedObjects?.length || 0} / {selectedRoute.totalObjects || 0}</p>
                    </div>
                </div>
              </div>

              <ScrollArea className="flex-1 p-8">
                <div className="max-w-5xl mx-auto space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Afgemeld */}
                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">
                      <CardHeader className="bg-green-500 text-white p-6">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-6 w-6" />
                            <CardTitle className="text-lg font-black uppercase tracking-tight">Voltooid ({selectedRoute.completedObjects?.length || 0})</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {selectedRoute.completedObjects?.map(id => (
                            <div key={id} className="p-2.5 bg-green-50 rounded-xl border-2 border-green-100 text-[10px] font-black text-green-800 flex items-center gap-2 transition-all hover:scale-105">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                              {id}
                            </div>
                          ))}
                          {(selectedRoute.completedObjects?.length || 0) === 0 && <span className="text-xs italic text-slate-400 font-medium py-4">Geen objecten afgemeld.</span>}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Niet Bezocht */}
                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">
                      <CardHeader className="bg-red-600 text-white p-6">
                        <div className="flex items-center gap-3">
                            <XCircle className="h-6 w-6" />
                            <CardTitle className="text-lg font-black uppercase tracking-tight">Overgeslagen ({selectedRoute.skippedObjects?.length || 0})</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {selectedRoute.skippedObjects?.map(id => (
                            <div key={id} className="p-2.5 bg-red-50 rounded-xl border-2 border-red-100 text-[10px] font-black text-red-800 flex items-center gap-2 transition-all hover:scale-105">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                              {id}
                            </div>
                          ))}
                          {(selectedRoute.skippedObjects?.length || 0) === 0 && <span className="text-xs italic text-slate-400 font-medium py-4 px-2">Alle objecten zijn bezocht!</span>}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">
                    <CardHeader className="p-6 border-b bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <LayoutGrid className="h-5 w-5 text-primary" />
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Gereden traject details</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-12 text-center text-slate-300">
                        <div className="bg-slate-50 p-8 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
                            <Navigation className="h-10 w-10 opacity-10" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] max-w-xs mx-auto">GPS traject log is gearchiveerd voor deze rit.</p>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-12 text-center bg-slate-50/30">
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl mb-8 animate-in zoom-in-95 duration-700 border-4 border-slate-100">
                  <History className="h-24 w-24 text-primary opacity-20 animate-pulse" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight text-slate-400 mb-2">Selecteer een rit</h3>
              <p className="text-sm font-medium text-slate-400 max-w-[300px] mx-auto leading-relaxed">
                Kies een medewerker en een rit aan de linkerkant om de afmeldgegevens en trajectdetails te bekijken.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
