'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
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

const meldingFormSchema = z.object({
  subcategorie: z.string().min(1, 'Subcategorie is verplicht.'),
  omschrijving: z.string().min(1, 'Omschrijving is verplicht.'),
  toelichting: z.string().optional(),
});

type MeldingFormValues = z.infer<typeof meldingFormSchema>;

const subcategorieOptions = [
    "Boom", "Struik", "Gras", "Onkruid", "Verlichting", 
    "Wegdek", "Verkeersbord", "Afvalbak", "Overig"
];

interface MeldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coordinates: { lat: number, lng: number } | null;
}

export function MeldingDialog({
  open,
  onOpenChange,
  coordinates,
}: MeldingDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
    defaultValues: {
        subcategorie: '',
        omschrijving: '',
        toelichting: '',
    }
  });

  React.useEffect(() => {
    if (!open) {
      form.reset();
      setIsSubmitting(false);
    }
  }, [open, form]);

  const onSubmit = async (data: MeldingFormValues) => {
    if (!firestore || !coordinates) return;
    setIsSubmitting(true);

    const meldingData = {
      ...data,
      latitude: coordinates.lat,
      longitude: coordinates.lng,
      status: 'Nieuw',
      aangemaakt: format(new Date(), 'yyyy-MM-dd'),
      meldingnummer: `M${Date.now()}`
    };

    try {
      const meldingenColRef = collection(firestore, 'meldingen');
      await addDocumentNonBlocking(meldingenColRef, meldingData);
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan melding:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe Melding Aanmaken</DialogTitle>
          <DialogDescription>
            Vul de details voor de nieuwe melding in. De locatie is al bepaald.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="subcategorie"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subcategorie</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecteer een subcategorie" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {subcategorieOptions.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="omschrijving"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Omschrijving</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Korte omschrijving van de melding" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="toelichting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Toelichting (optioneel)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Extra details of context" {...field} />
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
                  'Melding Opslaan'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
