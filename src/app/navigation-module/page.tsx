'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MapGL, { Marker, Source, Layer, type MapRef, Popup } from 'react-map-gl';
import { 
  useCollection, 
  useFirestore, 
  useUser, 
  useMemoFirebase, 
  updateDocumentNonBlocking, 
  useFirebaseApp, 
  useDoc, 
  setDocumentNonBlocking,
  addDocumentNonBlocking 
} from '@/firebase';
import { collection, doc, query, where, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue,
} from '@/components/ui/select';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Play, 
  CheckCircle2, 
  MapPin, 
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
  Trash2,
  User,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Map as MapIcon,
  Hash,
  Minus,
  Plus,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Wrench,
  Paperclip,
  ImageIcon,
  Settings,
  Sliders,
  Maximize,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Tag
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Object as MapObject, Melding, UploadedFile, Hoeveelheid, Project as ProjectType, RouteAssignment } from '@/lib/types';
import { cn } from '@/lib/utils';
import * as turf from '@turf/turf';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/firebase/profile-provider';
import { useToast } from '@/components/ui/use-toast';
import { addSeconds, format as formatDate } from 'date-fns';
import { nl } from 'date-fns/locale';
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
import Image from 'next/image';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/context/project-context';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';
const SIMULATION_START_LOCATION = { latitude: 52.2644, longitude: 4.7242 };

const routeLayer: any = {
  id: 'route',
  type: 'line',
  source: 'route-line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#007AFF', 'line-width': 8, 'line-opacity': 0.8 },
};

const routeLayerCasing: any = {
  id: 'route-casing',
  type: 'line',
  source: 'route-line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#007AFF', 'line-width': 12, 'line-opacity': 0.2 },
};

