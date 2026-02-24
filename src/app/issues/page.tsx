'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer } from 'react-map-gl';
import { useCollection, useFirestore, useFirebaseApp, updateDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, doc, query, where, getDocs } from 'firebase/firestore';
import { ArrowLeft, Search, List, Map as MapIcon, Bell, Navigation, Pencil, FileText, Camera, Package, Clock, Info, Trash2, File as FileIcon, Loader2, Maximize, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as turf from '@turf/turf';
import type { Wijk, Melding, UploadedFile, MeldingTask, Hoeveelheid, Object as MapObject, Project } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, isToday, startOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useProfile } from '@/firebase/profile-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProject } from '@/context/project-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import Image from 'next/image';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useUser } from '@/firebase';
import { useToast } from '@/components/ui/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { LoadingScreen } from '@/components/loading-screen';
import { MapboxView } from '@/components/mapbox-view';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const meldingFormSchema = z.object({
  hoofdcategorie: z.string().min(1, 'Hoofdcategorie is verplicht'),
  subcategorie: z.string().min(1, 'Subcategorie is verplicht'),
  extra_informatie: z.string().min(1, 'Omschrijving is verplicht'),
  status: z.string().min(1, 'Status is verplicht'),
  straatnaam: z.string().optional(),
  plaats: z.string().optional(),
  postcode: z.string().optional(),
  afhandeling_bijzonderheden: z.string().optional(),
});

type MeldingFormValues = z.infer<typeof meldingFormSchema>;

const werkbonNavItems = [
    { label: 'Werkzaamheden', icon: Pencil },
    { label: 'Opmerkingen', icon: FileText },
    { label: 'Locatiegegevens', icon: MapPin },
    { label: 'Documenten', icon: FileText },
    { label: "Foto's", icon: Camera },
    { label: 'Hoeveelheid', icon: Package },
    { label: 'Uren', icon: Clock },
    { label: 'Info', icon: Info },
];

