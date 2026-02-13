'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, addDays, isWeekend } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ArrowLeft, Loader2, Search, UploadCloud, FileIcon, Trash2, Camera, MapPin, ChevronUp, ChevronDown, Plus, PlusCircle } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking, useFirebaseApp, useCollection, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
import { useNavigationUI } from '@/context/navigation-ui-context';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import type { UploadedFile, Object as MapObject, Melding } from '@/lib/types';
import { MapboxView } from '@/components/mapbox-view';
import * as turf from '@turf/turf';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';


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
    <div className="grid grid-cols-[140px_1fr] items-start gap-x-2 py-0.5">
        <FormLabel htmlFor={labelFor} className="text-xs text-left pt-2">{label}</FormLabel>
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

  const searchParams = useSearchParams();
  const meldingIdFromUrl = searchParams.get('id');
  const [isReadOnly, setIsReadOnly] = React.useState(false);
  const [viewedMelding, setViewedMelding] = React.useState<Melding | null>(null);

  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = React.useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = React.useState(false);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  
  const [addressSuggestions, setAddressSuggestions] = React.useState<any[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);

  // Status management
  const [isManageStatusesOpen, setIsManageStatusesOpen] = React.useState(false);
  const [newStatusName, setNewStatusName] = React.useState('');

  const statusesRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'statuses');
  }, [firestore]);
  const { data: statusesData } = useDoc<{ names: string[] }>(statusesRef);
  const statusOptions = statusesData?.names || DEFAULT_STATUS_OPTIONS;

  const handleAddStatus = async () => {
    if (!firestore || !newStatusName.trim() || !statusesRef) return;
    const updatedList = [...statusOptions, newStatusName.trim()];
    await setDocumentNonBlocking(statusesRef, { names: updatedList }, { merge: true });
    setNewStatusName('');
  };

  const handleRemoveStatus = async (item: string) => {
    if (!firestore || !statusesRef) return;
    const updatedList = statusOptions.filter(x => x !== item);
    await setDocumentNonBlocking(statusesRef, { names: updatedList }, { merge: true });
  };

  const handleMoveStatus = async (index: number, direction: 'up' | 'down') => {
    if (!firestore || !statusesRef) return;
    const newList = [...statusOptions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    const [movedItem] = newList.splice(index, 1);
    newList.splice(targetIndex, 0, movedItem);
    await setDocumentNonBlocking(statusesRef, { names: newList }, { merge: true });
  };

  // Categories management
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = React.useState(false);
  const [isManageSubcategoriesOpen, setIsManageSubcategoriesOpen] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [newSubcategoryName, setNewSubcategoryName] = React.useState('');
  const [manageSubSelectedCategory, setManageSubSelectedCategory] = React.useState('');

  // Department management
  const [isManageDepartmentsOpen, setIsManageDepartmentsOpen] = React.useState(false);
  const [newDepartmentName, setNewDepartmentName] = React.useState('');

  // Handler management
  const [isManageHandlersOpen, setIsManageHandlersOpen] = React.useState(false);
  const [newHandlerName, setNewHandlerName] = React.useState('');

  // Reporter types management
  const [isManageReporterTypesOpen, setIsManageReporterTypesOpen] = React.useState(false);
  const [newReporterTypeName, setNewReporterTypeName] = React.useState('');

  const categoriesRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'categories');
  }, [firestore]);
  const { data: categoriesData } = useDoc<{ hoofdcategorieen: string[], subcategorieMapping: Record<string, string[]> }>(categoriesRef);
  const hoofdcategorieOptions = categoriesData?.hoofdcategorieen || DEFAULT_HOOFDCATEGORIEEN;
  const subcategorieMapping = categoriesData?.subcategorieMapping || DEFAULT_SUBCATEGORIE_MAPPING;

  const departmentsRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'departments');
  }, [firestore]);
  const { data: departmentsData } = useDoc<{ names: string[] }>(departmentsRef);
  const departmentOptions = departmentsData?.names || DEFAULT_DEPARTMENTS;

  const handlersRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'handlers');
  }, [firestore]);
  const { data: handlersData } = useDoc<{ names: string[] }>(handlersRef);
  const handlerOptions = handlersData?.names || DEFAULT_HANDLERS;

  const reporterTypesRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'reporter_types');
  }, [firestore]);
  const { data: reporterTypesData } = useDoc<{ names: string[] }>(reporterTypesRef);
  const reporterTypeOptions = reporterTypesData?.names || DEFAULT_REPORTER_TYPES;

  const objectsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);
  const { data: allObjects } = useCollection<MapObject>(objectsCollection);
  
  const meldingenCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'meldingen');
  }, [firestore]);
  const { data: allMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenCollection);

  const projectsCollection = useMemoFirebase(() => {
      if (!firestore) return null;
      return collection(firestore, 'projects');
  }, [firestore]);
  const { data: allProjects } = useCollection<Project>(projectsCollection);
  
  const now = new Date();
  const meldingIdRef = React.useRef(meldingIdFromUrl || `${format(now, 'yyyyMMdd')}${Math.floor(1000 + Math.random() * 9000)}`);
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
    } else if (!meldingIdFromUrl) {
        setIsReadOnly(false);
        setViewedMelding(null);
        justSelectedSuggestion.current = true;
        setSearchQuery('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedMeldingFromDb?.id, meldingIdFromUrl, form]);
  
  React.useEffect(() => {
    if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
    }
    if (justSelectedSuggestion.current) {
        justSelectedSuggestion.current = false;
        return;
    }
    if (!searchQuery.trim()) {
        setAddressSuggestions([]);
        return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                searchQuery
                )}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=5`
            );
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                setAddressSuggestions(data.features);
            } else {
                setAddressSuggestions([]);
            }
        } catch (error) {
            console.error("Fout bij adres zoeken:", error);
            setAddressSuggestions([]);
        } finally {
            setIsSearching(false);
        }
    }, 500);

    return () => {
        if(searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
    }
  }, [searchQuery]);

  React.useEffect(() => {
    if (watchedMeldingsdatum && !isReadOnly) {
        let count = 0;
        let currentDate = new Date(watchedMeldingsdatum);
        while (count < 5) {
            currentDate = addDays(currentDate, 1);
            if (!isWeekend(currentDate)) {
                count++;
            }
        }
        form.setValue('actiedatum', currentDate);
    }
  }, [watchedMeldingsdatum, form, isReadOnly]);
  
  const nearbyObjects = React.useMemo(() => {
    if (!location || !allObjects) return [];
    const locationPoint = turf.point([location.longitude, location.latitude]);
    return allObjects.filter(obj => {
        if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
        const objPoint = turf.point([obj.longitude, obj.latitude]);
        const distance = turf.distance(locationPoint, objPoint, { units: 'meters' });
        return distance <= 100;
    }).sort((a, b) => {
        const distA = turf.distance(locationPoint, turf.point([a.longitude, a.latitude]));
        const distB = turf.distance(locationPoint, turf.point([b.longitude, b.latitude]));
        return distA - distB;
    });
  }, [location, allObjects]);

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
    const i = Math.floor(Log(bytes) / Math.log(k));
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


  const resetFormForNewMelding = () => {
    const newNow = new Date();
    meldingIdRef.current = `${format(newNow, 'yyyyMMdd')}${Math.floor(1000 + Math.random() * 9000)}`;
    
    form.reset({
      status: 'Nieuw',
      meldingsdatum: newNow,
      meldingsuur: format(newNow, 'HH:mm'),
      voorvaldatum: newNow,
      voorvaltijd: format(newNow, 'HH:mm'),
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
    });
    setUploadedFiles([]);
    setUploadedPhotos([]);
    setUploadProgress({});
    setLocation(null);
    setAddressSuggestions([]);
    setSearchQuery('');
  };

  const canEditStatus = !!viewedMelding && (profile?.role === 'Super admin' || profile?.role === 'toezichthouder');

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore) return;
    
    if (viewedMelding) {
        if (!canEditStatus) return;
    } else {
        if (isReadOnly) return;
    }
    
    setIsSubmitting(true);
    
    try {
       const meldingData: any = {
        soort_melder: data.soort_melder,
        hoofdcategorie: data.hoofdcategorie,
        subcategorie: data.subcategorie,
        behandelende_afdeling: data.behandelende_afdeling,
        behandelaar: data.behandelaar,
        status: data.status,
        extern_meldingsnummer: data.ext_referentie,
        straatnaam: data.straatnaam,
        huisnummer: data.nummer,
        postcode: data.postcode,
        plaats: data.plaats,
        wijk: data.wijk,
        werkgebied: data.werkgebied,
        melder: data.melder,
        extra_informatie: data.extra_informatie,
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        files: uploadedFiles,
        fotos: uploadedPhotos,
      };

      if (viewedMelding) {
          const meldingRef = doc(firestore, 'meldingen', viewedMelding.id);
          
          if (data.status === 'Afgerond' && viewedMelding.status !== 'Afgerond') {
              meldingData.afhandeling_datum = format(new Date(), 'yyyy-MM-dd');
              meldingData.afhandeling_tijdstip = format(new Date(), 'HH:mm');
              meldingData.afgehandeld_door = profile?.displayName || profile?.email || 'Onbekend';
          }

          await updateDocumentNonBlocking(meldingRef, meldingData);
          toast({
            title: 'Melding bijgewerkt',
            description: `Melding ${viewedMelding.intakenummer} is succesvol bijgewerkt.`,
          });
          router.push('/issues/open');
      } else {
          meldingData.intakenummer = meldingsnummer;
          meldingData.datum = format(data.meldingsdatum || now, 'yyyy-MM-dd');
          meldingData.tijdstip = data.meldingsuur || format(now, 'HH:mm');
          meldingData.aangenomen_door = profile?.displayName || profile?.email || 'Onbekend';
          
          if (data.voorvaldatum) {
            meldingData.voorvaldatum = format(new Date(data.voorvaldatum), 'yyyy-MM-dd');
            meldingData.voorvaltijd = data.voorvaltijd;
          }

          await addDocumentNonBlocking(collection(firestore, 'meldingen'), meldingData);
          toast({
            title: 'Melding aangemaakt',
            description: `Melding ${meldingsnummer} is succesvol aangemaakt.`,
          });
          resetFormForNewMelding();
      }
    } catch (error) {
      console.error('Fout bij verwerken melding:', error);
      toast({
        variant: 'destructive',
        title: 'Fout opgetreden',
        description: 'Kon de melding niet opslaan.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuggestionClick = (feature: any) => {
    justSelectedSuggestion.current = true;
    const [longitude, latitude] = feature.center;
    setLocation({ latitude, longitude });

    const context = feature.context || [];
    
    let street = feature.text || '';
    let houseNumber = feature.address || '';
    
    // Sometimes house number is in text
    const streetParts = street.split(' ');
    if (streetParts.length > 1 && /^\d/.test(streetParts[streetParts.length - 1])) {
        houseNumber = streetParts.pop() + (houseNumber ? ` ${houseNumber}` : '');
        street = streetParts.join(' ');
    }
    
    const postcode = context.find((c: any) => c.id.startsWith('postcode'))?.text || '';
    const city = context.find((c: any) => c.id.startsWith('place'))?.text || '';

    form.setValue('straatnaam', street);
    form.setValue('nummer', houseNumber);
    form.setValue('postcode', postcode);
    form.setValue('plaats', city);
    form.setValue('wijk', '');
    
    setSearchQuery(feature.place_name);
    setAddressSuggestions([]);
  };

  const handleAddCategory = async () => {
    if (!firestore || !newCategoryName.trim() || !categoriesRef) return;
    const updatedList = [...hoofdcategorieOptions, newCategoryName.trim()];
    await setDocumentNonBlocking(categoriesRef, { hoofdcategorieen: updatedList }, { merge: true });
    setNewCategoryName('');
  };

  const handleRemoveCategory = async (cat: string) => {
    if (!firestore || !categoriesRef) return;
    const updatedList = hoofdcategorieOptions.filter(c => c !== cat);
    await setDocumentNonBlocking(categoriesRef, { hoofdcategorieen: updatedList }, { merge: true });
  };

  const handleMoveCategory = async (index: number, direction: 'up' | 'down') => {
    if (!firestore || !categoriesRef) return;
    const newList = [...hoofdcategorieOptions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    
    const [movedItem] = newList.splice(index, 1);
    newList.splice(targetIndex, 0, movedItem);
    
    await setDocumentNonBlocking(categoriesRef, { hoofdcategorieen: newList }, { merge: true });
  };

  const handleAddSubcategory = async () => {
    if (!firestore || !newSubcategoryName.trim() || !categoriesRef || !manageSubSelectedCategory) return;
    const currentSubs = subcategorieMapping[manageSubSelectedCategory] || [];
    const updatedMapping = {
        ...subcategorieMapping,
        [manageSubSelectedCategory]: [...currentSubs, newSubcategoryName.trim()]
    };
    await setDocumentNonBlocking(categoriesRef, { subcategorieMapping: updatedMapping }, { merge: true });
    setNewSubcategoryName('');
  };

  const handleRemoveSubcategory = async (cat: string, sub: string) => {
    if (!firestore || !categoriesRef) return;
    const currentSubs = subcategorieMapping[cat] || [];
    const updatedMapping = {
        ...subcategorieMapping,
        [cat]: currentSubs.filter(s => s !== sub)
    };
    await setDocumentNonBlocking(categoriesRef, { subcategorieMapping: updatedMapping }, { merge: true });
  };

  const handleMoveSubcategory = async (cat: string, index: number, direction: 'up' | 'down') => {
    if (!firestore || !categoriesRef) return;
    const currentSubs = [...(subcategorieMapping[cat] || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= currentSubs.length) return;
    
    const [movedItem] = currentSubs.splice(index, 1);
    currentSubs.splice(targetIndex, 0, movedItem);
    
    const updatedMapping = {
        ...subcategorieMapping,
        [cat]: currentSubs
    };
    await setDocumentNonBlocking(categoriesRef, { subcategorieMapping: updatedMapping }, { merge: true });
  };

  const handleAddDepartment = async () => {
    if (!firestore || !newDepartmentName.trim() || !departmentsRef) return;
    const updatedList = [...departmentOptions, newDepartmentName.trim()];
    await setDocumentNonBlocking(departmentsRef, { names: updatedList }, { merge: true });
    setNewDepartmentName('');
  };

  const handleRemoveDepartment = async (dept: string) => {
    if (!firestore || !departmentsRef) return;
    const updatedList = departmentOptions.filter(d => d !== dept);
    await setDocumentNonBlocking(departmentsRef, { names: updatedList }, { merge: true });
  };

  const handleMoveDepartment = async (index: number, direction: 'up' | 'down') => {
    if (!firestore || !departmentsRef) return;
    const newList = [...departmentOptions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    const [movedItem] = newList.splice(index, 1);
    newList.splice(targetIndex, 0, movedItem);
    await setDocumentNonBlocking(departmentsRef, { names: newList }, { merge: true });
  };

  const handleAddHandler = async () => {
    if (!firestore || !newHandlerName.trim() || !handlersRef) return;
    const updatedList = [...handlerOptions, newHandlerName.trim()];
    await setDocumentNonBlocking(handlersRef, { names: updatedList }, { merge: true });
    setNewHandlerName('');
  };

  const handleRemoveHandler = async (h: string) => {
    if (!firestore || !handlersRef) return;
    const updatedList = handlerOptions.filter(x => x !== h);
    await setDocumentNonBlocking(handlersRef, { names: updatedList }, { merge: true });
  };

  const handleMoveHandler = async (index: number, direction: 'up' | 'down') => {
    if (!firestore || !handlersRef) return;
    const newList = [...handlerOptions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    const [movedItem] = newList.splice(index, 1);
    newList.splice(targetIndex, 0, movedItem);
    await setDocumentNonBlocking(handlersRef, { names: newList }, { merge: true });
  };

  const handleAddReporterType = async () => {
    if (!firestore || !newReporterTypeName.trim() || !reporterTypesRef) return;
    const updatedList = [...reporterTypeOptions, newReporterTypeName.trim()];
    await setDocumentNonBlocking(reporterTypesRef, { names: updatedList }, { merge: true });
    setNewReporterTypeName('');
  };

  const handleRemoveReporterType = async (item: string) => {
    if (!firestore || !reporterTypesRef) return;
    const updatedList = reporterTypeOptions.filter(x => x !== item);
    await setDocumentNonBlocking(reporterTypesRef, { names: updatedList }, { merge: true });
  };

  const handleMoveReporterType = async (index: number, direction: 'up' | 'down') => {
    if (!firestore || !reporterTypesRef) return;
    const newList = [...reporterTypeOptions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    const [movedItem] = newList.splice(index, 1);
    newList.splice(targetIndex, 0, movedItem);
    await setDocumentNonBlocking(reporterTypesRef, { names: newList }, { merge: true });
  };

  const isUploading = Object.keys(uploadProgress).length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm bg-gray-100 dark:bg-gray-900">
        <div className="flex-shrink-0 px-4 py-1.5 border-b flex justify-between items-center bg-gray-200/60 dark:bg-gray-800/60">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="font-semibold text-xs">{viewedMelding ? `Melding: ${viewedMelding.intakenummer}` : `Melding : ${meldingsnummer}`}</h1>
            </div>
            <div className="flex justify-end gap-2">
                {isReadOnly ? (
                    <div className='flex gap-2'>
                        <Button type="button" variant="outline" onClick={() => router.back()} className="h-8">Sluiten</Button>
                        {canEditStatus && (
                            <Button type="submit" form="new-melding-form" disabled={isSubmitting || isUploading} className="h-8">
                                {isSubmitting || isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Wijzigingen Opslaan
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        <Button type="button" variant="ghost" onClick={resetFormForNewMelding} className="h-8">Annuleren</Button>
                        <Button type="submit" form="new-melding-form" disabled={isSubmitting || isUploading} className="h-8">
                            {isSubmitting || isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Melding Opslaan
                        </Button>
                    </>
                )}
            </div>
        </div>
        <Form {...form}>
          <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
             <div className="p-3 grid grid-cols-12 gap-4">
               {/* Left Column */}
               <div className="col-span-7 h-full flex flex-col gap-4">
                    <Card className="bg-gray-50 dark:bg-gray-800/30 p-2 flex flex-col h-full">
                        <CardHeader className="p-1 pb-1 flex-row justify-between items-start">
                           <CardTitle className="font-semibold text-xs">Algemene Informatie</CardTitle>
                           <div className="text-right text-xs text-muted-foreground">
                                Laatst gewijzigd door {viewedMelding ? viewedMelding.aangenomen_door : profile?.displayName || '...'} op {format(new Date(viewedMelding?.datum || now), 'dd-MM-yyyy')} om {viewedMelding?.tijdstip || format(now, 'HH:mm:ss')}.
                            </div>
                        </CardHeader>
                        <div className="space-y-0.5 p-1 flex-1">
                            <FormRow label="Meldingsnummer">
                                <Input value={viewedMelding ? viewedMelding.intakenummer : meldingsnummer} disabled className="h-7 text-xs"/>
                            </FormRow>
                            <FormRow label="Soort melder">
                                <div className="flex items-center">
                                    <FormField control={form.control} name="soort_melder" render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                            <FormControl><SelectTrigger className="h-7 text-xs rounded-r-none"><SelectValue placeholder="Selecteer melder" /></SelectTrigger></FormControl>
                                            <SelectContent>{reporterTypeOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                        </Select>
                                    )} />
                                    <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0" disabled={isReadOnly} onClick={() => setIsManageReporterTypesOpen(true)}><Search className="h-4 w-4"/></Button>
                                </div>
                            </FormRow>
                            <FormRow label="Hoofdindeling">
                                <div className="flex items-center">
                                    <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                            <FormControl><SelectTrigger className="h-7 text-xs rounded-r-none"><SelectValue placeholder="Selecteer categorie" /></SelectTrigger></FormControl>
                                            <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                        </Select>
                                    )} />
                                     <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0" disabled={isReadOnly} onClick={() => setIsManageCategoriesOpen(true)}><Search className="h-4 w-4"/></Button>
                                </div>
                            </FormRow>
                            <FormRow label="Indeling">
                                <div className="flex items-center">
                                    <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={!watchedHoofdcategorie || isReadOnly}>
                                        <FormControl><SelectTrigger className="h-7 text-xs rounded-r-none"><SelectValue placeholder="Selecteer indeling" /></SelectTrigger></FormControl>
                                        <SelectContent>{(subcategorieMapping[watchedHoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                    </Select>
                                )} />
                                <Button 
                                    type="button" 
                                    size="icon" 
                                    variant="outline" 
                                    className="h-7 w-7 rounded-l-none border-l-0" 
                                    disabled={isReadOnly} 
                                    onClick={() => {
                                        setManageSubSelectedCategory(watchedHoofdcategorie || hoofdcategorieOptions[0] || '');
                                        setIsManageSubcategoriesOpen(true);
                                    }}
                                >
                                    <Search className="h-4 w-4"/>
                                </Button>
                            </div>
                            </FormRow>
                            <FormRow label="Behandelende afdeling">
                                <div className="flex items-center">
                                    <FormField control={form.control} name="behandelende_afdeling" render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                            <FormControl><SelectTrigger className="h-7 text-xs rounded-r-none"><SelectValue placeholder="Selecteer afdeling" /></SelectTrigger></FormControl>
                                            <SelectContent>{departmentOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                        </Select>
                                    )} />
                                    <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0" disabled={isReadOnly} onClick={() => setIsManageDepartmentsOpen(true)}><Search className="h-4 w-4"/></Button>
                                </div>
                            </FormRow>
                            <FormRow label="Behandelaar">
                                <div className="flex items-center">
                                    <FormField control={form.control} name="behandelaar" render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isReadOnly}>
                                            <FormControl><SelectTrigger className="h-7 text-xs rounded-r-none"><SelectValue placeholder="Selecteer behandelaar" /></SelectTrigger></FormControl>
                                            <SelectContent>{handlerOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                        </Select>
                                    )} />
                                    <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0" disabled={isReadOnly} onClick={() => setIsManageHandlersOpen(true)}><Search className="h-4 w-4"/></Button>
                                </div>
                            </FormRow>
                            <FormRow label="Status">
                                <div className="flex items-center">
                                    <FormField control={form.control} name="status" render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly && !canEditStatus}>
                                            <FormControl><SelectTrigger className="h-7 text-xs rounded-r-none"><SelectValue placeholder="Selecteer status" /></SelectTrigger></FormControl>
                                            <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                        </Select>
                                    )} />
                                    <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0" disabled={isReadOnly && !canEditStatus} onClick={() => setIsManageStatusesOpen(true)}><Search className="h-4 w-4"/></Button>
                                </div>
                            </FormRow>
                            <FormRow label="Afgehandeld door">
                                <FormField control={form.control} name="afgehandeld_door" render={({ field }) => (
                                    <FormControl><Input {...field} className="h-7 text-xs" disabled /></FormControl>
                                )} />
                            </FormRow>
                            <FormRow label="Afhandeldatum">
                                <div className="flex gap-2 items-center">
                                    <FormField control={form.control} name="afhandeling_datum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} disabled /></FormControl>)} />
                                    <FormField control={form.control} name="afhandeling_tijdstip" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} disabled /></FormControl>)} />
                                </div>
                            </FormRow>
                            {viewedMelding?.gewerkteMinuten !== undefined && (
                                <FormRow label="Duur">
                                    <Input value={`${viewedMelding.gewerkteMinuten} minuten`} disabled className="h-7 text-xs"/>
                                </FormRow>
                            )}
                            <FormRow label="Voorvaldatum">
                                <div className="flex gap-2 items-center">
                                    <FormField control={form.control} name="voorvaldatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} /></FormControl>)} />
                                    <FormField control={form.control} name="voorvaltijd" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} disabled={isReadOnly} /></FormControl>)} />
                                </div>
                            </FormRow>
                            <FormRow label="Meldingsdatum">
                                <div className="flex gap-2 items-center">
                                    <FormField control={form.control} name="meldingsdatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} /></FormControl>)} />
                                    <FormField control={form.control} name="meldingsuur" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} disabled={isReadOnly} /></FormControl>)} />
                                </div>
                            </FormRow>
                            <FormRow label="Actiedatum">
                            <FormField control={form.control} name="actiedatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} /></FormControl>)} />
                            </FormRow>
                        </div>
                        <div className="p-1 pt-2 border-t mt-2">
                            <FormField
                                control={form.control}
                                name="extra_informatie"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs">Memo</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                {...field}
                                                className="resize-none h-full text-xs"
                                                rows={4}
                                                disabled={isReadOnly}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                   </Card>
               </div>

               {/* Right Column */}
                <div className="col-span-5 space-y-2">
                    <Card className='p-2 bg-gray-50 dark:bg-gray-800/30'>
                        <CardHeader className="p-1 pb-1">
                            <CardTitle className="font-semibold text-xs">Soort Melding</CardTitle>
                        </CardHeader>
                        <div className="space-y-0.5 p-1">
                            <FormRow label="Soort melding">
                                <FormField control={form.control} name="soort_melding" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
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
                                <FormField control={form.control} name="ext_referentie" render={({ field }) => (
                                <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl>
                            )} />
                            </FormRow>
                        </div>
                    </Card>
                    <div className='p-2 border rounded-md bg-gray-50 dark:bg-gray-800/30 space-y-1'>
                        <h3 className="font-semibold text-xs mb-2">Adresgegevens</h3>
                        <div className="relative">
                            <FormItem>
                                <FormLabel className="text-xs">Zoek Adres</FormLabel>
                                <div className="relative flex items-center">
                                    <Input
                                        placeholder="Straat, plaats, of postcode"
                                        className="h-7 text-xs"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        disabled={isReadOnly}
                                        autoComplete="off"
                                    />
                                    {isSearching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                                </div>
                            </FormItem>
                            {addressSuggestions.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    {addressSuggestions.map((suggestion) => (
                                        <div
                                            key={suggestion.id}
                                            className="px-4 py-2 text-sm cursor-pointer hover:bg-muted"
                                            onClick={() => handleSuggestionClick(suggestion)}
                                        >
                                            {suggestion.place_name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                             <FormField control={form.control} name="straatnaam" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='text-xs'>Straatnaam</FormLabel>
                                    <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl>
                                </FormItem>
                            )} />
                             <FormField control={form.control} name="nummer" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='text-xs'>Nummer</FormLabel>
                                    <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl>
                                </FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <FormField control={form.control} name="postcode" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='text-xs'>Postcode</FormLabel>
                                    <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl>
                                </FormItem>
                            )} />
                             <FormField control={form.control} name="plaats" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='text-xs'>Plaats</FormLabel>
                                    <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl>
                                </FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <FormField control={form.control} name="wijk" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='text-xs'>Wijk</FormLabel>
                                    <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl>
                                </FormItem>
                            )} />
                             <FormField control={form.control} name="werkgebied" render={({ field }) => (
                                <FormItem>
                                <FormLabel className='text-xs'>Werkgebied</FormLabel>
                                <FormControl><Input {...field} className="h-7 text-xs" disabled /></FormControl>
                                </FormItem>
                            )} />
                        </div>
                    </div>

                    <div className='p-2 border rounded-md bg-gray-50 dark:bg-gray-800/30 space-y-1'>
                        <h3 className="font-semibold text-xs mb-2">Medewerker / Melder</h3>
                        <FormRow label="Medewerker intake">
                             <div className="flex items-center">
                                <Input value={viewedMelding ? viewedMelding.aangenomen_door : profile?.displayName || profile?.email || ''} disabled className="h-7 text-xs" />
                            </div>
                        </FormRow>
                        <FormRow label="Naam melder">
                             <FormField control={form.control} name="melder" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl> )} />
                        </FormRow>
                        <FormRow label="Telefoon melder">
                            <FormField control={form.control} name="telefoon_melder" render={({ field }) => ( <FormControl><Input type="tel" {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl> )} />
                        </FormRow>
                        <FormRow label="E-mail melder">
                             <FormField control={form.control} name="email_melder" render={({ field }) => ( <FormControl><Input type="email" {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl> )} />
                        </FormRow>
                        <FormRow label="Burgerservicenummer">
                            <FormField control={form.control} name="burgerservicenummer" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" disabled={isReadOnly} /></FormControl> )} />
                        </FormRow>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 px-3 pb-3">
                 <Tabs defaultValue="locatie" className="flex-1 flex flex-col min-h-0">
                    <TabsList>
                        {viewedMelding?.afhandeling_bijzonderheden && (
                            <TabsTrigger value="opmerkingen">Opmerkingen</TabsTrigger>
                        )}
                        <TabsTrigger value="documenten">Documenten</TabsTrigger>
                        <TabsTrigger value="fotos">Foto's</TabsTrigger>
                        <TabsTrigger value="locatie">Locatie</TabsTrigger>
                    </TabsList>
                    {viewedMelding?.afhandeling_bijzonderheden && (
                        <TabsContent value="opmerkingen" className="flex-1 mt-1">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Opmerkingen bij afronding</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm whitespace-pre-wrap">{viewedMelding.afhandeling_bijzonderheden}</p>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                    <TabsContent value="documenten" className="flex-1 mt-1">
                        {isReadOnly ? (
                            uploadedFiles.length > 0 ? (
                                <div className="border rounded-md max-h-full overflow-y-auto">
                                    {uploadedFiles.map((file) => (
                                        <div
                                            key={file.storagePath}
                                            className="grid grid-cols-[1fr_auto] gap-4 items-center px-2 py-1 border-b last:border-b-0"
                                        >
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate flex items-center gap-2 hover:underline text-xs">
                                                <FileIcon className="h-4 w-4 shrink-0" /> {file.name}
                                            </a>
                                            <span className='text-xs text-muted-foreground'>{formatBytes(file.size)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-sm text-muted-foreground p-4">Geen documenten.</p>
                        ) : (
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
                        )}
                    </TabsContent>
                    <TabsContent value="fotos" className="flex-1 mt-1">
                       {isReadOnly ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-base">Foto's van Melding</h3>
                                    {uploadedPhotos.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {uploadedPhotos.map(photo => (
                                                <a key={photo.storagePath} href={photo.url} target="_blank" rel="noopener noreferrer" className="relative group aspect-square">
                                                    <Image src={photo.url} alt={photo.name} fill className="object-cover rounded-md" />
                                                </a>
                                            ))}
                                        </div>
                                    ) : <p className="text-sm text-muted-foreground pt-2">Geen foto's.</p>}
                                </div>
                            </div>
                        ) : (
                           <div className="h-full flex flex-col gap-4 p-1">
                                <div className="grid grid-cols-2 gap-3 flex-shrink-0">
                                    <div
                                        className={cn(
                                            "border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors min-h-[120px]",
                                            isDraggingPhoto && "bg-muted/50 border-primary"
                                        )}
                                        onDragEnter={() => setIsDraggingPhoto(true)}
                                        onDragLeave={() => setIsDraggingPhoto(false)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={handlePhotoDrop}
                                        onClick={() => document.getElementById('fotos-file-input')?.click()}
                                    >
                                        <UploadCloud className="h-8 w-8 text-muted-foreground" />
                                        <p className="mt-2 text-[10px] font-black uppercase tracking-tight text-slate-900">Galerij</p>
                                    </div>

                                    <div
                                        className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors min-h-[120px]"
                                        onClick={() => document.getElementById('fotos-camera-input')?.click()}
                                    >
                                        <Camera className="h-8 w-8 text-muted-foreground" />
                                        <p className="mt-2 text-[10px] font-black uppercase tracking-tight text-slate-900">Foto maken</p>
                                    </div>
                                </div>
                                
                                <input
                                    type="file"
                                    id="fotos-file-input"
                                    onChange={handlePhotoFileChange}
                                    className="hidden"
                                    multiple
                                    disabled={isUploading}
                                    accept="image/*"
                                />
                                <input
                                    type="file"
                                    id="fotos-camera-input"
                                    onChange={handlePhotoFileChange}
                                    className="hidden"
                                    disabled={isUploading}
                                    accept="image/*"
                                    capture="environment"
                                />
                                
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
                                                className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-2 border-b last:border-b-0"
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
                        )}
                    </TabsContent>
                    <TabsContent value="locatie" className="flex-1 mt-1 flex flex-col min-h-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                        <div className="border rounded-md overflow-hidden h-full">
                            <MapboxView
                                longitude={location?.longitude}
                                latitude={location?.latitude}
                                objects={nearbyObjects}
                                interactive={!isReadOnly}
                            />
                        </div>
                        <div className="border rounded-md flex flex-col min-h-0">
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
                </Tabs>
            </div>
          </form>
        </Form>

        {/* Dialog for Managing Statuses */}
        <Dialog open={isManageStatusesOpen} onOpenChange={setIsManageStatusesOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Statussen beheren</DialogTitle>
                    <DialogDescription>Voeg nieuwe statussen toe aan the lijst of verwijder bestaande.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input 
                            placeholder="Nieuwe status..." 
                            value={newStatusName} 
                            onChange={(e) => setNewStatusName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                        />
                        <Button onClick={handleAddStatus} size="icon">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                        {statusOptions.map((opt: string, index: number) => (
                            <div key={opt} className="flex justify-between items-center p-2 border-b last:border-b-0">
                                <span className="text-sm flex-1">{opt}</span>
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveStatus(index, 'up')}
                                        disabled={index === 0}
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveStatus(index, 'down')}
                                        disabled={index === statusOptions.length - 1}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveStatus(opt)}>
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setIsManageStatusesOpen(false)}>Sluiten</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Dialog for Managing Reporter Types */}
        <Dialog open={isManageReporterTypesOpen} onOpenChange={setIsManageReporterTypesOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Soort melder beheren</DialogTitle>
                    <DialogDescription>Voeg nieuwe soorten melders toe aan de lijst of verwijder bestaande.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input 
                            placeholder="Nieuw soort melder..." 
                            value={newReporterTypeName} 
                            onChange={(e) => setNewReporterTypeName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddReporterType()}
                        />
                        <Button onClick={handleAddReporterType} size="icon">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                        {reporterTypeOptions.map((opt: string, index: number) => (
                            <div key={opt} className="flex justify-between items-center p-2 border-b last:border-b-0">
                                <span className="text-sm flex-1">{opt}</span>
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveReporterType(index, 'up')}
                                        disabled={index === 0}
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveReporterType(index, 'down')}
                                        disabled={index === reporterTypeOptions.length - 1}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveReporterType(opt)}>
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setIsManageReporterTypesOpen(false)}>Sluiten</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Dialog for Managing Main Categories */}
        <Dialog open={isManageCategoriesOpen} onOpenChange={setIsManageCategoriesOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Hoofdindelingen beheren</DialogTitle>
                    <DialogDescription>Voeg nieuwe categorieën toe aan de lijst of verwijder bestaande.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input 
                            placeholder="Nieuwe categorie..." 
                            value={newCategoryName} 
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                        />
                        <Button onClick={handleAddCategory} size="icon">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                        {hoofdcategorieOptions.map((opt: string, index: number) => (
                            <div key={opt} className="flex justify-between items-center p-2 border-b last:border-b-0">
                                <span className="text-sm flex-1">{opt}</span>
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveCategory(index, 'up')}
                                        disabled={index === 0}
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveCategory(index, 'down')}
                                        disabled={index === hoofdcategorieOptions.length - 1}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveCategory(opt)}>
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setIsManageCategoriesOpen(false)}>Sluiten</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Dialog for Managing Subcategories */}
        <Dialog open={isManageSubcategoriesOpen} onOpenChange={setIsManageSubcategoriesOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Indelingen beheren</DialogTitle>
                    <DialogDescription>Beheer the indelingen voor een specifieke hoofdindeling.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Hoofdindeling</Label>
                        <Select value={manageSubSelectedCategory} onValueChange={setManageSubSelectedCategory}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecteer hoofdindeling" />
                            </SelectTrigger>
                            <SelectContent>
                                {hoofdcategorieOptions.map(opt => (
                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <Label>Nieuwe Indeling voor {manageSubSelectedCategory}</Label>
                        <div className="flex gap-2">
                            <Input 
                                placeholder="Nieuwe indeling..." 
                                value={newSubcategoryName} 
                                onChange={(e) => setNewSubcategoryName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddSubcategory()}
                                disabled={!manageSubSelectedCategory}
                            />
                            <Button onClick={handleAddSubcategory} size="icon" disabled={!manageSubSelectedCategory}>
                                <PlusCircle className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="border rounded-md max-h-60 overflow-y-auto">
                        {manageSubSelectedCategory && (subcategorieMapping[manageSubSelectedCategory] || []).map((sub: string, index: number) => (
                            <div key={sub} className="flex justify-between items-center p-2 border-b last:border-b-0">
                                <span className="text-sm flex-1">{sub}</span>
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveSubcategory(manageSubSelectedCategory, index, 'up')}
                                        disabled={index === 0}
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveSubcategory(manageSubSelectedCategory, index, 'down')}
                                        disabled={index === (subcategorieMapping[manageSubSelectedCategory] || []).length - 1}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveSubcategory(manageSubSelectedCategory, sub)}>
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {!manageSubSelectedCategory && (
                            <div className="p-4 text-center text-muted-foreground italic">Selecteer eerst een hoofdindeling.</div>
                        )}
                        {manageSubSelectedCategory && (!subcategorieMapping[manageSubSelectedCategory] || subcategorieMapping[manageSubSelectedCategory].length === 0) && (
                            <div className="p-4 text-center text-muted-foreground italic">Geen indelingen gevonden voor deze categorie.</div>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setIsManageSubcategoriesOpen(false)}>Sluiten</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Dialog for Managing Departments */}
        <Dialog open={isManageDepartmentsOpen} onOpenChange={setIsManageDepartmentsOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Behandelende afdelingen beheren</DialogTitle>
                    <DialogDescription>Voeg nieuwe afdelingen toe aan de lijst of verwijder bestaande.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input 
                            placeholder="Nieuwe afdeling..." 
                            value={newDepartmentName} 
                            onChange={(e) => setNewDepartmentName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddDepartment()}
                        />
                        <Button onClick={handleAddDepartment} size="icon">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                        {departmentOptions.map((dept: string, index: number) => (
                            <div key={dept} className="flex justify-between items-center p-2 border-b last:border-b-0">
                                <span className="text-sm flex-1">{dept}</span>
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveDepartment(index, 'up')}
                                        disabled={index === 0}
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveDepartment(index, 'down')}
                                        disabled={index === departmentOptions.length - 1}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveDepartment(dept)}>
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setIsManageDepartmentsOpen(false)}>Sluiten</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Dialog for Managing Handlers */}
        <Dialog open={isManageHandlersOpen} onOpenChange={setIsManageHandlersOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Behandelaars beheren</DialogTitle>
                    <DialogDescription>Voeg nieuwe behandelaars toe aan de lijst of verwijder bestaande.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input 
                            placeholder="Nieuwe behandelaar..." 
                            value={newHandlerName} 
                            onChange={(e) => setNewHandlerName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddHandler()}
                        />
                        <Button onClick={handleAddHandler} size="icon">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                        {handlerOptions.map((h: string, index: number) => (
                            <div key={h} className="flex justify-between items-center p-2 border-b last:border-b-0">
                                <span className="text-sm flex-1">{h}</span>
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveHandler(index, 'up')}
                                        disabled={index === 0}
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => handleMoveHandler(index, 'down')}
                                        disabled={index === handlerOptions.length - 1}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveHandler(h)}>
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setIsManageHandlersOpen(false)}>Sluiten</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}