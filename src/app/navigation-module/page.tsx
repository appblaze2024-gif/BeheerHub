'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef } from 'react-map-gl';
import { useCollection, useFirestore, useUser, useMemoFirebase, updateDocumentNonBlocking, useFirebaseApp, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { 
  ArrowLeft, 
  Play, 
  CheckCircle2, 
  MapPin, 
  Gauge, 
  Loader2,
  Clock,
  Navigation,
  Search,
  Camera,
  MessageSquare,
  Mic,
  Check,
  LayoutGrid,
  X,
  FileText,
  Sparkles,
  Trash2,
  User,
  Package,
  Plus,
  Minus,
  Settings,
  Sliders,
  AlertCircle,
  RefreshCw,
  Layout,
  ImageIcon,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  AlertTriangle,
  Wrench,
  RotateCcw,
} from 'lucide-react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Object as MapObject, Melding, UploadedFile, MeldingTask, Hoeveelheid, UserProfile, Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import * as turf from '@turf/turf';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/firebase/profile-provider';
import { useToast } from '@/components/ui/use-toast';
import { addSeconds, format as formatDate, differenceInCalendarDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Image from 'next/image';
import { translateText } from '@/ai/flows/translate-text-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { LoadingScreen } from '@/components/loading-screen';
import { Separator } from '@/components/ui/separator';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';
const SIMULATION_START_LOCATION = { latitude: 52.2644, longitude: 4.7242 };

const ROUTE_COLUMNS_CONFIG = {
    intakenummer: true,
    locatie: true,
    memo: true,
    hoofdcategorie: true,
    subcategorie: true,
    werkgebied: true,
    afstand: true
};

const ROUTE_COLUMN_LABELS_CONFIG: Record<string, string> = {
    intakenummer: 'Nummer',
    locatie: 'Locatie',
    memo: 'Omschrijving',
    hoofdcategorie: 'Hoofdtype',
    subcategorie: 'Subtype',
    werkgebied: 'Gebied',
    afstand: 'Afstand'
};

const translationLanguages = [
  { code: 'nl-NL', name: 'Dutch', flag: 'nl', label: 'Nederlands' },
  { code: 'en-US', name: 'English', flag: 'us', label: 'Engels' },
  { code: 'pl-PL', name: 'Polish', flag: 'pl', label: 'Pools' },
  { code: 'uk-UA', name: 'Ukrainian', flag: 'ua', label: 'Oekraïens' },
  { code: 'de-DE', name: 'German', flag: 'de', label: 'Duits' },
  { code: 'hu-HU', name: 'Hungarian', flag: 'hu', label: 'Hongaars' },
];

const routeLayer: Layer = {
  id: 'route',
  type: 'line',
  source: 'route-line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#2563eb', 'line-width': 8, 'line-opacity': 0.8 },
};

const routeLayerCasing: Layer = {
  id: 'route-casing',
  type: 'line',
  source: 'route-line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#1e40af', 'line-width': 12, 'line-opacity': 0.2 },
};