export default function IssuesPage() {
  const { setIsHeaderVisible } = useNavigationUI();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [selectedMeldingId, setSelectedMeldingId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const { profile } = useProfile();
  
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [afhandelingFotos, setAfhandelingFotos] = React.useState<UploadedFile[]>([]);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [tasks, setTasks] = React.useState<MeldingTask[]>([]);
  const [activeTab, setActiveTab] = React.useState('Werkzaamheden');
  const [hoeveelheden, setHoeveelheden] = React.useState<Hoeveelheid[]>([]);
  const [newHoeveelheidType, setNewHoeveelheidType] = React.useState('');
  const [newHoeveelheidAantal, setNewHoeveelheidAantal] = React.useState('');
  const [newHoeveelheidEenheid, setNewHoeveelheidEenheid] = React.useState('zak');
  const [highlightedObject, setHighlightedObject] = React.useState<MapObject | null>(null);
  const [elapsedTime, setElapsedTime] = React.useState<string>("0 uur en 0 minuten");
  const [mainPhoto, setMainPhoto] = React.useState<UploadedFile | null>(null);
  const [fullScreenPhoto, setFullScreenPhoto] = React.useState<UploadedFile | null>(null);
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'not-in', ['Afgerond', 'Niet in beheer'])
    );
  }, [firestore]);

  const projectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: meldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenQuery);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);

  const objectsCollection = useMemoFirebase(() => {
    if (!firestore || !selectedMeldingId) return null;
    return collection(firestore, 'objects');
  }, [firestore, selectedMeldingId]);
  const { data: allObjects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);

  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });

  const selectedMelding = React.useMemo(() => {
    return meldingen?.find(m => m.id === selectedMeldingId);
  }, [meldingen, selectedMeldingId]);

  const nearbyObjects = React.useMemo(() => {
    if (!selectedMelding || !allObjects) return [];
    const meldingPoint = turf.point([selectedMelding.longitude, selectedMelding.latitude]);
    return allObjects.filter(obj => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
      const objPoint = turf.point([obj.longitude, obj.latitude]);
      return turf.distance(meldingPoint, objPoint, { units: 'meters' }) <= 100;
    }).sort((a, b) => turf.distance(turf.point([selectedMelding.longitude, selectedMelding.latitude]), turf.point([a.longitude, a.latitude])) - turf.distance(turf.point([selectedMelding.longitude, selectedMelding.latitude]), turf.point([b.longitude, b.latitude])));
  }, [selectedMelding, allObjects]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => console.warn("GPS tracking disabled:", err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const filteredMeldingen = React.useMemo(() => {
    if (!meldingen) return [];
    let result = debouncedSearchQuery ? meldingen.filter(m => {
      const q = debouncedSearchQuery.toLowerCase();
      return ['intakenummer', 'straatnaam', 'plaats', 'subcategorie'].some(f => (m as any)[f]?.toLowerCase().includes(q));
    }) : meldingen;

    if (userLocation) {
        const userPt = turf.point([userLocation.longitude, userLocation.latitude]);
        return [...result].sort((a, b) => {
            const distA = turf.distance(userPt, turf.point([a.longitude, a.latitude]));
            const distB = turf.distance(userPt, turf.point([b.longitude, b.latitude]));
            return distA - distB;
        });
    }
    return result;
  }, [meldingen, debouncedSearchQuery, userLocation]);

  React.useEffect(() => {
    if (filteredMeldingen.length > 0 && !selectedMeldingId) {
      const idFromUrl = searchParams.get('id');
      if (idFromUrl && filteredMeldingen.find(m => m.id === idFromUrl)) {
        setSelectedMeldingId(idFromUrl);
      } else {
        setSelectedMeldingId(filteredMeldingen[0].id);
      }
    }
  }, [filteredMeldingen, selectedMeldingId, searchParams]);

  React.useEffect(() => {
    const melding = meldingen?.find(m => m.id === selectedMeldingId);
    if (melding) {
      setUploadedFiles(melding.files || []);
      setUploadedPhotos(melding.fotos || []);
      setAfhandelingFotos(melding.afhandeling_fotos || []);
      setMainPhoto(melding.fotos?.[0] || null);
      setLocation({ latitude: melding.latitude, longitude: melding.longitude });
      setTasks(melding.tasks || []);
      setHoeveelheden(melding.hoeveelheden || []);
      form.reset({
        hoofdcategorie: melding.hoofdcategorie,
        subcategorie: melding.subcategorie,
        extra_informatie: melding.extra_informatie,
        status: melding.status,
        straatnaam: melding.straatnaam,
        plaats: melding.plaats,
        postcode: melding.postcode,
        afhandeling_bijzonderheden: melding.afhandeling_bijzonderheden || '',
      });
    }
  }, [selectedMeldingId, meldingen, form]);

  React.useEffect(() => {
    if (!selectedMelding) { setElapsedTime("0 uur en 0 minuten"); return; }
    if (selectedMelding.workStartedAt) {
      const interval = setInterval(() => {
        const startTime = new Date(selectedMelding.workStartedAt!).getTime();
        const now = Date.now();
        const minutes = Math.floor((now - startTime) / (1000 * 60)) + (selectedMelding.gewerkteMinuten || 0);
        setElapsedTime(`${Math.floor(minutes / 60)} uur en ${minutes % 60} minuten`);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      const min = selectedMelding.gewerkteMinuten || 0;
      setElapsedTime(`${Math.floor(min / 60)} uur en ${min % 60} minuten`);
    }
  }, [selectedMelding]);

  const handleStartWork = async () => {
    if (!firestore || !selectedMelding?.id) return;
    await updateDocumentNonBlocking(doc(firestore, 'meldingen', selectedMelding.id), { workStartedAt: new Date().toISOString() });
  };

  const handleAfronden = async () => {
    if (!firestore || !selectedMelding?.id || !user) return;
    setIsSubmitting(true);
    let minutesWorked = selectedMelding.gewerkteMinuten || 0;
    if (selectedMelding.workStartedAt) {
      minutesWorked += Math.round((Date.now() - new Date(selectedMelding.workStartedAt).getTime()) / (1000 * 60));
    }
    const finisher = profile?.displayName || user.email || 'Onbekend';
    try {
        await updateDocumentNonBlocking(doc(firestore, 'meldingen', selectedMelding.id), {
            status: 'Afgerond',
            afhandeling_datum: format(new Date(), 'yyyy-MM-dd'),
            afhandeling_tijdstip: format(new Date(), 'HH:mm'),
            afgehandeld_door: finisher,
            afhandeling_bijzonderheden: form.getValues('afhandeling_bijzonderheden') || null,
            gewerkteMinuten: minutesWorked,
            workStartedAt: null, 
        });
        toast({ title: 'Werkbon afgerond' });
        setSelectedMeldingId(null);
    } catch (error) { toast({ variant: "destructive", title: 'Fout bij afronden' }); } finally { setIsSubmitting(false); }
  };

  const handleFileUpload = React.useCallback(async (files: FileList | File[], type: 'documents' | 'afhandeling_fotos') => {
    if (!files || !selectedMeldingId || !app) return;
    const storage = getStorage(app);
    for (const file of Array.from(files)) {
      const path = `meldingen/${selectedMeldingId}/${type}/${Date.now()}-${file.name}`;
      const uploadTask = uploadBytesResumable(ref(storage, path), file);
      uploadTask.on('state_changed', 
        (snapshot) => setUploadProgress(prev => ({...prev, [file.name]: (snapshot.bytesTransferred / snapshot.totalBytes) * 100})),
        () => {},
        () => getDownloadURL(uploadTask.snapshot.ref).then(url => {
            const uploaded: UploadedFile = { name: file.name, url, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath: path };
            if (type === 'documents') setUploadedFiles(prev => [...prev, uploaded]);
            else setAfhandelingFotos(prev => [...prev, uploaded]);
            setUploadProgress(prev => { const n = {...prev}; delete n[file.name]; return n; });
        })
      );
    }
  }, [selectedMeldingId, app]);

  if (isLoadingMeldingen || isLoadingProjects) return <LoadingScreen message="Werkbonnen laden..." />;

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden text-sm bg-gray-100 dark:bg-gray-900">
        <header className="p-4 border-b bg-gray-50 dark:bg-gray-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0 gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
                 <Button variant="outline" size="icon" onClick={() => router.push('/')}><ArrowLeft className="h-4 w-4" /></Button>
                 <Select value={selectedMeldingId || ''} onValueChange={setSelectedMeldingId}>
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue>{filteredMeldingen.length > 0 ? `Meldingen (${filteredMeldingen.length})` : 'Geen meldingen'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {filteredMeldingen.map(m => <SelectItem key={m.id} value={m.id}>{m.intakenummer}: {m.extra_informatie.substring(0, 30)}...</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            {selectedMelding && (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button variant="outline" className="h-9 font-black border-primary text-primary gap-2" onClick={() => router.push('/navigation-module?type=meldingen')}><Navigation className="h-4 w-4" />ROUTE</Button>
                  {selectedMelding.workStartedAt ? (
                    <Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-9" onClick={handleAfronden} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}WERKBON AFHANDELEN</Button>
                  ) : (
                    <Button className="bg-green-500 hover:bg-green-600 text-white font-bold h-9" onClick={handleStartWork}>WERKBON STARTEN</Button>
                  )}
              </div>
            )}
        </header>
        
        {selectedMelding ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="px-4 md:px-6 pt-4 overflow-x-auto no-scrollbar">
                    <TabsList className="w-max inline-flex">
                        {werkbonNavItems.map(item => (
                            <TabsTrigger key={item.label} value={item.label} className="gap-2 shrink-0">
                                <item.icon className="h-4 w-4 shrink-0" />
                                <span>{item.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <TabsContent value="Werkzaamheden" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4 border-b pb-4">
                                    <div><p className="text-[9px] font-black uppercase text-slate-400">Intakenr:</p><p className="font-black">{selectedMelding.intakenummer}</p></div>
                                    <div><p className="text-[9px] font-black uppercase text-slate-400">Datum:</p><p className="font-black">{selectedMelding.datum}</p></div>
                                    <div className="col-span-2"><p className="text-[9px] font-black uppercase text-slate-400">Adres:</p><p className="font-black">{selectedMelding.straatnaam} {selectedMelding.huisnummer}, {selectedMelding.plaats}</p></div>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-[9px] font-black uppercase text-slate-400">Omschrijving</p>
                                    <p className="bg-slate-50 p-3 rounded-lg border italic">{selectedMelding.extra_informatie}</p>
                                </div>
                            </Card>
                            <div className="rounded-xl overflow-hidden border min-h-[300px] shadow-sm">
                                <MapboxView latitude={selectedMelding.latitude} longitude={selectedMelding.longitude} objects={nearbyObjects} />
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="Opmerkingen" className="mt-0">
                        <Card className="p-4"><Textarea placeholder="Voeg een opmerking toe..." rows={10} onChange={(e) => form.setValue('afhandeling_bijzonderheden', e.target.value)} defaultValue={selectedMelding.afhandeling_bijzonderheden} /></Card>
                    </TabsContent>
                    <TabsContent value="Locatiegegevens" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="p-4 space-y-3">
                                <div className="flex justify-between text-xs"><span>Adres:</span><span className="font-black">{selectedMelding.straatnaam} {selectedMelding.huisnummer}</span></div>
                                <div className="flex justify-between text-xs"><span>Plaats:</span><span className="font-black">{selectedMelding.plaats}</span></div>
                                <div className="flex justify-between text-xs"><span>Werkgebied:</span><span className="font-black">{selectedMelding.werkgebied || '-'}</span></div>
                            </Card>
                            <div className="rounded-xl overflow-hidden border min-h-[300px] shadow-sm">
                                <MapboxView latitude={selectedMelding.latitude} longitude={selectedMelding.longitude} objects={nearbyObjects} />
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="Documenten" className="mt-0">
                        <Card className="p-4 space-y-4">
                            <Button variant="outline" className="w-full h-12 border-dashed" onClick={() => document.getElementById('doc-input')?.click()}><UploadCloud className="mr-2 h-4 w-4" /> Bestand uploaden</Button>
                            <input type="file" id="doc-input" className="hidden" onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'documents')} multiple />
                            <div className="space-y-2">
                                {uploadedFiles.map(f => (
                                    <div key={f.storagePath} className="flex items-center justify-between p-3 border rounded-xl bg-white">
                                        <div className="flex items-center gap-3"><FileIcon className="h-4 w-4 text-primary" /><span className="text-xs font-black">{f.name}</span></div>
                                        <Button variant="ghost" size="icon" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Foto's" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="p-4"><CardTitle className="text-xs font-black uppercase mb-4">Melding Foto's</CardTitle>
                                <div className="grid grid-cols-4 gap-2">
                                    {uploadedPhotos.map(p => <div key={p.storagePath} className="relative aspect-square rounded-lg overflow-hidden border"><Image src={p.url} alt="melding" fill className="object-cover" /></div>)}
                                </div>
                            </Card>
                            <Card className="p-4"><CardTitle className="text-xs font-black uppercase mb-4">Afhandeling Foto's</CardTitle>
                                <Button variant="outline" className="w-full mb-4" onClick={() => document.getElementById('photo-input')?.click()}><Camera className="mr-2 h-4 w-4" /> Foto toevoegen</Button>
                                <input type="file" id="photo-input" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} multiple />
                                <div className="grid grid-cols-4 gap-2">
                                    {afhandelingFotos.map(p => <div key={p.storagePath} className="relative aspect-square rounded-lg overflow-hidden border"><Image src={p.url} alt="afhandeling" fill className="object-cover" /></div>)}
                                </div>
                            </Card>
                        </div>
                    </TabsContent>
                    <TabsContent value="Hoeveelheid" className="mt-0">
                        <Card className="p-4">
                            <div className="space-y-2 mb-6">
                                {hoeveelheden.map(h => (
                                    <div key={h.id} className="flex justify-between items-center p-3 bg-slate-50 border rounded-xl font-bold">
                                        <span>{h.type}</span><span>{h.aantal} {h.eenheid}</span>
                                        <Button variant="ghost" size="icon" onClick={() => setHoeveelheden(prev => prev.filter(x => x.id !== h.id))}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <Input placeholder="Type" value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} />
                                <Input placeholder="Aantal" type="number" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} />
                                <Button onClick={() => { if(newHoeveelheidType && newHoeveelheidAantal) { setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); setNewHoeveelheidType(''); setNewHoeveelheidAantal(''); } }}>Toevoegen</Button>
                            </div>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Uren" className="mt-0">
                        <Card className="p-6 text-center">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Geregistreerde Werktijd</p>
                            <p className="text-3xl font-black">{elapsedTime}</p>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Info" className="mt-0">
                        <Card className="p-4 space-y-4">
                            <div className="flex justify-between"><span>Status:</span><Badge>{selectedMelding.status}</Badge></div>
                            <div className="flex justify-between"><span>Starttijd:</span><span>{selectedMelding.workStartedAt ? format(new Date(selectedMelding.workStartedAt), 'HH:mm') : '-'}</span></div>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-center">
                <div className="max-w-md space-y-4">
                    <Bell className="h-12 w-12 mx-auto text-slate-300" />
                    <p className="text-lg font-black uppercase tracking-tight">Geen melding geselecteerd</p>
                    <p className="text-slate-500">Kies een melding uit de lijst of gebruik de routeknop om te beginnen.</p>
                </div>
            </div>
        )}
    </div>
  );
}