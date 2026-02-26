'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  Loader2, 
  Search, 
  UploadCloud, 
  FileIcon, 
  Trash2, 
  Camera, 
  MapPin, 
  Sparkles, 
  Settings2, 
  FileText, 
  X, 
  ZoomIn, 
  ZoomOut, 
  Target, 
  ChevronRight, 
  Package, 
  Clock,
  User,
  AlertCircle,
  Check,
  Calendar
} from 'lucide-react';
import { 
  useFirestore, 
  addDocumentNonBlocking, 
  updateDocumentNonBlocking, 
  useFirebaseApp, 
  useCollection, 
  useDoc, 
  setDocumentNonBlocking, 
  useMemoFirebase 
} from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { useGlobalLoading } from '@/context/global-loading-context';
import { collection, doc, serverTimestamp, addDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
import { useNavigationUI } from '@/context/navigation-ui-context';
import Image from 'next/image';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';

// UI Components
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// Custom Components & AI
import { MapboxView } from '@/components/mapbox-view';
import { parseIssuePdf } from '@/ai/flows/parse-issue-pdf-flow';

// Types
import type { Melding, UploadedFile, Object as MapObject } from '@/lib/types';
import { cn } from '@/lib/utils';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const newMeldingSchema = z.object({
  intakenummer: z.string().min(1, 'Meldingsnummer is verplicht'),
  containernummer: z.string().optional(),
  soort_melder: z.string().optional(),
  hoofdcategorie: z.string().optional(),
  subcategorie: z.string().optional(),
  behandelende_afdeling: z.string().optional(),
  behandelaar: z.string().optional(),
  status: z.string().min(1, 'Status is verplicht'),
  voorvaldatum: z.date().optional().nullable(),
  voorvaltijd: z.string().optional(),
  meldingsdatum: z.date().optional().nullable(),
  meldingsuur: z.string().optional(),
  actiedatum: z.date().optional().nullable(),

  soort_melding: z.string().optional(),
  ext_referentie: z.string().optional(),
  straatnaam: z.string().optional(),
  nummer: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  wijk: z.string().optional(),
  werkgebied: z.string().optional(),
  
  melder: z.string().optional(),
  telefoon_melder: z.string().optional(),
  email_melder: z.string().email('Ongeldig emailadres').optional().or(z.literal('')),
  burgerservicenummer: z.string().optional(),

  extra_informatie: z.string().optional(),
  afgehandeld_door: z.string().optional(),
  afhandeling_datum: z.date().optional().nullable(),
  afhandeling_tijdstip: z.string().optional(),
  afhandeling_bijzonderheden: z.string().optional(),
});

type NewMeldingFormValues = z.infer<typeof newMeldingSchema>;

const DEFAULT_STATUS_OPTIONS = [
    "Nieuw", "Intern doorgezet", "In behandeling", "Gepland op korte termijn",
    "Gepland op langere termijn", "Dubbel gemeld", "Afgerond", "Niet in beheer", "Extern doorgezet"
];

const DEFAULT_HOOFDCATEGORIEEN = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig", "Zoutkisten"];

const DEFAULT_SUBCATEGORIE_MAPPING: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Wateroverlast", "Verstopte put"],
    "Zoutkisten": ["Zoutkist leeg"],
    "Overig": ["Overige meldingen"]
};

const DEFAULT_HANDLERS = ["Onbekend"];
const DEFAULT_REPORTER_TYPES = ["Burger", "Bedrijf", "Medewerker", "Overheid"];

const MAPPING_FIELDS = [
    { id: 'intakenummer', label: 'Intakenummer' },
    { id: 'containernummer', label: 'Containernummer' },
    { id: 'datum', label: 'Datum (YYYY-MM-DD)' },
    { id: 'tijdstip', label: 'Tijdstip (HH:mm)' },
    { id: 'melder', label: 'Naam melder' },
    { id: 'extern_meldingsnummer', label: 'Extern meldingsnummer' },
    { id: 'behandelaar', label: 'Behandelaar (Aangenomen door)' },
    { id: 'label_1', label: 'Hoofdindeling' },
    { id: 'label_2', label: 'Indeling' },
    { id: 'straatnaam', label: 'Straatnaam' },
    { id: 'huisnummer', label: 'Huisnummer' },
    { id: 'postcode', label: 'Postcode' },
    { id: 'plaats', label: 'Plaats' },
    { id: 'extra_informatie', label: 'Memo / Extra informatie' },
];

