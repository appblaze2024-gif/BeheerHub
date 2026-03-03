'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef } from 'react-map-gl';
import { useCollection, useFirestore, useUser, useMemoFirebase, updateDocumentNonBlocking, useFirebaseApp, useDoc } from '@/firebase';
import { collection, query, where, doc, getDocs, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Play, 
  CheckCircle2, 
  MapPin, 
  Gauge, 
  Loader2,
  Clock,
  Navigation,
  RefreshCw,
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
  Columns,
  X as XIcon,
  FileText,
  Sparkles,
  Trash2,
  Eye,
  EyeOff,
  User,
  Package,
  Paperclip,
  ChevronRight
} from 'lucide-react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Object as MapObject, Melding, UploadedFile, Hoeveelheid } from '@/lib/types';
import { cn } from '@/lib/utils';
import * as turf from '@turf/turf';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/firebase/profile-provider';
import { useToast } from '@/components/ui/use-toast';
import { LoadingScreen } from '@/components/loading-screen';
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { translateText } from '@/ai/flows/translate-text-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from '@/components/ui/separator';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';
const SIMULATION_START_LOCATION = { latitude: 52.2644, longitude: 4.7242 };

const routeLayer: Layer = {
  id: 'route',
  type: 'line',
  source: 'route-line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#2563eb', 'line-width': 10, 'line-opacity': 1 },
};

const routeLayerCasing: Layer = {
  id: 'route-casing',
  type: 'line',
  source: 'route-line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#1e40af', 'line-width': 16, 'line-opacity': 0.2 },
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

const translationLanguages = [
  { code: 'nl-NL', name: 'Dutch', flag: 'nl', label: 'Nederlands' },
  { code: 'en-US', name: 'English', flag: 'us', label: 'Engels' },
  { code: 'pl-PL', name: 'Polish', flag: 'pl', label: 'Pools' },
  { code: 'uk-UA', name: 'Ukrainian', flag: 'ua', label: 'Oekraïens' },
  { code: 'de-DE', name: 'German', flag: 'de', label: 'Duits' },
  { code: 'hu-HU', name: 'Hungarian', flag: 'hu', label: 'Hongaars' },
];

