'use client';

import * as React from 'react';
import {
  Filter,
  Save,
  Map as MapIcon,
  Plus,
  Search,
  ChevronDown,
  MapPin,
  MoreVertical,
  ChevronRight,
  ImageIcon,
  Upload,
  List,
  Palette,
  Download,
  ArrowLeft,
  Cpu,
  Clock,
  Activity,
  History,
  Loader2,
  Check,
  PlusCircle,
  Trash2,
  ShieldCheck,
  SearchCode,
  FileCheck,
  AlertTriangle,
  AlertCircle,
  Settings2,
  Tag,
  LayoutGrid,
  MapPinned,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { MapboxView } from '@/components/mapbox-view';
import { ObjectImportDialog } from '@/components/object-import-dialog';
import { ObjectExportDialog } from '@/components/object-export-dialog';
import { useCollection, useFirestore, updateDocumentNonBlocking, useMemoFirebase, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, arrayRemove } from 'firebase/firestore';
import type { Wijk } from '@/lib/types';
import * as turf from '@turf/turf';
import { Label } from '@/components/ui/label';
import { useProject } from '@/context/project-context';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
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
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ObjectsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isTablet = useIsMobile(1024);
  const [isImporting, setIsImporting] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedObject, setSelectedObject] = React.useState<any | null>(null);
  const [viewMode, setViewMode] = React.useState<'list' | 'map'>('list');
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null);
  const [isAddFilterDialogOpen, setIsAddFilterDialogOpen] = React.useState(false);
  const [newFilterName, setNewFilterName] = React.useState('');
  const [isSavingFilter, setIsSavingFilter] = React.useState(false);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore || !typeFilter) return null;
    if (typeFilter === 'all') return collection(firestore, 'objects');
    return query(collection(firestore, 'objects'), where('locatieType', '==', typeFilter));
  }, [firestore, typeFilter]);

  const filtersRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'object_filters') : null, [firestore]);
  const { data: filtersData } = useDoc<{ custom: string[] }>(filtersRef);
  const customFilters = filtersData?.custom || [];

  const { data: objects, isLoading: isLoadingObjects } = useCollection<any>(objectsQuery);

  const filteredObjectsList = React.useMemo(() => {
    if (!objects) return [];
    let filtered = objects;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (obj) =>
          (obj.idNummer || obj.id || '').toLowerCase().includes(q) ||
          (obj.straatnaam || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [objects, searchTerm]);

  const handleUpdateField = (field: string, value: any) => {
    if (!firestore || !selectedObject) return;
    const objectRef = doc(firestore, 'objects', selectedObject.id);
    updateDocumentNonBlocking(objectRef, { [field]: value });
    setSelectedObject((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleAddCustomFilter = async () => {
    if (!firestore || !newFilterName.trim() || !filtersRef) return;
    setIsAddFilterDialogOpen(false);
    setIsSavingFilter(true);
    try {
        await setDocumentNonBlocking(filtersRef, { custom: Array.from(new Set([...customFilters, newFilterName.trim()])) }, { merge: true });
        toast({ title: 'Filter toegevoegd', description: `De categorie '${newFilterName}' is toegevoegd aan de filters.` });
        setNewFilterName('');
    } catch (error) {
        toast({ variant: 'destructive', title: 'Fout', description: 'Kon het filter niet opslaan.' });
    } finally {
        setIsSavingFilter(false);
    }
  };

  const handleDeleteFilter = async (filterName: string) => {
    if (!firestore || !filtersRef) return;
    try {
        await updateDocumentNonBlocking(filtersRef, { custom: arrayRemove(filterName) });
        if (typeFilter === filterName) setTypeFilter(null);
        toast({ title: 'Filter verwijderd', description: `De categorie '${filterName}' is verwijderd.` });
    } catch (error) {
        toast({ variant: 'destructive', title: 'Fout', description: 'Kon het filter niet verwijderen.' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50/50">
      <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 font-bold gap-2 rounded-lg border-zinc-200">
                <Filter className="h-4 w-4 text-zinc-400" /> 
                {typeFilter ? (typeFilter === 'all' ? 'Alle Objecten' : typeFilter) : 'Kies Categorie'}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 rounded-xl shadow-xl p-1.5 border-zinc-200">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 py-1">Systeem Categorieën</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTypeFilter('all')} className="rounded-lg h-9 text-xs font-semibold">
                Toon alles (Hoge belasting)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 py-1">Filters</DropdownMenuLabel>
              <ScrollArea className="max-h-60">
                {customFilters.map(filter => (
                  <div key={filter} className="flex items-center group">
                    <DropdownMenuItem onClick={() => setTypeFilter(filter)} className="flex-1 rounded-lg h-9 text-xs font-semibold">
                      {filter}
                    </DropdownMenuItem>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-600 mr-1"
                      onClick={(e) => { e.stopPropagation(); handleDeleteFilter(filter); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </ScrollArea>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsAddFilterDialogOpen(true)} className="rounded-lg h-9 text-xs font-bold text-primary">
                <PlusCircle className="mr-2 h-4 w-4" /> Nieuwe categorie
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-9 font-bold rounded-lg" onClick={() => setViewMode('list')} disabled={!typeFilter}>
            <List className="h-4 w-4 mr-2" /> Lijst
          </Button>
          <Button variant={viewMode === 'map' ? 'secondary' : 'ghost'} size="sm" className="h-9 font-bold rounded-lg" onClick={() => setViewMode('map')} disabled={!typeFilter}>
            <MapIcon className="h-4 w-4 mr-2" /> Kaart
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-64 hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input placeholder="Snelzoeken..." className="pl-9 h-9 text-xs font-medium rounded-lg border-zinc-200 bg-zinc-50" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} disabled={!typeFilter} />
          </div>
          <ObjectImportDialog open={isImporting} onOpenChange={setIsImporting} onSuccess={() => setIsImporting(false)}>
            <Button variant="outline" size="sm" className="h-9 font-bold rounded-lg"><Upload className="h-4 w-4 mr-2" /> Import</Button>
          </ObjectImportDialog>
          <Button variant="outline" size="sm" className="h-9 font-bold rounded-lg" disabled={!typeFilter}><Download className="h-4 w-4 mr-2" /> Export</Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {!typeFilter ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-zinc-50/30">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-zinc-100 mb-6 animate-in zoom-in-95 duration-500">
              <Filter className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight mb-2 text-slate-900">Selecteer een Categorie</h3>
            <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto leading-relaxed">
              Kies linksboven een filter om de bijbehorende objecten te laden. Dit bespaart reads en zorgt voor een snellere interface.
            </p>
          </div>
        ) : (
          <>
            <aside className={cn(
              "w-full lg:w-80 border-r bg-white flex flex-col shrink-0",
              isTablet && selectedObject ? "hidden" : "flex"
            )}>
              <div className="p-4 border-b flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 ml-1">Resultaten</p>
                  <p className="text-xl font-extrabold tracking-tighter text-zinc-900 ml-1">
                    {isLoadingObjects ? '...' : filteredObjectsList.length}
                  </p>
                </div>
                <Badge variant="secondary" className="mb-1 uppercase text-[9px] font-black">{typeFilter}</Badge>
              </div>
              <ScrollArea className="flex-1">
                {isLoadingObjects ? (
                  <div className="p-4 space-y-4">
                    {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                  </div>
                ) : filteredObjectsList.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {filteredObjectsList.map(obj => (
                      <button
                        key={obj.id}
                        onClick={() => setSelectedObject(obj)}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left group",
                          selectedObject?.id === obj.id ? "bg-zinc-900 text-white shadow-lg" : "hover:bg-zinc-50"
                        )}
                      >
                        <div className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border",
                          selectedObject?.id === obj.id ? "bg-white/10 border-white/10" : "bg-zinc-100 border-zinc-200"
                        )}>
                          <MapPin className={cn("h-5 w-5", selectedObject?.id === obj.id ? "text-white" : "text-zinc-400")} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate uppercase tracking-tight">{obj.idNummer || obj.id}</p>
                          <p className={cn("text-[10px] font-medium truncate uppercase tracking-widest mt-0.5", selectedObject?.id === obj.id ? "text-white/60" : "text-zinc-400")}>
                            {obj.straatnaam} {obj.huisnummer}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Geen resultaten</p>
                  </div>
                )}
              </ScrollArea>
            </aside>

            <main className="flex-1 overflow-hidden relative bg-white">
              {selectedObject ? (
                <div className="h-full flex flex-col md:flex-row min-h-0">
                  <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 custom-scrollbar">
                    <div className="flex items-center justify-between mb-8">
                      <div className="space-y-1">
                        <h2 className="text-4xl font-extrabold tracking-tighter text-zinc-900 uppercase">{selectedObject.idNummer || selectedObject.id}</h2>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="h-6 font-bold uppercase text-[9px] tracking-widest border-2">{selectedObject.locatieType}</Badge>
                          <Badge className="h-6 font-bold uppercase text-[9px] tracking-widest bg-zinc-900">{selectedObject.isActief ? 'Operationeel' : 'Inactief'}</Badge>
                        </div>
                      </div>
                      {isTablet && <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setSelectedObject(null)}><ArrowLeft className="h-5 w-5" /></Button>}
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 border-b pb-3 flex items-center gap-2"><MapPin className="h-4 w-4" /> Locatie & Adres</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest ml-1">Straatnaam</Label>
                                <Input value={selectedObject.straatnaam || ''} onChange={e => handleUpdateField('straatnaam', e.target.value)} className="h-11 font-bold rounded-lg border-zinc-200" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest ml-1">Huisnummer</Label>
                                <Input value={selectedObject.huisnummer || ''} onChange={e => handleUpdateField('huisnummer', e.target.value)} className="h-11 font-bold rounded-lg border-zinc-200" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest ml-1">Postcode</Label>
                                <Input value={selectedObject.postcode || ''} onChange={e => handleUpdateField('postcode', e.target.value)} className="h-11 font-bold rounded-lg border-zinc-200" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest ml-1">Plaats</Label>
                                <Input value={selectedObject.plaats || ''} onChange={e => handleUpdateField('plaats', e.target.value)} className="h-11 font-bold rounded-lg border-zinc-200" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 border-b pb-3 flex items-center gap-2"><Tag className="h-4 w-4" /> Categorisering</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest ml-1">Hoofdtype</Label>
                                <Input value={selectedObject.locatieType || ''} onChange={e => handleUpdateField('locatieType', e.target.value)} className="h-11 font-bold rounded-lg border-zinc-200" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest ml-1">Subtype</Label>
                                <Input value={selectedObject.locatieSubType || ''} onChange={e => handleUpdateField('locatieSubType', e.target.value)} className="h-11 font-bold rounded-lg border-zinc-200" />
                            </div>
                        </div>
                    </div>

                    {selectedObject.locatieWerkgebieden && selectedObject.locatieWerkgebieden.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 border-b pb-3 flex items-center gap-2"><MapPinned className="h-4 w-4" /> Werkgebieden & Routes</h3>
                            <div className="flex flex-wrap gap-2">
                                {selectedObject.locatieWerkgebieden.map((area: string) => (
                                    <Badge key={area} variant="secondary" className="px-3 py-1 font-bold uppercase text-[9px] tracking-widest rounded-lg bg-zinc-100 border-zinc-200">{area}</Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="p-6 bg-zinc-50 border rounded-2xl space-y-6">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 border-b pb-3 flex items-center gap-2"><Settings2 className="h-4 w-4" /> Configuratie</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-zinc-900 uppercase">Actieve status</p>
                            <p className="text-[10px] font-medium text-zinc-400">Object opnemen in routes</p>
                          </div>
                          <Switch checked={selectedObject.isActief} onCheckedChange={c => handleUpdateField('isActief', c)} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest ml-1">Kwaliteit</Label>
                          <Select value={selectedObject.kwaliteit} onValueChange={v => handleUpdateField('kwaliteit', v)}>
                            <SelectTrigger className="h-10 font-bold bg-white border-zinc-200"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl shadow-xl">
                              <SelectItem value="A" className="font-semibold">A - Hoog</SelectItem>
                              <SelectItem value="B" className="font-semibold">B - Standaard</SelectItem>
                              <SelectItem value="C" className="font-semibold">C - Laag</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest ml-1">Memo / Waarschuwing</Label>
                      <Textarea value={selectedObject.waarschuwing || ''} onChange={e => handleUpdateField('waarschuwing', e.target.value)} placeholder="Bijzonderheden..." className="min-h-[120px] rounded-2xl border-zinc-200 font-medium resize-none leading-relaxed" />
                    </div>
                  </div>

                  <div className="w-full md:w-[400px] border-l bg-zinc-50/30 flex flex-col p-6 gap-6 overflow-y-auto no-scrollbar">
                    <Card className="aspect-square w-full border-none shadow-lg ring-1 ring-black/5 rounded-[2rem] overflow-hidden">
                      <MapboxView latitude={selectedObject.latitude} longitude={selectedObject.longitude} interactive={false} />
                    </Card>

                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-black/5 ring-1 ring-zinc-100 flex flex-col items-center text-center gap-4">
                      <div className="h-16 w-16 rounded-2xl bg-zinc-900 flex items-center justify-center text-white text-2xl font-black">
                        {selectedObject.vulgraad || 0}%
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase text-zinc-400 tracking-widest mb-1">Vulgraad</h4>
                        <p className="text-xs font-medium text-zinc-500 max-w-[200px]">Real-time meting verzonden via IOT sensor.</p>
                      </div>
                      <Progress value={selectedObject.vulgraad || 0} variant="gauge" className="h-2 w-full mt-2" />
                    </div>

                    <Card className="h-48 border-zinc-200 border-dashed border-2 bg-transparent flex flex-col items-center justify-center text-zinc-300 gap-3 group cursor-pointer hover:bg-zinc-50 transition-colors">
                      <ImageIcon className="h-8 w-8 opacity-20 group-hover:scale-110 transition-transform" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Geen Media</p>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-grid">
                  <div className="bg-white p-8 rounded-[2rem] shadow-2xl border mb-6">
                    <MapPin className="h-12 w-12 text-zinc-200" />
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight text-zinc-900 uppercase">Geen object geselecteerd</h3>
                  <p className="text-zinc-400 font-medium max-w-xs mx-auto text-sm">Kies een unit uit de lijst aan de linkerkant om de details te beheren.</p>
                </div>
              )}
            </main>
          </>
        )}
      </div>

      <Dialog open={isAddFilterDialogOpen} onOpenChange={setIsAddFilterDialogOpen}>
        <DialogContent className="rounded-2xl border-none shadow-2xl p-8 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold uppercase tracking-tight">Nieuw Filter</DialogTitle>
            <DialogDescription className="font-medium text-zinc-500">Geef een naam op voor de nieuwe categorie.</DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <Input value={newFilterName} onChange={e => setNewFilterName(e.target.value)} placeholder="Bv. Parkbankjes" className="h-12 font-bold rounded-xl text-center text-lg" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddFilterDialogOpen(false)} className="font-bold">Annuleren</Button>
            <Button onClick={handleAddCustomFilter} disabled={!newFilterName.trim() || isSavingFilter} className="h-12 px-8 font-bold rounded-xl bg-zinc-900 shadow-xl shadow-black/10">Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
