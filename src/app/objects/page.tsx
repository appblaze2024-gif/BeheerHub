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
  Pencil,
  Calendar,
  LocateFixed,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MapboxView } from '@/components/mapbox-view';
import { ObjectImportDialog } from '@/components/object-import-dialog';
import { useCollection, useFirestore, updateDocumentNonBlocking, useMemoFirebase, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, arrayRemove, writeBatch } from 'firebase/firestore';
import type { Wijk } from '@/lib/types';
import * as turf from '@turf/turf';
import { Label } from '@/components/ui/label';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const DAYS_OF_WEEK = [
  { id: 'maandag', label: 'Ma' },
  { id: 'dinsdag', label: 'Di' },
  { id: 'woensdag', label: 'Wo' },
  { id: 'donderdag', label: 'Do' },
  { id: 'vrijdag', label: 'Vr' },
  { id: 'zaterdag', label: 'Za' },
  { id: 'zondag', label: 'Zo' },
];

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
  const [filterToRename, setFilterToRename] = React.useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = React.useState(false);

  // Proximity Filter States
  const [isProximityFilterActive, setIsProximityFilterActive] = React.useState(false);
  const [currentUserCoords, setCurrentUserCoords] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [isFindingLocation, setIsFindingLocation] = React.useState(false);

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

    if (isProximityFilterActive && currentUserCoords) {
      filtered = filtered.filter(obj => {
        if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
        try {
          const from = turf.point([currentUserCoords.longitude, currentUserCoords.latitude]);
          const to = turf.point([obj.longitude, obj.latitude]);
          const distance = turf.distance(from, to, { units: 'meters' });
          return distance <= 25;
        } catch (e) {
          return false;
        }
      });
    }

    return filtered;
  }, [objects, searchTerm, isProximityFilterActive, currentUserCoords]);

  const handleToggleProximityFilter = () => {
    if (isProximityFilterActive) {
      setIsProximityFilterActive(false);
      setCurrentUserCoords(null);
      toast({ title: 'Locatiefilter uit', description: 'De volledige lijst wordt weer getoond.' });
      return;
    }

    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'GPS niet beschikbaar', description: 'Uw browser ondersteunt geen locatievoorzieningen.' });
      return;
    }

    setIsFindingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentUserCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setIsProximityFilterActive(true);
        setIsFindingLocation(false);
        toast({ title: 'Locatiefilter actief', description: 'Objecten binnen 25m worden getoond.' });
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsFindingLocation(false);
        toast({ variant: 'destructive', title: 'Locatiefout', description: 'Kon uw huidige locatie niet bepalen. Controleer uw GPS instellingen.' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleDeleteFilteredObjects = async () => {
    if (!firestore || !filteredObjectsList.length || !typeFilter) return;
    
    setIsDeletingAll(true);
    const batchSize = 500;
    const itemsToDelete = [...filteredObjectsList];
    
    try {
      for (let i = 0; i < itemsToDelete.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const chunk = itemsToDelete.slice(i, i + batchSize);
        chunk.forEach(obj => {
          batch.delete(doc(firestore, 'objects', obj.id));
        });
        await batch.commit();
      }
      toast({ 
        title: 'Gereed', 
        description: `${itemsToDelete.length} objecten verwijderd uit categorie ${typeFilter === 'all' ? 'Alle Objecten' : typeFilter}.` 
      });
      setSelectedObject(null);
    } catch (error) {
      console.error("Delete error:", error);
      toast({ variant: 'destructive', title: 'Fout bij verwijderen' });
    } finally {
      setIsDeletingAll(false);
    }
  };

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
        setIsAddFilterDialogOpen(false);
        setIsSavingFilter(false);
    }
  };

  const handleRenameFilter = async () => {
    if (!firestore || !newFilterName.trim() || !filtersRef || !filterToRename) return;
    setIsSavingFilter(true);
    setIsAddFilterDialogOpen(false);
    
    try {
        const batch = writeBatch(firestore);
        
        // 1. Update the filter list in settings
        const updatedFilters = customFilters.map(f => f === filterToRename ? newFilterName.trim() : f);
        batch.set(filtersRef, { custom: updatedFilters }, { merge: true });
        
        // 2. Update all objects that have this tag (if they are currently loaded or we fetch them)
        if (objects && objects.length > 0) {
            objects.forEach(obj => {
                if (obj.locatieType === filterToRename) {
                    batch.update(doc(firestore, 'objects', obj.id), { locatieType: newFilterName.trim() });
                }
            });
        }

        await batch.commit();
        
        if (typeFilter === filterToRename) setTypeFilter(newFilterName.trim());
        
        toast({ title: 'Filter hernoemd', description: `De categorie '${filterToRename}' is nu '${newFilterName}'. De gekoppelde objecten zijn bijgewerkt.` });
        setFilterToRename(null);
        setNewFilterName('');
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Fout', description: 'Kon het filter niet hernoemen.' });
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

  const openRenameDialog = (filterName: string) => {
    setFilterToRename(filterName);
    setNewFilterName(filterName);
    setIsAddFilterDialogOpen(true);
  };

  const isRenaming = !!filterToRename;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 font-bold gap-2 rounded-lg border-slate-200">
                <Filter className="h-4 w-4 text-slate-400" /> 
                {typeFilter ? (typeFilter === 'all' ? 'Alle Objecten' : typeFilter) : 'Kies Categorie'}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 rounded-xl shadow-xl p-1.5 border-slate-200">
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1">Systeem Categorieën</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTypeFilter('all')} className="rounded-lg h-9 text-xs font-semibold">
                Toon alles (Hoge belasting)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1">Filters</DropdownMenuLabel>
              <ScrollArea className="max-h-60">
                {customFilters.filter(f => !!f).map(filter => (
                  <div key={filter} className="flex items-center group px-1">
                    <DropdownMenuItem onClick={() => setTypeFilter(filter)} className="flex-1 rounded-lg h-9 text-xs font-semibold">
                      {filter}
                    </DropdownMenuItem>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-slate-300 hover:text-primary"
                          onClick={(e) => { e.stopPropagation(); openRenameDialog(filter); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-slate-300 hover:text-red-600"
                          onClick={(e) => { e.stopPropagation(); handleDeleteFilter(filter); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                  </div>
                ))}
              </ScrollArea>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setFilterToRename(null); setNewFilterName(''); setIsAddFilterDialogOpen(true); }} className="rounded-lg h-9 text-xs font-bold text-primary">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Snelzoeken..." className="pl-9 h-9 text-xs font-medium rounded-lg border-slate-200 bg-slate-50" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} disabled={!typeFilter} />
          </div>
          <ObjectImportDialog open={isImporting} onOpenChange={setIsImporting} onSuccess={() => setIsImporting(false)}>
            <Button variant="outline" size="sm" className="h-9 font-bold rounded-lg">
              <Upload className="h-4 w-4 mr-2" /> 
              Import
            </Button>
          </ObjectImportDialog>
          <Button variant="outline" size="sm" className="h-9 font-bold rounded-lg" disabled={!typeFilter}><Download className="h-4 w-4 mr-2" /> Export</Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {!typeFilter ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/30">
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 mb-6 animate-in zoom-in-95 duration-500">
              <Filter className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-slate-900">Selecteer een Categorie</h3>
            <p className="text-sm text-slate-500 font-medium max-w-xs mx-auto leading-relaxed">
              Kies linksboven een filter om de bijbehorende objecten te laden. Dit bespaart reads en zorgt voor een snellere interface.
            </p>
          </div>
        ) : (
          <>
            <aside className={cn(
              "w-full lg:w-80 border-r bg-white flex flex-col shrink-0",
              isTablet && selectedObject ? "hidden" : "flex"
            )}>
              <div className="p-4 border-b flex justify-between items-center bg-slate-50/20">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-slate-500">Resultaten</span>
                  <span className="text-2xl font-bold text-slate-900 leading-tight">
                    {isLoadingObjects ? '...' : filteredObjectsList.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                              variant={isProximityFilterActive ? "default" : "outline"} 
                              size="icon" 
                              className={cn(
                                  "h-9 w-9 rounded-xl transition-all", 
                                  isProximityFilterActive ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "text-slate-400 border-slate-200"
                              )}
                              onClick={handleToggleProximityFilter}
                              disabled={isLoadingObjects}
                          >
                              {isFindingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Objecten binnen 25m filteren</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {filteredObjectsList.length > 0 && (
                      <AlertDialog>
                        <TooltipProvider>
                          <Tooltip>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-9 w-9 rounded-xl text-red-400 border-slate-200 hover:text-red-600 hover:bg-red-50"
                              >
                                {isDeletingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <TooltipContent>Alle objecten in deze filter wissen</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Dit zal <strong>{filteredObjectsList.length} objecten</strong> definitief verwijderen uit de categorie <strong>{typeFilter === 'all' ? 'Alle Objecten' : typeFilter}</strong>. Deze actie kan niet ongedaan worden gemaakt.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuleren</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteFilteredObjects} className="bg-red-600 hover:bg-red-700">Ja, alles wissen</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                </div>
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
                          selectedObject?.id === obj.id ? "bg-primary text-white shadow-md" : "hover:bg-slate-50"
                        )}
                      >
                        <div className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border",
                          selectedObject?.id === obj.id ? "bg-white/20 border-white/20" : "bg-slate-100 border-slate-200"
                        )}>
                          <MapPin className={cn("h-5 w-5", selectedObject?.id === obj.id ? "text-white" : "text-slate-400")} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate tracking-tight">{obj.idNummer || obj.id}</p>
                          <p className={cn("text-xs font-medium truncate mt-0.5", selectedObject?.id === obj.id ? "text-white/80" : "text-slate-500")}>
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
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">{selectedObject.idNummer || selectedObject.id}</h2>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="h-6 font-medium text-[10px] border-slate-200">{selectedObject.locatieType}</Badge>
                          <Badge className="h-6 font-medium text-[10px] bg-primary">{selectedObject.isActief ? 'Operationeel' : 'Inactief'}</Badge>
                        </div>
                      </div>
                      {isTablet && <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setSelectedObject(null)}><ArrowLeft className="h-5 w-5" /></Button>}
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-lg font-bold text-slate-900 border-b pb-3 flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Locatie & Adres</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-slate-500 ml-1">Straatnaam</Label>
                                <Input value={selectedObject.straatnaam || ''} onChange={e => handleUpdateField('straatnaam', e.target.value)} className="h-11 font-medium rounded-lg border-slate-200" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-slate-500 ml-1">Huisnummer</Label>
                                <Input value={selectedObject.huisnummer || ''} onChange={e => handleUpdateField('huisnummer', e.target.value)} className="h-11 font-medium rounded-lg border-slate-200" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-slate-500 ml-1">Postcode</Label>
                                <Input value={selectedObject.postcode || ''} onChange={e => handleUpdateField('postcode', e.target.value)} className="h-11 font-medium rounded-lg border-slate-200" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-slate-500 ml-1">Plaats</Label>
                                <Input value={selectedObject.plaats || ''} onChange={e => handleUpdateField('plaats', e.target.value)} className="h-11 font-medium rounded-lg border-slate-200" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-lg font-bold text-slate-900 border-b pb-3 flex items-center gap-2"><Tag className="h-5 w-5 text-primary" /> Categorisering</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-slate-500 ml-1">Hoofdtype</Label>
                                <Input value={selectedObject.locatieType || ''} onChange={e => handleUpdateField('locatieType', e.target.value)} className="h-11 font-medium rounded-lg border-slate-200" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-slate-500 ml-1">Subtype</Label>
                                <Input value={selectedObject.locatieSubType || ''} onChange={e => handleUpdateField('locatieSubType', e.target.value)} className="h-11 font-medium rounded-lg border-slate-200" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-lg font-bold text-slate-900 border-b pb-3 flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Weekplanning</h3>
                        <p className="text-sm text-slate-500 font-medium">Selecteer de dagen waarop deze unit geleegd of gecontroleerd moet worden.</p>
                        <div className="flex flex-wrap gap-3">
                            {DAYS_OF_WEEK.map((day) => {
                                const isActive = selectedObject.planningDagen?.includes(day.id);
                                return (
                                    <Button
                                        key={day.id}
                                        variant={isActive ? 'default' : 'outline'}
                                        size="sm"
                                        className={cn(
                                            "h-12 w-12 rounded-xl font-bold transition-all duration-300",
                                            isActive 
                                                ? "bg-primary text-white shadow-lg scale-110 border-primary ring-4 ring-primary/10" 
                                                : "text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-600"
                                        )}
                                        onClick={() => {
                                            const current = selectedObject.planningDagen || [];
                                            const next = isActive 
                                                ? current.filter((d: string) => d !== day.id)
                                                : [...current, day.id];
                                            handleUpdateField('planningDagen', next);
                                        }}
                                    >
                                        {day.label}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>

                    {selectedObject.locatieWerkgebieden && selectedObject.locatieWerkgebieden.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-slate-900 border-b pb-3 flex items-center gap-2"><MapPinned className="h-5 w-5 text-primary" /> Werkgebieden & Routes</h3>
                            <div className="flex flex-wrap gap-2">
                                {selectedObject.locatieWerkgebieden.map((area: string) => (
                                    <Badge key={area} variant="secondary" className="px-3 py-1 font-medium text-xs rounded-lg bg-slate-100 border-slate-200">{area}</Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="p-6 bg-slate-50 border rounded-2xl space-y-6">
                      <h3 className="text-lg font-bold text-slate-900 border-b pb-3 flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /> Configuratie</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <p className="text-sm font-bold text-slate-900">Actieve status</p>
                            <p className="text-xs font-medium text-slate-500">Object opnemen in routes</p>
                          </div>
                          <Switch checked={selectedObject.isActief} onCheckedChange={c => handleUpdateField('isActief', c)} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-slate-500 ml-1">Kwaliteit</Label>
                          <Select value={selectedObject.kwaliteit} onValueChange={v => handleUpdateField('kwaliteit', v)}>
                            <SelectTrigger className="h-10 font-medium bg-white border-slate-200"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl shadow-xl">
                              <SelectItem value="A" className="font-medium">A - Hoog</SelectItem>
                              <SelectItem value="B" className="font-medium">B - Standaard</SelectItem>
                              <SelectItem value="C" className="font-medium">C - Laag</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-500 ml-1">Memo / Waarschuwing</Label>
                      <Textarea value={selectedObject.waarschuwing || ''} onChange={e => handleUpdateField('waarschuwing', e.target.value)} placeholder="Bijzonderheden..." className="min-h-[120px] rounded-2xl border-slate-200 font-medium resize-none leading-relaxed" />
                    </div>
                  </div>

                  <div className="w-full md:w-[400px] border-l bg-slate-50/30 flex flex-col p-6 gap-6 overflow-y-auto no-scrollbar">
                    <Card className="aspect-square w-full border-none shadow-lg ring-1 ring-black/5 rounded-[2rem] overflow-hidden">
                      <MapboxView latitude={selectedObject.latitude} longitude={selectedObject.longitude} interactive={false} />
                    </Card>

                    <Card className="h-48 border-slate-200 border-dashed border-2 bg-transparent flex flex-col items-center justify-center text-slate-300 gap-3 group cursor-pointer hover:bg-slate-50 transition-colors">
                      <ImageIcon className="h-8 w-8 opacity-20 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-medium uppercase tracking-widest">Geen Media</p>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                  <div className="bg-slate-50 p-8 rounded-3xl shadow-xl border border-slate-100 mb-6">
                    <MapPin className="h-12 w-12 text-slate-200" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-slate-900">Geen object geselecteerd</h3>
                  <p className="text-slate-400 font-medium max-w-xs mx-auto text-sm">Kies een unit uit de lijst aan de linkerkant om de details te beheren.</p>
                </div>
              )}
            </main>
          </>
        )}
      </div>

      <Dialog open={isAddFilterDialogOpen} onOpenChange={setIsAddFilterDialogOpen}>
        <DialogContent className="rounded-2xl border-none shadow-2xl p-8 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
                {isRenaming ? 'Filter hernoemen' : 'Nieuw filter'}
            </DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
                {isRenaming ? `Wijzig de naam van '${filterToRename}'. Dit werkt ook alle objecten bij.` : 'Geef een naam op voor de nieuwe categorie.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <Input value={newFilterName} onChange={e => setNewFilterName(e.target.value)} placeholder="Bv. Parkbankjes" className="h-12 font-bold rounded-xl text-center text-lg shadow-sm" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddFilterDialogOpen(false)} className="font-bold">Annuleren</Button>
            <Button onClick={isRenaming ? handleRenameFilter : handleAddCustomFilter} disabled={!newFilterName.trim() || isSavingFilter} className="h-12 px-8 font-bold rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
                {isSavingFilter ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
