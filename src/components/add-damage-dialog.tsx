'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Upload, Trash2, File as FileIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  collection,
  doc,
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
import { useFirestore, useFirebaseApp, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';

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
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Progress } from './ui/progress';

const damageFormSchema = z.object({
  date: z.date({ required_error: 'Een datum is verplicht.' }),
  description: z.string().min(1, { message: 'Omschrijving is verplicht.' }),
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
  materieelId: string;
  materieelType: 'voertuigen' | 'machines';
  damage?: any | null;
}

export function AddDamageDialog({
  open,
  onOpenChange,
  materieelId,
  materieelType,
  damage = null,
}: AddDamageDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  
  const form = useForm<DamageFormValues>({
    resolver: zodResolver(damageFormSchema),
  });

  const damageIdRef = React.useRef(damage?.id);

  React.useEffect(() => {
    if (open) {
      damageIdRef.current = damage?.id || doc(collection(firestore, 'temp')).id;
      const initialFiles = damage?.files || [];
      setUploadedFiles(initialFiles);
      
      form.reset(
        damage
          ? {
              description: damage.description,
              date: new Date(damage.date),
            }
          : {
              description: '',
              date: new Date(),
            }
      );
    } else {
        setTimeout(() => {
            setUploadedFiles([]);
            setUploadProgress({});
            setIsSubmitting(false);
            setIsDeleting(false);
            form.reset();
        }, 200);
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
        const storagePath = `damages/${materieelId}/${damageId}/${uniqueFileName}`;
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

  const handleDeleteDamage = async () => {
    if (!firestore || !app || !damage || !damage.id) {
        console.error('Kon schade niet identificeren.');
        return;
    };
    setIsDeleting(true);

    try {
      if (damage.files && damage.files.length > 0) {
        const storage = getStorage(app);
        for (const file of damage.files) {
          if (file.storagePath) {
            const fileRef = ref(storage, file.storagePath);
            await deleteObject(fileRef).catch((error) => {
              console.error(`Kon bestand ${file.storagePath} niet verwijderen:`, error);
            });
          }
        }
      }

      const damageDocRef = doc(firestore, materieelType, materieelId, 'damages', damage.id);
      await deleteDocumentNonBlocking(damageDocRef);

      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting damage:', error);
    } finally {
      setIsDeleting(false);
    }
  };


  const onSubmit = async (data: DamageFormValues) => {
    if (!firestore || !materieelId || !damageIdRef.current) return;

    setIsSubmitting(true);
    const damageId = damageIdRef.current;
    const damageDocRef = doc(
      firestore,
      materieelType,
      materieelId,
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
        await updateDocumentNonBlocking(damageDocRef, damageData);
      } else {
        await setDocumentNonBlocking(damageDocRef, { ...damageData, createdAt: serverTimestamp(), status: 'Open' }, {});
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving damage: ', error);
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
            <div className="grid grid-cols-1 gap-4">
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

            <DialogFooter className='flex justify-between w-full'>
              <div>
                {damage && (
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
                         Deze actie kan niet ongedaan worden gemaakt. Dit zal de schademelding en alle bijbehorende bestanden permanent verwijderen.
                       </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                       <AlertDialogCancel>Annuleren</AlertDialogCancel>
                       <AlertDialogAction onClick={handleDeleteDamage}>Doorgaan</AlertDialogAction>
                     </AlertDialogFooter>
                   </AlertDialogContent>
                 </AlertDialog>
                )}
              </div>
              <div className='flex gap-2'>
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
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Bezig...</>
                    : damage
                    ? 'Wijzigingen opslaan'
                    : 'Meld schade'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
