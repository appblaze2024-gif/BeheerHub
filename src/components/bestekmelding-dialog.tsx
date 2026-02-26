'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2, File as FileIcon, Upload } from 'lucide-react';
import { useFirestore, useFirebaseApp, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { useGlobalLoading } from '@/context/global-loading-context';
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
  const { startProcessing } = useGlobalLoading();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const meldingIdRef = React.useRef(melding?.id);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      meldingIdRef.current = melding?.id || doc(collection(firestore, 'temp')).id;
      setUploadedFiles(melding?.fotos || []);
      setLocation(melding ? { latitude: melding.latitude, longitude: melding.longitude } : null);
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
      setIsSubmitting(false);
      setUploadedFiles([]);
      setUploadProgress({});
      setLocation(null);
    }
  }, [open, melding, form, firestore]);

  const onSubmit = async (data: MeldingFormValues) => {
    if (!firestore || !projectId || !location) return;
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
        updateDocumentNonBlocking(meldingRef, meldingData);
      } else {
        setDocumentNonBlocking(meldingRef, { ...meldingData, createdAt: serverTimestamp() }, {});
      }
      onOpenChange(false);
      startProcessing(1000);
    } catch (error) {
      console.error('Fout bij opslaan melding:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isReadOnly = !!melding && !canEdit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{melding ? 'Besteksmelding Bewerken' : 'Nieuwe Besteksmelding'}</DialogTitle>
           <DialogDescription>Vul de details in en sla de melding op.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
             <div className="space-y-4">
                 <FormField control={form.control} name="werksoort" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Werksoort</FormLabel>
                        <FormControl><Input placeholder="Voer werksoort in" {...field} disabled={isReadOnly} /></FormControl>
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
            </div>
            <div className="space-y-4">
                <div className='aspect-video w-full border rounded-md overflow-hidden'>
                    <MapboxView longitude={location?.longitude} latitude={location?.latitude} />
                </div>
            </div>
             <DialogFooter className="md:col-span-2 flex justify-end w-full gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuleren</Button>
                {!isReadOnly && <Button type="submit" disabled={isSubmitting || !location}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan</> : 'Melding Opslaan'}
                </Button>}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
