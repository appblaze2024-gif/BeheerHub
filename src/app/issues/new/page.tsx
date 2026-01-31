'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ArrowLeft, CalendarIcon, Loader2, MapPin, Search, UploadCloud, FileIcon, Trash2 } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking, useFirebaseApp, useCollection } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
import { useNavigationUI } from '@/context/navigation-ui-context';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import type { UploadedFile, Object as MapObject } from '@/lib/types';
import { MapboxView } from '@/components/mapbox-view';
import * as turf from '@turf/turf';

// Local types, as they are not in lib/types.ts but are needed for data fetching
interface Wijk {
    id: string;
    naam: string;
    subGebieden: string;
}

interface Project {
    id: string;
    wijken?: Wijk[];
}


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
  afhandeldatum: z.date().optional().nullable(),
  afhandeltijd: z.string().optional(),
  afhandelaar: z.string().optional(),

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
});

type NewMeldingFormValues = z.infer<typeof newMeldingSchema>;

const statusOptions = [
    "Nieuw", "Intern doorgezet", "In behandeling", "Gepland op korte termijn",
    "Gepland op langere termijn", "Dubbel gemeld", "Afgerond", "Niet in beheer"
];
const hoofdcategorieOptions = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig", "Zoutkisten"];
const subcategorieOptions: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Verstopte put", "Wateroverlast"],
    "Zoutkisten": ["Zoutkist leeg"],
    "Overig": ["Overige meldingen"]
};

