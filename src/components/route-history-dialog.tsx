
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where } from 'firebase/firestore';
import { Loader2, Calendar, User as UserIcon, CheckCircle2, XCircle, Clock, History } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import type { UserProfile, Route } from '@/lib/types';

interface RouteHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

export function RouteHistoryDialog({ open, onOpenChange, projectId }: RouteHistoryDialogProps) {
  const firestore = useFirestore();
  const [selectedUserId, setSelectedUserId] = React.useState<string>('');
  const [selectedRoute, setSelectedRoute] = React.useState<Route | null>(null);

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);

  const routesQuery = useMemoFirebase(() => {
    if (!firestore || !selectedUserId) return null;
    const q = query(
      collection(firestore, 'users', selectedUserId, 'routes'),
      orderBy('startTime', 'desc')
    );
    if (projectId) {
        return query(q, where('projectId', '==', projectId));
    }
    return q;
  }, [firestore, selectedUserId, projectId]);

  const { data: routes, isLoading: isLoadingRoutes } = useCollection<Route>(routesQuery);

  React.useEffect(() => {
    if (!open) {
      setSelectedUserId('');
      setSelectedRoute(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 border-b bg-slate-50/50">
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Routegeschiedenis
          </DialogTitle>
          <DialogDescription className="font-bold text-slate-500">
            Bekijk gereden ritten en afgemelde objecten per medewerker.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-72 border-r flex flex-col p-4 gap-4 bg-slate-50/30">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selecteer Medewerker</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers}>
                <SelectTrigger className="h-10 font-bold border-2 focus:ring-primary/20">
                  <SelectValue placeholder="Kies medewerker..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Gereden Ritten</Label>
              <ScrollArea className="flex-1 -mx-2 px-2">
                {isLoadingRoutes ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : routes && routes.length > 0 ? (
                  <div className="space-y-2">
                    {routes.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRoute(r)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border-2 transition-all flex flex-col gap-1 hover:border-primary/30",
                          selectedRoute?.id === r.id ? "bg-white border-primary shadow-lg" : "bg-white/50 border-transparent hover:bg-white"
                        )}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-black text-xs uppercase tracking-tight text-slate-900 truncate pr-2">{r.routeName}</span>
                          <span className="text-[9px] font-bold text-slate-400">{format(new Date(r.startTime), 'dd MMM')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                          <Clock className="h-3 w-3" />
                          <span>{format(new Date(r.startTime), 'HH:mm')} - {r.endTime ? format(new Date(r.endTime), 'HH:mm') : '??:??'}</span>
                        </div>
                        <div className="mt-1 space-y-1">
                            <Progress value={((r.completedObjects?.length || 0) / (r.totalObjects || 1)) * 100} className="h-1" />
                            <div className="flex justify-between text-[8px] font-black uppercase text-slate-400">
                                <span>{r.completedObjects?.length || 0} Gereed</span>
                                <span>{Math.round(((r.completedObjects?.length || 0) / (r.totalObjects || 1)) * 100)}%</span>
                            </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : selectedUserId ? (
                  <div className="text-center py-12 text-slate-400 italic text-sm">Geen ritten gevonden voor deze gebruiker.</div>
                ) : (
                  <div className="text-center py-12 text-slate-400 italic text-sm">Selecteer eerst een medewerker.</div>
                )}
              </ScrollArea>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {selectedRoute ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="p-6 border-b flex justify-between items-end bg-slate-50/20">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">{selectedRoute.routeName}</h3>
                    <p className="text-xs font-bold text-slate-500 flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(selectedRoute.startTime), 'eeee d MMMM yyyy', { locale: nl })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Totale Voortgang</p>
                    <Badge variant="outline" className="h-8 px-4 text-sm font-black border-2 bg-white">
                        {selectedRoute.completedObjects?.length || 0} / {selectedRoute.totalObjects || 0} Units
                    </Badge>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b-2 border-green-100 pb-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <h4 className="text-sm font-black uppercase tracking-tight text-green-700">Afgemeld ({selectedRoute.completedObjects?.length || 0})</h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {selectedRoute.completedObjects?.map(id => (
                          <div key={id} className="p-2 bg-green-50 rounded-lg border border-green-100 text-[10px] font-black text-green-800 flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            {id}
                          </div>
                        ))}
                        {(selectedRoute.completedObjects?.length || 0) === 0 && <span className="text-xs italic text-slate-400">Geen objecten afgemeld.</span>}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b-2 border-red-100 pb-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <h4 className="text-sm font-black uppercase tracking-tight text-red-700">Niet Bezocht ({selectedRoute.skippedObjects?.length || 0})</h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {selectedRoute.skippedObjects?.map(id => (
                          <div key={id} className="p-2 bg-red-50 rounded-lg border border-red-100 text-[10px] font-black text-red-800 flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            {id}
                          </div>
                        ))}
                        {(selectedRoute.skippedObjects?.length || 0) === 0 && <span className="text-xs italic text-slate-400">Alle objecten zijn bezocht!</span>}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-12 text-center">
                <div className="bg-slate-50 p-8 rounded-full mb-4">
                    <History className="h-16 w-16 opacity-20" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight text-slate-400">Selecteer een rit</h3>
                <p className="text-sm font-medium text-slate-400 max-w-[200px]">Kies een medewerker en een rit aan de linkerkant om de details te bekijken.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
