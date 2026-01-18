'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useFirestore, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import {
  collection,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

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
import type { Afspraak } from '@/app/projects/page';

const afspraakFormSchema = z.object({
  onderwerp: z.string().min(1, 'Onderwerp is verplicht.'),
  datum: z.string().min(1, 'Datum is verplicht.'),
  tijd: z.string().min(1, 'Tijd is verplicht.'),
  notities: z.string().optional(),
});

type AfspraakFormValues = z.infer<typeof afspraakFormSchema>;

interface AfspraakDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  afspraak?: Afspraak;
}

export function AfspraakDialog({
  open,
  onOpenChange,
  projectId,
  afspraak,
}: AfspraakDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<AfspraakFormValues>({
    resolver: zodResolver(afspraakFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      form.reset(
        afspraak
          ? {
              onderwerp: afspraak.onderwerp,
              datum: afspraak.datum,
              tijd: afspraak.tijd,
              notities: afspraak.notities || '',
            }
          : {
              onderwerp: '',
              datum: '',
              tijd: '',
              notities: '',
            }
      );
    } else {
      setIsSubmitting(false);
    }
  }, [open, afspraak, form]);

  const onSubmit = async (data: AfspraakFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    const afsprakenColRef = collection(firestore, 'projects', projectId, 'afspraken');
    const afspraakId = afspraak?.id || doc(afsprakenColRef).id;
    const afspraakRef = doc(afsprakenColRef, afspraakId);

    const afspraakData = {
      ...data,
      id: afspraakId,
      updatedAt: serverTimestamp(),
    };

    try {
      if (afspraak) {
        await updateDocumentNonBlocking(afspraakRef, afspraakData);
      } else {
        await setDocumentNonBlocking(afspraakRef, {
          ...afspraakData,
          createdAt: serverTimestamp(),
        }, {});
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan afspraak:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {afspraak ? 'Afspraak Bewerken' : 'Nieuwe Afspraak'}
          </DialogTitle>
          <DialogDescription>
            Vul de details voor de afspraak in en klik op opslaan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="onderwerp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Onderwerp</FormLabel>
                  <FormControl>
                    <Input placeholder="Bijv. Bouwvergadering" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="datum"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Datum</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tijd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tijd</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notities"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notities</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Extra details of opmerkingen..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opslaan...
                  </>
                ) : (
                  'Opslaan'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