/**
 * Geïntegreerde Werkbon Component met de ORIGINELE layout
 */
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
                gewerkteMinuten: minutesWorked,
                workStartedAt: null, 
            });
            onCompleted(melding.id);
            onClose();
        } catch (error) { toast({ variant: "destructive", title: 'Fout bij afronden' }); } finally { setIsSubmitting(false); }
    };

    const toggleListening = () => {
        if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
                            START WERK
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
                
                <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
                    <div className="flex-1 p-4 lg:p-6 overflow-y-auto no-scrollbar">
                        <TabsContent value="Werkzaamheden" className="mt-0 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 h-full">
                                <Card className="rounded-xl lg:rounded-2xl bg-white shadow-xl border-none flex flex-col h-full overflow-hidden">
                                    <CardHeader className="bg-slate-500 text-white p-4 lg:p-5 shrink-0">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-0.5 lg:space-y-1">
                                                <p className="text-[8px] lg:text-[9px] font-black uppercase tracking-widest text-blue-200">Intakenummer</p>
                                                <CardTitle className="text-lg lg:text-xl font-black uppercase tracking-tight">{melding.intakenummer}</CardTitle>
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
                                                <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Wijk / Werkgebied</p>
                                                <p className="text-[10px] lg:text-xs font-bold text-slate-900 uppercase truncate">{melding.werkgebied || melding.wijk || '-'}</p>
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
                                                <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Soort Melder</p>
                                                <p className="text-[10px] lg:text-xs font-bold text-slate-900 truncate">{melding.soort_melder || melding.melder || 'Anoniem'}</p>
                                            </div>
                                            {melding.containernummer && (
                                                <div className="space-y-0.5">
                                                    <p className="text-[7px] lg:text-[8px] font-black uppercase text-slate-400 tracking-widest">Containernummer</p>
                                                    <p className="text-[10px] lg:text-xs font-bold text-slate-900">{melding.containernummer}</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-h-0 flex flex-col space-y-1.5 lg:space-y-2">
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
                                    <MapboxView 
                                      latitude={melding.latitude} 
                                      longitude={melding.longitude} 
                                      mainLocationLabel={melding.containernummer}
                                      interactive={false} 
                                      objects={nearbyObjects}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="Opmerkingen" className="mt-0 h-full">
                            <Card className="rounded-xl lg:rounded-3xl border-none shadow-xl bg-white overflow-hidden h-full flex flex-col">
                                <CardHeader className="bg-slate-50 border-b p-4 lg:p-6 flex flex-row items-center justify-between">
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
                                            <Button 
                                                variant={isListening ? "destructive" : "ghost"} 
                                                size="icon" 
                                                className="rounded-full h-7 w-7 lg:h-8 lg:w-8 shadow-sm shrink-0"
                                                onClick={toggleListening}
                                                title={isListening ? "Stoppen" : `Dicteren in ${sourceLang.label}`}
                                            >
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
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-7 lg:h-8 px-2 lg:px-3 font-black uppercase text-[8px] lg:text-[9px] gap-1.5 lg:gap-2 text-primary hover:bg-primary/5 rounded-lg lg:rounded-xl"
                                                onClick={handleAITranslate}
                                                disabled={isTranslating || !afhandelingBijzonderheden}
                                            >
                                                {isTranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                                Vertaal
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 lg:p-6 flex-1">
                                    <Textarea 
                                        placeholder="Voeg hier bijzonderheden toe over de uitvoering of gebruik de dicteerknop..." 
                                        className="resize-none text-[11px] lg:text-sm font-medium leading-relaxed rounded-xl lg:rounded-2xl border-slate-100 bg-slate-50 focus:ring-primary/20 h-full min-h-[300px]"
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
                                            {melding.fotos?.map((p, i) => <div key={i} className="relative aspect-square rounded-xl lg:rounded-2xl overflow-hidden border-2 border-slate-50 shadow-sm"><Image src={p.url} alt="melding" fill className="object-cover" /></div>)}
                                            {(!melding.fotos || melding.fotos.length === 0) && <div className="col-span-3 py-12 lg:py-20 text-center opacity-20"><Camera className="h-10 w-10 lg:h-12 lg:w-12 mx-auto mb-2" /><p className="text-[10px] font-black uppercase tracking-widest">Geen bronfoto's</p></div>}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-xl lg:rounded-3xl shadow-xl border-none bg-white overflow-hidden">
                                    <CardHeader className="bg-slate-50 border-b p-4 lg:p-6"><CardTitle className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400">Uitvoering (Foto's)</CardTitle></CardHeader>
                                    <CardContent className="p-4 lg:p-8 space-y-4 lg:space-y-6">
                                        <Button variant="outline" className="w-full h-12 lg:h-16 border-dashed border-2 border-slate-100 rounded-xl lg:rounded-2xl font-black uppercase tracking-widest text-[9px] lg:text-[10px]"><Camera className="mr-2 h-3.5 w-3.5 lg:h-4 lg:w-4" /> Foto toevoegen</Button>
                                        <div className="grid grid-cols-3 gap-3 lg:gap-4">
                                            {melding.afhandeling_fotos?.map((p, i) => (
                                                <div key={i} className="relative aspect-square rounded-xl lg:rounded-2xl overflow-hidden border shadow-sm group">
                                                    <Image src={p.url} alt="afhandeling" fill className="object-cover" />
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
                    
                    {/* Media Sidebar */}
                    <div className="w-full lg:w-[350px] bg-slate-50 lg:border-l shrink-0 flex flex-col min-h-0 overflow-hidden">
                        <div className="p-5 border-b bg-white flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">BIJLAGEN</h3>
                            <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-bold h-5 px-2">PDF/DOC</Badge>
                        </div>
                        <ScrollArea className="flex-1 p-5">
                            <div className="space-y-3">
                                {melding.files?.map(f => (
                                    <div key={f.storagePath} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm group">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="bg-blue-100 p-2 rounded-lg"><Paperclip className="h-4 w-4 text-blue-600" /></div>
                                            <p className="text-[10px] font-black truncate text-slate-900 uppercase">{f.name}</p>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 rounded-full" asChild><a href={f.url} target="_blank" rel="noreferrer"><Check className="h-4 w-4" /></a></Button>
                                    </div>
                                ))}
                                {(!melding.files || melding.files.length === 0) && (
                                    <div className="py-12 flex flex-col items-center justify-center text-slate-300">
                                        <Paperclip className="h-8 w-8 opacity-20 mb-2" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Geen bestanden</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </main>
            </Tabs>
        </div>
    );
}

export default function StartNavigationPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { profile } = useProfile();
  const { toast } = useToast();
  const { setIsHeaderVisible } = useNavigationUI();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const isPrivileged = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const [isLocating, setIsLocating] = React.useState(false);
  const [activeWerkbonId, setActiveWerkbonId] = React.useState<string | null>(null);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [isListExpanded, setIsListExpanded] = React.useState(true);
  const [isAssignedVisible, setIsAssignedVisible] = React.useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = React.useState<Record<string, boolean>>({
    intakenr: true,
    adres: true,
    omschrijving: true,
    hoofdtype: true,
    subtype: true,
    werkgebied: true,
    toegewezen: true,
    afstand: true
  });

  // Navigation logic states
  const [smoothLocation, setSmoothLocation] = React.useState<any>(null);
  const [currentRouteGeometry, setCurrentRouteGeometry] = React.useState<any>(null);
  const [distanceRemaining, setDistanceRemaining] = React.useState(0);
  const [speedKmh, setSpeedKmh] = React.useState(0);
  const [heading, setHeading] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);

  const mapRef = React.useRef<MapRef>(null);
  const simAnimationRef = React.useRef<number | null>(null);
  const simStateRef = React.useRef({ distanceTravelled: 0, currentSpeedMs: 0 });

  React.useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setUserLocation(loc);
            if (navigationState !== 'navigating') {
                setSmoothLocation({ ...loc, heading: pos.coords.heading || 0 });
            }
        },
        null, { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigationState]);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw']));
  }, [firestore]);

  const { data: rawMeldingen, isLoading } = useCollection<Melding>(meldingenQuery);

  const filteredMeldingen = React.useMemo(() => {
    if (!rawMeldingen) return [];
    let pool = [...rawMeldingen].filter(m => !completedObjects.includes(m.id));
    if (!isPrivileged) {
        const userName = profile?.displayName || profile?.email || 'Onbekend';
        pool = pool.filter(m => m.behandelaar === userName);
    }
    if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase();
        pool = pool.filter(m => 
            m.intakenummer.toLowerCase().includes(q) || 
            (m.straatnaam || '').toLowerCase().includes(q) ||
            (m.plaats || '').toLowerCase().includes(q)
        );
    }
    return pool;
  }, [rawMeldingen, isPrivileged, profile, debouncedSearchQuery, completedObjects]);

  const nextObject = React.useMemo(() => {
    if (filteredMeldingen.length === 0) return null;
    const base = userLocation || SIMULATION_START_LOCATION;
    return [...filteredMeldingen].sort((a, b) => {
        const distA = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([a.longitude, a.latitude]));
        const distB = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([b.longitude, b.latitude]));
        return distA - distB;
    })[0];
  }, [filteredMeldingen, userLocation]);

  const fetchRoute = React.useCallback(async () => {
    if (!nextObject || !userLocation) return;
    const startPos = userLocation;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startPos.longitude},${startPos.latitude};${nextObject.longitude},${nextObject.latitude}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]) {
            setCurrentRouteGeometry(data.routes[0].geometry);
            setDistanceRemaining(Math.round(data.routes[0].distance));
        }
    } catch (e) {}
  }, [nextObject, userLocation]);

  React.useEffect(() => {
    if (navigationState === 'navigating') fetchRoute();
  }, [nextObject?.id, navigationState, fetchRoute]);

  const handleStartRit = (simulate = false) => {
    if (filteredMeldingen.length === 0) { toast({ title: "Geen opdrachten beschikbaar" }); return; }
    setIsSimulationMode(simulate);
    setNavigationState('navigating');
    setIsListExpanded(false);
    if (simulate) startSimulation();
  };

  const startSimulation = () => {
    if (!currentRouteGeometry) return;
    const line = turf.lineString(currentRouteGeometry.coordinates);
    const totalDist = turf.length(line, { units: 'meters' });
    simStateRef.current = { distanceTravelled: 0, currentSpeedMs: 0 };

    const animate = () => {
        if (isPaused || activeWerkbonId) { simAnimationRef.current = requestAnimationFrame(animate); return; }
        const deltaTime = 0.016; 
        const speedMs = 13.8; 
        simStateRef.current.distanceTravelled += speedMs * deltaTime;
        
        if (simStateRef.current.distanceTravelled >= totalDist) {
            const final = currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1];
            setSmoothLocation({ latitude: final[1], longitude: final[0], heading: 0 });
            setSpeedKmh(0);
            return;
        }

        const curr = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
        const ahead = turf.along(line, simStateRef.current.distanceTravelled + 2, { units: 'meters' });
        const [lng, lat] = curr.geometry.coordinates;
        const head = (turf.bearing(curr, ahead) + 360) % 360;
        
        setSmoothLocation({ latitude: lat, longitude: lng, heading: head });
        setSpeedKmh(Math.round(speedMs * 3.6));
        setHeading(head);
        
        simAnimationRef.current = requestAnimationFrame(animate);
    };
    simAnimationRef.current = requestAnimationFrame(animate);
  };

  const handleLocateUser = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserLocation(loc);
        mapRef.current?.getMap().flyTo({ center: [loc.longitude, loc.latitude], zoom: 16 });
        setIsLocating(false);
    }, () => setIsLocating(false), { enableHighAccuracy: true });
  };

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
        {/* Fullscreen Map */}
        <div className="absolute inset-0 z-0">
            <MapGL 
                ref={mapRef} 
                initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 7 }} 
                style={{ width: '100%', height: '100%' }} 
                mapStyle={mapStyle} 
                mapboxAccessToken={MAPBOX_TOKEN}
            >
                {/* User Marker */}
                {smoothLocation && (
                    <Marker longitude={smoothLocation.longitude} latitude={smoothLocation.latitude} anchor="center" rotation={smoothLocation.heading}>
                        <div className="relative flex items-center justify-center w-12 h-12">
                            <svg viewBox="0 0 100 100" className="h-10 w-10 text-primary drop-shadow-2xl"><path d="M50 5 L90 95 L50 75 L10 95 Z" fill="currentColor" stroke="white" strokeWidth="4" /></svg>
                        </div>
                    </Marker>
                )}

                {/* Mission Markers */}
                {filteredMeldingen.map((m) => (
                    <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center" onClick={() => setActiveWerkbonId(m.id)}>
                        <div className="relative group cursor-pointer">
                            <div className={cn("w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center transition-transform hover:scale-110", getMeldingAgeColor(m.datum))}>
                                <Bell className="h-4 w-4 text-white" />
                            </div>
                            {isAssignedVisible && (
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-md text-white px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest whitespace-nowrap shadow-2xl border border-white/20 animate-in zoom-in-95">
                                    {m.behandelaar || 'Onbekend'}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-black/90" />
                                </div>
                            )}
                        </div>
                    </Marker>
                ))}

                {/* Navigation Line */}
                {currentRouteGeometry && navigationState === 'navigating' && (
                    <Source id="route-line" type="geojson" data={currentRouteGeometry}>
                        <Layer {...routeLayerCasing} /><Layer {...routeLayer} />
                    </Source>
                )}
            </MapGL>
        </div>

        {/* Floating Header UI */}
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
                <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border border-slate-100" onClick={() => router.push('/')}>
                    <ArrowLeft className="h-6 w-6 text-slate-600" />
                </Button>
            </div>
            <div className="flex items-center gap-3 pointer-events-auto">
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-full shadow-2xl bg-white/90 backdrop-blur-md text-primary border border-slate-100" onClick={handleLocateUser} disabled={isLocating}>
                    {isLocating ? <Loader2 className="h-6 w-6 animate-spin" /> : <LocateFixed className="h-6 w-6" />}
                </Button>
                {navigationState === 'setup' ? (
                    <>
                        {isPrivileged && <Button variant="outline" className="h-12 px-6 font-black uppercase bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100" onClick={() => handleStartRit(true)}><Gauge className="mr-2 h-5 w-5" /> SIMULATOR</Button>}
                        <Button className="h-12 px-8 font-black uppercase bg-orange-600 text-white hover:bg-orange-700 shadow-2xl rounded-2xl" onClick={() => handleStartRit(false)}><Play className="mr-2 h-5 w-5 fill-current" /> START RIT</Button>
                    </>
                ) : (
                    <Button variant="destructive" className="h-12 px-8 font-black uppercase rounded-2xl shadow-2xl border-none" onClick={() => { setNavigationState('setup'); setIsListExpanded(true); setCurrentRouteGeometry(null); if(simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current); }}>STOP RIT</Button>
                )}
            </div>
        </div>

        {/* Floating Navigation HUD Overlay - BOTTOM CENTER */}
        {navigationState === 'navigating' && !activeWerkbonId && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 w-[95%] max-w-xl animate-in slide-in-from-bottom-10 duration-700 pointer-events-none">
                <Card className="bg-white/95 backdrop-blur-xl shadow-2xl border-2 border-slate-100 rounded-[2rem] overflow-hidden pointer-events-auto ring-1 ring-black/5">
                    <CardContent className="p-6 flex items-center justify-between gap-8">
                        <div className="flex flex-col items-center shrink-0 border-r border-slate-100 pr-8">
                            <p className="text-4xl font-black text-slate-900 tracking-tighter">{formatDate(addSeconds(new Date(), (distanceRemaining/5000)*3600), 'HH:mm')}</p>
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">aankomst</p>
                        </div>
                        <div className="flex-1 flex flex-col gap-3 min-w-0">
                            <div className="flex justify-between items-end px-1">
                                <div className="space-y-0.5">
                                    <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Volgende opdracht</p>
                                    <p className="text-lg font-black text-slate-900 uppercase tracking-tight truncate max-w-[200px]">{nextObject?.intakenummer}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-black text-slate-900 leading-none">{(distanceRemaining/1000).toFixed(1)} <span className="text-xs text-slate-500 uppercase">km</span></p>
                                </div>
                            </div>
                            <Progress value={100} className="h-2 bg-slate-100" />
                        </div>
                        <div className="h-20 w-20 rounded-full border-[6px] border-primary flex flex-col items-center justify-center bg-slate-50 shadow-[inset_0_0_20px_rgba(37,99,235,0.1)] shrink-0 ring-4 ring-slate-100">
                            <span className="text-3xl font-black text-slate-900 leading-none tracking-tighter">{speedKmh}</span>
                            <span className="text-[8px] font-black uppercase text-primary mt-0.5">km/h</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )}

        {/* Integrated Collapsible Excel List - SQUARE */}
        <div className={cn(
            "absolute bottom-0 left-0 right-0 z-40 transition-transform duration-500 ease-in-out bg-white border-t-4 border-slate-900 rounded-none shadow-2xl flex flex-col",
            isListExpanded ? "h-[45%]" : "h-14 translate-y-[calc(100%-3.5rem)]"
        )}>
            <div className="h-14 flex items-center justify-between px-8 cursor-pointer shrink-0 border-b border-slate-200" onClick={() => setIsListExpanded(!isListExpanded)}>
                <div className="flex items-center gap-4">
                    <LayoutGrid className="h-5 w-5 text-primary" />
                    <span className="font-black uppercase text-sm tracking-tight">Meldingen ({filteredMeldingen.length})</span>
                </div>
                <div className="flex items-center gap-6">
                    {isListExpanded && (
                        <div className="flex items-center gap-3">
                            <div className="relative w-48 lg:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input 
                                    placeholder="Zoek op nummer of adres..." 
                                    className="h-9 pl-9 rounded-xl border-slate-200 bg-slate-50 font-bold" 
                                    value={searchQuery} 
                                    onChange={e => setSearchQuery(e.target.value)} 
                                    onClick={e => e.stopPropagation()} 
                                />
                            </div>
                            
                            {isPrivileged && (
                                <Button 
                                    variant={isAssignedVisible ? "default" : "outline"} 
                                    size="sm" 
                                    className="h-8 text-[9px] font-black uppercase tracking-widest gap-2 rounded-xl transition-all border-slate-200"
                                    onClick={(e) => { e.stopPropagation(); setIsAssignedVisible(!isAssignedVisible); }}
                                >
                                    {isAssignedVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                    TOEGEWEZEN
                                </Button>
                            )}

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest gap-2 rounded-xl border-slate-200" onClick={e => e.stopPropagation()}>
                                        <Columns className="h-3 w-3" /> KOLOMMEN
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 rounded-xl p-2 shadow-xl border-slate-100" onClick={e => e.stopPropagation()}>
                                    <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tabel Weergave</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {Object.entries(visibleColumns).map(([key, isVisible]) => (
                                        <DropdownMenuCheckboxItem key={key} checked={isVisible} onCheckedChange={() => toggleColumn(key)} className="font-bold text-xs uppercase tracking-tight">
                                            {key}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                    {isListExpanded ? <ChevronDown className="h-6 w-6 text-slate-300" /> : <ChevronUp className="h-6 w-6 text-slate-300" />}
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full px-0 pb-10">
                    <div className="min-w-[1200px]">
                        <Table className="border-collapse table-fixed w-full border-slate-200">
                            <TableHeader className="bg-slate-100 sticky top-0 z-10 border-b-2 border-slate-200">
                                <TableRow className="h-10 hover:bg-transparent">
                                    {visibleColumns.intakenr && <TableHead className="font-black uppercase text-[10px] w-32 border-r border-slate-200 sticky left-0 bg-slate-100 z-20">Intakenr.</TableHead>}
                                    {visibleColumns.adres && <TableHead className="font-black uppercase text-[10px] w-48 border-r border-slate-200">Adres</TableHead>}
                                    {visibleColumns.omschrijving && <TableHead className="font-black uppercase text-[10px] border-r border-slate-200">Omschrijving</TableHead>}
                                    {visibleColumns.hoofdtype && <TableHead className="font-black uppercase text-[10px] w-32 border-r border-slate-200">Hoofdtype</TableHead>}
                                    {visibleColumns.subtype && <TableHead className="font-black uppercase text-[10px] w-40 border-r border-slate-200">Subtype</TableHead>}
                                    {visibleColumns.werkgebied && (
                                        <TableHead className="font-black uppercase text-[10px] w-32 border-r border-slate-200">Werkgebied</TableHead>
                                    )}
                                    {visibleColumns.toegewezen && <TableHead className="font-black uppercase text-[10px] w-32 border-r border-slate-200">Toegewezen</TableHead>}
                                    {visibleColumns.afstand && <TableHead className="font-black uppercase text-[10px] w-24 text-right sticky right-0 bg-slate-100 z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">Afstand</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredMeldingen.map(m => {
                                    const dist = userLocation ? turf.distance(turf.point([userLocation.longitude, userLocation.latitude]), turf.point([m.longitude, m.latitude])).toFixed(1) : '-';
                                    return (
                                        <TableRow key={m.id} className="h-14 hover:bg-blue-50 transition-colors cursor-pointer border-b border-slate-100 group" onClick={() => setActiveWerkbonId(m.id)}>
                                            {visibleColumns.intakenr && (
                                                <TableCell className="font-black text-xs border-r border-slate-100 sticky left-0 bg-white group-hover:bg-blue-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                                    <div className="flex items-center gap-2"><div className={cn("h-2 w-2 rounded-full", getMeldingAgeColor(m.datum))} />{m.intakenummer}</div>
                                                </TableCell>
                                            )}
                                            {visibleColumns.adres && <TableCell className="text-xs font-bold border-r border-slate-100 truncate">{m.straatnaam} {m.huisnummer}</TableCell>}
                                            {visibleColumns.omschrijving && <TableCell className="text-xs font-medium border-r border-slate-100 italic text-slate-500 truncate max-w-[300px]">"{m.extra_informatie}"</TableCell>}
                                            {visibleColumns.hoofdtype && <TableCell className="text-[10px] font-black uppercase border-r border-slate-100 text-slate-400">{m.hoofdcategorie}</TableCell>}
                                            {visibleColumns.subtype && <TableCell className="text-[10px] font-black uppercase border-r border-slate-100 text-slate-900 truncate">{m.subcategorie}</TableCell>}
                                            {visibleColumns.werkgebied && (
                                                <TableCell className="border-r border-slate-100">
                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 font-black text-[9px] uppercase tracking-tighter h-6 px-2">
                                                        <LayoutGrid className="h-2.5 w-2.5 mr-1.5" />
                                                        {m.werkgebied || m.wijk || '-'}
                                                    </Badge>
                                                </TableCell>
                                            )}
                                            {visibleColumns.toegewezen && (
                                                <TableCell className="text-xs font-bold border-r border-slate-100 truncate text-slate-600">
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-3 w-3 text-slate-300" />
                                                        {m.behandelaar || '-'}
                                                    </div>
                                                </TableCell>
                                            )}
                                            {visibleColumns.afstand && (
                                                <TableCell className="text-right font-black text-xs text-primary sticky right-0 bg-white group-hover:bg-blue-50 z-10 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                                    {dist} km
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </div>
        </div>

        {/* Integrated Werkbon Overlay - FULL LAYOUT */}
        {activeWerkbonId && (
            <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                <div className="w-full max-w-6xl h-[90vh] rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-white/20 animate-in zoom-in-95 duration-300">
                    <IntegratedWerkbonOverlay 
                        meldingId={activeWerkbonId} 
                        onClose={() => setActiveWerkbonId(null)} 
                        onCompleted={(id) => {
                            setCompletedObjects(prev => [...prev, id]);
                            setActiveWerkbonId(null);
                            if (navigationState === 'navigating') {
                                toast({ title: "Melding afgerond", description: "Route naar volgende punt wordt berekend..." });
                            }
                        }} 
                    />
                </div>
            </div>
        )}
    </div>
  );
}
