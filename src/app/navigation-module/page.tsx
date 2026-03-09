
'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef } from 'react-map-gl';
import { useCollection, useFirestore, useUser, useMemoFirebase, updateDocumentNonBlocking, useFirebaseApp, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, writeBatch, limit } from 'firebase/firestore';
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
  Tag,
  Phone,
  Paperclip,
  Briefcase,
  ChevronLeft,
  UploadCloud,
  Map as MapIcon,
  Hash,
  Minus
} from 'lucide-react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Object as MapObject, Melding, UploadedFile, MeldingTask, Hoeveelheid, Project } from '@/lib/types';
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
import { useProject } from '@/context/project-context';

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

const translationLanguages = [
  { code: 'nl-NL', name: 'Dutch', flag: 'nl', label: 'Nederlands' },
  { code: 'en-US', name: 'English', flag: 'us', label: 'Engels' },
  { code: 'pl-PL', name: 'Polish', flag: 'pl', label: 'Pools' },
  { code: 'uk-UA', name: 'Ukrainian', flag: 'ua', label: 'Oekraïens' },
  { code: 'de-DE', name: 'German', flag: 'de', label: 'Duits' },
  { code: 'hu-HU', name: 'Hungarian', flag: 'hu', label: 'Hongaars' },
];

function SectionRow({ 
    icon: Icon, 
    label, 
    value, 
    onClick 
}: { 
    icon: React.ElementType, 
    label: string, 
    value?: string | number, 
    onClick: () => void 
}) {
    return (
        <button 
            onClick={onClick}
            className="w-full flex items-center justify-between p-4 bg-white border-b border-slate-100 active:bg-slate-50 transition-colors"
        >
            <div className="flex items-center gap-4">
                <div className="bg-[#FF5722] p-2 rounded-lg">
                    <Icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-sm font-semibold text-slate-700">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                {value !== undefined && <span className="text-xs font-bold text-slate-400">{value}</span>}
                <ChevronRight className="h-4 w-4 text-slate-300" />
            </div>
        </button>
    );
}

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
    const router = useRouter();

    const [subView, setSubView] = React.useState<'main' | 'werkzaamheden' | 'map' | 'docs' | 'photos' | 'materials'>('main');
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
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = React.useState(false);
    const recognitionRef = React.useRef<any>(null);

    const meldingRef = useMemoFirebase(() => firestore ? doc(firestore, 'meldingen', meldingId) : null, [firestore, meldingId]);
    const { data: melding, isLoading } = useDoc<Melding>(meldingRef);

    const objectsQuery = useMemoFirebase(() => {
        if (!firestore || !melding) return null;
        return query(collection(firestore, 'objects'), limit(200));
    }, [firestore, melding]);
    
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
            setIsConfirmDialogOpen(false);
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

    if (isLoading || !melding) return <LoadingScreen message="Data laden..." />;

    const renderMainList = () => (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="bg-white p-6 space-y-4">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold text-slate-900">Intakenummer: {melding.intakenummer}</h2>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                <span>{melding.straatnaam} {melding.huisnummer}, {melding.postcode} {melding.plaats}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                <Tag className="h-3.5 w-3.5 text-slate-400" />
                                <span>{melding.hoofdcategorie} • {melding.subcategorie}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                <Hash className="h-3.5 w-3.5 text-slate-400" />
                                <span>{melding.containernummer || 'Geen unit gekoppeld'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                {melding.extra_informatie && (
                    <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-2">
                        <FileText className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <p className="text-xs font-medium text-slate-600 leading-relaxed italic">
                            "{melding.extra_informatie}"
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-4 flex-1">
                <SectionRow 
                    icon={Wrench} 
                    label="Werkzaamheden" 
                    value={afhandelingBijzonderheden ? 'Ingevuld' : ''} 
                    onClick={() => setSubView('werkzaamheden')} 
                />
                <SectionRow 
                    icon={MapIcon} 
                    label="Locatiegegevens" 
                    onClick={() => setSubView('map')} 
                />
                <SectionRow 
                    icon={Paperclip} 
                    label="Documenten" 
                    value={uploadedFiles.length > 0 ? `${uploadedFiles.length} files` : ''} 
                    onClick={() => setSubView('docs')} 
                />
                <SectionRow 
                    icon={Camera} 
                    label="Foto's" 
                    value={afhandelingFotos.length > 0 ? `${afhandelingFotos.length}` : ''} 
                    onClick={() => setSubView('photos')} 
                />
                <SectionRow 
                    icon={Briefcase} 
                    label="Materialen" 
                    value={hoeveelheden.length > 0 ? `${hoeveelheden.length} types` : ''} 
                    onClick={() => setSubView('materials')} 
                />
            </div>

            <div className="p-6 bg-slate-50">
                <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
                    <AlertDialogTrigger asChild>
                        <Button 
                            className="w-full h-14 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg transition-all bg-[#FF5722] hover:bg-[#E64A19] shadow-orange-600/20"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                "MELDING AFMELDEN"
                            )}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-lg rounded-3xl border-none">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="font-black uppercase tracking-tight">Melding afmelden?</AlertDialogTitle>
                            <AlertDialogDescription className="font-medium text-slate-500">
                                Weet u zeker dat u deze melding wilt afmelden en de werkbon wilt voltooien?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl font-bold">Annuleren</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={handleAfronden} 
                                className="bg-[#FF5722] hover:bg-[#E64A19] rounded-xl font-black uppercase tracking-tight"
                            >
                                Afmelden
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );

    const renderSubViewHeader = (title: string) => (
        <header className="h-16 bg-[#2C2E3E] text-white flex items-center justify-between px-4 shrink-0">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setSubView('main')}>
                <ArrowLeft className="h-6 w-6" />
            </Button>
            <h3 className="text-sm font-bold uppercase tracking-widest">{title}</h3>
            <div className="w-10" />
        </header>
    );

    return (
        <div className="flex flex-col h-full bg-white relative animate-in slide-in-from-right duration-300">
            {subView === 'main' ? (
                <>
                    <header className="h-16 bg-[#2C2E3E] text-white flex items-center justify-between px-4 shrink-0">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose}>
                            <ChevronLeft className="h-6 w-6" />
                        </Button>
                        <h3 className="text-sm font-bold uppercase tracking-widest">Werkbon</h3>
                        <div className="w-10" />
                    </header>
                    {renderMainList()}
                </>
            ) : (
                <div className="flex flex-col h-full overflow-hidden">
                    {subView === 'werkzaamheden' && (
                        <>
                            {renderSubViewHeader('Werkzaamheden')}
                            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Klacht omschrijving</Label>
                                    <div className="bg-slate-50 p-4 rounded-xl text-sm italic text-slate-600 border border-slate-100">
                                        "{melding.extra_informatie}"
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Uitvoeringsnotities</Label>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className={cn("h-8 rounded-full", isListening && "bg-red-50 text-red-600 border-red-200")} onClick={toggleListening}>
                                                {isListening ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Mic className="h-3 w-3 mr-2" />}
                                                Dictaat
                                            </Button>
                                            <Button variant="ghost" size="sm" className="h-8 text-primary font-bold text-[10px] uppercase" onClick={handleAITranslate} disabled={isTranslating || !afhandelingBijzonderheden}>
                                                <Sparkles className="h-3 w-3 mr-2" /> Vertaal
                                            </Button>
                                        </div>
                                    </div>
                                    <Textarea 
                                        className="min-h-[300px] rounded-2xl border-slate-200 p-4 text-base"
                                        placeholder="Noteer hier de voortgang of details..."
                                        value={afhandelingBijzonderheden}
                                        onChange={e => setAfhandelingBijzonderheden(e.target.value)}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                    {subView === 'map' && (
                        <>
                            {renderSubViewHeader('Locatie')}
                            <div className="flex-1 relative">
                                <MapboxView latitude={melding.latitude} longitude={melding.longitude} mainLocationLabel={melding.containernummer} interactive={true} objects={nearbyObjects} />
                            </div>
                        </>
                    )}
                    {subView === 'photos' && (
                        <>
                            {renderSubViewHeader("Foto's")}
                            <div className="flex-1 p-6 space-y-8 overflow-y-auto">
                                <div className="grid grid-cols-2 gap-4">
                                    <Button variant="outline" className="h-32 flex-col gap-3 rounded-2xl border-dashed border-2" onClick={() => document.getElementById('cam-input')?.click()}>
                                        <Camera className="h-8 w-8 text-slate-400" />
                                        <span className="text-xs font-bold uppercase">Nieuwe Foto</span>
                                    </Button>
                                    <Button variant="outline" className="h-32 flex-col gap-3 rounded-2xl border-dashed border-2" onClick={() => document.getElementById('gal-input')?.click()}>
                                        <ImageIcon className="h-8 w-8 text-slate-400" />
                                        <span className="text-xs font-bold uppercase">Galerij</span>
                                    </Button>
                                </div>
                                <input type="file" id="cam-input" className="hidden" accept="image/*" capture="environment" onChange={e => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                                <input type="file" id="gal-input" className="hidden" accept="image/*" multiple onChange={e => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                                
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {afhandelingFotos.map((p, i) => (
                                        <div key={i} className="relative aspect-square rounded-xl overflow-hidden border shadow-sm group">
                                            <Image src={p.url} alt="afhandeling" fill className="object-cover" />
                                            <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setAfhandelingFotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                    {subView === 'materials' && (
                        <>
                            {renderSubViewHeader('Materialen')}
                            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                                <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                                    <div className="grid gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Product</Label>
                                            <Input placeholder="Bv. Straatsteen..." value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} className="h-11 font-bold" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Aantal</Label>
                                            <Input type="number" placeholder="0" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} className="h-11 font-bold" />
                                        </div>
                                        <Button className="w-full h-11 font-black uppercase bg-[#FF5722]" onClick={() => { if(newHoeveelheidType && newHoeveelheidAantal) { setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); setNewHoeveelheidType(''); setNewHoeveelheidAantal(''); } }}>
                                            Toevoegen
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {hoeveelheden.map(h => (
                                        <div key={h.id} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold">{h.type}</span>
                                                <span className="text-[10px] text-slate-400 uppercase font-black">{h.eenheid}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-xl font-black text-primary">{h.aantal}</span>
                                                <Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600" onClick={() => setHoeveelheden(prev => prev.filter(x => x.id !== h.id))}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                    {subView === 'docs' && (
                        <>
                            {renderSubViewHeader('Documenten')}
                            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                                <Button variant="outline" className="w-full h-16 border-dashed border-2 rounded-xl gap-3" onClick={() => document.getElementById('sub-doc-input')?.click()}>
                                    <UploadCloud className="h-5 w-5 text-primary" /> Document Uploaden
                                </Button>
                                <input type="file" id="sub-doc-input" className="hidden" multiple onChange={e => e.target.files && handleFileUpload(e.target.files, 'documents')} />
                                <div className="grid gap-2">
                                    {uploadedFiles.map(f => (
                                        <div key={f.storagePath} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="flex items-center gap-3 truncate">
                                                <FileText className="h-5 w-5 text-blue-600" />
                                                <span className="text-xs font-bold truncate uppercase">{f.name}</span>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
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
  const { selectedProjectId, projects } = useProject();
  
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
  const [isCockpitExpanded, setIsCockpitExpanded] = React.useState(false);

  const [showTodayCompleted, setShowTodayCompleted] = React.useState(false);
  const [showAssignmentBubbles, setShowAssignmentBubbles] = React.useState(false);
  const [visibleColumns, setVisibleColumns] = React.useState<Record<string, boolean>>(ROUTE_COLUMNS_CONFIG);

  const [navZoom, setNavZoomState] = React.useState(18);
  const [navPitch, setNavPitchState] = React.useState(60);
  const [navOffset, setNavOffsetState] = React.useState(450);
  const [autoOpenEnabled, setAutoOpenEnabledState] = React.useState(false);
  const [dynamicZoomEnabled, setDynamicZoomEnabledState] = React.useState(true);

  const [smoothLocation, setSmoothLocation] = React.useState<any>(null);
  const lastHeadingRef = React.useRef(0);
  const [currentRouteGeometry, setCurrentRouteGeometry] = React.useState<any>(null);
  const [displayedRouteGeometry, setDisplayedRouteGeometry] = React.useState<any>(null);
  const [routeInfo, setRouteInfo] = React.useState<{ duration: number; distance: number } | null>(null);
  const [speedKmh, setSpeedKmh] = React.useState(0);
  const [currentSpeedLimit, setCurrentSpeedLimit] = React.useState<number>(50);
  const [isPaused, setIsPaused] = React.useState(false);

  const mapRef = React.useRef<MapRef>(null);
  const lastRouteCalculationLocationRef = React.useRef<{latitude: number, longitude: number} | null>(null);
  const lastFetchTimeRef = React.useRef<number>(0);

  // SMOOTHING AND LOCKING REFS
  const visualPosRef = React.useRef<{lng: number, lat: number} | null>(null);
  const lastSnappedPosRef = React.useRef<{lng: number, lat: number} | null>(null);

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
        if (profile.dynamicZoomEnabled !== undefined) setDynamicZoomEnabledState(!!profile.dynamicZoomEnabled);
    }
  }, [profile]);

  const selectedProject = React.useMemo(() => projects?.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);

  const activeMeldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw']),
      limit(100)
    );
  }, [firestore]);

  const { data: rawActiveMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(activeMeldingenQuery);

  const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
  const todayCompletedQuery = useMemoFirebase(() => {
    if (!firestore || !showTodayCompleted || debouncedSearchQuery) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', '==', 'Afgerond'),
      where('afhandeling_datum', '==', todayStr),
      limit(50)
    );
  }, [firestore, showTodayCompleted, debouncedSearchQuery, todayStr]);

  const { data: rawTodayCompleted } = useCollection<Melding>(todayCompletedQuery);

  const backendSearchQuery = useMemoFirebase(() => {
    if (!firestore || !debouncedSearchQuery) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('intakenummer', '>=', debouncedSearchQuery),
      where('intakenummer', '<=', debouncedSearchQuery + '\uf8ff'),
      limit(20)
    );
  }, [firestore, debouncedSearchQuery]);

  const { data: rawSearchResults } = useCollection<Melding>(backendSearchQuery);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProject?.objectFilter) return null;
    return query(
        collection(firestore, 'objects'), 
        where('locatieType', '==', selectedProject.objectFilter),
        limit(500)
    );
  }, [firestore, selectedProject?.objectFilter]);

  const { data: allMapObjects } = useCollection<MapObject>(objectsQuery);

  const filteredMeldingen = React.useMemo(() => {
    const poolMap = new Map<string, Melding>();
    
    rawActiveMeldingen?.forEach(m => {
        if (!completedObjects.includes(m.id)) poolMap.set(m.id, m);
    });

    rawTodayCompleted?.forEach(m => poolMap.set(m.id, m));
    rawSearchResults?.forEach(m => poolMap.set(m.id, m));

    let result = Array.from(poolMap.values());

    if (!isPrivileged) {
        const userName = profile?.displayName || profile?.email || 'Onbekend';
        result = result.filter(m => m.behandelaar === userName);
    }

    return result;
  }, [rawActiveMeldingen, rawTodayCompleted, rawSearchResults, isPrivileged, profile, completedObjects]);

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
            duration: 800, 
            maxZoom: 14,
            linear: false
        });
    } else {
        map.easeTo({ center: [startPos.longitude, startPos.latitude], zoom: 11, pitch: 0, duration: 800 });
    }
  }, [filteredMeldingen, userLocation]);

  const fetchRoute = React.useCallback(async (force = false) => {
    if (navigationState === 'setup' || sortedMissions.length === 0) {
        setCurrentRouteGeometry(null);
        setDisplayedRouteGeometry(null);
        setRouteInfo(null);
        return;
    }
    
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 3000) return;
    
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
            
            // Guess speed limit based on duration/distance if not explicitly provided
            // Average highway > 80, city ~ 50, zone ~ 30
            const avgSpeed = (route.distance / route.duration) * 3.6;
            if (avgSpeed > 70) setCurrentSpeedLimit(100);
            else if (avgSpeed > 45) setCurrentSpeedLimit(80);
            else if (avgSpeed > 25) setCurrentSpeedLimit(50);
            else setCurrentSpeedLimit(30);
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

  // VLOEIENDE INTERPOLATIE LOOP
  React.useEffect(() => {
    let animId: number;
    const updateVisualPos = () => {
        if (navigationState === 'navigating' && lastSnappedPosRef.current) {
            if (!visualPosRef.current) {
                visualPosRef.current = { ...lastSnappedPosRef.current };
            } else {
                // Interpolatie factor (boterzacht glijden)
                const factor = 0.08; 
                visualPosRef.current.lng += (lastSnappedPosRef.current.lng - visualPosRef.current.lng) * factor;
                visualPosRef.current.lat += (lastSnappedPosRef.current.lat - visualPosRef.current.lat) * factor;
            }
            setSmoothLocation((prev: any) => ({
                ...prev,
                longitude: visualPosRef.current?.lng,
                latitude: visualPosRef.current?.lat,
                heading: lastHeadingRef.current
            }));
        }
        animId = requestAnimationFrame(updateVisualPos);
    };
    animId = requestAnimationFrame(updateVisualPos);
    return () => cancelAnimationFrame(animId);
  }, [navigationState]);

  React.useEffect(() => {
    if (!navigator.geolocation || isSimulationMode) return;
    
    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setUserLocation(loc);
            
            const currentSpeed = pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 0;
            setSpeedKmh(currentSpeed);

            if (navigationState === 'navigating' && currentRouteGeometry) {
                try {
                    const line = turf.lineString(currentRouteGeometry.coordinates);
                    const currPt = turf.point([loc.longitude, loc.latitude]);
                    
                    // LOCK OP DE LIJN: We snappen ALTIJD naar de dichtstbijzijnde punt op de route
                    const snapped = turf.nearestPointOnLine(line, currPt);
                    
                    // Update snapped ref voor de interpolatie loop
                    lastSnappedPosRef.current = {
                        lng: snapped.geometry.coordinates[0],
                        lat: snapped.geometry.coordinates[1]
                    };

                    const alongRoute = turf.lineSlice(turf.point(currentRouteGeometry.coordinates[0]), snapped, line);
                    const distAlong = turf.length(alongRoute, { units: 'meters' });
                    const ahead = turf.along(line, distAlong + 15, { units: 'meters' });
                    const calculatedHeading = (turf.bearing(snapped, ahead) + 360) % 360;
                    lastHeadingRef.current = calculatedHeading;

                    const forwardPart = turf.lineSlice(snapped, turf.point(currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1]), line);
                    setDisplayedRouteGeometry(forwardPart);

                    // Re-calculate route if too far off
                    const distanceOffRoute = turf.pointToLineDistance(currPt, line, { units: 'meters' });
                    if (distanceOffRoute > 60 && !isCalculatingRoute) {
                        fetchRoute(true);
                    }
                } catch (e) {}
            } else {
                setSmoothLocation({ ...loc, heading: lastHeadingRef.current });
            }

            if (navigationState === 'navigating' && mapRef.current && !isManualMode && visualPosRef.current) {
                const map = mapRef.current.getMap();
                const targetZoom = dynamicZoomEnabled 
                    ? Math.max(15, Math.min(19, 19 - (currentSpeed / 25)))
                    : navZoom;

                map.easeTo({
                    center: [visualPosRef.current.lng, visualPosRef.current.lat],
                    bearing: lastHeadingRef.current,
                    zoom: targetZoom,
                    pitch: navPitch,
                    padding: { top: 0, bottom: Math.max(0, navOffset), left: 0, right: 0 },
                    duration: 1000, 
                    easing: (t) => t 
                });
            }
        },
        (err) => console.error("GPS Error:", err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigationState, isSimulationMode, currentRouteGeometry, isManualMode, navPitch, navOffset, isCalculatingRoute, fetchRoute, dynamicZoomEnabled, navZoom]);

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

  const updateNavZoom = (newZoom: number) => {
    const val = Number(Math.max(10, Math.min(22, newZoom)));
    setNavZoomState(val);
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navZoom: val }, { merge: true });
    if (!dynamicZoomEnabled) {
        mapRef.current?.getMap().jumpTo({ zoom: val });
    }
  };

  const setAutoOpenEnabled = (val: boolean) => {
    setAutoOpenEnabledState(val);
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { autoOpenEnabled: val }, { merge: true });
  };

  const setDynamicZoomEnabled = (val: boolean) => {
    setDynamicZoomEnabledState(val);
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { dynamicZoomEnabled: val }, { merge: true });
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
    visualPosRef.current = null;
    lastSnappedPosRef.current = null;

    setIsLocating(true);
    const beginNavigation = (loc: { latitude: number, longitude: number }, heading: number) => {
        const startPos = { ...loc, heading };
        setSmoothLocation(startPos);
        lastSnappedPosRef.current = { lng: loc.longitude, lat: loc.latitude };
        visualPosRef.current = { lng: loc.longitude, lat: loc.latitude };
        
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
    setCurrentRouteGeometry(null);
    setDisplayedRouteGeometry(null);
    setRouteInfo(null);
    setIsManualMode(false);
    visualPosRef.current = null;
    lastSnappedPosRef.current = null;
    
    const map = mapRef.current?.getMap();
    if (map) {
        map.jumpTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 0 });
        setTimeout(() => goToOverview(), 50);
    }
  };

  const handleHervatNavigatie = () => {
    setIsManualMode(false);
    if (mapRef.current && smoothLocation) {
        mapRef.current.getMap().flyTo({
            center: [smoothLocation.longitude, smoothLocation.latitude],
            zoom: 18,
            pitch: navPitch,
            bearing: lastHeadingRef.current,
            padding: { top: 0, bottom: Math.max(0, navOffset), left: 0, right: 0 },
            duration: 1000
        });
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
                onMove={(evt) => {
                    if (evt.originalEvent) {
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
                            {showAssignmentBubbles && m.behandelaar && (
                                <div className="absolute bottom-full mb-2 bg-white/95 backdrop-blur-md border-2 border-slate-900 px-2 py-0.5 rounded-full shadow-xl animate-in zoom-in duration-200 z-[60] whitespace-nowrap">
                                    <span className="text-[8px] font-black uppercase text-slate-900 leading-none">{m.behandelaar}</span>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-slate-900" />
                                </div>
                            )}
                            {nextMission?.id === m.id && navigationState === 'navigating' && (
                                <div className="absolute inset-0 rounded-full border-[4px] border-slate-900 animate-pulse opacity-80" />
                            )}
                            <div className="transition-transform hover:scale-125 cursor-pointer z-10 relative">
                                <img 
                                    src="https://i.ibb.co/0jg4jm6v/3d-printer-icon-sharp.png" 
                                    alt="task" 
                                    className={cn("h-10 w-10 object-contain drop-shadow-2xl", m.status === 'Afgerond' && "opacity-60 grayscale-[0.3]")} 
                                />
                                {m.status === 'Afgerond' ? (
                                    <div className="absolute -top-1.5 -right-1.5 bg-green-500 rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-lg overflow-hidden animate-in zoom-in duration-300">
                                        <Check className="h-3.5 w-3.5 text-white" />
                                    </div>
                                ) : (
                                    <div className="absolute -top-1.5 -right-1.5 bg-yellow-400 rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-lg overflow-hidden">
                                        <Wrench className="h-3.5 w-3.5 text-slate-900" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </Marker>
                ))}
                {navigationState === 'navigating' && displayedRouteGeometry && (
                    <Source id="route-line" type="geojson" data={displayedRouteGeometry}>
                        <Layer {...routeLayerCasing} />
                        <Layer {...routeLayer} />
                    </Source>
                )}
                {allMapObjects?.map(obj => (
                    <Marker key={`obj-${obj.id}`} longitude={obj.longitude} latitude={obj.latitude} anchor="center">
                        <div className="h-1 w-1 bg-slate-400 rounded-full opacity-40" />
                    </Marker>
                ))}
            </MapGL>
        </div>

        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between pointer-events-none">
            <div className="flex flex-col gap-3 pointer-events-auto">
                {navigationState === 'setup' && (
                    <Button 
                        variant="secondary" 
                        size="icon" 
                        className="h-12 md:h-14 w-12 md:w-14 rounded-2xl shadow-2xl bg-white/90 backdrop-blur-sm border-2 border-slate-100 transition-all active:scale-95 flex items-center justify-center"
                        onClick={() => router.push('/?module=issues')}
                    >
                        <ArrowLeft className="h-6 w-6 text-slate-600" />
                    </Button>
                )}
                
                {navigationState === 'navigating' && routeInfo && (
                    <div className="bg-white/95 backdrop-blur-md px-5 h-12 md:h-14 rounded-2xl shadow-2xl border-2 border-slate-100 flex items-center gap-5 min-w-fit animate-in slide-in-from-left-4 duration-500">
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Vertrek</span>
                            <span className="text-lg font-black text-slate-900 leading-none">{formatDate(new Date(), 'HH:mm')}</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Aankomst</span>
                            <span className="text-lg font-black text-primary-foreground leading-none">
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
                            <Button variant="secondary" size="icon" className="h-12 md:h-14 w-12 md:w-14 rounded-2xl shadow-2xl bg-white/90 backdrop-blur-sm border-2 border-slate-100 transition-all active:scale-95">
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
                                            <Label className="text-[10px] font-black uppercase text-slate-900">Dynamisch zoomen</Label>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">Past zoom aan op snelheid</p>
                                        </div>
                                        <Switch checked={dynamicZoomEnabled} onCheckedChange={setDynamicZoomEnabled} />
                                    </div>

                                    {!dynamicZoomEnabled && (
                                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                            <div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase text-slate-400">Vaste zoomhoogte</Label><span className="text-[10px] font-bold text-primary">{navZoom.toFixed(1)}</span></div>
                                            <div className="flex items-center gap-2">
                                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateNavZoom(navZoom - 0.5)}>
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                                <div className="flex-1">
                                                    <Slider value={[navZoom]} min={10} max={22} step={0.5} onValueChange={([val]) => updateNavZoom(val)} />
                                                </div>
                                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateNavZoom(navZoom + 0.5)}>
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}

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

        {isManualMode && (
            <div className={cn(
                "absolute z-50 pointer-events-auto animate-in fade-in slide-in-from-right-2 duration-300",
                navigationState === 'setup' ? "bottom-[260px] right-4" : "bottom-[180px] right-6"
            )}>
                {navigationState === 'setup' ? (
                    <Button 
                        variant="secondary" 
                        size="icon"
                        className="h-12 w-12 rounded-2xl shadow-2xl bg-white/95 backdrop-blur-md border-2 border-slate-100 transition-all active:scale-95"
                        onClick={() => {
                            setIsManualMode(false);
                            goToOverview();
                        }}
                    >
                        <MapIcon className="h-6 w-6 text-primary" />
                    </Button>
                ) : !activeWerkbonId && (
                    <Button 
                        variant="secondary" 
                        size="icon"
                        className="h-14 w-14 rounded-[1.25rem] shadow-2xl bg-white/95 backdrop-blur-md border-2 border-slate-100 transition-all active:scale-95 flex items-center justify-center"
                        onClick={handleHervatNavigatie}
                    >
                        <Navigation className="h-7 w-7 text-primary fill-current" />
                    </Button>
                )}
            </div>
        )}

        {navigationState === 'navigating' && !activeWerkbonId && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-[95%] max-w-2xl animate-in slide-in-from-bottom-10 duration-700 pointer-events-none">
                <div className="mb-4 flex justify-start items-center gap-3 pointer-events-auto">
                    <div className="relative">
                        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-[4px] sm:border-[6px] border-primary flex flex-col items-center justify-center bg-white/95 backdrop-blur-md shadow-2xl shrink-0">
                            <span className="text-xl sm:text-3xl font-black text-slate-900 leading-none">{speedKmh}</span>
                            <span className="text-[8px] sm:text-[10px] font-black uppercase text-primary">km/h</span>
                        </div>
                        <div className="absolute -top-1 -right-1 h-7 w-7 sm:h-9 sm:w-9 rounded-full border-[3px] sm:border-[4px] border-red-600 flex items-center justify-center bg-white shadow-xl shrink-0 animate-in fade-in zoom-in duration-500 z-10">
                            <span className="text-[10px] sm:text-xs font-black text-slate-900">{currentSpeedLimit}</span>
                        </div>
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
                                        <div className="flex flex-col items-end">
                                            <p className="text-[8px] font-black uppercase text-slate-400 mb-0.5">Objectnummer</p>
                                            <Badge variant="secondary" className="text-[10px] h-6 font-black uppercase bg-yellow-400 text-slate-900 border-2 border-white shadow-sm px-2">
                                                {nextMission.containernummer}
                                            </Badge>
                                        </div>
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
                                    {nextMission?.straatnaam} {nextMission?.huisnummer} {nextMission?.postcode} {nextMission?.plaats}
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
                        <Input 
                            placeholder="Zoek nummer..." 
                            className="h-8 pl-8 text-[10px] font-bold rounded-xl border-slate-200 bg-white focus:ring-primary/20" 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)} 
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar ml-auto">
                        <Button variant={showTodayCompleted ? "default" : "outline"} size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200" onClick={() => { setShowTodayCompleted(!showTodayCompleted); setIsManualMode(false); }}>
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
                                    <p className="font-bold text-[11px] text-slate-900 truncate">
                                        {[m.straatnaam, m.huisnummer, m.postcode, m.plaats].filter(Boolean).join(' ')}
                                    </p>
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
                                        {visibleColumns.locatie && <TableCell className="font-bold border-r border-slate-100 px-2 py-1 truncate max-w-[200px]">{m.straatnaam} {m.huisnummer} {m.postcode} {m.plaats}</TableCell>}
                                        {visibleColumns.memo && <TableCell className="font-medium italic text-slate-500 border-r border-slate-100 px-2 py-1 truncate max-w-[350px]">"{m.extra_informatie || '-'}"</TableCell>}
                                        {visibleColumns.hoofdcategorie && <TableCell className="font-black uppercase text-slate-400 border-r border-slate-100 px-2 py-1">{m.hoofdcategorie}</TableCell>}
                                        {visibleColumns.subcategorie && <TableCell className="font-bold border-r border-slate-100 px-2 py-1 truncate max-w-[150px]">{m.subcategorie}</TableCell>}
                                        {visibleColumns.werkgebied && <TableCell className="font-black text-primary border-r border-slate-100 px-2 py-1">{m.werkgebied || m.wijk || '-'}</TableCell>}
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
                        setCurrentRouteGeometry(null); 
                        setDisplayedRouteGeometry(null);
                        setRouteInfo(null);
                        setCompletedObjects(prev => [...prev, id]);
                        setActiveWerkbonId(null);
                        setIsManualMode(false); 
                        setTimeout(() => fetchRoute(true), 150);
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
