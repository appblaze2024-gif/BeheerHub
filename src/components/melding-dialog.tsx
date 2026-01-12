'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2, File as FileIcon, Upload } from 'lucide-react';
import { useFirestore, useUser, useCollection, useFirebaseApp } from '@/firebase';
import { collection, doc, addDoc, deleteDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import * as turf from '@turf/turf';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from './ui/progress';
import type { Wijk } from '@/app/projects/page';
import { Checkbox } from './ui/checkbox';


type UploadedFile = {
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
  storagePath: string;
};

type Project = {
    id: string;
    projectnaam: string;
    wijken?: Wijk[];
};

interface GeocodedAddress {
    house_number?: string;
    road?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    country?: string;
}

const meldingFormSchema = z.object({
  // Melding
  tijdstip: z.string().min(1, 'Tijdstip is verplicht'),
  melder: z.string().min(1, 'Melder is verplicht'),
  aangenomen_door: z.string().min(1, 'Veld is verplicht'),
  extern_meldingsnummer: z.string().optional(),
  intakenummer: z.string().optional(),
  
  // Inhoud
  hoofdcategorie: z.string().min(1, 'Hoofdcategorie is verplicht'),
  subcategorie: z.string().min(1, 'Subcategorie is verplicht'),
  adres: z.string().min(1, 'Adres is verplicht'),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  wijk: z.string().optional(),
  extra_informatie: z.string().min(1, 'Extra informatie is verplicht'),

  // Afhandeling
  status: z.string().min(1, 'Status is verplicht'),
  afhandeling_datum: z.string().optional(),
  afgehandeld_door: z.string().optional(),
  afhandeling_bijzonderheden: z.string().optional(),
});


type MeldingFormValues = z.infer<typeof meldingFormSchema>;

const hoofdcategorieOptions = ["Groenbeheer", "Afval", "Wegen & Verkeer", "Straatmeubilair", "Water", "Overig"];
const subcategorieOptions: Record<string, string[]> = {
    "Groenbeheer": [
        "Onkruid op verharding",
        "Maaien bermen/gazons",
        "Snoeien van bomen/struiken",
        "Ziekte of plaag in beplanting",
        "Boomwortelopdruk",
        "Wateroverlast groenvoorziening"
    ],
    "Afval": [
        "Zwerfafval",
        "Illegale dumping",
        "Volle of kapotte afvalbak",
        "Verstopte rioolkolk",
        "Hondenpoepoverlast"
    ],
    "Wegen & Verkeer": [
        "Gat in de weg of losse tegel",
        "Verzakking straatwerk",
        "Kapotte of onduidelijke verkeersborden",
        "Defecte straatverlichting",
        "Gladheid (sneeuw/ijs)",
        "Parkeeroverlast"
    ],
    "Straatmeubilair": [
        "Kapotte bank, speeltoestel of paaltje",
        "Vandalisme",
        "Graffiti"
    ],
    "Water": [
        "Water op straat",
        "Verstopte duiker",
        "Probleem met beschoeiing of oever"
    ],
    "Overig": ["Overige melding"]
};
const statusOptions = [
    "Nieuw",
    "Intern doorgezet",
    "In behandeling",
    "Gepland op korte termijn",
    "Gepland op langere termijn",
    "Dubbel gemeld",
    "Afgerond",
    "Niet in beheer"
];

interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
}

interface MeldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  melding?: any | null;
}

