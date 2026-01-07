'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Upload, Trash2, File as FileIcon } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { collection, doc, updateDoc, arrayUnion, arrayRemove, addDoc, DocumentReference } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

import { cn } from '@/lib/utils';
import { useFirestore, useDoc, addDocumentNonBlocking } from '@/firebase';
import { toast } from '@/hooks/use-toast';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
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

const damageFormSchema = z.object({
  date: z.date({ required_error: 'Een datum is verplicht.' }),
  description: z.string().min(1, { message: 'Omschrijving is verplicht.' }),
});

type DamageFormValues = z.infer<typeof damageFormSchema>;

interface AddDamageDialogProps {
  children: React.ReactNode;
  vehicleId: string;
}

export function AddDamageDialog({
  children,
  vehicleId,
}: AddDamageDialogProps) {
  const firestore = useFirestore();
  const storage = getStorage();
  const [open, setOpen] = React.useState(false);
  const [damageId, setDamageId] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  const damageDocRef = React.useMemo(() => {
    if (!firestore || !vehicleId || !damageId) return null;
    return doc(firestore, 'voertuigen', vehicleId, 'damages', damageId);
  }, [firestore, vehicleId, damageId]);

  const { data: damageData } = useDoc<any>(damageDocRef);

  const form = useForm<DamageFormValues>({
    resolver: zodResolver(damageFormSchema),
    defaultValues: {
      description: '',
      date: new Date(),
    },
  });

  const uploadFile = (file: File, damageDoc: DocumentReference) => {
    return new Promise<void>((resolve, reject) => {
      if (!storage || !vehicleId) {
        return reject(new Error("Storage of voertuig-ID niet beschikbaar."));
      }

      setIsUploading(true);
      setUploadProgress(0);

      const storageRef = ref(storage, `damages/${vehicleId}/${damageDoc.id}/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload mislukt:", error);
          setIsUploading(false);
          reject(error);
        },
        () => {
          getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
            const fileData = {
              name: file.name,
              url: downloadURL,
              size: file.size,
              type: file.type,
              uploadedAt: new Date().toISOString()
            };
            await updateDoc(damageDoc, { files: arrayUnion(fileData) });
            setIsUploading(false);
            resolve();
          });
        }
      );
    });
  };

  const onSubmit = async (data: DamageFormValues) => {
    if (!firestore || !vehicleId) {
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kan geen verbinding maken met de database.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const damagesColRef = collection(firestore, 'voertuigen', vehicleId, 'damages');
      const newDamageData = {
        ...data,
        date: data.date.toISOString(),
        status: 'Open',
        files: []
      };

      // 1. Create the document first to get an ID
      const damageDoc = await addDoc(damagesColRef, newDamageData);
      setDamageId(damageDoc.id);

      // 2. If there's a file, upload it
      const file = fileInputRef.current?.files?.[0];
      if (file) {
        await uploadFile(file, damageDoc);
        toast({ title: 'Bestand geüpload', description: `${file.name} is succesvol toegevoegd.` });
      }

      toast({
        title: 'Schade gemeld!',
        description: 'De schademelding is succesvol aangemaakt.',
      });
      
      // Keep dialog open if a file was just uploaded to show it in the list.
      // Otherwise, close it.
      if (!file) {
        handleClose();
      }

    } catch (error) {
      console.error('Error adding damage: ', error);
      toast({
        variant: 'destructive',
        title: 'Oh nee! Er is iets misgegaan.',
        description: 'Kon de schade niet melden. Controleer de console voor details.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !damageId || !vehicleId || !storage) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    const storageRef = ref(storage, `damages/${vehicleId}/${damageId}/${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      }, 
      (error) => {
        console.error("Upload failed:", error);
        toast({ variant: 'destructive', title: 'Upload mislukt', description: 'Het bestand kon niet worden geüpload.'});
        setIsUploading(false);
      }, 
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
          const fileData = {
            name: file.name,
            url: downloadURL,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString()
          };
          
          if(damageDocRef){
            await updateDoc(damageDocRef, {
              files: arrayUnion(fileData)
            });
          }

          toast({ title: 'Bestand geüpload', description: `${file.name} is succesvol toegevoegd.`});
          setIsUploading(false);
        });
      }
    );

    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };


  const handleFileDelete = async (fileToDelete: any) => {
    if (!damageDocRef) return;
    try {
      await updateDoc(damageDocRef, {
        files: arrayRemove(fileToDelete)
      });
      toast({title: 'Bestand verwijderd', description: `${fileToDelete.name} is uit de lijst verwijderd.`});
    } catch (error) {
      console.error("Failed to delete file reference:", error);
      toast({variant: 'destructive', title: 'Verwijderen mislukt', description: 'Kon de bestandsreferentie niet verwijderen.'})
    }
  };

  const handleClose = () => {
    form.reset({description: '', date: new Date()});
    setDamageId(null);
    setOpen(false);
    setIsUploading(false);
    setUploadProgress(0);
    setIsSubmitting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nieuwe Schademelding</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                           disabled={!!damageId}
                        >
                          {field.value ? (
                            format(field.value, 'dd-MM-yyyy')
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Omschrijving</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Omschrijf de schade..." {...field}  disabled={!!damageId}/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
                <input type="file" ref={fileInputRef} onChange={!damageId ? undefined : handleFileChange} className="hidden" />
                <Button type="button" variant="outline" disabled={isUploading || !!damageId} onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Bestand kiezen
                </Button>
                {damageId && (
                  <Button type="button" variant="outline" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />
                      Nog een bestand kiezen
                  </Button>
                )}
            </div>
            
            {isUploading && (
                <div className="space-y-1">
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-sm text-muted-foreground">{`Uploaden... ${Math.round(uploadProgress)}%`}</p>
                </div>
            )}

            <div className="border rounded-md">
                <div className="text-sm">
                    <div className="grid grid-cols-5 gap-4 px-4 py-2 font-medium bg-muted rounded-t-md">
                        <span className="col-span-2">Bestandsnaam</span>
                        <span>Grootte</span>
                        <span>Datum</span>
                        <span className="text-right">Acties</span>
                    </div>
                </div>
                 {(damageData?.files && damageData.files.length > 0) ? (
                  <div className='max-h-48 overflow-y-auto'>
                    {damageData.files.map((file: any, index: number) => (
                      <div key={index} className="grid grid-cols-5 gap-4 items-center px-4 py-2 border-b last:border-b-0">
                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="col-span-2 text-primary hover:underline truncate flex items-center gap-2">
                          <FileIcon className="h-4 w-4 shrink-0"/> {file.name}
                        </a>
                        <span>{(file.size / 1024).toFixed(2)} KB</span>
                        <span>{format(new Date(file.uploadedAt), 'dd-MM-yy')}</span>
                        <div className='flex justify-end'>
                           <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleFileDelete(file)}>
                              <Trash2 className="h-4 w-4 text-destructive"/>
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
                <Button type="button" variant="ghost" onClick={handleClose}>Sluiten</Button>
                 {!damageId ? (
                   <Button type="submit" disabled={isSubmitting || isUploading}>
                     {isSubmitting ? 'Bezig...' : 'Meld schade'}
                   </Button>
                 ) : (
                    <Button onClick={handleClose}>Klaar</Button>
                 )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
