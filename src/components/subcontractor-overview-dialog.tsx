'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Info, Loader2, Calendar } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SubcontractorOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  weekNumber: number;
  year: number;
}

interface AnnualPlanningItem {
  id: string;
  projectId: string;
  resourceName: string;
  category: string;
  year: number;
  weeks: Record<string, string>;
  cellNotes?: Record<string, string>;
  color: string;
}

export function SubcontractorOverviewDialog({
  open,
  onOpenChange,
  projectId,
  weekNumber,
  year,
}: SubcontractorOverviewDialogProps) {
  const firestore = useFirestore();

  const planningQuery = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return query(
      collection(firestore, 'annual_planning'),
      where('projectId', '==', projectId),
      where('year', '==', year)
    );
  }, [firestore, projectId, year]);

  const { data: items, isLoading } = useCollection<AnnualPlanningItem>(planningQuery);

  const activeSubcontractors = React.useMemo(() => {
    if (!items) return [];
    
    return items.filter(item => {
      const weekValue = item.weeks?.[weekNumber.toString()];
      return weekValue && (parseFloat(weekValue.replace(',', '.')) > 0);
    }).sort((a, b) => a.resourceName.localeCompare(b.resourceName));
  }, [items, weekNumber]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 border-b bg-slate-50/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-primary h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Users className="text-white h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900">
                Onderaannemers Week {weekNumber}
              </DialogTitle>
              <DialogDescription className="font-bold text-slate-500">
                Overzicht van externe inzet gebaseerd op de jaarplanning {year}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col bg-white">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jaarplanning analyseren...</p>
            </div>
          ) : activeSubcontractors.length > 0 ? (
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-3">
                {activeSubcontractors.map((sub) => {
                  const hours = sub.weeks[weekNumber.toString()];
                  const note = sub.cellNotes?.[weekNumber.toString()];
                  
                  return (
                    <div 
                      key={sub.id} 
                      className="p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/30 hover:bg-white hover:border-primary/20 transition-all flex flex-col gap-3 group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-black text-sm uppercase tracking-tight text-slate-900 truncate">{sub.resourceName}</h4>
                            <Badge variant="outline" className="text-[8px] h-4 uppercase font-black tracking-widest border-2 bg-white">{sub.category || 'Middel'}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                            <Calendar className="h-3 w-3" />
                            <span>Gepland voor week {weekNumber}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-primary leading-none">{hours}</p>
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-1">Inzetwaarde</p>
                        </div>
                      </div>
                      
                      {note && (
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                          <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                          <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">{note}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-300">
              <div className="bg-slate-50 p-8 rounded-full mb-4">
                <Users className="h-16 w-16 opacity-10" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-slate-400">Geen inzet gevonden</h3>
              <p className="text-sm font-medium text-slate-400 max-w-[250px] mx-auto leading-relaxed">
                Er zijn voor week {weekNumber} geen onderaannemers of middelen met een waarde groter dan 0 gevonden in de jaarplanning.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50/80 backdrop-blur-md">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto font-black uppercase tracking-tight">
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
