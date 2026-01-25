'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  useFirestore,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  useUser
} from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';

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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Schouwing } from '@/lib/types';

const schouwFormSchema = z.object({
  inspecteur: z.string().min(1, 'Naam inspecteur is verplicht.'),
  opmerkingen: z.string().min(1, 'Opmerkingen zijn verplicht.'),
  status: z.enum(['Open', 'In behandeling', 'Afgerond']),
});

type SchouwFormValues = z.infer<typeof schouwFormSchema>;

interface SchouwDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  schouwing?: Schouwing | null;
  location?: { latitude: number; longitude: number } | null;
  onSuccess: () => void;
}

export function SchouwDialog({
  open,
  onOpenChange,
  projectId,
  schouwing,
  location,
  onSuccess,
}: SchouwDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<SchouwFormValues>({
    resolver: zodResolver(schouwFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      if (schouwing) {
        form.reset({
          inspecteur: schouwing.inspecteur,
          opmerkingen: schouwing.opmerkingen,
          status: schouwing.status,
        });
      } else {
        form.reset({
          inspecteur: user?.displayName || user?.email || '',
          opmerkingen: '',
          status: 'Open',
        });
      }
    }
  }, [open, schouwing, form, user]);

  const onSubmit = async (data: SchouwFormValues) => {
    if (!firestore || !projectId) return;
    setIsSubmitting(true);

    const schouwingenColRef = collection(firestore, 'projects', projectId, 'schouwingen');
    
    let schouwingData: any = {
      ...data,
      projectId,
      updatedAt: serverTimestamp(),
    };
    
    if (!schouwing && location) {
        schouwingData = {
            ...schouwingData,
            latitude: location.latitude,
            longitude: location.longitude,
            datum: new Date().toISOString(),
            createdAt: serverTimestamp(),
        }
    }

    try {
      if (schouwing) {
        const schouwingRef = doc(schouwingenColRef, schouwing.id);
        await updateDocumentNonBlocking(schouwingRef, schouwingData);
      } else {
        await addDocumentNonBlocking(schouwingenColRef, schouwingData);
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan schouwing:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{schouwing ? 'Schouwing Bewerken' : 'Nieuwe Schouwing'}</DialogTitle>
          <DialogDescription>
            Vul de details voor de inspectie in en klik op opslaan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="inspecteur"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inspecteur</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="opmerkingen"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opmerkingen</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer een status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In behandeling">In behandeling</SelectItem>
                      <SelectItem value="Afgerond">Afgerond</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Opslaan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
