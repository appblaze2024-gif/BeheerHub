'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, addDays, isWeekend } from 'date-fns';
import { ArrowLeft, Loader2, Search, UploadCloud, FileIcon, Trash2, Camera, MapPin, Sparkles } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking, useFirebaseApp, useCollection, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, doc, arrayUnion } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
import { useNavigationUI } from '@/context/navigation-ui-context';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import type { UploadedFile, Object as MapObject, Melding } from '@/lib/types';
import { MapboxView } from '@/components/mapbox-view';
import * as turf from '@turf/turf';
import { parseIssuePdf } from '@/ai/flows/parse-issue-pdf-flow';

const newMeldingSchema = z.object({
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
    "Water": ["Verstopte put", "Wateroverlast"],
    "Zoutkisten": ["Zoutkist leeg"],
    "Overig": ["Overige meldingen"]
};

const DEFAULT_DEPARTMENTS = ["Buitendienst", "Reiniging", "Groenvoorziening", "Waterbeheer"];
const DEFAULT_HANDLERS = ["Onbekend"];
const DEFAULT_REPORTER_TYPES = ["Burger", "Bedrijf", "Medewerker", "Overheid"];

const FormRow = ({ label, children, labelFor }: { label: string; children: React.ReactNode; labelFor?: string }) => (
    <div className="grid grid-cols-[140px_1fr] items-start gap-x-2 py-0.5 min-h-[32px]">
        <FormLabel htmlFor={labelFor} className="text-[10px] text-left pt-2 font-bold text-slate-500 uppercase tracking-tighter shrink-0">{label}</FormLabel>
        <div className="flex-1 min-w-0">
            {children}
        </div>
    </div>
);

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function NewIssuePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useProfile();
  const app = useFirebaseApp();
  const { setIsHeaderVisible } = useNavigationUI();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isParsingPdf, setIsParsingPdf] = React.useState(false);

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

  // Dynamic Settings
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
  const meldingIdRef = React.useRef(meldingIdFromUrl || `${format(now, 'yyyyMMdd')}${Math.floor(1000 + Math.random() * 9000)}`);
  const meldingsnummer = meldingIdRef.current;

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
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
    },
  });
  
  const watchedHoofdcategorie = form.watch('hoofdcategorie');
  const watchedMeldingsdatum = form.watch('meldingsdatum');

  const viewedMeldingFromDb = React.useMemo(() => {
    if (!meldingIdFromUrl || !allMeldingen) return null;
    return allMeldingen.find(m => m.id === meldingIdFromUrl);
  }, [allMeldingen, meldingIdFromUrl]);

  React.useEffect(() => {
    if (viewedMeldingFromDb) {
      setViewedMelding(viewedMeldingFromDb);
      setIsReadOnly(true);
      form.reset({
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
      });
      setLocation({ latitude: viewedMeldingFromDb.latitude, longitude: viewedMeldingFromDb.longitude });
      setUploadedFiles(viewedMeldingFromDb.files || []);
      setUploadedPhotos(viewedMeldingFromDb.fotos || []);
      
      justSelectedSuggestion.current = true;
      setSearchQuery(`${viewedMeldingFromDb.straatnaam || ''}${viewedMeldingFromDb.huisnummer ? ' ' + viewedMeldingFromDb.huisnummer : ''}, ${viewedMeldingFromDb.plaats || ''}`);
    }
  }, [viewedMeldingFromDb?.id, meldingIdFromUrl, form]);
  
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
    const locationPoint = turf.point([location.longitude, location.latitude]);
    return allObjects.filter(obj => {
        if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
        return turf.distance(locationPoint, turf.point([obj.longitude, obj.latitude]), { units: 'meters' }) <= 100;
    }).sort((a, b) => turf.distance(turf.point([location.longitude, location.latitude]), turf.point([a.longitude, a.latitude])));
  }, [location, allObjects]);

  React.useEffect(() => {
    if (!location || !allProjects) { form.setValue('werkgebied', ''); return; }
    const point = turf.point([location.longitude, location.latitude]);
    let foundWijk: string | null = null;
    for (const project of allProjects) {
        if (project.wijken) {
            for (const wijk of project.wijken) {
                try {
                    const features = JSON.parse(wijk.subGebieden);
                    if (Array.isArray(features)) {
                        for (const feature of features) {
                            if (turf.booleanPointInPolygon(point, feature)) { foundWijk = wijk.naam; break; }
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

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf' || !firestore) return;

    setIsParsingPdf(true);
    toast({ description: "Melding PDF wordt uitgelezen door AI..." });

    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = (e.target?.result as string);
            const parsed = await parseIssuePdf({ pdfDataUri: base64 });

            // Automatically add new values to settings if they don't exist
            // MAPPING CORRECTED: label_1 -> hoofdcategorie, label_2 -> subcategorie
            if (parsed.label_1 && !hoofdcategorieOptions.includes(parsed.label_1)) {
                updateDocumentNonBlocking(categoriesRef!, { hoofdcategorieen: arrayUnion(parsed.label_1) });
            }
            if (parsed.label_2 && parsed.label_1) {
                const currentSubs = subcategorieMapping[parsed.label_1] || [];
                if (!currentSubs.includes(parsed.label_2)) {
                    updateDocumentNonBlocking(categoriesRef!, { 
                        [`subcategorieMapping.${parsed.label_1}`]: arrayUnion(parsed.label_2) 
                    });
                }
            }
            if (parsed.behandelaar && !handlerOptions.includes(parsed.behandelaar)) {
                updateDocumentNonBlocking(handlersRef!, { names: arrayUnion(parsed.behandelaar) });
            }

            if (parsed.datum) form.setValue('meldingsdatum', new Date(parsed.datum));
            if (parsed.tijdstip) form.setValue('meldingsuur', parsed.tijdstip);
            if (parsed.melder) form.setValue('melder', parsed.melder);
            if (parsed.extern_meldingsnummer) form.setValue('ext_referentie', parsed.extern_meldingsnummer);
            
            // Apply corrected mapping
            if (parsed.label_1) form.setValue('hoofdcategorie', parsed.label_1);
            if (parsed.label_2) form.setValue('subcategorie', parsed.label_2);
            
            if (parsed.behandelaar) form.setValue('behandelaar', parsed.behandelaar);
            if (parsed.extra_informatie) form.setValue('extra_informatie', parsed.extra_informatie);
            if (parsed.straatnaam) form.setValue('straatnaam', parsed.straatnaam);
            if (parsed.huisnummer) form.setValue('nummer', parsed.huisnummer);
            if (parsed.postcode) form.setValue('postcode', parsed.postcode);
            if (parsed.plaats) form.setValue('plaats', parsed.plaats);

            const fullAddress = `${parsed.straatnaam || ''} ${parsed.huisnummer || ''}, ${parsed.plaats || ''}`.trim();
            if (fullAddress.length > 5) {
                setSearchQuery(fullAddress);
                const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`);
                const geo = await res.json();
                if (geo.features?.length > 0) {
                    const [lng, lat] = geo.features[0].center;
                    setLocation({ latitude: lat, longitude: lng });
                }
            }

            const storage = getStorage(app);
            const storagePath = `meldingen/${meldingsnummer}/documents/${Date.now()}-${file.name}`;
            const uploadTask = uploadBytesResumable(ref(storage, storagePath), file);
            await uploadTask;
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            setUploadedFiles(prev => [...prev, { name: file.name, url, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath }]);

            toast({ title: "PDF Uitgelezen", description: "Gegevens ingevuld en bestand toegevoegd." });
        };
        reader.readAsDataURL(file);
    } catch (err) {
        toast({ variant: 'destructive', title: "Fout bij inlezen", description: "De AI kon deze PDF niet volledig begrijpen." });
    } finally {
        setIsParsingPdf(false);
        if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const uploadFile = React.useCallback((file: File, meldingId: string, type: 'documents' | 'photos'): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) return reject(new Error("Firebase app niet beschikbaar"));
        const storage = getStorage(app);
        const storagePath = `meldingen/${meldingId}/${type}/${Date.now()}-${file.name}`;
        const uploadTask = uploadBytesResumable(ref(storage, storagePath), file);
        uploadTask.on('state_changed',
            (snap) => setUploadProgress(prev => ({ ...prev, [file.name]: (snap.bytesTransferred / snap.totalBytes) * 100 })),
            (err) => { setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n; }); reject(err); },
            () => getDownloadURL(uploadTask.snapshot.ref).then(url => {
                const nFile = { name: file.name, url, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath };
                resolve(nFile);
                setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n; });
            })
        );
    });
  }, [app]);
  
  const handleDocumentUploads = React.useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      try {
        const res = await uploadFile(file, meldingsnummer, 'documents');
        setUploadedFiles(prev => [...prev, res]);
      } catch (error) { toast({ variant: "destructive", title: "Upload mislukt" }); }
    }
  }, [uploadFile, meldingsnummer, toast]);
  
  const handlePhotoUploads = React.useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      try {
        const res = await uploadFile(file, meldingsnummer, 'photos');
        setUploadedPhotos(prev => [...prev, res]);
      } catch (error) { toast({ variant: "destructive", title: "Upload mislukt" }); }
    }
  }, [uploadFile, meldingsnummer, toast]);

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore || isSubmitting) return;
    setIsSubmitting(true);
    try {
       const mData: any = {
        soort_melder: data.soort_melder, hoofdcategorie: data.hoofdcategorie, subcategorie: data.subcategorie,
        behandelende_afdeling: data.behandelende_afdeling, behandelaar: data.behandelaar, status: data.status,
        extern_meldingsnummer: data.ext_referentie, straatnaam: data.straatnaam, huisnummer: data.nummer,
        postcode: data.postcode, plaats: data.plaats, wijk: data.wijk, werkgebied: data.werkgebied,
        melder: data.melder, extra_informatie: data.extra_informatie,
        latitude: location?.latitude || 0, longitude: location?.longitude || 0,
        files: uploadedFiles, fotos: uploadedPhotos,
      };

      if (viewedMelding) {
          if (data.status === 'Afgerond' && viewedMelding.status !== 'Afgerond') {
              mData.afhandeling_datum = format(new Date(), 'yyyy-MM-dd');
              mData.afhandeling_tijdstip = format(new Date(), 'HH:mm');
              mData.afgehandeld_door = profile?.displayName || profile?.email || 'Onbekend';
          }
          await updateDocumentNonBlocking(doc(firestore, 'meldingen', viewedMelding.id), mData);
          router.push('/issues/open');
      } else {
          mData.intakenummer = meldingsnummer;
          mData.datum = format(data.meldingsdatum || now, 'yyyy-MM-dd');
          mData.tijdstip = data.meldingsuur || format(now, 'HH:mm');
          mData.aangenomen_door = profile?.displayName || profile?.email || 'Onbekend';
          if (data.voorvaldatum) {
            mData.voorvaldatum = format(new Date(data.voorvaldatum), 'yyyy-MM-dd');
            mData.voorvaltijd = data.voorvaltijd;
          }
          await addDocumentNonBlocking(collection(firestore, 'meldingen'), mData);
          router.push('/issues/open');
      }
    } catch (error) { toast({ variant: 'destructive', title: 'Fout opgetreden' }); } finally { setIsSubmitting(false); }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-sm bg-gray-100 dark:bg-gray-900">
        <div className="flex-shrink-0 px-4 py-1.5 border-b flex justify-between items-center bg-gray-200/60 dark:bg-gray-800/60">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                <h1 className="font-semibold text-xs">{viewedMelding ? `Melding: ${viewedMelding.intakenummer}` : `Melding : ${meldingsnummer}`}</h1>
            </div>
            <div className="flex justify-end gap-2">
                <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} className="hidden" accept="application/pdf" />
                <Button type="button" variant="outline" onClick={() => pdfInputRef.current?.click()} className="h-8 bg-white border-blue-600 text-blue-600 hover:bg-blue-50" disabled={isParsingPdf}>
                    {isParsingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} PDF-scan
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.back()} className="h-8">Annuleren</Button>
                <Button type="submit" form="new-melding-form" disabled={isSubmitting} className="h-8">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Melding Opslaan
                </Button>
            </div>
        </div>
        <Form {...form}>
          <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
             <div className="p-3 grid grid-cols-12 gap-4 flex-shrink-0">
               <div className="col-span-7 space-y-4">
                    <Card className="bg-gray-50 dark:bg-gray-800/30 p-2">
                        <CardHeader className="p-1 pb-1 flex-row justify-between items-start">
                           <CardTitle className="font-semibold text-xs uppercase tracking-widest text-slate-400">Algemene Informatie</CardTitle>
                           <div className="text-right text-[10px] text-muted-foreground">
                                Laatst gewijzigd door {viewedMelding ? viewedMelding.aangenomen_door : profile?.displayName || '...'} op {format(new Date(viewedMelding?.datum || now), 'dd-MM-yyyy')}
                            </div>
                        </CardHeader>
                        <div className="space-y-0.5 p-1">
                            <FormRow label="Meldingsnummer"><Input value={viewedMelding ? viewedMelding.intakenummer : meldingsnummer} disabled className="h-7 text-xs"/></FormRow>
                            <FormRow label="Soort melder">
                                <FormField control={form.control} name="soort_melder" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer melder" /></SelectTrigger></FormControl>
                                        <SelectContent>{reporterTypeOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Hoofdindeling">
                                <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer categorie" /></SelectTrigger></FormControl>
                                        <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Indeling">
                                <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer indeling" /></SelectTrigger></FormControl>
                                        <SelectContent>{(subcategorieMapping[watchedHoofdcategorie || ''] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Behandelaar">
                                <FormField control={form.control} name="behandelaar" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer behandelaar" /></SelectTrigger></FormControl>
                                        <SelectContent>{handlerOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Status">
                                <FormField control={form.control} name="status" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer status" /></SelectTrigger></FormControl>
                                        <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Meldingsdatum">
                                <div className="flex gap-2 items-center">
                                    <FormField control={form.control} name="meldingsdatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} /></FormControl>)} />
                                    <FormField control={form.control} name="meldingsuur" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} disabled={isReadOnly} /></FormControl>)} />
                                </div>
                            </FormRow>
                        </div>
                        <div className="p-1 pt-2 border-t mt-2">
                            <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                                <FormItem><FormLabel className="text-xs">Memo</FormLabel><FormControl><Textarea {...field} className="resize-none h-24 text-xs" disabled={isReadOnly}/></FormControl></FormItem>
                            )} />
                        </div>
                   </Card>
               </div>

                <div className="col-span-5 space-y-4">
                    <Card className='p-2 bg-gray-50 dark:bg-gray-800/30'>
                        <CardHeader className="p-1 pb-1"><CardTitle className="font-semibold text-xs uppercase tracking-widest text-slate-400">Soort Melding</CardTitle></CardHeader>
                        <div className="space-y-0.5 p-1">
                            <FormRow label="Soort melding">
                                <FormField control={form.control} name="soort_melding" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer soort"/></SelectTrigger></FormControl>
                                        <SelectContent><SelectItem value="Klacht">Klacht</SelectItem><SelectItem value="Verbetering">Verbetering</SelectItem><SelectItem value="Schade">Schade</SelectItem></SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Ext. referentie"><FormField control={form.control} name="ext_referentie" render={({ field }) => (<FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl>)} /></FormRow>
                        </div>
                    </Card>
                    <div className='p-2 border rounded-md bg-gray-50 dark:bg-gray-800/30 space-y-1'>
                        <h3 className="font-semibold text-xs mb-2 uppercase tracking-widest text-slate-400">Adresgegevens</h3>
                        <div className="relative">
                            <FormItem><FormLabel className="text-xs">Zoek Adres</FormLabel><div className="relative flex items-center">
                                <Input placeholder="Zoek op adres..." className="h-7 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={isReadOnly}/>
                                {isSearching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                            </div></FormItem>
                            {addressSuggestions.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                    {addressSuggestions.map((s) => (<div key={s.id} className="px-4 py-2 text-xs cursor-pointer hover:bg-muted" onClick={() => { setLocation({ latitude: s.center[1], longitude: s.center[0] }); setSearchQuery(s.place_name); setAddressSuggestions([]); }}>{s.place_name}</div>))}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2">
                             <FormField control={form.control} name="straatnaam" render={({ field }) => (<FormItem><FormLabel className='text-xs'>Straatnaam</FormLabel><FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl></FormItem>)} />
                             <FormField control={form.control} name="nummer" render={({ field }) => (<FormItem><FormLabel className='text-xs'>Nummer</FormLabel><FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl></FormItem>)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField control={form.control} name="postcode" render={({ field }) => (<FormItem><FormLabel className='text-xs'>Postcode</FormLabel><FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl></FormItem>)} />
                             <FormField control={form.control} name="plaats" render={({ field }) => (<FormItem><FormLabel className='text-xs'>Plaats</FormLabel><FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl></FormItem>)} />
                        </div>
                    </div>
                    <div className='p-2 border rounded-md bg-gray-50 dark:bg-gray-800/30 space-y-1'>
                        <h3 className="font-semibold text-xs mb-2 uppercase tracking-widest text-slate-400">Medewerker / Melder</h3>
                        <FormRow label="Naam melder"><FormField control={form.control} name="melder" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl> )} /></FormRow>
                        <FormRow label="Telefoon melder"><FormField control={form.control} name="telefoon_melder" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl> )} /></FormRow>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 px-3 pb-3">
                 <Tabs defaultValue="locatie" className="flex-1 flex flex-col min-h-0">
                    <TabsList><TabsTrigger value="documenten">Documenten</TabsTrigger><TabsTrigger value="fotos">Foto's</TabsTrigger><TabsTrigger value="locatie">Locatie</TabsTrigger></TabsList>
                    <TabsContent value="documenten" className="flex-1 mt-1 overflow-y-auto">
                        <div className="h-full flex flex-col gap-4 p-1">
                            {!isReadOnly && <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors h-32" onClick={() => document.getElementById('doc-input')?.click()}>
                                <UploadCloud className="h-8 w-8 text-muted-foreground" /><p className="mt-2 text-xs font-semibold">Upload document</p>
                                <input type="file" id="doc-input" onChange={(e) => e.target.files && handleDocumentUploads(e.target.files)} className="hidden" multiple />
                            </div>}
                            <div className="space-y-2">
                                {uploadedFiles.map((f) => (
                                    <div key={f.storagePath} className="flex items-center justify-between p-2 border rounded-lg bg-white">
                                        <div className="flex items-center gap-2 truncate"><FileIcon className="h-4 w-4" /><span className="text-xs truncate">{f.name}</span></div>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="fotos" className="flex-1 mt-1 overflow-y-auto">
                        <div className="h-full flex flex-col gap-4 p-1">
                            {!isReadOnly && <div className="grid grid-cols-2 gap-3">
                                <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 h-32" onClick={() => document.getElementById('photo-input')?.click()}>
                                    <UploadCloud className="h-6 w-6" /><p className="text-[10px] mt-1">Galerij</p>
                                    <input type="file" id="photo-input" onChange={(e) => e.target.files && handlePhotoUploads(e.target.files)} className="hidden" multiple accept="image/*" />
                                </div>
                                <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 h-32" onClick={() => document.getElementById('camera-input')?.click()}>
                                    <Camera className="h-6 w-6" /><p className="text-[10px] mt-1">Camera</p>
                                    <input type="file" id="camera-input" onChange={(e) => e.target.files && handlePhotoUploads(e.target.files)} className="hidden" accept="image/*" capture="environment" />
                                </div>
                            </div>}
                            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                                {uploadedPhotos.map(p => (
                                    <div key={p.storagePath} className="relative aspect-square rounded-lg overflow-hidden border">
                                        <Image src={p.url} alt={p.name} fill className="object-cover" />
                                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-5 w-5" onClick={() => setUploadedPhotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="locatie" className="flex-1 mt-1 flex flex-col min-h-0">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                        <div className="md:col-span-2 border rounded-md overflow-hidden relative"><MapboxView longitude={location?.longitude} latitude={location?.latitude} /></div>
                        <div className="border rounded-md flex flex-col min-h-0 bg-white">
                            <div className="p-2 border-b shrink-0 font-bold text-xs uppercase tracking-widest">Objecten in de buurt (100m)</div>
                            <div className="overflow-y-auto flex-1 p-2 space-y-2">
                                {nearbyObjects.map(obj => (<div key={obj.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100"><p className="font-black text-[10px]">{obj.id}</p><p className="text-[10px] text-muted-foreground">{obj.locatieSubType}</p></div>))}
                                {nearbyObjects.length === 0 && <div className="text-xs text-muted-foreground italic p-4 text-center">Geen objecten gevonden.</div>}
                            </div>
                        </div>
                      </div>
                    </TabsContent>
                </Tabs>
            </div>
          </form>
        </Form>
    </div>
  );
}
