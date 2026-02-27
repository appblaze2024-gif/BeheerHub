'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import * as turf from '@turf/turf';
import { 
  Loader2, 
  UploadCloud, 
  Trash2, 
  Camera, 
  MapPin, 
  Sparkles, 
  Settings2, 
  FileText, 
  X, 
  Check,
  Calendar,
  Paperclip,
  FileSpreadsheet,
  ClipboardPaste,
  ChevronRight,
  Info,
  User,
  ShieldCheck,
  Building2,
  Phone,
  Mail,
  Target,
  ArrowLeft,
  Plus
} from 'lucide-react';
import { 
  useFirestore, 
  addDocumentNonBlocking, 
  useFirebaseApp, 
  useDoc, 
  setDocumentNonBlocking, 
  useMemoFirebase,
  updateDocumentNonBlocking,
  useCollection
} from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { useGlobalLoading } from '@/context/global-loading-context';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
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
import type { Melding, Project, Object as MapObject } from '@/lib/types';

// AI Flows
import { parseIssuePdf } from '@/ai/flows/parse-issue-pdf-flow';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const newMeldingSchema = z.object({
  intakenummer: z.string().min(1, 'Meldingsnummer is verplicht'),
  extern_meldingsnummer: z.string().optional().nullable(),
  containernummer: z.string().optional().nullable(),
  soort_melder: z.string().min(1, 'Soort melder is verplicht'),
  hoofdcategorie: z.string().min(1, 'Hoofdtype is verplicht'),
  subcategorie: z.string().min(1, 'Subtype is verplicht'),
  behandelende_afdeling: z.string().optional().nullable(),
  behandelaar: z.string().optional().nullable(),
  status: z.string().min(1, 'Status is verplicht'),
  voorvaldatum: z.any().optional().nullable(),
  voorvaltijd: z.string().optional().nullable(),
  meldingsdatum: z.any().optional().nullable(),
  meldingsuur: z.string().optional().nullable(),
  straatnaam: z.string().min(1, 'Straatnaam is verplicht'),
  huisnummer: z.string().min(1, 'Huisnummer is verplicht'),
  postcode: z.string().optional().nullable(),
  plaats: z.string().optional().nullable(),
  wijk: z.string().optional().nullable(),
  werkgebied: z.string().optional().nullable(),
  melder: z.string().optional().nullable(),
  telefoon_melder: z.string().optional().nullable(),
  email_melder: z.string().optional().or(z.literal('')).nullable(),
  burgerservicenummer: z.string().optional().nullable(),
  extra_informatie: z.string().optional().nullable(),
});

type NewMeldingFormValues = z.infer<typeof newMeldingSchema>;

const DEFAULT_STATUS_OPTIONS = [
    "Nieuw", "Intern doorgezet", "In behandeling", "Gepland op korte termijn",
    "Gepland op langere termijn", "Dubbel gemeld", "Afgerond", "Niet in beheer", "Extern doorgezet", "Geweigerd"
];

const DEFAULT_HOOFDCATEGORIE_OPTIONS = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig", "Zoutkisten"];

const DEFAULT_SUBCATEGORIE_MAPPING: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Wateroverlast", "Verstopte put"],
    "Zoutkisten": ["Zoutkist leeg"],
    "Overig": ["Overige meldingen"]
};

const DEFAULT_MELDER_TYPES = ["Inwoner", "Bedrijf", "Gemeente", "Toezichthouder"];

const MAPPING_FIELDS = [
    { id: 'intakenummer', label: 'Intakenummer' },
    { id: 'extern_meldingsnummer', label: 'Extern Nummer' },
    { id: 'containernummer', label: 'Containernummer' },
    { id: 'datum', label: 'Datum (JJJJ-MM-DD)' },
    { id: 'tijdstip', label: 'Tijdstip (HH:mm)' },
    { id: 'melder', label: 'Naam melder' },
    { id: 'behandelaar', label: 'Behandelaar' },
    { id: 'label_1', label: 'Hoofdindeling' },
    { id: 'label_2', label: 'Indeling' },
    { id: 'straatnaam', label: 'Straatnaam' },
    { id: 'huisnummer', label: 'Huisnummer' },
    { id: 'postcode', label: 'Postcode' },
    { id: 'plaats', label: 'Plaats' },
    { id: 'extra_informatie', label: 'Memo / Extra informatie' },
];

