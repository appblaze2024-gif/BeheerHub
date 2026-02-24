
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, addDays, isWeekend } from 'date-fns';
import { ArrowLeft, Loader2, Search, UploadCloud, FileIcon, Trash2, Camera, MapPin, Sparkles, Settings2, FileText, Eye, X, ZoomIn, ZoomOut, Target, Upload, ChevronDown, Package, Clock } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking, useFirebaseApp, useCollection, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, doc, arrayUnion, serverTimestamp, addDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
import { useNavigationUI } from '@/context/navigation-ui-context';
import Image from 'next/image';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import * as turf from '@turf/turf';
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
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapboxView } from '@/components/mapbox-view';
import { parseIssuePdf } from '@/ai/flows/parse-issue-pdf-flow';
import type { Melding, UploadedFile, Object as MapObject } from '@/lib/types';

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
  voorvaldatum: z.date().optional(),
  voorvaltijd: z.string().optional(),
  meldingsdatum: z.date().optional(),
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
    <div className="grid grid-cols-[140px_1fr] items-start gap-x-2 py-0.5 min-h-[32px]">
        <FormLabel htmlFor={labelFor} className="text-[10px] text-left pt-2 font-black uppercase text-slate-400 tracking-tighter shrink-0">{label}</FormLabel>
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
                <DialogHeader className="p-6 border-b shrink-0 bg-slate-50">
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
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  
  const [addressSuggestions, setAddressSuggestions] = React.useState<any[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);
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

  const objectsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'objects') : null, [firestore]);
  const { data: allObjects } = useCollection<MapObject>(objectsCollection);
  
  const meldingenCollection = useMemoFirebase(() => firestore ? collection(firestore, 'meldingen') : null, [firestore]);
  const { data: allMeldingen } = useCollection<Melding>(meldingenCollection);

  const projectsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: allProjects } = useCollection<any>(projectsCollection);
  
  const now = new Date();

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      intakenummer: '',
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
      ext_referentie: '',
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
  const watchedMeldingsdatum = form.watch('meldingsdatum');
  const watchedIntakenummer = form.watch('intakenummer');

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

  React.useEffect(() => {
    if (watchedSubcategorie && !watchedHoofdcategorie) {
      for (const [hoofd, subs] of Object.entries(subcategorieMapping)) {
        if (subs.includes(watchedSubcategorie)) {
          form.setValue('hoofdcategorie', hoofd, { shouldValidate: true });
          break;
        }
      }
    }
  }, [watchedSubcategorie, watchedHoofdcategorie, subcategorieMapping, form]);

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
        extra_informatie: viewedMeldingFromDb.extra_informatie,
        afgehandeld_door: viewedMeldingFromDb.afgehandeld_door || '',
        afhandeling_datum: viewedMeldingFromDb.afhandeling_datum ? new Date(viewedMeldingFromDb.afhandeling_datum) : null,
        afhandeling_tijdstip: viewedMeldingFromDb.afhandeling_tijdstip || '',
        afhandeling_bijzonderheden: viewedMeldingFromDb.afhandeling_bijzonderheden || '',
      });
      setLocation({ latitude: viewedMeldingFromDb.latitude, longitude: viewedMeldingFromDb.longitude });
      setUploadedFiles(viewedMeldingFromDb.files || []);
      setUploadedPhotos(viewedMeldingFromDb.fotos || []);
      
      justSelectedSuggestion.current = true;
      setAddressSuggestions([]);
      setSearchQuery(`${viewedMeldingFromDb.straatnaam || ''}${viewedMeldingFromDb.huisnummer ? ' ' + viewedMeldingFromDb.huisnummer : ''}, ${viewedMeldingFromDb.plaats || ''}`);
    }
  }, [viewedMeldingFromDb?.id, meldingIdFromUrl, form]);

  React.useEffect(() => {
    const pendingData = localStorage.getItem('pending_forwarded_melding');
    if (pendingData && categoriesData) {
      try {
        const { parsed, file } = JSON.parse(pendingData);
        
        const resetData: Partial<NewMeldingFormValues> = {
            intakenummer: parsed.intakenummer || '',
            containernummer: parsed.containernummer || '',
            melder: parsed.melder || '',
            ext_referentie: parsed.extern_meldingsnummer || '',
            hoofdcategorie: parsed.label_1 || '',
            subcategorie: parsed.label_2 || '',
            behandelaar: parsed.behandelaar || '',
            extra_informatie: parsed.extra_informatie || '',
            straatnaam: parsed.straatnaam || '',
            nummer: parsed.huisnummer || '',
            postcode: parsed.postcode || '',
            plaats: parsed.plaats || '',
            status: 'Nieuw',
        };

        if (parsed.datum) {
            resetData.meldingsdatum = new Date(parsed.datum);
            resetData.voorvaldatum = new Date(parsed.datum);
        }
        if (parsed.tijdstip) {
            resetData.meldingsuur = parsed.tijdstip;
            resetData.voorvaltijd = parsed.tijdstip;
        }

        form.reset({ ...form.getValues(), ...resetData });

        if (file) {
            setUploadedFiles([file]);
        }

        const fullAddress = `${parsed.straatnaam || ''} ${parsed.huisnummer || ''}, ${parsed.plaats || ''}`.trim();
        if (fullAddress.length > 5) {
            justSelectedSuggestion.current = true;
            setAddressSuggestions([]);
            setSearchQuery(fullAddress);
            fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`)
                .then(res => res.json())
                .then(geo => {
                    if (geo.features?.length > 0) {
                        const [lng, lat] = geo.features[0].center;
                        setLocation({ latitude: lat, longitude: lng });
                    }
                });
        }
        
        localStorage.removeItem('pending_forwarded_melding');
        toast({ title: "Gegevens ingeladen", description: "De melding vanuit de e-mail is voorbereid." });
      } catch (e) {
        console.error("Error loading pending forwarded melding:", e);
      }
    }
  }, [form, toast, categoriesData]);
  
  React.useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (justSelectedSuggestion.current) { justSelectedSuggestion.current = false; return; }
    if (!searchQuery.trim()) { setAddressSuggestions([]); return; }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
        try {
            const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=5`);
            const data = await response.json();
            setAddressSuggestions(data.features || []);
        } catch (error) { setAddressSuggestions([]); } finally { setIsSearching(false); }
    }, 500);
  }, [searchQuery]);

  React.useEffect(() => {
    if (watchedMeldingsdatum && !isReadOnly) {
        let count = 0; let currentDate = new Date(watchedMeldingsdatum);
        while (count < 5) {
            currentDate = addDays(currentDate, 1);
            if (!isWeekend(currentDate)) count++;
        }
        form.setValue('actiedatum', currentDate);
    }
  }, [watchedMeldingsdatum, form, isReadOnly]);
  
  const nearbyObjects = React.useMemo(() => {
    if (!location || !allObjects) return [];
    
    const lat = typeof location.latitude === 'number' ? location.latitude : parseFloat(String(location.latitude));
    const lng = typeof location.longitude === 'number' ? location.longitude : parseFloat(String(location.longitude));
    
    if (isNaN(lat) || isNaN(lng)) return [];

    try {
        const locationPoint = turf.point([lng, lat]);
        return allObjects.filter(obj => {
            if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
            const objLat = typeof obj.latitude === 'number' ? obj.latitude : parseFloat(String(obj.latitude));
            const objLng = typeof obj.longitude === 'number' ? obj.longitude : parseFloat(String(obj.longitude));
            if (isNaN(objLat) || isNaN(objLng)) return false;
            return turf.distance(locationPoint, turf.point([objLng, objLat]), { units: 'meters' }) <= 100;
        }).sort((a, b) => {
            const dA = turf.distance(locationPoint, turf.point([a.longitude, a.latitude]));
            const dB = turf.distance(locationPoint, turf.point([b.longitude, b.latitude]));
            return dA - dB;
        });
    } catch (e) {
        return [];
    }
  }, [location, allObjects]);

  React.useEffect(() => {
    if (!location || !allProjects) { form.setValue('werkgebied', ''); return; }
    
    const lat = typeof location.latitude === 'number' ? location.latitude : parseFloat(String(location.latitude));
    const lng = typeof location.longitude === 'number' ? location.longitude : parseFloat(String(location.longitude));
    if (isNaN(lat) || isNaN(lng)) return;

    const point = turf.point([lng, lat]);
    let foundWijk: string | null = null;
    for (const project of allProjects) {
        if (project.wijken) {
            for (const wijk of project.wijken) {
                try {
                    const features = JSON.parse(wijk.subGebieden);
                    if (Array.isArray(features)) {
                        for (const feature of features) {
                            if (feature && turf.booleanPointInPolygon(point, feature)) { foundWijk = wijk.naam; break; }
                        }
                    }
                } catch (e) {}
                if (foundWijk) break;
            }
        }
        if (foundWijk) break;
    }
    form.setValue('werkgebied', foundWijk || 'Geen werkgebied gevonden');
  }, [location, allProjects, form]);

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

  /**
   * Extraheert tekst uit een PDF om kosten te besparen bij AI-verwerking.
   */
  const extractTextFromPdf = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += `--- PAGINA ${i} ---\n${pageText}\n\n`;
      }
      
      return fullText.trim();
    } catch (error) {
      console.error('Text extraction failed:', error);
      return '';
    }
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !firestore || !app) return;

    setIsParsingPdf(true);
    setAddressSuggestions([]);
    const fileArray = Array.from(files);
    
    toast({ description: `BeheerHub AI analyseert ${fileArray.length} document(en) via de meest voordelige methode...` });

    try {
        for (const file of fileArray) {
            // Stap 1: Probeer tekst te extraheren (90% goedkoper dan visuele scan)
            const extractedText = await extractTextFromPdf(file);
            const isTextAvailable = extractedText.length > 50;

            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsDataURL(file);
            });

            // Stap 2: Roep de AI flow aan met tekst indien beschikbaar, anders afbeelding
            const result = await parseIssuePdf({ 
                pdfDataUri: isTextAvailable ? undefined : base64,
                textContent: isTextAvailable ? extractedText : undefined,
                instructions: pdfInstructions
            });

            const pdfArrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(pdfArrayBuffer);

            for (const parsed of result.meldingen) {
                let lat = 0;
                let lng = 0;
                const fullAddress = `${parsed.straatnaam || ''} ${parsed.huisnummer || ''}, ${parsed.plaats || ''}`.trim();
                if (fullAddress.length > 5) {
                    try {
                        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`);
                        const geo = await res.json();
                        if (geo.features?.length > 0) {
                            [lng, lat] = geo.features[0].center;
                        }
                    } catch (e) {}
                }

                const mData: any = {
                    intakenummer: parsed.intakenummer || `M-${Date.now()}`,
                    containernummer: parsed.containernummer || '',
                    soort_melder: 'Medewerker',
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
                const meldingId = docRef.id;

                let fileToUpload: Blob = file;
                let fileNameToUpload = file.name;

                if (parsed.paginanummer && parsed.paginanummer > 0 && parsed.paginanummer <= pdfDoc.getPageCount()) {
                    const newDoc = await PDFDocument.create();
                    const [copiedPage] = await newDoc.copyPages(pdfDoc, [parsed.paginanummer - 1]);
                    newDoc.addPage(copiedPage);
                    const pdfBytes = await newDoc.save();
                    fileToUpload = new Blob([pdfBytes], { type: 'application/pdf' });
                    fileNameToUpload = `bon_${parsed.intakenummer || Date.now()}.pdf`;
                }

                const storage = getStorage(app);
                const storagePath = `meldingen/${meldingId}/documents/${Date.now()}-${fileNameToUpload}`;
                const uploadTask = uploadBytesResumable(ref(storage, storagePath), fileToUpload);
                await uploadTask;
                const url = await getDownloadURL(uploadTask.snapshot.ref);

                const fileObj: UploadedFile = {
                    name: fileNameToUpload,
                    url,
                    size: fileToUpload.size,
                    type: 'application/pdf',
                    uploadedAt: new Date().toISOString(),
                    storagePath
                };

                await updateDoc(doc(firestore, 'meldingen', meldingId), {
                    files: [fileObj]
                });

                if (parsed.label_1 && !hoofdcategorieOptions.includes(parsed.label_1)) {
                    updateDocumentNonBlocking(categoriesRef!, { hoofdcategorieen: arrayUnion(parsed.label_1) });
                }
                if (parsed.label_2 && parsed.label_1) {
                    const currentSubs = subcategorieMapping[parsed.label_1] || [];
                    if (!currentSubs.includes(parsed.label_2)) {
                        updateDocumentNonBlocking(categoriesRef!, { [`subcategorieMapping.${parsed.label_1}`]: arrayUnion(parsed.label_2) });
                    }
                }
                if (parsed.behandelaar && !handlerOptions.includes(parsed.behandelaar)) {
                    updateDocumentNonBlocking(handlersRef!, { names: arrayUnion(parsed.behandelaar) });
                }
            }
        }

        toast({ title: "Scans voltooid", description: `${fileArray.length} document(en) verwerkt via de voordelige tekst-methode.` });
        router.push('/issues/portal');
    } catch (err) {
        console.error("Batch PDF error:", err);
        toast({ variant: 'destructive', title: "Fout bij inlezen", description: "De PDF kon niet volledig worden verwerkt." });
    } finally {
        setIsParsingPdf(false);
        if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const uploadFileLocal = React.useCallback((file: File | Blob, fileName: string, mNum: string, type: 'documents' | 'photos'): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) return reject(new Error("Firebase app niet beschikbaar"));
        const storage = getStorage(app);
        const folder = mNum || 'temp';
        const storagePath = `meldingen/${folder}/${type}/${Date.now()}-${fileName}`;
        const uploadTask = uploadBytesResumable(ref(storage, storagePath), file);
        uploadTask.on('state_changed',
            (snap) => setUploadProgress(prev => ({ ...prev, [fileName]: (snap.bytesTransferred / snap.totalBytes) * 100 })),
            (err) => { setUploadProgress(prev => { const n = { ...prev }; delete n[fileName]; return n; }); reject(err); },
            () => getDownloadURL(uploadTask.snapshot.ref).then(url => {
                const nFile = { name: fileName, url, size: file.size, type: (file as any).type || 'application/octet-stream', uploadedAt: new Date().toISOString(), storagePath };
                resolve(nFile);
                setUploadProgress(prev => { const n = { ...prev }; delete n[fileName]; return prev; });
            })
        );
    });
  }, [app]);
  
  const handleDocumentUploads = React.useCallback(async (files: FileList | File[]) => {
    const mNum = form.getValues('intakenummer');
    for (const file of Array.from(files)) {
      try {
        const res = await uploadFileLocal(file, file.name, mNum, 'documents');
        setUploadedFiles(prev => [...prev, res]);
      } catch (error) { toast({ variant: "destructive", title: "Upload mislukt" }); }
    }
  }, [uploadFileLocal, form, toast]);
  
  const handlePhotoUploads = React.useCallback(async (files: FileList | File[]) => {
    const mNum = form.getValues('intakenummer');
    for (const file of Array.from(files)) {
      try {
        const res = await uploadFileLocal(file, file.name, mNum, 'photos');
        setUploadedPhotos(prev => [...prev, res]);
      } catch (error) { toast({ variant: "destructive", title: "Upload mislukt" }); }
    }
  }, [uploadFileLocal, form, toast]);

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore || isSubmitting) return;
    setIsSubmitting(true);
    try {
       const mData: any = {
        intakenummer: data.intakenummer,
        containernummer: data.containernummer,
        soort_melder: data.soort_melder, hoofdcategorie: data.hoofdcategorie, subcategorie: data.subcategorie,
        behandelende_afdeling: data.behandelaar, behandelaar: data.behandelaar, status: data.status,
        extern_meldingsnummer: data.ext_referentie, straatnaam: data.straatnaam, huisnummer: data.nummer,
        postcode: data.postcode, plaats: data.plaats, wijk: data.wijk, werkgebied: data.werkgebied,
        melder: data.melder, extra_informatie: data.extra_informatie,
        latitude: location?.latitude || 0, longitude: location?.longitude || 0,
        files: uploadedFiles, fotos: uploadedPhotos,
      };

      const finisherName = profile?.displayName || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || profile?.email || 'Onbekend';

      if (viewedMelding) {
          if (data.status === 'Afgerond' && viewedMelding.status !== 'Afgerond') {
              mData.afhandeling_datum = format(new Date(), 'yyyy-MM-dd');
              mData.afhandeling_tijdstip = format(new Date(), 'HH:mm');
              mData.afgehandeld_door = finisherName;
          }
          await updateDocumentNonBlocking(doc(firestore, 'meldingen', viewedMelding.id), mData);
          router.push('/issues/open');
      } else {
          mData.datum = format(data.meldingsdatum || now, 'yyyy-MM-dd');
          mData.tijdstip = data.meldingsuur || format(now, 'HH:mm');
          mData.aangenomen_door = finisherName;
          if (data.voorvaldatum) {
            mData.voorvaldatum = format(new Date(data.voorvaldatum), 'yyyy-MM-dd');
            mData.voorvaltijd = data.voorvaltijd;
          }
          await addDocumentNonBlocking(collection(firestore, 'meldingen'), mData);
          router.push('/issues/open');
      }
    } catch (error) { toast({ variant: 'destructive', title: 'Fout opgetreden' }); } finally { setIsSubmitting(false); }
  };

  const formatDuration = (minutes?: number) => {
    if (minutes === undefined || minutes === null) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}u ${mins}m`;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-sm bg-gray-100 dark:bg-gray-900">
        {isParsingPdf && (
            <div className="fixed inset-0 z-[200] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <LoadingScreen message="BeheerHub AI analyseert alle bonnen in het document..." />
            </div>
        )}
        <div className="flex-shrink-0 px-4 py-1.5 border-b flex justify-between items-center bg-gray-200/60 dark:bg-gray-800/60">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                <h1 className="font-semibold text-xs">{viewedMelding ? `Melding: ${viewedMelding.intakenummer}` : (watchedIntakenummer ? `Melding: ${watchedIntakenummer}` : 'Nieuwe Melding')}</h1>
            </div>
            {viewedMelding?.status !== 'Afgerond' && (
                <div className="flex justify-end gap-2">
                    {profile?.role === 'Super admin' && (
                        <AIConfigDialog instructions={pdfInstructions} onSave={handleSaveAIInstructions} isSaving={isSavingConfig} samplePdfUrl={samplePdfUrl} />
                    )}
                    <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} className="hidden" accept="application/pdf" multiple />
                    <Button type="button" variant="outline" onClick={() => pdfInputRef.current?.click()} className="h-8 bg-white border-blue-600 text-blue-600 hover:bg-blue-50" disabled={isParsingPdf}>
                        {isParsingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} PDF-scan (Slim)
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => router.back()} className="h-8">Annuleren</Button>
                    <Button type="submit" form="new-melding-form" disabled={isSubmitting} className="h-8">
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Melding Opslaan
                    </Button>
                </div>
            )}
        </div>
        <Form {...form}>
          <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0 overflow-hidden">
             <div className="p-3 grid grid-cols-12 gap-4 shrink-0 bg-white/40 border-b">
               <div className="col-span-7 space-y-2">
                    <Card className="bg-gray-50 dark:bg-gray-800/30 p-2 border-none shadow-sm">
                        <CardHeader className="p-1 pb-1 flex-row justify-between items-start">
                           <CardTitle className="font-black text-[9px] uppercase tracking-widest text-slate-400">Algemene Informatie</CardTitle>
                           <div className="text-right text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                                Laatst gewijzigd door {viewedMelding ? viewedMelding.aangenomen_door : profile?.displayName || '...'} op {format(new Date(viewedMelding?.datum || now), 'dd-MM-yyyy')}
                            </div>
                        </CardHeader>
                        <div className="space-y-0.5 p-1">
                            <FormRow label="Meldingsnummer">
                                <FormField control={form.control} name="intakenummer" render={({ field }) => (
                                    <FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly}/></FormControl>
                                )} />
                            </FormRow>
                            <FormRow label="Containernummer">
                                <FormField control={form.control} name="containernummer" render={({ field }) => (
                                    <FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly}/></FormControl>
                                )} />
                            </FormRow>
                            <FormRow label="Soort melder">
                                <FormField control={form.control} name="soort_melder" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs font-bold"><SelectValue placeholder="Selecteer melder" /></SelectTrigger></FormControl>
                                        <SelectContent>{reporterTypeOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Hoofdindeling">
                                <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs font-bold"><SelectValue placeholder="Selecteer categorie" /></SelectTrigger></FormControl>
                                        <SelectContent>{displayHoofdOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Indeling">
                                <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs font-bold"><SelectValue placeholder="Selecteer indeling" /></SelectTrigger></FormControl>
                                        <SelectContent>{displaySubOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Behandelaar">
                                <FormField control={form.control} name="behandelaar" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs font-bold"><SelectValue placeholder="Selecteer behandelaar" /></SelectTrigger></FormControl>
                                        <SelectContent>{displayHandlerOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Status">
                                <FormField control={form.control} name="status" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs font-bold"><SelectValue placeholder="Selecteer status" /></SelectTrigger></FormControl>
                                        <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Meldingsdatum">
                                <div className="flex gap-2 items-center">
                                    <FormField control={form.control} name="meldingsdatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs font-bold" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} /></FormControl>)} />
                                    <FormField control={form.control} name="meldingsuur" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24 font-bold" {...field} disabled={isReadOnly} /></FormControl>)} />
                                </div>
                            </FormRow>
                        </div>
                        <div className="p-1 pt-2 border-t mt-2">
                            <FormRow label="Memo">
                                <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Textarea {...field} className="resize-none h-20 text-xs font-medium leading-relaxed" placeholder="Extra informatie over de melding..." disabled={isReadOnly}/>
                                        </FormControl>
                                    </FormItem>
                                )} />
                            </FormRow>
                        </div>
                   </Card>
               </div>

                <div className="col-span-5 space-y-2">
                    <Card className='p-2 bg-gray-50 dark:bg-gray-800/30 border-none shadow-sm'>
                        <CardHeader className="p-1 pb-1"><CardTitle className="font-black text-[9px] uppercase tracking-widest text-slate-400">Soort Melding</CardTitle></CardHeader>
                        <div className="space-y-0.5 p-1">
                            <FormRow label="Soort melding">
                                <FormField control={form.control} name="soort_melding" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs font-bold"><SelectValue placeholder="Selecteer soort"/></SelectTrigger></FormControl>
                                        <SelectContent><SelectItem value="Klacht">Klacht</SelectItem><SelectItem value="Verbetering">Verbetering</SelectItem><SelectItem value="Schade">Schade</SelectItem></SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Ext. referentie"><FormField control={form.control} name="ext_referentie" render={({ field }) => (<FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly} /></FormControl>)} /></FormRow>
                        </div>
                    </Card>
                    <div className='p-3 border rounded-xl bg-gray-50 dark:bg-gray-800/30 space-y-1 shadow-sm'>
                        <h3 className="font-black text-[9px] mb-2 uppercase tracking-widest text-slate-400">Adresgegevens</h3>
                        <div className="relative">
                            <FormItem><div className="relative flex items-center">
                                <Input placeholder="Zoek op adres..." className="h-8 text-xs font-bold pl-8 rounded-lg" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={isReadOnly}/>
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                {isSearching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-primary" />}
                            </div></FormItem>
                            {addressSuggestions.length > 0 && (
                                <div className="absolute z-100 w-full mt-1 bg-white border rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                    {addressSuggestions.map((s) => (
                                        <div 
                                            key={s.id} 
                                            className="px-4 py-2 text-xs font-bold cursor-pointer hover:bg-slate-50 border-b last:border-0" 
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                const [lng, lat] = s.center;
                                                setLocation({ latitude: lat, longitude: lng });
                                                setSearchQuery(s.place_name);
                                                setAddressSuggestions([]);
                                                justSelectedSuggestion.current = true;
                                                
                                                // Extract individual fields if possible
                                                const street = s.text || '';
                                                const houseNum = s.address || '';
                                                const postcode = s.context?.find((c: any) => c.id.includes('postcode'))?.text || '';
                                                const place = s.context?.find((c: any) => c.id.includes('place'))?.text || '';
                                                
                                                if (street) form.setValue('straatnaam', street);
                                                if (houseNum) form.setValue('nummer', houseNum);
                                                if (postcode) form.setValue('postcode', postcode);
                                                if (place) form.setValue('plaats', place);
                                            }}
                                        >
                                            {s.place_name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2">
                             <FormField control={form.control} name="straatnaam" render={({ field }) => (<FormItem><FormLabel className='text-[8px] font-black uppercase text-slate-400 ml-1'>Straatnaam</FormLabel><FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly} /></FormControl></FormItem>)} />
                             <FormField control={form.control} name="nummer" render={({ field }) => (<FormItem><FormLabel className='text-[8px] font-black uppercase text-slate-400 ml-1'>Nummer</FormLabel><FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly} /></FormControl></FormItem>)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField control={form.control} name="postcode" render={({ field }) => (<FormItem><FormLabel className='text-[8px] font-black uppercase text-slate-400 ml-1'>Postcode</FormLabel><FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly} /></FormControl></FormItem>)} />
                             <FormField control={form.control} name="plaats" render={({ field }) => (<FormItem><FormLabel className='text-[8px] font-black uppercase text-slate-400 ml-1'>Plaats</FormLabel><FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly} /></FormControl></FormItem>)} />
                        </div>
                    </div>
                    <div className='p-3 border rounded-xl bg-gray-50 dark:bg-gray-800/30 space-y-1 shadow-sm'>
                        <h3 className="font-black text-[9px] mb-2 uppercase tracking-widest text-slate-400">Medewerker / Melder</h3>
                        <FormRow label="Naam melder"><FormField control={form.control} name="melder" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly} /></FormControl> )} /></FormRow>
                        <FormRow label="Telefoon melder"><FormField control={form.control} name="telefoon_melder" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs font-bold" disabled={isReadOnly} /></FormControl> )} /></FormRow>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 bg-white">
                 <Tabs defaultValue="locatie" className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 border-b shrink-0">
                        <TabsList className="h-10 border-none bg-transparent">
                            <TabsTrigger value="documenten" className="text-[10px] font-black uppercase">Documenten</TabsTrigger>
                            <TabsTrigger value="fotos" className="text-[10px] font-black uppercase">Foto's</TabsTrigger>
                            <TabsTrigger value="locatie" className="text-[10px] font-black uppercase">Locatie</TabsTrigger>
                            {viewedMelding?.status === 'Afgerond' && (
                                <TabsTrigger value="info" className="text-[10px] font-black uppercase">Info</TabsTrigger>
                            )}
                        </TabsList>
                    </div>
                    <TabsContent value="documenten" className="m-0 p-4 bg-slate-50/30 overflow-visible">
                        <div className="flex flex-col gap-4">
                            {!isReadOnly && <Button type="button" variant="outline" className="w-full h-12 border-dashed border-2 font-bold uppercase text-[10px] tracking-widest" onClick={() => document.getElementById('doc-input')?.click()}>
                                <UploadCloud className="mr-2 h-4 w-4" /> Bestand uploaden
                            </Button>}
                            <input type="file" id="doc-input" onChange={(e) => e.target.files && handleDocumentUploads(e.target.files)} className="hidden" multiple />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {uploadedFiles.map((f) => (
                                    <div key={f.storagePath} className="flex items-center justify-between p-3 border rounded-xl bg-white shadow-sm group">
                                        <div className="flex items-center gap-3 truncate">
                                            <FileIcon className="h-4 w-4 text-primary shrink-0" />
                                            <span className="text-[11px] font-bold truncate">{f.name}</span>
                                        </div>
                                        {!isReadOnly && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="fotos" className="m-0 p-4 bg-slate-50/30 overflow-visible">
                        <div className="flex flex-col gap-4">
                            {!isReadOnly && <Button type="button" variant="outline" className="w-full h-12 border-dashed border-2 font-bold uppercase text-[10px] tracking-widest" onClick={() => document.getElementById('photo-input')?.click()}>
                                <Upload className="mr-2 h-4 w-4" /> Foto uploaden
                            </Button>}
                            <input type="file" id="photo-input" onChange={(e) => e.target.files && handlePhotoUploads(e.target.files)} className="hidden" multiple accept="image/*" />
                            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-3">
                                {uploadedPhotos.map(p => (
                                    <div key={p.storagePath} className="relative aspect-square rounded-xl overflow-hidden border shadow-sm group">
                                        <Image src={p.url} alt={p.name} fill className="object-cover" />
                                        {!isReadOnly && <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setUploadedPhotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="locatie" className="flex-1 m-0 flex flex-col min-h-0">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-0 h-full">
                        <div className="md:col-span-8 border-r overflow-hidden relative shadow-inner">
                            <MapboxView latitude={location?.latitude} longitude={location?.longitude} objects={nearbyObjects} />
                        </div>
                        <div className="md:col-span-4 flex flex-col min-h-0 bg-slate-50/50">
                            <div className="p-3 border-b shrink-0 font-black text-[10px] uppercase tracking-widest text-slate-400 bg-white">Objecten in de buurt (100m)</div>
                            <ScrollArea className="flex-1 p-3">
                                <div className="space-y-2">
                                    {nearbyObjects.map(obj => (
                                        <div key={obj.id} className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm transition-all hover:border-primary/30">
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="font-black text-[11px] uppercase tracking-tight text-slate-900">{obj.id}</p>
                                                {obj.vulgraad !== undefined && <Badge variant="outline" className="text-[8px] h-4 font-black border-slate-200">{obj.vulgraad}%</Badge>}
                                            </div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter truncate">{obj.locatieType} | {obj.straatnaam}</p>
                                        </div>
                                    ))}
                                    {nearbyObjects.length === 0 && <div className="p-8 text-center"><div className="bg-white p-4 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100"><MapPin className="h-5 w-5 text-slate-200" /></div><p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Geen objecten gevonden</p></div>}
                                </div>
                            </ScrollArea>
                        </div>
                      </div>
                    </TabsContent>
                    {viewedMelding?.status === 'Afgerond' && (
                        <TabsContent value="info" className="m-0 p-4 bg-slate-50/30 overflow-visible">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-white">
                                    <CardHeader className="bg-slate-50/50 border-b p-4">
                                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Afhandelingsdetails</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 space-y-4">
                                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Totale Werktijd</span>
                                            <Badge variant="secondary" className="font-black text-xs bg-blue-50 text-blue-600 border-none">{formatDuration(viewedMelding?.gewerkteMinuten)}</Badge>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Meldtijd</span>
                                            <span className="text-xs font-bold text-slate-700">{viewedMelding?.datum} om {viewedMelding?.tijdstip}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Afmeldtijd</span>
                                            <span className="text-xs font-bold text-slate-700">{viewedMelding?.afhandeling_datum} om {viewedMelding?.afhandeling_tijdstip}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Uitgevoerd door</span>
                                            <span className="text-xs font-black text-slate-900">{viewedMelding?.afgehandeld_door || '-'}</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-white">
                                    <CardHeader className="bg-slate-50/50 border-b p-4">
                                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gebruikte Materialen</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        {viewedMelding?.hoeveelheden && viewedMelding.hoeveelheden.length > 0 ? (
                                            <div className="space-y-2">
                                                {viewedMelding.hoeveelheden.map((h, i) => (
                                                    <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-sm">
                                                        <span className="text-xs font-black uppercase tracking-tight text-slate-900">{h.type}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-black text-primary">{h.aantal}</span>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{h.eenheid}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                                                <Package className="h-10 w-10 mb-2 opacity-10" />
                                                <p className="text-[10px] font-black uppercase tracking-widest">Geen materiaalverbruik geregistreerd</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    )}
                </Tabs>
            </div>
          </form>
        </Form>
    </div>
  );
}
