
'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
import { format } from 'date-fns';
import { useProfile } from '@/firebase/profile-provider';

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

const schouwFormSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht.'),
});

type SchouwFormValues = z.infer<typeof schouwFormSchema>;

interface SchouwDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSuccess: () => void;
}

export function SchouwDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: SchouwDialogProps) {
  const firestore = useFirestore();
  const { profile } = useProfile();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<SchouwFormValues>({
    resolver: zodResolver(schouwFormSchema),
    defaultValues: {
      title: '',
    },
  });

  React.useEffect(() => {
    if (!open) {
      form.reset();
      setIsSubmitting(false);
    }
  }, [open, form]);

  const onSubmit = async (data: SchouwFormValues) => {
    if (!firestore || !projectId || !profile) return;
    setIsSubmitting(true);

    const schouwingenColRef = collection(firestore, 'projects', projectId, 'schouwingen');
    
    const schouwData = {
      ...data,
      projectId: projectId,
      date: format(new Date(), 'yyyy-MM-dd'),
      inspectorId: profile.id,
      inspectorName: profile.displayName || profile.email,
      status: 'Nieuw',
      items: [],
    };

    try {
      await addDocumentNonBlocking(schouwingenColRef, schouwData);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij aanmaken schouw:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe Schouw</DialogTitle>
          <DialogDescription>
            Geef de inspectie een titel om te beginnen.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titel</FormLabel>
                  <FormControl>
                    <Input placeholder="Bijv. Jaarlijkse inspectie speeltuinen" {...field} />
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
                    Aanmaken...
                  </>
                ) : (
                  'Aanmaken'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    