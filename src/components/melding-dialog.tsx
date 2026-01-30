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
import { Separator } from './ui/separator';
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
  const isReadOnly = !!melding && false; // Future use for read-only roles
  const [activeTab, setActiveTab] = React.useState('Werkzaamheden');


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl p-0 h-screen w-screen max-w-full top-0 left-0 translate-x-0 translate-y-0 rounded-none flex flex-col">
        <DialogHeader className="p-4 border-b">
           <DialogTitle className="flex justify-between items-center">
            Werkbon: {melding?.intakenummer || 'Nieuw'}
            <DialogClose asChild>
                <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </DialogClose>
          </DialogTitle>
          <DialogDescription className='truncate'>
            {melding?.straatnaam}, {melding?.plaats} | Melder: {melding?.melder} | Categorie: {melding?.hoofdcategorie} &gt; {melding?.subcategorie}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[250px_1fr] min-h-0">
            {/* Sidebar */}
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
            
            {/* Main Content */}
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

    