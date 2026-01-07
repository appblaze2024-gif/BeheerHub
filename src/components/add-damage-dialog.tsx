'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Upload, Trash2, File as FileIcon } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

import { cn } from '@/lib/utils';
import { useFirestore, useFirebaseApp } from '@/firebase';
import { toast } from '@/hooks/use-toast';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Progress } from './ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const damageFormSchema = z.object({
  date: z.date({ required_error: 'Een datum is verplicht.' }),
  description: z.string().min(1, { message: 'Omschrijving is verplicht.' }),
  status: z.string().min(1, { message: 'Status is verplicht.' }),
});

type DamageFormValues = z.infer<typeof damageFormSchema>;

type UploadedFile = {
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
  storagePath: string;
};

interface AddDamageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  damage?: any | null;
}

export function AddDamageDialog({
  open,
  onOpenChange,
  vehicleId,
  damage = null,
}: AddDamageDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  
  const form = useForm<DamageFormValues>({
    resolver: zodResolver(damageFormSchema),
  });

  const damageIdRef = React.useRef(damage?.id);

  React.useEffect(() => {
    if (open) {
      damageIdRef.current = damage?.id || doc(collection(firestore, 'temp')).id;
      setUploadedFiles(damage?.files || []);
      form.reset(
        damage
          ? {
              description: damage.description,
              date: new Date(damage.date),
              status: damage.status,
            }
          : {
              description: '',
              date: new Date(),
              status: 'Open',
            }
      );
    } else {
        // Reset when dialog closes
        setUploadedFiles([]);
        setUploadProgress({});
        setIsSubmitting(false);
    }
  }, [open, damage, form, firestore]);


  const uploadFile = (file: File, damageId: string): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) {
            reject(new Error("Firebase app not available"));
            return;
        }
        const storage = getStorage(app);
        const uniqueFileName = `${new Date().getTime()}-${file.name}`;
        const storagePath = `damages/${vehicleId}/${damageId}/${uniqueFileName}`;
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

    const damageId = damageIdRef.current;
    if (!damageId) return;
    
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, damageId);
        setUploadedFiles(prev => [...prev, uploadedFile]);
      } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Upload mislukt',
            description: `Kon ${file.name} niet uploaden.`,
        });
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
      toast({
        title: 'Bestand verwijderd',
        description: `${fileToDelete.name} is verwijderd.`,
      });
    } catch (error: any) {
      console.error('Kon bestand niet verwijderen:', error);
       // Also remove from state if it's already gone from storage
      if (error.code === 'storage/object-not-found') {
        setUploadedFiles((prev) =>
          prev.filter((f) => f.storagePath !== fileToDelete.storagePath)
        );
      }
      toast({
          variant: 'destructive',
          title: 'Verwijderen mislukt',
          description: `Kon ${fileToDelete.name} niet verwijderen.`,
        });
    }
  };

  const onSubmit = async (data: DamageFormValues) => {
    if (!firestore || !vehicleId || !damageIdRef.current) return;

    setIsSubmitting(true);
    const damageId = damageIdRef.current;
    const damageDocRef = doc(
      firestore,
      'voertuigen',
      vehicleId,
      'damages',
      damageId
    );

    const damageData = {
      ...data,
      id: damageId,
      date: data.date.toISOString(),
      files: uploadedFiles,
      updatedAt: serverTimestamp(),
    };

    try {
      if (damage) {
        await updateDoc(damageDocRef, damageData);
        toast({
          title: 'Schade bijgewerkt!',
          description: 'De schademelding is succesvol bijgewerkt.',
        });
      } else {
        await setDoc(damageDocRef, { ...damageData, createdAt: serverTimestamp() });
        toast({
          title: 'Schade gemeld!',
          description: 'De schademelding is succesvol aangemaakt.',
        });
      }
      onOpenChange(false); // Close the dialog on success
    } catch (error) {
      console.error('Error saving damage: ', error);
      toast({
        variant: 'destructive',
        title: 'Oh nee! Er is iets misgegaan.',
        description:
          'Kon de schade niet opslaan. Controleer de console voor details.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isUploading = Object.keys(uploadProgress).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {damage ? 'Schademelding Bewerken' : 'Nieuwe Schademelding'}
          </DialogTitle>
          <DialogDescription>
            Vul de details in en voeg eventueel bestanden toe.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Datum</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'dd-MM-yyyy', { locale: nl })
                            ) : (
                              <span>Kies een datum</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
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
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer een status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Open">Open</SelectItem>
                        <SelectItem value="In behandeling">
                          In behandeling
                        </SelectItem>
                        <SelectItem value="Afgehandeld">Afgehandeld</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Omschrijving</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Omschrijf de schade..."
                      {...field}
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <Button
                type="button"
                variant="outline"
                disabled={isUploading || isSubmitting}
                onClick={() => document.getElementById('damage-file-input')?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Bestand kiezen
              </Button>
              <input
                type="file"
                id="damage-file-input"
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
                <p className="text-sm text-muted-foreground">{`Uploaden... ${Math.round(
                  progress
                )}%`}</p>
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
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.storagePath}
                      className="grid grid-cols-5 gap-4 items-center px-4 py-2 border-b last:border-b-0"
                    >
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="col-span-2 truncate flex items-center gap-2 hover:underline">
                        <FileIcon className="h-4 w-4 shrink-0" /> {file.name}
                      </a>
                      <span>{(file.size / 1024).toFixed(2)} KB</span>
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

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting || isUploading}
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting || isUploading}>
                {isSubmitting
                  ? 'Bezig...'
                  : damage
                  ? 'Wijzigingen opslaan'
                  : 'Meld schade'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
