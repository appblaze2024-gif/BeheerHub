'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
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
  Target
} from 'lucide-react';
import { 
  useFirestore, 
  addDocumentNonBlocking, 
  useFirebaseApp, 
  useDoc, 
  setDocumentNonBlocking, 
  useMemoFirebase 
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
  voorvaldatum: z.any().optional().nullable(), // Allow string or date for AI compatibility
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

const FormRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-0.5 py-1 border-b border-slate-100 last:border-0 min-h-[36px]">
        <FormLabel className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">{label}</FormLabel>
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
          if (key && valParts.length > 0) parsed[key.trim().toLowerCase()] = valParts.join(':').trim();
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
                      <DialogTitle className="text-xl font-bold">AI Training & Sjabloon</DialogTitle>
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
  const { toast } = useToast();
  const { profile } = useProfile();
  const { startProcessing } = useGlobalLoading();
  const app = useFirebaseApp();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSavingConfig, setIsSavingConfig] = React.useState(false);
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const aiConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'pdf_config') : null, [firestore]);
  const { data: aiConfig } = useDoc<{ instructions: string, samplePdfUrl?: string }>(aiConfigRef);

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      intakenummer: `M${Date.now().toString().slice(-6)}`, 
      status: 'Nieuw', 
      meldingsdatum: new Date(), 
      meldingsuur: format(new Date(), 'HH:mm'),
      voorvaldatum: new Date(), 
      voorvaltijd: format(new Date(), 'HH:mm'), 
      hoofdcategorie: '', 
      subcategorie: '',
    },
  });

  // AUTO GEOCODING
  const watchedAddress = form.watch(['straatnaam', 'huisnummer', 'plaats']);
  React.useEffect(() => {
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
    return () => clearTimeout(timer);
  }, [watchedAddress]);

  const handleFileUpload = async (files: FileList | File[], type: 'files' | 'fotos') => {
    if (!files.length || !app) return;
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

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const mData = {
        ...data,
        voorvaldatum: data.voorvaldatum instanceof Date ? format(data.voorvaldatum, 'yyyy-MM-dd') : (data.voorvaldatum || null),
        meldingsdatum: data.meldingsdatum instanceof Date ? format(data.meldingsdatum, 'yyyy-MM-dd') : (data.meldingsdatum || null),
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        files: uploadedFiles,
        fotos: uploadedPhotos,
        aangenomen_door: profile?.displayName || 'Onbekend',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDocumentNonBlocking(collection(firestore, 'meldingen'), mData);
      toast({ title: "Melding opgeslagen", description: `Melding ${data.intakenummer} is aangemaakt en staat in het portaal.` });
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
    console.error("Form errors:", errors);
    const firstError = Object.values(errors)[0] as any;
    toast({ variant: 'destructive', title: 'Validatie mislukt', description: firstError?.message || 'Vul alle verplichte velden in.' });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
        <header className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 font-black gap-2 border-slate-200" onClick={() => document.getElementById('media-doc-input')?.click()}>
                    <UploadCloud className="h-4 w-4 text-primary" /> DOC
                    <input type="file" id="media-doc-input" className="hidden" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'files')} />
                </Button>
                <Button variant="outline" size="sm" className="h-9 font-black gap-2 border-slate-200" onClick={() => document.getElementById('media-photo-input')?.click()}>
                    <Camera className="h-4 w-4 text-green-600" /> FOTO
                    <input type="file" id="media-photo-input" className="hidden" accept="image/*" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'fotos')} />
                </Button>
            </div>
            <div className="flex items-center gap-2">
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
            </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 no-scrollbar">
                <Form {...form}>
                    <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                            <Card className="rounded-2xl overflow-hidden bg-white shadow-sm border-slate-200">
                                <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hoofdgegevens</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <FormRow label="Meldingsnummer*">
                                        <FormField control={form.control} name="intakenummer" render={({ field }) => (
                                            <FormItem><FormControl><Input {...field} className="h-8 text-xs font-bold" /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </FormRow>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Extern Nummer">
                                            <FormField control={form.control} name="extern_meldingsnummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} />
                                        </FormRow>
                                        <FormRow label="Status*">
                                            <FormField control={form.control} name="status" render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue /></SelectTrigger></FormControl>
                                                        <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Containernr.">
                                            <FormField control={form.control} name="containernummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} />
                                        </FormRow>
                                        <FormRow label="Soort Melder*">
                                            <FormField control={form.control} name="soort_melder" render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="Inwoner">Inwoner</SelectItem>
                                                            <SelectItem value="Bedrijf">Bedrijf</SelectItem>
                                                            <SelectItem value="Gemeente">Gemeente</SelectItem>
                                                            <SelectItem value="Toezichthouder">Toezichthouder</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-2xl overflow-hidden bg-white shadow-sm border-slate-200">
                                <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Locatie & Gebied</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-2"><FormRow label="Straatnaam*"><FormField control={form.control} name="straatnaam" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow></div>
                                        <FormRow label="Huisnr.*"><FormField control={form.control} name="huisnummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Plaats"><FormField control={form.control} name="plaats" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Postcode"><FormField control={form.control} name="postcode" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Wijk"><FormField control={form.control} name="wijk" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Werkgebied"><FormField control={form.control} name="werkgebied" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-4">
                            <Card className="rounded-2xl overflow-hidden bg-white shadow-sm border-slate-200">
                                <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Categorie & Melder</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Hoofdtype*">
                                            <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                                        <FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                        <SelectContent>{hoofdcategorieOptions.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                        <FormRow label="Subtype*">
                                            <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                                        <FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                                        <SelectContent>{subcategorieMapping[form.watch('hoofdcategorie') || '']?.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>)) || <SelectItem value="Overig">Overig</SelectItem>}</SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )} />
                                        </FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Naam Melder"><FormField control={form.control} name="melder" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="BSN"><FormField control={form.control} name="burgerservicenummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Telefoon"><FormField control={form.control} name="telefoon_melder" render={({ field }) => (<FormItem><FormControl><Input type="tel" {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Email"><FormField control={form.control} name="email_melder" render={({ field }) => (<FormItem><FormControl><Input type="email" {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-2xl overflow-hidden bg-white shadow-sm border-slate-200">
                                <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Behandeling & Tijden</CardTitle></CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Behandelaar"><FormField control={form.control} name="behandelaar" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Afdeling"><FormField control={form.control} name="behandelende_afdeling" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormRow label="Melddatum"><FormField control={form.control} name="meldingsdatum" render={({ field }) => (<FormItem><FormControl><Input type="date" {...field} value={field.value instanceof Date ? format(field.value, 'yyyy-MM-dd') : (field.value || '')} onChange={e => field.onChange(e.target.valueAsDate)} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                        <FormRow label="Uur"><FormField control={form.control} name="meldingsuur" render={({ field }) => (<FormItem><FormControl><Input type="time" {...field} value={field.value || ''} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                                    </div>
                                    <FormRow label="Omschrijving Melding">
                                        <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                                            <FormItem><FormControl><Textarea {...field} value={field.value || ''} className="resize-none min-h-[60px] text-xs font-medium border-slate-100 bg-slate-50/30" placeholder="Aanvullende info..." /></FormControl></FormItem>
                                        )} />
                                    </FormRow>
                                </CardContent>
                            </Card>
                        </div>
                    </form>
                </Form>
            </div>
            
            <div className="w-full lg:w-[450px] bg-slate-50 border-l shrink-0 h-full overflow-hidden flex flex-col">
                <div className="h-1/2 relative overflow-hidden bg-slate-100">
                    <MapboxView latitude={location?.latitude} longitude={location?.longitude} />
                    <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200 shadow-xl flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Live Kaart</span>
                    </div>
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
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600 rounded-full" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-4 w-4" /></Button>
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
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600 rounded-full" onClick={() => setUploadedPhotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                            {!uploadedFiles.length && !uploadedPhotos.length && (
                                <div className="py-16 flex flex-col items-center justify-center text-slate-300">
                                    <div className="bg-slate-50 p-6 rounded-full mb-4 opacity-50">
                                        <Paperclip className="h-10 w-10 text-slate-200" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Geen bijlagen actief</p>
                                    <p className="text-[9px] font-bold text-slate-400 mt-1">Upload bestanden via de header</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </main>
    </div>
  );
}