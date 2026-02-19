
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Loader2, Calendar, Settings2, Info } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
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

const WEEKS = Array.from({ length: 52 }, (_, i) => i + 1);

const CATEGORY_COLORS: Record<string, string> = {
  'Standaard': 'bg-white',
  'Yellow': 'bg-[#fff9c4]', 
  'Orange': 'bg-[#ffe0b2]', 
  'Header': 'bg-[#8e24aa] text-white', 
};

export default function AnnualPlanningPage() {
  const { selectedProjectId } = useProject();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = React.useState(2026);
  const [isAddingRow, setIsAddingRow] = React.useState(false);
  const [isAddingMilestone, setIsAddingMilestone] = React.useState(false);

  // Firestore Queries (Top-level collections filtered by projectId)
  const planningItemsQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    // Sorteren gebeurt in-memory om index-permissiefouten te voorkomen
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

  // In-memory sortering op basis van 'order' veld
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
    } catch (e) {
      setIsAddingRow(false);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProjectId || !firestore) return;
    const formData = new FormData(e.currentTarget);
    const label = formData.get('label') as string;
    const week = parseInt(formData.get('week') as string);

    setIsAddingMilestone(true);
    try {
      addDocumentNonBlocking(collection(firestore, 'annual_milestones'), {
        projectId: selectedProjectId,
        label,
        weekNumber: week,
        year: selectedYear
      });
      toast({ title: 'Milestone toegevoegd' });
      setIsAddingMilestone(false);
    } catch (e) {
      setIsAddingMilestone(false);
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

  if (isLoadingItems || isLoadingMilestones) {
    return <LoadingScreen message="Jaarplanning laden..." />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white overflow-hidden">
      <PageHeader 
        title={`Jaarplanning ${selectedYear}`} 
        description="Overzicht van inzet en uren voor het gehele jaar."
        className="border-b"
      >
        <div className="flex items-center gap-2">
          <Dialog>
            <Button asChild variant="outline" size="sm" className="font-bold cursor-pointer">
              <span className="flex items-center">
                <Settings2 className="mr-2 h-4 w-4" /> Milestone
              </span>
            </Button>
            <DialogContent>
              <form onSubmit={handleAddMilestone}>
                <DialogHeader>
                  <DialogTitle>Nieuwe Milestone</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input name="label" placeholder="Bijv. monumenten" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Weeknummer (1-52)</Label>
                    <Input name="week" type="number" min="1" max="52" required />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isAddingMilestone}>
                    {isAddingMilestone && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Opslaan
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog>
            <Button asChild size="sm" className="font-black uppercase tracking-tight cursor-pointer">
              <span className="flex items-center">
                <Plus className="mr-2 h-4 w-4" /> Regel toevoegen
              </span>
            </Button>
            <DialogContent>
              <form onSubmit={handleAddRow}>
                <DialogHeader>
                  <DialogTitle>Nieuwe Inzet Toevoegen</DialogTitle>
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
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto bg-slate-50 relative">
        <div className="inline-block min-w-full p-4">
          <div className="bg-white rounded-xl shadow-2xl border-2 border-slate-200 overflow-hidden">
            <table className="w-full border-collapse text-[11px] font-bold">
              <thead>
                <tr className="bg-[#4caf50] text-white h-24">
                  <th className="sticky left-0 z-20 bg-[#4caf50] border-r-2 border-white min-w-[250px] p-2 text-left align-top">
                    <div className="flex flex-col h-full justify-between">
                      <span className="text-sm font-black uppercase tracking-tighter">Jaarplanning {selectedYear}</span>
                    </div>
                  </th>
                  {WEEKS.map(week => (
                    <th key={week} className="border-r border-white/20 relative p-0 min-w-[32px] overflow-visible">
                      {milestoneMap[week] && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span 
                            className="whitespace-nowrap uppercase tracking-widest text-[9px] font-black"
                            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                          >
                            {milestoneMap[week]}
                          </span>
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="min-w-[80px] bg-[#388e3c]"></th>
                </tr>

                <tr className="bg-[#8e24aa] text-white h-10">
                  <th className="sticky left-0 z-20 bg-[#8e24aa] border-r-2 border-white p-2 text-left uppercase tracking-widest">
                    week nummer
                  </th>
                  {WEEKS.map(week => (
                    <th key={week} className={cn(
                      "border-r border-white/20 text-center",
                      week % 13 === 0 && "border-r-4 border-red-500"
                    )}>
                      {week}
                    </th>
                  ))}
                  <th className="bg-[#6a1b9a] text-center uppercase">uren</th>
                </tr>
              </thead>

              <tbody>
                {items?.map((item) => (
                  <tr key={item.id} className={cn("border-b border-slate-200 group transition-colors", CATEGORY_COLORS[item.color] || 'bg-white')}>
                    <td className={cn(
                      "sticky left-0 z-10 border-r-2 border-slate-200 p-2 truncate flex items-center justify-between",
                      CATEGORY_COLORS[item.color] || 'bg-white'
                    )}>
                      <span className="truncate pr-2">{item.resourceName}</span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteRow(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                    {WEEKS.map(week => (
                      <td key={week} className={cn(
                        "border-r border-slate-200 p-0 text-center h-10",
                        week % 13 === 0 && "border-r-4 border-red-500"
                      )}>
                        <input
                          type="text"
                          defaultValue={item.weeks?.[week.toString()] || ''}
                          onBlur={(e) => handleCellChange(item.id, week, e.target.value)}
                          className="w-full h-full bg-transparent text-center focus:bg-white focus:outline-none focus:ring-inset focus:ring-2 focus:ring-primary tabular-nums"
                        />
                      </td>
                    ))}
                    <td className="bg-slate-50/50 text-center font-black text-xs tabular-nums border-l-2 border-slate-200">
                      {calculateRowTotal(item.weeks || {}).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                <tr className="h-12 font-black">
                  <td className="sticky left-0 z-10 bg-slate-100 border-r-2 border-slate-300 p-2 uppercase tracking-widest text-[10px] text-slate-500">
                    Totaal inzet per week
                  </td>
                  {WEEKS.map(week => (
                    <td key={week} className={cn(
                      "text-center tabular-nums border-r border-slate-300",
                      week % 13 === 0 && "border-r-4 border-red-500"
                    )}>
                      {calculateWeekTotal(week) || ''}
                    </td>
                  ))}
                  <td className="text-center text-sm text-primary bg-slate-200">
                    {grandTotal.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-6 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-red-500" />
              <span>Kwartaal / Periode Scheiding</span>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Info className="h-3 w-3" />
              <span>Klik in een cel om uren aan te passen. Gegevens worden automatisch opgeslagen.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
