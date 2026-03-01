
'use client';

import * as React from 'react';
import { useCollection, useFirestore, useFirebaseApp, updateDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { ArrowLeft, Navigation, Pencil, FileText, Camera, Package, Clock, Info, Trash2, File as FileIcon, Loader2, MapPin, UploadCloud, X, User, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const [userLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

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
      where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw'])
    );
  }, [firestore]);

  const { data: meldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenQuery);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: allMapObjects } = useCollection<MapObject>(objectsQuery);

  const filteredMeldingen = React.useMemo(() => {
    if (!meldingen) return [];
    const result = debouncedSearchQuery ? meldingen.filter(m => {
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

  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });

  const selectedMelding = React.useMemo(() => {
    return meldingen?.find(m => m.id === selectedMeldingId);
  }, [meldingen, selectedMeldingId]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  if (isLoadingMeldingen || !meldingIdFromUrl) return <LoadingScreen message="Werkbonnen laden..." />;

  return (
    <div className="flex flex-col flex-1 h-[calc(100vh-6.1rem)] min-h-0 overflow-hidden text-sm bg-gray-50">
        <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-4">
                 <Button variant="outline" size="icon" className="rounded-full h-10 w-10 border-slate-200" onClick={() => router.push('/navigation-module?type=meldingen')}>
                    <ArrowLeft className="h-5 w-5 text-slate-600" />
                 </Button>
                 <div>
                    <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 leading-none mb-1">Werkbon Details</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Route actief • Tik op kaart voor navigatie</p>
                 </div>
            </div>
            {selectedMelding && (
              <div className="flex items-center gap-3">
                  {selectedMelding.workStartedAt ? (
                    <Button className="bg-orange-600 hover:bg-orange-700 text-white font-black uppercase tracking-tight h-11 px-8 rounded-xl shadow-lg shadow-orange-600/20" onClick={handleAfronden} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        BON AFHANDELEN
                    </Button>
                  ) : (
                    <Button className="bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-tight h-11 px-8 rounded-xl shadow-lg shadow-green-600/20" onClick={handleStartWork}>
                        BON STARTEN
                    </Button>
                  )}
              </div>
            )}
        </header>
        
        {selectedMelding ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="px-6 pt-4 overflow-x-auto no-scrollbar bg-white shrink-0 border-b">
                    <TabsList className="w-max inline-flex">
                        {werkbonNavItems.map(item => (
                            <TabsTrigger key={item.label} value={item.label} className="gap-2 shrink-0">
                                <item.icon className="h-4 w-4 shrink-0" />
                                <span>{item.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                    <TabsContent value="Werkzaamheden" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="rounded-3xl bg-white shadow-xl border-none flex flex-col h-full overflow-hidden">
                                <CardHeader className="bg-slate-900 text-white p-6 shrink-0">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Intakenummer</p>
                                            <CardTitle className="text-2xl font-black uppercase tracking-tight">{selectedMelding.intakenummer}</CardTitle>
                                        </div>
                                        <Badge className="bg-blue-500 text-white border-none font-black text-[10px] h-6 px-3">{selectedMelding.status}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-8 space-y-8 flex-1 flex flex-col min-h-0">
                                    <div className="grid grid-cols-2 gap-x-12 gap-y-6 shrink-0">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Datum & Tijd</p>
                                            <p className="font-bold text-slate-900">{selectedMelding.datum} • {selectedMelding.tijdstip || '--:--'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Wijk / Gebied</p>
                                            <p className="font-bold text-slate-900 uppercase truncate">{selectedMelding.wijk || '-'}</p>
                                        </div>
                                        <div className="col-span-2 space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Locatie</p>
                                            <p className="font-bold text-slate-900">{selectedMelding.straatnaam} {selectedMelding.huisnummer}, {selectedMelding.plaats}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Categorie</p>
                                            <p className="font-bold text-slate-900 truncate">{selectedMelding.hoofdcategorie} • {selectedMelding.subcategorie}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Melder</p>
                                            <p className="font-bold text-slate-900 truncate">{selectedMelding.melder || 'Anoniem'}</p>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-h-0 flex flex-col space-y-3">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest shrink-0">Omschrijving melding</p>
                                        <ScrollArea className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 p-5">
                                            <p className="text-sm italic text-slate-600 font-medium leading-relaxed">
                                                "{selectedMelding.extra_informatie || 'Geen omschrijving opgegeven.'}"
                                            </p>
                                        </ScrollArea>
                                    </div>
                                </CardContent>
                            </Card>
                            <div className="rounded-[2.5rem] overflow-hidden border-2 border-white shadow-2xl min-h-[450px]">
                                <MapboxView 
                                  latitude={selectedMelding.latitude} 
                                  longitude={selectedMelding.longitude} 
                                  interactive={false} 
                                  objects={allMapObjects || []}
                                />
                            </div>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="Opmerkingen" className="mt-0">
                        <Card className="rounded-3xl border-none shadow-xl bg-white overflow-hidden">
                            <CardHeader className="bg-slate-50 border-b p-6"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Uitvoeringsnotities</CardTitle></CardHeader>
                            <CardContent className="p-6">
                                <Textarea 
                                    placeholder="Voeg hier bijzonderheden toe over de uitvoering..." 
                                    rows={15} 
                                    className="resize-none text-sm font-medium leading-relaxed rounded-2xl border-slate-100 bg-slate-50 focus:ring-primary/20"
                                    onChange={(e) => form.setValue('afhandeling_bijzonderheden', e.target.value)} 
                                    defaultValue={selectedMelding.afhandeling_bijzonderheden} 
                                />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="Locatiegegevens" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50 border-b p-6"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Locatie Details</CardTitle></CardHeader>
                                <CardContent className="p-8 space-y-6">
                                    <div className="flex justify-between items-center border-b border-slate-50 pb-4"><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Adres</span><span className="font-black text-slate-900">{selectedMelding.straatnaam} {selectedMelding.huisnummer}</span></div>
                                    <div className="flex justify-between items-center border-b border-slate-50 pb-4"><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Plaats</span><span className="font-black text-slate-900">{selectedMelding.plaats || '-'}</span></div>
                                    <div className="flex justify-between items-center border-b border-slate-50 pb-4"><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Wijk / Gebied</span><span className="font-black text-slate-900 uppercase">{selectedMelding.wijk || '-'}</span></div>
                                    <div className="flex justify-between items-center py-2"><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Coördinaten</span><span className="font-mono text-xs font-bold text-primary">{selectedMelding.latitude.toFixed(6)}, {selectedMelding.longitude.toFixed(6)}</span></div>
                                </CardContent>
                            </Card>
                            <div className="rounded-[2.5rem] overflow-hidden border-2 border-white shadow-2xl min-h-[450px]">
                                <MapboxView 
                                  latitude={selectedMelding.latitude} 
                                  longitude={selectedMelding.longitude} 
                                  interactive={false} 
                                  objects={allMapObjects || []}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="Documenten" className="mt-0">
                        <Card className="rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                            <CardHeader className="bg-slate-50 border-b p-6"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Projectbestanden</CardTitle></CardHeader>
                            <CardContent className="p-8 space-y-8">
                                <Button variant="outline" className="w-full h-24 border-dashed border-4 border-slate-100 hover:border-primary/30 rounded-3xl font-black uppercase text-xs tracking-widest gap-3 transition-all" onClick={() => document.getElementById('doc-input')?.click()}>
                                    <UploadCloud className="h-6 w-6 text-primary" /> Bestand uploaden
                                </Button>
                                <input type="file" id="doc-input" className="hidden" onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'documents')} multiple />
                                <div className="grid gap-4">
                                    {uploadedFiles.map(f => (
                                        <div key={f.storagePath} className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border-2 border-transparent hover:border-primary/20 hover:bg-white hover:shadow-lg transition-all group">
                                            <div className="flex items-center gap-4 truncate">
                                                <div className="bg-blue-100 p-3 rounded-xl"><FileIcon className="h-6 w-6 text-blue-600" /></div>
                                                <div className="truncate">
                                                    <p className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{f.name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{Math.round(f.size/1024)} KB • {f.type}</p>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-5 w-5" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="Foto's" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50 border-b p-6"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Brondocumenten (Foto's)</CardTitle></CardHeader>
                                <CardContent className="p-8">
                                    <div className="grid grid-cols-3 gap-4">
                                        {uploadedPhotos.map(p => <div key={p.storagePath} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-slate-50 shadow-sm"><Image src={p.url} alt="melding" fill className="object-cover" /></div>)}
                                        {uploadedPhotos.length === 0 && <div className="col-span-3 py-20 text-center opacity-20"><Camera className="h-12 w-12 mx-auto mb-2" /><p className="text-[10px] font-black uppercase tracking-widest">Geen bronfoto's</p></div>}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50 border-b p-6"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Uitvoering (Foto's)</CardTitle></CardHeader>
                                <CardContent className="p-8 space-y-6">
                                    <Button variant="outline" className="w-full h-16 border-dashed border-2 border-slate-100 rounded-2xl font-black uppercase tracking-widest text-[10px]" onClick={() => document.getElementById('photo-input')?.click()}><Camera className="mr-2 h-4 w-4" /> Foto toevoegen</Button>
                                    <input type="file" id="photo-input" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} multiple />
                                    <div className="grid grid-cols-3 gap-4">
                                        {afhandelingFotos.map(p => (
                                            <div key={p.storagePath} className="relative aspect-square rounded-2xl overflow-hidden border shadow-sm group">
                                                <Image src={p.url} alt="afhandeling" fill className="object-cover" />
                                                <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" onClick={() => setAfhandelingFotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}><X className="h-4 w-4" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="Hoeveelheid" className="mt-0">
                        <Card className="rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                            <CardHeader className="bg-slate-50 border-b p-6"><CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Verbruikte Materialen</CardTitle></CardHeader>
                            <CardContent className="p-8 space-y-8">
                                <div className="grid gap-3">
                                    {hoeveelheden.map(h => (
                                        <div key={h.id} className="flex justify-between items-center p-5 bg-slate-50 border-2 border-transparent rounded-3xl">
                                            <div className="flex flex-col"><span className="text-sm font-black uppercase tracking-tight text-slate-900">{h.type}</span><span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{h.eenheid}</span></div>
                                            <div className="flex items-center gap-6">
                                                <span className="text-3xl font-black text-primary leading-none">{h.aantal}</span>
                                                <Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600 rounded-full h-10 w-10" onClick={() => setHoeveelheden(prev => prev.filter(x => x.id !== h.id))}><Trash2 className="h-5 w-5" /></Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
                                    <div className="space-y-1"><Label className="text-[9px] font-black uppercase text-slate-400 ml-1">Materiaal</Label><Input placeholder="Bv. Zand..." className="h-11 font-bold rounded-xl" value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} /></div>
                                    <div className="space-y-1"><Label className="text-[9px] font-black uppercase text-slate-400 ml-1">Aantal</Label><Input placeholder="0" type="number" className="h-11 font-bold rounded-xl" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} /></div>
                                    <div className="flex items-end"><Button className="h-11 w-full font-black uppercase tracking-tight rounded-xl shadow-lg shadow-primary/20" onClick={() => { if(newHoeveelheidType && newHoeveelheidAantal) { setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); setNewHoeveelheidType(''); setNewHoeveelheidAantal(''); } }}>Toevoegen</Button></div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="Uren" className="mt-0">
                        <Card className="rounded-[3rem] p-16 text-center shadow-2xl border-none bg-slate-900 text-white overflow-hidden relative group">
                            <div className="absolute top-0 left-0 w-full h-full bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <p className="text-[10px] font-black uppercase text-blue-300 mb-6 tracking-[0.3em] relative z-10">Actieve Werktijd Registratie</p>
                            <p className="text-7xl font-black text-white tracking-tighter tabular-nums mb-8 relative z-10">{elapsedTime}</p>
                            <div className="flex justify-center gap-2 relative z-10">
                                <Badge className="bg-green-500 text-white border-none px-6 py-2 font-black uppercase tracking-[0.2em] text-[10px] rounded-full animate-pulse">Live link actief</Badge>
                            </div>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-center bg-slate-50">
                <div className="max-w-md space-y-8 animate-in zoom-in-95 duration-500">
                    <div className="bg-white p-12 rounded-[3rem] shadow-2xl mx-auto w-48 h-48 flex items-center justify-center border-4 border-slate-100">
                        <Navigation className="h-20 w-20 text-primary animate-pulse fill-current opacity-20" />
                    </div>
                    <div className="space-y-3">
                        <p className="text-2xl font-black uppercase tracking-tight text-slate-900">Geen werkbon geselecteerd</p>
                        <p className="text-slate-500 font-medium leading-relaxed">U bent momenteel in de detail-modus. Keer terug naar de kaart om een opdracht te selecteren voor uitvoering.</p>
                    </div>
                    <Button variant="outline" className="h-14 px-12 rounded-2xl border-2 border-primary text-primary hover:bg-primary hover:text-white font-black uppercase tracking-widest transition-all shadow-xl shadow-primary/10 gap-3" onClick={() => router.push('/navigation-module?type=meldingen')}>
                        <Navigation className="h-5 w-5" /> TERUG NAAR KAART
                    </Button>
                </div>
            </div>
        )}
    </div>
  );
}
