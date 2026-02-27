'use client';

import * as React from 'react';
import { useCollection, useFirestore, useFirebaseApp, updateDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { ArrowLeft, Navigation, Pencil, FileText, Camera, Package, Clock, Info, Trash2, File as FileIcon, Loader2, MapPin, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as turf from '@turf/turf';
import type { Melding, UploadedFile, MeldingTask, Hoeveelheid, Object as MapObject, Project } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfile } from '@/firebase/profile-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProject } from '@/context/project-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/firebase';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingScreen } from '@/components/loading-screen';
import { MapboxView } from '@/components/mapbox-view';

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
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  
  const { selectedProjectId } = useProject();
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
  const [activeTab, setActiveTab] = React.useState('Werkzaamheden');
  const [hoeveelheden, setHoeveelheden] = React.useState<Hoeveelheid[]>([]);
  const [newHoeveelheidType, setNewHoeveelheidType] = React.useState('');
  const [newHoeveelheidAantal, setNewHoeveelheidAantal] = React.useState('');
  const [elapsedTime, setElapsedTime] = React.useState<string>("0 uur en 0 minuten");
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const meldingIdFromUrl = searchParams.get('id');

  // REDIRECT LOGIC: Als we geen specifiek ID hebben, ga direct naar de route op de kaart
  React.useEffect(() => {
    if (!meldingIdFromUrl) {
      router.replace('/navigation-module?type=meldingen');
    }
  }, [meldingIdFromUrl, router]);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'not-in', ['Nieuw', 'Afgerond', 'Niet in beheer'])
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
  const { data: allObjects } = useCollection<MapObject>(objectsCollection);

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
    }).sort((a, b) => {
        const dA = turf.distance(meldingPoint, turf.point([a.longitude, a.latitude]));
        const dB = turf.distance(meldingPoint, turf.point([b.longitude, b.latitude]));
        return dA - dB;
    });
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
      if (meldingIdFromUrl && filteredMeldingen.find(m => m.id === meldingIdFromUrl)) {
        setSelectedMeldingId(meldingIdFromUrl);
      } else if (!meldingIdFromUrl) {
        setSelectedMeldingId(filteredMeldingen[0].id);
      }
    }
  }, [filteredMeldingen, selectedMeldingId, meldingIdFromUrl]);

  React.useEffect(() => {
    const melding = meldingen?.find(m => m.id === selectedMeldingId);
    if (melding) {
      setUploadedFiles(melding.files || []);
      setUploadedPhotos(melding.fotos || []);
      setAfhandelingFotos(melding.afhandeling_fotos || []);
      setLocation({ latitude: melding.latitude, longitude: melding.longitude });
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
        router.push('/navigation-module?type=meldingen');
    } catch (error) { 
        toast({ variant: "destructive", title: 'Fout bij afronden' }); 
    } finally { 
        setIsSubmitting(false); 
    }
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

  const onSubmit = async (data: MeldingFormValues) => {
      // Manual save handler
  };

  if (isLoadingMeldingen || isLoadingProjects || !meldingIdFromUrl) return <LoadingScreen message="Werkbonnen laden..." />;

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden text-sm bg-gray-100 dark:bg-gray-900">
        <header className="p-4 border-b bg-gray-50 dark:bg-gray-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0 gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
                 <Button variant="outline" size="icon" onClick={() => router.push('/navigation-module?type=meldingen')}><ArrowLeft className="h-4 w-4" /></Button>
            </div>
            {selectedMelding && (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button variant="outline" className="h-9 font-black border-primary text-primary gap-2" onClick={() => router.push('/navigation-module?type=meldingen')}>
                    <Navigation className="h-4 w-4" />
                    KAART
                  </Button>
                  {selectedMelding.workStartedAt ? (
                    <Button className="bg-orange-600 hover:bg-orange-700 text-white font-black uppercase tracking-tight h-9 px-6" onClick={handleAfronden} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        WERKBON AFHANDELEN
                    </Button>
                  ) : (
                    <Button className="bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-tight h-9 px-6" onClick={handleStartWork}>
                        WERKBON STARTEN
                    </Button>
                  )}
              </div>
            )}
        </header>
        
        {selectedMelding ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="px-4 md:px-6 pt-4 overflow-x-auto no-scrollbar bg-white shrink-0">
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
                            <Card className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-6 border-b pb-6">
                                    <div><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Intakenummer</p><p className="font-black text-lg">{selectedMelding.intakenummer}</p></div>
                                    <div><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Datum</p><p className="font-black text-lg">{selectedMelding.datum}</p></div>
                                    <div className="col-span-2"><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Adres</p><p className="font-black text-lg">{selectedMelding.straatnaam} {selectedMelding.huisnummer}, {selectedMelding.plaats}</p></div>
                                </div>
                                <div className="space-y-3">
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Omschrijving melding</p>
                                    <p className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 italic text-slate-700 leading-relaxed font-medium">"{selectedMelding.extra_informatie}"</p>
                                </div>
                            </Card>
                            <div className="rounded-2xl overflow-hidden border-2 border-white shadow-xl min-h-[350px]">
                                <MapboxView latitude={selectedMelding.latitude} longitude={selectedMelding.longitude} objects={nearbyObjects} />
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="Opmerkingen" className="mt-0">
                        <Card className="p-6 border-none shadow-lg">
                            <CardHeader className="p-0 mb-4"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Uitvoeringsnotities</CardTitle></CardHeader>
                            <Textarea 
                                placeholder="Voeg hier bijzonderheden toe over de uitvoering..." 
                                rows={12} 
                                className="resize-none text-sm font-medium leading-relaxed rounded-xl"
                                onChange={(e) => form.setValue('afhandeling_bijzonderheden', e.target.value)} 
                                defaultValue={selectedMelding.afhandeling_bijzonderheden} 
                            />
                        </Card>
                    </TabsContent>
                    <TabsContent value="Locatiegegevens" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                            <Card className="p-6 space-y-4 shadow-lg">
                                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Locatie Details</CardTitle>
                                <div className="flex justify-between border-b py-2"><span className="text-slate-400 font-bold">Adres:</span><span className="font-black">{selectedMelding.straatnaam} {selectedMelding.huisnummer}</span></div>
                                <div className="flex justify-between border-b py-2"><span className="text-slate-400 font-bold">Plaats:</span><span className="font-black">{selectedMelding.plaats}</span></div>
                                <div className="flex justify-between border-b py-2"><span className="text-slate-400 font-bold">Werkgebied:</span><span className="font-black">{selectedMelding.werkgebied || '-'}</span></div>
                                <div className="flex justify-between py-2"><span className="text-slate-400 font-bold">Coördinaten:</span><span className="font-mono text-[10px]">{selectedMelding.latitude.toFixed(6)}, {selectedMelding.longitude.toFixed(6)}</span></div>
                            </Card>
                            <div className="rounded-2xl overflow-hidden border shadow-xl min-h-[350px]">
                                <MapboxView latitude={selectedMelding.latitude} longitude={selectedMelding.longitude} objects={nearbyObjects} />
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="Documenten" className="mt-0">
                        <Card className="p-6 shadow-lg space-y-6">
                            <Button variant="outline" className="w-full h-16 border-dashed border-2 font-black uppercase text-xs tracking-widest" onClick={() => document.getElementById('doc-input')?.click()}>
                                <UploadCloud className="mr-2 h-5 w-5 text-primary" /> Bestand uploaden
                            </Button>
                            <input type="file" id="doc-input" className="hidden" onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'documents')} multiple />
                            <div className="grid gap-3">
                                {uploadedFiles.map(f => (
                                    <div key={f.storagePath} className="flex items-center justify-between p-4 border rounded-2xl bg-white shadow-sm hover:border-primary/30 transition-all group">
                                        <div className="flex items-center gap-4 truncate">
                                            <div className="bg-blue-50 p-2 rounded-xl"><FileIcon className="h-5 w-5 text-primary" /></div>
                                            <span className="text-sm font-black truncate">{f.name}</span>
                                        </div>
                                        <Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Foto's" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="p-6 shadow-lg">
                                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Foto's Melding</CardTitle>
                                <div className="grid grid-cols-3 gap-3">
                                    {uploadedPhotos.map(p => <div key={p.storagePath} className="relative aspect-square rounded-2xl overflow-hidden border shadow-sm"><Image src={p.url} alt="melding" fill className="object-cover" /></div>)}
                                    {uploadedPhotos.length === 0 && <p className="col-span-3 text-center py-12 text-slate-300 font-bold uppercase text-[10px]">Geen foto's beschikbaar</p>}
                                </div>
                            </Card>
                            <Card className="p-6 shadow-lg">
                                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Foto's Afhandeling</CardTitle>
                                <Button variant="outline" className="w-full mb-6 h-12 font-black uppercase tracking-widest text-[10px]" onClick={() => document.getElementById('photo-input')?.click()}><Camera className="mr-2 h-4 w-4" /> Foto toevoegen</Button>
                                <input type="file" id="photo-input" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} multiple />
                                <div className="grid grid-cols-3 gap-3">
                                    {afhandelingFotos.map(p => (
                                        <div key={p.storagePath} className="relative aspect-square rounded-2xl overflow-hidden border shadow-sm group">
                                            <Image src={p.url} alt="afhandeling" fill className="object-cover" />
                                            <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setAfhandelingFotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}><X className="h-3 w-3" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    </TabsContent>
                    <TabsContent value="Hoeveelheid" className="mt-0">
                        <Card className="p-6 shadow-lg">
                            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Materiaalverbruik</CardTitle>
                            <div className="space-y-3 mb-8">
                                {hoeveelheden.map(h => (
                                    <div key={h.id} className="flex justify-between items-center p-4 bg-slate-50 border rounded-2xl">
                                        <div className="flex flex-col"><span className="text-xs font-black uppercase tracking-tight">{h.type}</span><span className="text-[10px] text-slate-400 font-bold uppercase">{h.eenheid}</span></div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-xl font-black text-primary">{h.aantal}</span>
                                            <Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600" onClick={() => setHoeveelheden(prev => prev.filter(x => x.id !== h.id))}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Input placeholder="Type materiaal..." className="h-11 font-bold" value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} />
                                <Input placeholder="Aantal..." type="number" className="h-11 font-bold" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} />
                                <Button className="h-11 font-black uppercase tracking-tight" onClick={() => { if(newHoeveelheidType && newHoeveelheidAantal) { setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); setNewHoeveelheidType(''); setNewHoeveelheidAantal(''); } }}>Toevoegen</Button>
                            </div>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Uren" className="mt-0">
                        <Card className="p-12 text-center shadow-lg border-2 border-primary/10">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Geregistreerde Werktijd (Actieve Timer)</p>
                            <p className="text-5xl font-black text-slate-900 tracking-tighter">{elapsedTime}</p>
                            <div className="mt-8 flex justify-center gap-2">
                                <Badge variant="secondary" className="bg-primary/5 text-primary border-none px-4 py-1.5 font-black uppercase tracking-widest text-[10px]">Live registratie</Badge>
                            </div>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Info" className="mt-0">
                        <Card className="p-6 shadow-lg space-y-4">
                            <div className="flex justify-between border-b py-2"><span className="text-slate-400 font-bold">Status:</span><Badge className="font-black uppercase text-[10px]">{selectedMelding.status}</Badge></div>
                            <div className="flex justify-between border-b py-2"><span className="text-slate-400 font-bold">Starttijd work:</span><span className="font-black">{selectedMelding.workStartedAt ? format(new Date(selectedMelding.workStartedAt), 'HH:mm') : 'Nog niet gestart'}</span></div>
                            <div className="flex justify-between py-2"><span className="text-slate-400 font-bold">Aangenomen door:</span><span className="font-black">{selectedMelding.aangenomen_door || '-'}</span></div>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-center">
                <div className="max-w-md space-y-6">
                    <div className="bg-white p-10 rounded-full shadow-2xl mx-auto w-32 h-32 flex items-center justify-center">
                        <Loader2 className="h-12 w-12 text-primary animate-spin opacity-20" />
                    </div>
                    <p className="text-xl font-black uppercase tracking-tight">Geen werkbon geselecteerd</p>
                    <p className="text-slate-500 font-medium leading-relaxed">Keer terug naar de navigatiekaart om een melding te selecteren of kies een melding uit de lijst hierboven.</p>
                    <Button variant="outline" className="h-12 px-8 font-black uppercase tracking-widest border-2" onClick={() => router.push('/navigation-module?type=meldingen')}>TERUG NAAR KAART</Button>
                </div>
            </div>
        )}
    </div>
  );
}
