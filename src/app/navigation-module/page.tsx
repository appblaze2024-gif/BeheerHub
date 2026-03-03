'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef } from 'react-map-gl';
import { useCollection, useFirestore, useUser, useMemoFirebase, updateDocumentNonBlocking, useFirebaseApp, useDoc } from '@/firebase';
import { collection, doc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
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
  Bell,
  LocateFixed,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  Sparkles,
  Trash2,
  EyeOff,
  User,
  Package,
  Paperclip,
  ChevronRight,
  Plus,
  Minus,
  Settings,
  Sliders,
  Table as TableIcon,
  AlertCircle,
  RefreshCw,
  Layout,
  Zap,
  ImageIcon
} from 'lucide-react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Object as MapObject, Melding, UploadedFile, Hoeveelheid, UserProfile, Project } from '@/lib/types';
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
import { MapboxView } from '@/components/mapbox-view';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';
const SIMULATION_START_LOCATION = { latitude: 52.2644, longitude: 4.7242 };

const DEFAULT_COLUMNS = {
    intakenummer: true,
    locatie: true,
    memo: true,
    hoofdcategorie: true,
    subcategorie: true,
    werkgebied: true,
    afstand: true
};

const COLUMN_LABELS: Record<string, string> = {
    intakenummer: 'Nummer',
    locatie: 'Locatie (Adres)',
    memo: 'Omschrijving',
    hoofdcategorie: 'Hoofdtype',
    subcategorie: 'Subtype',
    werkgebied: 'Werkgebied',
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

    const handleSaveQuickKey = async () => {
        if (!user || !firestore || !afhandelingBijzonderheden.trim()) return;
        const currentKeys = profile?.quickKeys || [];
        if (currentKeys.includes(afhandelingBijzonderheden.trim())) {
            toast({ title: "Bestaat al", description: "Deze tekst is al opgeslagen als sneltoets." });
            return;
        }
        const updatedKeys = [afhandelingBijzonderheden.trim(), ...currentKeys].slice(0, 15);
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { quickKeys: updatedKeys });
        toast({ title: "Sneltoets opgeslagen", description: "Tekst is toegevoegd aan uw collectie." });
    };

    const handleDeleteQuickKey = (key: string) => {
        if (!user || !firestore) return;
        const updatedKeys = (profile?.quickKeys || []).filter(k => k !== key);
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { quickKeys: updatedKeys });
    };

    const handleUseQuickKey = (key: string) => {
        setAfhandelingBijzonderheden(prev => prev + (prev ? ' ' : '') + key);
    };

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
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitRecognition;
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

    if (isLoading || !melding) return <div className="p-12 flex justify-center h-full items-center"><Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" /></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <header className="h-14 lg:h-16 bg-white border-b flex items-center justify-between px-4 lg:px-6 shrink-0 shadow-sm z-10 sticky top-0">
                <div className="flex items-center gap-3 lg:gap-4">
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-10 w-10 hover:bg-slate-200 transition-colors">
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                                <Card className="rounded-xl lg:rounded-2xl bg-white shadow-xl border-none flex flex-col overflow-hidden">
                                    <CardHeader className="bg-slate-50 text-white p-4 lg:p-5 shrink-0">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-0.5 lg:space-y-1">
                                                <p className="text-[8px] lg:text-[9px] font-black uppercase tracking-widest text-blue-200">Intakenummer</p>
                                                <CardTitle className="text-lg lg:text-xl font-black uppercase tracking-tight">{melding.intakenummer}</CardTitle>
                                            </div>
                                            <Badge className="bg-blue-500 text-white border-none font-black text-[8px] lg:text-[9px] h-4 lg:h-5 px-2 lg:px-2.5">{melding.status}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 lg:p-6 space-y-4 lg:space-y-6">
                                        <div className="grid grid-cols-2 gap-x-4 lg:gap-x-6 gap-y-3 lg:gap-y-4">
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
                                        <div className="space-y-1.5 lg:space-y-2 border-t pt-4">
                                            <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Oorspronkelijke melding</p>
                                            <p className="text-[10px] lg:text-xs italic text-slate-600 font-medium leading-relaxed">"{melding.extra_informatie || 'Geen omschrijving.'}"</p>
                                        </div>
                                    </CardContent>
                                </Card>
                                <div className="rounded-xl lg:rounded-2xl overflow-hidden border-2 border-white shadow-2xl min-h-[300px] lg:min-h-[400px]">
                                    <MapboxView latitude={melding.latitude} longitude={melding.longitude} mainLocationLabel={melding.containernummer} interactive={false} objects={nearbyObjects} />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="Opmerkingen" className="mt-0 h-full space-y-6">
                            <Card className="rounded-xl lg:rounded-2xl border-none shadow-xl bg-white overflow-hidden shrink-0">
                                <CardHeader className="bg-slate-50 border-b p-4 lg:p-5 flex flex-row items-center justify-between">
                                    <CardTitle className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400">Uitvoeringsnotities & Sneltoetsen</CardTitle>
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
                                <CardContent className="p-4 lg:p-6 space-y-4">
                                    <Textarea 
                                        placeholder="Voer hier je bevindingen in..." 
                                        className="resize-none text-[11px] lg:text-sm font-medium leading-relaxed rounded-xl border-slate-100 bg-slate-50 focus:ring-primary/20 min-h-[120px]"
                                        value={afhandelingBijzonderheden}
                                        onChange={(e) => setAfhandelingBijzonderheden(e.target.value)}
                                    />
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between border-b pb-2">
                                            <div className="flex items-center gap-2">
                                                <Zap className="h-3.5 w-3.5 text-primary" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sneltoetsen</span>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-7 px-3 text-[9px] font-black uppercase tracking-tight rounded-lg border-slate-200" onClick={handleSaveQuickKey} disabled={!afhandelingBijzonderheden.trim()}>
                                                <Plus className="h-3.5 w-3.5 mr-1.5" /> Opslaan
                                            </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {profile?.quickKeys?.map((key, i) => (
                                                <div key={i} className="group relative flex items-center">
                                                    <Button variant="secondary" size="sm" className="h-8 px-3 rounded-xl font-bold text-[10px] bg-slate-100 border border-slate-200 shadow-sm hover:border-primary/30 transition-all truncate max-w-[150px]" onClick={() => handleUseQuickKey(key)}>{key}</Button>
                                                    <button className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" onClick={(e) => { e.stopPropagation(); handleDeleteQuickKey(key); }}><X className="h-2 w-2" /></button>
                                                </div>
                                            ))}
                                            {(!profile?.quickKeys || profile.quickKeys.length === 0) && (
                                                <p className="text-[9px] font-bold text-slate-300 italic uppercase">Geen sneltoetsen.</p>
                                            )}
                                        </div>
                                    </div>
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
                                            {(!melding.fotos || melding.fotos.length === 0) && (<div className="col-span-3 py-12 text-center opacity-20"><Camera className="h-10 w-10 mx-auto mb-2" /><p className="text-[10px] font-black uppercase tracking-widest">Geen bronfoto's</p></div>)}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-xl lg:rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                                    <CardHeader className="bg-slate-50 border-b p-4 lg:p-6 flex flex-row items-center justify-between">
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
                                        <div className="space-y-1"><Label className="text-[8px] lg:text-[9px] font-black uppercase text-slate-400 ml-1">Materiaal</Label><Input placeholder="Bv. Zand..." className="h-9 lg:h-11 font-bold rounded-lg lg:rounded-xl text-xs lg:text-sm" value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} /></div>
                                        <div className="space-y-1"><Label className="text-[8px] lg:text-[9px] font-black uppercase text-slate-400 ml-1">Aantal</Label><Input placeholder="0" type="number" className="h-9 lg:h-11 font-bold rounded-lg lg:rounded-xl text-xs lg:text-sm" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} /></div>
                                        <div className="flex items-end"><Button className="h-9 lg:h-11 w-full font-black uppercase tracking-tight rounded-lg lg:rounded-xl shadow-lg shadow-primary/20 text-[10px] lg:text-xs" onClick={() => { if(newHoeveelheidType && newHoeveelheidAantal) { setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); setNewHoeveelheidType(''); setNewHoeveelheidAantal(''); } }}>Toevoegen</Button></div>
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
  const { toast } = useToast();
  const { setIsHeaderVisible } = useNavigationUI();
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
  const [isListExpanded, setIsListExpanded] = React.useState(true);
  const [isManualMode, setIsManualMode] = React.useState(false);

  const [listHeight, setListHeight] = React.useState(400);
  const [isResizing, setIsResizing] = React.useState(false);

  const [showTodayCompleted, setShowTodayCompleted] = React.useState(false);
  const [showAssignmentBubbles, setShowAssignmentBubbles] = React.useState(false);
  const [visibleColumns, setVisibleColumns] = React.useState<Record<string, boolean>>(DEFAULT_COLUMNS);

  const navZoomRef = React.useRef(18);
  const [navZoom, setNavZoomState] = React.useState(18);
  const navPitchRef = React.useRef(60);
  const [navPitch, setNavPitchState] = React.useState(60);
  const navOffsetRef = React.useRef(450);
  const [navOffset, setNavOffsetState] = React.useState(450);

  const [smoothLocation, setSmoothLocation] = React.useState<any>({ ...SIMULATION_START_LOCATION, heading: 0 });
  const lastHeadingRef = React.useRef(0);
  const [currentRouteGeometry, setCurrentRouteGeometry] = React.useState<any>(null);
  const [displayedRouteGeometry, setDisplayedRouteGeometry] = React.useState<any>(null);
  const [speedKmh, setSpeedKmh] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);

  const mapRef = React.useRef<MapRef>(null);
  const simAnimationRef = React.useRef<number | null>(null);
  const simStateRef = React.useRef({ distanceTravelled: 0, currentSpeedMs: 0 });

  React.useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  React.useEffect(() => {
    if (profile) {
        if (profile.navZoom !== undefined) {
            const val = Number(profile.navZoom);
            if (!isNaN(val)) {
                setNavZoomState(val);
                navZoomRef.current = val;
            }
        }
        if (profile.navPitch !== undefined) {
            const val = Number(profile.navPitch);
            if (!isNaN(val)) {
                setNavPitchState(val);
                navPitchRef.current = val;
            }
        }
        if (profile.navOffset !== undefined) {
            const val = Number(profile.navOffset);
            if (!isNaN(val)) {
                setNavOffsetState(val);
                navOffsetRef.current = val;
            }
        }
        if (profile.navListHeight !== undefined) {
            const val = Number(profile.navListHeight);
            if (!isNaN(val)) {
                setListHeight(val);
            }
        }
        if (profile.navColumns) {
            setVisibleColumns(profile.navColumns);
        }
    }
  }, [profile]);

  const handleResize = (clientY: number) => {
    const newHeight = window.innerHeight - clientY;
    const clampedHeight = Math.max(56, Math.min(newHeight, window.innerHeight * 0.85));
    setListHeight(clampedHeight);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const onMouseMove = (moveEvent: MouseEvent) => {
      handleResize(moveEvent.clientY);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setIsResizing(false);
      if (user && firestore) {
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { navListHeight: listHeight });
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setIsResizing(true);
    const onTouchMove = (moveEvent: TouchEvent) => {
      handleResize(moveEvent.touches[0].clientY);
    };
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      setIsResizing(false);
      if (user && firestore) {
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { navListHeight: listHeight });
      }
    };
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  };

  const updateNavZoom = (newZoom: number) => {
    const val = Number(newZoom);
    if (isNaN(val)) return;
    setNavZoomState(val);
    navZoomRef.current = val;
    if (user && firestore) updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { navZoom: val });
    mapRef.current?.getMap().jumpTo({ zoom: val });
  };

  const updateNavPitch = (newPitch: number) => {
    const val = Number(newPitch);
    if (isNaN(val)) return;
    setNavPitchState(val);
    navPitchRef.current = val;
    if (user && firestore) updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { navPitch: val });
    mapRef.current?.getMap().jumpTo({ pitch: val });
  };

  const updateNavOffset = (newOffset: number) => {
    const val = Number(newOffset);
    if (isNaN(val)) return;
    setNavOffsetState(val);
    navOffsetRef.current = val;
    if (user && firestore) updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { navOffset: val });
    mapRef.current?.getMap().jumpTo({ padding: { top: 0, bottom: Math.max(0, val), left: 0, right: 0 } });
  };

  const toggleColumnVisibility = (colId: string) => {
    const next = { ...visibleColumns, [colId]: !visibleColumns[colId] };
    setVisibleColumns(next);
    if (user && firestore) {
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { navColumns: next });
    }
  };

  React.useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setUserLocation(loc);
            
            if (!isSimulationMode) {
                const heading = pos.coords.heading !== null ? pos.coords.heading : lastHeadingRef.current;
                lastHeadingRef.current = heading;
                setSmoothLocation({ ...loc, heading: heading });
                if (pos.coords.speed !== null) setSpeedKmh(Math.round(pos.coords.speed * 3.6));

                if (navigationState === 'navigating' && mapRef.current && !isManualMode) {
                    const map = mapRef.current.getMap();
                    map.jumpTo({
                        center: [loc.longitude, loc.latitude],
                        bearing: heading,
                        zoom: Number(navZoomRef.current) || 18,
                        pitch: Number(navPitchRef.current) || 60,
                        padding: { top: 0, bottom: Math.max(0, Number(navOffsetRef.current) || 0), left: 0, right: 0 }
                    });

                    if (currentRouteGeometry) {
                        try {
                            const line = turf.lineString(currentRouteGeometry.coordinates);
                            const currPt = turf.nearestPointOnLine(line, turf.point([loc.longitude, loc.latitude]));
                            const forwardPart = turf.lineSlice(currPt, turf.point(currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1]), line);
                            setDisplayedRouteGeometry(forwardPart);
                        } catch (e) { }
                    }
                }
            }
        },
        (err) => console.error("WatchPosition error:", err),
        { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigationState, isSimulationMode, currentRouteGeometry, isManualMode]);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw']));
  }, [firestore]);

  const { data: rawMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenQuery);

  const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
  const completedTodayQuery = useMemoFirebase(() => {
      if (!firestore) return null;
      return query(
          collection(firestore, 'meldingen'),
          where('status', '==', 'Afgerond'),
          where('afhandeling_datum', '==', todayStr)
      );
  }, [firestore, todayStr]);
  const { data: rawCompletedToday } = useCollection<Melding>(completedTodayQuery);

  const filteredMeldingen = React.useMemo(() => {
    if (!rawMeldingen) return [];
    let pool = [...rawMeldingen].filter(m => !completedObjects.includes(m.id));
    if (showTodayCompleted && rawCompletedToday) {
        pool = [...pool, ...rawCompletedToday];
    }
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
    const base = smoothLocation || userLocation || SIMULATION_START_LOCATION;
    return [...filteredMeldingen]
        .filter(m => m.status !== 'Afgerond')
        .sort((a, b) => {
            const distA = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([a.longitude, a.latitude]));
            const distB = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([b.longitude, b.latitude]));
            return distA - distB;
        });
  }, [filteredMeldingen, userLocation, smoothLocation]);

  const fetchRoute = React.useCallback(async (zoomToFit = false) => {
    if (sortedMissions.length === 0) {
        setCurrentRouteGeometry(null);
        setDisplayedRouteGeometry(null);
        return;
    }
    const startPos = (navigationState === 'navigating' ? smoothLocation : (userLocation || SIMULATION_START_LOCATION));
    const waypoints = [[startPos.longitude, startPos.latitude], ...sortedMissions.slice(0, 24).map(m => [m.longitude, m.latitude])];
    const waypointsStr = waypoints.map(w => w.join(',')).join(';');
    
    // Explicitly requesting fastest route
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypointsStr}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]) {
            const geometry = data.routes[0].geometry;
            setCurrentRouteGeometry(geometry);
            setDisplayedRouteGeometry(turf.feature(geometry));
            if (zoomToFit && mapRef.current) {
                const line = turf.lineString(geometry.coordinates);
                const bbox = turf.bbox(line);
                if (bbox[0] !== Infinity) {
                    mapRef.current.getMap().fitBounds(bbox as [number, number, number, number], { 
                        padding: 250, 
                        duration: 0 
                    });
                }
            }
        }
    } catch (e) { console.error("Route error:", e); }
  }, [sortedMissions, userLocation, navigationState, smoothLocation]);

  React.useEffect(() => {
    if (sortedMissions.length > 0) {
        fetchRoute(navigationState === 'setup');
    } else if (rawMeldingen && sortedMissions.length === 0) {
        setCurrentRouteGeometry(null);
        setDisplayedRouteGeometry(null);
    }
  }, [sortedMissions, navigationState, fetchRoute, rawMeldingen]);

  const handleStartRit = (simulate = false) => {
    if (sortedMissions.length === 0) return;
    if (!simulate) {
        setIsLocating(true);
        
        const beginNavigation = (loc: { latitude: number, longitude: number }, heading: number) => {
            setSmoothLocation({ ...loc, heading });
            setIsSimulationMode(false);
            setNavigationState('navigating');
            setIsListExpanded(false);
            setIsLocating(false);
            setIsManualMode(false);
            
            // Instant jump for iPad
            mapRef.current?.getMap().jumpTo({ 
                center: [loc.longitude, loc.latitude], 
                zoom: Number(navZoomRef.current) || 18, 
                pitch: Number(navPitchRef.current) || 60, 
                bearing: heading, 
                padding: { top: 0, bottom: Math.max(0, Number(navOffsetRef.current) || 0), left: 0, right: 0 }
            });
            fetchRoute();
        };

        if (userLocation) {
            beginNavigation(userLocation, lastHeadingRef.current || 0);
        } else {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                    setUserLocation(loc);
                    beginNavigation(loc, pos.coords.heading || 0);
                },
                (err) => {
                    console.error("Initial location failed, using default:", err);
                    beginNavigation(SIMULATION_START_LOCATION, 0);
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    } else {
        setIsStartingSimulation(true);
        setIsSimulationMode(true);
        setNavigationState('navigating');
        setIsListExpanded(false);
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
        if (isPaused || activeWerkbonId) { 
            simAnimationRef.current = requestAnimationFrame(animate); 
            return; 
        }
        
        const speedMs = 13.8;
        simStateRef.current.distanceTravelled += speedMs * 0.016;
        
        if (simStateRef.current.distanceTravelled >= totalDist) {
            setSpeedKmh(0);
            return;
        }
        
        const curr = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
        const [lng, lat] = curr.geometry.coordinates;
        
        const aheadDist = Math.min(simStateRef.current.distanceTravelled + 2, totalDist);
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
                pitch: Number(navPitchRef.current) || 60,
                zoom: Number(navZoomRef.current) || 18,
                padding: { top: 0, bottom: Math.max(0, Number(navOffsetRef.current) || 0), left: 0, right: 0 }
            });
        }
        simAnimationRef.current = requestAnimationFrame(animate);
    };
    simAnimationRef.current = requestAnimationFrame(animate);
  };

  const nextMission = sortedMissions[0];
  const distToNextKm = nextMission ? turf.distance(
      turf.point([smoothLocation.longitude, smoothLocation.latitude]),
      turf.point([nextMission.longitude, nextMission.latitude]),
      { units: 'kilometers' }
  ) : 0;
  const etaSeconds = (distToNextKm * 1000) / 13.8;

  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
        {isLocating && <LoadingScreen message="Huidige locatie bepalen..." className="fixed inset-0 z-[1000]" />}
        {isStartingSimulation && <LoadingScreen message="Simulator voorbereiden..." className="fixed inset-0 z-[1000]" />}
        
        <div className="absolute inset-0 z-0">
            <MapGL 
                ref={mapRef} 
                initialViewState={{ longitude: SIMULATION_START_LOCATION.longitude, latitude: SIMULATION_START_LOCATION.latitude, zoom: 13 }} 
                style={{ width: '100%', height: '100%' }} 
                mapStyle={mapStyle} 
                mapboxAccessToken={MAPBOX_TOKEN}
                touchZoomRotate={true}
                onInteractionStateChange={(state) => {
                    if (state.isDragging || state.isZooming || state.isRotating) {
                        setIsManualMode(true);
                    }
                }}
                onMoveStart={() => setIsManualMode(true)}
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
                    <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center" onClick={() => setActiveWerkbonId(m.id)}>
                        <div className="relative flex items-center justify-center w-14 h-14">
                            {nextMission?.id === m.id && (
                                <div className="absolute inset-0 rounded-full border-[4px] border-slate-900 animate-pulse opacity-80" />
                            )}
                            {showAssignmentBubbles && (
                                <div className="absolute bottom-full mb-3 bg-white/90 backdrop-blur-sm text-slate-900 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tighter shadow-xl border border-slate-200 whitespace-nowrap animate-in zoom-in-95 duration-200">
                                    {m.behandelaar || '??'}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-white/90" />
                                </div>
                            )}
                            <div className={cn(
                                "w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center transition-transform hover:scale-110 cursor-pointer z-10", 
                                m.status === 'Afgerond' ? 'bg-green-500' : getMeldingAgeColor(m.datum)
                            )}>
                                {m.status === 'Afgerond' ? <Check className="h-4 w-4 text-white" /> : <Bell className="h-4 w-4 text-white" />}
                            </div>
                        </div>
                    </Marker>
                ))}
                <Source id="route-line" type="geojson" data={displayedRouteGeometry || { type: 'FeatureCollection', features: [] }}>
                    <Layer {...routeLayerCasing} />
                    <Layer {...routeLayer} />
                </Source>
            </MapGL>
        </div>

        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between pointer-events-none">
            <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border border-slate-100 pointer-events-auto" onClick={() => router.push('/')}>
                <ArrowLeft className="h-6 w-6 text-slate-600" />
            </Button>
            <div className="flex items-center gap-3 pointer-events-auto">
                {navigationState === 'setup' ? (
                    <div className="flex gap-2">
                        {isPrivileged && <Button variant="outline" className="h-12 px-6 font-black uppercase bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100" onClick={() => handleStartRit(true)}><Gauge className="mr-2 h-5 w-5" /> SIMULATOR</Button>}
                        <Button className="h-12 px-8 font-black uppercase bg-orange-600 text-white hover:bg-orange-700 shadow-2xl rounded-2xl" onClick={() => handleStartRit(false)}>
                            {isLocating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5 fill-current" />} START RIT
                        </Button>
                    </div>
                ) : (
                    <Button variant="destructive" className="h-12 px-8 font-black uppercase rounded-2xl shadow-2xl" onClick={() => { 
                        setNavigationState('setup'); 
                        setIsListExpanded(true); 
                        if(simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current); 
                        mapRef.current?.getMap().jumpTo({ pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
                        fetchRoute(true); 
                    }}>STOP RIT</Button>
                )}
            </div>
        </div>

        {navigationState === 'navigating' && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 pointer-events-auto">
                <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border border-slate-100" onClick={() => updateNavZoom(Math.min(navZoom + 0.5, 22))}>
                    <Plus className="h-6 w-6 text-slate-600" />
                </Button>
                <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border border-slate-100" onClick={() => updateNavZoom(Math.max(navZoom - 0.5, 10))}>
                    <Minus className="h-6 w-6 text-slate-600" />
                </Button>
                
                {isManualMode && (
                    <Button 
                        variant="default" 
                        size="icon" 
                        className="h-14 w-14 rounded-full shadow-2xl bg-primary text-white mt-2 animate-bounce border-4 border-white flex items-center justify-center pointer-events-auto" 
                        onClick={() => {
                            setIsManualMode(false);
                            if (mapRef.current && smoothLocation) {
                                const map = mapRef.current.getMap();
                                map.jumpTo({
                                    center: [smoothLocation.longitude, smoothLocation.latitude],
                                    zoom: Number(navZoomRef.current) || 18,
                                    pitch: Number(navPitchRef.current) || 60,
                                    bearing: smoothLocation.heading || 0,
                                    padding: { top: 0, bottom: Math.max(0, Number(navOffsetRef.current) || 0), left: 0, right: 0 }
                                });
                            }
                        }}
                        title="Hervat navigatie (Zoom & Graden)"
                    >
                        <Navigation className="h-7 w-7 fill-current" />
                    </Button>
                )}

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border border-slate-100 mt-2"><Settings className="h-6 w-6 text-slate-600" /></Button>
                    </PopoverTrigger>
                    <PopoverContent side="left" className="w-80 p-6 rounded-3xl shadow-2xl bg-white/95 backdrop-blur-md">
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 border-b pb-3"><Sliders className="h-4 w-4 text-primary" /><h4 className="font-black uppercase text-xs">Instellingen</h4></div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase text-slate-400">Kijkhoogte</Label><span className="text-[10px] font-bold text-primary">{Math.round(navOffset)}px</span></div>
                                    <Slider value={[navOffset]} min={0} max={600} step={10} onValueChange={([val]) => updateNavOffset(val)} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase text-slate-400">Kanteling</Label><span className="text-[10px] font-bold text-primary">{Math.round(navPitch)}°</span></div>
                                    <Slider value={[navPitch]} min={0} max={85} step={1} onValueChange={([val]) => updateNavPitch(val)} />
                                </div>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        )}

        {navigationState === 'navigating' && !activeWerkbonId && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-[95%] max-w-xl animate-in slide-in-from-bottom-10 duration-700 pointer-events-none">
                <Card className="bg-white/95 backdrop-blur-xl shadow-2xl border-2 border-slate-100 rounded-[2rem] overflow-hidden pointer-events-auto">
                    <CardContent className="p-6 flex items-center justify-between gap-8">
                        <div className="flex flex-col items-center shrink-0 border-r border-slate-100 pr-8">
                            <p className="text-4xl font-black text-slate-900">{formatDate(addSeconds(new Date(), etaSeconds), 'HH:mm')}</p>
                            <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">aankomst</p>
                            <div className="mt-2 px-3 py-0.5 bg-primary/10 rounded-full">
                                <p className="text-[10px] font-black text-primary">{distToNextKm.toFixed(1)} km</p>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col gap-3 min-w-0">
                            <div className="space-y-0.5">
                                <p className="text-[9px] font-black uppercase text-slate-500">Volgende Bestemming</p>
                                <p className="text-lg font-black text-slate-900 uppercase truncate">{nextMission?.intakenummer || 'Geen doel'}</p>
                            </div>
                            <Progress value={100} className="h-2 bg-slate-100" />
                        </div>
                        <div className="h-20 w-20 rounded-full border-[6px] border-primary flex flex-col items-center justify-center bg-slate-50 shrink-0">
                            <span className="text-3xl font-black text-slate-900">{speedKmh}</span>
                            <span className="text-[8px] font-black uppercase text-primary">km/h</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )}

        <div 
            className={cn(
                "absolute bottom-0 left-0 right-0 z-40 bg-white border-t-4 border-slate-900 flex flex-col overflow-hidden shadow-2xl",
                !isResizing && "transition-all duration-500",
                navigationState === 'navigating' ? "h-0 translate-y-full opacity-0" : (isListExpanded ? "" : "h-14 translate-y-[calc(100%-3.5rem)]")
            )}
            style={navigationState !== 'navigating' && isListExpanded ? { height: `${listHeight}px` } : {}}
        >
            {navigationState !== 'navigating' && isListExpanded && (
                <div 
                    onMouseDown={onMouseDown}
                    onTouchStart={onTouchStart}
                    className="absolute top-0 left-0 right-0 h-4 px-2 cursor-ns-resize z-50 flex items-center justify-center -translate-y-1/2 group/handle"
                >
                    <div className="bg-slate-900 rounded-full h-7 w-7 flex flex-col items-center justify-center shadow-2xl border-2 border-white group-hover/handle:scale-110 transition-transform">
                        <ChevronUp className="h-2.5 w-2.5 text-white -mb-0.5" />
                        <ChevronDown className="h-2.5 w-2.5 text-white -mt-0.5" />
                    </div>
                </div>
            )}

            <div className="h-12 flex items-center justify-between px-6 cursor-pointer shrink-0 border-b bg-slate-50" onClick={() => setIsListExpanded(!isListExpanded)}>
                <div className="flex items-center gap-4 flex-1 pointer-events-auto" onClick={e => e.stopPropagation()}>
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input 
                            placeholder="Zoeken in lijst..." 
                            className="h-8 pl-8 text-[10px] font-bold rounded-xl border-slate-200 bg-white focus:ring-primary/20" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                
                <div className="flex items-center gap-3 pointer-events-auto" onClick={e => e.stopPropagation()}>
                    <Button 
                        variant={showTodayCompleted ? "default" : "outline"} 
                        size="sm" 
                        className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200"
                        onClick={() => setShowTodayCompleted(!showTodayCompleted)}
                    >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> {showTodayCompleted ? "Verberg Klaar" : "Vandaag Afgemeld"}
                    </Button>
                    <Button 
                        variant={showAssignmentBubbles ? "default" : "outline"} 
                        size="sm" 
                        className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200"
                        onClick={() => setShowAssignmentBubbles(!showAssignmentBubbles)}
                    >
                        <User className="h-3.5 w-3.5 mr-1.5" /> {showAssignmentBubbles ? "Verberg Beheerder" : "Toegewezen"}
                    </Button>
                    
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200 gap-2"
                            >
                                <Layout className="h-3.5 w-3.5" /> Kolommen
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-56 p-4 rounded-2xl shadow-xl border-slate-100 bg-white/95 backdrop-blur-md">
                            <div className="space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b pb-2">Weergaveinstellingen</p>
                                <div className="space-y-2">
                                    {Object.keys(DEFAULT_COLUMNS).map(colId => (
                                        <div key={colId} className="flex items-center space-x-3 p-1">
                                            <Checkbox 
                                                id={`col-${colId}`} 
                                                checked={visibleColumns[colId] ?? true}
                                                onCheckedChange={() => toggleColumnVisibility(colId)}
                                                className="rounded-md"
                                            />
                                            <Label htmlFor={`col-${colId}`} className="text-xs font-bold uppercase tracking-tight text-slate-700 cursor-pointer">{COLUMN_LABELS[colId]}</Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <div className="h-8 w-px bg-slate-200 mx-1" />
                    {isListExpanded ? <ChevronDown className="h-5 w-5 text-slate-300" /> : <ChevronUp className="h-5 w-5 text-slate-300" />}
                </div>
            </div>
            
            <ScrollArea className="flex-1 bg-white">
                <Table className="min-w-[1200px] border-collapse border-slate-200 text-[10px]">
                    <TableHeader className="bg-slate-100 sticky top-0 z-10 border-b-2 border-slate-300">
                        <TableRow className="h-8 hover:bg-transparent">
                            {visibleColumns.intakenummer && <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r border-slate-200 px-2 h-8">Nr.</TableHead>}
                            {visibleColumns.locatie && <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r border-slate-200 px-2 h-8">Locatie (Straat + Nr)</TableHead>}
                            {visibleColumns.memo && <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r border-slate-200 px-2 h-8">Memo / Omschrijving</TableHead>}
                            {visibleColumns.hoofdcategorie && <TableHead className="font-black uppercase text-slate-400 border-r border-slate-100 px-2 h-8">Hoofdtype</TableHead>}
                            {visibleColumns.subcategorie && <TableHead className="font-black uppercase text-slate-500 border-r border-slate-200 px-2 h-8">Subtype</TableHead>}
                            {visibleColumns.werkgebied && <TableHead className="font-black uppercase text-primary border-r border-slate-200 px-2 h-8">Werkgebied</TableHead>}
                            {visibleColumns.afstand && <TableHead className="text-right font-black uppercase text-[9px] text-slate-500 px-2 h-8">Dist (km)</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMeldingen.map(m => {
                            const base = smoothLocation || userLocation || SIMULATION_START_LOCATION;
                            const dist = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([m.longitude, m.latitude])).toFixed(1);
                            const isCompleted = m.status === 'Afgerond';
                            return (
                                <TableRow key={m.id} className={cn("h-8 transition-colors cursor-pointer border-b border-slate-100", isCompleted ? "bg-green-50/50 opacity-60" : "hover:bg-blue-50")} onClick={() => setActiveWerkbonId(m.id)}>
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
                        {filteredMeldingen.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">
                                    Geen meldingen gevonden
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
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
                        fetchRoute();
                    }} 
                />
            </div>
        )}
    </div>
  );
}