const FormRow = ({ label, children, onAdd }: { label: React.ReactNode; children: React.ReactNode; onAdd?: () => void }) => (
    <div className="flex flex-col gap-0.5 py-1 border-b border-slate-100 last:border-0 min-h-[36px]">
        <div className="flex items-center justify-between">
            <FormLabel className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">{label}</FormLabel>
            {onAdd && (
                <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="h-4 w-4 text-slate-300 hover:text-primary transition-colors" 
                    onClick={onAdd}
                >
                    <Plus className="h-3 w-3" />
                </Button>
            )}
        </div>
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
            const result = await parseIssuePdf({ textContent: text, instructions });
            if (result.meldingen && result.meldingen.length > 0) {
                onParsed(result.meldingen[0]);
                toast({ title: "Tekst geanalyseerd", description: "Velden zijn automatisch ingevuld." });
            }
        } catch (err) {
            toast({ variant: 'destructive', title: "Fout bij inlezen", description: "AI kon de tekst niet verwerken." });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold">
                    <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
                    Smart Paste
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="font-black uppercase tracking-tight">AI Smart Paste</DialogTitle>
                    <DialogDescription className="font-bold text-slate-500">Plak tekst uit een ander systeem om velden automatisch in te vullen.</DialogDescription>
                </DialogHeader>
                <div className="py-4"><Textarea placeholder="Plak hier de tekst..." className="min-h-[200px] text-xs font-medium" value={text} onChange={(e) => setText(e.target.value)} /></div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Annuleren</Button></DialogClose>
                    <Button onClick={handlePaste} disabled={isProcessing || !text.trim()} className="font-black uppercase">
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Verwerken
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AIConfigDialog({ instructions, onSave, isSaving, samplePdfUrl }: { instructions: string, onSave: (val: string, pdfUrl?: string) => void, isSaving: boolean, samplePdfUrl?: string }) {
  const [fieldInstructions, setFieldInstructions] = React.useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(samplePdfUrl);
  const [isUploadingSample, setIsUploadingSample] = React.useState(false);
  const [activeFieldId, setactiveFieldId] = React.useState<string | null>(null);
  const [markers, setMarkers] = React.useState<Record<string, { x: number, y: number }>>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const app = useFirebaseApp();

  React.useEffect(() => {
      const parsed: Record<string, string> = {};
      instructions.split('\n').forEach(line => {
          const [key, ...valParts] = line.split(':');
          if (key && valParts.join(':').trim()) parsed[key.trim().toLowerCase()] = valParts.join(':').trim();
      });
      setFieldInstructions(parsed);
  }, [instructions]);

  const handleSave = () => {
      const serialized = Object.entries(fieldInstructions)
          .filter(([_, val]) => val.trim() !== '')
          .map(([key, val]) => `${key.toUpperCase()}: ${val}`)
          .join('\n');
      onSave(serialized, previewUrl);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!activeFieldId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setMarkers(prev => ({ ...prev, [activeFieldId.toLowerCase()]: { x, y } }));
      setFieldInstructions(prev => ({ ...prev, [activeFieldId.toLowerCase()]: `Gelegen op ca. ${x.toFixed(0)}% X en ${y.toFixed(0)}% Y.` }));
  };

  return (
      <Dialog>
          <DialogTrigger asChild>
              <Button variant="outline" className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"><Settings2 className="mr-2 h-4 w-4" /> AI Training</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[1100px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
              <DialogHeader className="p-6 border-b shrink-0 bg-white">
                  <div className="flex justify-between items-center">
                      <DialogTitle className="text-xl font-bold">AI Training &amp; Sjabloon</DialogTitle>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploadingSample}>Sjabloon Uploaden</Button>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file || !app) return;
                          setIsUploadingSample(true);
                          const storageRef = ref(getStorage(app), `settings/training_${Date.now()}`);
                          const task = uploadBytesResumable(storageRef, file);
                          await task;
                          const url = await getDownloadURL(task.snapshot.ref);
                          setPreviewUrl(url); setIsUploadingSample(false);
                      }} />
                  </div>
              </DialogHeader>
              <div className="flex-1 flex min-h-0">
                  <div className="w-2/3 border-r bg-slate-100 relative overflow-hidden" onClick={handleImageClick}>
                      <ScrollArea className="h-full">
                          <div className="relative w-full h-[1200px]">
                              {previewUrl && <Image src={previewUrl} alt="Sample" fill className="object-contain" />}
                              {Object.entries(markers).map(([id, pos]) => (
                                  <div key={id} className="absolute w-6 h-6 -ml-3 -mt-3 bg-primary rounded-full border-2 border-white flex items-center justify-center shadow-lg" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                                      <Target className="h-3 w-3 text-white" />
                                  </div>
                              ))}
                          </div>
                      </ScrollArea>
                  </div>
                  <div className="w-1/3 flex flex-col bg-white">
                      <div className="p-4 border-b bg-slate-50"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Veld Mapping Instructies</Label></div>
                      <ScrollArea className="flex-1">
                          <div className="p-4 space-y-4">
                              {MAPPING_FIELDS.map((f) => (
                                  <div key={f.id} className={cn("space-y-1 p-2 rounded-lg border", activeFieldId === f.id ? "border-primary bg-primary/5" : "border-transparent")}>
                                      <Label className="text-[9px] font-bold uppercase">{f.label}</Label>
                                      <Input value={fieldInstructions[f.id.toLowerCase()] || ''} onFocus={() => setactiveFieldId(f.id)} onChange={(e) => setFieldInstructions(prev => ({ ...prev, [f.id.toLowerCase()]: e.target.value }))} className="h-8 text-xs" />
                                  </div>
                              ))}
                          </div>
                      </ScrollArea>
                  </div>
              </div>
              <DialogFooter className="p-4 border-t bg-slate-50">
                  <DialogClose asChild><Button variant="ghost">Annuleren</Button></DialogClose>
                  <Button onClick={handleSave} disabled={isSaving}>Opslaan</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
  );
}

