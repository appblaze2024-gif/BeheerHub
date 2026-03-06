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
  Wrench,
  RotateCcw,
  Calendar,
  Layers,
  Zap,
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
import { useIsMobile } from '@/hooks/use-mobile';
import { MapboxView } from '@/components/mapbox-view';

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

const werkbonNavItems = [
    { label: 'Werkzaamheden', icon: Wrench },
    { label: 'Opmerkingen', icon: MessageSquare },
    { label: 'Fotos', icon: Camera },
    { label: 'Hoeveelheid', icon: Package },
];

const translationLanguages = [
  { code: 'nl-NL', name: 'Dutch', flag: 'nl', label: 'Nederlands' },
  { code: 'en-US', name: 'English', flag: 'us', label: 'Engels' },
  { code: 'pl-PL', name: 'Polish', flag: 'pl', label: 'Pools' },
  { code: 'uk-UA', name: 'Ukrainian', flag: 'ua', label: 'Oekraïens' },
  { code: 'de-DE', name: 'German', flag: 'de', label: 'Duits' },
  { code: 'hu-HU', name: 'Hungarian', flag: 'hu', label: 'Hongaars' },
];

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
    const isMobile = useIsMobile();

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
    const [elapsedDisplay, setElapsedDisplay] = React.useState<string>("00:00");
    
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

    React.useEffect(() => {
        if (!melding?.workStartedAt) {
            setElapsedDisplay("00:00");
            return;
        }
        const interval = setInterval(() => {
            const start = new Date(melding.workStartedAt!).getTime();
            const now = Date.now();
            const diffSecs = Math.floor((now - start) / 1000);
            const hours = Math.floor(diffSecs / 3600);
            const mins = Math.floor((diffSecs % 3600) / 60);
            const secs = diffSecs % 60;
            setElapsedDisplay(`${hours > 0 ? hours + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [melding?.workStartedAt]);

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

    if (isLoading || !melding) return <div className="p-12 flex justify-center h-full items-center bg-white"><Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" /></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative animate-in slide-in-from-right duration-300">
            <header className="h-16 lg:h-20 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 shadow-xl z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 text-white hover:bg-white/10 shrink-0" onClick={onClose}>
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <div className="min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-tight leading-none truncate">{melding.intakenummer}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={cn("h-2 w-2 rounded-full", melding.workStartedAt ? "bg-green-500 animate-pulse" : "bg-orange-500")} />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                {melding.workStartedAt ? `Lopend • ${elapsedDisplay}` : "Wachtend op start"}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="hidden sm:inline-flex h-7 border-white/20 text-white font-black text-[9px] uppercase tracking-widest">{melding.status}</Badge>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-white/60 hover:text-white" onClick={onClose}>
                        <X className="h-6 w-6" />
                    </Button>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="px-6 py-4 bg-white shrink-0 border-b overflow-x-auto no-scrollbar shadow-sm">
                    <TabsList className="w-full inline-flex h-12 bg-slate-100 p-1.5 rounded-full border-none gap-2">
                        {werkbonNavItems.map(item => (
                            <TabsTrigger 
                                key={item.label} 
                                value={item.label} 
                                className="flex-1 gap-2 rounded-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md transition-all text-[10px] font-black uppercase tracking-widest"
                            >
                                <item.icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="hidden md:inline">{item.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                
                <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
                    <TabsContent value="Werkzaamheden" className="mt-0 p-4 md:p-8 animate-in fade-in duration-500">
                        <div className="max-w-4xl mx-auto space-y-8">
                            {/* Speech Bubble for Omschrijving */}
                            <div className="space-y-3 animate-in slide-in-from-left duration-500">
                                <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-6 flex items-center gap-2">
                                    <MessageSquare className="h-3 w-3" /> Klacht Omschrijving
                                </Label>
                                <div className="bg-white p-8 rounded-[3rem] rounded-tl-sm shadow-2xl border-none text-slate-700 italic font-medium leading-relaxed relative text-sm md:text-base ring-1 ring-black/5">
                                    "{melding.extra_informatie || 'Geen omschrijving opgegeven door de melder.'}"
                                </div>
                            </div>

                            {/* Core Info Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 animate-in slide-in-from-bottom-4 duration-700">
                                <Card className="bg-white border-none shadow-xl rounded-[2.5rem] p-6 hover:scale-[1.02] transition-transform">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-blue-100 p-3 rounded-2xl"><MapPin className="h-6 w-6 text-primary" /></div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Locatie</p>
                                            <p className="text-sm font-black text-slate-900 leading-tight truncate">{melding.straatnaam} {melding.huisnummer}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{melding.plaats}</p>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="bg-white border-none shadow-xl rounded-[2.5rem] p-6 hover:scale-[1.02] transition-transform">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-yellow-400 p-3 rounded-2xl shadow-lg shadow-yellow-400/20"><Package className="h-6 w-6 text-slate-900" /></div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Unit ID</p>
                                            <p className="text-sm font-black text-slate-900 leading-none">{melding.containernummer || 'N.V.T.'}</p>
                                            <Badge className="mt-1.5 bg-slate-900 text-white font-black text-[8px] tracking-widest border-none px-2 h-4 uppercase">{melding.hoofdcategorie}</Badge>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="bg-white border-none shadow-xl rounded-[2.5rem] p-6 hover:scale-[1.02] transition-transform">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-slate-100 p-3 rounded-2xl"><Calendar className="h-6 w-6 text-slate-600" /></div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Meld Datum</p>
                                            <p className="text-sm font-black text-slate-900 leading-none">{formatDate(new Date(melding.datum), 'dd MMM yyyy')}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{melding.tijdstip || '00:00'}</p>
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            {/* Map Control Card */}
                            <Card className="bg-white border-none shadow-2xl rounded-[3rem] overflow-hidden p-2">
                                <div className="p-6 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-primary p-2 rounded-xl"><Navigation className="h-4 w-4 text-white" /></div>
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Locatie Controle</span>
                                    </div>
                                    <Badge className="bg-green-500 font-black text-[8px] tracking-tighter shadow-lg shadow-green-500/20">LIVE GPS</Badge>
                                </div>
                                <div className="rounded-[2.5rem] overflow-hidden h-64 md:h-80 border-2 border-slate-50 relative">
                                    <MapboxView latitude={melding.latitude} longitude={melding.longitude} mainLocationLabel={melding.containernummer} interactive={true} objects={nearbyObjects} />
                                </div>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="Opmerkingen" className="mt-0 p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
                        <div className="max-w-3xl mx-auto bg-white p-8 rounded-[3.5rem] shadow-2xl space-y-10 border border-slate-100">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-slate-100 pb-6">
                                <div>
                                    <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">Afhandeling notitie</h4>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Gebruik de dicteerknop voor snelle invoer</p>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-full border-2 border-slate-200">
                                    <Select value={sourceLang.code} onValueChange={(val) => setSourceLang(translationLanguages.find(l => l.code === val) || translationLanguages[0])}>
                                        <SelectTrigger className="h-10 w-16 p-0 border-none bg-transparent shadow-none focus:ring-0">
                                            <img src={`https://flagcdn.com/w40/${sourceLang.flag}.png`} alt={sourceLang.label} className="h-5 w-8 rounded-md shadow-md object-cover border-2 border-white mx-auto" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {translationLanguages.map(l => (
                                                <SelectItem key={l.code} value={l.code}>
                                                    <div className="flex items-center gap-3">
                                                        <img src={`https://flagcdn.com/w40/${l.flag}.png`} alt={l.label} className="h-3 w-5 rounded-sm object-cover" />
                                                        <span className="text-xs font-black uppercase">{l.label}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button variant={isListening ? "destructive" : "ghost"} size="icon" className="rounded-full h-11 w-11 shadow-xl bg-white hover:scale-105 transition-all" onClick={toggleListening}>
                                        {isListening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5 text-primary" />}
                                    </Button>
                                    <Separator orientation="vertical" className="h-8 bg-slate-300" />
                                    <Button variant="ghost" size="sm" className="h-10 px-5 font-black uppercase text-[10px] text-primary hover:bg-primary/10 rounded-full transition-colors" onClick={handleAITranslate} disabled={isTranslating || !afhandelingBijzonderheden}>
                                        {isTranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                        Vertaal met AI
                                    </Button>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sneltoetsen</Label>
                                    <Badge variant="secondary" className="bg-slate-100 text-slate-400 text-[8px] font-black uppercase">Click om toe te voegen</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2.5">
                                    {(profile?.quickKeys || []).map((k, i) => (
                                        <div key={i} className="group relative">
                                            <Button variant="outline" size="sm" className="h-11 px-6 text-[10px] font-black uppercase tracking-tight rounded-2xl border-2 border-slate-100 bg-white hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm active:scale-95" onClick={() => setAfhandelingBijzonderheden(prev => prev + (prev ? ' ' : '') + k)}>
                                                {k}
                                            </Button>
                                            <button className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xl border-2 border-white" onClick={(e) => { e.stopPropagation(); handleRemoveQuickKey(k); }}>
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex gap-2">
                                        <Input placeholder="Nieuwe toets..." className="h-11 text-[10px] w-36 font-bold rounded-2xl border-2 border-dashed border-slate-200" value={newQuickKey} onChange={e => setNewQuickKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddQuickKey())} />
                                        <Button variant="ghost" size="icon" className="h-11 w-11 rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-400 hover:text-primary transition-colors" onClick={handleAddQuickKey} disabled={!newQuickKey.trim()}><Plus className="h-5 w-5" /></Button>
                                    </div>
                                </div>
                            </div>

                            <Textarea 
                                placeholder="Typ hier de details van de werkzaamheden..." 
                                className="resize-none text-base font-medium leading-relaxed rounded-[2.5rem] border-none bg-slate-50 focus:ring-primary/20 min-h-[300px] p-8 shadow-inner"
                                value={afhandelingBijzonderheden}
                                onChange={(e) => setAfhandelingBijzonderheden(e.target.value)}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="Fotos" className="mt-0 p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
                        <div className="max-w-3xl mx-auto bg-white p-10 rounded-[4rem] shadow-2xl space-y-10 border border-slate-100">
                            <div className="flex justify-between items-end border-b border-slate-100 pb-6">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">Media</h4>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Foto's van de afgeronde werkzaamheid</p>
                                </div>
                                <Badge className="bg-primary text-white font-black h-8 rounded-2xl px-4 shadow-lg shadow-primary/20">{afhandelingFotos.length} FILES</Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-6">
                                <Button variant="outline" className="h-32 border-dashed border-4 border-slate-100 rounded-[3rem] font-black uppercase text-xs tracking-[0.2em] gap-4 flex-col bg-slate-50/50 hover:bg-white hover:border-primary/30 transition-all hover:scale-[1.02] shadow-sm" onClick={() => document.getElementById('camera-input-integrated')?.click()}>
                                    <div className="bg-primary/10 p-4 rounded-3xl"><Camera className="h-8 w-8 text-primary" /></div>
                                    <span>Nieuwe Foto</span>
                                </Button>
                                <Button variant="outline" className="h-32 border-dashed border-4 border-slate-100 rounded-[3rem] font-black uppercase text-xs tracking-[0.2em] gap-4 flex-col bg-slate-50/50 hover:bg-white hover:border-primary/30 transition-all hover:scale-[1.02] shadow-sm" onClick={() => document.getElementById('gallery-input-integrated')?.click()}>
                                    <div className="bg-slate-200 p-4 rounded-3xl"><ImageIcon className="h-8 w-8 text-slate-500" /></div>
                                    <span>Uit Album</span>
                                </Button>
                            </div>
                            <input type="file" id="camera-input-integrated" className="hidden" accept="image/*" capture="environment" onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                            <input type="file" id="gallery-input-integrated" className="hidden" accept="image/*" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                                {afhandelingFotos.map((p, i) => (
                                    <div key={i} className="relative aspect-square rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl group animate-in zoom-in-95 hover:scale-105 transition-transform">
                                        <Image src={p.url} alt="afhandeling" fill className="object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Button variant="destructive" size="icon" className="h-12 w-12 rounded-full shadow-2xl border-4 border-white active:scale-90 transition-all" onClick={() => setAfhandelingFotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}>
                                                <Trash2 className="h-6 w-6" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="Hoeveelheid" className="mt-0 p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
                        <div className="max-w-3xl mx-auto bg-white p-10 rounded-[4rem] shadow-2xl space-y-10 border border-slate-100">
                            <div className="space-y-1 border-b border-slate-100 pb-6">
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">Materiaalinzet</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Registreer verbruikte onderdelen en materialen</p>
                            </div>
                            
                            <div className="space-y-4">
                                {hoeveelheden.map(h => (
                                    <div key={h.id} className="flex justify-between items-center p-6 bg-slate-50 rounded-[2.5rem] border-none hover:bg-slate-100 transition-all group animate-in slide-in-from-left-4 shadow-sm">
                                        <div className="flex flex-col">
                                            <span className="text-base font-black uppercase tracking-tight text-slate-900">{h.type}</span>
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{h.eenheid}</span>
                                        </div>
                                        <div className="flex items-center gap-8">
                                            <span className="text-4xl font-black text-primary tracking-tighter">{h.aantal}</span>
                                            <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full h-12 w-12 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setHoeveelheden(prev => prev.filter(x => x.id !== h.id))}><Trash2 className="h-6 w-6" /></Button>
                                        </div>
                                    </div>
                                ))}
                                {hoeveelheden.length === 0 && (
                                    <div className="py-16 text-center text-slate-300">
                                        <Package className="h-16 w-16 mx-auto mb-4 opacity-10" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Geen materialen toegevoegd</p>
                                    </div>
                                )}
                            </div>

                            <Card className="bg-slate-900 text-white rounded-[3rem] p-10 space-y-8 shadow-[0_30px_60px_rgba(15,23,42,0.3)] border-none ring-1 ring-white/10">
                                <div className="text-center space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Toevoegen</p>
                                    <h5 className="text-lg font-black uppercase tracking-tight">Nieuw Materiaal</h5>
                                </div>
                                <div className="grid gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-4 tracking-widest">Product / Onderdeel</Label>
                                        <Input placeholder="Bv. Straatstenen, Zand, Klep..." className="h-16 bg-white/10 border-none text-white font-bold text-lg rounded-2xl px-8 focus:ring-primary/30 shadow-inner" value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-4 tracking-widest">Aantal</Label>
                                        <Input placeholder="0" type="number" className="h-16 bg-white/10 border-none text-white font-black text-3xl rounded-2xl px-8 focus:ring-primary/30 text-center shadow-inner" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} />
                                    </div>
                                    <Button className="h-16 w-full font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-primary/30 text-base mt-4 transition-all active:scale-95 bg-primary hover:bg-primary/90" onClick={() => { if(newHoeveelheidType && newHoeveelheidAantal) { setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); setNewHoeveelheidType(''); setNewHoeveelheidAantal(''); } }}>
                                        <Plus className="mr-3 h-5 w-5" /> Inboeken
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    </TabsContent>
                </main>
            </Tabs>

            {/* Floating Action Button Footer */}
            <div className="absolute bottom-10 left-0 right-0 z-50 pointer-events-none flex justify-center px-6">
                <div className="max-w-md w-full pointer-events-auto">
                    {melding.workStartedAt ? (
                        <Button 
                            className="w-full h-20 bg-orange-600 hover:bg-orange-700 text-white font-black uppercase tracking-[0.2em] text-xl shadow-[0_25px_60px_rgba(234,88,12,0.5)] rounded-[2.5rem] gap-5 active:scale-95 transition-all animate-in slide-in-from-bottom-10 ring-4 ring-orange-600/20" 
                            onClick={handleAfronden} 
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <Loader2 className="h-8 w-8 animate-spin" /> : <CheckCircle2 className="h-8 w-8" />}
                            GEREED MELDEN
                        </Button>
                    ) : (
                        <Button 
                            className="w-full h-20 bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-[0.2em] text-xl shadow-[0_25px_60px_rgba(22,163,74,0.5)] rounded-[2.5rem] gap-5 active:scale-95 transition-all animate-in slide-in-from-bottom-10 ring-4 ring-green-600/20" 
                            onClick={handleStartWork}
                        >
                            <Play className="h-8 w-8 fill-current" />
                            START UITVOERING
                        </Button>
                    )}
                </div>
            </div>
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
            if (err.code === 3) console.warn("GPS Signal lost, retrying...");
            else console.error("GPS Error:", err);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigationState, isSimulationMode, currentRouteGeometry, isManualMode, navPitch, navOffset, isCalculatingRoute, fetchRoute]);

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
                                    <div className="absolute -top-1.5 -right-1.5 bg-yellow-400 rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-lg overflow-hidden">
                                        <Wrench className="h-3.5 w-3.5 text-slate-900" />
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
