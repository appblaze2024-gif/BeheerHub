'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Medewerker } from '@/lib/types';


const medewerkerFormSchema = z.object({
  voornaam: z.string().min(1, 'Voornaam is verplicht.'),
  achternaam: z.string().min(1, 'Achternaam is verplicht.'),
  email: z.string().email('Voer een geldig e-mailadres in.'),
  functie: z.string().optional(),
  telefoon: z.string().optional(),
  mobiel: z.string().optional(),
  status: z.string().default('Niet uitgenodigd'),
});

type MedewerkerFormValues = z.infer<typeof medewerkerFormSchema>;

interface MedewerkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medewerker?: Medewerker | null;
}

export function MedewerkerDialog({
  open,
  onOpenChange,
  medewerker,
}: MedewerkerDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<MedewerkerFormValues>({
    resolver: zodResolver(medewerkerFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      form.reset(
        medewerker
          ? {
              voornaam: medewerker.voornaam,
              achternaam: medewerker.achternaam,
              email: medewerker.email,
              functie: medewerker.functie || '',
              telefoon: medewerker.telefoon || '',
              mobiel: medewerker.mobiel || '',
              status: medewerker.status || 'Niet uitgenodigd',
            }
          : {
              voornaam: '',
              achternaam: '',
              email: '',
              functie: '',
              telefoon: '',
              mobiel: '',
              status: 'Niet uitgenodigd',
            }
      );
    }
  }, [open, medewerker, form]);

  const onSubmit = async (data: MedewerkerFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    try {
      if (medewerker) {
        const medewerkerRef = doc(firestore, 'medewerkers', medewerker.id);
        await updateDocumentNonBlocking(medewerkerRef, data);
      } else {
        const medewerkersColRef = collection(firestore, 'medewerkers');
        await addDocumentNonBlocking(medewerkersColRef, data);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan medewerker:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {medewerker ? 'Medewerker Bewerken' : 'Nieuwe Medewerker'}
          </DialogTitle>
           <DialogDescription>
             Vul de gegevens in en sla de medewerker op.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="voornaam"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Voornaam</FormLabel>
                    <FormControl>
                        <Input placeholder="Jan" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="achternaam"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Achternaam</FormLabel>
                    <FormControl>
                        <Input placeholder="Janssen" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mailadres</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="j.janssen@bedrijf.nl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="functie"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Functie</FormLabel>
                  <FormControl>
                    <Input placeholder="Grondwerker" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <div className="grid grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="telefoon"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Telefoon</FormLabel>
                        <FormControl>
                            <Input type="tel" placeholder="010-1234567" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="mobiel"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Mobiel</FormLabel>
                        <FormControl>
                            <Input type="tel" placeholder="06-12345678" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer een status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Niet uitgenodigd">Niet uitgenodigd</SelectItem>
                      <SelectItem value="Actief">Actief</SelectItem>
                      <SelectItem value="Inactief">Inactief</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan...</>
                ) : 'Opslaan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
