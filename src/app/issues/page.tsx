'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer, FillLayer, LineLayer } from 'react-map-gl';
import { useCollection, useFirestore, useFirebaseApp, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, doc, serverTimestamp, writeBatch, query, where } from 'firebase/firestore';
import { Calendar as CalendarIcon, Plus, Search, List, Map as MapIcon, Bell, Filter, Navigation, Pencil, FileText, ChevronLeft, Camera, Package, Clock, User, Paperclip, PlusCircle, AlertCircle, Info, UploadCloud, ChevronDown, MapPin, Trash2, ArrowLeft, File as FileIcon, Loader2, Maximize, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as turf from '@turf/turf';
import type { Wijk, Melding, UploadedFile, MeldingTask, Hoeveelheid, Object as MapObject } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, isSameDay, startOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useProfile } from '@/firebase/profile-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProject } from '@/context/project-context';
import Link from 'next/link';
import { useIsMobile } from '@/hooks/use-mobile';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Upload } from 'lucide-react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import Image from 'next/image';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { MapboxView } from '@/components/mapbox-view';
import { useUser } from '@/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigationUI } from '@/context/navigation-ui-context';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingScreen } from '@/components/loading-screen';


type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
};


const werkbonNavItems = [
    { label: 'Werkzaamheden', icon: Pencil },
    { label: 'Opmerkingen', icon: FileText },
    { label: 'Locatiegegevens', icon: MapPin },
    { label: 'Documenten', icon: FileText },
    { label: "Foto's", icon: Camera },
    { label: 'Hoeveelheid', icon: Package },
    { label: 'Uren', icon: Clock },
]

interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
  address: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    suburb?: string;
  };
}

const meldingFormSchema = z.object({
  hoofdcategorie: z.string().min(1, 'Hoofdcategorie is verplicht'),
  subcategorie: z.string().min(1, 'Subcategorie is verplicht'),
  extra_informatie: z.string().min(1, 'Omschrijving is verplicht'),
  status: z.string().min(1, 'Status is verplicht'),
  straatnaam: z.string().optional(),
  plaats: z.string().optional(),
  postcode: z.string().optional(),
  afhandeling_bijzonderheden: z.string().optional(),
});

type MeldingFormValues = z.infer<typeof meldingFormSchema>;

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
const hoofdcategorieOptions = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig"];
const subcategorieOptions: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Verstopte put", "Wateroverlast"],
    "Overig": ["Overige meldingen"]
};

