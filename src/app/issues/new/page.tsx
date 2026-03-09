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
  X, 
  Check,
  Paperclip,
  FileSpreadsheet,
  ClipboardPaste,
  ChevronRight,
  Plus,
  MoreHorizontal,
  LayoutGrid,
  File as FileIcon,
  ImageIcon
} from 'lucide-react';
import { 
  useFirestore, 
  addDocumentNonBlocking, 
  useFirebaseApp, 
  useDoc, 
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
import { useIsMobile } from '@/hooks/use-mobile';

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
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import * as turf from '@turf/turf';

// Custom components
import { IssueImportDialog } from '@/components/issue-import-dialog';
import { MapboxView } from '@/components/mapbox-view';
import type { Melding, Object as MapObject, UploadedFile, Project } from '@/lib/types';

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
  aangenomen_door: z.string().min(1, 'Naam is verplicht'),
  status: z.string().default('Nieuw'),
  voorvaldatum: z.any().optional().nullable(),
  voorvaltijd: z.string().optional().nullable(),
  meldingsdatum: z.any().optional().nullable(),
  meldingsuur: z.string().min(1, 'Tijdstip is verplicht'),
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

const DEFAULT_HOOFDCATEGORIE_OPTIONS = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig", "Zoutkisten", "Ondergrondse container rest"];

const DEFAULT_SUBCATEGORIE_MAPPING: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Wateroverlast", "Verstopte put"],
    "Zoutkisten": ["Zoutkist leeg"],
    "Ondergrondse container rest": ["Container vol", "Container storing", "Container kapot"],
    "Overig": ["Overige meldingen"]
};

const DEFAULT_MELDER_TYPES = ["Inwoner", "Bedrijf", "Gemeente", "Toezichthouder"];

const FormRow = ({ label, children, onAdd }: { label: React.ReactNode; children: React.ReactNode; onAdd?: () => void }) => (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0 min-h-[44px]">
        <div className="flex items-center justify-between">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">{label}</Label>
            {onAdd && (
                <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 text-slate-300 hover:text-primary transition-colors" 
                    onClick={onAdd}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            )}
        </div>
        <div className="flex-1 min-w-0">
            {children}
        </div>
    </div>
);

