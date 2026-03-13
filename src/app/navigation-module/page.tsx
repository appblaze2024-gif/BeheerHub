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
} from '@/firebase';
import { collection, doc, query, where, limit } from 'firebase/firestore';
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
  ExternalLink,
  Tag
} from 'lucide-react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Object as MapObject, Melding, UploadedFile, Hoeveelheid, Project as ProjectType, RouteAssignment } from '@/lib/types';
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
    onCompleted,
    onNavigateNow
}: { 
    meldingId: string, 
    onClose: () => void, 
    onCompleted: (id: string) => void,
    onNavigateNow: (id: string) => void
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
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button 
                        variant="outline" 
                        className="h-14 rounded-2xl font-black uppercase tracking-tight gap-2 border-2 border-primary text-primary hover:bg-primary/5"
                        onClick={() => onNavigateNow(melding.id)}
                    >
                        <Navigation className="h-4 w-4" /> Navigeer Nu
                    </Button>
                    <Button 
                        variant="outline" 
                        className="h-14 rounded-2xl font-black uppercase tracking-tight gap-2 border-2 border-green-600 text-green-600 hover:bg-green-50"
                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${melding.latitude},${melding.longitude}`, '_blank')}
                    >
                        <ExternalLink className="h-4 w-4" /> Google Maps
                    </Button>
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
        <div className="fixed inset-0 z-[200] flex flex-col h-full bg-white relative animate-in slide-in-from-right duration-300">
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
                    {subView === 'photos' && (
                        <>
                            {renderSubViewHeader("FOTO'S")}
                            <div className="flex-1 p-6 space-y-8 overflow-y-auto">
                                <div className="space-y-4">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Melding Foto's</Label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {melding.fotos?.map((p, i) => (
                                            <div key={`bron-${i}`} className="relative aspect-square rounded-[2rem] overflow-hidden border-2 border-slate-100 shadow-lg cursor-pointer" onClick={() => setPreviewImage(p.url)}>
                                                <Image src={p.url} alt="bron" fill className="object-cover" />
                                            </div>
                                        ))}
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
                                            <div key={`new-${i}`} className="relative aspect-square rounded-[2rem] overflow-hidden border-2 border-slate-100 shadow-xl group cursor-pointer" onClick={() => setPreviewImage(p.url)}>
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
                <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                    <div className="flex justify-end p-6 shrink-0"><Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-12 w-12 border-2 border-white/20"><X className="h-8 w-8" /></Button></div>
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

  const [autoOpenEnabled, setAutoOpenEnabledState] = useState(true);

  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

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

  const filteredMeldingen = useMemo(() => {
    const poolMap = new Map<string, any>();
    if (type === 'meldingen') {
        rawActiveMeldingen?.forEach(m => { if (!completedObjects.includes(m.id)) poolMap.set(m.id, m); });
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
  }, [type, rawActiveMeldingen, isPrivileged, profile, completedObjects, debouncedSearchQuery, selectedRouteId, currentProject, allObjects]);

  const sequenceMissions = useCallback((missions: any[]) => {
    if (missions.length === 0) return [];
    const startLoc = userLocation || SIMULATION_START_LOCATION;
    let result: any[] = [];
    let remaining = [...missions];
    let currentPos = turf.point([startLoc.longitude, startLoc.latitude]);

    if (priorityMissionId) {
        const pIdx = remaining.findIndex(m => m.id === priorityMissionId);
        if (pIdx !== -1) {
            const [p] = remaining.splice(pIdx, 1);
            result.push(p);
            currentPos = turf.point([p.longitude, p.latitude]);
        }
    }

    while (remaining.length > 0) {
        let closestIdx = 0; let minDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const dist = turf.distance(currentPos, turf.point([remaining[i].longitude, remaining[i].latitude]));
            if (dist < minDist) { minDist = dist; closestIdx = i; }
        }
        const [next] = remaining.splice(closestIdx, 1);
        result.push(next);
        currentPos = turf.point([next.longitude, next.latitude]);
    }
    return result;
  }, [userLocation, priorityMissionId]);

  const sortedMissions = useMemo(() => sequenceMissions(filteredMeldingen), [filteredMeldingen, sequenceMissions]);

  const openInGoogleMaps = useCallback((lat?: number, lng?: number) => {
    if (lat && lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${lat},${lng}`, '_blank');
      return;
    }
    if (sortedMissions.length > 0) {
      const dest = sortedMissions[sortedMissions.length - 1];
      const waypoints = sortedMissions.slice(0, -1).filter(m => m.latitude && m.longitude).map(m => `${m.latitude},${m.longitude}`).join('|');
      window.open(`https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${dest.latitude},${dest.longitude}${waypoints ? `&waypoints=${waypoints}` : ''}`, '_blank');
    }
  }, [sortedMissions]);

  const handleStartRit = async (forcedPriorityId?: string) => {
    if (filteredMeldingen.length === 0 && !forcedPriorityId) return;
    if (forcedPriorityId) setPriorityMissionId(forcedPriorityId);
    if (assignments?.[0] && firestore) updateDocumentNonBlocking(doc(firestore, 'route_assignments', assignments[0].id), { status: 'Started' });
    setNavigationState('navigating');
    if (isMeldingenType) openInGoogleMaps();
  };

  const handleStopRit = async () => {
    setNavigationState('setup'); setPriorityMissionId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden text-sm">
        <header className="h-16 border-b bg-white flex items-center justify-between px-4 shrink-0 shadow-sm z-10 sticky top-0">
            <div className="flex items-center gap-3">
                 <Button variant="ghost" size="icon" className="rounded-full h-10 w-10" onClick={() => router.push('/')}><ArrowLeft className="h-6 w-6 text-slate-600" /></Button>
                 <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 leading-none">Navigatie</h2>
            </div>
            <div className="flex items-center gap-2">
                <Popover>
                    <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100"><Settings className="h-5 w-5 text-slate-600" /></Button></PopoverTrigger>
                    <PopoverContent side="bottom" align="end" className="w-80 p-6 rounded-[2.5rem] shadow-2xl bg-white border-none">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 border-b pb-4"><Sliders className="h-5 w-5 text-primary" /><h4 className="font-black uppercase tracking-tight">Instellingen</h4></div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div><Label className="text-xs font-black uppercase">Auto-open</Label><p className="text-[9px] font-bold text-slate-400">Open bij 10s stilstand</p></div>
                                    <Switch checked={autoOpenEnabled} onCheckedChange={setAutoOpenEnabledState} />
                                </div>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                {navigationState === 'setup' ? (
                    <Button className="h-10 px-6 font-black uppercase bg-primary text-white shadow-xl rounded-xl tracking-widest text-xs" onClick={() => handleStartRit()} disabled={isMeldingenType && filteredMeldingen.length === 0}>
                        <Play className="h-4 w-4 mr-2 fill-current" /> START
                    </Button>
                ) : (
                    <Button variant="destructive" className="h-10 px-6 font-black uppercase rounded-xl shadow-xl tracking-widest text-xs" onClick={handleStopRit}>STOP</Button>
                )}
            </div>
        </header>

        <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
            {isMeldingenType ? (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-4 border-b bg-white shrink-0">
                        <div className="relative max-w-md mx-auto">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input placeholder="Zoek opdracht..." className="pl-10 h-11 font-black uppercase text-xs rounded-2xl bg-slate-50 border-none shadow-inner" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        </div>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="max-w-2xl mx-auto flex flex-col gap-2 p-2 pb-24">
                            {sortedMissions.map((m, index) => (
                                <Card key={m.id} className="rounded-none border-none shadow-md bg-white overflow-hidden active:scale-[0.99] transition-all cursor-pointer group">
                                    <div className="flex items-center gap-4 p-4">
                                        <div className="h-10 w-10 bg-slate-900 text-white flex items-center justify-center text-sm font-black shrink-0">
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <h3 className="font-black text-sm uppercase tracking-tight text-slate-900 truncate">{m.intakenummer}</h3>
                                                <Badge variant="outline" className="text-[8px] font-black uppercase border-none bg-slate-100 text-slate-500 h-4 px-1.5 rounded-none">{m.werkgebied || m.wijk || '-'}</Badge>
                                            </div>
                                            <p className="text-[11px] font-bold text-slate-500 truncate">{m.straatnaam} {m.huisnummer}, {m.plaats}</p>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <Button 
                                                variant="outline" 
                                                size="icon" 
                                                className="h-12 w-12 rounded-none border-none bg-blue-50 text-primary hover:bg-blue-100 transition-all active:scale-90" 
                                                onClick={(e) => { e.stopPropagation(); openInGoogleMaps(m.latitude, m.longitude); }}
                                            >
                                                <Navigation className="h-5 w-5" />
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                size="icon" 
                                                className="h-12 w-12 rounded-none border-none bg-green-50 text-green-600 hover:bg-green-100 transition-all active:scale-90" 
                                                onClick={(e) => { e.stopPropagation(); setActiveWerkbonId(m.id); }}
                                            >
                                                <FileText className="h-5 w-5" />
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                            {sortedMissions.length === 0 && (
                                <div className="col-span-full py-20 text-center opacity-20">
                                    <CheckCircle2 className="h-16 w-16 mx-auto mb-4" />
                                    <p className="font-black uppercase tracking-widest">Geen actieve opdrachten</p>
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
                                <div className="h-3 w-3 rounded-full bg-primary border-2 border-white shadow-md" />
                            </Marker>
                        ))}
                    </MapGL>
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
                }}
                onNavigateNow={(id) => {
                    setPriorityMissionId(id);
                    openInGoogleMaps();
                    setActiveWerkbonId(null);
                }}
            />
        )}
    </div>
  );
}
