'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Upload, Trash2, File as FileIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

import { useFirestore, useFirebaseApp } from '@/firebase';

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
import { Progress } from './ui/progress';
import { Input } from './ui/input';

const documentFormSchema = z.object({
  title: z.string().min(1, { message: 'Titel is verplicht.' }),
  description: z.string().optional(),
});

type DocumentFormValues = z.infer<typeof documentFormSchema>;

type UploadedFile = {
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
  storagePath: string;
};

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  document?: any | null;
}

export function AddDocumentDialog({
  open,
  onOpenChange,
  vehicleId,
  document: docToEdit = null,
}: AddDocumentDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  
  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
  });

  const documentIdRef = React.useRef(docToEdit?.id);

  React.useEffect(() => {
    if (open) {
      documentIdRef.current = docToEdit?.id || doc(collection(firestore, 'temp')).id;
      const initialFiles = docToEdit?.files || [];
      setUploadedFiles(initialFiles);
      
      form.reset(
        docToEdit
          ? {
              title: docToEdit.title,
              description: docToEdit.description || '',
            }
          : {
              title: '',
              description: '',
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
  }, [open, docToEdit, form, firestore]);


  const uploadFile = (file: File, documentId: string): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app) {
            reject(new Error("Firebase app not available"));
            return;
        }
        const storage = getStorage(app);
        const uniqueFileName = `${new Date().getTime()}-${file.name}`;
        const storagePath = `documents/${vehicleId}/${documentId}/${uniqueFileName}`;
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

    const documentId = documentIdRef.current;
    if (!documentId) return;
    
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, documentId);
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

  const handleDeleteDocument = async () => {
    if (!firestore || !app || !docToEdit || !docToEdit.id) {
        console.error('Kon document niet identificeren.');
        return;
    };
    setIsDeleting(true);

    try {
      if (docToEdit.files && docToEdit.files.length > 0) {
        const storage = getStorage(app);
        for (const file of docToEdit.files) {
          if (file.storagePath) {
            const fileRef = ref(storage, file.storagePath);
            await deleteObject(fileRef).catch((error) => {
              console.error(`Kon bestand ${file.storagePath} niet verwijderen:`, error);
            });
          }
        }
      }

      const documentDocRef = doc(firestore, 'voertuigen', vehicleId, 'documents', docToEdit.id);
      await deleteDoc(documentDocRef);

      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting document:', error);
    } finally {
      setIsDeleting(false);
    }
  };


  const onSubmit = async (data: DocumentFormValues) => {
    if (!firestore || !vehicleId || !documentIdRef.current) return;
    
    setIsSubmitting(true);
    const documentId = documentIdRef.current;
    const documentDocRef = doc(
      firestore,
      'voertuigen',
      vehicleId,
      'documents',
      documentId
    );

    const documentData = {
      ...data,
      id: documentId,
      files: uploadedFiles,
      updatedAt: serverTimestamp(),
    };

    try {
      if (docToEdit) {
        await updateDoc(documentDocRef, documentData);
      } else {
        await setDoc(documentDocRef, { ...documentData, createdAt: serverTimestamp() });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving document: ', error);
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
            {docToEdit ? 'Document Bewerken' : 'Nieuw Document Toevoegen'}
          </DialogTitle>
          <DialogDescription>
            Vul de details in en voeg de bestanden toe.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titel</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Bijv. Kentekenbewijs"
                      {...field}
                    />
                  </FormControl>
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
                    <Textarea
                      placeholder="Optionele omschrijving van het document..."
                      {...field}
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
                onClick={() => document.getElementById('document-file-input')?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Bestand kiezen
              </Button>
              <input
                type="file"
                id="document-file-input"
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
                {docToEdit && (
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
                         Deze actie kan niet ongedaan worden gemaakt. Dit zal het document en alle bijbehorende bestanden permanent verwijderen.
                       </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                       <AlertDialogCancel>Annuleren</AlertDialogCancel>
                       <AlertDialogAction onClick={handleDeleteDocument}>Doorgaan</AlertDialogAction>
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
                    : docToEdit
                    ? 'Wijzigingen opslaan'
                    : 'Toevoegen'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