function SmartPasteDialog({ onParsed, instructions, trigger }: { onParsed: (data: any) => void, instructions: string, trigger?: React.ReactNode }) {
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
                {trigger || (
                    <Button variant="outline" size="sm" className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold">
                        <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
                        Smart Paste
                    </Button>
                )}
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

export default function NewIssuePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { profile } = useProfile();
  const { startProcessing } = useGlobalLoading();
  const app = useFirebaseApp();
  const isMobile = useIsMobile();
  
  const meldingId = searchParams.get('id');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [containerSuggestions, setContainerSuggestions] = React.useState<MapObject[]>([]);

  const optionsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'issue_options') : null, [firestore]);
  const { data: dbOptions } = useDoc<any>(optionsRef);

  const statuses = dbOptions?.statuses || DEFAULT_STATUS_OPTIONS;
  const soortenMelder = dbOptions?.soortenMelder || DEFAULT_MELDER_TYPES;
  const hoofdcategorieen = dbOptions?.hoofdcategorieen || DEFAULT_HOOFDCATEGORIE_OPTIONS;
  const subcategorieenMap = dbOptions?.subcategorieen || DEFAULT_SUBCATEGORIE_MAPPING;

  const aiConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'pdf_config') : null, [firestore]);
  const { data: aiConfig } = useDoc<{ instructions: string }>(aiConfigRef);

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects } = useCollection<Project>(projectsQuery);

  const meldingRef = useMemoFirebase(() => {
    if (!firestore || !meldingId) return null;
    return doc(firestore, 'meldingen', meldingId);
  }, [firestore, meldingId]);

  const { data: existingMelding } = useDoc<Melding>(meldingRef);

  const objectsSearchQuery = useMemoFirebase(() => firestore ? collection(firestore, 'objects') : null, [firestore]);
  const { data: allMapObjects } = useCollection<MapObject>(objectsSearchQuery);

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      intakenummer: format(new Date(), 'yyyyMMdd'), 
      status: 'Nieuw', 
      meldingsdatum: new Date(), 
      meldingsuur: format(new Date(), 'HH:mm'),
      aangenomen_door: profile?.displayName || profile?.email || '',
      voorvaldatum: new Date(), 
      voorvaltijd: format(new Date(), 'HH:mm'), 
      hoofdcategorie: '', 
      subcategorie: '',
      plaats: '', 
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

  React.useEffect(() => {
    if (!meldingId && profile && !form.getValues('aangenomen_door')) {
      form.setValue('aangenomen_door', profile.displayName || profile.email || '');
    }
  }, [profile, meldingId, form]);

  const watchStraat = form.watch('straatnaam');
  const watchHuisnummer = form.watch('huisnummer');
  const watchPlaats = form.watch('plaats');

  React.useEffect(() => {
    const geocodeAddress = async () => {
      if (!watchStraat || !watchPlaats || isReadOnly) return;
      
      const fullAddress = `${watchStraat} ${watchHuisnummer || ''}, ${watchPlaats}, Nederland`;
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`
        );
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center;
          setLocation({ latitude: lat, longitude: lng });
        }
      } catch (error) {
        console.error('Geocoding error:', error);
      }
    };

    const timer = setTimeout(geocodeAddress, 800);
    return () => clearTimeout(timer);
  }, [watchStraat, watchHuisnummer, watchPlaats, isReadOnly]);

  // Filter nearby objects for the map preview (100m radius)
  const nearbyObjects = React.useMemo(() => {
    if (!allMapObjects || !location) return [];
    const issuePt = turf.point([location.longitude, location.latitude]);
    return allMapObjects.filter(obj => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
      const objPt = turf.point([obj.longitude, obj.latitude]);
      return turf.distance(issuePt, objPt, { units: 'meters' }) <= 100;
    });
  }, [allMapObjects, location]);

  // Effect to automatically determine Werkgebied (Wijk) based on location
  React.useEffect(() => {
    if (location && projects && !isReadOnly) {
      const point = turf.point([location.longitude, location.latitude]);
      let foundWijk = '';

      for (const project of projects) {
        if (project.wijken) {
          for (const wijk of project.wijken) {
            try {
              const features = JSON.parse(wijk.subGebieden);
              if (Array.isArray(features)) {
                for (const feature of features) {
                  if (turf.booleanPointInPolygon(point, feature)) {
                    foundWijk = wijk.naam;
                    break;
                  }
                }
              }
            } catch (e) {
              // ignore invalid geojson
            }
            if (foundWijk) break;
          }
        }
        if (foundWijk) break;
      }

      if (foundWijk) {
        form.setValue('werkgebied', foundWijk);
      }
    }
  }, [location, projects, form, isReadOnly]);

  const watchContainernummer = form.watch('containernummer');
  React.useEffect(() => {
    if (!watchContainernummer || watchContainernummer.length < 2 || isReadOnly || !allMapObjects) {
      setContainerSuggestions([]);
      return;
    }
    const q = watchContainernummer.toLowerCase();
    const filtered = allMapObjects.filter(obj => 
      (obj.idNummer || '').toLowerCase().includes(q) ||
      (obj.id || '').toLowerCase().includes(q)
    ).slice(0, 15);
    setContainerSuggestions(filtered);
  }, [watchContainernummer, allMapObjects, isReadOnly]);

  const handleContainerSelect = (obj: MapObject) => {
    form.setValue('containernummer', obj.idNummer || obj.id);
    
    let rawStreet = obj.straatnaam || '';
    let houseNumber = obj.huisnummer || '';
    let postcode = obj.postcode || '';
    let city = obj.plaats || '';
    
    if (rawStreet && (!houseNumber || !postcode || !city)) {
        const postcodeMatch = rawStreet.match(/(\d{4}\s?[A-Z]{2})/i);
        if (postcodeMatch) {
            const pc = postcodeMatch[0];
            const parts = rawStreet.split(pc);
            if (!postcode) postcode = pc.toUpperCase();
            const before = parts[0].trim().replace(/,$/, '').trim();
            const after = parts[1] ? parts[1].trim().replace(/^,/, '').trim() : '';
            if (!city && after) city = after;
            if (!houseNumber) {
                const hnMatch = before.match(/(\d+.*)$/);
                if (hnMatch) {
                    houseNumber = hnMatch[0];
                    rawStreet = before.substring(0, hnMatch.index!).trim();
                } else {
                    rawStreet = before;
                }
            } else {
                rawStreet = before;
            }
        } else {
            if (!houseNumber) {
                const hnMatch = rawStreet.match(/^(.*?)\s*(\d+.*)$/);
                if (hnMatch) {
                    rawStreet = hnMatch[1].trim();
                    houseNumber = hnMatch[2].trim();
                }
            }
        }
    }
    
    form.setValue('straatnaam', rawStreet);
    form.setValue('huisnummer', houseNumber);
    form.setValue('postcode', postcode);
    form.setValue('plaats', city);
    if (obj.wijk) form.setValue('wijk', obj.wijk);
    
    setLocation({ latitude: obj.latitude, longitude: obj.longitude });
    setContainerSuggestions([]);
  };

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

  const onSubmit = (data: NewMeldingFormValues) => {
    if (!firestore || isSubmitting || isReadOnly) return;
    setIsSubmitting(true);
    
    const mData: any = {
      ...data,
      voorvaldatum: data.voorvaldatum instanceof Date ? format(data.voorvaldatum, 'yyyy-MM-dd') : (data.voorvaldatum || null),
      meldingsdatum: data.meldingsdatum instanceof Date ? format(data.meldingsdatum, 'yyyy-MM-dd') : (data.meldingsdatum || null),
      datum: data.meldingsdatum instanceof Date ? format(data.meldingsdatum, 'yyyy-MM-dd') : (data.meldingsdatum || null),
      latitude: location?.latitude || 0,
      longitude: location?.longitude || 0,
      files: uploadedFiles,
      fotos: uploadedPhotos,
      updatedAt: serverTimestamp(),
    };

    // Clean up undefined values for Firestore
    Object.keys(mData).forEach(key => mData[key] === undefined && delete mData[key]);

    if (meldingId) {
      updateDocumentNonBlocking(doc(firestore, 'meldingen', meldingId), mData);
      toast({ title: "Melding bijgewerkt" });
      router.push('/issues/portal');
    } else {
      mData.createdAt = serverTimestamp();
      addDocumentNonBlocking(collection(firestore, 'meldingen'), mData).then(() => {
        toast({ title: "Melding opgeslagen", description: `Melding ${data.intakenummer} is aangemaakt.` });
        startProcessing(1000);
        router.push('/issues/portal');
      }).catch(() => {
        setIsSubmitting(false);
      });
    }
  };

  const onSaveError = (errors: any) => {
    console.error("Form validation errors:", errors);
    toast({ 
      variant: 'destructive', 
      title: 'Validatiefout', 
      description: 'Niet alle velden ingevuld. Controleer de velden met een rode ster (*).' 
    });
  };

  const currentHoofdcategorie = form.watch('hoofdcategorie');
  const subcategorieen = subcategorieenMap[currentHoofdcategorie] || ["Overig"];

  const renderMediaAndMap = () => (
    <div className="space-y-4">
      <Card className="rounded-2xl overflow-hidden shadow-sm border-slate-200">
        <CardHeader className="bg-slate-50 border-b py-2 px-4">
          <CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Locatie Preview</CardTitle>
        </CardHeader>
        <div className="h-48 w-full relative bg-slate-100">
          <MapboxView 
            latitude={location?.latitude || 52.1326} 
            longitude={location?.longitude || 5.2913} 
            interactive={false} 
            objects={nearbyObjects} 
          />
          {!location && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Wacht op locatiegegevens...</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="rounded-2xl bg-white shadow-sm border-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50 border-b py-2 px-4">
          <CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Media & Bijlagen</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {uploadedPhotos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {uploadedPhotos.map((p, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border group">
                  <Image src={p.url} alt="foto" fill className="object-cover" />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setUploadedPhotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center opacity-20">
              <Camera className="h-6 w-6 mx-auto mb-1 text-slate-400" />
              <p className="text-[8px] font-black uppercase tracking-widest">Geen foto's</p>
            </div>
          )}
          
          <Separator className="bg-slate-100" />

          {uploadedFiles.length > 0 ? (
            <div className="space-y-2">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 truncate">
                    <FileIcon className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="text-xs font-bold truncate">{f.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-600" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center opacity-20">
              <FileIcon className="h-6 w-6 mx-auto mb-1 text-slate-400" />
              <p className="text-[8px] font-black uppercase tracking-widest">Geen documenten</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const formContent = (
    <Form {...form}>
      <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit, onSaveError)} className="space-y-4">
        {isMobile ? (
          <div className="space-y-4">
            <Accordion type="multiple" defaultValue={[]} className="w-full">
              <AccordionItem value="section-1" className="border-none">
                <AccordionTrigger className="hover:no-underline py-3 px-4 bg-white rounded-xl mb-2 shadow-sm border border-slate-100">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-900">Basisgegevens</span>
                </AccordionTrigger>
                <AccordionContent className="p-4 pt-0 space-y-2">
                  <FormRow label={<>Meldingsnummer<span className="text-red-500">*</span></>}>
                    <FormField control={form.control} name="intakenummer" render={({ field, fieldState }) => (
                      <FormItem><FormControl><Input {...field} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </FormRow>
                  <div className="grid grid-cols-2 gap-3">
                    <FormRow label={<>Datum<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="meldingsdatum" render={({ field, fieldState }) => (
                        <FormItem><FormControl><Input type="date" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={(e) => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </FormRow>
                    <FormRow label={<>Tijdstip<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="meldingsuur" render={({ field, fieldState }) => (
                        <FormItem><FormControl><Input type="time" {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </FormRow>
                  </div>
                  <FormRow label={<>Aangenomen door<span className="text-red-500">*</span></>}>
                    <FormField control={form.control} name="aangenomen_door" render={({ field, fieldState }) => (
                      <FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </FormRow>
                  <div className="grid grid-cols-2 gap-3">
                    <FormRow label="Status">
                      <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                            <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>{statuses.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </FormRow>
                    <FormRow label={<>Melder<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="soort_melder" render={({ field, fieldState }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
                            <FormControl><SelectTrigger className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                            <SelectContent>{soortenMelder.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </FormRow>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="section-2" className="border-none">
                <AccordionTrigger className="hover:no-underline py-3 px-4 bg-white rounded-xl mb-2 shadow-sm border border-slate-100">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-900">Locatie & Gebied</span>
                </AccordionTrigger>
                <AccordionContent className="p-4 pt-0 space-y-2">
                  <FormRow label={<>Straatnaam<span className="text-red-500">*</span></>}>
                    <FormField control={form.control} name="straatnaam" render={({ field, fieldState }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl></FormItem>)} />
                  </FormRow>
                  <div className="grid grid-cols-2 gap-3">
                    <FormRow label={<>Huisnr.<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="huisnummer" render={({ field, fieldState }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl></FormItem>)} />
                    </FormRow>
                    <FormRow label="Plaats">
                      <FormField control={form.control} name="plaats" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-11 font-bold" /></FormControl></FormItem>)} />
                    </FormRow>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormRow label="Postcode">
                      <FormField control={form.control} name="postcode" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-11 font-bold" /></FormControl></FormItem>)} />
                    </FormRow>
                    <FormRow label="Werkgebied">
                      <FormField control={form.control} name="werkgebied" render={({ field }) => (
                        <FormItem><FormControl><Input {...field} value={field.value || ''} disabled className="h-11 font-black bg-slate-50 text-primary border-primary/20" /></FormControl></FormItem>
                      )} />
                    </FormRow>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="section-3" className="border-none">
                <AccordionTrigger className="hover:no-underline py-3 px-4 bg-white rounded-xl mb-2 shadow-sm border border-slate-100">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-900">Omschrijving</span>
                </AccordionTrigger>
                <AccordionContent className="p-4 pt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormRow label={<>Hoofdtype<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="hoofdcategorie" render={({ field, fieldState }) => (<FormItem><Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}><FormControl><SelectTrigger className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl><SelectContent>{hoofdcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></FormItem>)} />
                    </FormRow>
                    <FormRow label={<>Subtype<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="subcategorie" render={({ field, fieldState }) => (<FormItem><Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}><FormControl><SelectTrigger className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl><SelectContent>{subcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></FormItem>)} />
                    </FormRow>
                  </div>
                  <FormRow label="Memo">
                    <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                      <FormItem><FormControl><Textarea {...field} value={field.value || ''} disabled={isReadOnly} className="resize-none min-h-[120px] font-bold" placeholder="Aanvullende info..." /></FormControl></FormItem>
                    )} />
                  </FormRow>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            
            {/* Always visible components on mobile */}
            {renderMediaAndMap()}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-4">
              <Card className="rounded-2xl bg-white shadow-sm border-slate-200 relative overflow-visible">
                <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hoofdgegevens</CardTitle></CardHeader>
                <CardContent className="p-4 pt-2">
                  <FormRow label={<>Meldingsnummer<span className="text-red-500">*</span></>}>
                    <FormField control={form.control} name="intakenummer" render={({ field, fieldState }) => (
                      <FormItem><FormControl><Input {...field} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </FormRow>
                  <div className="grid grid-cols-2 gap-3">
                    <FormRow label={<>Datum<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="meldingsdatum" render={({ field, fieldState }) => (
                        <FormItem><FormControl><Input type="date" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={(e) => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </FormRow>
                    <FormRow label={<>Tijdstip<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="meldingsuur" render={({ field, fieldState }) => (
                        <FormItem><FormControl><Input type="time" {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </FormRow>
                  </div>
                  <FormRow label={<>Aangenomen door<span className="text-red-500">*</span></>}>
                    <FormField control={form.control} name="aangenomen_door" render={({ field, fieldState }) => (
                      <FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </FormRow>
                  <div className="grid grid-cols-2 gap-3">
                    <FormRow label="Extern Nr."><FormField control={form.control} name="extern_meldingsnummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                    <FormRow label="Status">
                      <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                            <FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue /></SelectTrigger></FormControl>
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
                          <FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" autoComplete="off" /></FormControl>
                          {containerSuggestions.length > 0 && (
                            <div className="absolute z-[100] w-[150%] left-0 mt-1 bg-white border-2 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
                              <ScrollArea className="max-h-60">
                                {containerSuggestions.map(obj => (
                                  <button key={obj.id} type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0 flex flex-col gap-0.5" onClick={() => handleContainerSelect(obj)}>
                                    <p className="font-black text-[10px] uppercase text-slate-900">{obj.idNummer || obj.id}</p>
                                    <p className="text-[9px] font-bold text-slate-400 truncate">{obj.straatnaam} {obj.huisnummer} • {obj.plaats}</p>
                                  </button>
                                ))}
                              </ScrollArea>
                            </div>
                          )}
                        </FormItem>
                      )} />
                    </FormRow>
                    <FormRow label={<>Soort Melder<span className="text-red-500">*</span></>}>
                      <FormField control={form.control} name="soort_melder" render={({ field, fieldState }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
                            <FormControl><SelectTrigger className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                            <SelectContent>{soortenMelder.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </FormRow>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl bg-white shadow-sm border-slate-200 overflow-hidden">
                <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Locatie & Gebied</CardTitle></CardHeader>
                <CardContent className="p-4 pt-2 space-y-3">
                  <FormRow label={<>Straatnaam<span className="text-red-500">*</span></>}><FormField control={form.control} name="straatnaam" render={({ field, fieldState }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl></FormItem>)} /></FormRow>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormRow label={<>Huisnr.<span className="text-red-500">*</span></>}><FormField control={form.control} name="huisnummer" render={({ field, fieldState }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl></FormItem>)} /></FormRow>
                    <FormRow label="Postcode"><FormField control={form.control} name="postcode" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormRow label="Plaats"><FormField control={form.control} name="plaats" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                    <FormRow label={<span className="flex items-center gap-1"><LayoutGrid className="h-3 w-3" /> Werkgebied</span>}>
                      <FormField control={form.control} name="werkgebied" render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input {...field} value={field.value || ''} disabled className="h-8 text-[10px] font-black uppercase bg-slate-50 text-primary border-primary/20 shadow-inner" placeholder="Wordt berekend..." />
                          </FormControl>
                        </FormItem>
                      )} />
                    </FormRow>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="rounded-2xl bg-white shadow-sm border-slate-200 overflow-hidden">
                <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Categorie & Melder</CardTitle></CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <FormRow label={<>Hoofdtype<span className="text-red-500">*</span></>}><FormField control={form.control} name="hoofdcategorie" render={({ field, fieldState }) => (<FormItem><Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}><FormControl><SelectTrigger className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl><SelectContent>{hoofdcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></FormItem>)} /></FormRow>
                    <FormRow label={<>Subtype<span className="text-red-500">*</span></>}><FormField control={form.control} name="subcategorie" render={({ field, fieldState }) => (<FormItem><Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}><FormControl><SelectTrigger className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl><SelectContent>{subcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></FormItem>)} /></FormRow>
                  </div>
                  <FormRow label="Memo">
                    <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                      <FormItem><FormControl><Textarea {...field} value={field.value || ''} disabled={isReadOnly} className="resize-none min-h-[100px] text-xs font-medium border-slate-100 bg-slate-50/30" placeholder="Aanvullende info..." /></FormControl></FormItem>
                    )} />
                  </FormRow>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {renderMediaAndMap()}
            </div>
          </div>
        )}
      </form>
    </Form>
  );

  return (
    <div className={cn("flex flex-col bg-slate-50", !isMobile ? "h-[calc(100vh-5rem)] overflow-hidden" : "min-h-screen")}>
        <header className="h-14 bg-white border-b flex items-center justify-between px-4 md:px-6 shrink-0 shadow-sm z-10 sticky top-0">
            <div className="flex items-center gap-2">
                {!isReadOnly && (
                    <>
                        <Button variant="outline" size="sm" className="h-9 font-black gap-2 border-slate-200 rounded-xl" onClick={() => document.getElementById('media-doc-input')?.click()}>
                            <UploadCloud className="h-4 w-4 text-primary" /> <span className="hidden sm:inline">DOC</span>
                            <input type="file" id="media-doc-input" className="hidden" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'files')} />
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 font-black gap-2 border-slate-200 rounded-xl" onClick={() => document.getElementById('media-photo-input')?.click()}>
                            <Camera className="h-4 w-4 text-green-600" /> <span className="hidden sm:inline">FOTO</span>
                            <input type="file" id="media-photo-input" className="hidden" accept="image/*" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'fotos')} />
                        </Button>
                    </>
                )}
            </div>
            <div className="flex items-center gap-2">
                {!isReadOnly && (
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="h-9 w-9 border-slate-200 rounded-xl">
                                    <MoreHorizontal className="h-4 w-4 text-slate-600" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl p-2">
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="rounded-lg h-10 cursor-pointer font-bold text-green-600">
                                    <IssueImportDialog open={isImporting} onOpenChange={setIsImporting} onSuccess={() => setIsImporting(false)}>
                                        <div className="flex items-center w-full">
                                            <FileSpreadsheet className="mr-2 h-4 w-4" /> EXCEL Import
                                        </div>
                                    </IssueImportDialog>
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="rounded-lg h-10 cursor-pointer font-bold text-slate-600">
                                    <SmartPasteDialog 
                                        onParsed={(d) => form.reset({ ...form.getValues(), ...d })} 
                                        instructions={aiConfig?.instructions || ''} 
                                        trigger={
                                            <div className="flex items-center w-full">
                                                <ClipboardPaste className="mr-2 h-4 w-4" /> Smart Paste
                                            </div>
                                        }
                                    />
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Separator orientation="vertical" className="h-5 mx-1" />
                        <Button type="submit" form="new-melding-form" size="sm" disabled={isSubmitting} className="h-9 font-black uppercase px-4 md:px-8 shadow-lg rounded-xl">
                            {isSubmitting ? <Loader2 className="mr-2 h-3 w-3 lg:h-4 lg:w-4 animate-spin" /> : <Check className="mr-2 h-3 w-3 lg:h-4 lg:w-4" />} {meldingId ? 'BIJWERKEN' : 'OPSLAAN'}
                        </Button>
                    </>
                )}
                {isReadOnly && <Badge className="bg-primary text-white font-black uppercase px-4 h-9 rounded-xl">ARCHIEF (READ-ONLY)</Badge>}
            </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto no-scrollbar">
            {formContent}
        </main>
    </div>
  );
}
