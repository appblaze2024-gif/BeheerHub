'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2, File as FileIcon, Upload } from 'lucide-react';
import {
  useFirestore,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  useUser,
  useFirebaseApp,
  deleteDocumentNonBlocking,
  setDocumentNonBlocking
} from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
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
import type { Schouwing } from '@/lib/types';
import type { UploadedFile } from '@/lib/types';
import { Progress } from './ui/progress';
import { MapboxView } from './mapbox-view';
import Image from 'next/image';

const schouwFormSchema = z.object({
  inspecteur: z.string().min(1, 'Naam inspecteur is verplicht.'),
  opmerkingen: z.string().min(1, 'Opmerkingen zijn verplicht.'),
  status: z.enum(['Open', 'In behandeling', 'Afgerond']),
});

type SchouwFormValues = z.infer<typeof schouwFormSchema>;

interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
}

interface SchouwDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  schouwing?: Schouwing | null;
  onSuccess: () => void;
}

export function SchouwDialog({
  open,
  onOpenChange,
  projectId,
  schouwing,
  onSuccess,
}: SchouwDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);

  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const schouwingIdRef = React.useRef(schouwing?.id);

  const form = useForm<SchouwFormValues>({
    resolver: zodResolver(schouwFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      schouwingIdRef.current = schouwing?.id || doc(collection(firestore, 'temp')).id;
      setUploadedFiles(schouwing?.fotos || []);
      setLocation(schouwing ? { latitude: schouwing.latitude, longitude: schouwing.longitude } : null);
      setSearchQuery(schouwing ? `${schouwing.latitude.toFixed(6)}, ${schouwing.longitude.toFixed(6)}` : '');
      setSuggestions([]);
      setIsSearching(false);
      form.reset({
        inspecteur: schouwing?.inspecteur || user?.displayName || user?.email || '',
        opmerkingen: schouwing?.opmerkingen || '',
        status: schouwing?.status || 'Open',
      });
    } else {
      form.reset();
      setIsSubmitting(false);
      setIsDeleting(false);
      setUploadedFiles([]);
      setUploadProgress({});
      setLocation(null);
    }
  }, [open, schouwing, form, user, firestore]);
  
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
    }, 500); // 500ms debounce

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
    }
    setSuggestions([]);
  };

  const uploadFile = (file: File, schouwingId: string, projectId: string): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app || !projectId) {
            reject(new Error("Firebase app of project ID niet beschikbaar"));
            return;
        }
        const storage = getStorage(app);
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFileName = `${new Date().getTime()}-${sanitizedFileName}`;
        const storagePath = `projects/${projectId}/schouwingen/${schouwingId}/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({...prev, [uniqueFileName]: progress}));
            },
            (error) => {
                console.error('Upload mislukt:', error);
                setUploadProgress(prev => { const newProgress = {...prev}; delete newProgress[uniqueFileName]; return newProgress; });
                reject(error);
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    const newFile: UploadedFile = { name: file.name, url: downloadURL, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath: storagePath };
                    resolve(newFile);
                    setUploadProgress(prev => { const newProgress = {...prev}; delete newProgress[uniqueFileName]; return newProgress; });
                });
            }
        );
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !schouwingIdRef.current || !projectId) return;
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, schouwingIdRef.current, projectId);
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

  const onSubmit = async (data: SchouwFormValues) => {
    if (!firestore || !projectId || !location) {
        // Here you might want to show a toast message to the user to select a location
        return;
    }
    setIsSubmitting(true);
    const isEditing = !!schouwing?.id;
    const schouwingId = isEditing ? schouwing.id : schouwingIdRef.current;
    if (!schouwingId) return;

    const schouwingData = {
      ...data,
      projectId,
      latitude: location.latitude,
      longitude: location.longitude,
      datum: schouwing?.datum || new Date().toISOString(),
      fotos: uploadedFiles,
      updatedAt: serverTimestamp(),
    };

    const schouwingRef = doc(firestore, 'projects', projectId, 'schouwingen', schouwingId);
    try {
      if (isEditing) {
        await updateDocumentNonBlocking(schouwingRef, schouwingData);
      } else {
        await setDocumentNonBlocking(schouwingRef, { ...schouwingData, createdAt: serverTimestamp() }, {});
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan schouwing:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
   const handleDelete = async () => {
    if (!firestore || !projectId || !schouwing?.id) return;
    setIsDeleting(true);
    try {
      if (schouwing.fotos && schouwing.fotos.length > 0) {
        const storage = getStorage(app);
        for (const file of schouwing.fotos) {
          if (file.storagePath) {
            await deleteObject(ref(storage, file.storagePath)).catch((error) => console.error(`Kon bestand ${file.storagePath} niet verwijderen:`, error));
          }
        }
      }
      await deleteDocumentNonBlocking(doc(firestore, 'projects', projectId, 'schouwingen', schouwing.id));
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Fout bij het verwijderen van de melding:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const isUploading = Object.keys(uploadProgress).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{schouwing?.id ? 'Schouwing Bewerken' : 'Nieuwe Schouwing'}</DialogTitle>
          <DialogDescription>
            Selecteer een locatie en vul de details in om een schouwing aan te maken.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
             <div className="space-y-4">
                <FormField
                    control={form.control}
                    name="inspecteur"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Inspecteur</FormLabel>
                        <FormControl>
                            <Input {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="opmerkingen"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Opmerkingen</FormLabel>
                        <FormControl>
                            <Textarea rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecteer een status" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            <SelectItem value="Open">Open</SelectItem>
                            <SelectItem value="In behandeling">In behandeling</SelectItem>
                            <SelectItem value="Afgerond">Afgerond</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <div className='space-y-2'>
                    <FormLabel>Foto's</FormLabel>
                    <Button type="button" variant="outline" disabled={isUploading || isSubmitting} onClick={() => document.getElementById('schouwing-file-input')?.click()}>
                        <Upload className="mr-2 h-4 w-4" /> Upload een foto
                    </Button>
                    <input type="file" id="schouwing-file-input" onChange={handleFileChange} className="hidden" multiple accept="image/*" />
                     {Object.entries(uploadProgress).map(([name, progress]) => (
                      <div key={name} className="space-y-1 mt-2">
                        <p className="text-sm font-medium">{name}</p>
                        <Progress value={progress} className="w-full" />
                      </div>
                    ))}
                    {uploadedFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                            <div className="relative aspect-video w-full rounded-md border overflow-hidden">
                                <Image src={uploadedFiles[0].url} alt={uploadedFiles[0].name} fill className="object-cover" />
                            </div>
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
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                 <FormItem>
                    <FormLabel>Locatie*</FormLabel>
                     <div className="relative w-full">
                        <Input
                            placeholder="Zoek een adres..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoComplete="off"
                        />
                        {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
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
                    </div>
                    <div className='aspect-video w-full border rounded-md overflow-hidden mt-2'>
                        <MapboxView
                            longitude={location?.longitude}
                            latitude={location?.latitude}
                        />
                    </div>
                </FormItem>
            </div>
             <DialogFooter className="md:col-span-2 flex justify-between w-full">
              <div>
                {schouwing && (
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
                       <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt. Dit zal de schouwing en alle bijbehorende bestanden permanent verwijderen.</AlertDialogDescription>
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
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuleren</Button>
                <Button type="submit" disabled={isSubmitting || isUploading || !location}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan...</> : 'Opslaan'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