type UploadedFile = { name: string; url: string; size: number; type: string; uploadedAt: string; storagePath: string; };

export default function NewIssuePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { profile } = useProfile();
  const { startProcessing } = useGlobalLoading();
  const app = useFirebaseApp();
  
  const meldingId = searchParams.get('id');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSavingConfig, setIsSavingConfig] = React.useState(false);
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  
  // Container suggestions state
  const [containerSuggestions, setContainerSuggestions] = React.useState<MapObject[]>([]);

  // Dynamic Options States
  const [addDialog, setAddDialog] = React.useState<{ category: string, label: string, parent?: string } | null>(null);
  const [newValue, setNewValue] = React.useState('');

  const optionsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'issue_options') : null, [firestore]);
  const { data: dbOptions } = useDoc<any>(optionsRef);

  const statuses = dbOptions?.statuses || DEFAULT_STATUS_OPTIONS;
  const soortenMelder = dbOptions?.soortenMelder || DEFAULT_MELDER_TYPES;
  const hoofdcategorieen = dbOptions?.hoofdcategorieen || DEFAULT_HOOFDCATEGORIE_OPTIONS;
  const subcategorieenMap = dbOptions?.subcategorieen || DEFAULT_SUBCATEGORIE_MAPPING;

  const aiConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'pdf_config') : null, [firestore]);
  const { data: aiConfig } = useDoc<{ instructions: string, samplePdfUrl?: string }>(aiConfigRef);

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects } = useCollection<any>(projectsQuery);

  const meldingRef = useMemoFirebase(() => {
    if (!firestore || !meldingId) return null;
    return doc(firestore, 'meldingen', meldingId);
  }, [firestore, meldingId]);

  const { data: existingMelding, isLoading: isLoadingExisting } = useDoc<Melding>(meldingRef);

  // Fetch all objects for container number matching
  const objectsSearchQuery = useMemoFirebase(() => firestore ? collection(firestore, 'objects') : null, [firestore]);
  const { data: allMapObjects } = useCollection<MapObject>(objectsSearchQuery);

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      intakenummer: format(new Date(), 'yyyyMMdd'), 
      status: 'Nieuw', 
      meldingsdatum: new Date(), 
      meldingsuur: format(new Date(), 'HH:mm'),
      voorvaldatum: new Date(), 
      voorvaltijd: format(new Date(), 'HH:mm'), 
      hoofdcategorie: '', 
      subcategorie: '',
    },
  });

  const isReadOnly = React.useMemo(() => {
    if (!existingMelding) return false;
    return ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld'].includes(existingMelding.status);
  }, [existingMelding]);

  React.useEffect(() => {
    if (existingMelding) {
      form.reset({
        ...existingMelding,
        meldingsdatum: existingMelding.datum ? new Date(existingMelding.datum) : null,
        voorvaldatum: existingMelding.voorvaldatum ? new Date(existingMelding.voorvaldatum) : null,
      });
      setUploadedFiles(existingMelding.files || []);
      setUploadedPhotos(existingMelding.fotos || []);
      setLocation({ latitude: existingMelding.latitude, longitude: existingMelding.longitude });
    }
  }, [existingMelding, form]);

  // CONTAINER SEARCH LOGIC
  const watchContainerNummer = form.watch('containernummer');
  React.useEffect(() => {
    if (!watchContainerNummer || watchContainerNummer.length < 2 || isReadOnly || !allMapObjects) {
      setContainerSuggestions([]);
      return;
    }
    const q = watchContainerNummer.toLowerCase();
    const filtered = allMapObjects.filter(obj => 
      (obj.locatieType === 'Brengparkjes HHM' || obj.locatieType === 'Brenparkjes HHM') && (
        (obj.idNummer || '').toLowerCase().includes(q) ||
        (obj.id || '').toLowerCase().includes(q)
      )
    ).slice(0, 8);
    setContainerSuggestions(filtered);
  }, [watchContainerNummer, allMapObjects, isReadOnly]);

  // AUTO GEOCODING
  const watchedAddress = form.watch(['straatnaam', 'huisnummer', 'plaats']);
  React.useEffect(() => {
    if (isReadOnly) return;
    const [s, n, p] = watchedAddress;
    const addr = `${s || ''} ${n || ''}, ${p || ''}`.trim();
    if (addr.length < 5) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`);
        const geo = await res.json();
        if (geo.features?.length > 0) setLocation({ latitude: geo.features[0].center[1], longitude: geo.features[0].center[0] });
      } catch (e) {}
    }, 1000);
    return () => typeof window !== 'undefined' && clearTimeout(timer);
  }, [watchedAddress, isReadOnly]);

  // AUTO DISTRICT (WIJK) DETECTION
  React.useEffect(() => {
    if (!location || !projects || isReadOnly) return;

    const pt = turf.point([location.longitude, location.latitude]);
    let foundWijk = null;

    for (const project of projects) {
      if (!project.wijken) continue;
      for (const wijk of project.wijken) {
        try {
          const features = JSON.parse(wijk.subGebieden);
          for (const feature of features) {
            if (turf.booleanPointInPolygon(pt, feature as any)) {
              foundWijk = wijk.naam;
              break;
            }
          }
        } catch (e) {}
        if (foundWijk) break;
      }
      if (foundWijk) break;
    }

    if (foundWijk) {
      form.setValue('wijk', foundWijk);
    }
  }, [location, projects, isReadOnly, form]);

  const handleFileUpload = async (files: FileList | File[], type: 'files' | 'fotos') => {
    if (!files.length || !app || isReadOnly) return;
    const storage = getStorage(app);
    for (const file of Array.from(files)) {
      const path = `meldingen/${Date.now()}_${file.name}`;
      const task = uploadBytesResumable(ref(storage, path), file);
      await task;
      const url = await getDownloadURL(task.snapshot.ref);
      const uploaded = { name: file.name, url, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath: path };
      if (type === 'files') setUploadedFiles(prev => [...prev, uploaded]); else setUploadedPhotos(prev => [...prev, uploaded]);
    }
  };

  const handleSaveNewOption = async () => {
    if (!addDialog || !newValue.trim() || !optionsRef) return;
    
    let update: any = {};
    if (addDialog.category === 'subcategorie' && addDialog.parent) {
        const currentSubs = subcategorieenMap[addDialog.parent] || [];
        update = { 
            subcategorieen: { 
                ...subcategorieenMap, 
                [addDialog.parent]: Array.from(new Set([...currentSubs, newValue.trim()])) 
            } 
        };
    } else {
        const key = addDialog.category === 'status' ? 'statuses' : 
                    addDialog.category === 'soort_melder' ? 'soortenMelder' : 
                    addDialog.category === 'hoofdcategorie' ? 'hoofdcategorieen' : '';
        
        if (key) {
            const currentList = dbOptions?.[key] || (
                key === 'statuses' ? DEFAULT_STATUS_OPTIONS :
                key === 'soortenMelder' ? DEFAULT_MELDER_TYPES :
                key === 'hoofdcategorieen' ? DEFAULT_HOOFDCATEGORIE_OPTIONS : []
            );
            update = { [key]: Array.from(new Set([...currentList, newValue.trim()])) };
        }
    }
    
    await setDocumentNonBlocking(optionsRef, update, { merge: true });
    toast({ title: "Optie toegevoegd" });
    setNewValue('');
    setAddDialog(null);
  };

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore || isSubmitting || isReadOnly) return;
    setIsSubmitting(true);
    try {
      const sanitizedData = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value])
      );

      const mData = {
        ...sanitizedData,
        voorvaldatum: data.voorvaldatum instanceof Date ? format(data.voorvaldatum, 'yyyy-MM-dd') : (data.voorvaldatum || null),
        meldingsdatum: data.meldingsdatum instanceof Date ? format(data.meldingsdatum, 'yyyy-MM-dd') : (data.meldingsdatum || null),
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        files: uploadedFiles,
        fotos: uploadedPhotos,
        aangenomen_door: existingMelding?.aangenomen_door || profile?.displayName || 'Onbekend',
        createdAt: existingMelding?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (meldingId) {
        await updateDocumentNonBlocking(doc(firestore, 'meldingen', meldingId), mData);
      } else {
        await addDocumentNonBlocking(collection(firestore, 'meldingen'), mData);
      }

      toast({ title: meldingId ? "Melding bijgewerkt" : "Melding opgeslagen" });
      startProcessing(1000);
      router.push('/issues/portal');
    } catch (e) {
      console.error("Save error:", e);
      toast({ variant: 'destructive', title: 'Fout bij opslaan' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalid = (errors: any) => {
    if (isReadOnly) return;
    const firstError = Object.values(errors)[0] as any;
    toast({ variant: 'destructive', title: 'Validatie mislukt', description: firstError?.message || 'Vul alle verplichte velden in.' });
  };

  const currentHoofdcategorie = form.watch('hoofdcategorie');
  const subcategorieen = subcategorieenMap[currentHoofdcategorie] || ["Overig"];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
        <header className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-2">
                {!isReadOnly && (
                    <>
                        <Button variant="outline" size="sm" className="h-9 font-black gap-2 border-slate-200" onClick={() => document.getElementById('media-doc-input')?.click()}>
                            <UploadCloud className="h-4 w-4 text-primary" /> DOC
                            <input type="file" id="media-doc-input" className="hidden" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'files')} />
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 font-black gap-2 border-slate-200" onClick={() => document.getElementById('media-photo-input')?.click()}>
                            <Camera className="h-4 w-4 text-green-600" /> FOTO
                            <input type="file" id="media-photo-input" className="hidden" accept="image/*" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'fotos')} />
                        </Button>
                    </>
                )}
            </div>
            <div className="flex items-center gap-2">
                {!isReadOnly && (
                    <>
                        <IssueImportDialog open={false} onOpenChange={() => {}} onSuccess={() => {}}>
                            <Button variant="outline" size="sm" className="h-9 font-bold text-green-600 border-green-100"><FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> EXCEL</Button>
                        </IssueImportDialog>
                        <SmartPasteDialog onParsed={(d) => form.reset({ ...form.getValues(), ...d })} instructions={aiConfig?.instructions || ''} />
                        <AIConfigDialog instructions={aiConfig?.instructions || ''} samplePdfUrl={aiConfig?.samplePdfUrl} onSave={async (v, url) => {
                            if (!aiConfigRef) return;
                            setIsSavingConfig(true);
                            await setDocumentNonBlocking(aiConfigRef, { instructions: v, samplePdfUrl: url }, { merge: true });
                            setIsSavingConfig(false);
                        }} isSaving={isSavingConfig} />
                        <Separator orientation="vertical" className="h-5 mx-1" />
                        <Button type="submit" form="new-melding-form" size="sm" disabled={isSubmitting} className="h-9 font-black uppercase px-8 shadow-lg shadow-primary/20">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} OPSLAAN
                        </Button>
                    </>
                )}
                {isReadOnly && <Badge className="bg-primary text-white font-black uppercase px-4 h-9 rounded-xl shadow-lg shadow-primary/20">ARCHIEF (READ-ONLY)</Badge>}
            </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 no-scrollbar">
                <Form {...form}>
                    <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                            <Card className="rounded-2xl bg-white shadow-sm border-slate-200">
                                <CardHeader className="bg-slate-50 border-b py-2 px-4 rounded-t-2xl"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hoofdgegevens</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <FormRow label={<>Meldingsnummer<span className="text-red-500">*</span></>}>
                                        <FormField control={form.control} name="intakenummer" render={({ field }) => (
                                            <FormItem><FormControl><Input {...field} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </FormRow>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Extern Nummer">
                                            <FormField control={form.control} name="extern_meldingsnummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} />
                                        </FormRow>
                                        <FormRow 
                                            label="Status" 
                                            onAdd={() => !isReadOnly && setAddDialog({ category: 'status', label: 'Nieuwe status toevoegen' })}
                                        >
                                            <FormField control={form.control} name="status" render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}><FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue /></SelectTrigger></FormControl>
                                                        <SelectContent>{statuses.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Containernr.">
                                            <FormField control={form.control} name="containernummer" render={({ field }) => (
                                                <FormItem className="relative">
                                                    <FormControl>
                                                        <Input 
                                                            {...field} 
                                                            value={field.value || ''} 
                                                            disabled={isReadOnly} 
                                                            className="h-8 text-xs font-bold" 
                                                            autoComplete="off"
                                                        />
                                                    </FormControl>
                                                    {containerSuggestions.length > 0 && (
                                                        <div className="absolute z-[100] w-full mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                            {containerSuggestions.map(obj => (
                                                                <button
                                                                    key={obj.id}
                                                                    type="button"
                                                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0 flex items-center justify-between group"
                                                                    onClick={() => {
                                                                        form.setValue('containernummer', obj.idNummer || obj.id);
                                                                        let rawStreet = obj.straatnaam || '';
                                                                        let street = rawStreet;
                                                                        let houseNumber = obj.huisnummer || '';
                                                                        let postcode = obj.postcode || '';
                                                                        let city = obj.plaats || '';
                                                                        if (rawStreet.includes(',')) {
                                                                            const parts = rawStreet.split(',');
                                                                            const addressPart = parts[0].trim();
                                                                            const cityPart = parts[1]?.trim() || '';
                                                                            const addressMatch = addressPart.match(/^(.*?)\s*(\d+.*)$/);
                                                                            if (addressMatch) {
                                                                                street = addressMatch[1].trim();
                                                                                houseNumber = addressMatch[2].trim();
                                                                            }
                                                                            const cityMatch = cityPart.match(/^(\d{4}\s*[A-Z]{2})\s*(.*)$/i);
                                                                            if (cityMatch) {
                                                                                postcode = cityMatch[1].trim().toUpperCase();
                                                                                city = cityMatch[2].trim();
                                                                            } else if (cityPart) { city = cityPart; }
                                                                        }
                                                                        form.setValue('straatnaam', street);
                                                                        form.setValue('huisnummer', houseNumber);
                                                                        form.setValue('postcode', postcode);
                                                                        form.setValue('plaats', city);
                                                                        setLocation({ latitude: obj.latitude, longitude: obj.longitude });
                                                                        setContainerSuggestions([]);
                                                                    }}
                                                                >
                                                                    <div className="min-w-0">
                                                                        <p className="font-black text-[10px] uppercase text-slate-900">{obj.idNummer || obj.id}</p>
                                                                        <p className="text-[9px] font-bold text-slate-400 truncate">{obj.straatnaam} {obj.huisnummer}</p>
                                                                    </div>
                                                                    <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-primary transition-colors" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                        <FormRow 
                                            label={<>Soort Melder<span className="text-red-500">*</span></>}
                                            onAdd={() => !isReadOnly && setAddDialog({ category: 'soort_melder', label: 'Nieuw soort melder toevoegen' })}
                                        >
                                            <FormField control={form.control} name="soort_melder" render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}><FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                        <SelectContent>
                                                            {soortenMelder.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-2xl bg-white shadow-sm border-slate-200">
                                <CardHeader className="bg-slate-50 border-b py-2 px-4 rounded-t-2xl"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Locatie & Gebied</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-2"><FormRow label={<>Straatnaam<span className="text-red-500">*</span></>}><FormField control={form.control} name="straatnaam" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow></div>
                                        <FormRow label={<>Huisnr.<span className="text-red-500">*</span></>}><FormField control={form.control} name="huisnummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow></div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Plaats"><FormField control={form.control} name="plaats" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Postcode"><FormField control={form.control} name="postcode" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Wijk"><FormField control={form.control} name="wijk" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Werkgebied"><FormField control={form.control} name="werkgebied" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                </CardContent>
                            </Card>

                            {existingMelding && existingMelding.status !== 'Nieuw' && (
                                <Card className="rounded-2xl bg-white shadow-sm border-slate-200">
                                    <CardHeader className="bg-primary border-b py-2 px-4 rounded-t-2xl"><CardTitle className="text-[10px] font-black uppercase text-white tracking-widest">Afhandeling & Uitvoering</CardTitle></CardHeader>
                                    <CardContent className="p-4 space-y-4">
                                        <FormRow label="Afgehandeld door">
                                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                <User className="h-4 w-4 text-primary" />
                                                <span className="text-xs font-black uppercase tracking-tight text-slate-900">{existingMelding.afgehandeld_door || 'Nog niet afgehandeld'}</span>
                                            </div>
                                        </FormRow>
                                        <FormRow label="Afhandeling Details">
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 italic text-xs leading-relaxed text-slate-600">
                                                {existingMelding.afhandeling_bijzonderheden || 'Geen extra informatie opgegeven.'}
                                            </div>
                                        </FormRow>
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormRow label="Gereed op">
                                                <span className="text-xs font-bold text-slate-900">{existingMelding.afhandeling_datum || '-'}</span>
                                            </FormRow>
                                            <FormRow label="Tijdstip">
                                                <span className="text-xs font-bold text-slate-900">{existingMelding.afhandeling_tijdstip || '-'}</span>
                                            </FormRow>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        <div className="space-y-4">
                            <Card className="rounded-2xl bg-white shadow-sm border-slate-200">
                                <CardHeader className="bg-slate-50 border-b py-2 px-4 rounded-t-2xl"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Categorie & Melder</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow 
                                            label={<>Hoofdtype<span className="text-red-500">*</span></>}
                                            onAdd={() => !isReadOnly && setAddDialog({ category: 'hoofdcategorie', label: 'Nieuwe hoofdcategorie toevoegen' })}
                                        >
                                            <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
                                                        <FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                        <SelectContent>{hoofdcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                        <FormRow 
                                            label={<>Subtype<span className="text-red-500">*</span></>}
                                            onAdd={() => {
                                                if (isReadOnly) return;
                                                const currentHoofd = form.getValues('hoofdcategorie');
                                                if (!currentHoofd) {
                                                    toast({ variant: 'destructive', title: "Kies eerst een hoofdtype" });
                                                    return;
                                                }
                                                setAddDialog({ category: 'subcategorie', label: `Nieuw subtype voor '${currentHoofd}'`, parent: currentHoofd });
                                            }}
                                        >
                                            <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
                                                        <FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                        <SelectContent>{subcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Naam Melder"><FormField control={form.control} name="melder" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="BSN"><FormField control={form.control} name="burgerservicenummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Telefoon"><FormField control={form.control} name="telefoon_melder" render={({ field }) => (<FormItem><FormControl><Input type="tel" {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Email"><FormField control={form.control} name="email_melder" render={({ field }) => (<FormItem><FormControl><Input type="email" {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-2xl bg-white shadow-sm border-slate-200">
                                <CardHeader className="bg-slate-50 border-b py-2 px-4 rounded-t-2xl"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Behandeling & Tijden</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Behandelaar"><FormField control={form.control} name="behandelaar" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Afdeling"><FormField control={form.control} name="behandelende_afdeling" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Melddatum"><FormField control={form.control} name="meldingsdatum" render={({ field }) => (<FormItem><FormControl><Input type="date" {...field} value={field.value instanceof Date ? format(field.value, 'yyyy-MM-dd') : (field.value || '')} onChange={e => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Uur"><FormField control={form.control} name="meldingsuur" render={({ field }) => (<FormItem><FormControl><Input type="time" {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <FormRow label="Omschrijving Melding">
                                        <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                                            <FormItem><FormControl><Textarea {...field} value={field.value || ''} disabled={isReadOnly} className="resize-none min-h-[60px] text-xs font-medium border-slate-100 bg-slate-50/30" placeholder="Aanvullende info..." /></FormControl></FormItem>
                                        )} />
                                    </FormRow>
                                </CardContent>
                            </Card>
                        </div>
                    </form>
                </Form>
            </div>
            
            <div className="w-full lg:w-[350px] bg-slate-50 border-l shrink-0 h-full overflow-hidden flex flex-col">
                <div className="h-1/2 relative overflow-hidden bg-slate-100">
                    <MapboxView latitude={location?.latitude} longitude={location?.longitude} />
                </div>

                <div className="h-1/2 flex flex-col min-h-0 bg-white p-5 border-t">
                    <div className="flex items-center justify-between border-b pb-3 mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            BIJLAGEN ({uploadedFiles.length + uploadedPhotos.length})
                        </h3>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-bold h-5 px-2">Ready</Badge>
                    </div>
                    <ScrollArea className="flex-1 pr-3">
                        <div className="space-y-3">
                            {uploadedFiles.map(f => (
                                <div key={f.storagePath} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 group transition-all hover:bg-white hover:shadow-lg">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="bg-blue-100 p-2 rounded-xl"><Paperclip className="h-4 w-4 text-blue-600" /></div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black truncate text-slate-900 uppercase tracking-tighter">{f.name}</p>
                                            <p className="text-[9px] font-bold text-slate-400">DOCUMENT • {Math.round(f.size / 1024)} KB</p>
                                        </div>
                                    </div>
                                    {!isReadOnly && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600 rounded-full" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-4 w-4" /></Button>}
                                </div>
                            ))}
                            {uploadedPhotos.map(p => (
                                <div key={p.storagePath} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 group transition-all hover:bg-white hover:shadow-lg">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="bg-green-100 p-2 rounded-xl"><Camera className="h-4 w-4 text-green-600" /></div>
                                        <div className="relative h-10 w-10 rounded-xl overflow-hidden bg-slate-200 border-2 border-white shadow-sm shrink-0"><Image src={p.url} alt={p.name} fill className="object-cover" /></div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black truncate text-slate-900 uppercase tracking-tighter">{p.name}</p>
                                            <p className="text-[9px] font-bold text-slate-400">BEELD • {Math.round(p.size / 1024)} KB</p>
                                        </div>
                                    </div>
                                    {!isReadOnly && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600 rounded-full" onClick={() => setUploadedPhotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}><Trash2 className="h-4 w-4" /></Button>}
                                </div>
                            ))}
                            {!uploadedFiles.length && !uploadedPhotos.length && (
                                <div className="py-16 flex flex-col items-center justify-center text-slate-300">
                                    <div className="bg-slate-50 p-6 rounded-full mb-4 opacity-50">
                                        <Paperclip className="h-10 w-10 text-slate-200" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Geen bijlagen actief</p>
                                    <p className="text-[9px] font-bold text-slate-400 mt-1">
                                        {isReadOnly ? 'Dit archiefstuk bevat geen bijlagen' : 'Upload bestanden via de header'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </main>

        <Dialog open={!!addDialog} onOpenChange={(open) => !open && setAddDialog(null)}>
            <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase tracking-tight">Optie Toevoegen</DialogTitle>
                    <DialogDescription className="font-bold text-slate-500">{addDialog?.label}</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Input 
                        placeholder="Naam van de nieuwe optie..." 
                        value={newValue} 
                        onChange={(e) => setNewValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveNewOption()}
                        autoFocus
                        className="h-12 font-bold rounded-xl border-slate-100 bg-slate-50 focus:ring-primary/20"
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setAddDialog(null)} className="font-bold">Annuleren</Button>
                    <Button onClick={handleSaveNewOption} disabled={!newValue.trim()} className="font-black uppercase tracking-tight px-8 shadow-xl shadow-primary/20">
                        Toevoegen
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
