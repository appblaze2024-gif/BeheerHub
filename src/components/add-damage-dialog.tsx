'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Upload, Trash2, File as FileIcon } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { collection, doc, updateDoc, arrayUnion, addDoc, DocumentReference } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

import { cn } from '@/lib/utils';
import { useFirestore } from '@/firebase';
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
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const form = useForm<DamageFormValues>({
    resolver: zodResolver(damageFormSchema),
    defaultValues: {
      description: '',
      date: new Date(),
    },
  });

  const uploadFile = (file: File, damageDocRef: DocumentReference) => {
    return new Promise<void>((resolve, reject) => {
      if (!storage || !vehicleId) {
        return reject(new Error("Storage of voertuig-ID niet beschikbaar."));
      }

      const storageRef = ref(storage, `damages/${vehicleId}/${damageDocRef.id}/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload mislukt:", error);
          setUploadProgress(0);
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
            await updateDoc(damageDocRef, { files: arrayUnion(fileData) });
            resolve();
          }).catch(reject);
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
    setUploadProgress(0);

    try {
      const damagesColRef = collection(firestore, 'voertuigen', vehicleId, 'damages');
      const newDamageData = {
        ...data,
        date: data.date.toISOString(),
        status: 'Open',
        files: []
      };

      // Create the document first to get an ID
      const damageDocRef = await addDoc(damagesColRef, newDamageData);
      
      // If there's a file, upload it and update the document
      if (selectedFile) {
        await uploadFile(selectedFile, damageDocRef);
      }

      toast({
        title: 'Schade gemeld!',
        description: 'De schademelding is succesvol aangemaakt.',
      });
      
      handleClose();

    } catch (error) {
      console.error('Error adding damage: ', error);
      toast({
        variant: 'destructive',
        title: 'Oh nee! Er is iets misgegaan.',
        description: 'Kon de schade niet melden. Controleer de console voor details.',
      });
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
    // Clear the input value to allow re-selecting the same file
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };


  const handleFileDelete = () => {
    setSelectedFile(null);
  };

  const handleClose = () => {
    form.reset({description: '', date: new Date()});
    setOpen(false);
    setIsSubmitting(false);
    setUploadProgress(0);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
        else setOpen(true);
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Omschrijving</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Omschrijf de schade..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
                <Button type="button" variant="outline" disabled={isSubmitting || !!selectedFile} onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Bestand kiezen
                </Button>
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </div>
            
            {isSubmitting && selectedFile && (
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
                 {selectedFile ? (
                  <div className='max-h-48 overflow-y-auto'>
                       <div className="grid grid-cols-5 gap-4 items-center px-4 py-2 border-b last:border-b-0">
                        <span className="col-span-2 truncate flex items-center gap-2">
                          <FileIcon className="h-4 w-4 shrink-0"/> {selectedFile.name}
                        </span>
                        <span>{(selectedFile.size / 1024).toFixed(2)} KB</span>
                        <span>{format(new Date(), 'dd-MM-yy')}</span>
                        <div className='flex justify-end'>
                           <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFileDelete} disabled={isSubmitting}>
                              <Trash2 className="h-4 w-4 text-destructive"/>
                           </Button>
                        </div>
                      </div>
                  </div>
                 ) : (
                    <div className="flex items-center justify-center text-muted-foreground h-24">
                      Nog geen bestand geselecteerd.
                    </div>
                 )}
            </div>

            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="ghost">Annuleren</Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Bezig...' : 'Meld schade'}
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
