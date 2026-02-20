'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Loader2, Calendar, Pencil, Check, Info, Palette, MessageSquare, X, Clock, Search } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking, addDocumentNonBlocking, deleteDocumentNonBlocking, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, writeBatch } from 'firebase/firestore';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingScreen } from '@/components/loading-screen';
import { Separator } from '@/components/ui/separator';

interface AnnualPlanningSection {
  id: string;
  projectId: string;
  year: number;
  title: string;
  order: number;
}

interface AnnualPlanningItem {
  id: string;
  projectId: string;
  sectionId?: string;
  resourceName: string;
  category: string;
  year: number;
  weeks: Record<string, string>;
  weeklyDetails?: Record<string, Record<string, string>>;
  cellColors?: Record<string, string>;
  cellNotes?: Record<string, string>;
  color: string;
  order: number;
  hourlyRate?: number;
  targetQuantity?: number;
  unit?: string;
}

interface AnnualMilestone {
  id: string;
  projectId: string;
  sectionId?: string;
  weekNumber: number;
  label: string;
  year: number;
  color?: string;
  borderLeft?: boolean;
  borderRight?: boolean;
}

interface AnnualPlanningConfig {
  id: string;
  projectId: string;
  year: number;
  title: string;
}

const WEEKS = Array.from({ length: 52 }, (_, i) => i + 1);
const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const;
const DAY_LABELS: Record<string, string> = {
  ma: 'Maandag',
  di: 'Dinsdag',
  wo: 'Woensdag',
  do: 'Donderdag',
  vr: 'Vrijdag',
  za: 'Zaterdag',
  zo: 'Zondag'
};

const PRESET_COLORS = [
  { name: 'Wit', value: '#ffffff' },
  { name: 'Geel', value: '#fff9c4' },
  { name: 'Oranje', value: '#ffe0b2' },
  { name: 'Rood', value: '#ffcdd2' },
  { name: 'Blauw', value: '#e3f2fd' },
  { name: 'Groen', value: '#e8f5e9' },
  { name: 'Paars', value: '#f3e5f5' },
  { name: 'Grijs', value: '#f5f5f5' },
  { name: 'Donker Paars', value: '#8e24aa' },
];

