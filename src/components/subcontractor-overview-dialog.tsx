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
import { Users, Info, Loader2, Calendar, LayoutGrid, Eye, EyeOff } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  sectionId?: string;
  resourceName: string;
  category: string;
  year: number;
  weeks: Record<string, string>;
  cellNotes?: Record<string, string>;
  color: string;
}

interface AnnualPlanningSection {
  id: string;
  projectId: string;
  year: number;
  title: string;
  order: number;
  hidden?: boolean;
}

export function SubcontractorOverviewDialog({
  open,
  onOpenChange,
  projectId,
  weekNumber,
  year,
}: SubcontractorOverviewDialogProps) {
  const firestore = useFirestore();

  const sectionsQuery = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return query(
      collection(firestore, 'annual_planning_sections'),
      where('projectId', '==', projectId),
      where('year', '==', year)
    );
  }, [firestore, projectId, year]);

  const planningQuery = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return query(
      collection(firestore, 'annual_planning'),
      where('projectId', '==', projectId),
      where('year', '==', year)
    );
  }, [firestore, projectId, year]);

  const { data: sectionsRaw, isLoading: isLoadingSections } = useCollection<AnnualPlanningSection>(sectionsQuery);
  const { data: items, isLoading: isLoadingItems } = useCollection<AnnualPlanningItem>(planningQuery);

  const handleToggleVisibility = (sectionId: string, currentHidden: boolean) => {
    if (!firestore || sectionId === 'default') return;
    updateDocumentNonBlocking(doc(firestore, 'annual_planning_sections', sectionId), {
      hidden: !currentHidden
    });
  };

  const groupedData = React.useMemo(() => {
    if (!items) return [];
    
    // Get all sections to allow toggling them back on
    const sections = sectionsRaw ? [...sectionsRaw].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
    
    // If no sections in DB, create default
    if (sections.length === 0 && (!sectionsRaw || sectionsRaw.length === 0)) {
      sections.push({ id: 'default', title: `Planning ${year}`, order: 0, projectId: projectId!, year, hidden: false });
    }

    return sections.map(section => {
      const sectionItems = items.filter(item => {
        const isInSection = item.sectionId === section.id || (section.id === 'default' && !item.sectionId);
        const weekValue = item.weeks?.[weekNumber.toString()];
        const isPlanned = weekValue && (parseFloat(weekValue.replace(',', '.')) > 0);
        return isInSection && isPlanned;
      }).sort((a, b) => a.resourceName.localeCompare(b.resourceName));

      return {
        ...section,
        items: sectionItems
      };
    }).filter(group => group.items.length > 0 || !group.hidden); 
  }, [items, sectionsRaw, weekNumber, year, projectId]);

  const isLoading = isLoadingSections || isLoadingItems;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 border-b bg-slate-50/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-primary h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Users className="text-white h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900">
                Inzet Overzicht Week {weekNumber}
              </DialogTitle>
              <DialogDescription className="font-bold text-slate-500">
                Beheer zichtbaarheid van planningen in het dagrapport.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col bg-white min-h-0">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jaarplanning analyseren...</p>
            </div>
          ) : groupedData.length > 0 ? (
            <ScrollArea className="h-full">
              <div className="p-6 space-y-8">
                {groupedData.map((group) => (
                  <div key={group.id} className={cn("space-y-4 transition-opacity", group.hidden && "opacity-40 grayscale-[0.5]")}>
                    <div className="flex items-center gap-3 border-b-2 border-slate-100 pb-2">
                      <LayoutGrid className="h-4 w-4 text-primary" />
                      <h3 className="font-black uppercase tracking-tighter text-slate-900">{group.title}</h3>
                      {group.hidden && (
                        <Badge variant="secondary" className="text-[8px] font-black uppercase bg-slate-200">Verborgen</Badge>
                      )}
                      
                      <div className="ml-auto flex items-center gap-2">
                        {group.id !== 'default' && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 rounded-full hover:bg-slate-100"
                                  onClick={() => handleToggleVisibility(group.id, !!group.hidden)}
                                >
                                  {group.hidden ? <EyeOff className="h-4 w-4 text-slate-400" /> : <Eye className="h-4 w-4 text-primary" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {group.hidden ? 'Zet dit blok weer aan' : 'Verberg dit blok in het overzicht'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-bold h-5">{group.items.length}</Badge>
                      </div>
                    </div>
                    
                    {!group.hidden ? (
                      <div className="grid gap-3">
                        {group.items.map((item) => {
                          const note = item.cellNotes?.[weekNumber.toString()];
                          const value = item.weeks?.[weekNumber.toString()];
                          
                          return (
                            <div 
                              key={item.id} 
                              className="p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/30 hover:bg-white hover:border-primary/20 transition-all flex flex-col gap-3 group"
                            >
                              <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-black text-sm uppercase tracking-tight text-slate-900 truncate">{item.resourceName}</h4>
                                    <Badge variant="outline" className="text-[8px] h-4 uppercase font-black tracking-widest border-2 bg-white">
                                      {item.category || 'Middel'}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                      <Calendar className="h-3 w-3" />
                                      <span>Week {weekNumber}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-primary uppercase">
                                      <span>Gepland: {value}</span>
                                    </div>
                                  </div>
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
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic ml-7">Blok is uitgeschakeld.</p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-300">
              <div className="bg-slate-50 p-8 rounded-full mb-4">
                <Users className="h-16 w-16 opacity-10" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-slate-400">Geen actieve inzet</h3>
              <p className="text-sm font-medium text-slate-400 max-w-[250px] mx-auto leading-relaxed">
                Er zijn voor week {weekNumber} geen geplande middelen gevonden.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50/80 backdrop-blur-md shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto font-black uppercase tracking-tight">
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}