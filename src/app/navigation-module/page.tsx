'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MapGL, { Marker, type MapRef } from 'react-map-gl';
import { 
  useCollection, 
  useFirestore, 
  useUser, 
  useMemoFirebase, 
  updateDocumentNonBlocking, 
  useFirebaseApp, 
  useDoc, 
  setDocumentNonBlocking,
  addDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { collection, doc, query, where, limit, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
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
  X,
  FileText,
  Trash2,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Map as MapIcon,
  Sparkles,
  Wrench,
  Paperclip,
  ImageIcon,
  Settings,
  Sliders,
  Tag,
  LocateFixed,
  Calendar,
  Package,
  Folder,
  FolderPlus,
  MoreVertical,
  Inbox,
  Archive,
  User as UserIcon,
  ChevronDown,
  LayoutGrid,
  CircleHelp,
  AlertCircle
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Object as MapObject, Melding, UploadedFile, MeldingTask, Hoeveelheid, Project as ProjectType, RouteAssignment, UserFolder, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import * as turf from '@turf/turf';
import { useProfile } from '@/firebase/profile-provider';
import { useToast } from '@/components/ui/use-toast';
import { format as formatDate } from 'date-fns';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/context/project-context';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';
const SIMULATION_START_LOCATION = { latitude: 52.2644, longitude: 4.7242 };

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
            className="w-full flex items-center justify-between p-4 bg-white border-b border-slate-100 active:bg-slate-50 transition-colors rounded-none"
        >
            <div className="flex items-center gap-3">
                <div className="relative">
                    <div className="p-1">
                        <Icon className="h-5 w-5 text-slate-900" />
                    </div>
                    {badgeCount !== undefined && badgeCount > 0 && (
                        <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black h-4 w-4 rounded-none flex items-center justify-center border-2 border-white shadow-sm">
                            {badgeCount}
                        </div>
                    )}
                </div>
                <span className="text-sm font-black uppercase tracking-tight text-slate-900">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                {value !== undefined && <span className="text-[10px] font-bold text-slate-400">{value}</span>}
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
    
    const recognitionRef = useRef<any>(null);

    const meldingRef = useMemoFirebase(() => (firestore && user) ? doc(firestore, 'meldingen', meldingId) : null, [firestore, user, meldingId]);
    const { data: melding, isLoading } = useDoc<Melding>(meldingRef);

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

    if (isLoading || !melding) return <LoadingScreen message="Data laden..." />;

    const renderMainList = () => (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="bg-white p-5 space-y-4 shadow-sm border-b">
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-2">Melding: {melding.intakenummer}</h2>
                    <div className="space-y-2.5">
                        <div className="flex items-start gap-2.5 text-sm font-bold text-slate-700">
                            <MapPin className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
                            <span>{melding.straatnaam} {melding.huisnummer}, {melding.postcode} {melding.plaats}</span>
                        </div>
                        <div className="flex items-start gap-2.5 text-[11px] font-bold text-slate-700">
                            <Tag className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
                            <span className="uppercase tracking-tight">{melding.hoofdcategorie}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
                            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                                <Calendar className="h-4 w-4 text-slate-900" />
                                <span>{melding.datum ? formatDate(new Date(melding.datum), 'dd-MM-yyyy') : '-'}</span>
                            </div>
                            {melding.containernummer && (
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                                    <Package className="h-4 w-4 text-slate-900" />
                                    <span className="uppercase tracking-tight font-black text-primary">Nr: {melding.containernummer}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {melding.extra_informatie && (
                    <div className="mt-3 p-4 bg-blue-50/50 rounded-none border-2 border-blue-100/50 flex items-start gap-3">
                        <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <p className="text-xs font-medium text-slate-700 leading-relaxed italic">
                            "{melding.extra_informatie}"
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-3 flex-1">
                <SectionRow icon={Wrench} label="Werkzaamheden" value={afhandelingBijzonderheden ? 'Ingevuld' : ''} onClick={() => setSubView('werkzaamheden')} />
                <SectionRow icon={Paperclip} label="Documenten" badgeCount={uploadedFiles.length} onClick={() => setSubView('docs')} />
                <SectionRow icon={Camera} label="Foto's" badgeCount={afhandelingFotos.length + (melding.fotos?.length || 0)} onClick={() => setSubView('photos')} />
                <SectionRow icon={Briefcase} label="Materialen" badgeCount={hoeveelheden.length} onClick={() => setSubView('materials')} />
            </div>

            <div className="p-4 bg-slate-50">
                <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
                    <AlertDialogTrigger asChild>
                        <Button className="w-full h-14 text-white font-black uppercase tracking-widest rounded-none shadow-2xl bg-orange-600 hover:bg-orange-700 transition-all active:scale-95 text-base" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "AFMELDEN"}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-lg rounded-none border-none shadow-2xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="font-black uppercase tracking-tight text-lg">Melding afmelden?</AlertDialogTitle>
                            <AlertDialogDescription className="font-bold text-slate-500 text-sm">De werkbon wordt voltooid en de rit wordt hervat.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2 mt-4">
                            <AlertDialogCancel className="rounded-none font-black uppercase h-12 border-2 text-xs">Annuleren</AlertDialogCancel>
                            <AlertDialogAction onClick={handleAfronden} className="bg-orange-600 hover:bg-orange-700 rounded-none font-black uppercase tracking-tight h-12 px-8 text-xs">Afmelden</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );

    const renderSubViewHeader = (title: string) => (
        <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-3 shrink-0">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-none h-10 w-10" onClick={() => setSubView('main')}><ArrowLeft className="h-6 w-6" /></Button>
            <h3 className="text-xs font-black uppercase tracking-[0.2em]">{title}</h3>
            <div className="w-10" />
        </header>
    );

    return (
        <div className="fixed inset-0 z-[200] flex flex-col h-full bg-white animate-in slide-in-from-right duration-300">
            {subView === 'main' ? (
                <>
                    <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-3 shrink-0">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-none h-10 w-10" onClick={onClose}><ChevronLeft className="h-6 w-6" /></Button>
                        <h3 className="text-xs font-black uppercase tracking-[0.2em]">WERKBON</h3>
                        <div className="w-10" />
                    </header>
                    {renderMainList()}
                </>
            ) : (
                <div className="flex flex-col h-full overflow-hidden">
                    {subView === 'werkzaamheden' && (
                        <>
                            {renderSubViewHeader('UITVOERING')}
                            <div className="flex-1 p-4 space-y-6 overflow-y-auto">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Oorspronkelijke melding</Label>
                                    <div className="bg-slate-50 p-4 rounded-none text-xs italic text-slate-600 border-2 border-slate-100 shadow-inner leading-relaxed">"{melding.extra_informatie}"</div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Uw Notities</Label>
                                        <Button variant={isListening ? "destructive" : "secondary"} size="icon" className={cn("h-14 w-14 rounded-none shadow-xl transition-all active:scale-90 border-2 border-white", isListening && "animate-pulse ring-4 ring-red-500/20")} onClick={toggleListening}>
                                            {isListening ? <Loader2 className="h-6 w-6 animate-spin" /> : <Mic className="h-6 w-6 text-primary" />}
                                        </Button>
                                    </div>
                                    <Textarea className="min-h-[300px] rounded-none border-2 border-slate-100 p-4 text-sm font-medium shadow-inner focus:ring-primary/20" placeholder="Beschrijf de verrichte werkzaamheden..." value={afhandelingBijzonderheden} onChange={e => setAfhandelingBijzonderheden(e.target.value)} />
                                </div>
                            </div>
                        </>
                    )}
                    {subView === 'photos' && (
                        <>
                            {renderSubViewHeader("FOTO'S")}
                            <div className="flex-1 p-4 space-y-8 overflow-y-auto">
                                <div className="space-y-4">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Melding Foto's</Label>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        {melding.fotos?.map((p, i) => (
                                            <div key={`bron-${i}`} className="relative aspect-square cursor-pointer overflow-hidden rounded-none border-2 border-slate-100 shadow-md" onClick={() => setPreviewImage(p.url)}>
                                                <Image src={p.url} alt="bron" fill className="object-cover rounded-none" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <Separator className="bg-slate-100" />
                                <div className="space-y-4">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Nieuwe Foto's</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button variant="outline" className="flex-col gap-3 rounded-none border-2 border-dashed border-slate-200 bg-slate-50/50 h-32 hover:bg-slate-50 hover:border-primary/30 transition-all" onClick={() => document.getElementById('cam-input')?.click()}><Camera className="h-8 w-8 text-primary" /><span className="text-[10px] font-black uppercase tracking-widest">Camera</span></Button>
                                        <Button variant="outline" className="flex-col gap-3 rounded-none border-2 border-dashed border-slate-200 bg-slate-50/50 h-32 hover:bg-slate-50 hover:border-primary/30 transition-all" onClick={() => document.getElementById('gal-input')?.click()}><ImageIcon className="h-8 w-8 text-primary" /><span className="text-[10px] font-black uppercase tracking-widest">Gallerij</span></Button>
                                    </div>
                                    <input type="file" id="cam-input" className="hidden" accept="image/*" capture="environment" onChange={e => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                                    <input type="file" id="gal-input" className="hidden" accept="image/*" multiple onChange={e => e.target.files && handleFileUpload(e.target.files, 'afhandeling_fotos')} />
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        {afhandelingFotos.map((p, i) => (
                                            <div key={`new-${i}`} className="relative aspect-square cursor-pointer overflow-hidden rounded-none border-2 border-slate-100 shadow-lg group" onClick={() => setPreviewImage(p.url)}>
                                                <Image src={p.url} alt="afhandeling" fill className="object-cover rounded-none" />
                                                <Button variant="destructive" size="icon" className="absolute right-1 top-1 h-8 w-8 rounded-none border-2 border-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setAfhandelingFotos(prev => prev.filter(x => x.storagePath !== p.storagePath)); }}><X className="h-4 w-4" /></Button>
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
                            <div className="flex-1 p-4 space-y-8 overflow-y-auto">
                                <div className="bg-white text-slate-900 p-5 rounded-none space-y-6 shadow-lg border-2 border-slate-100">
                                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                        <Briefcase className="h-6 w-6 text-primary" />
                                        <h3 className="text-base font-black uppercase tracking-tight">Verbruik Toevoegen</h3>
                                    </div>
                                    <div className="grid gap-5">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Product / Materiaal</Label>
                                            <Input 
                                                placeholder="Bv. Straatkolk..." 
                                                value={newHoeveelheidType} 
                                                onChange={e => setNewHoeveelheidType(e.target.value)} 
                                                className="h-12 bg-slate-50 border-2 border-slate-100 text-slate-900 font-black uppercase text-sm rounded-none focus:ring-primary/30 shadow-inner" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Aantal</Label>
                                            <Input 
                                                type="number" 
                                                placeholder="0" 
                                                value={newHoeveelheidAantal} 
                                                onChange={e => setNewHoeveelheidAantal(e.target.value)} 
                                                className="h-12 bg-slate-50 border-2 border-slate-100 text-slate-900 font-black uppercase text-sm rounded-none focus:ring-primary/30 text-center shadow-inner" 
                                            />
                                        </div>
                                        <Button className="w-full h-14 font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90 rounded-none shadow-xl transition-all active:scale-95 mt-2 text-sm" onClick={() => { if(newHoeveelheidType && newHoeveelheidAantal) { setHoeveelheden(prev => [...prev, {id: Date.now().toString(), type: newHoeveelheidType, aantal: parseFloat(newHoeveelheidAantal), eenheid: 'stuks'}]); setNewHoeveelheidType(''); setNewHoeveelheidAantal(''); } }}>TOEVOEGEN</Button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {hoeveelheden.map(h => (
                                        <div key={h.id} className="flex justify-between items-center p-4 bg-white border-2 border-slate-100 rounded-none shadow-sm">
                                            <div className="flex flex-col"><span className="text-sm font-black uppercase tracking-tight text-slate-900">{h.type}</span><span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{h.eenheid}</span></div>
                                            <div className="flex items-center gap-6"><span className="text-2xl font-black text-primary leading-none tabular-nums">{h.aantal}</span><Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600 rounded-none h-10 w-10" onClick={() => setHoeveelheden(prev => prev.filter(x => x.id !== h.id))}><Trash2 className="h-4 w-4 lg:h-5 lg:w-5" /></Button></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                    {subView === 'docs' && (
                        <>
                            {renderSubViewHeader('DOCUMENTEN')}
                            <div className="flex-1 p-4 space-y-6 overflow-y-auto">
                                <Button variant="outline" className="w-full h-24 border-dashed border-2 border-slate-200 rounded-none bg-slate-50/50 hover:bg-slate-50 hover:border-primary/30 transition-all gap-4 shadow-sm" onClick={() => document.getElementById('sub-doc-input')?.click()}><UploadCloud className="h-8 w-8 text-primary" /> <span className="text-xs font-black uppercase tracking-widest">Uploaden</span></Button>
                                <input type="file" id="sub-doc-input" className="hidden" multiple onChange={e => e.target.files && handleFileUpload(e.target.files, 'documents')} />
                                <div className="grid gap-3">
                                    {uploadedFiles.map(f => (
                                        <div key={f.storagePath} className="flex items-center justify-between p-4 bg-white rounded-none border-2 border-slate-100 shadow-sm transition-all hover:border-primary/20">
                                            <div className="flex items-center gap-4 truncate"><div className="bg-blue-100 p-3 rounded-none"><FileIcon className="h-6 w-6 text-blue-600" /></div><span className="text-xs font-black truncate uppercase tracking-tight text-slate-900">{f.name}</span></div>
                                            <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-red-600 rounded-none hover:bg-red-50" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-5 w-5" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {previewImage && (
                <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                    <div className="flex justify-end p-6 shrink-0"><Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-none h-12 w-12 border-2 border-white/20"><X className="h-8 w-8" /></Button></div>
                    <div className="flex-1 relative flex items-center justify-center overflow-hidden"><img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} /></div>
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
  const { selectedProjectId } = useProject();
  
  const type = searchParams.get('type'); 
  const isMeldingenType = type === 'meldingen';
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const isPrivileged = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';
  
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [navigationState, setNavigationState] = useState<'setup' | 'navigating'>('setup');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activeWerkbonId, setActiveWerkbonId] = useState<string | null>(null);
  const [priorityMissionId, setPriorityMissionId] = useState<string | null>(null);
  const [completedObjects, setCompletedObjects] = useState<string[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const [autoOpenEnabled, setAutoOpenEnabledState] = useState(true);

  // User Folders & Impersonation state
  const [managedUserId, setManagedUserId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Stable numbering
  const missionNumbersRef = useRef<Record<string, number>>({});

  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  useEffect(() => {
    if (user && !managedUserId) {
        setManagedUserId(user.uid);
    }
  }, [user, managedUserId]);

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects } = useCollection<ProjectType>(projectsQuery);
  const currentProject = projects?.find(p => p.id === selectedProjectId);

  const usersQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users');
  }, [firestore, user]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore || !user || type === 'meldingen') return null;
    return collection(firestore, 'objects');
  }, [firestore, user, type]);
  const { data: allObjects } = useCollection<MapObject>(objectsQuery);

  const activeMeldingenQuery = useMemoFirebase(() => {
    if (!firestore || !user || type !== 'meldingen') return null;
    return query(collection(firestore, 'meldingen'), where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld']), limit(100));
  }, [firestore, user, type]);
  const { data: rawActiveMeldingen } = useCollection<Melding>(activeMeldingenQuery);

  const foldersQuery = useMemoFirebase(() => {
    if (!firestore || !managedUserId) return null;
    return collection(firestore, 'users', managedUserId, 'folders');
  }, [firestore, managedUserId]);
  const { data: userFolders } = useCollection<UserFolder>(foldersQuery);

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

  const optionsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'issue_options') : null, [firestore]);
  const { data: dbOptions } = useDoc<any>(optionsRef);
  const categoryIcons = dbOptions?.categoryIcons || {};

  useEffect(() => {
    if (!navigator.geolocation) return;
    
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (assignments?.[0] && navigationState === 'setup') {
        const assignment = assignments[0];
        if (assignment.routeType === 'veegroutes' && type === 'veegroutes') setSelectedRouteId(assignment.routeId);
        else if (assignment.routeType === 'prullenbakken' && type === 'prullenbakken') setSelectedRouteId(assignment.routeId);
    }
  }, [assignments, navigationState, type]);

  useEffect(() => {
    if (profile) {
        if (profile.autoOpenEnabled !== undefined) setAutoOpenEnabledState(!!profile.autoOpenEnabled);
    }
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const missionsInAnyFolder = useMemo(() => {
    if (!userFolders) return new Set<string>();
    return new Set(userFolders.flatMap(f => f.taskIds || []));
  }, [userFolders]);

  const isCustomHtml = (str: string) => {
    if (!str) return false;
    const trimmed = str.trim().toLowerCase();
    return (trimmed.startsWith('<') && (trimmed.endsWith('>') || trimmed.includes('/>'))) || 
           trimmed.includes('<svg') || 
           trimmed.includes('<img') ||
           trimmed.includes('<a');
  };

  const renderCategoryIcon = (category: string) => {
    const iconVal = categoryIcons[category];
    if (!iconVal) return null;
    
    if (isCustomHtml(iconVal)) {
        return (
            <div 
                className="h-9 w-9 flex items-center justify-center text-primary [&_svg]:h-full [&_svg]:w-full [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_a]:h-full [&_a]:w-full [&_a]:flex [&_a]:items-center [&_a]:justify-center" 
                dangerouslySetInnerHTML={{ __html: iconVal }} 
            />
        );
    }
    
    if (iconVal.startsWith('http')) {
        return (
            <div className="h-9 w-9 relative flex items-center justify-center rounded-none overflow-hidden">
                <img src={iconVal} alt="icon" className="h-full w-full object-contain" />
            </div>
        );
    }

    if (iconVal.startsWith('lucide:')) {
        const parts = iconVal.split(':');
        const name = parts[1];
        const color = parts[2];
        const IconComp = (Icons as any)[name || 'AlertCircle'] || Icons.AlertCircle;
        return <IconComp className="h-9 w-9" style={{ color: color || '#007AFF' }} />;
    }

    const IconComp = (Icons as any)[iconVal] || Icons.CircleHelp;
    return <IconComp className="h-9 w-9 text-slate-400" />;
  };

  const sequenceMissions = useCallback((missions: any[]) => {
    if (missions.length === 0) return [];
    
    const pending = missions.filter(m => m.status !== 'Afgerond');
    const completed = missions.filter(m => m.status === 'Afgerond');

    if (pending.length === 0) return completed;

    const startLoc = userLocation || SIMULATION_START_LOCATION;
    let currentPos = turf.point([startLoc.longitude, startLoc.latitude]);
    let result: any[] = [];
    let remaining = [...pending];

    const getCityKey = (m: any) => (m.plaats || 'Onbekend').toLowerCase().trim();

    while (remaining.length > 0) {
        let absoluteClosestIdx = -1;
        let minDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const d = turf.distance(currentPos, turf.point([remaining[i].longitude, remaining[i].latitude]));
            if (d < minDist) {
                minDist = d;
                absoluteClosestIdx = i;
            }
        }

        if (absoluteClosestIdx === -1) break;

        const targetCity = getCityKey(remaining[absoluteClosestIdx]);
        let cityMissions = remaining.filter(m => getCityKey(m) === targetCity);
        remaining = remaining.filter(m => getCityKey(m) !== targetCity);

        while (cityMissions.length > 0) {
            let closestInCityIdx = -1;
            let minCityDist = Infinity;
            for (let i = 0; i < cityMissions.length; i++) {
                const d = turf.distance(currentPos, turf.point([cityMissions[i].longitude, cityMissions[i].latitude]));
                if (d < minCityDist) {
                    minCityDist = d;
                    closestInCityIdx = i;
                }
            }
            if (closestInCityIdx === -1) break;
            const [next] = cityMissions.splice(closestInCityIdx, 1);
            result.push(next);
            currentPos = turf.point([next.longitude, next.latitude]);
        }
    }
    
    return [...result, ...completed];
  }, [userLocation]);

  const filteredMeldingen = useMemo(() => {
    const poolMap = new Map<string, any>();
    if (type === 'meldingen') {
        rawActiveMeldingen?.forEach(m => { poolMap.set(m.id, m); });
        let result = Array.from(poolMap.values());
        
        const isSuperAdmin = profile?.role === 'Super admin';
        const viewingSelf = managedUserId === user?.uid;
        
        if (!(isSuperAdmin && viewingSelf)) {
            const targetUser = users?.find(u => u.id === managedUserId);
            const targetUserName = targetUser?.displayName || targetUser?.email || 'Onbekend';
            result = result.filter(m => m.behandelaar === targetUserName);
        }

        if (debouncedSearchQuery) {
            const q = debouncedSearchQuery.toLowerCase();
            result = result.filter(m => m.intakenummer.toLowerCase().includes(q) || (m.straatnaam || '').toLowerCase().includes(q));
        }
        
        if (userLocation) {
            return sequenceMissions(result);
        }
        
        return result;
    } else if (type === 'prullenbakken' && selectedRouteId && currentProject && allObjects) {
        const route = currentProject.prullenbakkenroutes?.find(r => r.id === selectedRouteId);
        if (!route) return [];
        return allObjects.filter(obj => 
            Array.isArray(obj.locatieWerkgebieden) && obj.locatieWerkgebieden.includes(route.naam)
        ).map(obj => ({
            ...obj,
            intakenummer: obj.idNummer || obj.id,
            hoofdcategorie: 'Afval',
            subcategorie: obj.locatieSubType || 'Prullenbak',
            status: completedObjects.includes(obj.id) ? 'Afgerond' : 'Open'
        }));
    }
    return [];
  }, [type, rawActiveMeldingen, isPrivileged, profile, completedObjects, debouncedSearchQuery, selectedRouteId, currentProject, allObjects, userLocation, sequenceMissions, managedUserId, users, user]);

  const inboxCount = useMemo(() => 
    filteredMeldingen.filter(m => !missionsInAnyFolder.has(m.id)).length
  , [filteredMeldingen, missionsInAnyFolder]);

  const allCount = filteredMeldingen.length;

  const getFolderCount = useCallback((folder: UserFolder) => {
    return (folder.taskIds || []).filter(id => filteredMeldingen.some(m => m.id === id)).length;
  }, [filteredMeldingen]);

  // Maintain stable numbering
  useEffect(() => {
    if (filteredMeldingen.length > 0) {
        const currentMapping = { ...missionNumbersRef.current };
        let max = Object.values(currentMapping).reduce((a, b) => Math.max(a, b), 0);
        
        filteredMeldingen.forEach(m => {
            if (!currentMapping[m.id]) {
                max++;
                currentMapping[m.id] = max;
            }
        });
        missionNumbersRef.current = currentMapping;
    }
  }, [filteredMeldingen]);

  const displayedMissions = useMemo(() => {
    let base = filteredMeldingen;
    
    if (selectedFolderId === null) {
        base = filteredMeldingen.filter(m => !missionsInAnyFolder.has(m.id));
    } else if (selectedFolderId !== 'all') {
        const currentFolder = userFolders?.find(f => f.id === selectedFolderId);
        if (currentFolder) {
            base = filteredMeldingen.filter(m => (currentFolder.taskIds || []).includes(m.id));
        } else {
            base = [];
        }
    }
    
    return base;
  }, [filteredMeldingen, selectedFolderId, missionsInAnyFolder, userFolders]);

  const openInGoogleMaps = useCallback((lat?: number, lng?: number) => {
    const originStr = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : "My+Location";

    if (lat && lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${lat},${lng}`, '_blank');
      return;
    }
    
    const pendingMissions = displayedMissions.filter(m => m.status !== 'Afgerond');
    if (pendingMissions.length === 0) return;
    
    const dest = pendingMissions[pendingMissions.length - 1];
    const waypoints = pendingMissions.slice(0, -1).filter(m => m.latitude && m.longitude).map(m => `${m.latitude},${m.longitude}`).join('|');
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${dest.latitude},${dest.longitude}${waypoints ? `&waypoints=${waypoints}` : ''}`, '_blank');
  }, [displayedMissions, userLocation]);

  const handleStartRit = async (forcedPriorityId?: string) => {
    if (displayedMissions.length === 0 && !forcedPriorityId) return;
    if (forcedPriorityId) setPriorityMissionId(forcedPriorityId);
    if (assignments?.[0] && firestore) updateDocumentNonBlocking(doc(firestore, 'route_assignments', assignments[0].id), { status: 'Started' });
    setNavigationState('navigating');
    if (isMeldingenType) openInGoogleMaps();
  };

  const handleStopRit = async () => {
    setNavigationState('setup'); setPriorityMissionId(null);
  };

  const handleRecalculateRoute = () => {
    if (!navigator.geolocation) {
        toast({ variant: 'destructive', title: 'Fout', description: 'GPS niet beschikbaar op dit apparaat.' });
        return;
    }

    setIsRecalculating(true);
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            setTimeout(() => {
                setIsRecalculating(false);
                toast({ title: "Route herberekend", description: "De lijstvolgorde is bijgewerkt op basis van uw huidige locatie." });
            }, 1200);
        },
        () => {
            setIsRecalculating(false);
            toast({ variant: 'destructive', title: 'Locatiefout', description: 'Kon huidige locatie niet bepalen.' });
        },
        { enableHighAccuracy: true }
    );
  };

  const handleCreateFolder = async () => {
    if (!firestore || !managedUserId || !newFolderName.trim()) return;
    try {
        await addDocumentNonBlocking(collection(firestore, 'users', managedUserId, 'folders'), {
            name: newFolderName.trim(),
            taskIds: [],
            createdAt: new Date().toISOString(),
        });
        setNewFolderName('');
        setIsCreateFolderOpen(false);
        toast({ title: "Map aangemaakt" });
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij aanmaken map" });
    }
  };

  const handleMoveToFolder = async (taskId: string, folderId: string | null) => {
    if (!firestore || !managedUserId || !userFolders) return;
    
    const batch = writeBatch(firestore);
    
    userFolders.forEach(folder => {
        if ((folder.taskIds || []).includes(taskId)) {
            const folderRef = doc(firestore, 'users', managedUserId, 'folders', folder.id);
            batch.update(folderRef, {
                taskIds: (folder.taskIds || []).filter(id => id !== taskId)
            });
        }
    });
    
    if (folderId) {
        const targetFolder = userFolders.find(f => f.id === folderId);
        if (targetFolder) {
            const folderRef = doc(firestore, 'users', managedUserId, 'folders', folderId);
            batch.update(folderRef, {
                taskIds: [...(targetFolder.taskIds || []), taskId]
            });
        }
    }
    
    try {
        await batch.commit();
        toast({ title: folderId ? "Verplaatst naar map" : "Verwijderd uit mappen" });
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij verplaatsen" });
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!firestore || !managedUserId) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'users', managedUserId, 'folders', id));
        if (selectedFolderId === id) setSelectedFolderId(null);
        toast({ title: "Map verwijderd" });
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij verwijderen map" });
    }
  };

  const activeFolder = userFolders?.find(f => f.id === selectedFolderId);
  const activeFolderLabel = selectedFolderId === null ? 'INBOX (VRIJ)' : selectedFolderId === 'all' ? 'ALLE MELDINGEN' : (activeFolder?.name.toUpperCase() || 'KIES MAP...');
  const activeFolderCount = selectedFolderId === null ? inboxCount : selectedFolderId === 'all' ? allCount : (activeFolder ? getFolderCount(activeFolder) : 0);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden text-sm">
        {!activeWerkbonId && (
            <header className="h-16 border-b bg-white flex items-center justify-between px-4 shrink-0 shadow-sm z-10 sticky top-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Button variant="ghost" size="icon" className="rounded-none h-10 w-10 shrink-0" onClick={() => router.push('/')}>
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <h2 className="text-lg font-black uppercase tracking-tight text-slate-900 leading-none truncate">{isMeldingenType ? 'Meldingen' : 'Navigatie'}</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Popover>
                        <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 rounded-none hover:bg-slate-100"><Settings className="h-5 w-5 text-slate-600" /></Button></PopoverTrigger>
                        <PopoverContent side="bottom" align="end" className="w-80 p-6 rounded-none shadow-2xl bg-white border-none">
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 border-b pb-4"><Sliders className="h-6 w-6 text-primary" /><h4 className="text-sm font-black uppercase tracking-tight">Instellingen</h4></div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div><Label className="text-xs font-black uppercase">Auto-open</Label><p className="text-[10px] font-bold text-slate-400">Open bij 10s stilstand</p></div>
                                        <Switch checked={autoOpenEnabled} onCheckedChange={setAutoOpenEnabledState} />
                                    </div>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                    
                    {isMeldingenType ? (
                        navigationState === 'setup' ? (
                            <Button 
                                className="h-11 w-11 p-0 font-black uppercase bg-primary text-white shadow-xl rounded-none border-none hover:bg-primary/90" 
                                onClick={handleRecalculateRoute} 
                                disabled={displayedMissions.length === 0 || isRecalculating}
                            >
                                {isRecalculating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
                            </Button>
                        ) : (
                            <Button variant="destructive" className="h-11 px-5 font-black uppercase rounded-none shadow-xl tracking-widest text-xs" onClick={handleStopRit}>STOP</Button>
                        )
                    ) : (
                        navigationState === 'setup' ? (
                            <Button className="h-11 px-5 font-black uppercase bg-primary text-white shadow-xl rounded-none tracking-widest text-xs" onClick={() => handleStartRit()} disabled={displayedMissions.length === 0}>
                                <Play className="h-4 w-4 mr-2 fill-current" /> START
                            </Button>
                        ) : (
                            <Button variant="destructive" className="h-11 px-5 font-black uppercase rounded-none shadow-xl tracking-widest text-xs" onClick={handleStopRit}>STOP</Button>
                        )
                    )}
                </div>
            </header>
        )}

        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 relative overflow-hidden">
            {isMeldingenType ? (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 border-b bg-white shrink-0 space-y-3">
                        <div className="relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input placeholder="ZOEKEN OP NUMMER OF ADRES..." className="h-10 pl-9 text-xs font-black uppercase rounded-none bg-slate-50 border-none shadow-inner w-full" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        </div>
                        
                        <div className="flex flex-col gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="w-full h-10 font-black uppercase text-[10px] rounded-none border-none bg-slate-50 shadow-inner justify-between px-3">
                                        <div className="flex items-center gap-2 truncate">
                                            <div className="relative">
                                                {selectedFolderId === null ? (
                                                    <Inbox className="h-4 w-4 text-primary shrink-0" />
                                                ) : selectedFolderId === 'all' ? (
                                                    <LayoutGrid className="h-4 w-4 text-primary shrink-0" />
                                                ) : (
                                                    <Folder className="h-4 w-4 text-primary shrink-0" />
                                                )}
                                                <Badge className="absolute -top-2 -right-2 h-4 min-w-[1rem] px-1 flex items-center justify-center text-[8px] font-black rounded-none border border-white">
                                                    {activeFolderCount}
                                                </Badge>
                                            </div>
                                            <span className="truncate text-xs font-black">
                                                {activeFolderLabel}
                                            </span>
                                        </div>
                                        <ChevronDown className="h-3.5 w-3.5 opacity-40 shrink-0 ml-2" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[calc(100vw-1.5rem)] sm:w-80 rounded-none border-none shadow-2xl p-2">
                                    <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-3 py-2">WEERGAVE</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => setSelectedFolderId('all')} className="font-black rounded-none h-12 cursor-pointer text-sm justify-between pr-4">
                                        <div className="flex items-center">
                                            <LayoutGrid className="h-5 w-5 mr-3 text-slate-400" /> ALLE MELDINGEN
                                        </div>
                                        <Badge variant="secondary" className="h-5 rounded-none font-black text-[10px]">{allCount}</Badge>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSelectedFolderId(null)} className="font-black rounded-none h-12 cursor-pointer text-sm justify-between pr-4">
                                        <div className="flex items-center">
                                            <Inbox className="h-5 w-5 mr-3 text-slate-400" /> INBOX (VRIJ)
                                        </div>
                                        <Badge variant="secondary" className="h-5 rounded-none font-black text-[10px]">{inboxCount}</Badge>
                                    </DropdownMenuItem>
                                    
                                    {userFolders && userFolders.length > 0 && (
                                        <>
                                            <DropdownMenuSeparator className="bg-slate-100 my-2" />
                                            <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-3 py-2">WERK-MAPPEN</DropdownMenuLabel>
                                            {userFolders.map(folder => (
                                                <div key={folder.id} className="flex items-center group relative">
                                                    <DropdownMenuItem 
                                                        onClick={() => setSelectedFolderId(folder.id)} 
                                                        className="flex-1 font-black rounded-none h-12 cursor-pointer text-sm justify-between pr-12"
                                                    >
                                                        <div className="flex items-center truncate">
                                                            <Folder className="h-5 w-5 mr-3 text-primary shrink-0" /> 
                                                            <span className="truncate">{folder.name.toUpperCase()}</span>
                                                        </div>
                                                        <Badge variant="secondary" className="h-5 rounded-none font-black text-[10px] shrink-0">{getFolderCount(folder)}</Badge>
                                                    </DropdownMenuItem>
                                                    {isPrivileged && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="absolute right-2 h-9 w-9 text-slate-300 hover:text-red-600 rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={(e) => { 
                                                                e.preventDefault(); 
                                                                e.stopPropagation(); 
                                                                handleDeleteFolder(folder.id); 
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {isPrivileged && (
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <Select value={managedUserId || ''} onValueChange={setManagedUserId}>
                                            <SelectTrigger className="h-10 font-black border-none rounded-none bg-slate-50 px-3 text-xs shadow-inner uppercase min-w-0">
                                                <div className="flex items-center gap-2 truncate">
                                                    <UserIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                                                    <SelectValue placeholder="COLLEGA..." />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent className="rounded-none shadow-2xl border-slate-100">
                                                {users?.map(u => (
                                                    <SelectItem key={u.id} value={u.id} className="text-xs font-bold uppercase">{u.displayName || u.email}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" className="h-10 w-10 p-0 rounded-none border-none bg-slate-100 shadow-inner text-primary hover:bg-slate-200 shrink-0">
                                                <FolderPlus className="h-4 w-4" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="rounded-none border-none shadow-2xl p-6 max-w-xs">
                                            <DialogHeader>
                                                <DialogTitle className="font-black uppercase tracking-tight text-base">Nieuwe Map</DialogTitle>
                                                <DialogDescription className="font-bold text-slate-500 text-xs">Voor {users?.find(u => u.id === managedUserId)?.displayName || 'collega'}.</DialogDescription>
                                            </DialogHeader>
                                            <div className="py-4">
                                                <Input placeholder="NAAM..." value={newFolderName} onChange={e => setNewFolderName(e.target.value)} className="h-12 font-black uppercase rounded-none text-center text-sm shadow-sm border-2" />
                                            </div>
                                            <DialogFooter className="gap-2">
                                                <DialogClose asChild><Button variant="ghost" className="font-black uppercase h-10 text-xs flex-1">Stop</Button></DialogClose>
                                                <Button onClick={handleCreateFolder} className="h-10 px-6 font-black uppercase rounded-none bg-primary text-white shadow-xl flex-1 text-xs">Maken</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <ScrollArea className="flex-1">
                        <div className="max-w-3xl mx-auto flex flex-col gap-1 p-2 pb-24">
                            {displayedMissions.map((m) => {
                                const isCompleted = m.status === 'Afgerond';
                                return (
                                    <Card key={m.id} 
                                        onClick={() => setActiveWerkbonId(m.id)}
                                        className={cn(
                                        "rounded-none border-none shadow-md overflow-hidden active:scale-[0.99] transition-all cursor-pointer group",
                                        isCompleted ? "bg-green-50 opacity-80" : "bg-white"
                                    )}>
                                        <div className="flex items-center gap-2 p-2.5 min-w-0">
                                            <div className="h-10 w-10 flex items-center justify-center shrink-0 bg-transparent ml-1">
                                                {renderCategoryIcon(m.hoofdcategorie)}
                                            </div>

                                            <div className="flex-1 min-w-0 ml-1">
                                                <div className="flex items-center justify-between mb-1 gap-1 leading-none">
                                                    <h3 className={cn(
                                                        "font-black text-sm uppercase tracking-tight truncate",
                                                        isCompleted ? "text-green-800" : "text-slate-900"
                                                    )}>{m.intakenummer}</h3>
                                                    {m.status === 'Nieuw' && (
                                                        <Badge className="text-[10px] font-black uppercase bg-red-600 text-white h-5 px-2 rounded-none animate-pulse shrink-0 shadow-sm">NEW</Badge>
                                                    )}
                                                </div>
                                                <p className={cn("text-xs font-black truncate leading-tight uppercase", isCompleted ? "text-green-700/60" : "text-slate-900")}>
                                                    {m.straatnaam} {m.huisnummer}
                                                </p>
                                                <p className={cn("text-[10px] font-bold truncate leading-tight uppercase mt-0.5", isCompleted ? "text-green-600/40" : "text-slate-400")}>
                                                    {m.plaats}
                                                </p>
                                            </div>
                                            <div className="flex gap-1.5 shrink-0 items-center ml-2">
                                                {!isCompleted && (
                                                    <Button 
                                                        variant="outline" 
                                                        size="icon" 
                                                        className="h-10 w-10 rounded-none border border-black bg-blue-50 text-primary hover:bg-blue-100 transition-all active:scale-90 shadow-sm" 
                                                        onClick={(e) => { e.stopPropagation(); openInGoogleMaps(m.latitude, m.longitude); }}
                                                    >
                                                        <Navigation className="h-5 w-5" />
                                                    </Button>
                                                )}
                                                
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-10 w-8 rounded-none border-none hover:bg-slate-100" onClick={e => e.stopPropagation()}>
                                                            <MoreVertical className="h-5 w-5 text-slate-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-64 rounded-none shadow-2xl p-2 border-none">
                                                        <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-3 py-2">VERPLAATSEN NAAR...</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMoveToFolder(m.id, null); }} className="font-black rounded-none h-12 cursor-pointer text-sm">
                                                            <Inbox className="h-5 w-5 mr-3 text-slate-400" /> INBOX (VRIJ)
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="bg-slate-100 my-2" />
                                                        {userFolders?.map(folder => (
                                                            <DropdownMenuItem key={folder.id} onClick={(e) => { e.stopPropagation(); handleMoveToFolder(m.id, folder.id); }} className="font-black rounded-none h-12 cursor-pointer text-sm">
                                                                <Folder className="h-5 w-5 mr-3 text-primary" /> {folder.name.toUpperCase()}
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                            {displayedMissions.length === 0 && (
                                <div className="col-span-full py-24 text-center opacity-20">
                                    <Archive className="h-12 w-12 mx-auto mb-4" />
                                    <p className="font-black uppercase tracking-[0.2em] text-[10px]">Geen opdrachten</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            ) : (
                <div className="flex-1 relative">
                    <MapGL ref={mapRef} initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 13 }} style={{ width: '100%', height: '100%' }} mapStyle={mapStyle} mapboxAccessToken={MAPBOX_TOKEN}>
                        {allObjects?.map(obj => (
                            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude}>
                                <div className="h-4 w-4 rounded-none bg-primary border-2 border-white shadow-md" />
                            </Marker>
                        ))}
                    </MapGL>
                </div>
            )}

            {isRecalculating && (
                <div className="fixed inset-0 z-[300] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <div className="bg-slate-900 p-8 rounded-none shadow-2xl flex flex-col items-center gap-4 text-white">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="text-xs font-black uppercase tracking-[0.3em]">HERBEREKENEN...</p>
                    </div>
                </div>
            )}
        </div>

        {activeWerkbonId && (
            <IntegratedWerkbonOverlay 
                meldingId={activeWerkbonId} 
                onClose={() => setActiveWerkbonId(null)} 
                onCompleted={(id) => { 
                    setCompletedObjects(prev => [...prev, id]); 
                    setActiveWerkbonId(null);
                    handleRecalculateRoute(); 
                }}
            />
        )}
    </div>
  );
}