const FormRow = ({ label, children, labelFor }: { label: string; children: React.ReactNode; labelFor?: string }) => (
    <div className="grid grid-cols-[140px_1fr] items-center gap-x-2">
        <FormLabel htmlFor={labelFor} className="text-xs text-left">{label}</FormLabel>
        {children}
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

  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = React.useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = React.useState(false);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  
  const [addressSuggestions, setAddressSuggestions] = React.useState<any[]>([]);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = React.useState(false);

  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);
  const { data: allObjects } = useCollection<MapObject>(objectsCollection);

  const projectsCollection = React.useMemo(() => {
      if (!firestore) return null;
      return collection(firestore, 'projects');
  }, [firestore]);
  const { data: allProjects } = useCollection<Project>(projectsCollection);

  const nearbyObjects = React.useMemo(() => {
    if (!location || !allObjects) return [];
    const meldingPoint = turf.point([location.longitude, location.latitude]);
    return allObjects.filter(obj => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
      const objPoint = turf.point([obj.longitude, obj.latitude]);
      return turf.distance(meldingPoint, objPoint, { units: 'meters' }) <= 100;
    }).sort((a, b) => turf.distance(turf.point([location.longitude, location.latitude]), turf.point([a.longitude, a.latitude])) - turf.distance(turf.point([location.longitude, location.latitude]), turf.point([b.longitude, b.latitude])));
  }, [location, allObjects]);
  
  const now = new Date();
  const meldingIdRef = React.useRef(format(now, 'yyyyMMddHHmmss'));
  const meldingsnummer = meldingIdRef.current;

  React.useEffect(() => {
    setIsHeaderVisible(false);
    return () => {
      setIsHeaderVisible(true);
    };
  }, [setIsHeaderVisible]);

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      status: 'Nieuw',
      meldingsdatum: now,
      meldingsuur: format(now, 'HH:mm'),
      soort_melder: '',
      hoofdcategorie: '',
      subcategorie: '',
      behandelende_afdeling: '',
      behandelaar: '',
      voorvaltijd: '',
      actiedatum: null,
      afhandeldatum: null,
      afhandeltijd: '',
      afhandelaar: '',
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
    },
  });
  
  const watchedHoofdcategorie = form.watch('hoofdcategorie');
  
  React.useEffect(() => {
    if (!location || !allProjects) {
        form.setValue('werkgebied', '');
        return;
    }

    const point = turf.point([location.longitude, location.latitude]);
    let foundWijk: string | null = null;

    for (const project of allProjects) {
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
                    // Ignore GeoJSON parsing errors
                }
                if (foundWijk) break;
            }
        }
        if (foundWijk) break;
    }

    form.setValue('werkgebied', foundWijk || 'Geen werkgebied gevonden');
  }, [location, allProjects, form]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const uploadFile = React.useCallback((file: File, meldingId: string, type: 'documents' | 'photos'): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) {
            reject(new Error("Firebase app niet beschikbaar"));
            return;
        }
        const storage = getStorage(app);
        const uniqueFileName = `${new Date().getTime()}-${file.name}`;
        const storagePath = `meldingen/${meldingId}/${type}/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on(
            'state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({ ...prev, [uniqueFileName]: progress }));
            },
            (error) => {
                console.error('Upload mislukt:', error);
                setUploadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[uniqueFileName];
                    return newProgress;
                });
                reject(error);
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    const newFile: UploadedFile = {
                        name: file.name,
                        url: downloadURL,
                        size: file.size,
                        type: file.type,
                        uploadedAt: new Date().toISOString(),
                        storagePath: storagePath,
                    };
                    resolve(newFile);
                    setUploadProgress(prev => {
                        const newProgress = { ...prev };
                        delete newProgress[uniqueFileName];
                        return newProgress;
                    });
                });
            }
        );
    });
  }, [app]);
  
  const handleDocumentUploads = React.useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    let currentFiles = [...uploadedFiles];
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, meldingsnummer, 'documents');
        currentFiles.push(uploadedFile);
      } catch (error) {
        console.error(`Kon ${file.name} niet uploaden.`);
        toast({
          variant: "destructive",
          title: "Upload mislukt",
          description: `Bestand ${file.name} kon niet worden geüpload.`
        });
      }
    }
    setUploadedFiles(currentFiles);
  }, [uploadFile, meldingsnummer, uploadedFiles, toast]);
  
  const handleDocumentFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleDocumentUploads(event.target.files);
    }
  }, [handleDocumentUploads]);

  const handleDocumentDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files) {
      handleDocumentUploads(event.dataTransfer.files);
    }
  }, [handleDocumentUploads]);
  
  const handleDocumentDelete = async (fileToDelete: UploadedFile) => {
    if (!app) return;
    setUploadedFiles((prev) => prev.filter((f) => f.storagePath !== fileToDelete.storagePath));
    const storage = getStorage(app);
    const fileRef = ref(storage, fileToDelete.storagePath);
    try {
      await deleteObject(fileRef);
    } catch (error: any) {
      if (error.code !== 'storage/object-not-found') {
        console.error('Kon bestand niet verwijderen:', error);
      }
    }
  };

  const handlePhotoUploads = React.useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    let currentPhotos = [...uploadedPhotos];
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, meldingsnummer, 'photos');
        currentPhotos.push(uploadedFile);
      } catch (error) {
        console.error(`Kon ${file.name} niet uploaden.`);
        toast({
          variant: "destructive",
          title: "Upload mislukt",
          description: `Foto ${file.name} kon niet worden geüpload.`
        });
      }
    }
    setUploadedPhotos(currentPhotos);
  }, [uploadFile, meldingsnummer, uploadedPhotos, toast]);

  const handlePhotoFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handlePhotoUploads(event.target.files);
    }
  }, [handlePhotoUploads]);

  const handlePhotoDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingPhoto(false);
    if (event.dataTransfer.files) {
      handlePhotoUploads(event.dataTransfer.files);
    }
  }, [handlePhotoUploads]);
  
  const handlePhotoDelete = async (photoToDelete: UploadedFile) => {
    if (!app) return;
    setUploadedPhotos((prev) => prev.filter((p) => p.storagePath !== photoToDelete.storagePath));
    const storage = getStorage(app);
    const photoRef = ref(storage, photoToDelete.storagePath);
    try {
      await deleteObject(photoRef);
    } catch (error: any) {
      if (error.code !== 'storage/object-not-found') {
        console.error('Kon foto niet verwijderen:', error);
      }
    }
  };


  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore) return;
    
    setIsSubmitting(true);
    
    const meldingenCollectionRef = collection(firestore, 'meldingen');

    try {
      await addDocumentNonBlocking(meldingenCollectionRef, {
        ...data,
        intakenummer: meldingsnummer,
        datum: format(data.meldingsdatum || now, 'yyyy-MM-dd'),
        tijdstip: data.meldingsuur || format(now, 'HH:mm'),
        aangenomen_door: profile?.displayName || profile?.email || 'Onbekend',
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        files: uploadedFiles,
        fotos: uploadedPhotos,
      });

      toast({
        title: 'Melding aangemaakt',
        description: `Melding ${meldingsnummer} is succesvol aangemaakt.`,
      });
      router.push('/issues');
    } catch (error) {
      console.error('Fout bij aanmaken melding:', error);
      toast({
        variant: 'destructive',
        title: 'Fout opgetreden',
        description: 'Kon de melding niet aanmaken.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddressSearch = async () => {
    const straatnaam = form.getValues('straatnaam');
    const nummer = form.getValues('nummer');
    const postcode = form.getValues('postcode');
    const plaats = form.getValues('plaats');

    if (!straatnaam && !plaats && !postcode) {
        toast({
            variant: 'destructive',
            title: 'Onvoldoende invoer',
            description: 'Voer een straat, plaats of postcode in om te zoeken.',
        });
        return;
    }

    const queryParts = [nummer, straatnaam, postcode, plaats].filter(Boolean).join(' ');
    const urlWithToken = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(queryParts)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=5`;

    try {
        const response = await fetch(urlWithToken);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            setAddressSuggestions(data.features);
            setIsAddressDialogOpen(true);
        } else {
            toast({
                variant: 'destructive',
                title: 'Adres niet gevonden',
                description: 'Kon het opgegeven adres niet vinden. Probeer het opnieuw met andere gegevens.',
            });
        }
    } catch (error) {
        console.error("Fout bij adres zoeken:", error);
        toast({
            variant: 'destructive',
            title: 'Fout opgetreden',
            description: 'Er is een fout opgetreden bij het zoeken naar het adres.',
        });
    }
  };
  
  const handleSuggestionSelect = (feature: any) => {
    const [longitude, latitude] = feature.center;
    setLocation({ latitude, longitude });

    const context = feature.context;
    const street = feature.text;
    const houseNumber = feature.properties.address; 
    
    const postcodeContext = context.find((c: any) => c.id.startsWith('postcode'));
    const cityContext = context.find((c: any) => c.id.startsWith('place'));
    const neighborhoodContext = context.find((c: any) => c.id.startsWith('locality'));

    form.setValue('straatnaam', street || '');
    form.setValue('nummer', houseNumber || '');
    form.setValue('postcode', postcodeContext?.text || '');
    form.setValue('plaats', cityContext?.text || '');
    form.setValue('wijk', neighborhoodContext?.text || '');
    
    setIsAddressDialogOpen(false);
    setAddressSuggestions([]);
  };

  const isUploading = Object.keys(uploadProgress).length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm bg-gray-100 dark:bg-gray-900">
        <div className="flex-shrink-0 px-4 py-1.5 border-b flex justify-between items-center bg-gray-200/60 dark:bg-gray-800/60">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.push('/issues')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="font-semibold text-xs">Melding : {meldingsnummer}</h1>
            </div>
            <span className="text-xs text-muted-foreground">Laatst gewijzigd door {profile?.displayName || '...'} op {format(now, 'dd-MM-yyyy')} om {format(now, 'HH:mm:ss')}.</span>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
            <div className="p-3 grid grid-cols-12 gap-4">
               {/* Left Column */}
               <div className="col-span-7">
                   <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">Algemene Informatie</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormRow label="Meldingsnummer">
                                <Input value={meldingsnummer} disabled className="h-7 text-xs"/>
                            </FormRow>
                            <FormRow label="Soort melder">
                            <div className="flex items-center">
                                    <FormField control={form.control} name="soort_melder" render={({ field }) => (
                                        <FormControl><Input {...field} className="h-7 text-xs rounded-r-none" /></FormControl>
                                    )} />
                                    <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                                </div>
                            </FormRow>
                            <FormRow label="Hoofdindeling">
                                <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer categorie" /></SelectTrigger></FormControl>
                                        <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Indeling">
                                <div className="flex items-center">
                                    <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value} disabled={!watchedHoofdcategorie}>
                                        <FormControl><SelectTrigger className="h-7 text-xs rounded-r-none"><SelectValue placeholder="Selecteer indeling" /></SelectTrigger></FormControl>
                                        <SelectContent>{(subcategorieOptions[watchedHoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                                <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                            </div>
                            </FormRow>
                            <FormRow label="Behandelende afdeling">
                                <FormField control={form.control} name="behandelende_afdeling" render={({ field }) => (
                                <FormControl><Input {...field} className="h-7 text-xs" /></FormControl>
                            )} />
                            </FormRow>
                            <FormRow label="Behandelaar">
                            <div className="flex items-center">
                                <FormField control={form.control} name="behandelaar" render={({ field }) => (
                                    <FormControl><Input {...field} className="h-7 text-xs rounded-r-none" /></FormControl>
                                )} />
                                <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                            </div>
                            </FormRow>
                            <FormRow label="Status">
                                <FormField control={form.control} name="status" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer status" /></SelectTrigger></FormControl>
                                        <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Voorvaldatum">
                                <div className="flex gap-2 items-center">
                                    <FormField control={form.control} name="voorvaldatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl>)} />
                                    <FormField control={form.control} name="voorvaltijd" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} /></FormControl>)} />
                                </div>
                            </FormRow>
                            <FormRow label="Meldingsdatum">
                                <div className="flex gap-2 items-center">
                                    <FormField control={form.control} name="meldingsdatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl>)} />
                                    <FormField control={form.control} name="meldingsuur" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} /></FormControl>)} />
                                </div>
                            </FormRow>
                            <FormRow label="Actiedatum">
                            <FormField control={form.control} name="actiedatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl>)} />
                            </FormRow>
                            <FormRow label="Afhandeldatum">
                            <div className="flex gap-2 items-center">
                                    <FormField control={form.control} name="afhandeldatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl>)} />
                                <FormField control={form.control} name="afhandeltijd" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} /></FormControl>)} />
                            </div>
                            </FormRow>
                            <FormRow label="Afhandelaar">
                            <div className="flex items-center">
                                <FormField control={form.control} name="afhandelaar" render={({ field }) => (<FormControl><Input {...field} className="h-7 text-xs rounded-r-none" /></FormControl>)} />
                                <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                            </div>
                            </FormRow>
                        </CardContent>
                   </Card>
               </div>

               {/* Right Column */}
                <div className="col-span-5 space-y-2">
                     <div className="grid grid-cols-[140px_1fr] items-center gap-x-2">
                        <div/>
                        <div className="grid grid-cols-2 gap-2">
                             <FormRow label="Soort melding">
                                <FormField control={form.control} name="soort_melding" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                        <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer soort"/></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="Balie">Balie</SelectItem>
                                            <SelectItem value="Telefoon">Telefoon</SelectItem>
                                            <SelectItem value="Email">Email</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Ext. referentie">
                                 <FormField control={form.control} name="ext_referentie" render={({ field }) => (<FormControl><Input {...field} /></FormControl>)} />
                            </FormRow>
                        </div>
                    </div>
                    <div className='p-2 border rounded-md bg-gray-50 dark:bg-gray-800/30 space-y-1.5'>
                        <h3 className="font-semibold text-xs mb-2">Adresgegevens</h3>
                        <FormRow label="Straatnaam">
                            <div className="flex items-center">
                                <FormField control={form.control} name="straatnaam" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs rounded-r-none" /></FormControl> )} />
                                <Button type="button" onClick={handleAddressSearch} size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                            </div>
                        </FormRow>
                        <FormRow label="Nummer">
                             <div className="flex items-center gap-2">
                                <FormField control={form.control} name="nummer" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs w-20" /></FormControl> )} />
                            </div>
                        </FormRow>
                        <FormRow label="Postcode">
                             <FormField control={form.control} name="postcode" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" /></FormControl> )} />
                        </FormRow>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <FormField control={form.control} name="wijk" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='text-xs'>Wijk</FormLabel>
                                    <FormControl><Input placeholder="Wijk" {...field} className="h-7 text-xs" /></FormControl>
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="plaats" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='text-xs'>Gemeente</FormLabel>
                                    <FormControl><Input placeholder="Gemeente" {...field} className="h-7 text-xs" /></FormControl>
                                </FormItem>
                            )} />
                        </div>
                        <div className="max-w-sm">
                          <FormField control={form.control} name="werkgebied" render={({ field }) => (
                            <FormItem>
                              <FormLabel className='text-xs'>Werkgebied</FormLabel>
                              <FormControl><Input {...field} className="h-7 text-xs" disabled /></FormControl>
                            </FormItem>
                          )} />
                        </div>
                    </div>

                    <div className='p-2 border rounded-md bg-gray-50 dark:bg-gray-800/30 space-y-1.5'>
                        <h3 className="font-semibold text-xs mb-2">Medewerker / Melder</h3>
                        <FormRow label="Medewerker intake">
                             <div className="flex items-center">
                                <Input value={profile?.displayName || profile?.email || ''} disabled className="h-7 text-xs" />
                            </div>
                        </FormRow>
                        <FormRow label="Naam melder">
                             <FormField control={form.control} name="melder" render={({ field }) => ( <FormControl><Input {...field} /></FormControl> )} />
                        </FormRow>
                        <FormRow label="Telefoon melder">
                            <FormField control={form.control} name="telefoon_melder" render={({ field }) => ( <FormControl><Input type="tel" {...field} /></FormControl> )} />
                        </FormRow>
                        <FormRow label="E-mail melder">
                             <FormField control={form.control} name="email_melder" render={({ field }) => ( <FormControl><Input type="email" {...field} /></FormControl> )} />
                        </FormRow>
                        <FormRow label="Burgerservicenummer">
                            <FormField control={form.control} name="burgerservicenummer" render={({ field }) => ( <FormControl><Input {...field} /></FormControl> )} />
                        </FormRow>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 px-3 pb-3">
                 <Tabs defaultValue="memo" className="flex-1 flex flex-col min-h-0">
                    <TabsList>
                        <TabsTrigger value="memo">Memo</TabsTrigger>
                        <TabsTrigger value="documenten">Documenten</TabsTrigger>
                        <TabsTrigger value="fotos">Foto's</TabsTrigger>
                        <TabsTrigger value="locatie">Locatie</TabsTrigger>
                        <TabsTrigger value="dubbele">Dubbele Meldingen</TabsTrigger>
                    </TabsList>
                    <TabsContent value="memo" className="flex-1 mt-1">
                        <FormField control={form.control} name="extra_informatie" render={({ field }) => ( <FormItem className="h-full flex flex-col"><FormLabel className='sr-only'>Memo</FormLabel><FormControl><Textarea {...field} className="flex-1 resize-none text-xs" /></FormControl><FormMessage /></FormItem> )} />
                    </TabsContent>
                    <TabsContent value="documenten" className="flex-1 mt-1">
                        <div className="h-full flex flex-col gap-4 p-1">
                            <div
                                className={cn(
                                    "border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors flex-1",
                                    isDragging && "bg-muted/50 border-primary"
                                )}
                                onDragEnter={() => setIsDragging(true)}
                                onDragLeave={() => setIsDragging(false)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDocumentDrop}
                                onClick={() => document.getElementById('documenten-file-input')?.click()}
                            >
                                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                                <p className="mt-2 text-sm font-semibold">Sleep bestanden hierheen of klik om te uploaden</p>
                                <p className="text-xs text-muted-foreground">Alle bestandstypes zijn toegestaan.</p>
                                <input
                                    type="file"
                                    id="documenten-file-input"
                                    onChange={handleDocumentFileChange}
                                    className="hidden"
                                    multiple
                                    disabled={isUploading}
                                />
                            </div>
                            
                            {Object.entries(uploadProgress).map(([name, progress]) => (
                                <div key={name} className="space-y-1">
                                    <p className="text-sm font-medium text-muted-foreground">{name}</p>
                                    <Progress value={progress} className="w-full h-2" />
                                </div>
                            ))}

                            {uploadedFiles.length > 0 && (
                                <div className="border rounded-md max-h-32 overflow-y-auto">
                                    {uploadedFiles.map((file) => (
                                        <div
                                            key={file.storagePath}
                                            className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-2 py-1 border-b last:border-b-0"
                                        >
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate flex items-center gap-2 hover:underline text-xs">
                                                <FileIcon className="h-4 w-4 shrink-0" /> {file.name}
                                            </a>
                                            <span className='text-xs text-muted-foreground'>{formatBytes(file.size)}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => handleDocumentDelete(file)}
                                                disabled={isSubmitting}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="fotos" className="flex-1 mt-1">
                       <div className="h-full flex flex-col gap-4 p-1">
                            <div
                                className={cn(
                                    "border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors flex-1",
                                    isDraggingPhoto && "bg-muted/50 border-primary"
                                )}
                                onDragEnter={() => setIsDraggingPhoto(true)}
                                onDragLeave={() => setIsDraggingPhoto(false)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handlePhotoDrop}
                                onClick={() => document.getElementById('fotos-file-input')?.click()}
                            >
                                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                                <p className="mt-2 text-sm font-semibold">Sleep foto's hierheen of klik om te uploaden</p>
                                <p className="text-xs text-muted-foreground">Alleen afbeeldingen.</p>
                                <input
                                    type="file"
                                    id="fotos-file-input"
                                    onChange={handlePhotoFileChange}
                                    className="hidden"
                                    multiple
                                    disabled={isUploading}
                                    accept="image/*"
                                />
                            </div>
                            
                            {Object.entries(uploadProgress).map(([name, progress]) => (
                                <div key={name} className="space-y-1">
                                    <p className="text-sm font-medium text-muted-foreground">{name}</p>
                                    <Progress value={progress} className="w-full h-2" />
                                </div>
                            ))}

                            {uploadedPhotos.length > 0 && (
                                <div className="border rounded-md max-h-32 overflow-y-auto">
                                    {uploadedPhotos.map((file) => (
                                        <div
                                            key={file.storagePath}
                                            className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-2 py-1 border-b last:border-b-0"
                                        >
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate flex items-center gap-2 hover:underline text-xs">
                                                <FileIcon className="h-4 w-4 shrink-0" /> {file.name}
                                            </a>
                                            <span className='text-xs text-muted-foreground'>{formatBytes(file.size)}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => handlePhotoDelete(file)}
                                                disabled={isSubmitting}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="locatie" className="flex-1 mt-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                        <div className="h-full border rounded-md overflow-hidden">
                            <MapboxView
                                longitude={location?.longitude}
                                latitude={location?.latitude}
                                objects={nearbyObjects}
                            />
                        </div>
                        <div className="h-full border rounded-md flex flex-col">
                            <div className="p-2 border-b shrink-0">
                                <h3 className="font-semibold text-sm">Objecten in de buurt (100m)</h3>
                            </div>
                            <div className="overflow-y-auto flex-1">
                                {nearbyObjects.length > 0 ? (
                                    <div className="p-2 space-y-2">
                                        {nearbyObjects.map(obj => (
                                            <div key={obj.id} className="p-2 rounded-md bg-muted text-sm">
                                                <p className="font-semibold">{obj.id}</p>
                                                <p className="text-xs text-muted-foreground">{obj.locatieSubType || 'Onbekend type'}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-4 text-center text-muted-foreground text-xs">
                                        Geen objecten gevonden in de buurt.
                                    </div>
                                )}
                            </div>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="dubbele"><div className="text-center p-4 text-muted-foreground text-xs">Geen dubbele meldingen gevonden.</div></TabsContent>
                </Tabs>
            </div>
            
            <div className="flex-shrink-0 flex justify-end gap-2 px-3 pb-2 border-t pt-2 bg-gray-50 dark:bg-gray-800">
                <Button type="button" variant="ghost" onClick={() => router.back()} className="h-8">Annuleren</Button>
                <Button type="submit" disabled={isSubmitting || isUploading} className="h-8">
                    {isSubmitting || isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Melding Opslaan
                </Button>
            </div>
          </form>
        </Form>
        
        <Dialog open={isAddressDialogOpen} onOpenChange={setIsAddressDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Selecteer een adres</DialogTitle>
              <DialogDescription>
                Kies het juiste adres uit de onderstaande lijst of pas uw zoekopdracht aan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4 max-h-96 overflow-y-auto">
              {addressSuggestions.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-2"
                  onClick={() => handleSuggestionSelect(suggestion)}
                >
                  {suggestion.place_name}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}
