'use client';

import * as React from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser, updateDocumentNonBlocking, useDoc, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, writeBatch } from 'firebase/firestore';
import { 
  Search, 
  ListFilter, 
  ArrowLeft, 
  Info, 
  Clock, 
  MessageSquare, 
  MapPin, 
  Calendar as CalendarIcon, 
  User, 
  Tag, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Download,
  Filter,
  X,
  FileSpreadsheet,
  Check,
  ImageIcon,
  Maximize2,
  Trash2,
  Loader2,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Melding, UserProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  endOfYear,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useProfile } from '@/firebase/profile-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
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
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import * as XLSX from 'xlsx';
import { useToast } from '@/components/ui/use-toast';
import Image from 'next/image';

const closedStatuses = ["Afgerond", "Niet in beheer", "Geweigerd", "Dubbel gemeld"];

interface ArchiveFilters {
  startDate: string;
  endDate: string;
  hoofdcategorie: string;
  subcategorie: string;
  behandelaar: string;
  status: string;
}

const INITIAL_FILTERS: ArchiveFilters = {
  startDate: '',
  endDate: '',
  hoofdcategorie: 'alle',
  subcategorie: 'all',
  behandelaar: 'alle',
  status: 'alle',
};

export default function ArchiveIssuesPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();
  
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<ArchiveFilters>(INITIAL_FILTERS);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  
  // Selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  
  // State for deletion
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = React.useState(false);
  const [isDuplicatesDialogOpen, setIsDuplicatesDialogOpen] = React.useState(false);
  const [meldingToDelete, setMeldingToDelete] = React.useState<Melding | null>(null);
  const [duplicatesToDelete, setDuplicatesToDelete] = React.useState<string[]>([]);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [sortConfig, setSortConfig] = React.useState<{ field: string; order: 'asc' | 'desc' }>({ 
    field: 'afhandeling_datum', 
    order: 'desc' 
  });

  const isSuperAdmin = profile?.role === 'Super admin';

  const optionsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'issue_options') : null, [firestore]);
  const { data: dbOptions } = useDoc<any>(optionsRef);
  const hoofdcategorieen = dbOptions?.hoofdcategorieen || ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig"];

  const archiveQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'in', closedStatuses)
    );
  }, [firestore, user]);

  const { data: archivedMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(archiveQuery);

  const usersQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users');
  }, [firestore, user]);
  const { data: users } = useCollection<UserProfile>(usersQuery);

  const userMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    users?.forEach(u => {
      const name = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
      if (u.email) map[u.email.toLowerCase()] = name;
      if (name) map[name.toLowerCase()] = name;
    });
    return map;
  }, [users]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const filteredMeldingen = React.useMemo(() => {
    if (!archivedMeldingen) return [];
    
    let result = [...archivedMeldingen];

    // 1. Search Filter
    if (debouncedSearchTerm) {
        const q = debouncedSearchTerm.toLowerCase();
        result = result.filter(m => 
          m.intakenummer?.toLowerCase().includes(q) ||
          m.straatnaam?.toLowerCase().includes(q) ||
          m.plaats?.toLowerCase().includes(q) ||
          m.extra_informatie?.toLowerCase().includes(q)
        );
    }

    // 2. Date Filters
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      result = result.filter(m => {
        const mDate = new Date(m.afhandeling_datum || m.datum).getTime();
        return mDate >= start;
      });
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      result = result.filter(m => {
        const mDate = new Date(m.afhandeling_datum || m.datum).getTime();
        return mDate <= end;
      });
    }

    // 3. Category Filters
    if (filters.hoofdcategorie !== 'alle') {
      result = result.filter(m => m.hoofdcategorie === filters.hoofdcategorie);
    }
    if (filters.subcategorie !== 'all') {
      result = result.filter(m => m.subcategorie === filters.subcategorie);
    }

    // 4. User Filter
    if (filters.behandelaar !== 'alle') {
      result = result.filter(m => m.behandelaar === filters.behandelaar || m.afgehandeld_door === filters.behandelaar);
    }

    // 5. Status Filter
    if (filters.status !== 'alle') {
      result = result.filter(m => m.status === filters.status);
    }

    // Sorting
    result.sort((a, b) => {
        let valA: any = (a as any)[sortConfig.field];
        let valB: any = (b as any)[sortConfig.field];

        if (sortConfig.field === 'afhandeling_datum' || sortConfig.field === 'datum') {
            const timeA = (a as any).afhandeling_tijdstip || (a as any).tijdstip || '00:00';
            const timeB = (b as any).afhandeling_tijdstip || (b as any).tijdstip || '00:00';
            valA = valA ? new Date(`${valA}T${timeA}`).getTime() : 0;
            valB = valB ? new Date(`${valB}T${timeB}`).getTime() : 0;
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
        }

        if (valA < valB) return sortConfig.order === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.order === 'asc' ? 1 : -1;
        return 0;
    });

    return result;
  }, [archivedMeldingen, debouncedSearchTerm, filters, sortConfig]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredMeldingen.length && filteredMeldingen.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMeldingen.map(m => m.id)));
    }
  };

  const handleQuickDateFilter = (type: 'today' | 'week' | 'month' | 'year') => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch(type) {
      case 'today':
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case 'week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case 'year':
        start = startOfYear(now);
        end = endOfYear(now);
        break;
    }

    setFilters(prev => ({
      ...prev,
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd')
    }));
  };

  const handleExport = () => {
    if (filteredMeldingen.length === 0) return;

    const exportData = filteredMeldingen.map(m => {
      const allPhotos = [
        ...(m.fotos || []).map(f => f.url),
        ...(m.afhandeling_fotos || []).map(f => f.url)
      ];

      const row: any = {
        'Intakenummer': m.intakenummer,
        'Extern Nummer': m.extern_meldingsnummer || '',
        'Datum Melding': m.datum,
        'Tijd Melding': m.tijdstip,
        'Hoofdcategorie': m.hoofdcategorie,
        'Subcategorie': m.subcategorie,
        'Adres': `${m.straatnaam || ''} ${m.huisnummer || ''}`.trim(),
        'Postcode': m.postcode || '',
        'Plaats': m.plaats || '',
        'Melder': m.melder || '',
        'Status': m.status,
        'Afgehandeld door': m.afgehandeld_door || m.behandelaar || '',
        'Datum Afhandeling': m.afhandeling_datum || '',
        'Tijd Afhandeling': m.afhandeling_tijdstip || '',
        'Minuten gewerkt': m.gewerkteMinuten || 0,
        'Bijzonderheden': m.afhandeling_bijzonderheden || '',
      };

      // Voeg elke foto toe aan een eigen kolom
      allPhotos.forEach((url, index) => {
        row[`Foto ${index + 1}`] = url;
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Archief Meldingen");
    
    // Stel kolombreedte in
    const wscols = [
        {wch: 15}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 20}, {wch: 25}, 
        {wch: 30}, {wch: 10}, {wch: 15}, {wch: 20}, {wch: 15}, {wch: 20},
        {wch: 15}, {wch: 10}, {wch: 10}, {wch: 40}
    ];
    
    // Voeg breedte toe voor foto kolommen (maximaal 10 voor de veiligheid)
    for (let i = 0; i < 10; i++) {
        wscols.push({wch: 50});
    }
    
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `BeheerHub_Export_Archief_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);
    toast({ title: "Export voltooid", description: "Het Excel bestand is gedownload met gescheiden foto-kolommen." });
  };

  const handleIdentifyDuplicates = () => {
    if (!archivedMeldingen) return;

    const groups: Record<string, Melding[]> = {};
    
    archivedMeldingen.forEach(m => {
        // Criteria: intakenummer, straat, huisnr, postcode, containernr
        const key = [
            m.intakenummer,
            m.straatnaam,
            m.huisnummer,
            m.postcode,
            m.containernummer
        ].map(v => (v || '').toLowerCase().trim()).join('|');

        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
    });

    const idsToDelete: string[] = [];
    Object.values(groups).forEach(group => {
        if (group.length > 1) {
            // Keep the first one, delete others
            // Sort by creation date to keep the oldest one if possible
            group.sort((a, b) => {
                const timeA = a.createdAt?.seconds || 0;
                const timeB = b.createdAt?.seconds || 0;
                return timeA - timeB;
            });
            
            // Collect IDs of everything after the first element
            const extras = group.slice(1).map(m => m.id);
            idsToDelete.push(...extras);
        }
    });

    if (idsToDelete.length === 0) {
        toast({ title: "Geen dubbelen", description: "Er zijn geen identieke meldingen gevonden in het archief." });
        return;
    }

    setDuplicatesToDelete(idsToDelete);
    setIsDuplicatesDialogOpen(true);
  };

  const handleConfirmCleanDuplicates = async () => {
    if (!firestore || duplicatesToDelete.length === 0 || !isSuperAdmin) return;
    
    setIsDeleting(true);
    try {
        const batchSize = 500;
        const total = duplicatesToDelete.length;
        
        for (let i = 0; i < total; i += batchSize) {
            const batch = writeBatch(firestore);
            const chunk = duplicatesToDelete.slice(i, i + batchSize);
            chunk.forEach(id => {
                batch.delete(doc(firestore, 'meldingen', id));
            });
            await batch.commit();
        }

        toast({ 
            title: "Archief opgeschoond", 
            description: `${total} dubbele meldingen zijn succesvol verwijderd.` 
        });
        setDuplicatesToDelete([]);
        setIsDuplicatesDialogOpen(false);
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij opschonen" });
    } finally {
        setIsDeleting(false);
    }
  };

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleDeleteMelding = async (melding: Melding) => {
    if (!firestore || !isSuperAdmin) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'meldingen', melding.id));
        toast({ title: "Melding verwijderd", description: "De melding is permanent gewist uit de database." });
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij verwijderen" });
    }
  };

  const handleBulkDelete = async () => {
    if (!firestore || !isSuperAdmin || selectedIds.size === 0) return;
    
    setIsDeleting(true);
    try {
        const batch = writeBatch(firestore);
        selectedIds.forEach(id => {
            batch.delete(doc(firestore, 'meldingen', id));
        });
        await batch.commit();
        toast({ 
            title: "Bulk verwijdering voltooid", 
            description: `${selectedIds.size} meldingen zijn permanent verwijderd.` 
        });
        setSelectedIds(new Set());
        setIsBulkDeleteDialogOpen(false);
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij bulk verwijderen" });
    } finally {
        setIsDeleting(false);
    }
  };

  const formatDisplayName = (nameOrEmail?: string) => {
    if (!nameOrEmail) return '-';
    const normalized = nameOrEmail.toLowerCase();
    return userMap[normalized] || nameOrEmail;
  };

  const formatDuration = (minutes?: number) => {
    if (minutes === undefined || minutes === null) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours === 0 ? `${mins}m` : `${hours}u ${mins}m`;
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortConfig.field !== field) return <ArrowUpDown className="h-3 w-3 opacity-20" />;
    return sortConfig.order === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6.1rem)] overflow-hidden bg-background">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b shrink-0 gap-4 bg-slate-50/50">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="shrink-0 rounded-none h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Meldingen Archief</h1>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Zoek op ID of adres..."
                    className="pl-9 h-9 border-slate-200 rounded-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            
            <div className="flex items-center gap-1">
                {isSuperAdmin && (
                    <Button variant="outline" size="sm" onClick={handleIdentifyDuplicates} className="h-9 font-bold rounded-none border-slate-200 shadow-sm text-orange-600 hover:bg-orange-50">
                        <Copy className="mr-2 h-4 w-4" />
                        Dubbelen opruimen
                    </Button>
                )}
                
                <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 font-bold rounded-none border-slate-200 shadow-sm">
                        <Filter className="mr-2 h-4 w-4" />
                        Filter {Object.values(filters).filter(v => v !== '' && v !== 'alle' && v !== 'all').length > 0 && (
                        <Badge className="ml-1 h-4 px-1 rounded-none bg-primary text-white text-[8px]">
                            {Object.values(filters).filter(v => v !== '' && v !== 'alle' && v !== 'all').length}
                        </Badge>
                        )}
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl rounded-none border-none shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-slate-900 text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary p-2 rounded-none">
                        <ListFilter className="h-5 w-5 text-white" />
                        </div>
                        <div>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Geavanceerd Filter</DialogTitle>
                        <DialogDescription className="text-slate-400 font-bold uppercase text-[10px]">Filter het archief op datum, categorie of behandelaar.</DialogDescription>
                        </div>
                    </div>
                    </DialogHeader>

                    <ScrollArea className="max-h-[60vh]">
                    <div className="p-6 space-y-8">
                        <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Snelkeuze Periode</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleQuickDateFilter('today')} className="h-9 font-bold text-[11px] rounded-none border-slate-200">Vandaag</Button>
                            <Button variant="outline" size="sm" onClick={() => handleQuickDateFilter('week')} className="h-9 font-bold text-[11px] rounded-none border-slate-200">Deze Week</Button>
                            <Button variant="outline" size="sm" onClick={() => handleQuickDateFilter('month')} className="h-9 font-bold text-[11px] rounded-none border-slate-200">Deze Maand</Button>
                            <Button variant="outline" size="sm" onClick={() => handleQuickDateFilter('year')} className="h-9 font-bold text-[11px] rounded-none border-slate-200">Dit Jaar</Button>
                        </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Vanaf Datum</Label>
                            <Input type="date" value={filters.startDate} onChange={e => setFilters(prev => ({...prev, startDate: e.target.value}))} className="h-11 font-bold rounded-none border-slate-200" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Tot Datum</Label>
                            <Input type="date" value={filters.endDate} onChange={e => setFilters(prev => ({...prev, endDate: e.target.value}))} className="h-11 font-bold rounded-none border-slate-200" />
                        </div>
                        </div>

                        <Separator className="bg-slate-100" />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Hoofdcategorie</Label>
                            <Select value={filters.hoofdcategorie} onValueChange={v => setFilters(prev => ({...prev, hoofdcategorie: v, subcategorie: 'all'}))}>
                            <SelectTrigger className="h-11 font-bold rounded-none border-slate-200">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                                <SelectItem value="alle">-- Alle categorieën --</SelectItem>
                                {hoofdcategorieen.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Subcategorie</Label>
                            <Select value={filters.subcategorie} onValueChange={v => setFilters(prev => ({...prev, subcategorie: v}))} disabled={filters.hoofdcategorie === 'alle'}>
                            <SelectTrigger className="h-11 font-bold rounded-none border-slate-200">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                                <SelectItem value="all">-- Alle subcategorieën --</SelectItem>
                                {dbOptions?.subcategorieen?.[filters.hoofdcategorie]?.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                            </Select>
                        </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Behandelaar</Label>
                            <Select value={filters.behandelaar} onValueChange={v => setFilters(prev => ({...prev, behandelaar: v}))}>
                            <SelectTrigger className="h-11 font-bold rounded-none border-slate-200">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                                <SelectItem value="alle">-- Alle behandelaars --</SelectItem>
                                {users?.map(u => (
                                <SelectItem key={u.id} value={u.displayName || u.email!}>
                                    {u.displayName || u.email}
                                </SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Status</Label>
                            <Select value={filters.status} onValueChange={v => setFilters(prev => ({...prev, status: v}))}>
                            <SelectTrigger className="h-11 font-bold rounded-none border-slate-200">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                                <SelectItem value="alle">-- Alle archief statussen --</SelectItem>
                                {closedStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                            </Select>
                        </div>
                        </div>
                    </div>
                    </ScrollArea>

                    <DialogFooter className="p-6 border-t bg-slate-50 shrink-0 flex flex-col sm:flex-row gap-3">
                    <Button variant="ghost" onClick={() => setFilters(INITIAL_FILTERS)} className="font-bold flex-1 rounded-none h-12">Filters Wissen</Button>
                    <Button variant="outline" onClick={handleExport} className="font-black uppercase tracking-tight flex-1 rounded-none h-12 shadow-sm gap-2">
                        <FileSpreadsheet className="h-4 w-4" /> Export Excel
                    </Button>
                    <Button onClick={() => setIsFilterOpen(false)} className="font-black uppercase tracking-tight flex-1 rounded-none h-12 shadow-xl shadow-primary/20 gap-2">
                        <Check className="h-4 w-4" /> Toepassen
                    </Button>
                    </DialogFooter>
                </DialogContent>
                </Dialog>
            </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 relative">
        {isLoadingMeldingen ? (
            <LoadingScreen message="Archief laden..." />
        ) : filteredMeldingen.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50/50 rounded-none border-2 border-dashed border-slate-200">
                <Info className="h-12 w-12 text-slate-300 mb-4" />
                <p className="font-black uppercase tracking-tight text-slate-900">Geen meldingen gevonden</p>
                <p className="text-sm text-slate-500 mt-1">Pas de zoekterm of filters aan.</p>
                {Object.values(filters).some(v => v !== '' && v !== 'alle' && v !== 'all') && (
                  <Button variant="link" onClick={() => setFilters(INITIAL_FILTERS)} className="mt-4 font-bold text-primary">Filters herstellen</Button>
                )}
            </div>
        ) : (
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:hidden">
                    {filteredMeldingen.map((melding, index) => {
                        const allPhotos = [...(melding.fotos || []), ...(melding.afhandeling_fotos || [])];
                        const isSelected = selectedIds.has(melding.id);
                        return (
                            <Card 
                                key={melding.id} 
                                className={cn(
                                    "overflow-hidden border-none shadow-lg active:scale-[0.98] transition-transform rounded-none relative",
                                    isSelected && "ring-2 ring-primary"
                                )}
                                onClick={() => selectedIds.size > 0 ? handleToggleSelect(melding.id) : router.push(`/issues/new?id=${melding.id}`)}
                            >
                                <CardContent className="p-0">
                                    <div className="p-4 bg-slate-50 border-b flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            {isSuperAdmin && (
                                                <Checkbox 
                                                    checked={isSelected}
                                                    onCheckedChange={() => handleToggleSelect(melding.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="h-5 w-5 rounded-md"
                                                />
                                            )}
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Intakenummer</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{melding.intakenummer}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isSuperAdmin && selectedIds.size === 0 && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-none shrink-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMeldingToDelete(melding);
                                                        setIsDeleteDialogOpen(true);
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-tighter h-5 px-2 bg-slate-200 text-slate-600 border-none rounded-none">
                                                {melding.status}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-start gap-3">
                                            <div className="bg-primary/10 p-2 rounded-none shrink-0">
                                                <MapPin className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-900 leading-snug">
                                                    {[melding.straatnaam, melding.huisnummer].filter(Boolean).join(' ')}
                                                </p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                                    {[melding.postcode, melding.plaats].filter(Boolean).join(' ')}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            <div className="bg-blue-50 p-2 rounded-none shrink-0">
                                                <Tag className="h-4 w-4 text-blue-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-slate-700 truncate">{melding.subcategorie}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">{melding.hoofdcategorie}</p>
                                            </div>
                                        </div>

                                        {allPhotos.length > 0 && (
                                            <div className="pt-2">
                                                <ScrollArea className="w-full whitespace-nowrap rounded-none border-none">
                                                    <div className="flex w-max space-x-2 p-1">
                                                        {allPhotos.map((photo, i) => (
                                                            <div 
                                                                key={i} 
                                                                className="relative h-12 w-12 rounded-none overflow-hidden border border-slate-100 flex-none"
                                                                onClick={(e) => { e.stopPropagation(); setPreviewImage(photo.url); }}
                                                            >
                                                                <Image src={photo.url} alt="melding" fill className="object-cover" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <CalendarIcon className="h-3 w-3 text-slate-300" />
                                                    <span className="text-[10px] font-bold text-slate-500">
                                                        Afgehandeld: {melding.afhandeling_datum ? format(new Date(`${melding.afhandeling_datum}T${melding.afhandeling_tijdstip || '00:00'}`), 'dd MMM yyyy, HH:mm') : '-'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-3 w-3 text-slate-300" />
                                                    <span className="text-[10px] font-bold text-slate-500">
                                                        Duur: {formatDuration(melding.gewerkteMinuten)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 px-2.5 py-1 rounded-none border-2 border-slate-100 bg-slate-50">
                                                <User className="h-3 w-3 text-primary" />
                                                <span className="text-[10px] font-black text-primary uppercase truncate max-w-[100px]">
                                                    {formatDisplayName(melding.afgehandeld_door || melding.behandelaar)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                <div className="hidden md:block border rounded-none overflow-hidden shadow-sm bg-white">
                    <div className="overflow-x-auto">
                        <Table className="border-collapse w-full">
                            <TableHeader className="sticky top-0 bg-slate-100 z-10">
                            <TableRow className="hover:bg-transparent border-b-2 border-slate-200">
                                <TableHead className="w-[50px] p-2 border-r border-slate-200 text-center">
                                    <Checkbox 
                                        checked={selectedIds.size === filteredMeldingen.length && filteredMeldingen.length > 0} 
                                        onCheckedChange={handleSelectAll}
                                        className="h-5 w-5 rounded-md"
                                    />
                                </TableHead>
                                <TableHead onClick={() => handleSort('intakenummer')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Intakenr.
                                        <SortIcon field="intakenummer" />
                                    </div>
                                </TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Media</TableHead>
                                <TableHead onClick={() => handleSort('straatnaam')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Adres
                                        <SortIcon field="straatnaam" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('datum')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Meld Datum/Tijd
                                        <SortIcon field="datum" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('afhandeling_datum')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Afgehandeld op
                                        <SortIcon field="afhandeling_datum" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('gewerkteMinuten')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Duur
                                        <SortIcon field="gewerkteMinuten" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('afgehandeld_door')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Door
                                        <SortIcon field="afgehandeld_door" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('afhandeling_bijzonderheden')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Opmerkingen
                                        <SortIcon field="afhandeling_bijzonderheden" />
                                    </div>
                                </TableHead>
                                {isSuperAdmin && <TableHead className="w-[50px] bg-slate-100" />}
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredMeldingen.map((melding, index) => {
                                    const allPhotos = [...(melding.fotos || []), ...(melding.afhandeling_fotos || [])];
                                    const isSelected = selectedIds.has(melding.id);
                                    return (
                                        <TableRow 
                                            key={melding.id} 
                                            className={cn(
                                                "group h-12 hover:bg-slate-50/50 transition-colors border-b border-slate-100",
                                                isSelected && "bg-blue-50/50"
                                            )}
                                        >
                                            <TableCell className="p-2 border-r border-slate-100 text-center" onClick={(e) => e.stopPropagation()}>
                                                <Checkbox 
                                                    checked={isSelected} 
                                                    onCheckedChange={() => handleToggleSelect(melding.id)}
                                                    className="h-5 w-5 rounded-md"
                                                />
                                            </TableCell>
                                            <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer font-black py-2 px-4 border-r border-slate-100">{melding.intakenummer || '-'}</TableCell>
                                            <TableCell className="py-2 px-4 border-r border-slate-100 w-[80px]">
                                                <div className="flex items-center gap-1">
                                                    {allPhotos.slice(0, 2).map((p, i) => (
                                                        <div key={i} className="relative h-8 w-8 border border-slate-100 overflow-hidden cursor-pointer" onClick={(e) => { e.stopPropagation(); setPreviewImage(p.url); }}>
                                                            <Image src={p.url} alt="media" fill className="object-cover" />
                                                        </div>
                                                    ))}
                                                    {allPhotos.length > 2 && (
                                                        <div className="h-8 w-8 bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                                                            +{allPhotos.length - 2}
                                                        </div>
                                                    )}
                                                    {allPhotos.length === 0 && <ImageIcon className="h-4 w-4 text-slate-200" />}
                                                </div>
                                            </TableCell>
                                            <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer truncate py-2 px-4 border-r border-slate-100 max-w-[200px] text-xs font-bold text-slate-900">{[melding.straatnaam, melding.huisnummer, melding.plaats].filter(Boolean).join(', ') || '-'}</TableCell>
                                            <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer py-2 px-4 border-r border-slate-100">
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-bold text-slate-600">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yy') : '-'}</span>
                                                    <span className="text-[9px] font-bold text-slate-400">{melding.tijdstip || '--:--'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer py-2 px-4 border-r border-slate-100">
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-black text-primary">{melding.afhandeling_datum ? format(new Date(melding.afhandeling_datum), 'dd-MM-yy') : '-'}</span>
                                                    <span className="text-[9px] font-bold text-slate-400">{melding.afhandeling_tijdstip || '--:--'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer py-2 px-4 border-r border-slate-100">
                                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                                                    <Clock className="h-3 w-3 text-slate-400" />
                                                    {formatDuration(melding.gewerkteMinuten)}
                                                </div>
                                            </TableCell>
                                            <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)} className='cursor-pointer truncate py-2 px-4 border-r border-slate-100 text-xs font-black text-slate-900'>{formatDisplayName(melding.afgehandeld_door || melding.behandelaar)}</TableCell>
                                            <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer py-2 px-4 border-r border-slate-100 max-w-xs">
                                                <div className="flex items-start gap-2">
                                                    {melding.afhandeling_bijzonderheden ? (
                                                        <>
                                                            <MessageSquare className="h-3 w-3 mt-0.5 text-blue-500 shrink-0" />
                                                            <p className="text-[11px] font-medium text-slate-500 italic truncate" title={melding.afhandeling_bijzonderheden}>
                                                                {melding.afhandeling_bijzonderheden}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-300 font-medium">Geen bijzonderheden</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            {isSuperAdmin && (
                                                <TableCell className="py-2 px-4">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-8 w-8 text-red-300 hover:text-red-600 rounded-none"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMeldingToDelete(melding);
                                                            setIsDeleteDialogOpen(true);
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && isSuperAdmin && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-10 duration-300">
          <div className="bg-slate-900 text-white rounded-none px-6 py-3 shadow-2xl flex items-center gap-6 border-2 border-slate-800">
            <div className="flex items-center gap-3 border-r border-white/20 pr-6">
              <div className="bg-primary h-8 w-8 rounded-none flex items-center justify-center font-black text-xs">
                {selectedIds.size}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">Geselecteerd</span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => setIsBulkDeleteDialogOpen(true)}
                className="h-10 px-6 font-black uppercase text-xs tracking-tight bg-red-600 hover:bg-red-700 rounded-none shadow-lg"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Verwijder Selectie
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setSelectedIds(new Set())}
                className="h-10 text-white hover:bg-white/10 rounded-none font-bold text-xs"
              >
                Annuleren
              </Button>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div 
            className="fixed inset-0 z-[200] bg-black/90 flex flex-col animate-in fade-in duration-200" 
            onClick={() => setPreviewImage(null)}
        >
            <div className="flex justify-end p-6 shrink-0">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-none h-12 w-12 border-2 border-white/20">
                    <X className="h-8 w-8" />
                </Button>
            </div>
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                <img 
                    src={previewImage} 
                    alt="Preview" 
                    className="max-w-[95%] max-h-[95%] object-contain shadow-2xl" 
                    onClick={(e) => e.stopPropagation()} 
                />
            </div>
            <div className="p-8 text-center text-white/40 text-[10px] font-black uppercase tracking-[0.3em] shrink-0">
                BEHEERHUB MEDIA VIEWER
            </div>
        </div>
      )}

      {/* Confirmation Dialog for Single Deletion */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-none border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tight">Melding definitief verwijderen?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-slate-500">
              Weet u zeker dat u melding <strong>{meldingToDelete?.intakenummer}</strong> permanent wilt verwijderen uit de database? Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-none font-bold">Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => meldingToDelete && handleDeleteMelding(meldingToDelete)} 
              className="bg-red-600 hover:bg-red-700 rounded-none font-black uppercase px-8"
            >
              Permanent Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Dialog for Bulk Deletion */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent className="rounded-none border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tight">
                {selectedIds.size} Meldingen definitief verwijderen?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-slate-500">
              U staat op het punt om <strong>{selectedIds.size} meldingen</strong> permanent te verwijderen uit het archief. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-none font-bold">Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete} 
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 rounded-none font-black uppercase px-8"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Selectie Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Dialog for Duplicates Deletion */}
      <AlertDialog open={isDuplicatesDialogOpen} onOpenChange={setIsDuplicatesDialogOpen}>
        <AlertDialogContent className="rounded-none border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tight text-orange-600">
                Dubbele meldingen verwijderen?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="font-bold text-slate-500">
                Er zijn <strong>{duplicatesToDelete.length} dubbele meldingen</strong> gevonden in het archief. 
                <br/><br/>
                Het systeem heeft meldingen vergeleken op:
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Intakenummer</li>
                  <li>Straat & Huisnummer</li>
                  <li>Postcode</li>
                  <li>Containernummer</li>
                </ul>
                <br/>
                Per groep identieke meldingen wordt de oudste melding behouden. De rest wordt permanent verwijderd.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-none font-bold">Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmCleanDuplicates} 
              disabled={isDeleting}
              className="bg-orange-600 hover:bg-orange-700 rounded-none font-black uppercase px-8"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dubbelen nu wissen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