export function MeldingDialog({
  open,
  onOpenChange,
  melding,
}: MeldingDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const meldingIdRef = React.useRef(melding?.id);
  
  const [autoGenerateIntake, setAutoGenerateIntake] = React.useState(true);
  const [manualIntakeSuffix, setManualIntakeSuffix] = React.useState('');
  const intakePrefix = React.useMemo(() => {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
  }, []);

  const [selectedLocation, setSelectedLocation] = React.useState<{lat: number, lon: number} | null>(null);


  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const allWijken = React.useMemo(() => {
    if (!projects) return [];
    return projects.flatMap(p => p.wijken || []).sort((a, b) => a.naam.localeCompare(b.naam));
  }, [projects]);


  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });
  
  const hoofdcategorie = form.watch('hoofdcategorie');
  const adresQuery = form.watch('adres');
  const status = form.watch('status');

  React.useEffect(() => {
    if (status === 'Afgerond') {
      const userName = user?.displayName || user?.email || '';
      if (userName && !form.getValues('afgehandeld_door')) {
        form.setValue('afgehandeld_door', userName);
      }
    }
  }, [status, form, user]);


  const fetchAddressDetails = React.useCallback(async (lat: number, lon: number): Promise<GeocodedAddress | null> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
      );
      const data = await response.json();
      return data.address;
    } catch (error) {
      console.error('Error fetching address details:', error);
      return null;
    }
  }, []);

  const findWijkForPoint = React.useCallback((lat: number, lng: number): string | null => {
    if (!projects) return null;

    const point = turf.point([lng, lat]);

    for (const project of projects) {
      if (project.wijken) {
        for (const wijk of project.wijken) {
          try {
            const features = JSON.parse(wijk.subGebieden);
            if (Array.isArray(features)) {
              for (const feature of features) {
                if (turf.booleanPointInPolygon(point, feature)) {
                  return wijk.naam;
                }
              }
            }
          } catch (e) {
            // ignore invalid geojson
          }
        }
      }
    }
    return null;
  }, [projects]);
  
  const generateIntakeNummer = React.useCallback(() => {
    const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
    return `${intakePrefix}${randomPart}`;
  }, [intakePrefix]);

  React.useEffect(() => {
    if (open) {
      setAutoGenerateIntake(true);
      setManualIntakeSuffix('');
      setSelectedLocation(null);

      meldingIdRef.current = melding?.id || doc(collection(firestore, 'temp')).id;
      const initialFiles = melding?.files || [];
      setUploadedFiles(initialFiles);

      const userName = user?.displayName || user?.email || '';
      if (melding) {
          setSelectedLocation({ lat: melding.latitude, lon: melding.longitude });
          const formValues: Partial<MeldingFormValues> = {
            ...melding,
            adres: `${melding.straatnaam || ''}${melding.huisnummer ? ' ' + melding.huisnummer : ''}, ${melding.postcode || ''}, ${melding.plaats || ''}`.trim(),
            aangenomen_door: melding.aangenomen_door || userName,
          };
          
          if(melding.status === 'Afgerond' && !melding.afgehandeld_door) {
              formValues.afgehandeld_door = userName;
          }

          form.reset(formValues);

          const intakeNummer = melding.intakenummer || '';
          if (intakeNummer.startsWith(intakePrefix)) {
            setManualIntakeSuffix(intakeNummer.substring(intakePrefix.length));
          } else {
            setManualIntakeSuffix(intakeNummer);
          }
          setAutoGenerateIntake(false);

      } else {
        form.reset({
            tijdstip: format(new Date(), 'HH:mm:ss'),
            melder: userName,
            aangenomen_door: userName,
            intakenummer: generateIntakeNummer(),
            extern_meldingsnummer: '',
            hoofdcategorie: '',
            subcategorie: '',
            adres: '',
            postcode: '',
            plaats: '',
            wijk: '',
            extra_informatie: '',
            status: 'Nieuw',
            afhandeling_datum: '',
            afgehandeld_door: '',
            afhandeling_bijzonderheden: '',
        });
      }
    } else {
        form.reset();
        setIsSubmitting(false);
        setSuggestions([]);
        setIsSearching(false);
        setUploadedFiles([]);
        setUploadProgress({});
    }
  }, [open, melding, form, user, firestore, intakePrefix, generateIntakeNummer]);

  
   React.useEffect(() => {
    if (form.formState.isDirty && form.getValues('hoofdcategorie') !== (melding?.hoofdcategorie || '')) {
        form.setValue('subcategorie', '');
    }
  }, [hoofdcategorie, form, melding]);

  React.useEffect(() => {
    if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
    }

    if (!adresQuery || !form.formState.dirtyFields.adres) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            adresQuery
          )}&format=json&countrycodes=nl&limit=5`
        );
        const data: Suggestion[] = await response.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Fout bij zoeken:", error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [adresQuery, form.formState.dirtyFields.adres]);

  const handleSuggestionClick = async (suggestion: Suggestion) => {
    form.setValue('adres', suggestion.display_name, { shouldValidate: true, shouldDirty: true });
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);

    if (!isNaN(lat) && !isNaN(lon)) {
        setSelectedLocation({ lat, lon });
        const foundWijk = findWijkForPoint(lat, lon);
        form.setValue('wijk', foundWijk || '');
    } else {
        setSelectedLocation(null);
        form.setValue('wijk', '');
    }
    setSuggestions([]);
  };

  // --- File Upload Logic ---
  const uploadFile = (file: File, meldingId: string): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) {
            reject(new Error("Firebase app not available"));
            return;
        }
        const storage = getStorage(app);
        const uniqueFileName = `${new Date().getTime()}-${file.name}`;
        const storagePath = `meldingen/${meldingId}/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on(
            'state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({...prev, [uniqueFileName]: progress}));
            },
            (error) => {
                console.error('Upload mislukt:', error);
                setUploadProgress(prev => {
                    const newProgress = {...prev};
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
                      const newProgress = {...prev};
                      delete newProgress[uniqueFileName];
                      return newProgress;
                  });
                });
            }
        );
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const meldingId = meldingIdRef.current;
    if (!meldingId) return;
    
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, meldingId);
        setUploadedFiles(prev => [...prev, uploadedFile]);
      } catch (error) {
        console.error(`Kon ${file.name} niet uploaden.`);
      }
    }
  };

  const handleFileDelete = async (fileToDelete: UploadedFile) => {
    if (!app) return;
    const storage = getStorage(app);

    const fileRef = ref(storage, fileToDelete.storagePath);
    try {
      await deleteObject(fileRef);
      setUploadedFiles((prev) =>
        prev.filter((f) => f.storagePath !== fileToDelete.storagePath)
      );
    } catch (error: any) {
      console.error('Kon bestand niet verwijderen:', error);
      if (error.code === 'storage/object-not-found') {
        setUploadedFiles((prev) =>
          prev.filter((f) => f.storagePath !== fileToDelete.storagePath)
        );
      }
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
   const isUploading = Object.keys(uploadProgress).length > 0;
  // -------------------------


  const onSubmit = async (data: MeldingFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    let lat, lon;
    if (melding) {
      lat = melding.latitude;
      lon = melding.longitude;
    } else {
      if (!selectedLocation) {
        form.setError('adres', { type: 'manual', message: 'Selecteer een geldig adres uit de suggesties.' });
        setIsSubmitting(false);
        return;
      }
      lat = selectedLocation.lat;
      lon = selectedLocation.lon;
    }

    const addressDetails = await fetchAddressDetails(lat, lon);
    if (!addressDetails) {
        form.setError('adres', { type: 'manual', message: 'Kon adres niet vinden. Controleer de invoer.'});
        setIsSubmitting(false);
        return;
    }
    
    const straatnaam = addressDetails.road || '';
    const huisnummer = addressDetails.house_number || '';
    const postcode = addressDetails.postcode || '';
    const plaats = addressDetails.city || addressDetails.town || addressDetails.village || addressDetails.suburb || '';

    const wijk = data.wijk || findWijkForPoint(lat, lon);
    
    const finalIntakeNumber = autoGenerateIntake ? generateIntakeNummer() : `${intakePrefix}${manualIntakeSuffix}`;


    const meldingData = {
      ...data,
      intakenummer: finalIntakeNumber,
      straatnaam,
      huisnummer,
      postcode,
      plaats,
      latitude: lat,
      longitude: lon,
      wijk: wijk || 'Onbekend',
      datum: melding ? melding.datum : format(new Date(), 'yyyy-MM-dd'),
      files: uploadedFiles,
      updatedAt: serverTimestamp(),
    };
    delete (meldingData as any).adres;

    const meldingId = melding?.id || meldingIdRef.current;
    
    try {
        if (melding) {
            const meldingRef = doc(firestore, 'meldingen', meldingId);
            await updateDoc(meldingRef, meldingData);
        } else {
            const meldingenColRef = collection(firestore, 'meldingen');
            await setDoc(doc(meldingenColRef, meldingId), {
                ...meldingData, 
                createdAt: serverTimestamp()
            });
        }
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan melding:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDelete = async () => {
    if (!firestore || !melding?.id) return;
    setIsDeleting(true);
    try {
      if (melding.files && melding.files.length > 0) {
        const storage = getStorage(app);
        for (const file of melding.files) {
          if (file.storagePath) {
            const fileRef = ref(storage, file.storagePath);
            await deleteObject(fileRef).catch((error) => {
              console.error(`Kon bestand ${file.storagePath} niet verwijderen:`, error);
            });
          }
        }
      }
      await deleteDoc(doc(firestore, 'meldingen', melding.id));
      onOpenChange(false);
    } catch (error) {
      console.error("Fout bij het verwijderen van de melding:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{melding ? 'Melding Bewerken' : 'Formulier melding / Klacht'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs defaultValue="melding" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="melding">Melding</TabsTrigger>
                <TabsTrigger value="afhandeling">Afhandeling</TabsTrigger>
                <TabsTrigger value="bestanden">Bestanden</TabsTrigger>
                <TabsTrigger value="logboek">Logboek</TabsTrigger>
              </TabsList>
              
              {/* Melding Tab */}
              <TabsContent value="melding" className="space-y-6 pt-4">
                <div className="space-y-4">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-6">
                      <FormItem>
                        <FormLabel>Intakenummer</FormLabel>
                        <div className="flex items-center gap-2">
                          <Input value={intakePrefix} disabled className="w-28" />
                          <Input
                            value={autoGenerateIntake ? '' : manualIntakeSuffix}
                            onChange={(e) => setManualIntakeSuffix(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                            placeholder="...."
                            maxLength={4}
                            disabled={autoGenerateIntake}
                            className="flex-1"
                          />
                        </div>
                         <div className="flex items-center space-x-2 pt-2">
                            <Checkbox id="auto-generate" checked={autoGenerateIntake} onCheckedChange={(checked) => setAutoGenerateIntake(!!checked)} />
                            <label htmlFor="auto-generate" className="text-sm font-medium">Genereer laatste 4 cijfers</label>
                        </div>
                      </FormItem>
                       <FormField control={form.control} name="extern_meldingsnummer" render={({ field }) => (
                          <FormItem><FormLabel>Extern meldingsnummer</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="tijdstip" render={({ field }) => (
                          <FormItem><FormLabel>Tijdstip</FormLabel><FormControl><Input {...field} disabled /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="melder" render={({ field }) => (
                          <FormItem><FormLabel>Melder</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="aangenomen_door" render={({ field }) => (
                          <FormItem><FormLabel>Aangenomen door</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>
                </div>
                <Separator />
                 <div className="space-y-4">
                    <h3 className="text-lg font-medium">Inhoud</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hoofdcategorie</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecteer een hoofdcategorie" /></SelectTrigger></FormControl>
                            <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="subcategorie" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subcategorie</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={!hoofdcategorie}><FormControl><SelectTrigger><SelectValue placeholder="Selecteer een subcategorie" /></SelectTrigger></FormControl>
                            <SelectContent>{(subcategorieOptions[hoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="adres" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Adres</FormLabel>
                              <div className="relative w-full">
                                  <FormControl>
                                      <Input {...field} placeholder="Straatnaam, postcode, plaats" autoComplete="off" />
                                  </FormControl>
                                  {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                              </div>
                               {suggestions.length > 0 && (
                                  <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                      {suggestions.map((suggestion) => (
                                      <div
                                          key={suggestion.place_id}
                                          onClick={() => handleSuggestionClick(suggestion)}
                                          className="px-4 py-2 text-sm cursor-pointer hover:bg-muted"
                                      >
                                          {suggestion.display_name}
                                      </div>
                                      ))}
                                  </div>
                              )}
                              <FormMessage />
                          </FormItem>
                        )} />
                          <FormField
                            control={form.control}
                            name="wijk"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Wijk</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecteer een wijk" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {allWijken.map((wijk) => (
                                      <SelectItem key={wijk.id} value={wijk.naam}>
                                        {wijk.naam}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                    </div>
                    <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                        <FormItem><FormLabel>Extra informatie melding</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
              </TabsContent>

              {/* Afhandeling Tab */}
              <TabsContent value="afhandeling" className="space-y-6 pt-4">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem><FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                     )} />
                    <FormField control={form.control} name="afhandeling_datum" render={({ field }) => (
                       <FormItem><FormLabel>Datum</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="afgehandeld_door" render={({ field }) => (
                        <FormItem><FormLabel>Afgehandeld door</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                </div>
                 <FormField control={form.control} name="afhandeling_bijzonderheden" render={({ field }) => (
                    <FormItem><FormLabel>Bijzonderheden</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>
                )} />
              </TabsContent>

              {/* Bestanden Tab */}
              <TabsContent value="bestanden" className="space-y-4 pt-4">
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUploading || isSubmitting}
                    onClick={() => document.getElementById('melding-file-input')?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Bestand kiezen
                  </Button>
                  <input
                    type="file"
                    id="melding-file-input"
                    onChange={handleFileChange}
                    className="hidden"
                    multiple
                    accept="image/png, image/jpeg, application/pdf"
                  />
                </div>
                
                 {Object.entries(uploadProgress).map(([name, progress]) => (
                  <div key={name} className="space-y-1 mt-2">
                    <p className="text-sm font-medium">{name}</p>
                    <Progress value={progress} className="w-full" />
                  </div>
                ))}

                <div className="border rounded-md">
                    <div className="text-sm">
                        <div className="grid grid-cols-5 gap-4 px-4 py-2 font-medium bg-muted rounded-t-md">
                        <span className="col-span-2">Bestandsnaam</span>
                        <span>Grootte</span>
                        <span>Datum</span>
                        <span className="text-right">Acties</span>
                        </div>
                    </div>
                    {uploadedFiles.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto">
                        {uploadedFiles.map((file, idx) => (
                            <div
                            key={idx}
                            className="grid grid-cols-5 gap-4 items-center px-4 py-2 border-b last:border-b-0"
                            >
                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="col-span-2 truncate flex items-center gap-2 hover:underline">
                                <FileIcon className="h-4 w-4 shrink-0" /> {file.name}
                            </a>
                            <span>{formatBytes(file.size)}</span>
                            <span>{format(new Date(file.uploadedAt), 'dd-MM-yy')}</span>
                            <div className="flex justify-end">
                                <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleFileDelete(file)}
                                disabled={isSubmitting || isUploading}
                                >
                                <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                            </div>
                        ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center text-muted-foreground h-24">
                        Nog geen bestanden geüpload.
                        </div>
                    )}
                </div>
              </TabsContent>

              {/* Logboek Tab */}
              <TabsContent value="logboek" className="pt-4">
                 <div className="flex items-center justify-center text-muted-foreground h-48">
                    Logboek functionaliteit komt binnenkort.
                </div>
              </TabsContent>
            </Tabs>
            
            <DialogFooter className="flex justify-between w-full pt-4">
              <div>
                {melding && (
                   <AlertDialog>
                   <AlertDialogTrigger asChild>
                     <Button type="button" variant="destructive" disabled={isDeleting || isSubmitting}>
                       {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                       Verwijderen
                     </Button>
                   </AlertDialogTrigger>
                   <AlertDialogContent>
                     <AlertDialogHeader>
                       <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                       <AlertDialogDescription>
                         Deze actie kan niet ongedaan worden gemaakt. Dit zal de melding en alle bijbehorende bestanden permanent verwijderen.
                       </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                       <AlertDialogCancel>Annuleren</AlertDialogCancel>
                       <AlertDialogAction onClick={handleDelete}>Doorgaan</AlertDialogAction>
                     </AlertDialogFooter>
                   </AlertDialogContent>
                 </AlertDialog>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={isSubmitting || isUploading}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan...</> : 'Melding Opslaan'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