export default function IssuesPage() {
  const { setIsHeaderVisible } = useNavigationUI();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  
  React.useEffect(() => {
    setIsHeaderVisible(false);
    return () => {
      setIsHeaderVisible(true);
    };
  }, [setIsHeaderVisible]);

  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [selectedMeldingId, setSelectedMeldingId] = React.useState<string | null>(null);

  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const { profile } = useProfile();
  
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const [addressSearchQuery, setAddressSearchQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);
  
  const [tasks, setTasks] = React.useState<MeldingTask[]>([]);
  const [newTaskDescription, setNewTaskDescription] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('Werkzaamheden');
  const [isDraggingPhoto, setIsDraggingPhoto] = React.useState(false);
  const [isDraggingDocument, setIsDraggingDocument] = React.useState(false);

  const [hoeveelheden, setHoeveelheden] = React.useState<Hoeveelheid[]>([]);
  const [newHoeveelheidType, setNewHoeveelheidType] = React.useState('');
  const [newHoeveelheidAantal, setNewHoeveelheidAantal] = React.useState('');
  const [newHoeveelheidEenheid, setNewHoeveelheidEenheid] = React.useState('zak');
  const [highlightedObject, setHighlightedObject] = React.useState<MapObject | null>(null);
  const [elapsedTime, setElapsedTime] = React.useState<string>("0 uur en 0 minuten");
  const [mainPhoto, setMainPhoto] = React.useState<UploadedFile | null>(null);
  const [afhandelingFotos, setAfhandelingFotos] = React.useState<UploadedFile[]>([]);
  const [isDraggingAfhandelingPhoto, setIsDraggingAfhandelingPhoto] = React.useState(false);
  const [fullScreenPhoto, setFullScreenPhoto] = React.useState<UploadedFile | null>(null);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'not-in', ['Afgerond', 'Nieuw', 'Niet in beheer'])
    );
  }, [firestore]);

  const projectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: meldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenQuery);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);

  const objectsCollection = useMemoFirebase(() => {
    if (!firestore || !selectedMeldingId) return null;
    return collection(firestore, 'objects');
  }, [firestore, selectedMeldingId]);
  const { data: allObjects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);

  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });
  
  const canDeleteFile = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';

  const selectedMelding = React.useMemo(() => {
    return meldingen?.find(m => m.id === selectedMeldingId);
  }, [meldingen, selectedMeldingId]);

  const nearbyObjects = React.useMemo(() => {
    if (!selectedMelding || !allObjects) return [];
    const meldingPoint = turf.point([selectedMelding.longitude, selectedMelding.latitude]);
    return allObjects.filter(obj => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
      const objPoint = turf.point([obj.longitude, obj.latitude]);
      return turf.distance(meldingPoint, objPoint, { units: 'meters' }) <= 100;
    }).sort((a, b) => turf.distance(turf.point([selectedMelding.longitude, selectedMelding.latitude]), turf.point([a.longitude, a.latitude])) - turf.distance(turf.point([selectedMelding.longitude, selectedMelding.latitude]), turf.point([b.longitude, b.latitude])));
  }, [selectedMelding, allObjects]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    const projectIdFromParam = searchParams.get('projectId');
    if (projectIdFromParam && projectIdFromParam !== selectedProjectId) {
      setSelectedProjectId(projectIdFromParam);
    }
  }, [searchParams, selectedProjectId, setSelectedProjectId]);

  const selectedProject = React.useMemo(() => projects?.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
  const sortedWijken = React.useMemo(() => !selectedProject?.wijken ? [] : [...selectedProject.wijken].sort((a, b) => a.naam.localeCompare(b.naam, undefined, { numeric: true, sensitivity: 'base' })), [selectedProject?.wijken]);

  React.useEffect(() => {
    if (profile?.wijk && sortedWijken.length > 0) {
      const userWijk = sortedWijken.find(w => w.naam === profile.wijk);
      setSelectedWijkId(userWijk ? userWijk.id : null);
    }
  }, [profile, sortedWijken]);

  const filteredMeldingen = React.useMemo(() => {
    if (!meldingen) return [];
    
    let timeFilteredMeldingen = selectedDate ? meldingen.filter(m => {
      try {
        const creationDate = startOfDay(new Date(m.datum));
        const dayStart = startOfDay(selectedDate);
        return creationDate <= dayStart;
      } catch (e) { return false; }
    }) : meldingen;

    const searchedMeldingen = debouncedSearchQuery ? timeFilteredMeldingen.filter(m => {
      const query = debouncedSearchQuery.toLowerCase();
      return ['intakenummer', 'extern_meldingsnummer', 'straatnaam', 'plaats', 'postcode', 'subcategorie', 'hoofdcategorie', 'melder', 'extra_informatie', 'wijk', 'status', 'aangenomen_door', 'afgehandeld_door'].some(field => (m as any)[field]?.toLowerCase().includes(query));
    }) : timeFilteredMeldingen;

    searchedMeldingen.sort((a, b) => {
        try {
            const dateA = new Date(`${a.datum}T${a.tijdstip || '00:00'}`).getTime();
            const dateB = new Date(`${b.datum}T${b.tijdstip || '00:00'}`).getTime();
            if (isNaN(dateA) || isNaN(dateB)) return 0;
            return dateA - dateB;
        } catch (e) {
            return 0;
        }
    });

    return searchedMeldingen;
  }, [meldingen, selectedDate, debouncedSearchQuery]);

  React.useEffect(() => {
    if (filteredMeldingen.length > 0 && !selectedMeldingId) {
      const idFromUrl = searchParams.get('id');
      if (idFromUrl && filteredMeldingen.find(m => m.id === idFromUrl)) {
        setSelectedMeldingId(idFromUrl);
      } else {
        setSelectedMeldingId(filteredMeldingen[0].id);
      }
    } else if (filteredMeldingen.length === 0) {
      setSelectedMeldingId(null);
    }
  }, [filteredMeldingen, selectedMeldingId, searchParams]);
  
  React.useEffect(() => {
    const melding = meldingen?.find(m => m.id === selectedMeldingId);
    if (melding) {
      const initialFotos = melding.fotos || [];
      setUploadedFiles(melding.files || []);
      setUploadedPhotos(initialFotos);
      setAfhandelingFotos(melding.afhandeling_fotos || []);
      setMainPhoto(initialFotos.length > 0 ? initialFotos[0] : null);
      setLocation({ latitude: melding.latitude, longitude: melding.longitude });
      setAddressSearchQuery(`${melding.straatnaam || ''}, ${melding.plaats || ''}`);
      setSuggestions([]);
      setIsSearching(false);
      setTasks(melding.tasks || []);
      setHoeveelheden(melding.hoeveelheden || []);
      setActiveTab('Werkzaamheden');
      setHighlightedObject(null);
      form.reset({
        hoofdcategorie: melding.hoofdcategorie,
        subcategorie: melding.subcategorie,
        extra_informatie: melding.extra_informatie,
        status: melding.status,
        straatnaam: melding.straatnaam,
        plaats: melding.plaats,
        postcode: melding.postcode,
        afhandeling_bijzonderheden: melding.afhandeling_bijzonderheden || '',
      });
    }
  }, [selectedMeldingId, meldingen, form]);
  
  React.useEffect(() => {
    if (!selectedMelding) {
      setElapsedTime("0 uur en 0 minuten");
      return;
    }

    if (selectedMelding.workStartedAt) {
      const interval = setInterval(() => {
        const startTime = new Date(selectedMelding.workStartedAt!).getTime();
        const now = Date.now();
        const minutesSinceStart = Math.floor((now - startTime) / (1000 * 60));
        const totalMinutes = (selectedMelding.gewerkteMinuten || 0) + minutesSinceStart;
        
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        setElapsedTime(`${hours} uur en ${minutes} minuten`);
      }, 1000); 

      return () => clearInterval(interval);
    } else {
      const totalMinutes = selectedMelding.gewerkteMinuten || 0;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setElapsedTime(`${hours} uur en ${minutes} minuten`);
    }
  }, [selectedMelding]);

  const handleStartWork = async () => {
    if (!firestore || !selectedMelding?.id) return;
    const meldingRef = doc(firestore, 'meldingen', selectedMelding.id);
    try {
        await updateDocumentNonBlocking(meldingRef, {
            workStartedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error starting work:", error);
        toast({
            variant: "destructive",
            title: "Fout opgetreden",
            description: "Kon de werkbon niet starten.",
        });
    }
  };

  const handleAfronden = async () => {
    if (!firestore || !selectedMelding?.id || !user) return;
    
    const currentIndex = filteredMeldingen.findIndex(m => m.id === selectedMeldingId);
    
    setIsSubmitting(true);
    const meldingRef = doc(firestore, 'meldingen', selectedMelding.id);
    const afhandeling_bijzonderheden_value = form.getValues('afhandeling_bijzonderheden');

    let minutesWorked = selectedMelding.gewerkteMinuten || 0;
    if (selectedMelding.workStartedAt) {
      const startTime = new Date(selectedMelding.workStartedAt).getTime();
      const endTime = Date.now();
      minutesWorked += Math.round((endTime - startTime) / (1000 * 60));
    }

    try {
        await updateDocumentNonBlocking(meldingRef, {
            status: 'Afgerond',
            afhandeling_datum: format(new Date(), 'yyyy-MM-dd'),
            afhandeling_tijdstip: format(new Date(), 'HH:mm'),
            afgehandeld_door: profile?.displayName || user.displayName || user.email || 'Onbekend',
            afhandeling_bijzonderheden: afhandeling_bijzonderheden_value || null,
            files: uploadedFiles,
            afhandeling_fotos: afhandelingFotos,
            tasks: tasks,
            hoeveelheden: hoeveelheden,
            gewerkteMinuten: minutesWorked,
            workStartedAt: null, 
        });
        toast({
          title: 'Werkbon afgerond',
          description: `Melding ${selectedMelding.intakenummer} is afgerond.`,
        });

        const remainingMeldingen = filteredMeldingen.filter(m => m.id !== selectedMeldingId);

        if (remainingMeldingen.length > 0) {
            const nextIndex = Math.min(currentIndex, remainingMeldingen.length - 1);
            setSelectedMeldingId(remainingMeldingen[nextIndex].id);
        } else {
            setSelectedMeldingId(null);
        }
        
    } catch (error) {
        console.error("Fout bij afronden melding:", error);
        toast({
          variant: "destructive",
          title: 'Fout opgetreden',
          description: "Kon de werkbon niet afronden.",
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const uploadFile = React.useCallback((file: File, meldingId: string, type: 'documents' | 'photos' | 'afhandeling_fotos'): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) {
            reject(new Error("Firebase app not available"));
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
  }, [app]);

  const handleFileUploads = React.useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0 || !selectedMeldingId || !firestore) return;

    let currentFiles = [...uploadedFiles];
    
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, selectedMeldingId, 'documents');
        currentFiles.push(uploadedFile);
      } catch (error) {
        console.error(`Kon ${file.name} niet uploaden.`);
        toast({
            variant: "destructive",
            title: "Upload mislukt",
            description: `Bestand ${file.name} kon niet worden geüpload.`
        })
      }
    }
    
    setUploadedFiles(currentFiles);
    const meldingRef = doc(firestore, 'meldingen', selectedMeldingId);
    await updateDocumentNonBlocking(meldingRef, { files: currentFiles });
    toast({
        title: "Bestanden geüpload",
        description: "De documenten zijn succesvol toegevoegd aan de melding."
    });
  }, [selectedMeldingId, firestore, uploadFile, uploadedFiles, toast]);


  const handleFileChangeDocuments = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        handleFileUploads(event.target.files);
    }
  }, [handleFileUploads]);

  const handleFileDelete = async (fileToDelete: UploadedFile) => {
    if (!app || !firestore || !selectedMeldingId) return;

    const storage = getStorage(app);

    const fileRef = ref(storage, fileToDelete.storagePath);
    try {
      await deleteObject(fileRef);
      const newFiles = uploadedFiles.filter((f) => f.storagePath !== fileToDelete.storagePath);
      setUploadedFiles(newFiles);
      const meldingRef = doc(firestore, 'meldingen', selectedMeldingId);
      await updateDocumentNonBlocking(meldingRef, { files: newFiles });
       toast({
        title: "Bestand verwijderd",
        description: `${fileToDelete.name} is succesvol verwijderd.`
    });
    } catch (error: any) {
      console.error('Kon bestand niet verwijderen:', error);
       toast({
        variant: "destructive",
        title: "Verwijderen mislukt",
        description: error.message || "Kon het bestand niet verwijderen."
      });
      if (error.code === 'storage/object-not-found') {
        const newFiles = uploadedFiles.filter((f) => f.storagePath !== fileToDelete.storagePath);
        setUploadedFiles(newFiles);
        const meldingRef = doc(firestore, 'meldingen', selectedMeldingId);
        await updateDocumentNonBlocking(meldingRef, { files: newFiles });
      }
    }
  };
  
  const handleAfhandelingPhotoUploads = React.useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0 || !selectedMeldingId || !firestore) return;

    let currentPhotos = [...afhandelingFotos];
    
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, selectedMeldingId, 'afhandeling_fotos');
        currentPhotos.push(uploadedFile);
      } catch (error) {
        console.error(`Kon ${file.name} niet uploaden.`);
        toast({
            variant: "destructive",
            title: "Upload mislukt",
            description: `Foto ${file.name} kon niet worden geüpload.`
        })
      }
    }
    
    setAfhandelingFotos(currentPhotos);
    const meldingRef = doc(firestore, 'meldingen', selectedMeldingId);
    await updateDocumentNonBlocking(meldingRef, { afhandeling_fotos: currentPhotos });
    toast({
        title: "Foto's geüpload",
        description: "De foto's zijn succesvol toegevoegd aan de melding."
    });
  }, [selectedMeldingId, firestore, uploadFile, afhandelingFotos, toast]);

  const handleAfhandelingPhotoFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleAfhandelingPhotoUploads(event.target.files);
    }
  }, [handleAfhandelingPhotoUploads]);

  const handleAfhandelingPhotoDelete = async (photoToDelete: UploadedFile) => {
    if (!app || !firestore || !selectedMeldingId) return;

    const storage = getStorage(app);
    const photoRef = ref(storage, photoToDelete.storagePath);

    try {
      await deleteObject(photoRef);
      const newPhotos = afhandelingFotos.filter(p => p.storagePath !== photoToDelete.storagePath);
      setAfhandelingFotos(newPhotos);
      const meldingRef = doc(firestore, 'meldingen', selectedMeldingId);
      await updateDocumentNonBlocking(meldingRef, { afhandeling_fotos: newPhotos });
      toast({
        title: "Foto verwijderd",
        description: `${photoToDelete.name} is succesvol verwijderd.`
      });
    } catch (error: any) {
      console.error('Kon foto niet verwijderen:', error);
      toast({
        variant: "destructive",
        title: "Verwijderen mislukt",
        description: error.message || "Kon de foto niet verwijderen."
      });
      if (error.code === 'storage/object-not-found') {
        const newPhotos = afhandelingFotos.filter(p => p.storagePath !== photoToDelete.storagePath);
        setAfhandelingFotos(newPhotos);
        const meldingRef = doc(firestore, 'meldingen', selectedMeldingId);
        await updateDocumentNonBlocking(meldingRef, { afhandeling_fotos: newPhotos });
      }
    }
  };

  const handleAddHoeveelheid = () => {
    if (!newHoeveelheidType.trim() || !newHoeveelheidAantal.trim()) {
      toast({
        variant: "destructive",
        title: "Onvolledige invoer",
        description: "Vul aub een type en aantal in.",
      });
      return;
    }
    const aantal = parseFloat(newHoeveelheidAantal);
    if (isNaN(aantal) || aantal <= 0) {
      toast({
        variant: "destructive",
        title: "Ongeldig aantal",
        description: "Voer een geldig getal groter dan 0 in voor het aantal.",
      });
      return;
    }
    const newHoeveelheid: Hoeveelheid = {
      id: new Date().toISOString(),
      type: newHoeveelheidType,
      aantal: aantal,
      eenheid: newHoeveelheidEenheid,
    };

    setHoeveelheden(prev => [...prev, newHoeveelheid]);
    setNewHoeveelheidType('');
    setNewHoeveelheidAantal('');
    setNewHoeveelheidEenheid('zak');
  };

  const handleRemoveHoeveelheid = (id: string) => {
    setHoeveelheden(prev => prev.filter(item => item.id !== id));
  };


  if (isLoadingMeldingen || isLoadingProjects || (selectedMeldingId && isLoadingObjects)) {
      return <LoadingScreen message="Werkbonnen laden..." />;
  }
  
  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden text-sm bg-gray-100 dark:bg-gray-900">
        <header className="p-4 border-b bg-gray-50 dark:bg-gray-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0 gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
                 <Button variant="outline" size="icon" onClick={() => router.push('/')} className="shrink-0">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                 <Select value={selectedMeldingId || ''} onValueChange={setSelectedMeldingId}>
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue>
                        {filteredMeldingen.length > 0 ? `Meldingen (${filteredMeldingen.length})` : 'Geen meldingen'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {filteredMeldingen.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                                {m.intakenummer}: {m.extra_informatie.substring(0, 40)}...
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {selectedMelding ? (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {selectedProjectId && (
                  <Link href={`/navigation-module?projectId=${selectedProjectId}&lat=${selectedMelding.latitude}&lng=${selectedMelding.longitude}&straat=${encodeURIComponent(selectedMelding.straatnaam || '')}`} passHref>
                      <Button variant="outline" size="icon" className="h-9 w-9 bg-primary text-white hover:bg-primary/90 shadow-lg shadow-black/20">
                          <Navigation className="h-4 w-4" />
                      </Button>
                  </Link>
                  )}
                  {selectedMelding.workStartedAt ? (
                    <Button
                      className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-9 flex-1 sm:flex-none"
                      onClick={handleAfronden}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      WERKBON AFRONDEN
                    </Button>
                  ) : (
                    <Button
                      className="bg-green-500 hover:bg-green-600 text-white font-bold h-9 flex-1 sm:flex-none"
                      onClick={handleStartWork}
                      disabled={isSubmitting}
                    >
                      WERKBON STARTEN
                    </Button>
                  )}
              </div>
            ) : <div className="h-9" />}
        </header>
        
        {filteredMeldingen.length === 0 ? (
            <div className="p-6">
              <Card>
                <CardContent className="text-center p-6 pt-12">
                  <Bell className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
                  <p className="mt-4 text-lg font-black uppercase tracking-tight">Geen meldingen gevonden</p>
                  <p className="text-muted-foreground text-sm">Er zijn geen meldingen die overeenkomen met de huidige filters.</p>
                </CardContent>
              </Card>
            </div>
        ) : selectedMelding ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="px-4 md:px-6 pt-4 overflow-x-auto no-scrollbar">
                    <TabsList className="w-max inline-flex">
                        {werkbonNavItems.map(item => (
                            <TabsTrigger key={item.label} value={item.label} className="gap-2 shrink-0">
                                <item.icon className="h-4 w-4 shrink-0" />
                                <span>{item.label}</span>
                                {item.label === 'Documenten' && uploadedFiles.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{uploadedFiles.length}</Badge>}
                                {item.label === "Foto's" && (uploadedPhotos.length + afhandelingFotos.length) > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{uploadedPhotos.length + afhandelingFotos.length}</Badge>}
                                {item.label === 'Werkzaamheden' && tasks.length > 0 && tasks.filter(t => !t.completed).length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{tasks.filter(t => !t.completed).length}</Badge>}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <TabsContent value="Werkzaamheden" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="flex flex-col h-full min-h-[300px]">
                            <CardHeader className="p-4 border-b">
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Werkbon Details</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-4 p-4 pt-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 border-b pb-4">
                                <div className="space-y-1">
                                <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Intakenr:</p>
                                <p className="font-black text-sm">{selectedMelding.intakenummer}</p>
                                </div>
                                <div className="space-y-1">
                                <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Datum:</p>
                                <p className="font-black text-sm">{format(new Date(selectedMelding.datum), 'dd-MM-yy')} {selectedMelding.tijdstip}</p>
                                </div>
                                <div className="sm:col-span-2 space-y-1">
                                <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Adres:</p>
                                <p className="font-black text-sm leading-tight">{selectedMelding.straatnaam} {selectedMelding.huisnummer || ''}, {selectedMelding.postcode} {selectedMelding.plaats}</p>
                                </div>
                                <div className="space-y-1">
                                <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Melder:</p>
                                <p className="font-black text-sm">{selectedMelding.melder}</p>
                                </div>
                                <div className="space-y-1">
                                <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Containernr:</p>
                                <p className="font-black text-sm">{selectedMelding.containernummer || '-'}</p>
                                </div>
                            </div>
                            <div className="space-y-4 pt-2">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Hoofdindeling</p>
                                    <p className="text-xs font-black">{selectedMelding.hoofdcategorie}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Indeling</p>
                                    <p className="text-xs font-black">{selectedMelding.subcategorie}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Status</p>
                                    <p className="text-xs font-black">{selectedMelding.status}</p>
                                </div>
                                </div>
                                <div className="space-y-1">
                                <p className="text-muted-foreground font-bold uppercase text-[9px] tracking-widest">Omschrijving</p>
                                <p className="text-xs whitespace-pre-wrap font-medium leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 italic">{selectedMelding.extra_informatie}</p>
                                </div>
                            </div>
                            </CardContent>
                        </Card>
                        <div className='rounded-xl overflow-hidden border h-full min-h-[300px] lg:min-h-[400px] shadow-sm'>
                            <MapboxView latitude={selectedMelding.latitude} longitude={selectedMelding.longitude} objects={nearbyObjects} />
                        </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="Opmerkingen" className="mt-0">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Opmerkingen bij afronding</CardTitle>
                            </CardHeader>
                            <CardContent>
                            <Form {...form}>
                                <form>
                                <FormField
                                    control={form.control}
                                    name="afhandeling_bijzonderheden"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Textarea 
                                                    placeholder="Voeg een opmerking toe over de afhandeling..."
                                                    rows={isMobile ? 10 : 15}
                                                    {...field} 
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                </form>
                            </Form>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Locatiegegevens" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                <Collapsible defaultOpen>
                                    <CollapsibleTrigger className="w-full">
                                        <div className="flex flex-row items-center justify-between py-2 border-b">
                                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Locatie Details</h3>
                                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                        </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-3 p-4 pt-4 bg-white rounded-xl border mt-2">
                                            <div className="flex justify-between text-xs font-medium">
                                                <span className="text-muted-foreground uppercase tracking-tighter">Adres:</span>
                                                <span className="font-black text-right">{selectedMelding.straatnaam} {selectedMelding.huisnummer}</span>
                                            </div>
                                            <div className="flex justify-between text-xs font-medium">
                                                <span className="text-muted-foreground uppercase tracking-tighter">Postcode:</span>
                                                <span className="font-black text-right">{selectedMelding.postcode}</span>
                                            </div>
                                            <div className="flex justify-between text-xs font-medium">
                                                <span className="text-muted-foreground uppercase tracking-tighter">Plaats:</span>
                                                <span className="font-black text-right">{selectedMelding.plaats}</span>
                                            </div>
                                            <div className="flex justify-between text-xs font-medium">
                                                <span className="text-muted-foreground uppercase tracking-tighter">Werkgebied:</span>
                                                <span className="font-black text-right">{selectedMelding.werkgebied || '-'}</span>
                                            </div>
                                            <div className="flex justify-between text-xs font-medium">
                                                <span className="text-muted-foreground uppercase tracking-tighter">Coördinaten:</span>
                                                <span className="font-mono bg-slate-50 px-1 rounded">{selectedMelding.latitude.toFixed(5)}, {selectedMelding.longitude.toFixed(5)}</span>
                                            </div>
                                        </CardContent>
                                    </CollapsibleContent>
                                </Collapsible>
                                <Collapsible defaultOpen>
                                    <CollapsibleTrigger className="w-full">
                                        <div className="flex flex-row items-center justify-between py-2 border-b">
                                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Objecten in de buurt (100m)</h3>
                                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                        </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <CardContent className="p-0 pt-2">
                                            {nearbyObjects.length > 0 ? (
                                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                                    {nearbyObjects.slice(0, 8).map(obj => (
                                                        <div 
                                                            key={obj.id} 
                                                            className={cn(
                                                                "text-xs p-3 rounded-xl border transition-all cursor-pointer",
                                                                highlightedObject?.id === obj.id 
                                                                    ? "bg-primary text-white border-primary shadow-lg scale-[1.02]" 
                                                                    : "bg-white border-slate-100 hover:border-slate-200 shadow-sm"
                                                            )}
                                                            onClick={() => setHighlightedObject(obj)}
                                                        >
                                                             <div className="flex justify-between items-start">
                                                                <span className="font-black uppercase tracking-tight">{obj.id}</span>
                                                                {obj.vulgraad !== undefined && (
                                                                    <Badge variant="outline" className={cn("text-[9px] h-4", highlightedObject?.id === obj.id ? "border-white/30 text-white" : "text-primary border-primary/20")}>
                                                                        {obj.vulgraad}%
                                                                    </Badge>
                                                                )}
                                                             </div>
                                                             <p className={cn("text-[10px] mt-1 font-bold", highlightedObject?.id === obj.id ? "text-white/80" : "text-slate-400")}>{obj.straatnaam || ''} {obj.locatieSubType || ''}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-12 text-center text-muted-foreground bg-slate-50 rounded-xl border border-dashed">
                                                    <Info className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                                    <p className="text-[10px] font-black uppercase tracking-widest">Geen objecten gevonden.</p>
                                                </div>
                                            )}
                                        </CardContent>
                                    </CollapsibleContent>
                                </Collapsible>
                            </div>
                            <div className="min-h-[300px] lg:min-h-[400px] rounded-xl overflow-hidden border shadow-sm">
                                <MapboxView 
                                    latitude={selectedMelding.latitude} 
                                    longitude={selectedMelding.longitude} 
                                    objects={nearbyObjects} 
                                    highlightedObject={highlightedObject}
                                />
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="Documenten" className="mt-0">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Documenten</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Button variant="outline" className="w-full h-12 border-dashed border-2 font-bold uppercase text-[10px] tracking-widest" onClick={() => document.getElementById('document-file-input')?.click()}>
                                    <UploadCloud className="mr-2 h-4 w-4" /> Bestand uploaden
                                </Button>
                                <input
                                    type="file"
                                    id="document-file-input"
                                    onChange={handleFileChangeDocuments}
                                    className="hidden"
                                    multiple
                                />
                                
                                {Object.entries(uploadProgress).map(([name, progress]) => (
                                <div key={name} className="space-y-1 mt-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{name}</p>
                                    <Progress value={progress} className="w-full h-1.5" />
                                </div>
                                ))}
                                
                                {uploadedFiles.length > 0 && (
                                    <div className="border rounded-xl mt-4 divide-y">
                                    {uploadedFiles.map((file) => (
                                        <div
                                        key={file.storagePath}
                                        className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-3"
                                        >
                                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate flex items-center gap-3 hover:underline">
                                            <div className="bg-slate-100 p-2 rounded-lg"><FileIcon className="h-4 w-4 text-slate-500 shrink-0" /></div>
                                            <span className="text-xs font-black text-slate-900">{file.name}</span>
                                        </a>
                                        <span className='text-[10px] font-black text-slate-400 uppercase'>{formatBytes(file.size)}</span>
                                        {canDeleteFile && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-300 hover:text-red-600 hover:bg-red-50"
                                                disabled={isSubmitting}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Weet u zeker dat u het bestand "{file.name}" wilt verwijderen?
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleFileDelete(file)} className="bg-red-600">
                                                        Verwijderen
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                        )}
                                        </div>
                                    ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Foto's" className="mt-0">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="flex flex-col min-h-[300px] lg:min-h-[400px]">
                            <CardHeader className="p-4 border-b">
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Foto's van Melding</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col p-4 min-h-0">
                                {uploadedPhotos.length > 0 ? (
                                <div className="space-y-4 flex flex-col flex-1 min-h-0">
                                    <div
                                        className="w-full relative rounded-2xl overflow-hidden border group cursor-pointer h-48 lg:h-64 flex-shrink-0 bg-slate-50"
                                        onClick={() => mainPhoto && setFullScreenPhoto(mainPhoto)}
                                    >
                                    {mainPhoto ? (
                                        <>
                                        <Image src={mainPhoto.url} alt={mainPhoto.name} fill className="object-contain p-2" />
                                        <div className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Maximize className="h-10 w-10" />
                                        </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted-foreground text-[10px] font-black uppercase tracking-widest">Geen selectie</div>
                                    )}
                                    </div>
                                    {uploadedPhotos.length > 1 && (
                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                        {uploadedPhotos.map(photo => (
                                        <div
                                            key={photo.storagePath}
                                            className={cn(
                                            "relative shrink-0 w-16 h-16 rounded-xl overflow-hidden cursor-pointer border-2 transition-all",
                                            mainPhoto?.storagePath === photo.storagePath ? "border-primary scale-105 shadow-md" : "border-transparent opacity-70"
                                            )}
                                            onClick={() => setMainPhoto(photo)}
                                        >
                                            <Image src={photo.url} alt={photo.name} fill className="object-cover" />
                                        </div>
                                        ))}
                                    </div>
                                    )}
                                </div>
                                ) : (
                                <div className="flex h-full min-h-[200px] items-center justify-center text-center text-muted-foreground bg-slate-50 rounded-xl border border-dashed">
                                    <Camera className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Geen foto's</p>
                                </div>
                                )}
                            </CardContent>
                        </Card>
                        <Card className="flex flex-col min-h-[300px] lg:min-h-[400px]">
                          <CardHeader className="p-4 border-b">
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Foto's van Medewerker</CardTitle>
                          </CardHeader>
                          <CardContent className="flex-1 flex flex-col space-y-4 p-4 min-h-0">
                            <Button variant="outline" className="w-full h-12 border-dashed border-2 font-bold uppercase text-[10px] tracking-widest" onClick={() => document.getElementById('afhandeling-photo-file-input')?.click()}>
                                <Camera className="mr-2 h-4 w-4" /> Foto uploaden
                            </Button>
                            
                            <input
                                type="file"
                                id="afhandeling-photo-file-input"
                                onChange={handleAfhandelingPhotoFileChange}
                                className="hidden"
                                multiple
                                accept="image/*"
                            />
                            
                            {uploadProgress && Object.keys(uploadProgress).length > 0 && (
                                <div className="space-y-2">
                                    {Object.entries(uploadProgress).map(([name, progress]) => (
                                        <div key={name} className="space-y-1 mt-2">
                                            <p className="text-[10px] font-black uppercase text-slate-400">{name}</p>
                                            <Progress value={progress} className="w-full h-1.5" />
                                        </div>
                                    ))}
                                </div>
                            )}
                    
                            {afhandelingFotos.length > 0 && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 overflow-y-auto max-h-[300px] pr-1">
                                    {afhandelingFotos.map((photo) => (
                                    <div key={photo.storagePath} className="relative group aspect-square rounded-xl overflow-hidden border bg-slate-100 shadow-sm">
                                        <Image src={photo.url} alt={photo.name} fill className="object-cover" />
                                        <div
                                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                            onClick={() => setFullScreenPhoto(photo)}
                                        >
                                            <Maximize className="h-6 w-6 text-white" />
                                        </div>
                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button type="button" variant="destructive" size="icon" className="h-6 w-6 rounded-full" disabled={isSubmitting}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                                                        <AlertDialogDescription>Deze foto wordt permanent verwijderd.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleAfhandelingPhotoDelete(photo)} className="bg-red-600">Verwijderen</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                    ))}
                                </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                    <TabsContent value="Hoeveelheid" className="mt-0">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Geregistreerd Materiaal</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    {hoeveelheden.length > 0 ? (
                                        hoeveelheden.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold">
                                            <div className="flex-1 grid grid-cols-3 gap-2 items-center">
                                                <span className="font-black uppercase tracking-tight text-slate-900">{item.type}</span>
                                                <span className="text-primary">{item.aantal}</span>
                                                <span className="text-slate-400 uppercase tracking-widest text-[10px]">{item.eenheid}</span>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600 hover:bg-red-50" onClick={() => handleRemoveHoeveelheid(item.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        ))
                                    ) : (
                                        <div className="p-12 text-center text-muted-foreground bg-slate-50 rounded-xl border border-dashed">
                                            <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                            <p className="text-[10px] font-black uppercase tracking-widest">Geen materiaal geregistreerd</p>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col sm:flex-row items-end gap-3 border-t pt-6">
                                    <div className="flex-1 w-full space-y-1.5">
                                        <Label htmlFor="type" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Type Materiaal</Label>
                                        <Input id="type" placeholder="bv. Zwerfafval" value={newHoeveelheidType} onChange={(e) => setNewHoeveelheidType(e.target.value)} className="h-10" />
                                    </div>
                                    <div className="w-full sm:w-24 space-y-1.5">
                                        <Label htmlFor="aantal" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Aantal</Label>
                                        <Input id="aantal" type="number" placeholder="0" value={newHoeveelheidAantal} onChange={(e) => setNewHoeveelheidAantal(e.target.value)} className="h-10" />
                                    </div>
                                    <div className="w-full sm:w-32 space-y-1.5">
                                        <Label htmlFor="eenheid" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Eenheid</Label>
                                        <Select value={newHoeveelheidEenheid} onValueChange={setNewHoeveelheidEenheid}>
                                            <SelectTrigger id="eenheid" className="h-10 font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="zak">Zak</SelectItem>
                                                <SelectItem value="kg">Kg</SelectItem>
                                                <SelectItem value="stuks">Stuks</SelectItem>
                                                <SelectItem value="m3">m³</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button onClick={handleAddHoeveelheid} className="w-full sm:w-auto h-10 font-black uppercase tracking-tight">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Toevoegen
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="Uren" className="mt-0">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Urenregistratie</CardTitle>
                                <CardDescription className="text-xs font-medium">
                                    Totaal gewerkte tijd voor deze melding. De timer start als de werkbon wordt gestart.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                 <div className="space-y-2 bg-slate-50 p-6 rounded-2xl border border-slate-100 max-w-sm">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Geregistreerde tijd</Label>
                                    <div className="text-3xl font-black tabular-nums tracking-tighter text-slate-900">
                                        {elapsedTime}
                                    </div>
                                    {selectedMelding?.workStartedAt && (
                                        <div className="text-xs font-bold text-green-600 flex items-center gap-2 mt-2">
                                            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                                            Live registratie actief...
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        ) : (
            <LoadingScreen message="Werkbonnen laden..." />
        )}
        {fullScreenPhoto && (
            <Dialog open={!!fullScreenPhoto} onOpenChange={(open) => !open && setFullScreenPhoto(null)}>
                <DialogContent className="max-w-[95vw] h-auto max-h-[95vh] p-0 bg-black/90 border-0 shadow-2xl flex items-center justify-center overflow-hidden rounded-none">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Vergroting: {fullScreenPhoto.name}</DialogTitle>
                    </DialogHeader>
                    <Image 
                        src={fullScreenPhoto.url} 
                        alt={fullScreenPhoto.name}
                        width={1920}
                        height={1080}
                        className="object-contain w-auto h-auto max-w-full max-h-full"
                    />
                    <DialogClose className="absolute top-4 right-4 rounded-full bg-white/10 backdrop-blur-md p-2 text-white hover:bg-white/20 transition-all outline-none">
                        <X className="h-6 w-6" />
                    </DialogClose>
                </DialogContent>
            </Dialog>
        )}
    </div>
  );
}
