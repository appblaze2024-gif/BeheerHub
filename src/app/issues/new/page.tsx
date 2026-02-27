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

// UI Components
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
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

// Custom components
import { IssueImportDialog } from '@/components/issue-import-dialog';
import { MapboxView } from '@/components/mapbox-view';

// AI Flows
import { parseIssuePdf } from '@/ai/flows/parse-issue-pdf-flow';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

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

const statusOptions = [
    "Nieuw", "Intern doorgezet", "In behandeling", "Gepland op korte termijn",
    "Gepland op langere termijn", "Dubbel gemeld", "Afgerond", "Niet in beheer", "Extern doorgezet"
];

const hoofdcategorieOptions = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig", "Zoutkisten"];

const subcategorieMapping: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Wateroverlast", "Verstopte put"],
    "Zoutkisten": ["Zoutkist leeg"],
    "Overig": ["Overige meldingen"]
};

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
    <div className="flex flex-col gap-0.5 py-0.5 border-b border-slate-100 last:border-0 min-h-[32px]">
        <FormLabel htmlFor={labelFor} className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{label}</FormLabel>
        <div className="flex-1 min-w-0">
            {children}
        </div>
    </div>
);

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
                        Kopieer tekst uit een ander systeem en plak het hieronder. Onze AI haalt de gegevens eruit.
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

  const aiConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'pdf_config') : null, [firestore]);
  const { data: aiConfig } = useDoc<{ instructions: string, samplePdfUrl?: string }>(aiConfigRef);
  const pdfInstructions = aiConfig?.instructions || '';
  const samplePdfUrl = aiConfig?.samplePdfUrl;

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      intakenummer: '',
      ext_referentie: '',
      containernummer: '',
      status: 'Nieuw',
      meldingsdatum: new Date(),
      meldingsuur: format(new Date(), 'HH:mm'),
      voorvaldatum: new Date(),
      voorvaltijd: format(new Date(), 'HH:mm'),
      hoofdcategorie: '',
      subcategorie: '',
      behandelaar: '',
      extra_informatie: '',
    },
  });

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

  const handleSaveAIInstructions = async (val: string, pdfUrl: string | undefined) => {
    if (!firestore || !aiConfigRef) return;
    setIsSavingConfig(true);
    try {
        await updateDocumentNonBlocking(aiConfigRef, { instructions: val, samplePdfUrl: pdfUrl });
        toast({ title: 'Configuratie opgeslagen' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Fout bij opslaan' });
    } finally {
        setIsSavingConfig(false);
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
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        files: uploadedFiles,
        fotos: uploadedPhotos,
        updatedAt: serverTimestamp(),
      };

      const userDisplayName = profile?.displayName || profile?.email || 'Onbekend';
      mData.aangenomen_door = userDisplayName;
      mData.createdAt = serverTimestamp();
      
      const meldingenCol = collection(firestore, 'meldingen');
      await addDocumentNonBlocking(meldingenCol, mData);
      
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
                                                    <FormItem><FormControl><Input {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly}/></FormControl></FormItem>
                                                )} />
                                            </FormRow>
                                            <FormRow label="Extern Ref.">
                                                <FormField control={form.control} name="ext_referentie" render={({ field }) => (
                                                    <FormItem><FormControl><Input {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly}/></FormControl></FormItem>
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
                                                            <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )} />
                                            </FormRow>
                                            <FormRow label="Subtype">
                                                <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                                    <FormItem>
                                                        <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                                            <FormControl><SelectTrigger className="h-8 text-xs font-bold border-slate-200"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                            <SelectContent>{subcategorieMapping[form.watch('hoofdcategorie')]?.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>)) || <SelectItem value="overig">Overig</SelectItem>}</SelectContent>
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
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                                        <CardHeader className="bg-slate-50 border-b py-1.5 px-4">
                                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                <Calendar className="h-3 w-3" /> Tijden & Memo
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-3 pt-0">
                                            <div className="grid grid-cols-2 gap-2">
                                                <FormRow label="Melddatum">
                                                    <FormField control={form.control} name="meldingsdatum" render={({ field }) => (
                                                        <FormItem><FormControl><Input type="date" {...field} value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                    )} />
                                                </FormRow>
                                                <FormRow label="Uur">
                                                    <FormField control={form.control} name="meldingsuur" render={({ field }) => (
                                                        <FormItem><FormControl><Input type="time" {...field} className="h-8 text-xs font-bold border-slate-200" disabled={isReadOnly} /></FormControl></FormItem>
                                                    )} />
                                                </FormRow>
                                            </div>
                                            <FormRow label="Memo">
                                                <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                                                    <FormItem><FormControl><Textarea {...field} className="resize-none min-h-[40px] text-xs font-medium border-slate-200 bg-slate-50/30" placeholder="Memo..." disabled={isReadOnly}/></FormControl></FormItem>
                                                )} />
                                            </FormRow>
                                        </CardContent>
                                    </Card>

                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            className="h-16 border-2 border-dashed border-slate-200 bg-white hover:border-primary/30 hover:bg-slate-50 transition-all flex flex-col gap-1.5 rounded-2xl"
                                            onClick={() => document.getElementById('media-doc-input')?.click()}
                                        >
                                            <UploadCloud className="h-5 w-5 text-slate-400" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 leading-none">Document</span>
                                            <input type="file" id="media-doc-input" className="hidden" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'files')} />
                                        </Button>
                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            className="h-16 border-2 border-dashed border-slate-200 bg-white hover:border-primary/30 hover:bg-slate-50 transition-all flex flex-col gap-1.5 rounded-2xl"
                                            onClick={() => document.getElementById('media-photo-input')?.click()}
                                        >
                                            <Camera className="h-5 w-5 text-slate-400" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 leading-none">Foto</span>
                                            <input type="file" id="media-photo-input" className="hidden" accept="image/*" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'fotos')} />
                                        </Button>
                                    </div>

                                    {(uploadedFiles.length > 0 || uploadedPhotos.length > 0) && (
                                        <div className="grid grid-cols-1 gap-2 pt-1 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                            {uploadedFiles.map(file => (
                                                <div key={file.storagePath} className="flex items-center justify-between p-1.5 rounded-xl bg-blue-50 border border-blue-100 group">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Paperclip className="h-3 w-3 text-blue-500 shrink-0" />
                                                        <span className="text-[10px] font-bold truncate text-blue-700">{file.name}</span>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-lg text-blue-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setUploadedFiles(prev => prev.filter(f => f.storagePath !== file.storagePath))}>
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                            {uploadedPhotos.map(photo => (
                                                <div key={photo.storagePath} className="flex items-center justify-between p-1.5 rounded-xl bg-green-50 border border-green-100 group">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Camera className="h-3 w-3 text-green-500 shrink-0" />
                                                        <span className="text-[10px] font-bold truncate text-green-700">{photo.name}</span>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-lg text-blue-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setUploadedPhotos(prev => prev.filter(f => f.storagePath !== photo.storagePath))}>
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </form>
                    </Form>
                </div>
            </div>
            
            <div className="w-full lg:w-[450px] p-4 bg-slate-50 border-l shrink-0 h-full overflow-hidden flex flex-col gap-4">
                <Card className="flex-1 relative overflow-hidden border-none shadow-2xl rounded-2xl bg-slate-100">
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
