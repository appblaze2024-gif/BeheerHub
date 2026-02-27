'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { 
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
  Calendar,
  Paperclip,
  FileSpreadsheet,
  ClipboardPaste
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
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';

// UI Components
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { IssueImportDialog } from '@/components/issue-import-dialog';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { MapboxView } from '@/components/mapbox-view';

// AI Flows
import { parseIssuePdf } from '@/ai/flows/parse-issue-pdf-flow';

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
    <div className="flex flex-col gap-0.5 py-0.5 border-b border-slate-100 last:border-0 min-h-[36px]">
        <FormLabel htmlFor={labelFor} className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{label}</FormLabel>
        <div className="flex-1 min-w-0">
            {children}
        </div>
    </div>
);

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

function SmartPasteDialog({ onParsed, instructions }: { onParsed: (data: any) => void, instructions: string }) {
    const [text, setText] = React.useState('');
    const [isProcessing, setIsProcessing] = React.useState(false);
    const { toast } = useToast();

    const handlePaste = async () => {
        if (!text.trim()) return;
        setIsProcessing(true);
        try {
            const result = await parseIssuePdf({ 
                textContent: text,
                instructions: instructions
            });
            if (result.meldingen && result.meldingen.length > 0) {
                onParsed(result.meldingen[0]);
                toast({ title: "Tekst geanalyseerd", description: "Verschillende velden zijn automatisch ingevuld." });
            }
        } catch (err) {
            toast({ variant: 'destructive', title: "Fout bij inlezen", description: "De AI kon de tekst niet begrijpen." });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold">
                    <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
                    Tekst Inlezen (AI)
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="font-black uppercase tracking-tight">Smart Paste</DialogTitle>
                    <DialogDescription className="font-bold text-slate-500">
                        Kopieer tekst uit een ander systeem (e-mail, CRM, etc.) en plak het hieronder. Onze AI haalt de gegevens eruit.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Textarea 
                        placeholder="Plak hier de tekst van de opdracht..." 
                        className="min-h-[200px] font-medium text-xs leading-relaxed" 
                        value={text} 
                        onChange={(e) => setText(e.target.value)} 
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Annuleren</Button></DialogClose>
                    <Button onClick={handlePaste} disabled={isProcessing || !text.trim()} className="font-black uppercase shadow-lg shadow-primary/20">
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Velden Invullen
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

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
                <Button variant="outline" className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold">
                    <Settings2 className="mr-2 h-4 w-4" /> AI Training
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[1200px] h-[95vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
                <DialogHeader className="p-6 border-b shrink-0 bg-white">
                    <div className="flex justify-between items-center">
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">AI Training & Sjabloon Beheer</DialogTitle>
                            <DialogDescription className="font-medium text-slate-500">
                                Zoom in en klik op de afbeelding om velden te koppelen aan de visuele layout.
                            </DialogDescription>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex items-center bg-slate-50 border rounded-lg px-2 mr-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
                                <span className="text-xs font-bold w-12 text-center">{Math.round(zoom * 100)}%</span>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.min(3, zoom + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleUploadSample} className="hidden" accept="application/pdf,image/*" />
                            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploadingSample} className="h-9">
                                {isUploadingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
                                Nieuw Sjabloon
                            </Button>
                        </div>
                    </div>
                </DialogHeader>
                
                <div className="flex-1 flex min-h-0">
                    <div className="w-2/3 border-r bg-slate-100 flex flex-col relative overflow-hidden group">
                        <ScrollArea className="h-full">
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
                        <div className="absolute bottom-4 left-4 z-20 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-900 shadow-lg flex items-center gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Referentie Sjabloon</p>
                            {activeFieldId && (
                                <Badge className="bg-primary border-none text-[10px] font-bold">Mappen: {activeFieldId}</Badge>
                            )}
                        </div>
                    </div>

                    <div className="w-1/3 flex flex-col bg-white">
                        <div className="p-4 border-b shrink-0 bg-slate-50">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Veld Mapping Instructies</Label>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-6">
                                <div className="space-y-4">
                                    {MAPPING_FIELDS.map((field) => (
                                        <div 
                                            key={field.id} 
                                            className={cn(
                                                "space-y-1.5 p-2 rounded-lg transition-all border",
                                                activeFieldId === field.id ? "border-primary bg-primary/5" : "border-transparent"
                                            )}
                                            onFocus={() => setactiveFieldId(field.id)}
                                        >
                                            <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1 flex justify-between items-center">
                                                {field.label}
                                                {markers[field.id.toLowerCase()] && <Target className="h-3 w-3 text-primary" />}
                                            </Label>
                                            <Input 
                                                value={fieldInstructions[field.id.toLowerCase()] || ''} 
                                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                                onFocus={() => setactiveFieldId(field.id)}
                                                placeholder={`Klik op afbeelding...`}
                                                className="h-9 text-xs font-semibold border-slate-200 shadow-sm"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="p-6 border-t shrink-0 bg-slate-50">
                    <DialogClose asChild>
                        <Button variant="ghost" className="font-bold">Sluiten</Button>
                    </DialogClose>
                    <Button onClick={handleSave} disabled={isSaving} className="font-bold h-11 px-8 shadow-lg shadow-primary/20">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Configuratie Opslaan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type UploadedFile = {
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
  storagePath: string;
};

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
  const [isImportDialogOpen, setIsImportDialogOpen] = React.useState(false);

  const searchParams = useSearchParams();
  const meldingIdFromUrl = searchParams.get('id');
  const [isReadOnly, setIsReadOnly] = React.useState(false);
  const [viewedMelding, setViewedMelding] = React.useState<any | null>(null);

  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
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
  const { data: allMeldingen } = useCollection<any>(meldingenCollection);

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
    const pendingData = localStorage.getItem('pending_forwarded_melding');
    if (pendingData) {
        try {
            const { parsed, file } = JSON.parse(pendingData);
            if (parsed) {
                handleSmartFill(parsed);
                if (file) setUploadedFiles([file]);
            }
            localStorage.removeItem('pending_forwarded_melding');
        } catch (e) { console.error("Error loading pending intake:", e); }
    }
  }, []);

  const handleSmartFill = async (data: any) => {
    if (!data) return;
    
    const address = `${data.straatnaam || ''} ${data.huisnummer || ''}, ${data.plaats || ''}`.trim();
    if (address.length > 5) {
        try {
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`);
            const geo = await res.json();
            if (geo.features?.length > 0) {
                setLocation({ latitude: geo.features[0].center[1], longitude: geo.features[0].center[0] });
            }
        } catch (e) {}
    }

    form.reset({
        ...form.getValues(),
        intakenummer: data.intakenummer || form.getValues('intakenummer'),
        ext_referentie: data.extern_meldingsnummer || form.getValues('ext_referentie'),
        straatnaam: data.straatnaam || form.getValues('straatnaam'),
        nummer: data.huisnummer || form.getValues('nummer'),
        postcode: data.postcode || form.getValues('postcode'),
        plaats: data.plaats || form.getValues('plaats'),
        melder: data.melder || form.getValues('melder'),
        extra_informatie: data.extra_informatie || form.getValues('extra_informatie'),
        hoofdcategorie: data.label_1 || form.getValues('hoofdcategorie'),
        subcategorie: data.label_2 || form.getValues('subcategorie'),
        behandelaar: data.behandelaar || form.getValues('behandelaar'),
        voorvaldatum: data.datum ? new Date(data.datum) : form.getValues('voorvaldatum'),
        voorvaltijd: data.tijdstip || form.getValues('voorvaltijd'),
        meldingsdatum: data.datum ? new Date(data.datum) : form.getValues('meldingsdatum'),
        meldingsuur: data.tijdstip || form.getValues('meldingsuur'),
        containernummer: data.containernummer || form.getValues('containernummer'),
    });
  };

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
        toast({ title: "AI Training opgeslagen", description: "Instellingen succesvol bijgewerkt." });
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij opslaan" });
    } finally {
        setIsSavingConfig(false);
    }
  };

  const handleFileUpload = React.useCallback(async (files: FileList | File[], type: 'files' | 'fotos') => {
    if (!files || files.length === 0 || !app) return;
    
    const storage = getStorage(app);
    const tempId = form.getValues('intakenummer') || `temp-${Date.now()}`;

    for (const file of Array.from(files)) {
      const storagePath = `meldingen/${tempId}/${type}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
        },
        (error) => {
          console.error("Upload failed:", error);
          toast({ variant: 'destructive', title: 'Upload mislukt', description: `Kon ${file.name} niet uploaden.` });
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          const uploaded: UploadedFile = {
            name: file.name,
            url,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString(),
            storagePath
          };

          if (type === 'files') {
            setUploadedFiles(prev => [...prev, uploaded]);
          } else {
            setUploadedPhotos(prev => [...prev, uploaded]);
          }
          
          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
        }
      );
    }
  }, [app, form, toast]);

  const handleRemoveFile = (storagePath: string, type: 'files' | 'fotos') => {
    if (type === 'files') {
      setUploadedFiles(prev => prev.filter(f => f.storagePath !== storagePath));
    } else {
      setUploadedPhotos(prev => prev.filter(f => f.storagePath !== storagePath));
    }
  };

  const geocodeAddress = async (address: string) => {
    if (!address || address.length < 5) return { lat: 0, lng: 0 };
    try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`);
        const geo = await res.json();
        if (geo.features?.length > 0) {
            return { lng: geo.features[0].center[0], lat: geo.features[0].center[1] };
        }
    } catch (e) {
        console.warn("Geocoding failed:", e);
    }
    return { lat: 0, lng: 0 };
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !firestore || !app) return;

    setIsParsingPdf(true);
    const fileArray = Array.from(files);
    toast({ description: `AI analyseert ${fileArray.length} document(en)...` });

    try {
        for (const file of fileArray) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            
            let textContent = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const pg = await pdf.getPage(i);
                const text = await pg.getTextContent();
                textContent += text.items.map((it: any) => it.str).join(' ') + '\n';
            }

            const isTextAvailable = textContent.trim().length > 50;
            let base64 = '';
            if (!isTextAvailable) {
                base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result as string);
                    reader.readAsDataURL(file);
                });
            }

            const result = await parseIssuePdf({ 
                pdfDataUri: isTextAvailable ? undefined : base64,
                textContent: isTextAvailable ? textContent : undefined,
                instructions: pdfInstructions
            });

            if (result.meldingen.length === 1 && fileArray.length === 1) {
                const parsed = result.meldingen[0];
                await handleSmartFill(parsed);
                
                const storagePath = `meldingen/temp/${Date.now()}-${file.name}`;
                const storageRef = ref(getStorage(app), storagePath);
                const uploadTask = uploadBytesResumable(storageRef, file);
                await uploadTask;
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                
                setUploadedFiles(prev => [...prev, { 
                    name: file.name, 
                    url, 
                    size: file.size, 
                    type: file.type, 
                    uploadedAt: new Date().toISOString(), 
                    storagePath 
                }]);
                
                toast({ title: "Scan voltooid", description: "Het formulier is ingevuld." });
            } else {
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const userDisplayName = profile?.displayName || profile?.email || 'Onbekend';

                for (const parsed of result.meldingen) {
                    const fullAddress = `${parsed.straatnaam || ''} ${parsed.huisnummer || ''}, ${parsed.plaats || ''}`.trim();
                    const { lat, lng } = await geocodeAddress(fullAddress);

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
                        aangenomen_door: userDisplayName,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    };

                    const meldingenCol = collection(firestore, 'meldingen');
                    const meldingDocRef = doc(meldingenCol);
                    
                    if (parsed.paginanummer && parsed.paginanummer <= pdf.numPages) {
                        const newPdf = await PDFDocument.create();
                        const [page] = await newPdf.copyPages(pdfDoc, [parsed.paginanummer - 1]);
                        newPdf.addPage(page);
                        const pdfBytes = await newPdf.save();
                        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                        
                        const storagePath = `meldingen/${meldingDocRef.id}/documents/${Date.now()}-bon_${parsed.intakenummer}.pdf`;
                        const storageRef = ref(getStorage(app), storagePath);
                        const uploadTask = uploadBytesResumable(storageRef, blob);
                        await uploadTask;
                        const url = await getDownloadURL(uploadTask.snapshot.ref);
                        
                        mData.files = [{ 
                            name: `bon_${parsed.intakenummer}.pdf`, 
                            url, 
                            size: blob.size, 
                            type: 'application/pdf', 
                            uploadedAt: new Date().toISOString(), 
                            storagePath 
                        }];
                    }

                    setDocumentNonBlocking(meldingDocRef, mData, {});
                }
                toast({ title: "Bulk scan voltooid", description: `${result.meldingen.length} meldingen toegevoegd aan portaal.` });
                router.push('/issues/portal');
            }
        }
    } catch (err: any) {
        console.error("PDF Scan error:", err);
        toast({ variant: 'destructive', title: "Fout bij inlezen", description: err.message || "Er is een fout opgetreden bij het verwerken van de PDF." });
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
        <header className="h-14 bg-white border-b flex items-center justify-end px-6 shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-2">
                <IssueImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} onSuccess={() => router.push('/issues/portal')}>
                    <Button variant="outline" size="sm" className="h-9 border-green-200 text-green-600 hover:bg-green-50 font-bold">
                        <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                        Excel / CSV Bulk
                    </Button>
                </IssueImportDialog>
                <SmartPasteDialog onParsed={handleSmartFill} instructions={pdfInstructions} />
                <AIConfigDialog instructions={pdfInstructions} samplePdfUrl={samplePdfUrl} onSave={handleSaveAIInstructions} isSaving={isSavingConfig} />
                <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} className="hidden" accept="application/pdf" multiple />
                <Button type="button" variant="outline" size="sm" onClick={() => pdfInputRef.current?.click()} className="h-9 border-blue-200 text-blue-600 hover:bg-blue-50 font-bold" disabled={isParsingPdf}>
                    {isParsingPdf ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />} 
                    PDF Scannen
                </Button>
                <Separator orientation="vertical" className="h-5 mx-1" />
                <Button type="submit" form="new-melding-form" size="sm" disabled={isSubmitting} className="h-9 font-bold px-6 shadow-lg shadow-primary/20">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} 
                    Opslaan
                </Button>
            </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
            <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
                <div className="p-4 lg:p-6 space-y-3 flex-1 overflow-y-auto no-scrollbar">
                    <Form {...form}>
                        <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit)} className="w-full max-w-full flex flex-col h-full gap-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-3">
                                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                                        <CardHeader className="bg-slate-50 border-b py-1.5 px-4">
                                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                <FileText className="h-3 w-3" /> Hoofdgegevens
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-3 pt-0">
                                            <FormRow label="Meldingsnummer">
                                                <FormField control={form.control} name="intakenummer" render={({ field }) => (
                                                    <FormItem><FormControl><Input {...field} size="sm" className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly}/></FormControl></FormItem>
                                                )} />
                                            </FormRow>
                                            <FormRow label="Extern Ref.">
                                                <FormField control={form.control} name="ext_referentie" render={({ field }) => (
                                                    <FormItem><FormControl><Input {...field} size="sm" className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly}/></FormControl></FormItem>
                                                )} />
                                            </FormRow>
                                            <FormRow label="Status">
                                                <FormField control={form.control} name="status" render={({ field }) => (
                                                    <FormItem>
                                                        <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                                                            <FormControl><SelectTrigger className="h-8 text-xs font-bold border-slate-200"><SelectValue /></SelectTrigger></FormControl>
                                                            <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )} />
                                            </FormRow>
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                                        <CardHeader className="bg-slate-50 border-b py-1.5 px-4">
                                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                <MapPin className="h-3 w-3" /> Locatie
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-3 pt-0">
                                            <FormRow label="Straatnaam">
                                                <FormField control={form.control} name="straatnaam" render={({ field }) => (
                                                    <FormItem><FormControl><Input {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                )} />
                                            </FormRow>
                                            <div className="grid grid-cols-2 gap-2">
                                                <FormRow label="Huisnr.">
                                                    <FormField control={form.control} name="nummer" render={({ field }) => (
                                                        <FormItem><FormControl><Input {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                    )} />
                                                </FormRow>
                                                <FormRow label="Postcode">
                                                    <FormField control={form.control} name="postcode" render={({ field }) => (
                                                        <FormItem><FormControl><Input {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                    )} />
                                                </FormRow>
                                            </div>
                                            <FormRow label="Plaats">
                                                <FormField control={form.control} name="plaats" render={({ field }) => (
                                                    <FormItem><FormControl><Input {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                )} />
                                            </FormRow>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="space-y-3">
                                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                                        <CardHeader className="bg-slate-50 border-b py-1.5 px-4">
                                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                <Package className="h-3 w-3" /> Categorie & Behandelaar
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-3 pt-0">
                                            <FormRow label="Hoofdtype">
                                                <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                                    <FormItem>
                                                        <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                                            <FormControl><SelectTrigger className="h-8 text-xs font-bold border-slate-200"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                            <SelectContent>{displayHoofdOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )} />
                                            </FormRow>
                                            <FormRow label="Subtype">
                                                <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                                    <FormItem>
                                                        <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                                            <FormControl><SelectTrigger className="h-8 text-xs font-bold border-slate-200"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                            <SelectContent>{displaySubOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )} />
                                            </FormRow>
                                            <FormRow label="Behandelaar">
                                                <FormField control={form.control} name="behandelaar" render={({ field }) => (
                                                    <FormItem>
                                                        <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                                            <FormControl><SelectTrigger className="h-8 text-xs font-bold border-slate-200"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                            <SelectContent>{displayHandlerOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )} />
                                            </FormRow>
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                                        <CardHeader className="bg-slate-50 border-b py-1.5 px-4">
                                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                <User className="h-3 w-3" /> Melder
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-3 pt-0">
                                            <FormRow label="Naam Melder">
                                                <FormField control={form.control} name="melder" render={({ field }) => (
                                                    <FormItem><FormControl><Input {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                )} />
                                            </FormRow>
                                            <div className="grid grid-cols-2 gap-2">
                                                <FormRow label="E-mail">
                                                    <FormField control={form.control} name="email_melder" render={({ field }) => (
                                                        <FormItem><FormControl><Input type="email" {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                    )} />
                                                </FormRow>
                                                <FormRow label="Telefoon">
                                                    <FormField control={form.control} name="telefoon_melder" render={({ field }) => (
                                                        <FormItem><FormControl><Input type="tel" {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                    )} />
                                                </FormRow>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                                    <CardHeader className="bg-slate-50 border-b py-1.5 px-4">
                                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <Calendar className="h-3 w-3" /> Tijden
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0">
                                        <div className="grid grid-cols-2 gap-2">
                                            <FormRow label="Melddatum">
                                                <FormField control={form.control} name="meldingsdatum" render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input type="date" {...field} value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} />
                                                        </FormControl>
                                                    </FormItem>
                                                )} />
                                            </FormRow>
                                            <FormRow label="Uur">
                                                <FormField control={form.control} name="meldingsuur" render={({ field }) => (
                                                    <FormItem><FormControl><Input type="time" {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                )} />
                                            </FormRow>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                                    <CardHeader className="bg-slate-50 border-b py-1.5 px-4">
                                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <AlertCircle className="h-3 w-3" /> Memo
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0">
                                        <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                                            <FormItem><FormControl><Textarea {...field} className="resize-none min-h-[60px] text-xs font-medium border-slate-200 bg-slate-50/30" placeholder="Omschrijving melding..." disabled={isReadOnly}/></FormControl></FormItem>
                                        )} />
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3 mt-1">
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        className="h-20 border-2 border-dashed border-slate-200 bg-white hover:border-primary/30 hover:bg-slate-50 transition-all flex flex-col gap-2 rounded-2xl"
                                        onClick={() => document.getElementById('media-doc-input')?.click()}
                                    >
                                        <UploadCloud className="h-6 w-6 text-slate-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Document Toevoegen</span>
                                        <input type="file" id="media-doc-input" className="hidden" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'files')} />
                                    </Button>
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        className="h-20 border-2 border-dashed border-slate-200 bg-white hover:border-primary/30 hover:bg-slate-50 transition-all flex flex-col gap-2 rounded-2xl"
                                        onClick={() => document.getElementById('media-photo-input')?.click()}
                                    >
                                        <Camera className="h-6 w-6 text-slate-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Foto Toevoegen</span>
                                        <input type="file" id="media-photo-input" className="hidden" accept="image/*" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'fotos')} />
                                    </Button>
                                </div>

                                {Object.entries(uploadProgress).map(([name, progress]) => (
                                    <div key={name} className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm animate-in fade-in">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold truncate pr-4">{name}</span>
                                            <span className="text-[10px] font-black text-primary">{Math.round(progress)}%</span>
                                        </div>
                                        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                ))}

                                {(uploadedFiles.length > 0 || uploadedPhotos.length > 0) && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                        {uploadedFiles.map(file => (
                                            <div key={file.storagePath} className="flex items-center justify-between p-2 rounded-xl bg-blue-50 border border-blue-100 group">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Paperclip className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                    <span className="text-[10px] font-bold truncate text-blue-700">{file.name}</span>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-blue-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveFile(file.storagePath, 'files')}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                        {uploadedPhotos.map(photo => (
                                            <div key={photo.storagePath} className="flex items-center justify-between p-2 rounded-xl bg-green-50 border border-green-100 group">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Camera className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                                    <span className="text-[10px] font-bold truncate text-green-700">{photo.name}</span>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-blue-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveFile(photo.storagePath, 'fotos')}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </form>
                    </Form>
                </div>
            </div>
            
            <div className="w-full lg:w-[400px] p-4 bg-slate-50 border-l shrink-0 h-full overflow-hidden flex flex-col gap-4">
                <Card className="h-1/2 relative overflow-hidden border-none shadow-2xl rounded-2xl bg-slate-100">
                    <MapboxView latitude={location?.latitude} longitude={location?.longitude} />
                    <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-lg border border-slate-200 shadow-md flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[8px] font-bold uppercase tracking-widest text-slate-900">Live Kaart</span>
                    </div>
                </Card>
            </div>
        </main>
    </div>
  );
}