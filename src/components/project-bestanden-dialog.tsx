
'use client';

import * as React from 'react';
import { Upload, Trash2, File as FileIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

import { useFirestore, useFirebaseApp, useCollection, useMemoFirebase } from '@/firebase';
import type { Bestand } from '@/app/projects/page';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from './ui/progress';

type UploadedFile = {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
  storagePath: string;
};

interface ProjectBestandenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function ProjectBestandenDialog({
  open,
  onOpenChange,
  projectId,
}: ProjectBestandenDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});

  const bestandenCollectionRef = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return collection(firestore, 'projects', projectId, 'bestanden');
  }, [firestore, projectId]);

  const { data: uploadedFiles, isLoading } = useCollection<UploadedFile>(bestandenCollectionRef);

  const uploadFile = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!app || !firestore) {
            reject(new Error("Firebase services not available"));
            return;
        }
        const uniqueFileName = `${new Date().getTime()}-${file.name}`;
        const storagePath = `projects/${projectId}/${uniqueFileName}`;
        const storageRef = ref(getStorage(app), storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        setIsUploading(true);
        setUploadProgress(prev => ({...prev, [uniqueFileName]: 0}));

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
                setIsUploading(Object.keys(uploadProgress).length > 1);
                reject(error);
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                const fileId = doc(collection(firestore, 'temp')).id;
                const fileDocRef = doc(firestore, 'projects', projectId, 'bestanden', fileId);
                
                const newFile: UploadedFile = {
                    id: fileId,
                    name: file.name,
                    url: downloadURL,
                    size: file.size,
                    type: file.type,
                    uploadedAt: new Date().toISOString(),
                    storagePath: storagePath,
                };

                await setDoc(fileDocRef, newFile);

                setUploadProgress(prev => {
                    const newProgress = {...prev};
                    delete newProgress[uniqueFileName];
                    return newProgress;
                });
                setIsUploading(Object.keys(uploadProgress).length > 1);
                resolve();
            }
        );
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const uploadPromises = Array.from(files).map(file => uploadFile(file));
    
    await Promise.all(uploadPromises);
  };

  const handleFileDelete = async (fileToDelete: UploadedFile) => {
    if (!app || !firestore) return;
    
    const fileDocRef = doc(firestore, 'projects', projectId, 'bestanden', fileToDelete.id);
    const storageRef = ref(getStorage(app), fileToDelete.storagePath);

    try {
      await deleteObject(storageRef);
      await deleteDoc(fileDocRef);
    } catch (error: any) {
      console.error('Kon bestand niet verwijderen:', error);
      if (error.code === 'storage/object-not-found') {
        await deleteDoc(fileDocRef); // Remove from firestore even if not in storage
      }
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bestanden voor Project</DialogTitle>
          <DialogDescription>
            Upload en beheer bestanden die bij dit project horen.
          </DialogDescription>
        </DialogHeader>
        
        <div className='py-4 space-y-4'>
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={isUploading}
                onClick={() => document.getElementById('project-file-input')?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Kies bestanden
              </Button>
              <input
                type="file"
                id="project-file-input"
                onChange={handleFileChange}
                className="hidden"
                multiple
              />
            </div>
            
             {isUploading && Object.entries(uploadProgress).map(([name, progress]) => (
              <div key={name} className="space-y-1 mt-2">
                <p className="text-sm font-medium truncate">{name}</p>
                <Progress value={progress} className="w-full" />
              </div>
            ))}

            <div className="border rounded-md">
              <div className="text-sm">
                <div className="grid grid-cols-[3fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2 font-medium bg-muted rounded-t-md">
                  <span>Bestandsnaam</span>
                  <span>Type</span>
                  <span>Grootte</span>
                  <span>Datum</span>
                  <span className="text-right">Acties</span>
                </div>
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center text-muted-foreground h-24">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden...
                </div>
              ) : uploadedFiles && uploadedFiles.length > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="grid grid-cols-[3fr_1fr_1fr_1fr_auto] gap-4 items-center px-4 py-2 border-b last:border-b-0"
                    >
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate flex items-center gap-2 hover:underline text-blue-600">
                        <FileIcon className="h-4 w-4 shrink-0" /> {file.name}
                      </a>
                      <span className='truncate'>{file.type}</span>
                      <span>{formatBytes(file.size)}</span>
                      <span>{format(new Date(file.uploadedAt), 'dd-MM-yy')}</span>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleFileDelete(file)}
                          disabled={isUploading}
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
        </div>

        <DialogFooter>
            <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
            >
                Sluiten
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