const CELL_PRESET_COLORS = [
  { name: 'Geen', value: 'transparent' },
  { name: 'Rood', value: '#ef4444' },
  { name: 'Oranje', value: '#f97316' },
  { name: 'Geel', value: '#eab308' },
  { name: 'Groen', value: '#22c55e' },
  { name: 'Blauw', value: '#3b82f6' },
  { name: 'Paars', value: '#a855f7' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - 1 + i);

export default function AnnualPlanningPage() {
  const { selectedProjectId } = useProject();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = React.useState(CURRENT_YEAR);
  const [searchTerm, setSearchTerm] = React.useState('');
  
  // Selection state
  const [selectedCells, setSelectedCells] = React.useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = React.useState(false);

  // Row creation/edit state
  const [isAddingRow, setIsAddingRow] = React.useState(false);
  const [isRowDialogOpen, setIsRowDialogOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<AnnualPlanningItem | null>(null);
  const [activeSectionForNewRow, setActiveSectionForNewRow] = React.useState<string | null>(null);
  const [insertAtOrder, setInsertAtOrder] = React.useState<number | null>(null);
  const [dialogUnit, setDialogUnit] = React.useState('uur');
  const [dialogTarget, setDialogTarget] = React.useState<string>('40');
  
  // Header title editing state
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [tempTitle, setTempTitle] = React.useState('');

  // Table corner title editing state
  const [editingSectionTitleId, setEditingSectionTitleId] = React.useState<string | null>(null);
  const [tempSectionTitle, setTempSectionTitle] = React.useState('');

  // Milestone editing state
  const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = React.useState(false);
  const [selectedWeekForMilestone, setSelectedWeekForMilestone] = React.useState<{ week: number, sectionId: string } | null>(null);
  const [milestoneInput, setMilestoneInput] = React.useState('');
  const [isSavingMilestone, setIsSavingMilestone] = React.useState(false);

  // Note editing state
  const [isNoteDialogOpen, setIsNoteDialogOpen] = React.useState(false);
  const [noteInput, setNoteInput] = React.useState('');
  const [activeCellForNote, setActiveCellForNote] = React.useState<{ itemId: string, week: number } | null>(null);

  // Weekly details dialog state
  const [isWeekDetailDialogOpen, setIsWeekDetailDialogOpen] = React.useState(false);
  const [activeWeekDetailCell, setActiveWeekDetailCell] = React.useState<{ itemId: string, week: number } | null>(null);
  const [weekDetailValues, setWeekDetailValues] = React.useState<Record<string, string>>({
    ma: '', di: '', wo: '', do: '', vr: '', za: '', zo: ''
  });

  // Section management
  const [isAddingSection, setIsAddingSection] = React.useState(false);

  // Context menus
  const [cellContextMenu, setCellContextMenu] = React.useState<{ x: number, y: number, itemId: string, week: number } | null>(null);
  const [headerContextMenu, setHeaderContextMenu] = React.useState<{ x: number, y: number, sectionId: string, week: number } | null>(null);

  const configId = `${selectedProjectId}_${selectedYear}`;
  const configRef = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return doc(firestore, 'annual_planning_configs', configId);
  }, [firestore, selectedProjectId, configId]);

  const { data: config, isLoading: isLoadingConfig } = useDoc<AnnualPlanningConfig>(configRef);

  const sectionsQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return query(
      collection(firestore, 'annual_planning_sections'),
      where('projectId', '==', selectedProjectId),
      where('year', '==', selectedYear)
    );
  }, [firestore, selectedProjectId, selectedYear]);

  const planningItemsQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return query(
      collection(firestore, 'annual_planning'),
      where('projectId', '==', selectedProjectId),
      where('year', '==', selectedYear)
    );
  }, [firestore, selectedProjectId, selectedYear]);

  const { data: itemsRaw, isLoading: isLoadingItems } = useCollection<AnnualPlanningItem>(planningItemsQuery);

  const milestonesQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return query(
      collection(firestore, 'annual_milestones'),
      where('projectId', '==', selectedProjectId),
      where('year', '==', selectedYear)
    );
  }, [firestore, selectedProjectId, selectedYear]);

  const { data: sectionsRaw, isLoading: isLoadingSections } = useCollection<AnnualPlanningSection>(sectionsQuery);
  const { data: milestonesRaw, isLoading: isLoadingMilestones } = useCollection<AnnualMilestone>(milestonesQuery);

  const sections = React.useMemo(() => {
    const list = sectionsRaw ? [...sectionsRaw].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
    if (list.length === 0) {
      return [{ id: 'default', title: `planning ${selectedYear}`, order: 0, projectId: selectedProjectId!, year: selectedYear }];
    }
    return list;
  }, [sectionsRaw, selectedYear, selectedProjectId]);

  const displayTitle = config?.title || `Jaarplanning ${selectedYear}`;

  const handleSaveTitle = () => {
    if (!configRef || !tempTitle.trim() || !selectedProjectId) {
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

  const handleAddSection = async () => {
    if (!firestore || !selectedProjectId) return;
    setIsAddingSection(true);
    try {
      await addDocumentNonBlocking(collection(firestore, 'annual_planning_sections'), {
        projectId: selectedProjectId,
        year: selectedYear,
        title: `Nieuw Blok`,
        order: sections.length
      });
      toast({ title: 'Nieuwe sectie toegevoegd' });
    } catch (e) {
      console.error("Add section error:", e);
    } finally {
      setIsAddingSection(false);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!firestore || sectionId === 'default') return;
    const itemsToDelete = (itemsRaw || []).filter(i => i.sectionId === sectionId);
    const milestonesToDelete = (milestonesRaw || []).filter(m => m.sectionId === sectionId);
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, 'annual_planning_sections', sectionId));
    itemsToDelete.forEach(i => batch.delete(doc(firestore, 'annual_planning', i.id)));
    milestonesToDelete.forEach(m => batch.delete(doc(firestore, 'annual_milestones', m.id)));
    try {
      await batch.commit();
      toast({ title: 'Sectie verwijderd' });
    } catch (e) {
      console.error("Delete section error:", e);
    }
  };

  const handleSaveSectionTitle = (sectionId: string) => {
    if (!firestore || !tempSectionTitle.trim()) {
      setEditingSectionTitleId(null);
      return;
    }
    if (sectionId === 'default') {
      addDocumentNonBlocking(collection(firestore, 'annual_planning_sections'), {
        projectId: selectedProjectId!,
        year: selectedYear,
        title: tempSectionTitle.trim(),
        order: 0
      });
    } else {
      updateDocumentNonBlocking(doc(firestore, 'annual_planning_sections', sectionId), {
        title: tempSectionTitle.trim()
      });
    }
    setEditingSectionTitleId(null);
    toast({ title: 'Sectietitel bijgewerkt' });
  };

  const handleCellChange = (itemId: string, week: number, value: string) => {
    if (!firestore) return;
    
    const cellKey = `${itemId}_${week}`;
    const updateTasks: { itemId: string, week: number }[] = [];

    if (selectedCells.has(cellKey)) {
      selectedCells.forEach(key => {
        const [id, w] = key.split('_');
        updateTasks.push({ itemId: id, week: parseInt(w) });
      });
    } else {
      updateTasks.push({ itemId, week });
    }

    const batch = writeBatch(firestore);
    const itemsToUpdate = Array.from(new Set(updateTasks.map(t => t.itemId)));
    
    itemsToUpdate.forEach(id => {
      const itemRef = doc(firestore, 'annual_planning', id);
      const updates: Record<string, string> = {};
      updateTasks.filter(t => t.itemId === id).forEach(t => {
        updates[`weeks.${t.week}`] = value;
      });
      batch.update(itemRef, updates);
    });

    batch.commit().catch(e => console.error("Bulk cell change error:", e));
  };

  const handlePaste = (itemId: string, week: number, e: React.ClipboardEvent) => {
    if (!firestore) return;
    const pasteData = e.clipboardData.getData('text');
    const cellKey = `${itemId}_${week}`;
    
    if (selectedCells.has(cellKey) && selectedCells.size > 1) {
      e.preventDefault();
      const updateTasks: { itemId: string, week: number }[] = [];
      selectedCells.forEach(key => {
        const [id, w] = key.split('_');
        updateTasks.push({ itemId: id, week: parseInt(w) });
      });

      const batch = writeBatch(firestore);
      const itemsToUpdate = Array.from(new Set(updateTasks.map(t => t.itemId)));
      
      itemsToUpdate.forEach(id => {
        const itemRef = doc(firestore, 'annual_planning', id);
        const updates: Record<string, string> = {};
        updateTasks.filter(t => t.itemId === id).forEach(t => {
          updates[`weeks.${t.week}`] = pasteData;
        });
        batch.update(itemRef, updates);
      });

      batch.commit().then(() => {
        toast({ title: `Geplakt in ${selectedCells.size} cellen` });
      }).catch(e => console.error("Bulk paste error:", e));
    }
  };

  const handleCellColorChange = (itemId: string, week: number, color: string) => {
    if (!firestore) return;
    
    const cellKey = `${itemId}_${week}`;
    const updateTasks: { itemId: string, week: number }[] = [];

    if (selectedCells.has(cellKey)) {
      selectedCells.forEach(key => {
        const [id, w] = key.split('_');
        updateTasks.push({ itemId: id, week: parseInt(w) });
      });
    } else {
      updateTasks.push({ itemId, week });
    }

    const batch = writeBatch(firestore);
    const itemsToUpdate = Array.from(new Set(updateTasks.map(t => t.itemId)));
    
    itemsToUpdate.forEach(id => {
      const itemRef = doc(firestore, 'annual_planning', id);
      const updates: Record<string, any> = {};
      updateTasks.filter(t => t.itemId === id).forEach(t => {
        updates[`cellColors.${t.week}`] = color === 'transparent' ? null : color;
      });
      batch.update(itemRef, updates);
    });

    batch.commit().then(() => {
      setCellContextMenu(null);
      toast({ title: 'Kleur toegepast op selectie' });
    }).catch(e => console.error("Bulk color change error:", e));
  };

  const handleCellNoteSave = () => {
    if (!firestore || !activeCellForNote) return;
    
    const { itemId, week } = activeCellForNote;
    const cellKey = `${itemId}_${week}`;
    const updateTasks: { itemId: string, week: number }[] = [];

    if (selectedCells.has(cellKey)) {
      selectedCells.forEach(key => {
        const [id, w] = key.split('_');
        updateTasks.push({ itemId: id, week: parseInt(w) });
      });
    } else {
      updateTasks.push({ itemId, week });
    }

    const batch = writeBatch(firestore);
    const itemsToUpdate = Array.from(new Set(updateTasks.map(t => t.itemId)));
    
    itemsToUpdate.forEach(id => {
      const itemRef = doc(firestore, 'annual_planning', id);
      const updates: Record<string, any> = {};
      updateTasks.filter(t => t.itemId === id).forEach(t => {
        updates[`cellNotes.${t.week}`] = noteInput.trim() === '' ? null : noteInput.trim();
      });
      batch.update(itemRef, updates);
    });

    batch.commit().then(() => {
      setIsNoteDialogOpen(false);
      setNoteInput('');
      setActiveCellForNote(null);
      toast({ title: 'Opmerking opgeslagen' });
    });
  };

  const handleWeekDetailOpen = (itemId: string, week: number) => {
    const item = itemsRaw?.find(i => i.id === itemId);
    const details = item?.weeklyDetails?.[week.toString()] || { ma: '', di: '', wo: '', do: '', vr: '', za: '', zo: '' };
    setWeekDetailValues(details);
    setActiveWeekDetailCell({ itemId, week });
    setIsWeekDetailDialogOpen(true);
  };

  const handleSaveWeekDetails = () => {
    if (!firestore || !activeWeekDetailCell) return;
    const { itemId, week } = activeWeekDetailCell;
    const itemRef = doc(firestore, 'annual_planning', itemId);
    
    const total = Object.values(weekDetailValues).reduce((acc, val) => acc + (parseFloat(val.replace(',', '.')) || 0), 0);
    
    const updates: Record<string, any> = {
      [`weeklyDetails.${week}`]: weekDetailValues,
      [`weeks.${week}`]: total.toString()
    };

    updateDocumentNonBlocking(itemRef, updates);
    setIsWeekDetailDialogOpen(false);
    toast({ title: 'Weekoverzicht opgeslagen' });
  };

  const handleHeaderColorChange = async (sectionId: string, week: number, color: string) => {
    if (!firestore || !selectedProjectId) return;
    
    const existing = milestonesRaw?.find(m => m.weekNumber === week && (m.sectionId === sectionId || (sectionId === 'default' && !m.sectionId)));
    
    try {
      if (existing) {
        updateDocumentNonBlocking(doc(firestore, 'annual_milestones', existing.id), {
          color: color === 'transparent' ? null : color
        });
      } else {
        await addDocumentNonBlocking(collection(firestore, 'annual_milestones'), {
          projectId: selectedProjectId,
          sectionId: sectionId === 'default' ? null : sectionId,
          label: '',
          weekNumber: week,
          year: selectedYear,
          color: color === 'transparent' ? null : color
        });
      }
      toast({ title: 'Header kleur bijgewerkt' });
    } catch (e) {
      console.error("Header color error:", e);
    } finally {
      setHeaderContextMenu(null);
    }
  };

  const handleHeaderBorderToggle = async (sectionId: string, week: number, side: 'left' | 'right') => {
    if (!firestore || !selectedProjectId) return;
    
    const existing = milestonesRaw?.find(m => m.weekNumber === week && (m.sectionId === sectionId || (sectionId === 'default' && !m.sectionId)));
    
    try {
      if (existing) {
        const field = side === 'left' ? 'borderLeft' : 'borderRight';
        const newValue = !existing[field];
        
        // Check if it will be empty after this update
        const willBeEmpty = !newValue && 
                           (side === 'left' ? !existing.borderRight : !existing.borderLeft) && 
                           !existing.label && 
                           !existing.color;

        if (willBeEmpty) {
          deleteDocumentNonBlocking(doc(firestore, 'annual_milestones', existing.id));
        } else {
          updateDocumentNonBlocking(doc(firestore, 'annual_milestones', existing.id), {
            [field]: newValue
          });
        }
      } else {
        await addDocumentNonBlocking(collection(firestore, 'annual_milestones'), {
          projectId: selectedProjectId,
          sectionId: sectionId === 'default' ? null : sectionId,
          label: '',
          weekNumber: week,
          year: selectedYear,
          [side === 'left' ? 'borderLeft' : 'borderRight']: true
        });
      }
      toast({ title: `Rode lijn ${side === 'left' ? 'links' : 'rechts'} bijgewerkt` });
    } catch (e) {
      console.error("Header border error:", e);
    } finally {
      setHeaderContextMenu(null);
    }
  };

  const handleHourlyRateChange = (itemId: string, value: string) => {
    if (!firestore) return;
    const rate = parseFloat(value.replace(',', '.')) || 0;
    updateDocumentNonBlocking(doc(firestore, 'annual_planning', itemId), {
      hourlyRate: rate
    });
  };

  const handleRowSubmit = async (data: { name: string, color: string, hourlyRate: number, unit: string, targetQuantity: number }) => {
    if (!selectedProjectId || !firestore) return;

    setIsAddingRow(true);
    try {
      if (editingItem) {
        updateDocumentNonBlocking(doc(firestore, 'annual_planning', editingItem.id), {
          resourceName: data.name,
          color: data.color,
          hourlyRate: data.hourlyRate,
          unit: data.unit,
          targetQuantity: data.targetQuantity
        });
        toast({ title: 'Regel bijgewerkt' });
      } else if (activeSectionForNewRow) {
        if (insertAtOrder !== null) {
          const batch = writeBatch(firestore);
          const sectionItems = itemsRaw?.filter(i => i.sectionId === activeSectionForNewRow || (activeSectionForNewRow === 'default' && !i.sectionId)) || [];
          
          sectionItems.filter(i => (i.order || 0) >= insertAtOrder).forEach(i => {
            batch.update(doc(firestore, 'annual_planning', i.id), { order: (i.order || 0) + 1 });
          });

          const newDocRef = doc(collection(firestore, 'annual_planning'));
          batch.set(newDocRef, {
            id: newDocRef.id,
            projectId: selectedProjectId,
            sectionId: activeSectionForNewRow === 'default' ? null : activeSectionForNewRow,
            resourceName: data.name,
            color: data.color,
            hourlyRate: data.hourlyRate,
            unit: data.unit,
            targetQuantity: data.targetQuantity,
            year: selectedYear,
            order: insertAtOrder,
            weeks: {},
            cellColors: {},
            cellNotes: {},
            weeklyDetails: {}
          });
          
          await batch.commit();
          toast({ title: 'Rij ingevoegd' });
        } else {
          addDocumentNonBlocking(collection(firestore, 'annual_planning'), {
            projectId: selectedProjectId,
            sectionId: activeSectionForNewRow === 'default' ? null : activeSectionForNewRow,
            resourceName: data.name,
            color: data.color,
            hourlyRate: data.hourlyRate,
            unit: data.unit,
            targetQuantity: data.targetQuantity,
            year: selectedYear,
            order: (itemsRaw?.filter(i => i.sectionId === activeSectionForNewRow || (activeSectionForNewRow === 'default' && !i.sectionId)).length || 0) + 1,
            weeks: {},
            cellColors: {},
            cellNotes: {},
            weeklyDetails: {}
          });
          toast({ title: 'Rij toegevoegd' });
        }
      }
      setIsAddingRow(false);
      setIsRowDialogOpen(false);
      setEditingItem(null);
      setInsertAtOrder(null);
    } catch (e) {
      setIsAddingRow(false);
      console.error("Row submit error:", e);
    }
  };

  const handleQuickMilestone = (week: number, sectionId: string) => {
    const existing = milestonesRaw?.find(m => m.weekNumber === week && (m.sectionId === sectionId || (sectionId === 'default' && !m.sectionId)));
    setMilestoneInput(existing?.label || '');
    setSelectedWeekForMilestone({ week, sectionId });
    setIsMilestoneDialogOpen(true);
  };

  const handleSaveQuickMilestone = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedWeekForMilestone || !firestore || !selectedProjectId) return;
    
    setIsSavingMilestone(true);
    const { week, sectionId } = selectedWeekForMilestone;
    const existing = milestonesRaw?.find(m => m.weekNumber === week && (m.sectionId === sectionId || (sectionId === 'default' && !m.sectionId)));
    
    try {
      if (milestoneInput.trim() === '' && (!existing || (!existing.color && !existing.borderLeft && !existing.borderRight))) {
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
            sectionId: sectionId === 'default' ? null : sectionId,
            label: milestoneInput.trim(),
            weekNumber: week,
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
    return Object.values(weeks || {}).reduce((acc, val) => acc + (parseFloat(val.replace(',', '.')) || 0), 0);
  };

  const handleCellMouseDown = (itemId: string, week: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    
    const key = `${itemId}_${week}`;
    setIsDragging(true);
    
    if (e.ctrlKey || e.metaKey) {
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    } else {
      setSelectedCells(new Set([key]));
    }
  };

  const handleCellMouseEnter = (itemId: string, week: number) => {
    if (!isDragging) return;
    const key = `${itemId}_${week}`;
    setSelectedCells(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  React.useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const handleCellContextMenu = (e: React.MouseEvent, itemId: string, week: number) => {
    e.preventDefault();
    setCellContextMenu({ x: e.clientX, y: e.clientY, itemId, week });
    setHeaderContextMenu(null);
    
    const key = `${itemId}_${week}`;
    if (!selectedCells.has(key)) {
      setSelectedCells(new Set([key]));
    }
  };

  const handleHeaderContextMenu = (e: React.MouseEvent, sectionId: string, week: number) => {
    e.preventDefault();
    setHeaderContextMenu({ x: e.clientX, y: e.clientY, sectionId, week });
    setCellContextMenu(null);
  };

  React.useEffect(() => {
    if (isRowDialogOpen) {
      if (editingItem) {
        setDialogUnit(editingItem.unit || 'uur');
        setDialogTarget(editingItem.targetQuantity?.toString() || (editingItem.unit === 'dag' ? '5' : '40'));
      } else {
        setDialogUnit('uur');
        setDialogTarget('40');
      }
    }
  }, [isRowDialogOpen, editingItem]);

  if (!selectedProjectId) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center bg-slate-50 h-full">
        <Calendar className="h-16 w-16 text-slate-200 mb-4" />
        <h2 className="text-xl font-black uppercase tracking-tight">Geen project geselecteerd</h2>
        <p className="text-sm text-slate-500 mt-2">Selecteer eerst een project in de sidebar om de jaarplanning te bekijken.</p>
      </div>
    );
  }

  if (isLoadingItems || isLoadingMilestones || isLoadingConfig || isLoadingSections) {
    return <LoadingScreen message="Jaarplanning laden..." />;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-white overflow-hidden" onClick={() => { if(cellContextMenu) setCellContextMenu(null); if(headerContextMenu) setHeaderContextMenu(null); }}>
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

          <div className="flex items-center gap-3">
            {selectedCells.size > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest text-slate-400" onClick={() => setSelectedCells(new Set())}>
                Selectie wissen ({selectedCells.size})
              </Button>
            )}
            
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Zoek in planningen..."
                className="h-8 pl-9 font-bold bg-white border-2"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

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

        <div className="flex-1 overflow-auto bg-slate-50 relative no-scrollbar pb-20 select-none">
          <div className="flex flex-col gap-8 p-2 lg:p-4">
            {sections.map((section) => {
              const sectionItems = itemsRaw ? itemsRaw.filter(i => {
                const isInSection = i.sectionId === section.id || (section.id === 'default' && !i.sectionId);
                const matchesSearch = i.resourceName.toLowerCase().includes(searchTerm.toLowerCase());
                return isInSection && matchesSearch;
              }).sort((a, b) => (a.order || 0) - (b.order || 0)) : [];

              const sectionMilestones = milestonesRaw ? milestonesRaw.filter(m => m.sectionId === section.id || (section.id === 'default' && !m.sectionId)) : [];
              const sectionMilestoneMap: Record<number, AnnualMilestone> = {};
              sectionMilestones.forEach(m => { sectionMilestoneMap[m.weekNumber] = m; });

              const calculateWeekTotal = (week: number) => {
                return sectionItems.reduce((acc, item) => acc + (parseFloat((item.weeks?.[week.toString()] || '0').replace(',', '.')) || 0), 0) || 0;
              };

              const sectionGrandTotalQuantity = sectionItems.reduce((acc, item) => acc + calculateRowTotal(item.weeks || {}), 0) || 0;
              const sectionGrandTotalCost = sectionItems.reduce((acc, item) => {
                const rowTotal = calculateRowTotal(item.weeks || {});
                return acc + (rowTotal * (item.hourlyRate || 0));
              }, 0);

              // Hide section if searching and no items found
              if (searchTerm && sectionItems.length === 0) return null;

              return (
                <div key={section.id} className="group/section relative bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
                  <table className="w-full border-collapse text-[10px] font-bold">
                    <thead>
                      <tr className="bg-[#4caf50] text-white h-32">
                        <th className="sticky left-0 z-20 bg-[#4caf50] border-r border-white p-2 text-left align-top whitespace-nowrap w-[300px] min-w-[300px]">
                          <div className="flex flex-col h-full justify-between">
                            {editingSectionTitleId === section.id ? (
                              <div className="flex items-center gap-1">
                                <Input 
                                  value={tempSectionTitle} 
                                  onChange={(e) => setTempSectionTitle(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSaveSectionTitle(section.id)}
                                  onBlur={() => handleSaveSectionTitle(section.id)}
                                  className="h-6 font-black uppercase text-[10px] bg-white text-black min-w-[120px] p-1"
                                  autoFocus
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div 
                                  className="group/corner cursor-pointer flex items-center gap-2"
                                  onClick={() => { setTempSectionTitle(section.title); setEditingSectionTitleId(section.id); }}
                                >
                                  <span className="text-[11px] font-black uppercase tracking-tighter">{section.title}</span>
                                  <Pencil className="h-3 w-3 text-white/40 opacity-0 group-hover/corner:opacity-100 transition-opacity" />
                                </div>
                                {section.id !== 'default' && (
                                  <AlertDialog>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white hover:bg-red-600/20 opacity-0 group-hover/section:opacity-100 transition-opacity" asChild>
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Verwijder blok</TooltipContent>
                                    </Tooltip>
                                    <AlertDialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Blok Verwijderen?</DialogTitle>
                                        <AlertDialogDescription>
                                          Weet u zeker dat u het blok "{section.title}" en alle bijbehorende rijen en milestones wilt verwijderen?
                                        </AlertDialogDescription>
                                      </DialogHeader>
                                      <DialogFooter>
                                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteSection(section.id)} className="bg-red-600">Verwijderen</AlertDialogAction>
                                      </DialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            )}
                          </div>
                        </th>
                        {WEEKS.map(week => {
                          const m = sectionMilestoneMap[week];
                          const headerStyle = m?.color ? { backgroundColor: m.color } : {};
                          
                          return (
                            <th 
                              key={week} 
                              style={headerStyle}
                              className={cn(
                                "border-r border-white/20 relative p-0 w-6 min-w-[24px] overflow-visible h-32 group/header-cell cursor-pointer transition-colors",
                                !m?.color && "hover:bg-white/10",
                                m?.borderLeft && "border-l-[3px] border-l-red-600 z-30",
                                m?.borderRight && "border-r-[3px] border-r-red-600 z-30"
                              )}
                              onClick={() => handleQuickMilestone(week, section.id)}
                              onContextMenu={(e) => handleHeaderContextMenu(e, section.id, week)}
                            >
                              {m?.label ? (
                                <div className="absolute inset-0 flex items-center justify-center py-2">
                                  <span 
                                    className="whitespace-nowrap uppercase tracking-widest text-[10px] font-black text-white drop-shadow-sm"
                                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.1em' }}
                                  >
                                    {m.label}
                                  </span>
                                </div>
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/header-cell:opacity-100 transition-opacity">
                                  <Plus className="h-3.5 w-3.5 text-white/60" />
                                </div>
                              )}
                            </th>
                          );
                        })}
                        <th className="w-8 bg-[#388e3c] border-r border-white/20">aantal</th>
                        <th className="w-20 bg-[#388e3c] border-r border-white/20">tarief</th>
                        <th className="w-24 bg-[#388e3c]">bedrag</th>
                      </tr>

                      <tr className="bg-[#8e24aa] text-white h-8">
                        <th className="sticky left-0 z-20 bg-[#8e24aa] border-r border-white p-1 text-left uppercase tracking-tighter whitespace-nowrap w-[300px] min-w-[300px]">
                          week
                        </th>
                        {WEEKS.map(week => {
                          const m = sectionMilestoneMap[week];
                          const headerStyle = m?.color ? { backgroundColor: m.color } : {};
                          
                          return (
                            <th 
                              key={week} 
                              style={headerStyle}
                              onContextMenu={(e) => handleHeaderContextMenu(e, section.id, week)}
                              className={cn(
                                "border-r border-white/20 text-center font-black w-6 min-w-[24px] h-8 cursor-context-menu transition-colors",
                                !m?.color && "hover:bg-white/10",
                                m?.borderLeft && "border-l-[3px] border-l-red-600 z-30",
                                m?.borderRight && "border-r-[3px] border-r-red-600 z-30"
                              )}
                            >
                              {week}
                            </th>
                          );
                        })}
                        <th className="bg-[#6a1b9a] text-center uppercase tracking-tighter w-8 border-r border-white/20">tot</th>
                        <th className="bg-[#6a1b9a] text-center uppercase tracking-tighter w-20 border-r border-white/20">prijs</th>
                        <th className="bg-[#6a1b9a] text-center uppercase tracking-tighter w-24">totaal</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sectionItems.map((item) => {
                        const isHexColor = item.color?.startsWith('#');
                        const rowStyle = isHexColor ? { backgroundColor: item.color } : {};
                        const rowTotalQuantity = calculateRowTotal(item.weeks || {});
                        const rowTotalCost = rowTotalQuantity * (item.hourlyRate || 0);
                        
                        return (
                          <tr key={item.id} className={cn("border-b border-slate-100 group transition-colors")} style={rowStyle}>
                            <td className={cn(
                              "sticky left-0 z-10 border-r border-slate-200 p-0 whitespace-nowrap w-[300px] min-w-[300px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                            )} style={rowStyle}>
                              <div className="flex items-center justify-between h-8 px-1.5 w-full group/row">
                                <button 
                                  className="pr-4 text-[11px] font-black uppercase tracking-tight whitespace-nowrap hover:text-primary transition-colors text-left truncate flex-1"
                                  onClick={() => { setEditingItem(item); setIsRowDialogOpen(true); }}
                                  title={item.resourceName}
                                >
                                  {item.resourceName}
                                </button>
                                <div className="flex items-center opacity-0 group-hover/row:opacity-100 transition-opacity gap-0.5">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-5 w-5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
                                        onClick={() => {
                                          setActiveSectionForNewRow(section.id);
                                          setEditingItem(null);
                                          setInsertAtOrder(item.order);
                                          setIsRowDialogOpen(true);
                                        }}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Rij boven invoegen</TooltipContent>
                                  </Tooltip>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-5 w-5 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                                    onClick={() => handleDeleteRow(item.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </td>
                            {WEEKS.map(week => {
                              const cellColor = item.cellColors?.[week.toString()];
                              const cellNote = item.cellNotes?.[week.toString()];
                              const isSelected = selectedCells.has(`${item.id}_${week}`);
                              const m = sectionMilestoneMap[week];
                              const details = item.weeklyDetails?.[week.toString()];
                              const cellValueStr = item.weeks?.[week.toString()] || '';

                              const cellStyle: React.CSSProperties = {
                                backgroundColor: cellColor || 'transparent',
                              };
                              
                              return (
                                <td 
                                  key={week}
                                  onMouseDown={(e) => handleCellMouseDown(item.id, week, e)}
                                  onMouseEnter={() => handleCellMouseEnter(item.id, week)}
                                  onContextMenu={(e) => handleCellContextMenu(e, item.id, week)}
                                  onDoubleClick={() => handleWeekDetailOpen(item.id, week)}
                                  className={cn(
                                    "border-r border-slate-100 p-0 text-center h-8 w-6 min-w-[24px] transition-all relative",
                                    isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30 z-10",
                                    cellNote && "ring-1 ring-inset ring-black shadow-[inset_0_0_0_1px_black]",
                                    m?.borderLeft && "border-l-[3px] border-l-red-600 z-30",
                                    m?.borderRight && "border-r-[3px] border-r-red-600 z-30"
                                  )}
                                  style={cellStyle}
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="w-full h-full relative">
                                        <input
                                          type="text"
                                          value={cellValueStr}
                                          onChange={(e) => handleCellChange(item.id, week, e.target.value)}
                                          onPaste={(e) => handlePaste(item.id, week, e)}
                                          onFocus={(e) => e.target.select()}
                                          className={cn(
                                            "w-full h-full bg-transparent text-center focus:bg-white/50 focus:outline-none focus:ring-inset focus:ring-1 focus:ring-primary tabular-nums text-[9px] text-slate-900",
                                            isDragging ? "pointer-events-none" : "pointer-events-auto"
                                          )}
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    {(cellNote || details) && (
                                      <TooltipContent className="bg-black text-white font-bold text-[10px] p-2 max-w-[200px] space-y-1">
                                        {cellNote && <div>Opmerking: {cellNote}</div>}
                                        {details && (
                                          <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
                                            {Object.entries(details).map(([day, val]) => val ? (
                                              <React.Fragment key={day}>
                                                <span className="uppercase opacity-60">{day}:</span>
                                                <span className="text-right">{val}</span>
                                              </React.Fragment>
                                            ) : null)}
                                          </div>
                                        )}
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </td>
                              );
                            })}
                            <td className="bg-slate-50/50 text-center font-black text-[10px] tabular-nums border-l border-slate-200 h-8 w-8 border-r">
                              {rowTotalQuantity.toLocaleString('nl-NL')}
                            </td>
                            <td className="bg-white p-0 px-1 border-r border-slate-200 h-8 min-w-[80px]">
                              <div className="flex items-center justify-center gap-0.5 text-[10px] font-bold">
                                <span className="text-slate-400">€</span>
                                <input
                                  type="text"
                                  defaultValue={item.hourlyRate?.toString() || ''}
                                  onBlur={(e) => handleHourlyRateChange(item.id, e.target.value)}
                                  className="w-10 bg-transparent text-center focus:outline-none tabular-nums"
                                  placeholder="0"
                                />
                                <span className="text-slate-400">/ {item.unit || 'uur'}</span>
                              </div>
                            </td>
                            <td className="bg-slate-50/50 text-right pr-1 font-black text-[10px] tabular-nums h-8 w-24">
                              {rowTotalCost > 0 ? `€ ${rowTotalCost.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                      
                      <tr className="bg-slate-50/30 h-8">
                        <td className="sticky left-0 z-10 border-r border-slate-200 p-1 bg-white h-8 w-[300px] min-w-[300px]">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full h-6 font-black uppercase text-[9px] gap-1 hover:bg-slate-100" 
                            onClick={() => { 
                              setActiveSectionForNewRow(section.id); 
                              setEditingItem(null); 
                              setInsertAtOrder(null);
                              setIsRowDialogOpen(true); 
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        </td>
                        {WEEKS.map(week => {
                          const m = sectionMilestoneMap[week];
                          return (
                            <td key={week} className={cn(
                              "border-r border-slate-100 w-6 min-w-[24px] h-8 relative",
                              m?.borderLeft && "border-l-[3px] border-l-red-600 z-30",
                              m?.borderRight && "border-r-[3px] border-r-red-600 z-30"
                            )} />
                          );
                        })}
                        <td className="border-l border-slate-200 h-8 w-8 border-r" />
                        <td className="border-r border-slate-200 h-8 w-20" />
                        <td className="h-8 w-24" />
                      </tr>
                    </tbody>

                    <tfoot className="bg-slate-100 border-t border-slate-300">
                      <tr className="h-10 font-black">
                        <td className="sticky left-0 z-10 bg-slate-100 border-r border-slate-300 p-2 uppercase tracking-tighter text-[9px] text-slate-500 h-8 w-[300px] min-w-[300px] whitespace-nowrap">
                          Totaal {section.title}
                        </td>
                        {WEEKS.map(week => {
                          const m = sectionMilestoneMap[week];
                          return (
                            <td key={week} className={cn(
                              "text-center tabular-nums border-r border-slate-300 w-6 min-w-[24px] h-8 relative",
                              m?.borderLeft && "border-l-[3px] border-l-red-600 z-30",
                              m?.borderRight && "border-r-[3px] border-r-red-600 z-30"
                            )}>
                              {calculateWeekTotal(week) || ''}
                            </td>
                          );
                        })}
                        <td className="text-center text-[10px] text-primary bg-slate-200 h-8 w-8 border-r border-slate-300">
                          {sectionGrandTotalQuantity.toLocaleString('nl-NL')}
                        </td>
                        <td className="bg-slate-200 border-r border-slate-300" />
                        <td className="text-right pr-1 text-[10px] text-primary bg-slate-200 h-8 w-24">
                          € {sectionGrandTotalCost.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}

            <div className="flex justify-center pt-4">
              <Button 
                variant="outline" 
                className="h-16 w-full max-w-md border-2 border-dashed border-slate-300 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all rounded-xl gap-3 font-black uppercase tracking-widest text-xs"
                onClick={handleAddSection}
                disabled={isAddingSection}
              >
                {isAddingSection ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-6 w-6" />}
                Nieuw Blok Toevoegen
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 bg-red-600 rounded-sm" />
                <span>Rode lijn = Scheiding</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 ring-1 ring-black rounded-sm" />
                <span>Zwarte ring = Opmerking</span>
              </div>
              <div className="flex items-center gap-2">
                <Info className="h-3 w-3" />
                <span>Dubbelklik op een cel voor dagelijkse uren.</span>
              </div>
            </div>
          </div>
        </div>

        <Dialog open={isWeekDetailDialogOpen} onOpenChange={setIsWeekDetailDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Weekplanning Detail (Week {activeWeekDetailCell?.week})</DialogTitle>
              <DialogDescription>Voer de aantallen/uren in per dag van de week.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 py-4">
              {DAYS.map(day => (
                <div key={day} className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor={`day-${day}`} className="text-right font-bold uppercase text-[10px] tracking-widest">{DAY_LABELS[day]}</Label>
                  <Input 
                    id={`day-${day}`} 
                    value={weekDetailValues[day]} 
                    onChange={(e) => setWeekDetailValues(prev => ({ ...prev, [day]: e.target.value }))}
                    className="col-span-3 h-9 font-bold"
                    placeholder="0"
                  />
                </div>
              ))}
              <Separator className="my-2" />
              <div className="grid grid-cols-4 items-center gap-4">
                <span className="text-right font-black uppercase text-[10px] tracking-widest text-primary">Totaal</span>
                <span className="col-span-3 pl-3 font-black text-lg">
                  {Object.values(weekDetailValues).reduce((acc, val) => acc + (parseFloat(val.replace(',', '.')) || 0), 0)}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsWeekDetailDialogOpen(false)}>Annuleren</Button>
              <Button onClick={handleSaveWeekDetails} className="font-black uppercase tracking-tight">Opslaan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRowDialogOpen} onOpenChange={(open) => { setIsRowDialogOpen(open); if(!open) { setEditingItem(null); setInsertAtOrder(null); } }}>
          <DialogContent>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleRowSubmit({
                name: formData.get('name') as string,
                color: formData.get('color') as string,
                hourlyRate: parseFloat(formData.get('hourlyRate') as string) || 0,
                unit: dialogUnit,
                targetQuantity: parseFloat(dialogTarget) || 40
              });
            }}>
              <DialogHeader>
                <DialogTitle>{editingItem ? 'Regel Bewerken' : (insertAtOrder !== null ? 'Regel Tussenvoegen' : 'Nieuwe Inzet Toevoegen')}</DialogTitle>
                <DialogDescription>
                  {editingItem 
                    ? `Bewerken van: ${editingItem.resourceName}`
                    : `De rij wordt toegevoegd aan het blok: ${sections.find(s => s.id === activeSectionForNewRow)?.title}`}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label>Naam middel / medewerker</Label>
                  <input name="name" defaultValue={editingItem?.resourceName || ''} placeholder="Bijv. Veegmachine 569" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Eenheid</Label>
                    <Select value={dialogUnit} onValueChange={(v) => { setDialogUnit(v); if(v === 'dag') setDialogTarget('5'); else if(v === 'uur') setDialogTarget('40'); }}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Kies eenheid" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uur">Uren (h)</SelectItem>
                        <SelectItem value="dag">Dagen (d)</SelectItem>
                        <SelectItem value="stuk">Stuks (st)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tarief per eenheid (€)</Label>
                    <input name="hourlyRate" type="number" step="0.01" defaultValue={editingItem?.hourlyRate || 0} placeholder="0.00" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Streefgetal per week</Label>
                  <Input 
                    type="number" 
                    value={dialogTarget} 
                    onChange={(e) => setDialogTarget(e.target.value)} 
                    placeholder={dialogUnit === 'dag' ? '5' : '40'}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kleur / Categorie</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        className={cn(
                          "h-8 w-full rounded-md border-2 transition-all",
                          editingItem?.color === c.value ? "border-primary scale-110 shadow-sm" : "border-slate-200"
                        )}
                        style={{ backgroundColor: c.value }}
                        onClick={() => {
                          const input = document.getElementById('custom-color-input') as HTMLInputElement;
                          if (input) input.value = c.value;
                        }}
                        title={c.name}
                      />
                    ))}
                    <div className="relative group">
                      <input 
                        id="custom-color-input"
                        name="color" 
                        type="color" 
                        defaultValue={editingItem?.color || '#ffffff'} 
                        className="h-8 w-full p-0 border-none cursor-pointer"
                      />
                      <Palette className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none mix-blend-difference text-white opacity-50" />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsRowDialogOpen(false)}>Annuleren</Button>
                <Button type="submit" disabled={isAddingRow}>
                  {isAddingRow && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingItem ? 'Opslaan' : 'Toevoegen'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isMilestoneDialogOpen} onOpenChange={setIsMilestoneDialogOpen}>
          <DialogContent>
            <form onSubmit={handleSaveQuickMilestone}>
              <DialogHeader>
                <DialogTitle>Milestone Week {selectedWeekForMilestone?.week}</DialogTitle>
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

        <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Opmerking toevoegen</DialogTitle>
              <DialogDescription>
                {selectedCells.size > 1 
                  ? `Voeg een opmerking toe aan de ${selectedCells.size} geselecteerde cellen.` 
                  : `Opmerking voor week ${activeCellForNote?.week}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input 
                value={noteInput} 
                onChange={(e) => setNoteInput(e.target.value)} 
                placeholder="Typ uw opmerking..." 
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCellNoteSave()}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsNoteDialogOpen(false)}>Annuleren</Button>
              <Button onClick={handleCellNoteSave}>Opslaan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {cellContextMenu && (
          <div 
            className="fixed z-[100] bg-white rounded-lg shadow-2xl border border-slate-200 p-2 min-w-[160px] animate-in fade-in zoom-in duration-100"
            style={{ 
              left: cellContextMenu.x, 
              top: cellContextMenu.y,
              transform: `translate(${cellContextMenu.x + 200 > (typeof window !== 'undefined' ? window.innerWidth : 1000) ? '-100%' : '0'}, ${cellContextMenu.y + 300 > (typeof window !== 'undefined' ? window.innerHeight : 1000) ? '-100%' : '0'})`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Markering ({selectedCells.size || 1})</p>
            <div className="grid grid-cols-4 gap-1 mb-2">
              {CELL_PRESET_COLORS.map(c => (
                <button
                  key={c.value}
                  className="h-6 w-6 rounded-md border border-slate-200 hover:scale-110 transition-transform shadow-sm"
                  style={{ backgroundColor: c.value }}
                  onClick={() => handleCellColorChange(cellContextMenu.itemId, cellContextMenu.week, c.value)}
                  title={c.name}
                />
              ))}
              <div className="relative h-6 w-6 rounded-md border border-slate-200 overflow-hidden shadow-sm group">
                  <input 
                      type="color" 
                      className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                      onChange={(e) => handleCellColorChange(cellContextMenu.itemId, cellContextMenu.week, e.target.value)}
                  />
                  <Palette className="absolute inset-0 m-auto h-3 w-3 pointer-events-none mix-blend-difference text-white opacity-50" />
              </div>
            </div>
            
            <Separator className="my-2" />
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start h-8 text-[10px] font-bold gap-2 px-2 hover:bg-slate-100"
              onClick={() => {
                const item = itemsRaw?.find(i => i.id === cellContextMenu.itemId);
                setNoteInput(item?.cellNotes?.[cellContextMenu.week.toString()] || '');
                setActiveCellForNote({ itemId: cellContextMenu.itemId, week: cellContextMenu.week });
                setIsNoteDialogOpen(true);
                setCellContextMenu(null);
              }}
            >
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              Opmerking toevoegen
            </Button>

            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start h-8 text-[10px] font-bold gap-2 px-2 hover:bg-slate-100"
              onClick={() => {
                handleWeekDetailOpen(cellContextMenu.itemId, cellContextMenu.week);
                setCellContextMenu(null);
              }}
            >
              <Clock className="h-3.5 w-3.5 text-primary" />
              Dagelijkse uren
            </Button>

            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start h-8 text-[10px] font-bold gap-2 px-2 hover:bg-slate-100 text-red-600"
              onClick={() => {
                handleCellColorChange(cellContextMenu.itemId, cellContextMenu.week, 'transparent');
                setCellContextMenu(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Reset cel
            </Button>

            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full mt-2 h-7 text-[10px] font-bold bg-slate-50"
              onClick={() => setCellContextMenu(null)}
            >
              Sluiten
            </Button>
          </div>
        )}

        {headerContextMenu && (
          <div 
            className="fixed z-[100] bg-white rounded-lg shadow-2xl border border-slate-200 p-2 min-w-[160px] animate-in fade-in zoom-in duration-100"
            style={{ 
              left: headerContextMenu.x, 
              top: headerContextMenu.y,
              transform: `translate(${headerContextMenu.x + 150 > (typeof window !== 'undefined' ? window.innerWidth : 1000) ? '-100%' : '0'}, ${headerContextMenu.y + 250 > (typeof window !== 'undefined' ? window.innerHeight : 1000) ? '-100%' : '0'})`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Lijn marker</p>
            <div className="flex flex-col gap-1 mb-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="justify-start h-8 text-[10px] font-bold gap-2"
                    onClick={() => handleHeaderBorderToggle(headerContextMenu.sectionId, headerContextMenu.week, 'left')}
                >
                    <div className="w-1.5 h-4 bg-red-600 rounded-full" />
                    {milestonesRaw?.find(m => m.weekNumber === headerContextMenu.week && (m.sectionId === headerContextMenu.sectionId || (headerContextMenu.sectionId === 'default' && !m.sectionId)))?.borderLeft ? 'Lijn links wissen' : 'Rode lijn links'}
                </Button>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="justify-start h-8 text-[10px] font-bold gap-2"
                    onClick={() => handleHeaderBorderToggle(headerContextMenu.sectionId, headerContextMenu.week, 'right')}
                >
                    <div className="w-1.5 h-4 bg-red-600 rounded-full ml-auto" />
                    {milestonesRaw?.find(m => m.weekNumber === headerContextMenu.week && (m.sectionId === headerContextMenu.sectionId || (headerContextMenu.sectionId === 'default' && !m.sectionId)))?.borderRight ? 'Lijn rechts wissen' : 'Rode lijn rechts'}
                </Button>
            </div>

            <Separator className="my-2" />

            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Header kleur</p>
            <div className="grid grid-cols-4 gap-1 mb-2">
              {CELL_PRESET_COLORS.map(c => (
                <button
                  key={c.value}
                  className="h-6 w-6 rounded-md border border-slate-200 hover:scale-110 transition-transform shadow-sm"
                  style={{ backgroundColor: c.value }}
                  onClick={() => handleHeaderColorChange(headerContextMenu.sectionId, headerContextMenu.week, c.value)}
                  title={c.name}
                />
              ))}
              <div className="relative h-6 w-6 rounded-md border border-slate-200 overflow-hidden shadow-sm group">
                  <input 
                      type="color" 
                      className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                      onChange={(e) => handleHeaderColorChange(headerContextMenu.sectionId, headerContextMenu.week, e.target.value)}
                  />
                  <Palette className="absolute inset-0 m-auto h-3 w-3 pointer-events-none mix-blend-difference text-white opacity-50" />
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full mt-2 h-7 text-[10px] font-bold"
              onClick={() => setHeaderContextMenu(null)}
            >
              Sluiten
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