function SectionRow({ 
    icon: Icon, 
    label, 
    value, 
    badgeCount,
    onClick 
}: { 
    icon: React.ElementType, 
    label: string, 
    value?: string | number, 
    badgeCount?: number,
    onClick: () => void 
}) {
    return (
        <button 
            onClick={onClick}
            className="w-full flex items-center justify-between p-4 bg-white border-b border-slate-100 active:bg-slate-50 transition-colors"
        >
            <div className="flex items-center gap-4">
                <div className="relative">
                    <div className="bg-primary p-2 rounded-xl shadow-sm">
                        <Icon className="h-5 w-5 text-white" />
                    </div>
                    {badgeCount !== undefined && badgeCount > 0 && (
                        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                            {badgeCount}
                        </div>
                    )}
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

    const [subView, setSubView] = useState<'main' | 'werkzaamheden' | 'map' | 'docs' | 'photos' | 'materials'>('main');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [afhandelingBijzonderheden, setAfhandelingBijzonderheden] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [hoeveelheden, setHoeveelheden] = useState<Hoeveelheid[]>([]);
    const [newHoeveelheidType, setNewHoeveelheidType] = useState('');
    const [newHoeveelheidAantal, setNewHoeveelheidAantal] = useState('');
    
    const [afhandelingFotos, setAfhandelingFotos] = useState<UploadedFile[]>([]);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
    
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [zoomScale, setZoomScale] = useState(1);
    const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
    const lastTouchRef = useRef<{ dist: number; center: { x: number; y: number } } | null>(null);
    
    const recognitionRef = useRef<any>(null);

    const meldingRef = useMemoFirebase(() => (firestore && user) ? doc(firestore, 'meldingen', meldingId) : null, [firestore, user, meldingId]);
    const { data: melding, isLoading } = useDoc<Melding>(meldingRef);

    const objectsQuery = useMemoFirebase(() => {
        if (!firestore || !user || !melding) return null;
        return query(collection(firestore, 'objects'), limit(200));
    }, [firestore, user, melding]);
    
    const { data: allObjects } = useCollection<MapObject>(objectsQuery);

    const nearbyObjects = useMemo(() => {
        if (!allObjects || !melding) return [];
        const issuePt = turf.point([melding.longitude, melding.latitude]);
        return allObjects.filter(obj => {
            if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
            const objPt = turf.point([obj.longitude, obj.latitude]);
            return turf.distance(issuePt, objPt, { units: 'meters' }) <= 100;
        });
    }, [allObjects, melding]);

    useEffect(() => {
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

    const handleFileUpload = useCallback(async (files: FileList | File[], type: 'documents' | 'afhandeling_fotos') => {
        if (!files || !meldingId || !app) return;
        const storage = getStorage(app);
        for (const file of Array.from(files)) {
          const path = `meldingen/${meldingId}/${type}/${Date.now()}-${file.name}`;
          const uploadTask = uploadBytesResumable(ref(storage, path), file);
          uploadTask.on('state_changed', 
            () => {},
            () => {},
            () => getDownloadURL(uploadTask.snapshot.ref).then(url => {
                const uploaded: UploadedFile = { name: file.name, url, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath: path };
                if (type === 'documents') setUploadedFiles(prev => [...prev, uploaded]);
                else setAfhandelingFotos(prev => [...prev, uploaded]);
            })
          );
        }
    }, [meldingId, app]);

    const toggleListening = () => {
        if (typeof window === 'undefined') return;
        if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const recognition = new SpeechRecognition();
        recognition.lang = 'nl-NL';
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

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            const center = { x: (touch1.clientX + touch2.clientX) / 2, y: (touch1.clientY + touch2.clientY) / 2 };
            lastTouchRef.current = { dist, center };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && lastTouchRef.current) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            const deltaScale = dist / lastTouchRef.current.dist;
            setZoomScale(prev => Math.max(1, Math.min(5, prev * deltaScale)));
            lastTouchRef.current.dist = dist;
        }
    };

    const handleTouchEnd = () => { lastTouchRef.current = null; };

    if (isLoading || !melding) return <LoadingScreen message="Data laden..." />;

    const renderMainList = () => (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="bg-white p-6 space-y-4 shadow-sm border-b">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Melding: {melding.intakenummer}</h2>
                        <div className="space-y-1.5 pt-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                <MapPin className="h-3.5 w-3.5 text-primary" />
                                <span>{melding.straatnaam} {melding.huisnummer}, {melding.postcode} {melding.plaats}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                <Tag className="h-3.5 w-3.5 text-primary" />
                                <span className="uppercase tracking-tight">{melding.hoofdcategorie} • {melding.subcategorie}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                <Hash className="h-3.5 w-3.5 text-primary" />
                                <span className="font-mono">{melding.containernummer || 'Geen unit'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                {melding.extra_informatie && (
                    <div className="mt-4 p-4 bg-blue-50/50 rounded-2xl border-2 border-blue-100/50 flex items-start gap-3">
                        <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <p className="text-xs font-medium text-slate-700 leading-relaxed italic">
                            "{melding.extra_informatie}"
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-4 flex-1">
                <SectionRow icon={Wrench} label="Werkzaamheden" value={afhandelingBijzonderheden ? 'Ingevuld' : ''} onClick={() => setSubView('werkzaamheden')} />
                <SectionRow icon={MapIcon} label="Locatiegegevens" onClick={() => setSubView('map')} />
                <SectionRow icon={Paperclip} label="Documenten" badgeCount={uploadedFiles.length} onClick={() => setSubView('docs')} />
                <SectionRow icon={Camera} label="Foto's" badgeCount={afhandelingFotos.length + (melding.fotos?.length || 0)} onClick={() => setSubView('photos')} />
                <SectionRow icon={Briefcase} label="Materialen" badgeCount={hoeveelheden.length} onClick={() => setSubView('materials')} />
            </div>

            <div className="p-6 bg-slate-50">
                <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
                    <AlertDialogTrigger asChild>
                        <Button className="w-full h-14 text-white font-black uppercase tracking-widest rounded-3xl shadow-2xl bg-orange-600 hover:bg-orange-700 transition-all active:scale-95" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "AFMELDEN"}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-lg rounded-[2.5rem] border-none shadow-2xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="font-black uppercase tracking-tight">Melding afmelden?</AlertDialogTitle>
                            <AlertDialogDescription className="font-medium text-slate-500">De werkbon wordt voltooid en de rit wordt hervat.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2">
                            <AlertDialogCancel className="rounded-2xl font-bold border-2">Annuleren</AlertDialogCancel>
                            <AlertDialogAction onClick={handleAfronden} className="bg-orange-600 hover:bg-orange-700 rounded-2xl font-black uppercase tracking-tight h-11 px-8">Afmelden</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );

    const renderSubViewHeader = (title: string) => (
        <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-4 shrink-0">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-10 w-10" onClick={() => setSubView('main')}><ArrowLeft className="h-6 w-6" /></Button>
            <h3 className="text-sm font-black uppercase tracking-[0.2em]">{title}</h3>
            <div className="w-10" />
        </header>
    );

    return (
        <div className="flex flex-col h-full bg-white relative animate-in slide-in-from-right duration-300">
            {subView === 'main' ? (
                <>
                    <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-4 shrink-0">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-10 w-10" onClick={onClose}><ChevronLeft className="h-6 w-6" /></Button>
                        <h3 className="text-sm font-black uppercase tracking-[0.2em]">WERKBON</h3>
                        <div className="w-10" />
                    </header>
                    {renderMainList()}
                </>
            ) : (
                <div className="flex flex-col h-full overflow-hidden">
                    {subView === 'werkzaamheden' && (
                        <>
                            {renderSubViewHeader('UITVOERING')}
                            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Oorspronkelijke melding</Label>
                                    <div className="bg-slate-50 p-5 rounded-3xl text-sm italic text-slate-600 border-2 border-slate-100 shadow-inner leading-relaxed">"{melding.extra_informatie}"</div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Uw Notities</Label>
                                        <Button variant={isListening ? "destructive" : "secondary"} size="icon" className={cn("h-16 w-16 rounded-full shadow-2xl transition-all active:scale-90 border-4 border-white", isListening && "animate-pulse ring-4 ring-red-500/20")} onClick={toggleListening}>
                                            {isListening ? <Loader2 className="h-8 w-8 animate-spin" /> : <Mic className="h-8 w-8 text-primary" />}
                                        </Button>
                                    </div>
                                    <Textarea className="min-h-[350px] rounded-3xl border-2 border-slate-100 p-6 text-base font-medium shadow-inner focus:ring-primary/20" placeholder="Beschrijf de verrichte werkzaamheden..." value={afhandelingBijzonderheden} onChange={e => setAfhandelingBijzonderheden(e.target.value)} />
                                </div>
                            </div>
                        </>
                    )}
                    {subView === 'map' && (
                        <>
                            {renderSubViewHeader('KAART')}
                            <div className="flex-1 relative">
                                <MapboxView latitude={melding.latitude} longitude={melding.longitude} mainLocationLabel={melding.containernummer} interactive={true} objects={nearbyObjects} />
                            </div>
                        </>
                    )}
                    {subView === 'photos' && (
                        <>
                            {renderSubViewHeader("FOTO'S")}
                            <div className="flex-1 p-6 space-y-8 overflow-y-auto">
                                <div className="space-y-4">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Melding Foto's</Label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {melding.fotos && melding.fotos.length > 0 ? (
                                            melding.fotos.map((p, i) => (
                                                <div key={`bron-${i}`} className="relative aspect-square rounded-[2rem] overflow-hidden border-2 border-slate-100 shadow-lg cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => { setZoomScale(1); setZoomOffset({x:0, y:0}); setPreviewImage(p.url); }}>
                                                    <Image src={p.url} alt="bron" fill className="object-cover" />
                                                </div>
                                            ))
                                        ) : (
                                            <div className="col-span-full py-12 text-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                                                <ImageIcon className="h-10 w-10 text-slate-300 mx-auto mb-2 opacity-20" />
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Geen foto's beschikbaar</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Separator className="bg-slate-100" />
                                <div className="space-y-4">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Nieuwe Foto's</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Button variant="outline" className="h-36 flex-col gap-3 rounded-[2.5rem] border-dashed border-2 border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-primary/30 transition-all" onClick={() => document.getElementById('cam-input')?.click()}><Camera className="h-10 w-10 text-primary" /><span className="text-[10px] font-black uppercase tracking-widest">Camera</span></Button>
                                        <Button variant="outline" className="h-36 flex-col gap-3 rounded-[2.5rem] border-dashed border-2 border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-primary/30 transition-all" onClick={() => document.getElementById('gal-input')?.click()}><ImageIcon className="h-10 w-10 text-primary" /><span className="text-[10px] font-black uppercase tracking-widest">Gallerij</span></Button>
                                    </div>
                                    <input type="file" id="cam-input" className="hidden" accept="image/*" capture="environment" onChange={e => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                                    <input type="file" id="gal-input" className="hidden" accept="image/*" multiple onChange={e => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {afhandelingFotos.map((p, i) => (
                                            <div key={`new-${i}`} className="relative aspect-square rounded-[2rem] overflow-hidden border-2 border-slate-100 shadow-xl group cursor-pointer" onClick={() => { setZoomScale(1); setZoomOffset({x:0, y:0}); setPreviewImage(p.url); }}>
                                                <Image src={p.url} alt="afhandeling" fill className="object-cover" />
                                                <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg border-2 border-white" onClick={(e) => { e.stopPropagation(); setAfhandelingFotos(prev => prev.filter(x => x.storagePath !== p.storagePath)); }}><X className="h-4 w-4" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                    {subView === 'materials' && (
                        <>
                            {renderSubViewHeader('MATERIALEN')}
                            <div className="flex-1 p-6 space-y-8 overflow-y-auto">
                                <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
                                    <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                        <Briefcase className="h-6 w-6 text-primary" />
                                        <h3 className="text-base font-black uppercase tracking-tight">Toevoegen Verbruik</h3>
                                    </div>
                                    <div className="grid gap-5">
                                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Product / Materiaal</Label><Input placeholder="Bv. Straatkolk..." value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} className="h-12 bg-white/10 border-none text-white font-black uppercase text-sm rounded-2xl focus:ring-primary/30" /></div>
                                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Aantal</Label><Input type="number" placeholder="0" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} className="h-12 bg-white/10 border-none text-white font-black uppercase text-sm rounded-2xl focus:ring-primary/30 text-center" /></div>
                                        <Button className="w-full h-14 font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90 rounded-2xl shadow-xl transition-all active:scale-95 mt-2" onClick={() => { if(newHoeveelheidType && newHoeveelheidAantal) { setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); setNewHoeveelheidType(''); setNewHoeveelheidAantal(''); } }}>TOEVOEGEN</Button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {hoeveelheden.map(h => (
                                        <div key={h.id} className="flex justify-between items-center p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm transition-all hover:shadow-md">
                                            <div className="flex flex-col"><span className="text-sm font-black uppercase tracking-tight text-slate-900">{h.type}</span><span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{h.eenheid}</span></div>
                                            <div className="flex items-center gap-6"><span className="text-3xl font-black text-primary leading-none tabular-nums">{h.aantal}</span><Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600 rounded-full h-10 w-10 hover:bg-red-50" onClick={() => setHoeveelheden(prev => prev.filter(x => x.id !== h.id))}><Trash2 className="h-5 w-5" /></Button></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                    {subView === 'docs' && (
                        <>
                            {renderSubViewHeader('DOCUMENTEN')}
                            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                                <Button variant="outline" className="w-full h-24 border-dashed border-2 border-slate-200 rounded-[2.5rem] bg-slate-50/50 hover:bg-slate-50 hover:border-primary/30 transition-all gap-4 shadow-sm" onClick={() => document.getElementById('sub-doc-input')?.click()}><UploadCloud className="h-8 w-8 text-primary" /> <span className="text-[10px] font-black uppercase tracking-widest">Document Uploaden</span></Button>
                                <input type="file" id="sub-doc-input" className="hidden" multiple onChange={e => e.target.files && handleFileUpload(e.target.files, 'documents')} />
                                <div className="grid gap-3">
                                    {uploadedFiles.map(f => (
                                        <div key={f.storagePath} className="flex items-center justify-between p-5 bg-white rounded-3xl border-2 border-slate-100 shadow-sm transition-all hover:border-primary/20">
                                            <div className="flex items-center gap-4 truncate"><div className="bg-blue-100 p-3 rounded-2xl"><FileText className="h-6 w-6 text-blue-600" /></div><span className="text-xs font-black truncate uppercase tracking-tight text-slate-900">{f.name}</span></div>
                                            <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-red-600 rounded-full hover:bg-red-50" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-5 w-5" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {previewImage && (
                <div 
                    className="fixed inset-0 z-[200] bg-black/95 flex flex-col animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <div className="flex justify-end p-6 shrink-0">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-12 w-12 border-2 border-white/20">
                            <X className="h-8 w-8" />
                        </Button>
                    </div>
                    <div className="flex-1 relative flex items-center justify-center overflow-hidden touch-none">
                        <img 
                            src={previewImage} 
                            alt="Preview" 
                            className="max-w-full max-h-full object-contain shadow-2xl transition-transform duration-75"
                            style={{ transform: `scale(${zoomScale}) translate(${zoomOffset.x}px, ${zoomOffset.y}px)`, transformOrigin: 'center center' }}
                            onClick={(e) => e.stopPropagation()} 
                        />
                    </div>
                    <div className="p-8 flex justify-center shrink-0">
                        <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px] uppercase font-black tracking-widest px-4 h-8 backdrop-blur-md rounded-full">{zoomScale > 1 ? `Zoom: ${zoomScale.toFixed(1)}x` : 'Knijp om te zoomen'}</Badge>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function StartNavigationPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useProfile();
  const { setIsHeaderVisible } = useNavigationUI();
  const { toast } = useToast();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  
  const type = searchParams.get('type'); 
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const isPrivileged = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';
  
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [navigationState, setNavigationState] = useState<'setup' | 'navigating'>('setup');
  const [startTime, setStartTime] = useState<string | null>(null);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [activeWerkbonId, setActiveWerkbonId] = useState<string | null>(null);
  const [clickedMarkerId, setClickedMarkerId] = useState<string | null>(null);
  const [priorityMissionId, setPriorityMissionId] = useState<string | null>(null);
  const [completedObjects, setCompletedObjects] = useState<string[]>([]);
  const [isManualMode, setIsManualMode] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [isCockpitExpanded, setIsCockpitExpanded] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [showTodayCompleted, setShowTodayCompleted] = useState(false);
  const [showAssignmentBubbles, setShowAssignmentBubbles] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    intakenummer: true,
    locatie: true,
    memo: true,
    hoofdcategorie: true,
    subcategorie: true,
    werkgebied: true,
    afstand: true
  });

  const [navZoom, setNavZoomState] = useState(18);
  const [navPitch, setNavPitchState] = useState(60);
  const [navOffset, setNavOffsetState] = useState(450);
  const [autoOpenEnabled, setAutoOpenEnabledState] = useState(true);
  const [dynamicZoomEnabled, setDynamicZoomEnabledState] = useState(true);

  const [smoothLocation, setSmoothLocation] = useState<any>(null);
  const lastHeadingRef = useRef(0);
  const visualHeadingRef = useRef(0);
  const [currentRouteGeometry, setCurrentRouteGeometry] = useState<any>(null);
  const [displayedRouteGeometry, setDisplayedRouteGeometry] = useState<any>(null);
  const [routeInfo, setRouteInfo] = useState<{ duration: number; distance: number } | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);

  const mapRef = useRef<MapRef>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const autoOpenTimerRef = useRef<NodeJS.Timeout | null>(null);

  const targetPosRef = useRef<{lng: number, lat: number} | null>(null);
  const visualPosRef = useRef<{lng: number, lat: number} | null>(null);

  const [sortConfig, setSortConfig] = useState<{ field: string; order: 'asc' | 'desc' }>({ 
    field: 'afstand', 
    order: 'asc' 
  });

  useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  const optionsRef = useMemoFirebase(() => (firestore && user) ? doc(firestore, 'settings', 'issue_options') : null, [firestore, user]);
  const { data: dbOptions } = useDoc<any>(optionsRef);
  const categoryIcons = dbOptions?.categoryIcons || {};

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects } = useCollection<ProjectType>(projectsQuery);
  const currentProject = projects?.find(p => p.id === selectedProjectId);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore || !user || type === 'meldingen') return null;
    return collection(firestore, 'objects');
  }, [firestore, user, type]);
  const { data: allObjects } = useCollection<MapObject>(objectsQuery);

  const activeMeldingenQuery = useMemoFirebase(() => {
    if (!firestore || !user || type !== 'meldingen') return null;
    return query(collection(firestore, 'meldingen'), where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw']), limit(100));
  }, [firestore, user, type]);
  const { data: rawActiveMeldingen } = useCollection<Melding>(activeMeldingenQuery);

  const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
  const assignmentsQuery = useMemoFirebase(() => {
    if (!firestore || !user || !selectedProjectId) return null;
    return query(
        collection(firestore, 'route_assignments'), 
        where('userId', '==', user.uid),
        where('projectId', '==', selectedProjectId),
        where('date', '==', todayStr),
        where('status', '!=', 'Completed')
    );
  }, [firestore, user, selectedProjectId, todayStr]);

  const { data: assignments } = useCollection<RouteAssignment>(assignmentsQuery);

  useEffect(() => {
    if (assignments && assignments.length > 0 && navigationState === 'setup') {
        const assignment = assignments[0];
        if (assignment.routeType === 'veegroutes' && type === 'veegroutes') {
            setSelectedRouteId(assignment.routeId);
        } else if (assignment.routeType === 'prullenbakken' && type === 'prullenbakken') {
            setSelectedRouteId(assignment.routeId);
        }
    }
  }, [assignments, navigationState, type]);

  useEffect(() => {
    if (profile) {
        if (profile.navZoom !== undefined) setNavZoomState(Number(profile.navZoom));
        if (profile.navPitch !== undefined) setNavPitchState(Number(profile.navPitch));
        if (profile.navOffset !== undefined) setNavOffsetState(Number(profile.navOffset));
        if (profile.navColumns) setVisibleColumns(profile.navColumns);
        if (profile.autoOpenEnabled !== undefined) setAutoOpenEnabledState(!!profile.autoOpenEnabled);
        if (profile.dynamicZoomEnabled !== undefined) setDynamicZoomEnabledState(!!profile.dynamicZoomEnabled);
        if (profile.navSortConfig) setSortConfig(profile.navSortConfig);
    }
  }, [profile]);

  const todayCompletedQuery = useMemoFirebase(() => {
    if (!firestore || !user || !showTodayCompleted || type !== 'meldingen') return null;
    return query(collection(firestore, 'meldingen'), where('status', '==', 'Afgerond'), where('afhandeling_datum', '==', todayStr), limit(50));
  }, [firestore, user, showTodayCompleted, todayStr, type]);

  const { data: rawTodayCompleted } = useCollection<Melding>(todayCompletedQuery);

  const usersQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users');
  }, [firestore, user]);
  const { data: allUsers } = useCollection<UserProfile>(usersQuery);

  const navigatingUsersMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    allUsers?.forEach(u => {
      if (u.navigatingToMissionId && u.navigatingToMissionStartedAt) {
        const startedAt = new Date(u.navigatingToMissionStartedAt);
        if (startedAt > oneHourAgo) {
          const list = map.get(u.navigatingToMissionId) || [];
          list.push(u.displayName || u.email || 'Onbekend');
          map.set(u.navigatingToMissionId, list);
        }
      }
    });
    return map;
  }, [allUsers]);

  const filteredMeldingen = useMemo(() => {
    const poolMap = new Map<string, any>();
    
    if (type === 'meldingen') {
        rawActiveMeldingen?.forEach(m => { if (!completedObjects.includes(m.id)) poolMap.set(m.id, m); });
        rawTodayCompleted?.forEach(m => poolMap.set(m.id, m));
        let result = Array.from(poolMap.values());
        if (!isPrivileged) {
            const userName = profile?.displayName || profile?.email || 'Onbekend';
            result = result.filter(m => m.behandelaar === userName);
        }
        if (debouncedSearchQuery) {
            const q = debouncedSearchQuery.toLowerCase();
            result = result.filter(m => m.intakenummer.toLowerCase().includes(q));
        }
        return result;
    } else if (type === 'prullenbakken' && selectedRouteId && currentProject && allObjects) {
        const route = currentProject.prullenbakkenroutes?.find(r => r.id === selectedRouteId);
        if (!route) return [];
        const objectsInRoute = allObjects.filter(obj => 
            Array.isArray(obj.locatieWerkgebieden) && obj.locatieWerkgebieden.includes(route.naam)
        ).map(obj => ({
            ...obj,
            intakenummer: obj.idNummer || obj.id,
            hoofdcategorie: 'Afval',
            subcategorie: obj.locatieSubType || 'Prullenbak',
            status: completedObjects.includes(obj.id) ? 'Afgerond' : 'Open'
        }));
        return objectsInRoute;
    }
    return [];
  }, [type, rawActiveMeldingen, rawTodayCompleted, isPrivileged, profile, completedObjects, debouncedSearchQuery, selectedRouteId, currentProject, allObjects]);

  const sortedMissions = useMemo(() => {
    if (filteredMeldingen.length === 0) return [];
    const base = userLocation || SIMULATION_START_LOCATION;
    const sorted = [...filteredMeldingen].filter(m => m.status !== 'Afgerond').sort((a, b) => {
        let valA: any;
        let valB: any;

        if (sortConfig.field === 'afstand' || (!sortConfig.field && navigationState === 'navigating')) {
            valA = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([a.longitude, a.latitude]));
            valB = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([b.longitude, b.latitude]));
        } else if (sortConfig.field === 'locatie') {
            valA = `${a.straatnaam} ${a.huisnummer}`.toLowerCase();
            valB = `${b.straatnaam} ${b.huisnummer}`.toLowerCase();
        } else if (sortConfig.field === 'omschrijving') {
            valA = (a.extra_informatie || '').toLowerCase();
            valB = (b.extra_informatie || '').toLowerCase();
        } else if (sortConfig.field === 'categorie') {
            valA = (a.subcategorie || '').toLowerCase();
            valB = (b.subcategorie || '').toLowerCase();
        } else {
            valA = (a as any)[sortConfig.field]?.toString().toLowerCase() || '';
            valB = (b as any)[sortConfig.field]?.toString().toLowerCase() || '';
        }

        if (valA < valB) return sortConfig.order === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.order === 'asc' ? 1 : -1;
        return 0;
    });

    if (priorityMissionId) {
        const priorityIndex = sorted.findIndex(m => m.id === priorityMissionId);
        if (priorityIndex !== -1) {
            const [priority] = sorted.splice(priorityIndex, 1);
            sorted.unshift(priority);
        }
    }
    return sorted;
  }, [filteredMeldingen, userLocation, priorityMissionId, sortConfig, navigationState]);

  const nextMission = sortedMissions[0];

  useEffect(() => {
    if (nextMission?.id && navigationState === 'navigating' && user && firestore) {
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { 
            navigatingToMissionId: nextMission.id,
            navigatingToMissionStartedAt: new Date().toISOString()
        });
    }
  }, [nextMission?.id, navigationState, user, firestore]);

  const fetchRoute = useCallback(async (force = false) => {
    if (navigationState === 'setup' || sortedMissions.length === 0) {
        setCurrentRouteGeometry(null); setDisplayedRouteGeometry(null); setRouteInfo(null);
        return;
    }
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 5000) return;
    
    // Only show loading screen if we have absolutely no route to show yet
    if (!displayedRouteGeometry && force) setIsCalculatingRoute(true);
    
    lastFetchTimeRef.current = now;
    const startPos = userLocation || SIMULATION_START_LOCATION;
    
    if (!sortedMissions[0]) {
        setIsCalculatingRoute(false);
        return;
    }

    const waypoints = [[startPos.longitude, startPos.latitude], [sortedMissions[0].longitude, sortedMissions[0].latitude]];
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
    } catch (e) { console.error("Route error:", e); } finally { setIsCalculatingRoute(false); }
  }, [sortedMissions, userLocation, navigationState, displayedRouteGeometry]);

  useEffect(() => {
    if (navigationState === 'navigating' && (sortedMissions.length > 0)) fetchRoute(true);
    else if (navigationState === 'setup') { setCurrentRouteGeometry(null); setDisplayedRouteGeometry(null); setRouteInfo(null); }
  }, [navigationState, sortedMissions[0]?.id]);

  useEffect(() => {
    let animId: number;
    const updateVisualPos = () => {
        // Battery optimization: only calculate if we are actually navigating and have targets
        if (targetPosRef.current && navigationState === 'navigating') {
            if (!visualPosRef.current) {
                visualPosRef.current = { ...targetPosRef.current };
                visualHeadingRef.current = lastHeadingRef.current;
            } else {
                const posFactor = 0.08; 
                const headingFactor = 0.05;
                
                // Only do math if distance is significant to reduce CPU heat
                const dLng = targetPosRef.current.lng - visualPosRef.current.lng;
                const dLat = targetPosRef.current.lat - visualPosRef.current.lat;
                
                if (Math.abs(dLng) > 0.000001 || Math.abs(dLat) > 0.000001) {
                    visualPosRef.current.lng += dLng * posFactor;
                    visualPosRef.current.lat += dLat * posFactor;
                    
                    let diff = lastHeadingRef.current - visualHeadingRef.current;
                    if (diff > 180) diff -= 360;
                    if (diff < -180) diff += 360;
                    visualHeadingRef.current += diff * headingFactor;

                    if (!isNaN(visualPosRef.current.lng) && !isNaN(visualPosRef.current.lat)) {
                        setSmoothLocation({ longitude: visualPosRef.current.lng, latitude: visualPosRef.current.lat, heading: visualHeadingRef.current });
                        if (mapRef.current && !isManualMode) {
                            const currentSpeed = speedKmh;
                            const targetZoom = dynamicZoomEnabled ? Math.max(15, Math.min(19, 19 - (currentSpeed / 25))) : navZoom;
                            mapRef.current.getMap().jumpTo({
                                center: [visualPosRef.current.lng, visualPosRef.current.lat],
                                bearing: visualHeadingRef.current,
                                zoom: targetZoom,
                                pitch: navPitch,
                                padding: { top: 0, bottom: Math.max(0, navOffset), left: 0, right: 0 }
                            });
                        }
                    }
                }
            }
            
            // Snap to route logic only if we have a route geometry
            if (currentRouteGeometry) {
                try {
                    const line = turf.lineString(currentRouteGeometry.coordinates);
                    const currPt = turf.point([visualPosRef.current?.lng || targetPosRef.current.lng, visualPosRef.current?.lat || targetPosRef.current.lat]);
                    const snapped = turf.nearestPointOnLine(line, currPt);
                    if (!isNaN(snapped.geometry.coordinates[0])) {
                        targetPosRef.current = { lng: snapped.geometry.coordinates[0], lat: snapped.geometry.coordinates[1] };
                        const alongRoute = turf.lineSlice(turf.point(currentRouteGeometry.coordinates[0]), snapped, line);
                        const distAlong = turf.length(alongRoute, { units: 'meters' });
                        const ahead = turf.along(line, distAlong + 15, { units: 'meters' });
                        lastHeadingRef.current = (turf.bearing(snapped, ahead) + 360) % 360;
                        
                        const endPt = turf.point(currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1]);
                        const sliced = turf.lineSlice(snapped, endPt, line);
                        setDisplayedRouteGeometry(sliced);
                    }
                } catch (e) {}
            }
        }
        animId = requestAnimationFrame(updateVisualPos);
    };
    animId = requestAnimationFrame(updateVisualPos);
    return () => cancelAnimationFrame(animId);
  }, [currentRouteGeometry, navigationState, isManualMode, dynamicZoomEnabled, navZoom, navPitch, navOffset, speedKmh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!navigator.geolocation || isSimulationMode) return;
    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            if (isNaN(loc.latitude) || isNaN(loc.longitude)) return;
            
            setUserLocation(loc);
            const currentSpeed = pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 0;
            setSpeedKmh(currentSpeed);

            if (navigationState !== 'navigating' || !currentRouteGeometry) {
                targetPosRef.current = { lng: loc.longitude, lat: loc.latitude };
            }

            if (navigationState === 'navigating' && nextMission && autoOpenEnabled) {
                const dist = turf.distance(turf.point([loc.longitude, loc.latitude]), turf.point([nextMission.longitude, nextMission.latitude]), { units: 'meters' });
                if (dist < 50 && currentSpeed < 3) {
                    if (!autoOpenTimerRef.current) {
                        autoOpenTimerRef.current = setTimeout(() => {
                            setActiveWerkbonId(nextMission.id);
                            autoOpenTimerRef.current = null;
                        }, 10000);
                    }
                } else if (autoOpenTimerRef.current) {
                    clearTimeout(autoOpenTimerRef.current);
                    autoOpenTimerRef.current = null;
                }
            }
        }, () => {}, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigationState, isSimulationMode, currentRouteGeometry, nextMission, autoOpenEnabled]);

  const updateNavPitch = (newPitch: number) => { 
    const val = Number(newPitch);
    setNavPitchState(val); 
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navPitch: val }, { merge: true }); 
  };
  const updateNavOffset = (newOffset: number) => { 
    const val = Number(newOffset);
    setNavOffsetState(val); 
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navOffset: val }, { merge: true }); 
  };
  const updateNavZoom = (newZoom: number) => { 
    const val = Number(Math.max(10, Math.min(22, newZoom))); 
    setNavZoomState(val); 
    if (user && firestore) setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navZoom: val }, { merge: true }); 
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

  const handleSort = (field: string) => {
    let newOrder: 'asc' | 'desc' = 'asc';
    if (sortConfig.field === field && sortConfig.order === 'asc') {
      newOrder = 'desc';
    }
    const newConfig = { field, order: newOrder };
    setSortConfig(newConfig);
    if (user && firestore) {
      setDocumentNonBlocking(doc(firestore, 'users', user.uid), { navSortConfig: newConfig }, { merge: true });
    }
  };

  const openInGoogleMaps = useCallback((lat?: number, lng?: number) => {
    // If specific lat/lng provided (from marker click), just go there.
    if (lat && lng) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${lat},${lng}`;
      window.open(url, '_blank');
      return;
    }

    // Otherwise, open the whole route (from sorted missions)
    if (sortedMissions.length > 0) {
      // Include ALL mission locations instead of limiting to 10
      const destination = sortedMissions[sortedMissions.length - 1];
      const waypoints = sortedMissions.slice(0, -1);
      
      const waypointStr = waypoints
        .filter(m => m.latitude && m.longitude)
        .map(m => `${m.latitude},${m.longitude}`)
        .join('|');
      const destStr = `${destination.latitude},${destination.longitude}`;
      
      const url = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${destStr}${waypointStr ? `&waypoints=${waypointStr}` : ''}`;
      window.open(url, '_blank');
    }
  }, [sortedMissions]);

  const handleStartRit = async (forcedPriorityId?: string) => {
    if (filteredMeldingen.length === 0 && sortedMissions.length === 0 && !forcedPriorityId) return;
    
    setIsLocating(true);
    setIsCalculatingRoute(true);

    if (forcedPriorityId) {
        setPriorityMissionId(forcedPriorityId);
    }

    if (assignments && assignments.length > 0 && firestore) {
        const assignment = assignments[0];
        updateDocumentNonBlocking(doc(firestore, 'route_assignments', assignment.id), { status: 'Started' });
    }

    const beginNav = async (loc: { latitude: number, longitude: number }, heading: number) => {
        if (isNaN(loc.latitude) || isNaN(loc.longitude)) { 
            setIsLocating(false); 
            setIsCalculatingRoute(false);
            return; 
        }
        
        targetPosRef.current = { lng: loc.longitude, lat: loc.latitude };
        visualPosRef.current = { lng: loc.longitude, lat: loc.latitude };
        visualHeadingRef.current = heading;
        
        // Use Matrix API to find true road distance for all candidates from ACTUAL location
        if (filteredMeldingen.length > 1 && !forcedPriorityId) {
            const topCandidates = sortedMissions.slice(0, 15);
            const coordinates = [[loc.longitude, loc.latitude], ...topCandidates.map(m => [m.longitude, m.latitude])];
            const coordStr = coordinates.map(c => c.join(',')).join(';');
            const matrixUrl = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}?sources=0&annotations=distance&access_token=${MAPBOX_TOKEN}`;
            
            try {
                const matrixRes = await fetch(matrixUrl);
                const matrixData = await matrixRes.json();
                if (matrixData.distances?.[0]) {
                    const distancesFromStart = matrixData.distances[0];
                    const candidatesWithRoadDist = topCandidates.map((m, i) => ({ 
                        ...m, 
                        roadDist: distancesFromStart[i + 1] || Infinity 
                    }));
                    candidatesWithRoadDist.sort((a, b) => a.roadDist - b.roadDist);
                    setPriorityMissionId(candidatesWithRoadDist[0].id);
                }
            } catch (e) {
                console.warn("Matrix API error, falling back to straight line:", e);
            }
        }
        
        setStartTime(new Date().toISOString());
        setIsSimulationMode(false); 
        setNavigationState('navigating'); 
        setIsLocating(false); 
        setIsManualMode(false);
        
        // Open Google Maps route automatically if starting work orders
        if (type === 'meldingen' && !forcedPriorityId) {
            openInGoogleMaps();
        }

        // If already navigating, force a fresh route fetch immediately
        if (navigationState === 'navigating') {
            setTimeout(() => fetchRoute(true), 100);
        }
    };

    if (userLocation) {
        await beginNav(userLocation, lastHeadingRef.current || 0);
    } else {
        navigator.geolocation.getCurrentPosition(
            async (pos) => { 
                const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }; 
                setUserLocation(loc); 
                await beginNav(loc, pos.coords.heading || 0); 
            }, 
            async () => await beginNav(SIMULATION_START_LOCATION, 0), 
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
  };

  const handleStopRit = async () => {
    if (navigationState === 'navigating' && user && firestore && selectedRouteId && startTime) {
        const routeData = type === 'veegroutes' ? currentProject?.veegroutes?.find(r => r.id === selectedRouteId) : currentProject?.prullenbakkenroutes?.find(r => r.id === selectedRouteId);
        
        const allObjectIds = filteredMeldingen.map(m => m.id);
        const skipped = allObjectIds.filter(id => !completedObjects.includes(id));

        const historyRef = collection(firestore, 'users', user.uid, 'routes');
        await addDocumentNonBlocking(historyRef, {
            userId: user.uid,
            projectId: selectedProjectId,
            originalRouteId: selectedRouteId,
            routeName: routeData?.naam || 'Onbekende Route',
            date: todayStr,
            startTime: startTime,
            endTime: new Date().toISOString(),
            completedObjects: completedObjects,
            skippedObjects: skipped,
            totalObjects: allObjectIds.length
        });

        if (assignments && assignments.length > 0) {
            const assignment = assignments[0];
            updateDocumentNonBlocking(doc(firestore, 'route_assignments', assignment.id), { status: 'Completed' });
        }

        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { 
            navigatingToMissionId: null,
            navigatingToMissionStartedAt: null 
        });
    }

    setNavigationState('setup'); setCurrentRouteGeometry(null); setDisplayedRouteGeometry(null); setRouteInfo(null);
    setIsManualMode(false); visualPosRef.current = null; targetPosRef.current = null; setPriorityMissionId(null); setStartTime(null);
    
    const map = mapRef.current?.getMap();
    if (map) {
      map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 1000 });
      if (filteredMeldingen.length > 0) {
        const points = filteredMeldingen.map(m => [m.longitude, m.latitude]);
        if (userLocation) points.push([userLocation.longitude, userLocation.latitude]);
        const pointsCollection = turf.featureCollection(points.map(p => turf.point(p)));
        const bbox = turf.bbox(pointsCollection);
        if (bbox[0] !== Infinity) map.fitBounds(bbox as [number, number, number, number], { padding: 80, duration: 1500 });
      }
    }
  };

  const handleHervatNavigatie = () => {
    setIsManualMode(false);
  };

  const handleZoomToAll = () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const points: [number, number][] = filteredMeldingen.map(m => [m.longitude, m.latitude]);
    if (userLocation) points.push([userLocation.longitude, userLocation.latitude]);
    else if (isSimulationMode) points.push([SIMULATION_START_LOCATION.longitude, SIMULATION_START_LOCATION.latitude]);

    if (points.length > 0) {
      const pointsCollection = turf.featureCollection(points.map(p => turf.point(p)));
      const bbox = turf.bbox(pointsCollection);
      if (bbox[0] !== Infinity) {
        map.fitBounds(bbox as [number, number, number, number], { padding: 80, duration: 1500, pitch: 0, bearing: 0 });
        setIsManualMode(true);
      }
    }
  };

  const isSvg = (str: string) => {
    if (!str) return false;
    const trimmed = str.trim().toLowerCase();
    return trimmed.startsWith('<svg') || trimmed.includes('<svg') || trimmed.includes('xmlns="http://www.w3.org/2000/svg"');
  };

  const renderMarkerIcon = (category: string) => {
    const iconVal = categoryIcons[category];
    if (!iconVal) return <Icons.AlertCircle className="h-5 w-5 text-slate-400" />;
    let iconColor = '#007AFF';
    let iconName = 'AlertCircle';
    if (iconVal.startsWith('lucide:')) {
      const parts = iconVal.split(':');
      iconName = parts[1] || 'AlertCircle';
      iconColor = parts[2] || '#007AFF';
      const IconComp = (Icons as any)[iconName] || Icons.AlertCircle;
      return <IconComp className="h-5 w-5" style={{ color: iconColor }} />;
    }
    if (isSvg(iconVal)) return <div className="h-5 w-5 flex items-center justify-center [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: iconVal }} />;
    if (iconVal.startsWith('http')) return <div className="h-5 w-5 relative flex items-center justify-center overflow-hidden rounded-full"><img src={iconVal} alt="icon" className="h-full w-full object-cover" /></div>;
    const IconComp = (Icons as any)[iconVal] || Icons.CircleHelp;
    return <IconComp className="h-5 w-5" style={{ color: '#007AFF' }} />;
  };

  const clickedMelding = useMemo(() => filteredMeldingen.find(m => m.id === clickedMarkerId), [filteredMeldingen, clickedMarkerId]);

  const renderSetupUI = () => {
    if (type === 'meldingen') return null;
    const availableRoutes = type === 'veegroutes' ? currentProject?.veegroutes : currentProject?.prullenbakkenroutes;
    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col items-center justify-center text-center">
            <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border-4 border-slate-100 mx-auto w-32 h-32 flex items-center justify-center">
                    <Navigation className="h-16 w-16 text-primary animate-pulse" />
                </div>
                <div className="space-y-3">
                    <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Rit Voorbereiden</h2>
                    <p className="text-sm font-medium text-slate-500">Kies een project en route om de rit te starten.</p>
                </div>
                <div className="space-y-4">
                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Kies Project</Label>
                        <Select value={selectedProjectId || ''} onValueChange={setSelectedProjectId}>
                            <SelectTrigger className="h-14 font-black rounded-3xl border-none bg-white shadow-inner px-6 text-slate-900">
                                <SelectValue placeholder="Project..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-3xl shadow-2xl p-2 border-none">
                                {projects?.map(p => <SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Kies Route</Label>
                        <Select value={selectedRouteId || ''} onValueChange={setSelectedRouteId} disabled={!selectedProjectId}>
                            <SelectTrigger className="h-14 font-black rounded-3xl border-none bg-white shadow-inner px-6 text-slate-900">
                                <SelectValue placeholder="Route..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-3xl shadow-2xl p-2 border-none">
                                {availableRoutes?.map(r => <SelectItem key={r.id} value={r.id} className="rounded-xl h-10">{r.naam}</SelectItem>)}
                                {(!availableRoutes || availableRoutes.length === 0) && <p className="p-4 text-xs font-bold text-slate-400 italic">Geen routes gevonden</p>}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button className="w-full h-16 font-black uppercase tracking-widest rounded-3xl shadow-2xl shadow-primary/20 text-lg transition-all active:scale-95 bg-primary text-white hover:bg-primary/90" disabled={!selectedRouteId || isLocating} onClick={() => handleStartRit()}>
                    {isLocating ? <Loader2 className="mr-3 animate-spin" /> : <Play className="mr-3 fill-current" />}
                    RIT STARTEN
                </Button>
            </div>
        </div>
    );
  };

  const SortIndicator = ({ field }: { field: string }) => {
    if (sortConfig.field !== field) return <Icons.ArrowUpDown className="h-3 w-3 opacity-20 ml-1" />;
    return sortConfig.order === 'asc' ? <Icons.ArrowUp className="h-3 w-3 text-primary ml-1" /> : <Icons.ArrowDown className="h-3 w-3 text-primary ml-1" />;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden text-sm">
        {isLocating && <LoadingScreen message="GPS koppelen..." className="fixed inset-0 z-[1000]" />}
        {isCalculatingRoute && !displayedRouteGeometry && <LoadingScreen message="Berekening route..." className="fixed inset-0 z-[1000]" />}
        
        {navigationState === 'setup' && type !== 'meldingen' ? (
            <div className="flex flex-col h-full">
                <header className="h-16 bg-white/80 backdrop-blur-lg border-b flex items-center px-6 shrink-0 sticky top-0 z-50">
                    <Button variant="ghost" size="icon" className="mr-4 h-10 w-10 rounded-full hover:bg-slate-100" onClick={() => router.push('/')}>
                        <ArrowLeft className="h-6 w-6 text-slate-600" />
                    </Button>
                    <h1 className="text-xl font-black uppercase tracking-tighter text-slate-900 leading-none">Navigatie Setup</h1>
                </header>
                {renderSetupUI()}
            </div>
        ) : (
            <>
                <div className="absolute inset-0 z-0" style={{ touchAction: 'none' }}>
                    <MapGL ref={mapRef} initialViewState={{ longitude: SIMULATION_START_LOCATION.longitude, latitude: SIMULATION_START_LOCATION.latitude, zoom: 13 }} style={{ width: '100%', height: '100%' }} mapStyle={mapStyle} mapboxAccessToken={MAPBOX_TOKEN} onMove={(evt) => { if (evt.originalEvent) setIsManualMode(true); }}>
                        {smoothLocation && !isNaN(smoothLocation.longitude) && !isNaN(smoothLocation.latitude) && (
                            <Marker longitude={smoothLocation.longitude} latitude={smoothLocation.latitude} anchor="center">
                                <div className="relative flex items-center justify-center w-16 h-16">
                                    <div className="absolute h-10 w-10 bg-primary/20 rounded-full animate-ping" />
                                    <div className="h-6 w-6 rounded-full bg-primary border-4 border-white shadow-2xl relative z-10" />
                                </div>
                            </Marker>
                        )}
                        {filteredMeldingen.map((m) => {
                            if (isNaN(m.longitude) || isNaN(m.latitude)) return null;
                            const isCompleted = m.status === 'Afgerond';
                            const beingNavigatedBy = navigatingUsersMap.get(m.id);
                            const isBeingNavigated = beingNavigatedBy && beingNavigatedBy.length > 0;
                            const isNext = nextMission?.id === m.id && navigationState === 'navigating';
                            const isClicked = clickedMarkerId === m.id;
                            
                            const missionIndex = sortedMissions.findIndex(sm => sm.id === m.id);

                            return (
                                <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center" onClick={e => { e.originalEvent.stopPropagation(); setClickedMarkerId(m.id); }}>
                                    <div className="relative flex items-center justify-center w-14 h-14">
                                        {showAssignmentBubbles && m.behandelaar && (
                                            <div className="absolute bottom-full mb-2 bg-white/95 backdrop-blur-md border-2 border-slate-900 px-2.5 py-1 rounded-full shadow-xl animate-in zoom-in duration-200 z-[60] whitespace-nowrap">
                                                <span className="text-[9px] font-black uppercase text-slate-900 leading-none">{m.behandelaar}</span>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-slate-900" />
                                            </div>
                                        )}
                                        {isBeingNavigated && !isNext && isPrivileged && (
                                            <div className="absolute bottom-full mb-2 bg-green-600 text-white px-3 py-1.5 rounded-full shadow-2xl animate-in zoom-in duration-200 z-[60] whitespace-nowrap flex items-center gap-2 border-2 border-white">
                                                <Navigation className="h-3.5 w-3.5 fill-current" />
                                                <span className="text-[10px] font-black uppercase tracking-tight">{beingNavigatedBy![0]} is onderweg</span>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-green-600" />
                                            </div>
                                        )}
                                        {(isNext || isClicked || (isBeingNavigated && isPrivileged)) && (
                                            <div className={cn("absolute inset-0 rounded-full border-[4px] opacity-80 transition-colors duration-500", (isBeingNavigated && isPrivileged) ? "border-green-500" : "border-black", (isNext || (isBeingNavigated && isPrivileged)) && "animate-pulse", isClicked && "border-primary")} />
                                        )}
                                        <div className={cn("relative flex items-center justify-center w-10 h-10 rounded-full border-2 border-black shadow-xl transition-all z-10", isCompleted ? "bg-green-50" : "bg-white/20 backdrop-blur-md", (isNext || isClicked || (isBeingNavigated && isPrivileged)) && "ring-4 ring-black/20 scale-125", "cursor-pointer hover:scale-110")}>
                                            {renderMarkerIcon(m.hoofdcategorie)}
                                            
                                            {/* Sequence Number Badge */}
                                            {!isCompleted && missionIndex !== -1 && (
                                                <div className="absolute -bottom-1 -left-1 bg-slate-900 text-white rounded-full w-4.5 h-4.5 flex items-center justify-center border-2 border-white text-[8px] font-black shadow-lg">
                                                    {missionIndex + 1}
                                                </div>
                                            )}

                                            <div className={cn("absolute -top-1 -right-1 rounded-full w-4.5 h-4.5 flex items-center justify-center border border-black shadow-lg overflow-hidden", isCompleted ? "bg-green-500" : "bg-yellow-400")}>
                                                {isCompleted ? <Check className="h-3 w-3 text-white" /> : <Wrench className="h-3 w-3 text-slate-900" />}
                                            </div>
                                        </div>
                                    </div>
                                </Marker>
                            );
                        })}
                        {navigationState === 'navigating' && displayedRouteGeometry && (
                            <Source id="route-line" type="geojson" data={displayedRouteGeometry}><Layer {...routeLayerCasing} /><Layer {...routeLayer} /></Source>
                        )}
                    </MapGL>
                </div>

                {clickedMarkerId && clickedMelding && (
                    <div className="absolute inset-0 z-[80] bg-black/20 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-none">
                            <div className="p-8 bg-slate-50 text-slate-900 flex justify-between items-start border-b">
                                <div className="space-y-1.5">
                                    <Badge className="bg-primary border-none text-[9px] font-black uppercase tracking-widest px-3 h-6 text-white rounded-full shadow-md">Bestemming</Badge>
                                    <h3 className="text-2xl font-black uppercase tracking-tight leading-none pt-1">{clickedMelding.intakenummer}</h3>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[220px]">{clickedMelding.straatnaam} {clickedMelding.huisnummer}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-slate-400 hover:bg-slate-200" onClick={() => setClickedMarkerId(null)}><X className="h-6 w-6" /></Button>
                            </div>
                            <div className="p-8 grid grid-cols-1 gap-4">
                                <Button className="h-16 rounded-3xl font-black uppercase tracking-widest shadow-md bg-slate-900 text-white hover:bg-slate-800 border-none gap-3 transition-all active:scale-95" onClick={() => { setActiveWerkbonId(clickedMarkerId); setClickedMarkerId(null); }}><FileText className="h-6 w-6 text-primary" /> OPEN WERKBON</Button>
                                <Button className="h-16 rounded-3xl font-black uppercase tracking-widest shadow-2xl bg-primary text-white hover:bg-primary/90 border-none gap-3 transition-all active:scale-95 shadow-primary/20" onClick={() => { handleStartRit(clickedMarkerId); setClickedMarkerId(null); }}><Navigation className="h-6 w-6 text-white fill-current" /> NAVIGEER NU</Button>
                                <Button 
                                    variant="outline"
                                    className="h-16 rounded-3xl font-black uppercase tracking-widest shadow-md border-2 border-green-600 text-green-600 hover:bg-green-50 gap-3 transition-all active:scale-95" 
                                    onClick={() => {
                                        openInGoogleMaps(clickedMelding.latitude, clickedMelding.longitude);
                                        setClickedMarkerId(null);
                                    }}
                                >
                                    <ExternalLink className="h-6 w-6" /> GOOGLE MAPS
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="absolute top-0 left-0 right-0 z-20 h-16 flex items-center justify-between px-4 bg-white/80 backdrop-blur-lg border-b pointer-events-auto gap-2">
                    <div className="flex items-center gap-2 pointer-events-auto shrink-0">
                        {navigationState !== 'navigating' && (
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100" onClick={() => router.push('/')}>
                                <ArrowLeft className="h-6 w-6 text-slate-600" />
                            </Button>
                        )}
                        
                        {navigationState === 'navigating' && routeInfo && (
                            <div className="flex items-center gap-4 bg-slate-900/5 px-4 py-2 rounded-full border-2 border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-primary" />
                                    <span className="text-base font-black text-slate-900 leading-none">{formatDate(addSeconds(new Date(), routeInfo.duration), 'HH:mm')}</span>
                                </div>
                                <div className="h-5 w-0.5 bg-slate-300" />
                                <div className="flex items-center gap-2">
                                    <Navigation className="h-5 w-5 text-primary" />
                                    <span className="text-base font-black text-slate-900 leading-none">{(routeInfo.distance / 1000).toFixed(1)} km</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 pointer-events-auto shrink-0">
                        <Popover>
                            <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100"><Settings className="h-5 w-5 text-slate-600" /></Button></PopoverTrigger>
                            <PopoverContent side="bottom" align="end" className="w-80 p-6 rounded-[2.5rem] shadow-2xl bg-white/95 backdrop-blur-md border-none text-sm"><div className="space-y-8"><div className="flex items-center gap-3 border-b pb-4"><Sliders className="h-5 w-5 text-primary" /><h4 className="font-black uppercase tracking-tight">Instellingen</h4></div><div className="space-y-8"><div className="space-y-3"><div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kijkhoogte</Label><span className="text-[10px] font-black text-primary uppercase">{Math.round(navOffset)}px</span></div><Slider value={[navOffset]} min={0} max={600} step={10} onValueChange={([val]) => updateNavOffset(val)} /></div><div className="space-y-3"><div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase tracking-widest">Kanteling</Label><span className="text-[10px] font-black text-primary uppercase">{Math.round(navPitch)}°</span></div><Slider value={[navPitch]} min={0} max={85} step={1} onValueChange={([val]) => updateNavPitch(val)} /></div><Separator className="bg-slate-100" /><div className="flex items-center justify-between"><div className="space-y-1"><Label className="text-xs font-black uppercase text-slate-900 tracking-tight">Dynamisch zoomen</Label><p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Op basis van snelheid</p></div><Switch checked={dynamicZoomEnabled} onCheckedChange={setDynamicZoomEnabled} className="data-[state=checked]:bg-primary" /></div>{!dynamicZoomEnabled && (<div className="space-y-3 animate-in slide-in-from-top-2 duration-300"><div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase tracking-widest">Vaste zoomhoogte</Label><span className="text-[10px] font-black text-primary uppercase">{navZoom.toFixed(1)}</span></div><div className="flex items-center gap-3"><Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-2" onClick={() => updateNavZoom(navZoom - 0.5)}><Minus className="h-4 w-4" /></Button><div className="flex-1"><Slider value={[navZoom]} min={10} max={22} step={0.5} onValueChange={([val]) => updateNavZoom(val)} /></div><Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-2" onClick={() => updateNavZoom(navZoom + 0.5)}><Plus className="h-4 w-4" /></Button></div></div>)}<Separator className="bg-slate-100" /><div className="flex items-center justify-between"><div className="space-y-1"><Label className="text-xs font-black uppercase text-slate-900 tracking-tight">Auto-open</Label><p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Open bij 10s stilstand</p></div><Switch checked={autoOpenEnabled} onCheckedChange={setAutoOpenEnabled} className="data-[state=checked]:bg-primary" /></div></div></div></PopoverContent>
                        </Popover>
                        {navigationState === 'setup' && type === 'meldingen' && (
                            <Button className="h-10 px-4 font-black uppercase bg-[#007AFF] text-white hover:bg-blue-700 shadow-xl rounded-xl transition-all active:scale-95 border-none tracking-widest text-[10px] sm:text-xs" onClick={() => handleStartRit()}>
                                {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1 fill-current" />} 
                                START
                            </Button>
                        )}
                        {navigationState === 'navigating' && (
                            <Button variant="destructive" className="h-10 px-4 font-black uppercase rounded-xl shadow-xl transition-all active:scale-95 border-none tracking-widest text-[10px] sm:text-xs" onClick={handleStopRit}>
                              STOP
                            </Button>
                        )}
                    </div>
                </div>

                {navigationState === 'navigating' && !activeWerkbonId && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-[95%] max-w-2xl animate-in slide-in-from-bottom-10 duration-700 pointer-events-none">
                        <div className="mb-6 flex items-center justify-between gap-4 w-full">
                            <div className="relative pointer-events-auto">
                                <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-[6px] border-primary flex flex-col items-center justify-center bg-white/95 backdrop-blur-md shadow-2xl shrink-0">
                                    <span className="text-2xl sm:text-4xl font-black text-slate-900 leading-none tabular-nums">{speedKmh}</span>
                                    <span className="text-[9px] sm:text-[11px] font-black uppercase text-primary tracking-tighter">km/h</span>
                                </div>
                            </div>
                            <div className="flex flex-row gap-3 pointer-events-auto">
                                {isManualMode && (
                                    <Button size="icon" className="h-16 w-16 sm:h-20 sm:w-20 rounded-full shadow-2xl bg-primary text-white border-none transition-all active:scale-95 flex items-center justify-center shadow-primary/40" onClick={handleHervatNavigatie}>
                                        <Navigation className="h-10 w-10 sm:h-12 sm:w-12 fill-current" />
                                    </Button>
                                )}
                                <Button size="icon" className="h-16 w-16 sm:h-20 sm:w-20 rounded-full shadow-2xl bg-green-600 text-white border-none transition-all active:scale-95 flex items-center justify-center shadow-green-600/40" onClick={() => openInGoogleMaps()} title="Open volledige route in Google Maps / Android Auto">
                                    <ExternalLink className="h-10 w-10 sm:h-12 sm:w-12" />
                                </Button>
                            </div>
                        </div>
                        <Card className="bg-white/95 backdrop-blur-xl shadow-2xl border-none rounded-[2.5rem] overflow-hidden pointer-events-auto transition-all duration-300">
                            <CardContent className="p-6 sm:p-8">
                                <div className="flex flex-col gap-4 min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-6">
                                        <div className="space-y-1 min-w-0 flex-1">
                                            <div className="flex items-center gap-2.5"><p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.1em]">Bestemming bereiken</p>{priorityMissionId === nextMission?.id && <Badge className="bg-primary text-white border-none h-5 text-[8px] font-black uppercase px-2 rounded-full shadow-md">Priority</Badge>}</div>
                                            <p className="text-lg sm:text-2xl font-black text-slate-900 uppercase truncate tracking-tight">{nextMission?.intakenummer || 'Rit voltooid'}</p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            {nextMission?.containernummer && (<div className="flex flex-col items-end"><p className="text-[8px] font-black uppercase text-slate-400 mb-1 tracking-widest">UNIT ID</p><Badge variant="secondary" className="text-xs h-8 font-black uppercase bg-yellow-400 text-slate-900 border-2 border-white shadow-xl px-3 rounded-xl">{nextMission.containernummer}</Badge></div>)}
                                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100 transition-colors pointer-events-auto" onClick={() => setIsCockpitExpanded(!isCockpitExpanded)}>{isCockpitExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</Button>
                                        </div>
                                    </div>
                                    <div className="space-y-1 min-w-0"><p className="text-xs font-black text-slate-800 truncate uppercase tracking-tight flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" /> {nextMission?.straatnaam} {nextMission?.huisnummer}, {nextMission?.plaats}</p></div>
                                    {isCockpitExpanded && (<div className="pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300"><p className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-[0.1em]">Instructies</p><p className="text-xs font-medium text-slate-600 leading-relaxed italic bg-slate-50 p-4 rounded-2xl shadow-inner">"{nextMission?.extra_informatie || nextMission?.subcategorie || 'Volg de route naar de volgende bestemming.'}"</p></div>)}
                                    <Progress value={100} className="h-1.5 bg-slate-100 mt-2" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                <div className={cn("absolute bottom-0 left-0 right-0 z-40 bg-white border-t-4 border-slate-900 flex flex-col overflow-hidden shadow-2xl h-[280px] transition-all duration-500", navigationState === 'navigating' ? "translate-y-full opacity-0" : "translate-y-0 opacity-100")}>
                    <div className="h-auto min-h-[3.5rem] flex flex-col sm:flex-row items-center justify-between px-4 sm:px-8 py-2 sm:py-0 cursor-default shrink-0 border-b bg-slate-50 gap-3">
                        <div className="flex flex-col sm:flex-row items-center justify-between w-full sm:flex-1 pointer-events-auto gap-3" onClick={e => e.stopPropagation()}>
                            <div className="relative w-full sm:max-w-xs shrink-0">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input 
                                    placeholder="Zoek opdracht..." 
                                    className="h-10 pl-10 text-xs font-black uppercase tracking-tight rounded-2xl border-none shadow-inner bg-white focus:ring-primary/20" 
                                    value={searchQuery} 
                                    onChange={e => setSearchQuery(e.target.value)} 
                                />
                            </div>
                            <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 overflow-x-auto no-scrollbar py-1 justify-start sm:justify-end">
                                <Button variant="outline" size="sm" className="h-9 text-[10px] font-black uppercase tracking-widest rounded-xl border-slate-200 shrink-0" onClick={handleZoomToAll}>
                                    <Maximize className="h-4 w-4 sm:mr-2" /> 
                                    <span className="hidden sm:inline">Overzicht</span>
                                    <span className="sm:hidden ml-1">ZICHT</span>
                                </Button>
                                {type === 'meldingen' && (
                                    <>
                                        <Button 
                                            variant={showTodayCompleted ? "default" : "outline"} 
                                            size="sm" 
                                            className="h-9 text-[10px] font-black uppercase tracking-widest rounded-xl border-slate-200 shrink-0" 
                                            onClick={() => { setShowTodayCompleted(!showTodayCompleted); setIsManualMode(false); }}
                                        >
                                            <CheckCircle2 className="h-4 w-4 sm:mr-2" /> 
                                            <span className="hidden sm:inline">{showTodayCompleted ? "Verberg voltooid" : "Vandaag gereed"}</span>
                                            <span className="sm:hidden ml-1">GEREED</span>
                                        </Button>
                                        {isPrivileged && (
                                            <Button 
                                                variant={showAssignmentBubbles ? "default" : "outline"} 
                                                size="sm" 
                                                className="h-9 text-[10px] font-black uppercase tracking-widest rounded-xl border-slate-200 shrink-0" 
                                                onClick={() => setShowAssignmentBubbles(!showAssignmentBubbles)}
                                            >
                                                <User className="h-4 w-4 sm:mr-2" /> 
                                                <span className="hidden sm:inline">{showAssignmentBubbles ? "Verberg labels" : "Behandelaars"}</span>
                                                <span className="sm:hidden ml-1">TEAM</span>
                                            </Button>
                                        )}
                                    </>
                                )}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-9 text-[10px] font-black uppercase tracking-widest rounded-xl border-slate-200 gap-2 shrink-0">
                                            <LayoutGrid className="h-4 w-4" /> 
                                            <span className="hidden sm:inline">Kolommen</span>
                                            <span className="sm:hidden">TAB</span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-64 p-6 rounded-3xl shadow-2xl border-none bg-white/95 backdrop-blur-md text-sm">
                                        <div className="space-y-6">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b pb-3">Weergaveinstellingen</p>
                                            <div className="space-y-3">
                                                {Object.keys(visibleColumns).map(colId => (
                                                    <div key={colId} className="flex items-center space-x-4 p-1.5 rounded-xl hover:bg-slate-50 transition-colors">
                                                        <Checkbox 
                                                            id={`col-${colId}`} 
                                                            checked={visibleColumns[colId] ?? true} 
                                                            onCheckedChange={() => toggleColumnVisibility(colId)} 
                                                            className="rounded-md border-2" 
                                                        />
                                                        <Label htmlFor={`col-${colId}`} className="text-xs font-black uppercase tracking-tight text-slate-700 cursor-pointer">{colId}</Label>
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
                        <div className="p-4 flex flex-col gap-4 lg:hidden">
                            {sortedMissions.map((m, index) => {
                                const isCompleted = m.status === 'Afgerond';
                                const dist = userLocation ? turf.distance(turf.point([userLocation.longitude, userLocation.latitude]), turf.point([m.longitude, m.latitude]), { units: 'meters' }) : 0;
                                const distKm = (dist / 1000).toFixed(1);
                                return (<Card key={m.id} onClick={() => setClickedMarkerId(m.id)} className={cn("w-full rounded-[2rem] border-2 flex flex-col justify-between p-5 active:scale-[0.98] transition-all cursor-pointer shadow-sm relative overflow-hidden", isCompleted ? "bg-green-50 border-green-100 opacity-60" : "bg-white border-slate-100 hover:border-primary/30")}><div className="flex justify-between items-start gap-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2.5 mb-1.5"><span className="text-xs font-black text-slate-300 w-5">{index + 1}</span><div className={cn("h-2.5 w-2.5 rounded-full shrink-0 shadow-sm", isCompleted ? "bg-green-500" : "bg-slate-400")} /><span className="font-black text-sm uppercase text-slate-900 tracking-tight truncate leading-none">{m.intakenummer}</span></div><p className="text-xs font-bold text-slate-700 truncate leading-tight pl-8">{[m.straatnaam, m.huisnummer].filter(Boolean).join(' ')}</p></div><Badge variant="outline" className="text-[9px] font-black uppercase h-5 px-2 border-none bg-slate-50 text-slate-400 shrink-0 rounded-lg">{m.werkgebied || m.wijk || '-'}</Badge></div><div className="flex items-center justify-between gap-3 border-t border-slate-50 pt-3 mt-auto pl-8"><span className="text-[10px] font-black uppercase text-primary truncate max-w-[160px] tracking-widest">{m.subcategorie}</span><span className="text-[10px] font-black text-slate-400 shrink-0 tabular-nums uppercase">{distKm} km</span></div>{isCompleted && (<div className="absolute top-0 right-0 p-1.5 bg-green-500 rounded-bl-[1.5rem] shadow-lg"><Check className="h-3.5 w-3.5 text-white" /></div>)}</Card>);
                            })}
                        </div>
                        <div className="hidden lg:block p-0">
                            <Table className="min-w-[1200px] border-collapse">
                                <TableHeader className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-10 border-b-2">
                                    <TableRow className="h-12 hover:bg-transparent">
                                        <TableHead className="font-black uppercase tracking-widest text-[10px] text-slate-400 pl-8 border-r w-[70px]">#</TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[10px] text-slate-500 border-r cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('intakenummer')}><div className="flex items-center">Bestemming <SortIndicator field="intakenummer" /></div></TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[10px] text-slate-500 border-r cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('locatie')}><div className="flex items-center">Locatie <SortIndicator field="locatie" /></div></TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[10px] text-slate-500 border-r cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('omschrijving')}><div className="flex items-center">Omschrijving <SortIndicator field="omschrijving" /></div></TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[10px] text-slate-500 border-r cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('categorie')}><div className="flex items-center">Categorie <SortIndicator field="categorie" /></div></TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[10px] text-slate-500 text-right pr-8 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('afstand')}><div className="flex items-center justify-end">Afstand <SortIndicator field="afstand" /></div></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedMissions.map((m, index) => { 
                                        const isCompleted = m.status === 'Afgerond'; 
                                        const dist = userLocation ? turf.distance(turf.point([userLocation.longitude, userLocation.latitude]), turf.point([m.longitude, m.latitude]), { units: 'meters' }) : 0; 
                                        const distKm = (dist / 1000).toFixed(1);
                                        return (
                                            <TableRow key={m.id} onClick={() => setClickedMarkerId(m.id)} className={cn("cursor-pointer transition-all border-b h-14", isCompleted ? "bg-green-50/20 opacity-60" : "hover:bg-primary/5")}>
                                                <TableCell className="pl-8 border-r font-black text-slate-300 text-[11px]">{index + 1}</TableCell>
                                                <TableCell className="border-r"><div className="flex items-center gap-3"><div className={cn("h-2.5 w-2.5 rounded-full shadow-sm", isCompleted ? "bg-green-500" : "bg-slate-400")} /><span className="font-black text-sm uppercase text-slate-900 tracking-tight">{m.intakenummer}</span></div></TableCell>
                                                <TableCell className="border-r"><div className="flex flex-col"><span className="text-xs font-black uppercase text-slate-700 tracking-tight">{m.straatnaam} {m.huisnummer}</span><span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">{m.plaats}</span></div></TableCell>
                                                <TableCell className="border-r max-w-md truncate text-xs font-medium text-slate-500 italic">"{m.extra_informatie || '-'}"</TableCell>
                                                <TableCell className="border-r"><div className="flex flex-col"><span className="text-[10px] font-black uppercase text-primary tracking-[0.1em]">{m.hoofdcategorie}</span><span className="text-[9px] font-bold uppercase text-slate-400 tracking-widest">{m.subcategorie}</span></div></TableCell>
                                                <TableCell className="text-right pr-8 font-black text-xs tabular-nums text-slate-400 uppercase tracking-tighter">{distKm} km</TableCell>
                                            </TableRow>
                                        ); 
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </div>
            </>
        )}

        {activeWerkbonId && (
            <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in duration-300">
                <IntegratedWerkbonOverlay 
                    meldingId={activeWerkbonId} 
                    onClose={() => setActiveWerkbonId(null)} 
                    onCompleted={(id) => { 
                        setCompletedObjects(prev => [...prev, id]); 
                        setActiveWerkbonId(null); 
                        setIsManualMode(false); 
                        setPriorityMissionId(null); 
                        if (user && firestore) {
                            updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { 
                                navigatingToMissionId: null,
                                navigatingToMissionStartedAt: null 
                            });
                        }
                        setTimeout(() => fetchRoute(true), 150); 
                    }} 
                />
            </div>
        )}
    </div>
  );
}
