'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Loader2, Calendar, Settings2, Info, Pencil, Check, X } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking, addDocumentNonBlocking, deleteDocumentNonBlocking, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { useProject } from '@/context/project-context';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingScreen } from '@/components/loading-screen';

interface AnnualPlanningItem {
  id: string;
  projectId: string;
  resourceName: string;
  category: string;
  year: number;
  weeks: Record<string, string>;
  color: string;
  order: number;
}

interface AnnualMilestone {
  id: string;
  projectId: string;
  weekNumber: number;
  label: string;
  year: number;
}

interface AnnualPlanningConfig {
  id: string;
  projectId: string;
  year: number;
  title: string;
}

const WEEKS = Array.from({ length: 52 }, (_, i) => i + 1);

const CATEGORY_COLORS: Record<string, string> = {
  'Standaard': 'bg-white',
  'Yellow': 'bg-[#fff9c4]', 
  'Orange': 'bg-[#ffe0b2]', 
  'Header': 'bg-[#8e24aa] text-white', 
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - 1 + i);

export default function AnnualPlanningPage() {
  const { selectedProjectId } = useProject();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = React.useState(CURRENT_YEAR);
  const [isAddingRow, setIsAddingRow] = React.useState(false);
  const [isNewRowDialogOpen, setIsNewRowDialogOpen] = React.useState(false);
  
  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [tempTitle, setTempTitle] = React.useState('');

  // Milestone editing state
  const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = React.useState(false);
  const [selectedWeekForMilestone, setSelectedWeekForMilestone] = React.useState<number | null>(null);
  const [milestoneInput, setMilestoneInput] = React.useState('');
  const [isSavingMilestone, setIsSavingMilestone] = React.useState(false);

  const configId = `${selectedProjectId}_${selectedYear}`;
  const configRef = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return doc(firestore, 'annual_planning_configs', configId);
  }, [firestore, selectedProjectId, configId]);

  const { data: config, isLoading: isLoadingConfig } = useDoc<AnnualPlanningConfig>(configRef);

  const planningItemsQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return query(
      collection(firestore, 'annual_planning'),
      where('projectId', '==', selectedProjectId),
      where('year', '==', selectedYear)
    );
  }, [firestore, selectedProjectId, selectedYear]);

  const milestonesQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return query(
      collection(firestore, 'annual_milestones'),
      where('projectId', '==', selectedProjectId),
      where('year', '==', selectedYear)
    );
  }, [firestore, selectedProjectId, selectedYear]);

  const { data: itemsRaw, isLoading: isLoadingItems } = useCollection<AnnualPlanningItem>(planningItemsQuery);
  const { data: milestones, isLoading: isLoadingMilestones } = useCollection<AnnualMilestone>(milestonesQuery);

  const items = React.useMemo(() => {
    if (!itemsRaw) return [];
    return [...itemsRaw].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [itemsRaw]);

  const milestoneMap = React.useMemo(() => {
    const map: Record<number, string> = {};
    milestones?.forEach(m => {
      map[m.weekNumber] = m.label;
    });
    return map;
  }, [milestones]);

  const displayTitle = config?.title || `Jaarplanning ${selectedYear}`;

  const handleSaveTitle = () => {
    if (!configRef || !tempTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    setDocumentNonBlocking(configRef, {
      projectId: selectedProjectId,
      year: selectedYear,
      title: tempTitle.trim()
    }, { merge: true });
    setIsEditingTitle(false);
    toast({ title: 'Titel bijgewerkt' });
  };

  const handleCellChange = (itemId: string, week: number, value: string) => {
    if (!firestore) return;
    const itemRef = doc(firestore, 'annual_planning', itemId);
    updateDocumentNonBlocking(itemRef, {
      [`weeks.${week}`]: value
    });
  };

  const handleAddRow = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProjectId || !firestore) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const color = formData.get('color') as string;

    setIsAddingRow(true);
    try {
      addDocumentNonBlocking(collection(firestore, 'annual_planning'), {
        projectId: selectedProjectId,
        resourceName: name,
        color: color,
        year: selectedYear,
        order: (items?.length || 0) + 1,
        weeks: {}
      });
      toast({ title: 'Rij toegevoegd' });
      setIsAddingRow(false);
      setIsNewRowDialogOpen(false);
    } catch (e) {
      setIsAddingRow(false);
    }
  };

  const handleQuickMilestone = (week: number) => {
    const existing = milestones?.find(m => m.weekNumber === week);
    setMilestoneInput(existing?.label || '');
    setSelectedWeekForMilestone(week);
    setIsMilestoneDialogOpen(true);
  };

  const handleSaveQuickMilestone = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedWeekForMilestone === null || !firestore || !selectedProjectId) return;
    
    setIsSavingMilestone(true);
    const existing = milestones?.find(m => m.weekNumber === selectedWeekForMilestone);
    
    try {
      if (milestoneInput.trim() === '') {
        if (existing) {
          deleteDocumentNonBlocking(doc(firestore, 'annual_milestones', existing.id));
          toast({ title: 'Milestone verwijderd' });
        }
      } else {
        if (existing) {
          updateDocumentNonBlocking(doc(firestore, 'annual_milestones', existing.id), {
            label: milestoneInput.trim()
          });
          toast({ title: 'Milestone bijgewerkt' });
        } else {
          addDocumentNonBlocking(collection(firestore, 'annual_milestones'), {
            projectId: selectedProjectId,
            label: milestoneInput.trim(),
            weekNumber: selectedWeekForMilestone,
            year: selectedYear
          });
          toast({ title: 'Milestone toegevoegd' });
        }
      }
      setIsMilestoneDialogOpen(false);
    } catch (e) {
      console.error("Milestone error:", e);
    } finally {
      setIsSavingMilestone(false);
    }
  };

  const handleDeleteRow = (id: string) => {
    if (!firestore) return;
    deleteDocumentNonBlocking(doc(firestore, 'annual_planning', id));
  };

  const calculateRowTotal = (weeks: Record<string, string>) => {
    return Object.values(weeks || {}).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
  };

  const calculateWeekTotal = (week: number) => {
    return items?.reduce((acc, item) => acc + (parseFloat(item.weeks?.[week.toString()]) || 0), 0) || 0;
  };

  const grandTotal = React.useMemo(() => {
    return items?.reduce((acc, item) => acc + calculateRowTotal(item.weeks || {}), 0) || 0;
  }, [items]);

  if (!selectedProjectId) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center bg-slate-50 h-full">
        <Calendar className="h-16 w-16 text-slate-200 mb-4" />
        <h2 className="text-xl font-black uppercase tracking-tight">Geen project geselecteerd</h2>
        <p className="text-sm text-slate-500 mt-2">Selecteer eerst een project in de sidebar om de jaarplanning te bekijken.</p>
      </div>
    );
  }

  if (isLoadingItems || isLoadingMilestones || isLoadingConfig) {
    return <LoadingScreen message="Jaarplanning laden..." />;
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <PageHeader 
        title={""} 
        description="Overzicht van inzet en uren voor het gehele jaar."
        className="border-b shrink-0 py-3"
      >
        <div className="flex-1 flex items-center gap-4">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input 
                value={tempTitle} 
                onChange={(e) => setTempTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                className="h-8 font-black uppercase tracking-tight text-lg min-w-[300px]"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleSaveTitle}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div 
              className="flex items-center gap-2 group cursor-pointer" 
              onClick={() => { setTempTitle(displayTitle); setIsEditingTitle(true); }}
            >
              <h1 className="text-2xl font-black uppercase tracking-tighter text-slate-900 leading-none">{displayTitle}</h1>
              <Pencil className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select 
            value={selectedYear.toString()} 
            onValueChange={(v) => setSelectedYear(parseInt(v))}
          >
            <SelectTrigger className="w-[120px] h-8 font-bold bg-white border-2">
              <SelectValue placeholder="Kies jaar" />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => (
                <SelectItem key={y} value={y.toString()}>Jaar {y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto bg-slate-50 relative no-scrollbar">
        <div className="inline-block min-w-full p-2 lg:p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
            <table className="w-full border-collapse text-[10px] font-bold table-fixed">
              <thead>
                <tr className="bg-[#4caf50] text-white h-32">
                  <th className="sticky left-0 z-20 bg-[#4caf50] border-r border-white min-w-[250px] p-2 text-left align-top">
                    <div className="flex flex-col h-full justify-between">
                      <span className="text-[11px] font-black uppercase tracking-tighter">{displayTitle}</span>
                    </div>
                  </th>
                  {WEEKS.map(week => (
                    <th 
                      key={week} 
                      className="border-r border-white/20 relative p-0 w-6 overflow-visible h-32 group/header-cell cursor-pointer hover:bg-white/10 transition-colors"
                      onClick={() => handleQuickMilestone(week)}
                    >
                      {milestoneMap[week] ? (
                        <div className="absolute inset-0 flex items-center justify-center py-2">
                          <span 
                            className="whitespace-nowrap uppercase tracking-widest text-[10px] font-black text-white drop-shadow-sm"
                            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                          >
                            {milestoneMap[week]}
                          </span>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/header-cell:opacity-100 transition-opacity">
                          <Plus className="h-3.5 w-3.5 text-white/60" />
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="w-8 bg-[#388e3c]"></th>
                </tr>

                <tr className="bg-[#8e24aa] text-white h-8">
                  <th className="sticky left-0 z-20 bg-[#8e24aa] border-r border-white p-1 text-left uppercase tracking-tighter">
                    week
                  </th>
                  {WEEKS.map(week => (
                    <th key={week} className={cn(
                      "border-r border-white/20 text-center font-black w-6 h-8",
                      week % 13 === 0 && "border-r-2 border-red-500"
                    )}>
                      {week}
                    </th>
                  ))}
                  <th className="bg-[#6a1b9a] text-center uppercase tracking-tighter w-8">tot</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={cn("border-b border-slate-100 group transition-colors", CATEGORY_COLORS[item.color] || 'bg-white')}>
                    <td className={cn(
                      "sticky left-0 z-10 border-r border-slate-200 p-1.5 flex items-center justify-between h-8",
                      CATEGORY_COLORS[item.color] || 'bg-white'
                    )}>
                      <span className="pr-1 text-[11px] font-black uppercase tracking-tight whitespace-nowrap overflow-hidden">{item.resourceName}</span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                        onClick={() => handleDeleteRow(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                    {WEEKS.map(week => (
                      <td key={week} className={cn(
                        "border-r border-slate-100 p-0 text-center h-8 w-6",
                        week % 13 === 0 && "border-r-2 border-red-500"
                      )}>
                        <input
                          type="text"
                          defaultValue={item.weeks?.[week.toString()] || ''}
                          onBlur={(e) => handleCellChange(item.id, week, e.target.value)}
                          className="w-full h-full bg-transparent text-center focus:bg-white focus:outline-none focus:ring-inset focus:ring-1 focus:ring-primary tabular-nums"
                        />
                      </td>
                    ))}
                    <td className="bg-slate-50/50 text-center font-black text-[10px] tabular-nums border-l border-slate-200 h-8 w-8">
                      {calculateRowTotal(item.weeks || {}).toLocaleString()}
                    </td>
                  </tr>
                ))}
                
                <tr className="bg-slate-50/30 h-8">
                  <td className="sticky left-0 z-10 border-r border-slate-200 p-1 bg-white h-8">
                    <Dialog open={isNewRowDialogOpen} onOpenChange={setIsNewRowDialogOpen}>
                      <Button variant="ghost" size="sm" className="w-full h-6 font-black uppercase text-[9px] gap-1 hover:bg-slate-100" onClick={() => setIsNewRowDialogOpen(true)}>
                        <Plus className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <DialogContent>
                        <form onSubmit={handleAddRow}>
                          <DialogHeader>
                            <DialogTitle>Nieuwe Inzet Toevoegen ({selectedYear})</DialogTitle>
                          </DialogHeader>
                          <div className="py-4 space-y-4">
                            <div className="space-y-2">
                              <Label>Naam middel / medewerker</Label>
                              <Input name="name" placeholder="Bijv. Veegmachine 569" required />
                            </div>
                            <div className="space-y-2">
                              <Label>Kleur / Categorie</Label>
                              <Select name="color" defaultValue="Standaard">
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.keys(CATEGORY_COLORS).map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="submit" disabled={isAddingRow}>
                              {isAddingRow && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Toevoegen
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </td>
                  {WEEKS.map(week => (
                    <td key={week} className={cn(
                      "border-r border-slate-100 w-6 h-8",
                      week % 13 === 0 && "border-r-2 border-red-500"
                    )} />
                  ))}
                  <td className="border-l border-slate-200 h-8" />
                </tr>
              </tbody>

              <tfoot className="bg-slate-100 border-t border-slate-300">
                <tr className="h-10 font-black">
                  <td className="sticky left-0 z-10 bg-slate-100 border-r border-slate-300 p-2 uppercase tracking-tighter text-[9px] text-slate-500 h-8">
                    Totaal week
                  </td>
                  {WEEKS.map(week => (
                    <td key={week} className={cn(
                      "text-center tabular-nums border-r border-slate-300 w-6 h-8",
                      week % 13 === 0 && "border-r-2 border-red-500"
                    )}>
                      {calculateWeekTotal(week) || ''}
                    </td>
                  ))}
                  <td className="text-center text-[10px] text-primary bg-slate-200 h-8 w-8">
                    {grandTotal.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 bg-red-500 rounded-sm" />
              <span>Kwartaal scheiding</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-slate-200 border border-slate-300 rounded-sm" />
              <span>Compacte cellen (24px breed)</span>
            </div>
            <div className="flex items-center gap-2">
              <Info className="h-3 w-3" />
              <span>Direct bewerkbaar. Klik op de titel of de week-headers om tekst toe te voegen.</span>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isMilestoneDialogOpen} onOpenChange={setIsMilestoneDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSaveQuickMilestone}>
            <DialogHeader>
              <DialogTitle>Milestone Week {selectedWeekForMilestone}</DialogTitle>
              <DialogDescription>
                Voer tekst in die verticaal in de header wordt getoond. Laat leeg om te verwijderen.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input 
                value={milestoneInput} 
                onChange={(e) => setMilestoneInput(e.target.value)} 
                placeholder="Bijv. monumenten"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsMilestoneDialogOpen(false)}>Annuleren</Button>
              <Button type="submit" disabled={isSavingMilestone}>
                {isSavingMilestone && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Opslaan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
