'use client';

import * as React from 'react';
import { useFirebaseApp, useFirestore, setDocumentNonBlocking } from '@/firebase';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, doc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Upload, Loader2 } from 'lucide-react';
import type { Bestand } from '@/lib/types';
import { Label } from '@/components/ui/label';

interface ProjectBestandenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  folderId: string | null;
}

export function ProjectBestandenDialog({ open, onOpenChange, projectId, folderId }: ProjectBestandenDialogProps) {
  const app = useFirebaseApp();
  const firestore = useFirestore();
  const [filesToUpload, setFilesToUpload] = React.useState<FileList | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = React.useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilesToUpload(e.target.files);
  };

  const handleUpload = async () => {
    if (!filesToUpload || !projectId || !app || !firestore) return;

    setIsUploading(true);
    setUploadProgress({});

    const uploadPromises = Array.from(filesToUpload).map(file => {
      return new Promise<void>((resolve, reject) => {
        const storage = getStorage(app);
        const uniqueFileName = `${Date.now()}-${file.name}`;
        const storagePath = `projects/${projectId}/bestanden/${folderId || 'root'}/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
          },
          (error) => {
            console.error(`Upload failed for ${file.name}:`, error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              const bestandenColRef = collection(firestore, 'projects', projectId, 'bestanden');
              const fileDocRef = doc(bestandenColRef);
              
              const fileData: Omit<Bestand, 'id'> = {
                name: file.name,
                type: file.type,
                size: file.size,
                url: downloadURL,
                uploadedAt: new Date().toISOString(),
                storagePath: storagePath,
                folderId: folderId,
              };

              await setDocumentNonBlocking(fileDocRef, fileData, {});
              resolve();
            } catch (error) {
                reject(error);
            }
          }
        );
      });
    });

    try {
        await Promise.all(uploadPromises);
    } catch (error) {
        console.error("One or more uploads failed", error);
    }

    setIsUploading(false);
    setFilesToUpload(null);
    onOpenChange(false);
  };
  
  React.useEffect(() => {
    if(!open) {
        setFilesToUpload(null);
        setUploadProgress({});
        setIsUploading(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bestanden Toevoegen</DialogTitle>
          <DialogDescription>Selecteer een of meerdere bestanden om te uploaden.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <Label htmlFor="file-upload">Bestanden</Label>
            <Input id="file-upload" type="file" multiple onChange={handleFileChange} />

            {filesToUpload && Array.from(filesToUpload).map(file => (
                <div key={file.name}>
                    <p className="text-sm font-medium">{file.name}</p>
                    {uploadProgress[file.name] !== undefined && <Progress value={uploadProgress[file.name]} className="h-2 mt-1" />}
                </div>
            ))}

        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isUploading}>Annuleren</Button>
          <Button onClick={handleUpload} disabled={!filesToUpload || isUploading}>
            {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploaden...</> : <><Upload className="mr-2 h-4 w-4" /> Uploaden</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