const FormRow = ({ label, children, labelFor }: { label: string; children: React.ReactNode; labelFor?: string }) => (
    <div className="grid grid-cols-[140px_1fr] items-start gap-x-4 py-1 border-b border-slate-50 last:border-0 min-h-[40px]">
        <FormLabel htmlFor={labelFor} className="text-[10px] text-left pt-2.5 font-black uppercase text-slate-400 tracking-tighter shrink-0">{label}</FormLabel>
        <div className="flex-1 min-w-0">
            {children}
        </div>
    </div>
);

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

function AIConfigDialog({ instructions, onSave, isSaving, samplePdfUrl }: { instructions: string, onSave: (val: string, pdfUrl?: string) => void, isSaving: boolean, samplePdfUrl?: string }) {
    const { toast } = useToast();
    const [fieldInstructions, setFieldInstructions] = React.useState<Record<string, string>>({});
    const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(samplePdfUrl || "https://i.ibb.co/nNFZcctf/Schermafbeelding-2026-02-18-104605.png");
    const [isUploadingSample, setIsUploadingSample] = React.useState(false);
    const [zoom, setZoom] = React.useState(1);
    const [activeFieldId, setactiveFieldId] = React.useState<string | null>(null);
    const [markers, setMarkers] = React.useState<Record<string, { x: number, y: number }>>({});
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const app = useFirebaseApp();

    React.useEffect(() => {
        const parsed: Record<string, string> = {};
        const lines = instructions.split('\n');
        lines.forEach(line => {
            const [key, ...valParts] = line.split(':');
            if (key && valParts.length > 0) {
                const cleanKey = key.trim().toLowerCase();
                const cleanVal = valParts.join(':').trim();
                parsed[cleanKey] = cleanVal;
            }
        });
        setFieldInstructions(parsed);
    }, [instructions]);

    const handleFieldChange = (id: string, val: string) => {
        setFieldInstructions(prev => ({ ...prev, [id.toLowerCase()]: val }));
    };

    const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!activeFieldId) {
            toast({ description: "Selecteer eerst een veld om de locatie te koppelen." });
            return;
        }
        
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        setMarkers(prev => ({ ...prev, [activeFieldId.toLowerCase()]: { x, y } }));
        
        const posDesc = `Gelegen op circa ${x.toFixed(0)}% van links en ${y.toFixed(0)}% van boven.`;
        handleFieldChange(activeFieldId, posDesc);
        
        toast({ title: "Locatie gekoppeld", description: `Positie voor ${activeFieldId} opgeslagen.` });
    };

    const handleSave = () => {
        const serialized = Object.entries(fieldInstructions)
            .filter(([_, val]) => val.trim() !== '')
            .map(([key, val]) => `${key.toUpperCase()}: ${val}`)
            .join('\n');
        onSave(serialized, previewUrl);
    };

    const handleUploadSample = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !app) return;

        setIsUploadingSample(true);
        const storage = getStorage(app);
        const storagePath = `settings/ai_training_sample.pdf`;
        const storageRef = ref(storage, storagePath);
        
        try {
            const uploadTask = uploadBytesResumable(storageRef, file);
            await uploadTask;
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            setPreviewUrl(downloadUrl);
            toast({ title: "Sjabloon geüpload", description: "Het voorbeeld is succesvol opgeslagen." });
        } catch (err: any) {
            console.error("Sample upload error:", err);
            toast({ variant: 'destructive', title: "Upload mislukt", description: "Fout bij opslaan sjabloon." });
        } finally {
            setIsUploadingSample(false);
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="h-8 border-slate-300 text-slate-600 hover:bg-slate-100">
                    <Settings2 className="mr-2 h-4 w-4" /> AI Training
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[1200px] h-[95vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
                <DialogHeader className="p-6 border-b shrink-0 bg-slate-50/80 backdrop-blur-md">
                    <div className="flex justify-between items-center">
                        <div>
                            <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900">AI Training & Sjabloon Beheer</DialogTitle>
                            <DialogDescription className="font-bold text-slate-500">
                                Zoom in en klik op de afbeelding om velden te koppelen aan de visuele layout.
                            </DialogDescription>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex items-center bg-white border rounded-xl px-2 mr-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
                                <span className="text-[10px] font-black w-12 text-center">{Math.round(zoom * 100)}%</span>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.min(3, zoom + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleUploadSample} className="hidden" accept="application/pdf,image/*" />
                            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploadingSample} className="h-9 bg-white">
                                {isUploadingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
                                Nieuw Sjabloon
                            </Button>
                        </div>
                    </div>
                </DialogHeader>
                
                <div className="flex-1 flex min-h-0">
                    <div className="w-2/3 border-r bg-slate-900 flex flex-col relative overflow-hidden group">
                        <ScrollArea className="flex-1">
                            <div 
                                className="relative flex items-center justify-center min-h-full"
                                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease-out' }}
                                onClick={handleImageClick}
                            >
                                <div className="relative w-full h-[1600px] cursor-crosshair">
                                    <Image 
                                        src={previewUrl || "https://i.ibb.co/nNFZcctf/Schermafbeelding-2026-02-18-104605.png"} 
                                        alt="Formulier Sjabloon" 
                                        fill
                                        className="object-contain"
                                        priority
                                    />
                                    {Object.entries(markers).map(([id, pos]) => (
                                        <div 
                                            key={id} 
                                            className="absolute w-6 h-6 -ml-3 -mt-3 bg-primary/80 rounded-full border-2 border-white flex items-center justify-center shadow-lg animate-in zoom-in"
                                            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                                        >
                                            <Target className="h-3 w-3 text-white" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </ScrollArea>
                        <div className="absolute bottom-4 left-4 z-20 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-white shadow-lg flex items-center gap-3">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Referentie Sjabloon</p>
                            {activeFieldId && (
                                <Badge className="bg-primary border-none text-[9px] font-black uppercase">Mappen: {activeFieldId}</Badge>
                            )}
                        </div>
                    </div>

                    <div className="w-1/3 flex flex-col bg-white">
                        <div className="p-4 border-b shrink-0 bg-slate-50">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Veld Mapping Instructies</Label>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-6">
                                <div className="space-y-4">
                                    {MAPPING_FIELDS.map((field) => (
                                        <div 
                                            key={field.id} 
                                            className={cn(
                                                "space-y-1.5 p-2 rounded-xl transition-all border-2",
                                                activeFieldId === field.id ? "border-primary bg-primary/5" : "border-transparent"
                                            )}
                                            onFocus={() => setactiveFieldId(field.id)}
                                        >
                                            <Label className="text-[9px] font-black uppercase text-slate-400 ml-1 flex justify-between items-center">
                                                {field.label}
                                                {markers[field.id.toLowerCase()] && <Target className="h-3 w-3 text-primary" />}
                                            </Label>
                                            <Input 
                                                value={fieldInstructions[field.id.toLowerCase()] || ''} 
                                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                                onFocus={() => setactiveFieldId(field.id)}
                                                placeholder={`Klik op afbeelding voor locatie...`}
                                                className="h-9 text-xs font-bold border-slate-200 focus:ring-primary/20 shadow-sm"
                                            />
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm">
                                    <h4 className="text-[10px] font-black uppercase text-blue-700 mb-2 flex items-center gap-2"><Sparkles className="h-3 w-3" /> Training Tips</h4>
                                    <ul className="text-[10px] text-blue-600 space-y-1.5 font-black uppercase tracking-tight">
                                        <li className="flex gap-2">• Selecteer een veld en klik op de afbeelding</li>
                                        <li className="flex gap-2">• Zoom in voor precieze selectie</li>
                                        <li className="flex gap-2">• Combineer positie met label-tekst</li>
                                    </ul>
                                </div>
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="p-6 border-t shrink-0 bg-slate-50">
                    <DialogClose asChild>
                        <Button variant="ghost" className="font-bold">Sluiten</Button>
                    </DialogClose>
                    <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Configuratie Opslaan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function NewIssuePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useProfile();
  const { startProcessing } = useGlobalLoading();
  const app = useFirebaseApp();
  const { setIsHeaderVisible } = useNavigationUI();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isParsingPdf, setIsParsingPdf] = React.useState(false);
  const [isSavingConfig, setIsSavingConfig] = React.useState(false);

  const searchParams = useSearchParams();
  const meldingIdFromUrl = searchParams.get('id');
  const [isReadOnly, setIsReadOnly] = React.useState(false);
  const [viewedMelding, setViewedMelding] = React.useState<Melding | null>(null);

  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  const aiConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'pdf_config') : null, [firestore]);
  const { data: aiConfig } = useDoc<{ instructions: string, samplePdfUrl?: string }>(aiConfigRef);
  const pdfInstructions = aiConfig?.instructions || '';
  const samplePdfUrl = aiConfig?.samplePdfUrl;

  const statusesRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'statuses') : null, [firestore]);
  const categoriesRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'categories') : null, [firestore]);
  const handlersRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'handlers') : null, [firestore]);
  const reporterTypesRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'reporter_types') : null, [firestore]);

  const { data: statusesData } = useDoc<{ names: string[] }>(statusesRef);
  const { data: categoriesData } = useDoc<{ hoofdcategorieen: string[], subcategorieMapping: Record<string, string[]> }>(categoriesRef);
  const { data: handlersData } = useDoc<{ names: string[] }>(handlersRef);
  const { data: reporterTypesData } = useDoc<{ names: string[] }>(reporterTypesRef);

  const statusOptions = statusesData?.names || DEFAULT_STATUS_OPTIONS;
  const hoofdcategorieOptions = categoriesData?.hoofdcategorieen || DEFAULT_HOOFDCATEGORIEEN;
  const subcategorieMapping = categoriesData?.subcategorieMapping || DEFAULT_SUBCATEGORIE_MAPPING;
  const handlerOptions = handlersData?.names || DEFAULT_HANDLERS;
  const reporterTypeOptions = reporterTypesData?.names || DEFAULT_REPORTER_TYPES;

  const meldingenCollection = useMemoFirebase(() => firestore ? collection(firestore, 'meldingen') : null, [firestore]);
  const { data: allMeldingen } = useCollection<Melding>(meldingenCollection);

  const now = new Date();

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      intakenummer: '',
      ext_referentie: '',
      containernummer: '',
      status: 'Nieuw',
      meldingsdatum: now,
      meldingsuur: format(now, 'HH:mm'),
      voorvaldatum: now,
      voorvaltijd: format(now, 'HH:mm'),
      soort_melder: '',
      hoofdcategorie: '',
      subcategorie: '',
      behandelende_afdeling: '',
      behandelaar: '',
      actiedatum: null,
      soort_melding: '',
      straatnaam: '',
      nummer: '',
      postcode: '',
      plaats: '',
      wijk: '',
      werkgebied: '',
      melder: '',
      telefoon_melder: '',
      email_melder: '',
      burgerservicenummer: '',
      extra_informatie: '',
      afgehandeld_door: '',
      afhandeling_datum: null,
      afhandeling_tijdstip: '',
      afhandeling_bijzonderheden: '',
    },
  });
  
  const watchedHoofdcategorie = form.watch('hoofdcategorie');
  const watchedSubcategorie = form.watch('subcategorie');
  const watchedBehandelaar = form.watch('behandelaar');

  const displayHoofdOptions = React.useMemo(() => {
    const opts = [...hoofdcategorieOptions];
    if (watchedHoofdcategorie && !opts.includes(watchedHoofdcategorie)) opts.push(watchedHoofdcategorie);
    return opts;
  }, [hoofdcategorieOptions, watchedHoofdcategorie]);

  const displaySubOptions = React.useMemo(() => {
    let options: string[] = [];
    if (watchedHoofdcategorie) {
      options = [...(subcategorieMapping[watchedHoofdcategorie] || [])];
    } else {
      const allSubs = Object.values(subcategorieMapping).flat();
      options = Array.from(new Set(allSubs));
    }
    
    if (watchedSubcategorie && !options.includes(watchedSubcategorie)) {
      options.push(watchedSubcategorie);
    }
    return options.sort();
  }, [subcategorieMapping, watchedHoofdcategorie, watchedSubcategorie]);

  const displayHandlerOptions = React.useMemo(() => {
    const opts = [...handlerOptions];
    if (watchedBehandelaar && !opts.includes(watchedBehandelaar)) opts.push(watchedBehandelaar);
    return opts;
  }, [handlerOptions, watchedBehandelaar]);

  const viewedMeldingFromDb = React.useMemo(() => {
    if (!meldingIdFromUrl || !allMeldingen) return null;
    return allMeldingen.find(m => m.id === meldingIdFromUrl);
  }, [allMeldingen, meldingIdFromUrl]);

  React.useEffect(() => {
    if (viewedMeldingFromDb) {
      setViewedMelding(viewedMeldingFromDb);
      setIsReadOnly(true);
      form.reset({
        intakenummer: viewedMeldingFromDb.intakenummer || '',
        containernummer: viewedMeldingFromDb.containernummer || '',
        soort_melder: viewedMeldingFromDb.soort_melder || '',
        hoofdcategorie: viewedMeldingFromDb.hoofdcategorie,
        subcategorie: viewedMeldingFromDb.subcategorie,
        behandelende_afdeling: viewedMeldingFromDb.behandelende_afdeling || '',
        behandelaar: viewedMeldingFromDb.behandelaar || '',
        status: viewedMeldingFromDb.status,
        voorvaldatum: viewedMeldingFromDb.datum ? new Date(viewedMeldingFromDb.datum) : undefined,
        voorvaltijd: viewedMeldingFromDb.tijdstip,
        meldingsdatum: viewedMeldingFromDb.datum ? new Date(viewedMeldingFromDb.datum) : undefined,
        meldingsuur: viewedMeldingFromDb.tijdstip,
        ext_referentie: viewedMeldingFromDb.extern_meldingsnummer || '',
        straatnaam: viewedMeldingFromDb.straatnaam || '',
        nummer: viewedMeldingFromDb.huisnummer || '',
        postcode: viewedMeldingFromDb.postcode || '',
        plaats: viewedMeldingFromDb.plaats || '',
        wijk: viewedMeldingFromDb.wijk || '',
        werkgebied: viewedMeldingFromDb.werkgebied || '',
        melder: viewedMeldingFromDb.melder,
        telefoon_melder: viewedMeldingFromDb.telefoon_melder || '',
        email_melder: viewedMeldingFromDb.email_melder || '',
        burgerservicenummer: viewedMeldingFromDb.burgerservicenummer || '',
        extra_informatie: viewedMeldingFromDb.extra_informatie,
        afgehandeld_door: viewedMeldingFromDb.afgehandeld_door || '',
        afhandeling_datum: viewedMeldingFromDb.afhandeling_datum ? new Date(viewedMeldingFromDb.afhandeling_datum) : null,
        afhandeling_tijdstip: viewedMeldingFromDb.afhandeling_tijdstip || '',
        afhandeling_bijzonderheden: viewedMeldingFromDb.afhandeling_bijzonderheden || '',
      });
      setLocation({ latitude: viewedMeldingFromDb.latitude, longitude: viewedMeldingFromDb.longitude });
      setUploadedFiles(viewedMeldingFromDb.files || []);
      setUploadedPhotos(viewedMeldingFromDb.fotos || []);
    }
  }, [viewedMeldingFromDb?.id, meldingIdFromUrl, form]);

  const handleSaveAIInstructions = async (instructions: string, pdfUrl?: string) => {
    if (!firestore || !aiConfigRef) return;
    setIsSavingConfig(true);
    try {
        await setDocumentNonBlocking(aiConfigRef, { instructions, samplePdfUrl: pdfUrl || null }, { merge: true });
        toast({ title: "AI Training opgeslagen", description: "De PDF-sjabloon en instructies zijn succesvol bijgewerkt." });
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij opslaan", description: "Kon de instellingen niet bijwerken." });
    } finally {
        setIsSavingConfig(false);
    }
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !firestore || !app) return;

    setIsParsingPdf(true);
    const fileArray = Array.from(files);
    toast({ description: `BeheerHub AI analyseert ${fileArray.length} document(en)...` });

    try {
        for (const file of fileArray) {
            const extractedText = await pdfjs.getDocument(await file.arrayBuffer()).promise.then(async pdf => {
                let txt = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const pg = await pdf.getPage(i);
                    txt += (await pg.getTextContent()).items.map((it: any) => it.str).join(' ') + '\n';
                }
                return txt;
            });

            const isTextAvailable = extractedText.length > 50;
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsDataURL(file);
            });

            const result = await parseIssuePdf({ 
                pdfDataUri: isTextAvailable ? undefined : base64,
                textContent: isTextAvailable ? extractedText : undefined,
                instructions: pdfInstructions
            });

            const pdfArrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(pdfArrayBuffer);

            for (const parsed of result.meldingen) {
                let lat = 0; let lng = 0;
                const fullAddress = `${parsed.straatnaam || ''} ${parsed.huisnummer || ''}, ${parsed.plaats || ''}`.trim();
                if (fullAddress.length > 5) {
                    try {
                        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`);
                        const geo = await res.json();
                        if (geo.features?.length > 0) [lng, lat] = geo.features[0].center;
                    } catch (e) {}
                }

                const mData: any = {
                    intakenummer: parsed.intakenummer || `M-${Date.now()}`,
                    containernummer: parsed.containernummer || '',
                    hoofdcategorie: parsed.label_1 || 'Overig',
                    subcategorie: parsed.label_2 || 'Overige meldingen',
                    behandelaar: parsed.behandelaar || 'Onbekend',
                    status: 'Nieuw',
                    melder: parsed.melder || 'Automatisch ingevoerd',
                    extern_meldingsnummer: parsed.extern_meldingsnummer || '',
                    extra_informatie: parsed.extra_informatie || '',
                    straatnaam: parsed.straatnaam || '',
                    huisnummer: parsed.huisnummer || '',
                    postcode: parsed.postcode || '',
                    plaats: parsed.plaats || '',
                    latitude: lat,
                    longitude: lng,
                    datum: parsed.datum || format(new Date(), 'yyyy-MM-dd'),
                    tijdstip: parsed.tijdstip || format(new Date(), 'HH:mm'),
                    aangenomen_door: profile?.displayName || profile?.email || 'Onbekend',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                };

                const docRef = await addDoc(collection(firestore, 'meldingen'), mData);
                
                if (parsed.paginanummer) {
                    const i = parsed.paginanummer - 1;
                    const newDoc = await PDFDocument.create();
                    const [copiedPage] = await newDoc.copyPages(pdfDoc, [i]);
                    newDoc.addPage(copiedPage);
                    const pdfBytes = await newDoc.save();
                    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                    const storagePath = `meldingen/${docRef.id}/documents/${Date.now()}-bon_${parsed.intakenummer}.pdf`;
                    const snap = await uploadBytesResumable(ref(getStorage(app), storagePath), blob);
                    const url = await getDownloadURL(snap.ref);
                    await updateDoc(docRef, { files: [{ name: `bon_${parsed.intakenummer}.pdf`, url, size: blob.size, type: 'application/pdf', uploadedAt: new Date().toISOString(), storagePath }] });
                }
            }
        }
        toast({ title: "Scans voltooid" });
        router.push('/issues/portal');
    } catch (err) {
        toast({ variant: 'destructive', title: "Fout bij inlezen" });
    } finally {
        setIsParsingPdf(false);
    }
  };

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore || isSubmitting) return;
    setIsSubmitting(true);
    try {
       const mData: any = {
        ...data,
        voorvaldatum: data.voorvaldatum ? format(data.voorvaldatum, 'yyyy-MM-dd') : null,
        meldingsdatum: data.meldingsdatum ? format(data.meldingsdatum, 'yyyy-MM-dd') : null,
        actiedatum: data.actiedatum ? format(data.actiedatum, 'yyyy-MM-dd') : null,
        afhandeling_datum: data.afhandeling_datum ? format(data.afhandeling_datum, 'yyyy-MM-dd') : null,
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        files: uploadedFiles,
        fotos: uploadedPhotos,
        updatedAt: serverTimestamp(),
      };

      const userDisplayName = profile?.displayName || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || profile?.email || 'Onbekend';

      if (viewedMelding) {
          if (data.status === 'Afgerond' && viewedMelding.status !== 'Afgerond') {
              mData.afhandeling_datum = format(new Date(), 'yyyy-MM-dd');
              mData.afhandeling_tijdstip = format(new Date(), 'HH:mm');
              mData.afgehandeld_door = userDisplayName;
          }
          updateDocumentNonBlocking(doc(firestore, 'meldingen', viewedMelding.id), mData);
      } else {
          mData.aangenomen_door = userDisplayName;
          mData.createdAt = serverTimestamp();
          addDocumentNonBlocking(collection(firestore, 'meldingen'), mData);
      }
      
      startProcessing(1000);
      router.push('/issues/open');
    } catch (error) { 
        toast({ variant: 'destructive', title: 'Fout opgetreden' }); 
    } finally { 
        setIsSubmitting(false); 
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
        <header className="h-14 bg-white border-b flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-9 w-9 rounded-full">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-sm font-black uppercase tracking-tight text-slate-900">
                    {viewedMelding ? `Melding: ${viewedMelding.intakenummer}` : 'Nieuwe Melding Aanmaken'}
                </h1>
            </div>
            
            <div className="flex items-center gap-2">
                <AIConfigDialog instructions={pdfInstructions} samplePdfUrl={samplePdfUrl} onSave={handleSaveAIInstructions} isSaving={isSavingConfig} />
                <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} className="hidden" accept="application/pdf" multiple />
                <Button type="button" variant="outline" onClick={() => pdfInputRef.current?.click()} className="h-9 border-blue-600 text-blue-600 hover:bg-blue-50 font-bold" disabled={isParsingPdf}>
                    {isParsingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} 
                    PDF-scan (Slim)
                </Button>
                <Separator orientation="vertical" className="h-6 mx-1" />
                <Button type="submit" form="new-melding-form" disabled={isSubmitting} className="h-9 font-black uppercase tracking-tight px-6 shadow-lg shadow-primary/20">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} 
                    Melding Opslaan
                </Button>
            </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
            <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/50 p-4 lg:p-8">
                <Form {...form}>
                    <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit)} className="max-w-5xl mx-auto space-y-8 pb-20">
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
                                <CardHeader className="bg-slate-900 text-white p-4">
                                    <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                        <FileText className="h-3 w-3 text-primary" /> Algemene Informatie
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-0.5">
                                    <FormRow label="Meldingsnummer">
                                        <FormField control={form.control} name="intakenummer" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly}/></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Ext. Referentie">
                                        <FormField control={form.control} name="ext_referentie" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly}/></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Containernr.">
                                        <FormField control={form.control} name="containernummer" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly}/></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Status">
                                        <FormField control={form.control} name="status" render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                                                <FormControl><SelectTrigger className="h-9 font-bold"><SelectValue /></SelectTrigger></FormControl>
                                                <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                            </Select>
                                        )} />
                                    </FormRow>
                                </CardContent>
                            </Card>

                            <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
                                <CardHeader className="bg-slate-900 text-white p-4">
                                    <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                        <Package className="h-3 w-3 text-primary" /> Categorie & Behandeling
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-0.5">
                                    <FormRow label="Hoofdindeling">
                                        <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                                <FormControl><SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Kies categorie" /></SelectTrigger></FormControl>
                                                <SelectContent>{displayHoofdOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                            </Select>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Indeling">
                                        <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                                <FormControl><SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Kies indeling" /></SelectTrigger></FormControl>
                                                <SelectContent>{displaySubOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                            </Select>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Afdeling">
                                        <FormField control={form.control} name="behandelende_afdeling" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly}/></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Behandelaar">
                                        <FormField control={form.control} name="behandelaar" render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                                <FormControl><SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Kies behandelaar" /></SelectTrigger></FormControl>
                                                <SelectContent>{displayHandlerOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                            </Select>
                                        )} />
                                    </FormRow>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
                            <CardHeader className="bg-slate-900 text-white p-4">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                    <Calendar className="h-3 w-3 text-primary" /> Data & Tijden
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-4">
                                    <FormField control={form.control} name="meldingsdatum" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-black uppercase text-slate-400">Meldingsdatum</FormLabel>
                                            <FormControl>
                                                <Input type="date" {...field} value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} className="h-10 font-bold" disabled={isReadOnly} />
                                            </FormControl>
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="meldingsuur" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-black uppercase text-slate-400">Meldingsuur</FormLabel>
                                            <FormControl><Input type="time" {...field} className="h-10 font-bold" disabled={isReadOnly} /></FormControl>
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="voorvaldatum" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-black uppercase text-slate-400">Voorvaldatum</FormLabel>
                                            <FormControl>
                                                <Input type="date" {...field} value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} className="h-10 font-bold" disabled={isReadOnly} />
                                            </FormControl>
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="voorvaltijd" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-black uppercase text-slate-400">Voorvaltijd</FormLabel>
                                            <FormControl><Input type="time" {...field} className="h-10 font-bold" disabled={isReadOnly} /></FormControl>
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="actiedatum" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-black uppercase text-slate-400">Actiedatum</FormLabel>
                                            <FormControl>
                                                <Input type="date" {...field} value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} className="h-10 font-bold" disabled={isReadOnly} />
                                            </FormControl>
                                        </FormItem>
                                    )} />
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
                                <CardHeader className="bg-slate-900 text-white p-4">
                                    <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                        <MapPin className="h-3 w-3 text-primary" /> Locatiegegevens
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-0.5">
                                    <FormRow label="Straatnaam">
                                        <FormField control={form.control} name="straatnaam" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                        )} />
                                    </FormRow>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormRow label="Huisnummer">
                                            <FormField control={form.control} name="nummer" render={({ field }) => (
                                                <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                            )} />
                                        </FormRow>
                                        <FormRow label="Postcode">
                                            <FormField control={form.control} name="postcode" render={({ field }) => (
                                                <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                            )} />
                                        </FormRow>
                                    </div>
                                    <FormRow label="Woonplaats">
                                        <FormField control={form.control} name="plaats" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Wijk">
                                        <FormField control={form.control} name="wijk" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Werkgebied">
                                        <FormField control={form.control} name="werkgebied" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                        )} />
                                    </FormRow>
                                </CardContent>
                            </Card>

                            <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
                                <CardHeader className="bg-slate-900 text-white p-4">
                                    <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                        <User className="h-3 w-3 text-primary" /> Melder Informatie
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-0.5">
                                    <FormRow label="Naam Melder">
                                        <FormField control={form.control} name="melder" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Soort Melder">
                                        <FormField control={form.control} name="soort_melder" render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                                                <FormControl><SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Kies soort melder" /></SelectTrigger></FormControl>
                                                <SelectContent>{reporterTypeOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                            </Select>
                                        )} />
                                    </FormRow>
                                    <FormRow label="Telefoon">
                                        <FormField control={form.control} name="telefoon_melder" render={({ field }) => (
                                            <FormControl><Input type="tel" {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="E-mail">
                                        <FormField control={form.control} name="email_melder" render={({ field }) => (
                                            <FormControl><Input type="email" {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                        )} />
                                    </FormRow>
                                    <FormRow label="BSN">
                                        <FormField control={form.control} name="burgerservicenummer" render={({ field }) => (
                                            <FormControl><Input {...field} className="h-9 font-bold" disabled={isReadOnly} /></FormControl>
                                        )} />
                                    </FormRow>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
                            <CardHeader className="bg-slate-900 text-white p-4">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                    <AlertCircle className="h-3 w-3 text-primary" /> Memo & Bijzonderheden
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Omschrijving melding (Memo)</Label>
                                    <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                                        <FormControl><Textarea {...field} className="resize-none min-h-[120px] font-medium" placeholder="Voer hier de omschrijving van de melding in..." disabled={isReadOnly}/></FormControl>
                                    )} />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Bijzonderheden bij afhandeling</Label>
                                    <FormField control={form.control} name="afhandeling_bijzonderheden" render={({ field }) => (
                                        <FormControl><Textarea {...field} className="resize-none min-h-[120px] font-medium" placeholder="Notities over de afhandeling..." disabled={isReadOnly}/></FormControl>
                                    )} />
                                </div>
                            </CardContent>
                        </Card>

                        {viewedMelding && (
                            <Card className="rounded-2xl border-none shadow-sm overflow-hidden border-2 border-primary/10">
                                <CardHeader className="bg-primary/5 p-4">
                                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <Check className="h-3 w-3" /> Afhandelingsinformatie
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                        <FormField control={form.control} name="afgehandeld_door" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black uppercase text-slate-400">Afgehandeld door</FormLabel>
                                                <FormControl><Input {...field} className="h-10 font-bold" disabled={isReadOnly} /></FormControl>
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="afhandeling_datum" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black uppercase text-slate-400">Afhandeldatum</FormLabel>
                                                <FormControl>
                                                    <Input type="date" {...field} value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} className="h-10 font-bold" disabled={isReadOnly} />
                                                </FormControl>
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="afhandeling_tijdstip" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black uppercase text-slate-400">Afhandeltijd</FormLabel>
                                                <FormControl><Input type="time" {...field} className="h-10 font-bold" disabled={isReadOnly} /></FormControl>
                                            </FormItem>
                                        )} />
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </form>
                </Form>
            </div>
            
            <div className="w-full lg:w-[450px] bg-white border-l shadow-2xl z-0 relative flex flex-col shrink-0">
                <div className="flex-1 relative">
                    <MapboxView latitude={location?.latitude} longitude={location?.longitude} />
                    <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border-2 border-slate-100 shadow-xl flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Locatie op Kaart</span>
                    </div>
                </div>
                <div className="h-1/3 bg-slate-50 p-6 border-t overflow-y-auto custom-scrollbar">
                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Bijlagen & Media</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <Card className="aspect-square border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:border-primary/30 hover:text-primary transition-all cursor-pointer group">
                            <UploadCloud className="h-8 w-8 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black uppercase">Document</span>
                        </Card>
                        <Card className="aspect-square border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:border-primary/30 hover:text-primary transition-all cursor-pointer group">
                            <Camera className="h-8 w-8 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black uppercase">Foto</span>
                        </Card>
                    </div>
                </div>
            </div>
        </main>
    </div>
  );
}