function IntegratedWerkbonOverlay({ 
    meldingId, 
    onClose, 
    onCompleted 
}: { 
    meldingId: string, 
    onClose: () => void, 
    onCompleted: (id: string) => void 
}) {
    const firestore = useFirestore();
    const app = useFirebaseApp();
    const { user } = useUser();
    const { profile } = useProfile();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = React.useState('Werkzaamheden');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [afhandelingBijzonderheden, setAfhandelingBijzonderheden] = React.useState('');
    const [isListening, setIsListening] = React.useState(false);
    const [sourceLang, setSourceLang] = React.useState(translationLanguages[0]);
    const [targetLang, setTargetLang] = React.useState(translationLanguages[0]);
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [hoeveelheden, setHoeveelheden] = React.useState<Hoeveelheid[]>([]);
    const [newQuickKey, setNewQuickKey] = React.useState('');
    const [newHoeveelheidType, setNewHoeveelheidType] = React.useState('');
    const [newHoeveelheidAantal, setNewHoeveelheidAantal] = React.useState('');
    
    const [afhandelingFotos, setAfhandelingFotos] = React.useState<UploadedFile[]>([]);
    const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
    const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
    const recognitionRef = React.useRef<any>(null);

    const meldingRef = useMemoFirebase(() => firestore ? doc(firestore, 'meldingen', meldingId) : null, [firestore, meldingId]);
    const { data: melding, isLoading } = useDoc<Melding>(meldingRef);

    const objectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'objects') : null, [firestore]);
    const { data: allObjects } = useCollection<MapObject>(objectsQuery);

    const nearbyObjects = React.useMemo(() => {
        if (!allObjects || !melding) return [];
        const issuePt = turf.point([melding.longitude, melding.latitude]);
        return allObjects.filter(obj => {
            if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
            const objPt = turf.point([obj.longitude, obj.latitude]);
            return turf.distance(issuePt, objPt, { units: 'meters' }) <= 100;
        });
    }, [allObjects, melding]);

    React.useEffect(() => {
        if (melding) {
            setAfhandelingBijzonderheden(melding.afhandeling_bijzonderheden || '');
            setHoeveelheden(melding.hoeveelheden || []);
            setAfhandelingFotos(melding.afhandeling_fotos || []);
            setUploadedFiles(melding.files || []);
        }
    }, [melding]);

    const handleStartWork = async () => {
        if (!firestore || !melding) return;
        updateDocumentNonBlocking(doc(firestore, 'meldingen', melding.id), { workStartedAt: new Date().toISOString() });
    };

    const handleAfronden = async () => {
        if (!firestore || !melding || !user) return;
        setIsSubmitting(true);
        let minutesWorked = melding.gewerkteMinuten || 0;
        if (melding.workStartedAt) {
            minutesWorked += Math.round((Date.now() - new Date(melding.workStartedAt).getTime()) / (1000 * 60));
        }
        const finisher = profile?.displayName || user.email || 'Onbekend';
        try {
            updateDocumentNonBlocking(doc(firestore, 'meldingen', melding.id), {
                status: 'Afgerond',
                afhandeling_datum: formatDate(new Date(), 'yyyy-MM-dd'),
                afhandeling_tijdstip: formatDate(new Date(), 'HH:mm'),
                afgehandeld_door: finisher,
                afhandeling_bijzonderheden: afhandelingBijzonderheden || null,
                hoeveelheden: hoeveelheden,
                afhandeling_fotos: afhandelingFotos,
                gewerkteMinuten: minutesWorked,
                workStartedAt: null, 
            });
            onCompleted(melding.id);
        } catch (error) { 
            toast({ variant: "destructive", title: 'Fout bij afronden' }); 
        } finally { 
            setIsSubmitting(false); 
        }
    };

    const handleFileUpload = React.useCallback(async (files: FileList | File[], type: 'documents' | 'afhandeling_fotos') => {
        if (!files || !meldingId || !app) return;
        const storage = getStorage(app);
        for (const file of Array.from(files)) {
          const path = `meldingen/${meldingId}/${type}/${Date.now()}-${file.name}`;
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
    }, [meldingId, app]);

    const toggleListening = () => {
        if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const recognition = new SpeechRecognition();
        recognition.lang = sourceLang.code;
        recognition.continuous = true;
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event: any) => {
            const transcript = event.results[event.results.length - 1][0].transcript;
            setAfhandelingBijzonderheden(prev => prev + (prev ? ' ' : '') + transcript);
        };
        recognitionRef.current = recognition;
        recognition.start();
    };

    const handleAITranslate = async () => {
        if (!afhandelingBijzonderheden || isTranslating) return;
        setIsTranslating(true);
        try {
            const result = await translateText(afhandelingBijzonderheden, targetLang.name);
            setAfhandelingBijzonderheden(result.translatedText);
        } catch (err) { toast({ variant: 'destructive', title: 'Vertaalfout' }); } finally { setIsTranslating(false); }
    };

    const handleAddQuickKey = () => {
        if (!newQuickKey.trim() || !user || !firestore) return;
        const currentKeys = profile?.quickKeys || [];
        const updatedKeys = [...new Set([...currentKeys, newQuickKey.trim()])];
        setDocumentNonBlocking(doc(firestore, 'users', user.uid), { quickKeys: updatedKeys }, { merge: true });
        setNewQuickKey('');
        toast({ title: 'Sneltoets toegevoegd' });
    };

    const handleRemoveQuickKey = (key: string) => {
        if (!user || !firestore) return;
        const currentKeys = profile?.quickKeys || [];
        const updatedKeys = currentKeys.filter(k => k !== key);
        setDocumentNonBlocking(doc(firestore, 'users', user.uid), { quickKeys: updatedKeys }, { merge: true });
        toast({ title: 'Sneltoets verwijderd' });
    };

    if (isLoading || !melding) return <div className="p-12 flex justify-center h-full items-center"><Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" /></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <header className="h-14 lg:h-16 bg-white border-b flex items-center justify-between px-4 lg:px-6 shrink-0 shadow-sm z-10 sticky top-0">
                <div className="flex items-center gap-3 lg:gap-4">
                    <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 hover:bg-slate-200 transition-colors" onClick={onClose}>
                        <ArrowLeft className="h-6 w-6 text-slate-600" />
                    </Button>
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-tight leading-none text-slate-900">{melding.intakenummer}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{melding.subcategorie}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 lg:gap-3">
                    {melding.workStartedAt ? (
                        <Button className="bg-orange-600 hover:bg-orange-700 text-white font-black uppercase tracking-tight h-9 lg:h-11 px-4 lg:px-8 rounded-lg lg:rounded-xl shadow-lg shadow-orange-600/20 text-xs lg:text-sm" onClick={handleAfronden} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-3 w-3 lg:h-4 lg:w-4 animate-spin" /> : <Check className="mr-2 h-3 w-3 lg:h-4 lg:w-4" />}
                            AFHANDELEN
                        </Button>
                    ) : (
                        <Button className="bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-tight h-9 lg:h-11 px-4 lg:px-8 rounded-lg lg:rounded-xl shadow-lg shadow-green-600/20 text-xs lg:text-sm" onClick={handleStartWork}>
                            AFHANDELEN
                        </Button>
                    )}
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="px-4 lg:px-6 pt-2 lg:pt-4 overflow-x-auto no-scrollbar bg-white shrink-0 border-b">
                    <TabsList className="w-max inline-flex h-10 lg:h-12">
                        <TabsTrigger value="Werkzaamheden" className="gap-1.5 lg:gap-2 shrink-0 px-3 lg:px-4">
                            <FileText className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                            <span className="text-[10px] lg:text-[11px]">Werkzaamheden</span>
                        </TabsTrigger>
                        <TabsTrigger value="Opmerkingen" className="gap-1.5 lg:gap-2 shrink-0 px-3 lg:px-4">
                            <MessageSquare className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                            <span className="text-[10px] lg:text-[11px]">Opmerkingen</span>
                        </TabsTrigger>
                        <TabsTrigger value="Fotos" className="gap-1.5 lg:gap-2 shrink-0 px-3 lg:px-4">
                            <Camera className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                            <span className="text-[10px] lg:text-[11px]">Foto's</span>
                        </TabsTrigger>
                        <TabsTrigger value="Hoeveelheid" className="gap-1.5 lg:gap-2 shrink-0 px-3 lg:px-4">
                            <Package className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                            <span className="text-[10px] lg:text-[11px]">Hoeveelheid</span>
                        </TabsTrigger>
                    </TabsList>
                </div>
                
                <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-1 p-4 lg:p-6 overflow-y-auto no-scrollbar">
                        <TabsContent value="Werkzaamheden" className="mt-0 animate-in fade-in duration-300 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 h-full">
                                <Card className="rounded-xl lg:rounded-2xl bg-white shadow-xl border-none flex flex-col h-full overflow-hidden">
                                    <CardHeader className="bg-slate-100 border-b p-4 lg:p-5 shrink-0">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-0.5 lg:space-y-1">
                                                <p className="text-[8px] lg:text-[9px] font-black uppercase tracking-widest text-slate-400">Intakenummer</p>
                                                <CardTitle className="text-lg lg:text-xl font-black uppercase tracking-tight text-slate-900">{melding.intakenummer}</CardTitle>
                                            </div>
                                            <Badge className="bg-blue-500 text-white border-none font-black text-[8px] lg:text-[9px] h-4 lg:h-5 px-2 lg:px-2.5">{melding.status}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 lg:p-6 space-y-4 lg:space-y-6 flex-1 flex flex-col min-h-0">
                                        <div className="grid grid-cols-2 gap-x-4 lg:gap-x-6 gap-y-3 lg:gap-y-4 shrink-0">
                                            <div className="space-y-0.5">
                                                <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Datum & Tijd</p>
                                                <p className="text-[10px] lg:text-xs font-bold text-slate-900">{melding.datum} • {melding.tijdstip || '--:--'}</p>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Containernummer</p>
                                                <p className="text-[10px] lg:text-xs font-bold text-slate-900">{melding.containernummer || '-'}</p>
                                            </div>
                                            <div className="col-span-2 space-y-0.5">
                                                <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Locatie</p>
                                                <p className="text-[10px] lg:text-xs font-bold text-slate-900">{melding.straatnaam} {melding.huisnummer}, {melding.plaats}</p>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Categorie</p>
                                                <p className="text-[10px] lg:text-xs font-bold text-slate-900 truncate">{melding.hoofdcategorie} • {melding.subcategorie}</p>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Wijk</p>
                                                <p className="text-[10px] lg:text-xs font-bold text-slate-900 truncate">{melding.werkgebied || melding.wijk || '-'}</p>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-h-0 flex flex-col space-y-1.5 lg:space-y-2 border-t pt-4">
                                            <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest shrink-0">Omschrijving melding</p>
                                            <ScrollArea className="flex-1 bg-slate-50 rounded-lg lg:rounded-xl border border-slate-100 p-3 lg:p-4">
                                                <p className="text-[10px] lg:text-xs italic text-slate-600 font-medium leading-relaxed">
                                                    "{melding.extra_informatie || 'Geen omschrijving opgegeven.'}"
                                                </p>
                                            </ScrollArea>
                                        </div>
                                    </CardContent>
                                </Card>
                                <div className="rounded-xl lg:rounded-2xl overflow-hidden border-2 border-white shadow-2xl min-h-[300px] lg:min-h-[400px]">
                                    <MapboxView latitude={melding.latitude} longitude={melding.longitude} mainLocationLabel={melding.containernummer} interactive={true} objects={nearbyObjects} />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="Opmerkingen" className="mt-0 h-full space-y-6">
                            <Card className="rounded-xl lg:rounded-2xl border-none shadow-xl bg-white overflow-hidden shrink-0">
                                <CardHeader className="bg-slate-50 border-b p-4 lg:p-5 flex flex-row items-center justify-between">
                                    <CardTitle className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400">Uitvoeringsnotities</CardTitle>
                                    <div className="flex items-center gap-1.5 lg:gap-2 bg-slate-100 p-1 lg:p-1.5 rounded-xl lg:rounded-2xl border border-slate-200">
                                        <div className="flex items-center gap-1 lg:gap-1.5 pr-1.5 lg:pr-2 border-r border-slate-200">
                                            <Select value={sourceLang.code} onValueChange={(val) => setSourceLang(translationLanguages.find(l => l.code === val) || translationLanguages[0])}>
                                                <SelectTrigger className="h-7 lg:h-8 w-[50px] lg:w-[60px] p-0 border-none bg-transparent shadow-none focus:ring-0">
                                                    <div className="flex items-center justify-center w-full">
                                                        <img src={`https://flagcdn.com/w40/${sourceLang.flag}.png`} alt={sourceLang.label} className="h-3 w-5 lg:h-4 lg:w-6 rounded-sm object-cover border border-slate-200" />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {translationLanguages.map(l => (
                                                        <SelectItem key={l.code} value={l.code}>
                                                            <div className="flex items-center gap-2">
                                                                <img src={`https://flagcdn.com/w40/${l.flag}.png`} alt={l.label} className="h-3 w-4 rounded-sm object-cover" />
                                                                <span className="text-xs font-bold">{l.label}</span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button variant={isListening ? "destructive" : "ghost"} size="icon" className="rounded-full h-7 w-7 lg:h-8 lg:w-8 shadow-sm shrink-0" onClick={toggleListening} title={isListening ? "Stoppen" : `Dicteren in ${sourceLang.label}`}>
                                                {isListening ? <Loader2 className="h-3 w-3 lg:h-4 lg:w-4 animate-spin" /> : <Mic className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-primary" />}
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-1 lg:gap-1.5 pl-1">
                                            <ChevronRight className="h-3 w-3 text-slate-300" />
                                            <Select value={targetLang.code} onValueChange={(val) => setTargetLang(translationLanguages.find(l => l.code === val) || translationLanguages[0])}>
                                                <SelectTrigger className="h-7 lg:h-8 w-[50px] lg:w-[60px] p-0 border-none bg-transparent shadow-none focus:ring-0">
                                                    <div className="flex items-center justify-center w-full">
                                                        <img src={`https://flagcdn.com/w40/${targetLang.flag}.png`} alt={targetLang.label} className="h-3 w-5 lg:h-4 lg:w-6 rounded-sm object-cover border border-slate-200" />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {translationLanguages.map(l => (
                                                        <SelectItem key={l.code} value={l.code}>
                                                            <div className="flex items-center gap-2">
                                                                <img src={`https://flagcdn.com/w40/${l.flag}.png`} alt={l.label} className="h-3 w-4 rounded-sm object-cover" />
                                                                <span className="text-xs font-bold">{l.label}</span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button variant="ghost" size="sm" className="h-7 lg:h-8 px-2 lg:px-3 font-black uppercase text-[8px] lg:text-[9px] gap-1.5 lg:gap-2 text-primary hover:bg-primary/5 rounded-lg lg:rounded-xl" onClick={handleAITranslate} disabled={isTranslating || !afhandelingBijzonderheden}>
                                                {isTranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                                Vertaal
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 lg:p-6 space-y-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sneltoetsen</Label>
                                            <div className="flex gap-2">
                                                <Input 
                                                    placeholder="Nieuwe tekst..." 
                                                    className="h-8 text-[10px] w-32 font-bold rounded-lg" 
                                                    value={newQuickKey}
                                                    onChange={e => setNewQuickKey(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddQuickKey())}
                                                />
                                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={handleAddQuickKey} disabled={!newQuickKey.trim()}>
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(profile?.quickKeys || []).map((k, i) => (
                                                <div key={i} className="group relative">
                                                    <Button variant="secondary" size="sm" className="h-8 px-3 text-[10px] font-black uppercase tracking-tight rounded-xl border-2 border-slate-100 bg-white hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm" onClick={() => setAfhandelingBijzonderheden(prev => prev + (prev ? ' ' : '') + k)}>
                                                        {k}
                                                    </Button>
                                                    <button className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" onClick={(e) => { e.stopPropagation(); handleRemoveQuickKey(k); }}>
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <Separator className="bg-slate-100" />
                                    <Textarea 
                                        placeholder="Voer hier je bevindingen in..." 
                                        className="resize-none text-[11px] lg:text-sm font-medium leading-relaxed rounded-xl border-slate-100 bg-slate-50 focus:ring-primary/20 min-h-[200px]"
                                        value={afhandelingBijzonderheden}
                                        onChange={(e) => setAfhandelingBijzonderheden(e.target.value)}
                                    />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="Fotos" className="mt-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-8">
                                <Card className="rounded-xl lg:rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                                    <CardHeader className="bg-slate-50 border-b p-4 lg:p-6"><CardTitle className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400">Brondocumenten (Foto's)</CardTitle></CardHeader>
                                    <CardContent className="p-4 lg:p-8">
                                        <div className="grid grid-cols-3 gap-3 lg:gap-4">
                                            {melding.fotos?.map((p, i) => (
                                                <div key={i} className="relative aspect-square rounded-xl lg:rounded-2xl overflow-hidden border-2 border-slate-50 shadow-sm"><Image src={p.url} alt="melding" fill className="object-cover" /></div>
                                            ))}
                                            {(!melding.fotos || melding.fotos.length === 0) && (<div className="col-span-3 py-12 text-center opacity-20"><Camera className="h-10 w-10 lg:h-12 lg:w-12 mx-auto mb-2" /><p className="text-[10px] font-black uppercase tracking-widest">Geen bronfoto's</p></div>)}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-xl lg:rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                                    <CardHeader className="bg-slate-50 border-b p-4 lg:p-5 flex flex-row items-center justify-between">
                                        <CardTitle className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400">Uitvoering (Foto's)</CardTitle>
                                        <Badge variant="secondary" className="bg-green-100 text-green-700 border-none font-bold text-[9px] uppercase px-2 h-5">{afhandelingFotos.length} Foto's</Badge>
                                    </CardHeader>
                                    <CardContent className="p-4 lg:p-8 space-y-6">
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="flex-1 h-16 border-dashed border-2 border-slate-200 hover:border-primary/30 rounded-2xl font-black uppercase text-[10px] tracking-widest gap-3 transition-all bg-slate-50/50" onClick={() => document.getElementById('camera-input-integrated')?.click()}><Camera className="h-6 w-6 text-primary" /><span>Foto Maken</span></Button>
                                            <Button variant="outline" className="flex-1 h-16 border-dashed border-2 border-slate-200 hover:border-primary/30 rounded-2xl font-black uppercase text-[10px] tracking-widest gap-3 transition-all bg-slate-50/50" onClick={() => document.getElementById('gallery-input-integrated')?.click()}><ImageIcon className="h-6 w-6 text-slate-400" /><span>Album</span></Button>
                                        </div>
                                        <input type="file" id="camera-input-integrated" className="hidden" accept="image/*" capture="environment" onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                                        <input type="file" id="gallery-input-integrated" className="hidden" accept="image/*" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                                        <div className="grid grid-cols-3 gap-3">
                                            {afhandelingFotos.map((p, i) => (
                                                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border-2 border-white shadow-md group">
                                                    <Image src={p.url} alt="afhandeling" fill className="object-cover" />
                                                    <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" onClick={() => setAfhandelingFotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}><X className="h-3 w-3" /></Button>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        <TabsContent value="Hoeveelheid" className="mt-0">
                            <Card className="rounded-xl lg:rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50 border-b p-4 lg:p-6"><CardTitle className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400">Verbruikte Materialen</CardTitle></CardHeader>
                                <CardContent className="p-4 lg:p-8 space-y-6 lg:space-y-8">
                                    <div className="grid gap-2 lg:gap-3">
                                        {hoeveelheden.map(h => (
                                            <div key={h.id} className="flex justify-between items-center p-3 lg:p-5 bg-slate-50 border-2 border-transparent rounded-2xl lg:rounded-3xl">
                                                <div className="flex flex-col"><span className="text-[11px] lg:text-sm font-black uppercase tracking-tight text-slate-900">{h.type}</span><span className="text-[8px] lg:text-[10px] text-slate-400 font-bold uppercase tracking-widest">{h.eenheid}</span></div>
                                                <div className="flex items-center gap-4 lg:gap-6">
                                                    <span className="text-2xl lg:text-3xl font-black text-primary leading-none">{h.aantal}</span>
                                                    <Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600 rounded-full h-8 w-8 lg:h-10 lg:w-10" onClick={() => setHoeveelheden(prev => prev.filter(x => x.id !== h.id))}><Trash2 className="h-4 w-4 lg:h-5 lg:w-5" /></Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 bg-slate-50 p-4 lg:p-6 rounded-2xl lg:rounded-3xl border-2 border-slate-100">
                                        <div className="space-y-1">
                                            <Label className="text-[8px] lg:text-[9px] font-black uppercase text-slate-400 ml-1">Material</Label>
                                            <Input placeholder="Bv. Zand..." className="h-9 lg:h-11 font-bold rounded-lg lg:rounded-xl text-xs lg:sm" value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[8px] lg:text-[9px] font-black uppercase text-slate-400 ml-1">Aantal</Label>
                                            <Input placeholder="0" type="number" className="h-9 lg:h-11 font-bold rounded-lg lg:rounded-xl text-xs lg:sm" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} />
                                        </div>
                                        <div className="flex items-end">
                                            <Button 
                                                className="h-9 lg:h-11 w-full font-black uppercase tracking-tight rounded-lg lg:rounded-xl shadow-lg shadow-primary/20 text-[10px] lg:text-xs" 
                                                onClick={() => { 
                                                    if(newHoeveelheidType && newHoeveelheidAantal) { 
                                                        setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); 
                                                        setNewHoeveelheidType(''); 
                                                        setNewHoeveelheidAantal(''); 
                                                    } 
                                                }}
                                            >
                                                Toevoegen
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </div>
                </main>
            </Tabs>
        </div>
    );
}

export default function StartNavigationPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { profile } = useProfile();
  const { setIsHeaderVisible } = useNavigationUI();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const isPrivileged = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  const [isStartingSimulation, setIsStartingSimulation] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const [isLocating, setIsLocating] = React.useState(false);
  const [activeWerkbonId, setActiveWerkbonId] = React.useState<string | null>(null);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [isManualMode, setIsManualMode] = React.useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = React.useState(false);
  const [isCockpitExpanded, setIsCockpitExpanded] = React.useState(true);

  const [showTodayCompleted, setShowTodayCompleted] = React.useState(false);
  const [showAssignmentBubbles, setShowAssignmentBubbles] = React.useState(false);
  const [visibleColumns, setVisibleColumns] = React.useState<Record<string, boolean>>(ROUTE_COLUMNS_CONFIG);

  const [navZoom, setNavZoomState] = React.useState(18);
  const [navPitch, setNavPitchState] = React.useState(60);
  const [navOffset, setNavOffsetState] = React.useState(450);
  const [autoOpenEnabled, setAutoOpenEnabledState] = React.useState(false);

  const [smoothLocation, setSmoothLocation] = React.useState<any>(null);
  const lastHeadingRef = React.useRef(0);
  const [currentRouteGeometry, setCurrentRouteGeometry] = React.useState<any>(null);
  const [displayedRouteGeometry, setDisplayedRouteGeometry] = React.useState<any>(null);
  const [routeInfo, setRouteInfo] = React.useState<{ duration: number; distance: number } | null>(null);
  const [speedKmh, setSpeedKmh] = React.useState(0);
  const [currentSpeedLimit, setCurrentSpeedLimit] = React.useState<number>(50);
  const [isPaused, setIsPaused] = React.useState(false);

  const mapRef = React.useRef<MapRef>(null);
  const simAnimationRef = React.useRef<number | null>(null);
  const simStateRef = React.useRef({ distanceTravelled: 0, currentSpeedMs: 0 });
  const lastRouteCalculationLocationRef = React.useRef<{latitude: number, longitude: number} | null>(null);
  const lastFetchTimeRef = React.useRef<number>(0);
  const autoOpenTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  React.useEffect(() => {
    if (profile) {
        if (profile.navZoom !== undefined) setNavZoomState(Number(profile.navZoom));
        if (profile.navPitch !== undefined) setNavPitchState(Number(profile.navPitch));
        if (profile.navOffset !== undefined) setNavOffsetState(Number(profile.navOffset));
        if (profile.navColumns) setVisibleColumns(profile.navColumns);
        if (profile.autoOpenEnabled !== undefined) setAutoOpenEnabledState(!!profile.autoOpenEnabled);
    }
  }, [profile]);

  // DATA QUERIES
  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw'])
    );
  }, [firestore]);

  const { data: rawMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenQuery);

  const completedTodayQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
    return query(
      collection(firestore, 'meldingen'),
      where('status', '==', 'Afgerond'),
      where('afhandeling_datum', '==', todayStr)
    );
  }, [firestore]);

  const { data: rawCompletedToday } = useCollection<Melding>(completedTodayQuery);

  // FILTERS
  const filteredMeldingen = React.useMemo(() => {
    if (!rawMeldingen) return [];
    let pool = [...rawMeldingen].filter(m => !completedObjects.includes(m.id));
    if (showTodayCompleted && rawCompletedToday) pool = [...pool, ...rawCompletedToday];
    if (!isPrivileged) {
        const userName = profile?.displayName || profile?.email || 'Onbekend';
        pool = pool.filter(m => m.behandelaar === userName);
    }
    if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase();
        pool = pool.filter(m => m.intakenummer.toLowerCase().includes(q) || (m.straatnaam || '').toLowerCase().includes(q));
    }
    return pool;
  }, [rawMeldingen, rawCompletedToday, showTodayCompleted, isPrivileged, profile, debouncedSearchQuery, completedObjects]);

  const sortedMissions = React.useMemo(() => {
    if (filteredMeldingen.length === 0) return [];
    const base = userLocation || SIMULATION_START_LOCATION;
    return [...filteredMeldingen]
        .filter(m => m.status !== 'Afgerond')
        .sort((a, b) => {
            const distA = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([a.longitude, a.latitude]));
            const distB = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([b.longitude, b.latitude]));
            return distA - distB;
        });
  }, [filteredMeldingen, userLocation]);

  const nextMission = sortedMissions[0];

  const goToOverview = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const startPos = userLocation || SIMULATION_START_LOCATION;
    const points: [number, number][] = [[startPos.longitude, startPos.latitude]];
    
    filteredMeldingen.forEach(m => {
        if (m.longitude && m.latitude) {
            points.push([m.longitude, m.latitude]);
        }
    });

    if (points.length > 1) {
        const coll = turf.featureCollection(points.map(p => turf.point(p)));
        const bbox = turf.bbox(coll);
        map.fitBounds(bbox as [number, number, number, number], { 
            padding: { top: 80, bottom: 350, left: 80, right: 80 }, 
            duration: 0, 
            maxZoom: 14,
            linear: true
        });
    } else {
        map.easeTo({ center: [startPos.longitude, startPos.latitude], zoom: 11, pitch: 0, duration: 0 });
    }
  }, [filteredMeldingen, userLocation]);

  React.useEffect(() => {
    if (navigationState === 'setup' && !isLoadingMeldingen && filteredMeldingen.length > 0 && mapRef.current) {
        const map = mapRef.current.getMap();
        if (map.isStyleLoaded()) {
            map.resize();
            goToOverview();
        } else {
            map.once('style.load', () => {
                map.resize();
                goToOverview();
            });
        }
    }
  }, [navigationState, isLoadingMeldingen, filteredMeldingen.length, goToOverview]);

  // ROUTE FETCHING
  const fetchRoute = React.useCallback(async (force = false) => {
    if (navigationState === 'setup') {
        setCurrentRouteGeometry(null);
        setDisplayedRouteGeometry(null);
        setRouteInfo(null);
        return;
    }

    if (sortedMissions.length === 0) {
        setCurrentRouteGeometry(null);
        setDisplayedRouteGeometry(null);
        setRouteInfo(null);
        return;
    }
    
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 2000) return;
    
    setIsCalculatingRoute(true);
    lastFetchTimeRef.current = now;
    const startPos = userLocation || SIMULATION_START_LOCATION;
    lastRouteCalculationLocationRef.current = startPos;

    const waypoints = [
        [startPos.longitude, startPos.latitude], 
        [sortedMissions[0].longitude, sortedMissions[0].latitude]
    ];
    const waypointsStr = waypoints.map(w => w.join(',')).join(';');
    
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypointsStr}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]) {
            const route = data.routes[0];
            setCurrentRouteGeometry(route.geometry);
            setDisplayedRouteGeometry(turf.feature(route.geometry));
            setRouteInfo({ duration: route.duration, distance: route.distance });
        }
    } catch (e) { 
        console.error("Route error:", e); 
    } finally {
        setIsCalculatingRoute(false);
    }
  }, [sortedMissions, userLocation, navigationState]);

  React.useEffect(() => {
    if (navigationState === 'navigating' && sortedMissions.length > 0) {
        fetchRoute(true);
    } else if (navigationState === 'setup') {
        setCurrentRouteGeometry(null);
        setDisplayedRouteGeometry(null);
        setRouteInfo(null);
    }
  }, [navigationState, sortedMissions[0]?.id, fetchRoute]);

  // AUTO-OPEN LOGIC
  React.useEffect(() => {
    if (!autoOpenEnabled || navigationState !== 'navigating' || !nextMission || activeWerkbonId) {
        if (autoOpenTimerRef.current) {
            clearTimeout(autoOpenTimerRef.current);
            autoOpenTimerRef.current = null;
        }
        return;
    }

    const currentPos = userLocation || SIMULATION_START_LOCATION;
    const missionPt = turf.point([nextMission.longitude, nextMission.latitude]);
    const userPt = turf.point([currentPos.longitude, currentPos.latitude]);
    const distance = turf.distance(userPt, missionPt, { units: 'meters' });

    // Condition: Close (< 50m) and practically stopped (< 2km/h)
    if (distance < 50 && speedKmh < 2) {
        if (!autoOpenTimerRef.current) {
            autoOpenTimerRef.current = setTimeout(() => {
                setActiveWerkbonId(nextMission.id);
                toast({ title: "Melding automatisch geopend", description: "U bent gearriveerd op de locatie." });
                autoOpenTimerRef.current = null;
            }, 10000);
        }
    } else {
        if (autoOpenTimerRef.current) {
            clearTimeout(autoOpenTimerRef.current);
            autoOpenTimerRef.current = null;
        }
    }

    return () => {
        if (autoOpenTimerRef.current) {
            clearTimeout(autoOpenTimerRef.current);
            autoOpenTimerRef.current = null;
        }
    };
  }, [autoOpenEnabled, navigationState, nextMission, activeWerkbonId, userLocation, speedKmh, toast]);

  // AUTO-RECENTER LOGIC
  React.useEffect(() => {
    if (!isManualMode || navigationState !== 'navigating') return;
    const timer = setTimeout(() => {
        setIsManualMode(false);
        if (mapRef.current && smoothLocation) {
            const map = mapRef.current.getMap();
            map.easeTo({
                center: [smoothLocation.longitude, smoothLocation.latitude],
                zoom: Math.max(15, Math.min(19, 19 - (speedKmh / 20))),
                pitch: navPitch,
                bearing: smoothLocation.heading || 0,
                padding: { top: 0, bottom: Math.max(0, navOffset), left: 0, right: 0 },
                duration: 1000
            });
        }
    }, 10000);
    return () => clearTimeout(timer);
  }, [isManualMode, navigationState, smoothLocation, navPitch, navOffset, speedKmh]);

  // STABLE GPS ENGINE
  React.useEffect(() => {
    if (!navigator.geolocation || isSimulationMode) return;
    
    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setUserLocation(loc);
            
            if (navigationState === 'navigating' && currentRouteGeometry && !isCalculatingRoute) {
                const line = turf.lineString(currentRouteGeometry.coordinates);
                const rawPt = turf.point([loc.longitude, loc.latitude]);
                const distanceOffRoute = turf.pointToLineDistance(rawPt, line, { units: 'meters' });
                if (distanceOffRoute > 50) {
                    fetchRoute(true);
                }
            }

            let activeLoc = { ...loc, heading: lastHeadingRef.current };

            if (currentRouteGeometry) {
                try {
                    const line = turf.lineString(currentRouteGeometry.coordinates);
                    const currPt = turf.point([loc.longitude, loc.latitude]);
                    const snapped = turf.nearestPointOnLine(line, currPt);
                    
                    activeLoc.longitude = snapped.geometry.coordinates[0];
                    activeLoc.latitude = snapped.geometry.coordinates[1];

                    const alongRoute = turf.lineSlice(turf.point(currentRouteGeometry.coordinates[0]), snapped, line);
                    const distAlong = turf.length(alongRoute, { units: 'meters' });
                    const ahead = turf.along(line, distAlong + 10, { units: 'meters' });
                    const calculatedHeading = (turf.bearing(snapped, ahead) + 360) % 360;
                    activeLoc.heading = calculatedHeading;
                    lastHeadingRef.current = calculatedHeading;

                    const forwardPart = turf.lineSlice(snapped, turf.point(currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1]), line);
                    setDisplayedRouteGeometry(forwardPart);
                } catch (e) {}
            }

            setSmoothLocation(activeLoc);
            const currentSpeed = pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 0;
            setSpeedKmh(currentSpeed);

            if (navigationState === 'navigating' && mapRef.current && !isManualMode) {
                const map = mapRef.current.getMap();
                const dynamicZoom = Math.max(15, Math.min(19, 19 - (currentSpeed / 20)));
                map.easeTo({
                    center: [activeLoc.longitude, activeLoc.latitude],
                    bearing: activeLoc.heading,
                    zoom: dynamicZoom,
                    pitch: navPitch,
                    padding: { top: 0, bottom: Math.max(0, navOffset), left: 0, right: 0 },
                    duration: 500, 
                    easing: (t) => t 
                });
            }
        },
        (err) => {
            if (err.code === 1) { // PERMISSION_DENIED
                console.warn("GPS Permission Denied");
            } else if (err.code === 3) { // TIMEOUT
                console.warn("GPS Timeout - searching for signal...");
            } else {
                console.warn("GPS Position Error:", err.message || "Unknown error");
            }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigationState, isSimulationMode, currentRouteGeometry, isManualMode, navPitch, navOffset, isCalculatingRoute, fetchRoute]);

  // LIVE SPEED LIMIT DETECTION
  React.useEffect(() => {
    if (navigationState !== 'navigating' || !smoothLocation || !mapRef.current) return;

    const map = mapRef.current.getMap();
    if (!map.isStyleLoaded()) return;

    const updateSpeedLimit = () => {
        try {
            const point = map.project([smoothLocation.longitude, smoothLocation.latitude]);
            const style = map.getStyle();
            const availableLayers = style?.layers?.map(l => l.id) || [];
            const queryLayers = ['road-label', 'road', 'bridge-road', 'tunnel-road'].filter(l => availableLayers.includes(l));

            let features;
            if (queryLayers.length > 0) {
                features = map.queryRenderedFeatures(point, { layers: queryLayers });
            } else {
                features = map.queryRenderedFeatures(point);
            }
            
            if (features && features.length > 0) {
                const roadFeature = features.find(f => f.properties?.class);
                if (roadFeature) {
                    const roadClass = roadFeature.properties.class;
                    let limit = 50;

                    switch(roadClass) {
                        case 'motorway': limit = 100; break;
                        case 'trunk': limit = 100; break;
                        case 'primary': limit = 80; break;
                        case 'secondary': limit = 80; break;
                        case 'tertiary': limit = 50; break;
                        case 'street': 
                        case 'road':
                        case 'residential':
                        case 'service': limit = 30; break;
                        case 'path':
                        case 'pedestrian': limit = 15; break;
                        default: limit = 50;
                    }
                    setCurrentSpeedLimit(limit);
                }
            }
        } catch (e) {
            console.warn("Speed limit detection skipped or failed", e);
        }
    };

    const timer = setTimeout(updateSpeedLimit, 1000);
    return () => clearTimeout(timer);
  }, [smoothLocation, navigationState]);

  // INTERFACE HANDLERS
  const updateNavZoom = (newZoom: number) => {
    const val = Number(newZoom);
    setNavZoomState(val);
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navZoom: val }, { merge: true });
    mapRef.current?.getMap().jumpTo({ zoom: val });
  };

  const updateNavPitch = (newPitch: number) => {
    const val = Number(newPitch);
    setNavPitchState(val);
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navPitch: val }, { merge: true });
    mapRef.current?.getMap().jumpTo({ pitch: val });
  };

  const updateNavOffset = (newOffset: number) => {
    const val = Number(newOffset);
    setNavOffsetState(val);
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navOffset: val }, { merge: true });
    mapRef.current?.getMap().jumpTo({ padding: { top: 0, bottom: Math.max(0, val), left: 0, right: 0 } });
  };

  const setAutoOpenEnabled = (val: boolean) => {
    setAutoOpenEnabledState(val);
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { autoOpenEnabled: val }, { merge: true });
  };

  const toggleColumnVisibility = (colId: string) => {
    const next = { ...visibleColumns, [colId]: !visibleColumns[colId] };
    setVisibleColumns(next);
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navColumns: next }, { merge: true });
  };

  const handleStartRit = (simulate = false) => {
    if (sortedMissions.length === 0) return;
    setCurrentRouteGeometry(null);
    setDisplayedRouteGeometry(null);
    setRouteInfo(null);

    if (!simulate) {
        setIsLocating(true);
        const beginNavigation = (loc: { latitude: number, longitude: number }, heading: number) => {
            setSmoothLocation({ ...loc, heading });
            setIsSimulationMode(false);
            setNavigationState('navigating');
            setIsLocating(false);
            setIsManualMode(false);
            
            if (mapRef.current) {
                mapRef.current.getMap().jumpTo({ 
                    center: [loc.longitude, loc.latitude], 
                    zoom: 18, 
                    pitch: navPitch, 
                    bearing: heading, 
                    padding: { top: 0, bottom: Math.max(0, navOffset), left: 0, right: 0 }
                });
            }
        };

        if (userLocation) beginNavigation(userLocation, lastHeadingRef.current || 0);
        else {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                    setUserLocation(loc);
                    beginNavigation(loc, pos.coords.heading || 0);
                },
                (err) => { beginNavigation(SIMULATION_START_LOCATION, 0); },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        }
    } else {
        setIsStartingSimulation(true);
        setIsSimulationMode(true);
        setNavigationState('navigating');
        setIsManualMode(false);
        
        setTimeout(() => {
            setIsStartingSimulation(false);
            startSimulation();
        }, 100); 
    }
  };

  const startSimulation = () => {
    if (!currentRouteGeometry) return;
    const line = turf.lineString(currentRouteGeometry.coordinates);
    const totalDist = turf.length(line, { units: 'meters' });
    simStateRef.current = { distanceTravelled: 0, currentSpeedMs: 0 };
    
    const animate = () => {
        if (isPaused || activeWerkbonId || navigationState === 'setup') { 
            if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current);
            return; 
        }
        const speedMs = 13.8;
        simStateRef.current.distanceTravelled += speedMs * 0.016;
        if (simStateRef.current.distanceTravelled >= totalDist) { setSpeedKmh(0); return; }
        const curr = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
        const [lng, lat] = curr.geometry.coordinates;
        const aheadDist = Math.min(simStateRef.current.distanceTravelled + 10, totalDist);
        const ahead = turf.along(line, aheadDist, { units: 'meters' });
        const head = (turf.bearing(curr, ahead) + 360) % 360;
        lastHeadingRef.current = head;
        const forwardPart = turf.lineSlice(curr, turf.point(currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1]), line);
        setDisplayedRouteGeometry(forwardPart);
        const base = { latitude: lat, longitude: lng, heading: head };
        setSmoothLocation(base);
        setSpeedKmh(Math.round(speedMs * 3.6));
        if (mapRef.current && !isManualMode) {
            mapRef.current.getMap().jumpTo({ 
                center: [lng, lat], 
                bearing: head,
                pitch: navPitch,
                zoom: Math.max(15, Math.min(19, 19 - (Math.round(speedMs * 3.6) / 20))),
                padding: { top: 0, bottom: Math.max(0, navOffset), left: 0, right: 0 }
            });
        }
        simAnimationRef.current = requestAnimationFrame(animate);
    };
    simAnimationRef.current = requestAnimationFrame(animate);
  };

  const handleMeldingClick = (m: Melding) => {
    setIsManualMode(true);
    if (mapRef.current) {
        mapRef.current.getMap().flyTo({
            center: [m.longitude, m.latitude],
            zoom: 16,
            pitch: 45,
            duration: 1000
        });
    }
  };

  const handleStopRit = () => {
    setNavigationState('setup'); 
    if(simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current); 
    setCurrentRouteGeometry(null);
    setDisplayedRouteGeometry(null);
    setRouteInfo(null);
    setIsManualMode(false);
    
    const map = mapRef.current?.getMap();
    if (map) {
        map.jumpTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 0 });
        setTimeout(() => goToOverview(), 50);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden text-sm">
        {isLocating && <LoadingScreen message="GPS koppelen..." className="fixed inset-0 z-[1000]" />}
        {isStartingSimulation && <LoadingScreen message="Simulator voorbereiden..." className="fixed inset-0 z-[1000]" />}
        
        <div className="absolute inset-0 z-0" style={{ touchAction: 'none' }}>
            <MapGL 
                ref={mapRef} 
                initialViewState={{ longitude: SIMULATION_START_LOCATION.longitude, latitude: SIMULATION_START_LOCATION.latitude, zoom: 13 }} 
                style={{ width: '100%', height: '100%' }} 
                mapStyle={mapStyle} 
                mapboxAccessToken={MAPBOX_TOKEN} 
                dragPan={true}
                dragRotate={true}
                scrollZoom={true}
                touchZoomRotate={true}
                touchPitch={true}
                doubleClickZoom={true}
                onInteractionStateChange={(state) => {
                    if (state.isDragging || state.isZooming || state.isRotating) {
                        setIsManualMode(true);
                    }
                }}
            >
                {smoothLocation && (
                    <Marker longitude={smoothLocation.longitude} latitude={smoothLocation.latitude} anchor="center">
                        <div className="relative flex items-center justify-center w-16 h-16">
                            <div className="absolute h-10 w-10 bg-primary/20 rounded-full animate-ping" />
                            <div className="h-6 w-6 rounded-full bg-primary border-4 border-white shadow-2xl relative z-10" />
                        </div>
                    </Marker>
                )}
                {filteredMeldingen.map((m) => (
                    <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center" onClick={e => { e.originalEvent.stopPropagation(); setActiveWerkbonId(m.id); }}>
                        <div className="relative flex items-center justify-center w-14 h-14">
                            {nextMission?.id === m.id && navigationState === 'navigating' && (
                                <div className="absolute inset-0 rounded-full border-[4px] border-slate-900 animate-pulse opacity-80" />
                            )}
                            {m.status === 'Afgerond' ? (
                                <div className="w-10 h-10 rounded-full border-2 border-white shadow-xl flex items-center justify-center transition-transform hover:scale-110 cursor-pointer z-10 bg-green-500">
                                    <Check className="h-5 w-5 text-white" />
                                </div>
                            ) : (
                                <div className="transition-transform hover:scale-125 cursor-pointer z-10 relative">
                                    <img 
                                        src="https://i.ibb.co/0jg4jm6v/3d-printer-icon-sharp.png" 
                                        alt="task" 
                                        className="h-10 w-10 object-contain drop-shadow-2xl" 
                                    />
                                    <div className="absolute -top-1.5 -right-1.5 bg-yellow-400 rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-sm overflow-hidden">
                                        <Wrench className="h-3.5 w-3.5 text-slate-900" strokeWidth={3} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </Marker>
                ))}
                {navigationState === 'navigating' && displayedRouteGeometry && (
                    <Source id="route-line" type="geojson" data={displayedRouteGeometry}>
                        <Layer {...routeLayerCasing} />
                        <Layer {...routeLayer} />
                    </Source>
                )}
            </MapGL>
        </div>

        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between pointer-events-none">
            {/* Top Left Widgets */}
            <div className="flex flex-col gap-3 pointer-events-auto">
                {navigationState === 'navigating' && routeInfo && (
                    <div className="bg-white/95 backdrop-blur-md px-5 h-12 md:h-14 rounded-2xl shadow-2xl border-2 border-slate-100 flex items-center gap-5 min-w-fit animate-in slide-in-from-left-4 duration-500">
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Vertrek</span>
                            <span className="text-lg font-black text-slate-900 leading-none">{formatDate(new Date(), 'HH:mm')}</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Aankomst</span>
                            <span className="text-lg font-black text-primary leading-none">
                                {formatDate(addSeconds(new Date(), routeInfo.duration), 'HH:mm')}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
                {navigationState === 'navigating' && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="secondary" size="icon" className="h-12 md:h-14 w-12 md:w-14 rounded-2xl shadow-2xl bg-white/90 backdrop-blur-md border-2 border-slate-100 transition-all active:scale-95">
                                <Settings className="h-6 w-6 text-slate-600" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent side="bottom" align="end" className="w-80 p-6 rounded-3xl shadow-xl bg-white/95 backdrop-blur-md text-sm">
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 border-b pb-3"><Sliders className="h-4 w-4 text-primary" /><h4 className="font-black uppercase text-xs">Instellingen</h4></div>
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase text-slate-400">Kijkhoogte</Label><span className="text-[10px] font-bold text-primary">{Math.round(navOffset)}px</span></div>
                                        <Slider value={[navOffset]} min={0} max={600} step={10} onValueChange={([val]) => updateNavOffset(val)} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase text-slate-400">Kanteling</Label><span className="text-[10px] font-bold text-primary">{Math.round(navPitch)}°</span></div>
                                        <Slider value={[navPitch]} min={0} max={85} step={1} onValueChange={([val]) => updateNavPitch(val)} />
                                    </div>
                                    <Separator className="bg-slate-100" />
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-[10px] font-black uppercase text-slate-900">Auto-open bij aankomst</Label>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">Opent werkbon na 10s stilstand</p>
                                        </div>
                                        <Switch checked={autoOpenEnabled} onCheckedChange={setAutoOpenEnabled} />
                                    </div>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
                {navigationState === 'setup' ? (
                    <div className="flex gap-2 pointer-events-auto">
                        {isPrivileged && (
                          <Button 
                            variant="outline" 
                            className="h-12 md:h-14 px-4 md:px-8 font-black uppercase bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-slate-100 transition-all active:scale-95" 
                            onClick={() => handleStartRit(true)}
                            title="Simulator"
                          >
                            <Gauge className="h-6 w-6 md:mr-3" /> 
                            <span className="hidden md:inline text-sm">SIMULATOR</span>
                          </Button>
                        )}
                        <Button 
                          className="h-12 md:h-14 px-5 md:px-10 font-black uppercase bg-orange-600 text-white hover:bg-orange-700 shadow-2xl rounded-2xl transition-all active:scale-95" 
                          onClick={() => handleStartRit(false)}
                          title="Start Rit"
                        >
                            {isLocating ? <Loader2 className="h-6 w-6 md:mr-3 animate-spin" /> : <Play className="h-6 w-6 md:mr-3 fill-current" />} 
                            <span className="hidden md:inline text-sm">START RIT</span>
                        </Button>
                    </div>
                ) : (
                    <Button 
                      variant="destructive" 
                      className="h-12 md:h-14 px-5 md:px-10 font-black uppercase rounded-2xl shadow-2xl transition-all active:scale-95" 
                      onClick={handleStopRit}>
                      <span className="hidden md:inline">STOP RIT</span>
                      <span className="md:hidden">STOP</span>
                    </Button>
                )}
            </div>
        </div>

        {navigationState === 'navigating' && !activeWerkbonId && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-[95%] max-w-2xl animate-in slide-in-from-bottom-10 duration-700 pointer-events-none">
                <div className="mb-4 flex justify-start items-center gap-3 pointer-events-auto">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-[4px] sm:border-[6px] border-primary flex flex-col items-center justify-center bg-white/95 backdrop-blur-md shadow-2xl shrink-0">
                        <span className="text-xl sm:text-3xl font-black text-slate-900 leading-none">{speedKmh}</span>
                        <span className="text-[8px] sm:text-[10px] font-black uppercase text-primary">km/h</span>
                    </div>
                    {/* Live Speed Limit Sign */}
                    <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border-[4px] border-red-600 flex items-center justify-center bg-white shadow-2xl shrink-0 animate-in fade-in zoom-in duration-500">
                        <span className="text-lg sm:text-xl font-black text-slate-900">{currentSpeedLimit}</span>
                    </div>
                </div>

                <Card className="bg-white/95 backdrop-blur-xl shadow-2xl border-2 border-slate-100 rounded-[2rem] overflow-hidden pointer-events-auto transition-all duration-300">
                    <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col gap-3 min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-4">
                                <div className="space-y-0.5 min-w-0 flex-1">
                                    <p className="text-[8px] font-black uppercase text-slate-500">Intakenummer</p>
                                    <p className="text-sm sm:text-lg font-black text-slate-900 uppercase truncate tracking-tight">{nextMission?.intakenummer || 'Geen doel'}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {nextMission?.containernummer && (
                                        <Badge variant="secondary" className="text-[10px] h-6 font-black uppercase bg-yellow-400 text-slate-900 border-2 border-white shadow-sm px-2">
                                            {nextMission.containernummer}
                                        </Badge>
                                    )}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 rounded-full hover:bg-slate-100 transition-colors pointer-events-auto"
                                        onClick={() => setIsCockpitExpanded(!isCockpitExpanded)}
                                    >
                                        {isCockpitExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                            
                            <div className="space-y-0.5 min-w-0">
                                <p className="text-[10px] font-black text-slate-800 truncate">
                                    {nextMission?.straatnaam} {nextMission?.huisnummer}
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate">
                                    {nextMission?.postcode} {nextMission?.plaats}
                                </p>
                            </div>

                            {isCockpitExpanded && (
                                <div className="pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Melding omschrijving</p>
                                    <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">
                                        "{nextMission?.extra_informatie || 'Geen omschrijving beschikbaar.'}"
                                    </p>
                                </div>
                            )}
                            
                            <Progress value={100} className="h-1 bg-slate-100 mt-1" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        )}

        <div 
            className={cn(
                "absolute bottom-0 left-0 right-0 z-40 bg-white border-t-4 border-slate-900 flex flex-col overflow-hidden shadow-2xl h-[244px]",
                "transition-all duration-500",
                navigationState === 'navigating' ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
            )}
        >
            <div className="h-12 flex items-center justify-between px-4 sm:px-6 cursor-default shrink-0 border-b bg-slate-50">
                <div className="flex items-center justify-between flex-1 pointer-events-auto" onClick={e => e.stopPropagation()}>
                    <div className="relative w-40 sm:w-64 shrink-0">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input placeholder="Zoeken..." className="h-8 pl-8 text-[10px] font-bold rounded-xl border-slate-200 bg-white focus:ring-primary/20" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar ml-auto">
                        <Button variant={showTodayCompleted ? "default" : "outline"} size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200" onClick={() => setShowTodayCompleted(!showTodayCompleted)}>
                            <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{showTodayCompleted ? "Verberg Klaar" : "Vandaag Afgemeld"}</span>
                        </Button>
                        <Button variant={showAssignmentBubbles ? "default" : "outline"} size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200" onClick={() => setShowAssignmentBubbles(!showAssignmentBubbles)}>
                            <User className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{showAssignmentBubbles ? "Verberg Beheerder" : "Toegewezen"}</span>
                        </Button>
                        
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200 gap-2"><Layout className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Kolommen</span></Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-56 p-4 rounded-2xl shadow-xl border-slate-100 bg-white/95 backdrop-blur-md">
                                <div className="space-y-4">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b pb-2">Weergaveinstellingen</p>
                                    <div className="space-y-2">
                                        {Object.keys(ROUTE_COLUMNS_CONFIG).map(colId => (
                                            <div key={colId} className="flex items-center space-x-3 p-1">
                                                <Checkbox id={`col-${colId}`} checked={visibleColumns[colId] ?? true} onCheckedChange={() => toggleColumnVisibility(colId)} className="rounded-md" />
                                                <Label htmlFor={`col-${colId}`} className="text-xs font-bold uppercase tracking-tight text-slate-700 cursor-pointer">{ROUTE_COLUMN_LABELS_CONFIG[colId]}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>
            
            <ScrollArea className="flex-1 bg-white">
                {isMobile ? (
                    <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filteredMeldingen.map(m => {
                            const isCompleted = m.status === 'Afgerond';
                            return (
                                <div 
                                    key={m.id} 
                                    className={cn(
                                        "p-3 rounded-xl border-2 transition-all flex flex-col gap-1",
                                        isCompleted ? "bg-green-50/50 border-green-100 opacity-60" : "bg-white border-slate-100 active:scale-[0.98]"
                                    )}
                                    onClick={() => handleMeldingClick(m)}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", isCompleted ? "bg-green-500" : getMeldingAgeColor(m.datum))} />
                                            <span className="font-black text-[10px] uppercase text-slate-900 truncate">{m.intakenummer}</span>
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-400 truncate ml-2">{m.werkgebied || '-'}</span>
                                    </div>
                                    <p className="font-bold text-[11px] text-slate-900 truncate">{m.straatnaam} {m.huisnummer}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-black uppercase text-primary truncate max-w-[70%]">{m.subcategorie}</span>
                                        {isCompleted && <Check className="h-3 w-3 text-green-600" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <Table className="min-w-[1200px] border-collapse border-slate-200 text-[10px]">
                        <TableHeader className="bg-slate-100 sticky top-0 z-10 border-b-2 border-slate-300">
                            <TableRow className="h-8 hover:bg-transparent">
                                {visibleColumns.intakenummer && <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r border-slate-200 px-2 h-8">Nr.</TableHead>}
                                {visibleColumns.locatie && <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r border-slate-200 px-2 h-8">Locatie</TableHead>}
                                {visibleColumns.memo && <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r border-slate-200 px-2 h-8">Omschrijving</TableHead>}
                                {visibleColumns.hoofdcategorie && <TableHead className="font-black uppercase text-slate-400 border-r border-slate-100 px-2 h-8">Hoofdtype</TableHead>}
                                {visibleColumns.subcategorie && <TableHead className="font-black uppercase text-slate-500 border-r border-slate-200 px-2 h-8">Subtype</TableHead>}
                                {visibleColumns.werkgebied && <TableHead className="font-black uppercase text-primary border-r border-slate-100 px-2 h-8">Gebied</TableHead>}
                                {visibleColumns.afstand && <TableHead className="text-right font-black uppercase text-[9px] text-slate-500 px-2 h-8">Dist (km)</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMeldingen.map(m => {
                                const base = userLocation || SIMULATION_START_LOCATION;
                                const dist = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([m.longitude, m.latitude])).toFixed(1);
                                const isCompleted = m.status === 'Afgerond';
                                return (
                                    <TableRow key={m.id} className={cn("h-8 transition-colors cursor-pointer border-b border-slate-100", isCompleted ? "bg-green-50/50 opacity-60" : "hover:bg-blue-50")} onClick={() => handleMeldingClick(m)}>
                                        {visibleColumns.intakenummer && (
                                            <TableCell className="font-black text-[10px] border-r border-slate-100 px-2 py-1">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("h-1.5 w-1.5 rounded-full", isCompleted ? "bg-green-500" : getMeldingAgeColor(m.datum))} />
                                                    {m.intakenummer}
                                                </div>
                                            </TableCell>
                                        )}
                                        {visibleColumns.locatie && <TableCell className="font-bold border-r border-slate-100 px-2 py-1 truncate max-w-[200px]">{m.straatnaam} {m.huisnummer}</TableCell>}
                                        {visibleColumns.memo && <TableCell className="font-medium italic text-slate-500 border-r border-slate-100 px-2 py-1 truncate max-w-[350px]">"{m.extra_informatie || '-'}"</TableCell>}
                                        {visibleColumns.hoofdcategorie && <TableCell className="font-black uppercase text-slate-400 border-r border-slate-100 px-2 py-1">{m.hoofdcategorie}</TableCell>}
                                        {visibleColumns.subcategorie && <TableCell className="font-bold border-r border-slate-100 px-2 py-1 truncate max-w-[150px]">{m.subcategorie}</TableCell>}
                                        {visibleColumns.werkgebied && <TableCell className="font-black uppercase text-primary border-r border-slate-100 px-2 py-1">{m.werkgebied || m.wijk || '-'}</TableCell>}
                                        {visibleColumns.afstand && <TableCell className="text-right font-black text-primary px-2 py-1">{dist}</TableCell>}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </ScrollArea>
        </div>

        {activeWerkbonId && (
            <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in duration-300">
                <IntegratedWerkbonOverlay 
                    meldingId={activeWerkbonId} 
                    onClose={() => setActiveWerkbonId(null)} 
                    onCompleted={(id) => {
                        setCompletedObjects(prev => [...prev, id]);
                        setActiveWerkbonId(null);
                        setCurrentRouteGeometry(null); 
                        setDisplayedRouteGeometry(null);
                        setRouteInfo(null);
                        setTimeout(() => fetchRoute(true), 100);
                    }} 
                />
            </div>
        )}
    </div>
  );
}

const getMeldingAgeColor = (datum?: string) => {
    if (!datum) return 'bg-slate-400';
    try {
        const d = new Date(datum);
        const diffDays = Math.abs(differenceInCalendarDays(new Date(), d));
        if (diffDays <= 1) return 'bg-slate-400'; 
        if (diffDays === 2) return 'bg-yellow-400'; 
        if (diffDays === 3) return 'bg-orange-500'; 
        return 'bg-red-600'; 
    } catch (e) { return 'bg-slate-400'; }
};
