'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2, File as FileIcon, Upload, MapPin, Camera, Package, Clock, Car, Plus, X, Pencil, FileText, ChevronLeft, User, Paperclip, PlusCircle, AlertCircle, Info, UploadCloud, Navigation } from 'lucide-react';
import { useFirestore, useFirebaseApp, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking, useCollection } from '@/firebase';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { format } from 'date-fns';
import Image from 'next/image';
import * as turf from '@turf/turf';
import Link from 'next/link';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from './ui/progress';
import { MapboxView } from './mapbox-view';
import type { Melding, UploadedFile, MeldingTask, Hoeveelheid, Object as MapObject } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { useUser } from '@/firebase';
import { nl } from 'date-fns/locale';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useToast } from './ui/use-toast';
import { cn } from '@/lib/utils';
import { useProject } from '@/context/project-context';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';


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

const werkbonNavItems = [
    { label: 'Werkzaamheden', icon: Pencil },
    { label: 'Locatiegegevens', icon: MapPin },
    { label: 'Documenten', icon: FileText },
    { label: 'Foto\'s', icon: Camera },
    { label: 'Hoeveelheid', icon: Package },
    { label: 'Uren', icon: Clock },
]


interface MeldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  melding?: Melding | null;
}

export function MeldingDialog({ open, onOpenChange, melding }: MeldingDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();
  const { selectedProjectId } = useProject();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const meldingIdRef = React.useRef(melding?.id);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);
  
  const [tasks, setTasks] = React.useState<MeldingTask[]>([]);
  const [newTaskDescription, setNewTaskDescription] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('Werkzaamheden');
  const afhandelingBijzonderhedenRef = React.useRef<HTMLTextAreaElement>(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = React.useState(false);
  const [isDraggingDocument, setIsDraggingDocument] = React.useState(false);

  const [hoeveelheden, setHoeveelheden] = React.useState<Hoeveelheid[]>([]);
  const [newHoeveelheidType, setNewHoeveelheidType] = React.useState('');
  const [newHoeveelheidAantal, setNewHoeveelheidAantal] = React.useState('');
  const [newHoeveelheidEenheid, setNewHoeveelheidEenheid] = React.useState('zak');
  const [gewerkteMinuten, setGewerkteMinuten] = React.useState<number>(0);

  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);
  const { data: allObjects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);

  const nearbyObjects = React.useMemo(() => {
    if (!melding || !allObjects) return [];
    
    const meldingPoint = turf.point([melding.longitude, melding.latitude]);
    
    return allObjects.filter(obj => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') {
        return false;
      }
      const objPoint = turf.point([obj.longitude, obj.latitude]);
      const distance = turf.distance(meldingPoint, objPoint, { units: 'meters' });
      return distance <= 100;
    }).sort((a, b) => {
        const distA = turf.distance(turf.point([melding.longitude, melding.latitude]), turf.point([a.longitude, a.latitude]));
        const distB = turf.distance(turf.point([melding.longitude, melding.latitude]), turf.point([b.longitude, b.latitude]));
        return distA - distB;
    });
  }, [melding, allObjects]);


  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });

  const hoofdcategorie = form.watch('hoofdcategorie');

  React.useEffect(() => {
    if (open) {
      meldingIdRef.current = melding?.id || doc(collection(firestore, 'temp')).id;
      setUploadedFiles(melding?.files || []);
      setUploadedPhotos(melding?.fotos || []);
      setLocation(melding ? { latitude: melding.latitude, longitude: melding.longitude } : null);
      setSearchQuery(melding ? `${melding.straatnaam || ''}, ${melding.plaats || ''}` : '');
      setSuggestions([]);
      setIsSearching(false);
      setTasks(melding?.tasks || []);
      setHoeveelheden(melding?.hoeveelheden || []);
      setGewerkteMinuten(melding?.gewerkteMinuten || 0);
      setActiveTab('Werkzaamheden');
      form.reset(
        melding
          ? {
              hoofdcategorie: melding.hoofdcategorie,
              subcategorie: melding.subcategorie,
              extra_informatie: melding.extra_informatie,
              status: melding.status,
              straatnaam: melding.straatnaam,
              plaats: melding.plaats,
              postcode: melding.postcode,
              afhandeling_bijzonderheden: melding.afhandeling_bijzonderheden || '',
            }
          : {
              hoofdcategorie: '',
              subcategorie: '',
              extra_informatie: '',
              status: 'Nieuw',
              straatnaam: '',
              plaats: '',
              postcode: '',
              afhandeling_bijzonderheden: '',
            }
      );
    } else {
      form.reset();
      setIsSubmitting(false);
      setUploadedFiles([]);
      setUploadedPhotos([]);
      setUploadProgress({});
      setLocation(null);
      setTasks([]);
      setNewTaskDescription('');
      setHoeveelheden([]);
      setNewHoeveelheidType('');
      setNewHoeveelheidAantal('');
      setNewHoeveelheidEenheid('zak');
      setGewerkteMinuten(0);
      setActiveTab('Werkzaamheden');
      setIsDraggingDocument(false);
    }
  }, [open, melding, form, firestore]);

  React.useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (justSelectedSuggestion.current) {
      justSelectedSuggestion.current = false;
      return;
    }

    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            searchQuery
          )}&format=json&addressdetails=1&countrycodes=nl&limit=5`
        );
        const data: Suggestion[] = await response.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Fout bij zoeken:", error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSuggestionClick = (suggestion: Suggestion) => {
    justSelectedSuggestion.current = true;
    setSearchQuery(suggestion.display_name);
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);

    if (!isNaN(lat) && !isNaN(lon)) {
      setLocation({ latitude: lat, longitude: lon });
      form.setValue('straatnaam', suggestion.address?.road || '');
      form.setValue('plaats', suggestion.address?.city || suggestion.address?.suburb || '');
      form.setValue('postcode', suggestion.address?.postcode || '');
    }
    setSuggestions([]);
  };

  const uploadFile = (file: File, meldingId: string): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) {
            reject(new Error("Firebase app niet beschikbaar"));
            return;
        }
        const storage = getStorage(app);
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFileName = `${new Date().getTime()}-${sanitizedFileName}`;
        const storagePath = `meldingen/${meldingId}/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(prev => ({...prev, [uniqueFileName]: progress}));
        }, (error) => {
            console.error('Upload mislukt:', error);
            setUploadProgress(prev => { const newProgress = {...prev}; delete newProgress[uniqueFileName]; return newProgress; });
            reject(error);
        }, async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({ name: file.name, url: downloadURL, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath: storagePath });
            setUploadProgress(prev => { const newProgress = {...prev}; delete newProgress[uniqueFileName]; return newProgress; });
        });
    });
  };
  
  const uploadPhoto = (file: File, meldingId: string): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) {
            reject(new Error("Firebase app niet beschikbaar"));
            return;
        }
        const storage = getStorage(app);
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFileName = `${new Date().getTime()}-${sanitizedFileName}`;
        const storagePath = `meldingen/${meldingId}/photos/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(prev => ({...prev, [uniqueFileName]: progress}));
        }, (error) => {
            console.error('Upload mislukt:', error);
            setUploadProgress(prev => { const newProgress = {...prev}; delete newProgress[uniqueFileName]; return newProgress; });
            reject(error);
        }, async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({ name: file.name, url: downloadURL, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath: storagePath });
            setUploadProgress(prev => { const newProgress = {...prev}; delete newProgress[uniqueFileName]; return newProgress; });
        });
    });
  };

  const handleDocumentFiles = async (files: FileList | null) => {
    if (!files || !meldingIdRef.current) return;
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, meldingIdRef.current);
        setUploadedFiles(prev => [...prev, uploadedFile]);
      } catch (error) { 
        console.error(`Kon ${file.name} niet uploaden.`, error); 
        toast({
          variant: "destructive",
          title: "Upload mislukt",
          description: `Bestand ${file.name} kon niet worden geüpload.`,
        });
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleDocumentFiles(event.target.files);
  };
  
  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files || !meldingIdRef.current) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast({
          variant: 'destructive',
          title: 'Ongeldig bestandstype',
          description: `${file.name} is geen afbeelding en is overgeslagen.`,
        });
        continue;
      }
      try {
        const uploadedFile = await uploadPhoto(file, meldingIdRef.current);
        setUploadedPhotos(prev => [...prev, uploadedFile]);
      } catch (error) { 
        console.error(`Kon ${file.name} niet uploaden.`, error); 
      }
    }
  };

  const handlePhotoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handlePhotoFiles(event.target.files);
  };

  const handleFileDelete = async (fileToDelete: UploadedFile) => {
    if (!app) return;
    const storage = getStorage(app);
    try {
      await deleteObject(ref(storage, fileToDelete.storagePath));
      setUploadedFiles((prev) => prev.filter((f) => f.storagePath !== fileToDelete.storagePath));
    } catch (error: any) {
      console.error('Kon bestand niet verwijderen:', error);
      if (error.code === 'storage/object-not-found') {
        setUploadedFiles((prev) =>
          prev.filter((f) => f.storagePath !== fileToDelete.storagePath)
        );
      }
    }
  };
  
  const handlePhotoFileDelete = async (fileToDelete: UploadedFile) => {
    if (!app) return;
    const storage = getStorage(app);
    try {
      await deleteObject(ref(storage, fileToDelete.storagePath));
      setUploadedPhotos((prev) => prev.filter((f) => f.storagePath !== fileToDelete.storagePath));
    } catch (error: any) {
      console.error('Kon foto niet verwijderen:', error);
      if (error.code === 'storage/object-not-found') {
        setUploadedPhotos((prev) =>
          prev.filter((f) => f.storagePath !== fileToDelete.storagePath)
        );
      }
    }
  };

  const handleDocumentDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDocument(true);
  };

  const handleDocumentDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDocument(false);
  };

  const handleDocumentDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDocument(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleDocumentFiles(e.dataTransfer.files);
    }
  };

  const handlePhotoDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPhoto(true);
  };

  const handlePhotoDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPhoto(false);
  };

  const handlePhotoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPhoto(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handlePhotoFiles(e.dataTransfer.files);
    }
  };
  
  const saveTasks = async () => {
    if (!firestore || !meldingIdRef.current) return;
    const meldingRef = doc(firestore, 'meldingen', meldingIdRef.current);
    await updateDocumentNonBlocking(meldingRef, { tasks: tasks });
  };
  
  const handleAddTask = () => {
    if (newTaskDescription.trim() === '') return;
    const newTask: MeldingTask = {
      id: new Date().toISOString(),
      description: newTaskDescription,
      completed: false,
    };
    setTasks([...tasks, newTask]);
    setNewTaskDescription('');
  };
  
  const handleToggleTask = (taskId: string) => {
    setTasks(tasks.map(task => 
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };
  
  const handleTaskDescriptionChange = (taskId: string, newDescription: string) => {
    setTasks(tasks.map(task => 
      task.id === taskId ? { ...task, description: newDescription } : task
    ));
  };
  
  const handleRemoveTask = (taskId: string) => {
    setTasks(tasks.filter(task => task.id !== taskId));
  };
  
  React.useEffect(() => {
    if (open && melding) { // Only auto-save on existing meldingen
        const timer = setTimeout(() => {
            saveTasks();
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [tasks, open, melding]);

  const handleAddHoeveelheid = () => {
    if (!newHoeveelheidType.trim() || !newHoeveelheidAantal.trim()) return;
    const aantal = parseFloat(newHoeveelheidAantal.replace(',', '.'));
    if (isNaN(aantal)) return;

    const newHoeveelheid: Hoeveelheid = {
        id: new Date().toISOString(),
        type: newHoeveelheidType,
        aantal: aantal,
        eenheid: newHoeveelheidEenheid,
    };
    setHoeveelheden(prev => [...prev, newHoeveelheid]);
    setNewHoeveelheidType('');
    setNewHoeveelheidAantal('');
  };

  const handleRemoveHoeveelheid = (id: string) => {
      setHoeveelheden(prev => prev.filter(h => h.id !== id));
  };


  const onSubmit = async (data: MeldingFormValues) => {
    if (!firestore || !location || !user) {
        alert("Selecteer een locatie op de kaart.");
        return;
    }
    setIsSubmitting(true);
    const meldingId = melding?.id || meldingIdRef.current;
    if (!meldingId) return;

    const now = new Date();

    const meldingData = {
      ...data,
      latitude: location.latitude,
      longitude: location.longitude,
      files: uploadedFiles,
      fotos: uploadedPhotos,
      tasks: tasks,
      hoeveelheden: hoeveelheden,
      gewerkteMinuten: gewerkteMinuten,
      updatedAt: serverTimestamp(),
    };

    const meldingRef = doc(firestore, 'meldingen', meldingId);
    try {
      if (melding) {
        await updateDocumentNonBlocking(meldingRef, meldingData);
      } else {
        const newMeldingData = {
            ...meldingData,
            intakenummer: `M${format(now, 'yyyyMMddHHmmss')}`,
            datum: format(now, 'yyyy-MM-dd'),
            tijdstip: format(now, 'HH:mm:ss'),
            melder: user.displayName || user.email || 'Onbekend',
            aangenomen_door: user.displayName || user.email || 'Onbekend',
            createdAt: serverTimestamp(),
        };
        await setDocumentNonBlocking(meldingRef, newMeldingData, {});
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan melding:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleAfronden = async () => {
    if (!firestore || !melding?.id || !user) return;
    setIsSubmitting(true);
    const meldingRef = doc(firestore, 'meldingen', melding.id);
    try {
        await updateDocumentNonBlocking(meldingRef, {
            status: 'Afgerond',
            afhandeling_datum: format(new Date(), 'yyyy-MM-dd'),
            afgehandeld_door: user.displayName || user.email || 'Onbekend',
            afhandeling_bijzonderheden: afhandelingBijzonderhedenRef.current?.value,
            files: uploadedFiles,
            fotos: uploadedPhotos,
            tasks: tasks,
            hoeveelheden: hoeveelheden,
            gewerkteMinuten: gewerkteMinuten,
        });
        onOpenChange(false);
    } catch (error) {
        console.error("Fout bij afronden melding:", error);
    } finally {
        setIsSubmitting(false);
    }
  }


   const handleDelete = async () => {
    if (!firestore || !melding?.id || !app) return;
    setIsDeleting(true);
    try {
      if (melding.files && melding.files.length > 0) {
        const storage = getStorage(app);
        for (const file of melding.files) {
          if (file.storagePath) {
            await deleteObject(ref(storage, file.storagePath)).catch((error) => console.error(`Kon bestand ${file.storagePath} niet verwijderen:`, error));
          }
        }
      }
      if (melding.fotos && melding.fotos.length > 0) {
        const storage = getStorage(app);
        for (const file of melding.fotos) {
          if (file.storagePath) {
            await deleteObject(ref(storage, file.storagePath)).catch((error) => console.error(`Kon foto ${file.storagePath} niet verwijderen:`, error));
          }
        }
      }
      await deleteDocumentNonBlocking(doc(firestore, 'meldingen', melding.id));
      onOpenChange(false);
    } catch (error) {
      console.error("Fout bij het verwijderen van de melding:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const isUploading = Object.keys(uploadProgress).length > 0;

  if (!melding) {
    // --- RENDER CREATION FORM DIALOG ---
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Nieuwe Melding</DialogTitle>
                    <DialogDescription>
                      Selecteer een locatie op de kaart en vul de details in.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    <div className="space-y-4">
                        <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Hoofdcategorie*</FormLabel>
                              <Select onValueChange={(value) => { field.onChange(value); form.setValue('subcategorie', ''); }} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecteer een hoofdcategorie" /></SelectTrigger></FormControl>
                                <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                              </Select>
                              <FormMessage />
                          </FormItem>
                        )} />
                        
                        <FormField control={form.control} name="subcategorie" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Subcategorie*</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!hoofdcategorie}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Selecteer een subcategorie" /></SelectTrigger></FormControl>
                              <SelectContent>{(subcategorieOptions[hoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Omschrijving*</FormLabel>
                                <FormControl><Textarea rows={5} placeholder="Omschrijf de melding..." {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        
                        <div className='space-y-2'>
                            <FormLabel>Foto's</FormLabel>
                            <Button type="button" variant="outline" disabled={isUploading || isSubmitting} onClick={() => document.getElementById('melding-photo-input-create')?.click()}>
                                <Upload className="mr-2 h-4 w-4" /> Upload een foto
                            </Button>
                            <input type="file" id="melding-photo-input-create" onChange={handlePhotoFileChange} className="hidden" multiple accept="image/*" />
                             {Object.entries(uploadProgress).map(([name, progress]) => (
                              <div key={name} className="space-y-1 mt-2">
                                <p className="text-sm font-medium">{name}</p>
                                <Progress value={progress} className="h-2 mt-1" />
                              </div>
                            ))}
                            {uploadedPhotos.length > 0 && (
                                <div className='border rounded-md p-2 max-h-32 overflow-auto space-y-2'>
                                    {uploadedPhotos.map(file => (
                                        <div key={file.storagePath} className="flex items-center justify-between text-sm">
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline flex items-center gap-2">
                                                <FileIcon className='h-4 w-4 shrink-0'/> {file.name}
                                            </a>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePhotoFileDelete(file)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <FormItem>
                            <FormLabel>Locatie*</FormLabel>
                            <div className="relative w-full">
                                <Input placeholder="Zoek een adres..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoComplete="off" />
                                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                                {suggestions.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                        {suggestions.map((suggestion) => (
                                        <div key={suggestion.place_id} onClick={() => handleSuggestionClick(suggestion)} className="px-4 py-2 text-sm cursor-pointer hover:bg-muted">{suggestion.display_name}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className='aspect-video w-full border rounded-md overflow-hidden mt-2'>
                                <MapboxView longitude={location?.longitude} latitude={location?.latitude} />
                            </div>
                        </FormItem>
                    </div>
                    <DialogFooter className="md:col-span-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuleren</Button>
                        <Button type="submit" disabled={isSubmitting || isUploading || !location}>
                          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aanmaken...</> : 'Melding Aanmaken'}
                        </Button>
                    </DialogFooter>
                  </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
  }

  // --- RENDER WERKBON VIEW ---
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 h-screen w-screen max-w-full flex flex-col">
         <DialogHeader className="p-4 border-b bg-gray-100 dark:bg-gray-800 flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <DialogClose asChild>
                <Button variant="ghost" size="icon" className="text-gray-700 dark:text-gray-300">
                    <ChevronLeft className="h-6 w-6" />
                </Button>
            </DialogClose>
          </div>
          <DialogTitle className="text-xl font-semibold absolute left-1/2 -translate-x-1/2">{activeTab}</DialogTitle>
          <Button
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
              onClick={handleAfronden}
              disabled={isSubmitting}
          >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'WERKBON AFRONDEN'}
          </Button>
        </DialogHeader>

        <div className={cn("flex-1 grid grid-cols-1 min-h-0 bg-slate-50 dark:bg-slate-900/50", activeTab === 'Locatiegegevens' ? 'grid-rows-1' : 'md:grid-cols-[360px_1fr]')}>
            <aside className={cn("bg-white dark:bg-card p-6 flex flex-col gap-6 border-r overflow-y-auto", activeTab === 'Locatiegegevens' && 'hidden')}>
                <div className="flex items-start justify-between gap-4">
                    <h3 className="font-bold text-lg">{`Werkbon: ${melding.intakenummer}`}</h3>
                </div>
                <nav className="flex flex-col gap-1">
                    {werkbonNavItems.map(item => (
                        <Button 
                            key={item.label}
                            variant={activeTab === item.label ? 'secondary' : 'ghost'}
                            className="justify-between items-center h-12 text-base"
                            onClick={() => setActiveTab(item.label)}
                        >
                          <div className="flex items-center gap-3">
                              <item.icon className="h-5 w-5 text-primary" />
                              <span>{item.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.label === 'Documenten' && uploadedFiles.length > 0 && (
                                <Badge variant="secondary">{uploadedFiles.length}</Badge>
                            )}
                            {item.label === 'Foto\'s' && uploadedPhotos.length > 0 && (
                                <Badge variant="secondary">{uploadedPhotos.length}</Badge>
                            )}
                            {item.label === 'Werkzaamheden' && tasks.length > 0 && <Badge variant="secondary">{tasks.filter(t => !t.completed).length}</Badge>}
                          </div>
                        </Button>
                    ))}
                </nav>
            </aside>
            
             <main className={cn("p-6 flex flex-col", activeTab !== 'Locatiegegevens' && "overflow-y-auto")}>
                {activeTab === 'Werkzaamheden' && (
                    <div className="space-y-6">
                        <div>
                            <Label className="text-sm font-semibold text-gray-500">Werkomschrijving / Melding</Label>
                            <p className="mt-1">{melding.extra_informatie}</p>
                        </div>
                        <div>
                            <Label className="text-sm font-semibold text-gray-500">Uitgevoerde werkzaamheden</Label>
                            <Textarea 
                                ref={afhandelingBijzonderhedenRef}
                                placeholder="Vul werkzaamheden in" 
                                defaultValue={melding.afhandeling_bijzonderheden}
                                className="mt-1 bg-white"
                            />
                        </div>
                        <div className="space-y-3">
                            {tasks.map(task => (
                                <div key={task.id} className="group flex items-center gap-3 p-3 bg-white dark:bg-background rounded-lg shadow-sm">
                                    <Checkbox
                                        id={`task-${task.id}`}
                                        checked={task.completed}
                                        onCheckedChange={() => handleToggleTask(task.id)}
                                        className="h-6 w-6 rounded-full"
                                    />
                                    <div className="flex-1">
                                        <Input
                                            value={task.description}
                                            onChange={(e) => handleTaskDescriptionChange(task.id, e.target.value)}
                                            className="border-none p-0 h-auto focus-visible:ring-0 text-base bg-transparent"
                                        />
                                    </div>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => handleRemoveTask(task.id)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="ghost" className="text-orange-600 hover:text-orange-700" onClick={handleAddTask}>
                            <PlusCircle className="mr-2 h-5 w-5" />
                            Voeg taak toe
                        </Button>
                    </div>
                )}
                {activeTab === 'Locatiegegevens' && (
                  <div className="h-full w-full relative">
                    <MapboxView
                      longitude={melding.longitude}
                      latitude={melding.latitude}
                      objects={nearbyObjects}
                    />
                     <div className="absolute top-4 left-4 z-10 space-y-2 w-80">
                        <Collapsible defaultOpen={false}>
                            <CollapsibleTrigger asChild>
                                <Button className="w-full justify-start shadow-md">
                                    <Info className="mr-2 h-4 w-4" />
                                    Locatie Details
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <Card className="mt-2 shadow-lg">
                                <CardContent className="p-4 pt-4">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <div className="font-semibold text-muted-foreground col-span-2">Adres</div>
                                    <div className="font-medium col-span-2">{`${melding.straatnaam || ''}, ${melding.postcode || ''} ${melding.plaats || ''}`}</div>
                                    <div className="font-semibold text-muted-foreground">Wijk</div>
                                    <div className="font-medium">{melding.wijk || '-'}</div>
                                    <div className="font-semibold text-muted-foreground">Coördinaten</div>
                                    <div className="font-medium">{melding.latitude?.toFixed(5)}, {melding.longitude?.toFixed(5)}</div>
                                    </div>
                                </CardContent>
                                </Card>
                            </CollapsibleContent>
                        </Collapsible>
                        <Collapsible defaultOpen={false}>
                            <CollapsibleTrigger asChild>
                                <Button className="w-full justify-start shadow-md">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Objecten in de buurt ({nearbyObjects.length})
                                </Button>
                            </CollapsibleTrigger>
                             <CollapsibleContent>
                                <Card className="mt-2 shadow-lg">
                                <CardContent className="pt-4 p-4">
                                    <div className="max-h-48 overflow-y-auto pr-2">
                                    {isLoadingObjects ? (
                                        <p className="text-sm text-muted-foreground">Objecten laden...</p>
                                    ) : nearbyObjects.length > 0 ? (
                                        <ul className="space-y-2">
                                        {nearbyObjects.map(obj => (
                                            <li key={obj.id} className="text-sm flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                                                <span>{obj.id} ({obj.locatieSubType || 'Onbekend type'})</span>
                                            </div>
                                            <Badge variant="outline">{Math.round(turf.distance(turf.point([melding.longitude, melding.latitude]), turf.point([obj.longitude, obj.latitude]), { units: 'meters' }))}m</Badge>
                                            </li>
                                        ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Geen objecten gevonden.</p>
                                    )}
                                    </div>
                                </CardContent>
                                </Card>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                  </div>
                )}
                {activeTab === 'Documenten' && (
                    <Card>
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle>Documenten</CardTitle>
                            <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('melding-document-input')?.click()} disabled={isUploading}>
                                <Upload className="mr-2 h-4 w-4" /> Toevoegen
                            </Button>
                            <input type="file" id="melding-document-input" onChange={handleFileChange} className="hidden" multiple />
                        </CardHeader>
                        <CardContent
                            className="relative"
                            onDragOver={handleDocumentDragOver}
                            onDragLeave={handleDocumentDragLeave}
                            onDrop={handleDocumentDrop}
                        >
                            {isDraggingDocument && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 border-2 border-dashed border-primary rounded-md">
                                    <UploadCloud className="h-12 w-12 text-primary" />
                                    <p className="mt-2 text-lg font-semibold text-primary">Sleep bestanden hierheen</p>
                                </div>
                            )}
                            {Object.entries(uploadProgress).map(([name, progress]) => (
                                <div key={name} className="mt-2">
                                    <p className="text-sm font-medium">{name}</p>
                                    <Progress value={progress} className="h-2 mt-1" />
                                </div>
                            ))}
                            <div className="mt-4 space-y-2">
                                {uploadedFiles.length > 0 ? (
                                    uploadedFiles.map(file => (
                                        <div key={file.storagePath} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded-md">
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline flex items-center gap-2">
                                                <FileIcon className='h-4 w-4 shrink-0' /> {file.name}
                                            </a>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleFileDelete(file)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-sm text-muted-foreground text-center py-4 flex flex-col items-center justify-center">
                                        <FileText className="h-10 w-10 text-gray-400 mb-2" />
                                        <p>Geen documenten toegevoegd. Sleep ze hierheen of klik op 'Toevoegen'.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}
                 {activeTab === 'Foto\'s' && (
                    <Card>
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle>Foto's</CardTitle>
                            <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('melding-photo-input')?.click()} disabled={isUploading}>
                                <Upload className="mr-2 h-4 w-4" /> Foto's toevoegen
                            </Button>
                            <input type="file" id="melding-photo-input" onChange={handlePhotoFileChange} className="hidden" multiple accept="image/*" />
                        </CardHeader>
                        <CardContent
                            className="relative"
                            onDragOver={handlePhotoDragOver}
                            onDragLeave={handlePhotoDragLeave}
                            onDrop={handlePhotoDrop}
                        >
                            {isDraggingPhoto && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 border-2 border-dashed border-primary rounded-md">
                                <UploadCloud className="h-12 w-12 text-primary" />
                                <p className="mt-2 text-lg font-semibold text-primary">Sleep foto's hierheen</p>
                            </div>
                            )}
                            {Object.entries(uploadProgress).map(([name, progress]) => (
                                <div key={name} className="mt-2">
                                    <p className="text-sm font-medium">{name}</p>
                                    <Progress value={progress} className="h-2 mt-1" />
                                </div>
                            ))}
                            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {uploadedPhotos.length > 0 ? (
                                    uploadedPhotos.map(file => (
                                        <div key={file.storagePath} className="relative group aspect-square">
                                            <Image src={file.url} alt={file.name} fill className="object-cover rounded-md" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Button type="button" variant="destructive" size="icon" className="h-8 w-8" onClick={() => handlePhotoFileDelete(file)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-sm text-muted-foreground text-center py-4 col-span-full flex flex-col items-center justify-center">
                                        <Camera className="h-10 w-10 text-gray-400 mb-2" />
                                        <p>Geen foto's toegevoegd. Sleep ze hierheen of klik op 'Foto's toevoegen'.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}
                 {activeTab === 'Hoeveelheid' && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Geregistreerde Hoeveelheden</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                {hoeveelheden.length > 0 ? (
                                    hoeveelheden.map(h => (
                                        <div key={h.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm">
                                            <span className="font-medium">{h.type}</span>
                                            <div className="flex items-center gap-2">
                                                <span>{h.aantal} {h.eenheid}</span>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveHoeveelheid(h.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">Nog geen hoeveelheden geregistreerd.</p>
                                )}
                            </div>

                            <div className="border-t pt-4">
                                <h4 className="font-semibold mb-2">Nieuwe hoeveelheid toevoegen</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
                                    <div>
                                        <Label htmlFor="type" className="sr-only">Type</Label>
                                        <Input id="type" placeholder="Type (bv. Zwerfafval)" value={newHoeveelheidType} onChange={e => setNewHoeveelheidType(e.target.value)} />
                                    </div>
                                    <div>
                                        <Label htmlFor="aantal" className="sr-only">Aantal</Label>
                                        <Input id="aantal" type="number" placeholder="Aantal" value={newHoeveelheidAantal} onChange={e => setNewHoeveelheidAantal(e.target.value)} />
                                    </div>
                                    <div>
                                        <Label htmlFor="eenheid" className="sr-only">Eenheid</Label>
                                        <Select value={newHoeveelheidEenheid} onValueChange={setNewHoeveelheidEenheid}>
                                            <SelectTrigger id="eenheid">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="zak">zak(ken)</SelectItem>
                                                <SelectItem value="m³">m³</SelectItem>
                                                <SelectItem value="kg">kg</SelectItem>
                                                <SelectItem value="stuks">stuks</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button type="button" onClick={handleAddHoeveelheid}>
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
                 {activeTab === 'Uren' && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Urenregistratie</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="gewerkte-minuten">Totaal gewerkte minuten</Label>
                                <Input
                                    id="gewerkte-minuten"
                                    type="number"
                                    value={gewerkteMinuten}
                                    onChange={e => setGewerkteMinuten(Number(e.target.value))}
                                    placeholder="Voer minuten in"
                                    className="mt-1"
                                />
                                <p className="text-sm text-muted-foreground mt-2">
                                    Voer het totale aantal minuten in dat aan deze melding is besteed.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
