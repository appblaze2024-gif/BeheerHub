'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirebaseApp, useFirestore } from '@/firebase';
import { cn } from '@/lib/utils';
import { Progress } from './ui/progress';
import { UploadCloud, Loader2 } from 'lucide-react';

interface ObjectImageUploaderProps {
  objectId: string;
  imageUrl: string | null;
  imageHint?: string;
  className?: string;
}

export function ObjectImageUploader({
  objectId,
  imageUrl,
  imageHint,
  className,
}: ObjectImageUploaderProps) {
  const app = useFirebaseApp();
  const firestore = useFirestore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(
    null
  );
  const [isUploading, setIsUploading] = React.useState(false);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !app || !firestore) return;

    setIsUploading(true);
    setUploadProgress(0);

    const storage = getStorage(app);
    const storagePath = `objects/${objectId}/main_image/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error('Upload failed:', error);
        setIsUploading(false);
        setUploadProgress(null);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
          const objectRef = doc(firestore, 'objects', objectId);
          await updateDoc(objectRef, {
            imageUrl: downloadURL,
          });
          setIsUploading(false);
          setUploadProgress(null);
        });
      }
    );
  };

  const isUploadingState = isUploading && uploadProgress !== null;

  return (
    <div
      className={cn(
        'group relative w-full h-full min-h-[200px] rounded-none overflow-hidden border-2 border-dashed border-slate-200 cursor-pointer hover:border-primary/30 transition-all',
        className
      )}
      onClick={handleImageClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/jpeg, image/png, image/webp, image/gif"
        disabled={isUploadingState}
      />

      {imageUrl && (
        <Image
          src={imageUrl}
          alt={imageHint || 'Object afbeelding'}
          fill
          className={cn('object-cover transition-opacity', isUploadingState && 'opacity-30')}
          data-ai-hint={imageHint}
        />
      )}
      
      <div className={cn(
        "absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white opacity-0 transition-opacity",
        !isUploadingState && "group-hover:opacity-100",
        !imageUrl && !isUploadingState && "opacity-100 bg-white/50 text-slate-400"
      )}>
        <UploadCloud className="h-8 w-8" />
        <p className="mt-2 text-[10px] font-black uppercase tracking-widest">
            {imageUrl ? 'Wijzig foto' : 'Foto uploaden'}
        </p>
      </div>

      {isUploadingState && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <Progress value={uploadProgress} className="w-full mt-4 h-1 rounded-none" />
          <p className="text-white text-[10px] font-black uppercase mt-2">
            {Math.round(uploadProgress)}%
          </p>
        </div>
      )}
    </div>
  );
}
