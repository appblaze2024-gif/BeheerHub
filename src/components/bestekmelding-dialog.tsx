'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2, File as FileIcon, Upload } from 'lucide-react';
import { useFirestore, useFirebaseApp, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { format } from 'date-fns';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from './ui/progress';
import { MapboxView } from './mapbox-view';
import type { Besteksmelding, UploadedFile } from '@/lib/types';
import { Input } from '@/components/ui/input';


interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
}

const meldingFormSchema = z.object({
  werksoort: z.string().min(1, 'Werksoort is verplicht'),
  omschrijving: z.string().min(1, 'Omschrijving is verplicht'),
  status: z.string().min(1, 'Status is verplicht'),
});

type MeldingFormValues = z.infer<typeof meldingFormSchema>;

const statusOptions = ["Nieuw", "In behandeling", "Afgerond"];

interface BestekmeldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  melding: Besteksmelding | null;
  projectId: string | null;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function BestekmeldingDialog({ open, onOpenChange, melding, projectId, canEdit, canDelete }: BestekmeldingDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
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


  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      meldingIdRef.current = melding?.id || doc(collection(firestore, 'temp')).id;
      setUploadedFiles(melding?.fotos || []);
      setLocation(melding ? { latitude: melding.latitude, longitude: melding.longitude } : null);
      setSearchQuery(melding ? `${melding.latitude.toFixed(6)}, ${melding.longitude.toFixed(6)}` : '');
      setSuggestions([]);
      setIsSearching(false);
      form.reset(
        melding
          ? {
              werksoort: melding.werksoort,
              omschrijving: melding.omschrijving,
              status: melding.status,
            }
          : {
              werksoort: '',
              omschrijving: '',
              status: 'Nieuw',
            }
      );
    } else {
      form.reset();
      setIsSubmitting(false);
      setUploadedFiles([]);
      setUploadProgress({});
      setLocation(null);
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

  const uploadFile = (file: File, meldingId: string, projectId: string): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app || !projectId) {
            reject(new Error("Firebase app of project ID niet beschikbaar"));
            return;
        }
        const storage = getStorage(app);
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFileName = `${new Date().getTime()}-${sanitizedFileName}`;
        const storagePath = `projects/${projectId}/besteksmeldingen/${meldingId}/${uniqueFileName}`;
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
    if (!files || !meldingIdRef.current || !projectId) return;
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, meldingIdRef.current, projectId);
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
  
  const onSubmit = async (data: MeldingFormValues) => {
    if (!firestore || !projectId || !location) {
        // Here you might want to show a toast message to the user to select a location
        return;
    }
    setIsSubmitting(true);
    const meldingId = melding?.id || meldingIdRef.current;
    if (!meldingId) return;

    const meldingData = {
      ...data,
      projectId,
      latitude: location.latitude,
      longitude: location.longitude,
      datum: melding ? melding.datum : format(new Date(), 'yyyy-MM-dd'),
      fotos: uploadedFiles,
      updatedAt: serverTimestamp(),
    };

    const meldingRef = doc(firestore, 'projects', projectId, 'besteksmeldingen', meldingId);
    try {
      if (melding) {
        await updateDocumentNonBlocking(meldingRef, meldingData);
      } else {
        await setDocumentNonBlocking(meldingRef, { ...meldingData, createdAt: serverTimestamp() }, {});
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan melding:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
   const handleDelete = async () => {
    if (!firestore || !projectId || !melding?.id) return;
    setIsDeleting(true);
    try {
      if (melding.fotos && melding.fotos.length > 0) {
        const storage = getStorage(app);
        for (const file of melding.fotos) {
          if (file.storagePath) {
            await deleteObject(ref(storage, file.storagePath)).catch((error) => console.error(`Kon bestand ${file.storagePath} niet verwijderen:`, error));
          }
        }
      }
      await deleteDocumentNonBlocking(doc(firestore, 'projects', projectId, 'besteksmeldingen', melding.id));
      onOpenChange(false);
    } catch (error) {
      console.error("Fout bij het verwijderen van de melding:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const isUploading = Object.keys(uploadProgress).length > 0;
  const isReadOnly = !!melding && !canEdit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{melding ? 'Besteksmelding Bewerken' : 'Nieuwe Besteksmelding'}</DialogTitle>
           <DialogDescription>
            Selecteer een locatie op de kaart en vul de details in.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
             <div className="space-y-4">
                 <FormField control={form.control} name="werksoort" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Werksoort</FormLabel>
                        <FormControl>
                          <Input placeholder="Voer werksoort in" {...field} disabled={isReadOnly} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                <FormField control={form.control} name="omschrijving" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Omschrijving</FormLabel>
                        <FormControl><Textarea rows={5} placeholder="Omschrijf de melding..." {...field} disabled={isReadOnly} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                      </Select>
                      <FormMessage />
                  </FormItem>
                )} />

                <div className='space-y-2'>
                    <FormLabel>Foto's</FormLabel>
                    {!isReadOnly && <Button type="button" variant="outline" disabled={isUploading || isSubmitting} onClick={() => document.getElementById('bestek-file-input')?.click()}>
                        <Upload className="mr-2 h-4 w-4" /> Upload een foto
                    </Button>}
                    <input type="file" id="bestek-file-input" onChange={handleFileChange} className="hidden" multiple accept="image/*" />
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
                                    {!isReadOnly && <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleFileDelete(file)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
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
                        <Input
                            placeholder="Zoek een adres..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoComplete="off"
                            disabled={isReadOnly}
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
                {melding && canDelete && (
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
                       <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt. Dit zal de melding permanent verwijderen.</AlertDialogDescription>
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
                {!isReadOnly && <Button type="submit" disabled={isSubmitting || isUploading || !location}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan...</> : 'Melding Opslaan'}
                </Button>}
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
