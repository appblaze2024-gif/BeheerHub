'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2, File as FileIcon, Upload, MapPin, Camera, Package, Clock, Car, Plus, X, Pencil, FileText } from 'lucide-react';
import { useFirestore, useFirebaseApp, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { format } from 'date-fns';

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
import type { Melding, UploadedFile, MeldingTask } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { useUser } from '@/firebase';
import { nl } from 'date-fns/locale';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

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
    { label: 'Materialen', icon: Package },
    { label: 'Uren', icon: Clock },
    { label: 'Kilometers / parkeerkosten', icon: Car },
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
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
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

  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });

  const hoofdcategorie = form.watch('hoofdcategorie');

  React.useEffect(() => {
    if (open) {
      meldingIdRef.current = melding?.id || doc(collection(firestore, 'temp')).id;
      setUploadedFiles(melding?.files || []);
      setLocation(melding ? { latitude: melding.latitude, longitude: melding.longitude } : null);
      setSearchQuery(melding ? `${melding.straatnaam || ''}, ${melding.plaats || ''}` : '');
      setSuggestions([]);
      setIsSearching(false);
      setTasks(melding?.tasks || []);
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
            }
          : {
              hoofdcategorie: '',
              subcategorie: '',
              extra_informatie: '',
              status: 'Nieuw',
              straatnaam: '',
              plaats: '',
              postcode: '',
            }
      );
    } else {
      form.reset();
      setIsSubmitting(false);
      setUploadedFiles([]);
      setUploadProgress({});
      setLocation(null);
      setTasks([]);
      setNewTaskDescription('');
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !meldingIdRef.current) return;
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, meldingIdRef.current);
        setUploadedFiles(prev => [...prev, uploadedFile]);
      } catch (error) { 
        console.error(`Kon ${file.name} niet uploaden.`, error); 
      }
    }
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
        setUploadedFiles((prev) => prev.filter((f) => f.storagePath !== fileToDelete.storagePath));
      }
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
      tasks: tasks,
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
  
   const handleDelete = async () => {
    if (!firestore || !melding?.id) return;
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
                            <Button type="button" variant="outline" disabled={isUploading || isSubmitting} onClick={() => document.getElementById('melding-file-input')?.click()}>
                                <Upload className="mr-2 h-4 w-4" /> Upload een foto
                            </Button>
                            <input type="file" id="melding-file-input" onChange={handleFileChange} className="hidden" multiple accept="image/*" />
                             {Object.entries(uploadProgress).map(([name, progress]) => (
                              <div key={name} className="space-y-1 mt-2">
                                <p className="text-sm font-medium">{name}</p>
                                <Progress value={progress} className="h-2 mt-1" />
                              </div>
                            ))}
                            {uploadedFiles.length > 0 && (
                                <div className='border rounded-md p-2 max-h-32 overflow-auto space-y-2'>
                                    {uploadedFiles.map(file => (
                                        <div key={file.storagePath} className="flex items-center justify-between text-sm">
                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline flex items-center gap-2">
                                                <FileIcon className='h-4 w-4 shrink-0'/> {file.name}
                                            </a>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleFileDelete(file)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
      <DialogContent className="p-0 h-screen w-screen max-w-full top-0 left-0 translate-x-0 translate-y-0 rounded-none flex flex-col">
        <DialogHeader className="p-4 border-b">
           <DialogTitle>Werkbon: {melding?.intakenummer || 'Nieuw'}</DialogTitle>
          <DialogDescription className='truncate'>
            {melding?.straatnaam}, {melding?.plaats} | Melder: {melding?.melder} | Categorie: {melding?.hoofdcategorie} &gt; {melding?.subcategorie}
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4 h-8 w-8">
                <X className="h-5 w-5" />
                <span className="sr-only">Sluiten</span>
            </Button>
        </DialogClose>
        
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[250px_1fr] min-h-0">
            <aside className='p-4 border-r flex flex-col justify-between'>
                <nav className="flex flex-col gap-1">
                    {werkbonNavItems.map(item => (
                        <Button 
                            key={item.label}
                            variant={activeTab === item.label ? 'secondary' : 'ghost'}
                            className="justify-start gap-2"
                            onClick={() => setActiveTab(item.label)}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Button>
                    ))}
                </nav>
                <Button size="lg">Werkbon afronden</Button>
            </aside>
            
            <main className="p-6 overflow-y-auto">
                 <h3 className="text-xl font-semibold mb-4">{melding?.extra_informatie}</h3>
                
                <div className="space-y-4">
                    <Label className="font-semibold text-base">Uitgevoerde werkzaamheden</Label>
                    <div className="space-y-2">
                        {tasks.map(task => (
                            <div key={task.id} className="flex items-center gap-2 group">
                                <Checkbox
                                    id={`task-${task.id}`}
                                    checked={task.completed}
                                    onCheckedChange={() => handleToggleTask(task.id)}
                                />
                                <Input
                                    value={task.description}
                                    onChange={(e) => handleTaskDescriptionChange(task.id, e.target.value)}
                                    className="flex-1 h-8"
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => handleRemoveTask(task.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive"/>
                                </Button>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Voeg nieuwe taak toe..."
                            value={newTaskDescription}
                            onChange={(e) => setNewTaskDescription(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                        />
                        <Button onClick={handleAddTask}><Plus className="h-4 w-4 mr-2" /> Voeg taak toe</Button>
                    </div>
                </div>
            </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
