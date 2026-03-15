'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Map as MapIcon,
  Search,
  MapPin,
  ChevronRight,
  Upload,
  Download,
  List,
  ArrowLeft,
  Loader2,
  Trash2,
  Tag,
  Pencil,
  LocateFixed,
  RefreshCw,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapboxView } from '@/components/mapbox-view';
import { ObjectImportDialog } from '@/components/object-import-dialog';
import { ObjectExportDialog } from '@/components/object-export-dialog';
import { useCollection, useFirestore, updateDocumentNonBlocking, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, query, where, writeBatch, limit, orderBy } from 'firebase/firestore';
import * as turf from '@turf/turf';
import { Label } from '@/components/ui/label';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
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
} from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/context/project-context';
import { useProfile } from '@/firebase/profile-provider';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function ObjectsPage() {
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const isTablet = useIsMobile(1024);
  const { profile } = useProfile();
  const { projects } = useProject();
  
  const isSuperUser = profile?.role === 'Super admin';
  const canImport = isSuperUser || !!profile?.permissions?.objects?.tabs?.import;
  const canExport = isSuperUser || !!profile?.permissions?.objects?.tabs?.export;
  const canEdit = isSuperUser || !!profile?.permissions?.objects?.edit;
  const canDelete = isSuperUser || !!profile?.permissions?.objects?.delete;

  const [isImporting, setIsImporting] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');
  const [selectedObject, setSelectedObject] = React.useState<any | null>(null);
  const [viewMode, setViewMode] = React.useState<'list' | 'map'>('list');
  const [isDeletingAll, setIsDeletingAll] = React.useState(false);
  const [isGeocoding, setIsGeocoding] = React.useState(false);

  const [isProximityFilterActive, setIsProximityFilterActive] = React.useState(false);
  const [currentUserCoords, setCurrentUserCoords] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [isFindingLocation, setIsFindingLocation] = React.useState(false);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  React.useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'import' && canImport) {
      setIsImporting(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('action');
      router.replace(`/objects?${params.toString()}`);
    } else if (action === 'export' && canExport) {
      setIsExporting(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('action');
      router.replace(`/objects?${params.toString()}`);
    }
  }, [searchParams, canImport, canExport, router]);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const baseCol = collection(firestore, 'objects');
    
    if (debouncedSearchTerm && debouncedSearchTerm.length >= 2) {
        const q = debouncedSearchTerm.toUpperCase();
        return query(
            baseCol,
            where('idNummer', '>=', q),
            where('idNummer', '<=', q + '\uf8ff'),
            limit(100)
        );
    }

    return query(baseCol, orderBy('idNummer'), limit(100));
  }, [firestore, debouncedSearchTerm]);

  const { data: objects, isLoading: isLoadingObjects } = useCollection<any>(objectsQuery);

  const filteredObjectsList = React.useMemo(() => {
    if (!objects) return [];
    let filtered = [...objects];

    if (searchTerm && searchTerm.length > 0 && searchTerm.length < 2) {
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
        toast({ variant: 'destructive', title: 'Locatiefout', description: 'Kon uw huidige locatie niet bepalen.' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleDeleteFilteredObjects = async () => {
    if (!firestore || !filteredObjectsList.length || !canDelete) return;
    
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
      toast({ title: 'Gereed', description: `${itemsToDelete.length} objecten verwijderd.` });
      setSelectedObject(null);
    } catch (error) {
      console.error("Delete error:", error);
      toast({ variant: 'destructive', title: 'Fout bij verwijderen' });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleUpdateField = (field: string, value: any) => {
    if (!firestore || !selectedObject || !canEdit) return;
    const objectRef = doc(firestore, 'objects', selectedObject.id);
    updateDocumentNonBlocking(objectRef, { [field]: value });
    setSelectedObject((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleUpdateCoords = async (field: 'latitude' | 'longitude', value: number) => {
    if (!firestore || !selectedObject || !canEdit) return;
    
    const newCoords = {
        latitude: field === 'latitude' ? value : selectedObject.latitude,
        longitude: field === 'longitude' ? value : selectedObject.longitude
    };

    const objectRef = doc(firestore, 'objects', selectedObject.id);
    const updates: any = { [field]: value };

    setSelectedObject((prev: any) => ({ ...prev, [field]: value }));

    if (newCoords.latitude && newCoords.longitude && !isGeocoding) {
        setIsGeocoding(true);
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${newCoords.longitude},${newCoords.latitude}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=address,postcode,place`
            );
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                const feature = data.features[0];
                const context = feature.context || [];
                
                const street = feature.text || '';
                const houseNumber = feature.address || '';
                const postcode = context.find((c: any) => c.id.startsWith('postcode'))?.text || '';
                const place = context.find((c: any) => c.id.startsWith('place'))?.text || '';

                if (postcode) updates.postcode = postcode;
                if (place) updates.plaats = place;
                
                if (!selectedObject.straatnaam) updates.straatnaam = street;
                if (!selectedObject.huisnummer) updates.huisnummer = houseNumber;

                updateDocumentNonBlocking(objectRef, updates);
                setSelectedObject((prev: any) => ({ ...prev, ...updates }));
            } else {
                updateDocumentNonBlocking(objectRef, updates);
            }
        } catch (e) {
            console.error("Geocoding failed:", e);
            updateDocumentNonBlocking(objectRef, updates);
        } finally {
            setIsGeocoding(false);
        }
    } else {
        updateDocumentNonBlocking(objectRef, updates);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="h-16 border-b bg-white flex items-center justify-between px-4 sm:px-6 gap-2 shrink-0 shadow-sm overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" className={cn("h-8 font-bold rounded-lg px-2 sm:px-3", viewMode === 'list' && "bg-white shadow-sm")} onClick={() => setViewMode('list')}>
              <List className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Lijst</span>
            </Button>
            <Button variant={viewMode === 'map' ? 'secondary' : 'ghost'} size="sm" className={cn("h-8 font-bold rounded-lg px-2 sm:px-3", viewMode === 'map' && "bg-white shadow-sm")} onClick={() => setViewMode('map')}>
              <MapIcon className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Kaart</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <div className="relative w-full max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Zoek op ID of adres..." className="pl-9 h-9 text-xs font-black uppercase rounded-lg border-slate-200 bg-slate-50" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {canImport && (
              <ObjectImportDialog open={isImporting} onOpenChange={setIsImporting} onSuccess={() => setIsImporting(false)}>
                <Button variant="default" size="sm" className="h-9 font-black uppercase tracking-tight bg-primary text-white shadow-lg shadow-primary/20 px-3 sm:px-4 rounded-xl shrink-0">
                  <Upload className="h-4 w-4 sm:mr-2" /> 
                  <span className="hidden sm:inline">IMPORT</span>
                  <span className="sm:hidden text-[10px]">IMP</span>
                </Button>
              </ObjectImportDialog>
            )}
            
            {canExport && (
              <ObjectExportDialog objects={objects} projects={projects}>
                <Button variant="outline" size="sm" className="h-9 font-bold rounded-lg border-slate-200 shrink-0 px-3">
                  <Download className="h-4 w-4 sm:mr-2" /> 
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </ObjectExportDialog>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className={cn(
          "w-full lg:w-80 border-r bg-white flex flex-col shrink-0",
          isTablet && selectedObject ? "hidden" : "flex"
        )}>
          <div className="p-4 border-b flex justify-end items-center bg-slate-50/20 gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={isProximityFilterActive ? "default" : "outline"} size="icon" className={cn("h-9 w-9 rounded-xl transition-all", isProximityFilterActive ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "text-slate-400 border-slate-200")} onClick={handleToggleProximityFilter} disabled={isLoadingObjects}>
                          {isFindingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Objecten binnen 25m filteren</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {filteredObjectsList.length > 0 && canDelete && (
                  <AlertDialog>
                    <TooltipProvider>
                      <Tooltip>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl text-red-400 border-slate-200 hover:text-red-600 hover:bg-red-50">
                            {isDeletingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </AlertDialogTrigger>
                        <TooltipContent>Alle getoonde objecten wissen</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                        <AlertDialogDescription>Dit zal <strong>{filteredObjectsList.length} objecten</strong> definitief verwijderen.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteFilteredObjects} className="bg-red-600 hover:bg-red-700">Ja, alles wissen</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
          </div>
          <ScrollArea className="flex-1">
            {isLoadingObjects ? (
              <div className="p-4 space-y-4">
                {[1,2,3,4,5].map(i => <Skeleton className="h-16 w-full rounded-xl" key={i} />)}
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
                      <p className="text-sm font-black truncate tracking-tight uppercase">{obj.idNummer || obj.id}</p>
                      <p className={cn("text-xs font-medium truncate mt-0.5 uppercase tracking-tighter", selectedObject?.id === obj.id ? "text-white/80" : "text-slate-500")}>
                        {obj.straatnaam} {obj.huisnummer}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-[10px] font-black uppercase tracking-widest">Geen objecten gevonden</p>
                <p className="text-[9px] font-bold mt-1 uppercase">Probeer een andere zoekterm.</p>
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
                    <h2 className="text-3xl font-black uppercase tracking-tight text-slate-900 leading-none">{selectedObject.idNummer || selectedObject.id}</h2>
                    <div className="flex gap-2 pt-2">
                      <Badge variant="outline" className="h-6 font-black uppercase text-[9px] tracking-widest border-slate-200 bg-slate-50">{selectedObject.locatieType}</Badge>
                      <Badge className={cn("h-6 font-black uppercase text-[9px] tracking-widest border-none shadow-sm", selectedObject.isActief ? "bg-green-500" : "bg-slate-400")}>{selectedObject.isActief ? 'Operationeel' : 'Inactief'}</Badge>
                    </div>
                  </div>
                  {isTablet && <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setSelectedObject(null)}><ArrowLeft className="h-5 w-5" /></Button>}
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between border-b-2 border-slate-100 pb-3">
                        <h3 className="text-sm font-black uppercase tracking-[0.1em] text-slate-900 flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Locatie & Adres</h3>
                        {isGeocoding && <div className="flex items-center gap-2 text-primary font-black text-[9px] uppercase tracking-widest animate-pulse"><RefreshCw className="h-3 w-3 animate-spin" /> Adres bijwerken...</div>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Straatnaam</Label>
                            <Input value={selectedObject.straatnaam || ''} onChange={e => handleUpdateField('straatnaam', e.target.value)} className="h-11 font-bold rounded-xl border-slate-200 bg-slate-50/50" disabled={!canEdit} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Huisnummer</Label>
                            <Input value={selectedObject.huisnummer || ''} onChange={e => handleUpdateField('huisnummer', e.target.value)} className="h-11 font-bold rounded-xl border-slate-200 bg-slate-50/50" disabled={!canEdit} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Postcode</Label>
                            <Input value={selectedObject.postcode || ''} onChange={e => handleUpdateField('postcode', e.target.value)} className="h-11 font-bold rounded-xl border-slate-200 bg-slate-50/50" disabled={!canEdit} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Plaats</Label>
                            <Input value={selectedObject.plaats || ''} onChange={e => handleUpdateField('plaats', e.target.value)} className="h-11 font-bold rounded-xl border-slate-200 bg-slate-50/50" disabled={!canEdit} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Latitude (Y)</Label>
                            <Input type="number" value={selectedObject.latitude || ''} onChange={e => handleUpdateCoords('latitude', parseFloat(e.target.value))} className="h-11 font-mono text-xs rounded-xl border-slate-200" disabled={!canEdit} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Longitude (X)</Label>
                            <Input type="number" value={selectedObject.longitude || ''} onChange={e => handleUpdateCoords('longitude', parseFloat(e.target.value))} className="h-11 font-mono text-xs rounded-xl border-slate-200" disabled={!canEdit} />
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-[0.1em] text-slate-900 border-b-2 border-slate-100 pb-3 flex items-center gap-2"><Tag className="h-5 w-5 text-primary" /> Categorisering</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Hoofdtype</Label>
                            <Input value={selectedObject.locatieType || ''} onChange={e => handleUpdateField('locatieType', e.target.value)} className="h-11 font-bold rounded-xl border-slate-200" disabled={!canEdit} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Subtype</Label>
                            <Input value={selectedObject.locatieSubType || ''} onChange={e => handleUpdateField('locatieSubType', e.target.value)} className="h-11 font-bold rounded-xl border-slate-200" disabled={!canEdit} />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Memo / Waarschuwing</Label>
                  <Textarea value={selectedObject.waarschuwing || ''} onChange={e => handleUpdateField('waarschuwing', e.target.value)} placeholder="Bijzonderheden voor uitvoering..." className="min-h-[120px] rounded-2xl border-slate-200 font-medium resize-none leading-relaxed bg-slate-50/30 shadow-inner" disabled={!canEdit} />
                </div>
              </div>

              <div className="w-full md:w-[400px] border-l bg-slate-50/30 flex flex-col p-6 gap-6 overflow-y-auto no-scrollbar">
                <Card className="aspect-square w-full border-none shadow-2xl ring-4 ring-white rounded-[2rem] overflow-hidden">
                  <MapboxView latitude={selectedObject.latitude} longitude={selectedObject.longitude} interactive={false} />
                </Card>

                <Card className="h-48 border-slate-200 border-dashed border-2 bg-white/50 flex flex-col items-center justify-center text-slate-300 gap-3 group cursor-pointer hover:bg-white hover:border-primary/30 transition-all rounded-3xl">
                  <ImageIcon className="h-10 w-10 opacity-10 group-hover:scale-110 transition-transform" />
                  <p className="text-[9px] font-black uppercase tracking-[0.2em]">Geen Media</p>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50/30">
              <div className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-slate-50 mb-8 animate-in zoom-in-95 duration-700">
                <MapPin className="h-16 w-16 text-primary/20 animate-pulse" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 mb-2">Alle Objecten</h3>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest max-w-[250px] mx-auto leading-relaxed">Kies een unit uit de lijst aan de linkerzijde om de details en geografische data te beheren.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
