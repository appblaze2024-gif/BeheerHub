'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Info, Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import type { Medewerker } from '@/lib/types';
import { Separator } from './ui/separator';

const medewerkerFormSchema = z.object({
  voornaam: z.string().min(1, 'Voornaam is verplicht.'),
  tussenvoegsel: z.string().optional(),
  achternaam: z.string().min(1, 'Achternaam is verplicht.'),
  email: z.string().email('Voer een geldig e-mailadres in.').optional(),
  telefoonnummer: z.string().optional(),
  taal: z.string().default('Nederlands'),
  // Fields not in the "Basis" tab but needed for the data model
  functie: z.string().optional(),
  status: z.string().default('Niet uitgenodigd'),
});

type MedewerkerFormValues = z.infer<typeof medewerkerFormSchema>;

interface MedewerkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medewerker?: Medewerker | null;
}

const navItems = ["Basis", "Details", "Vrije velden", "Contract", "Afwezigheid"];

export function MedewerkerDialog({
  open,
  onOpenChange,
  medewerker,
}: MedewerkerDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [addAnother, setAddAnother] = React.useState(false);

  const form = useForm<MedewerkerFormValues>({
    resolver: zodResolver(medewerkerFormSchema),
    defaultValues: {
      voornaam: '',
      tussenvoegsel: '',
      achternaam: '',
      email: '',
      telefoonnummer: '',
      taal: 'Nederlands',
    }
  });

  React.useEffect(() => {
    if (open) {
      form.reset(
        medewerker
          ? {
              voornaam: medewerker.voornaam,
              tussenvoegsel: medewerker.tussenvoegsel || '',
              achternaam: medewerker.achternaam,
              email: medewerker.email || '',
              telefoonnummer: medewerker.telefoonnummer || '',
              taal: medewerker.taal || 'Nederlands',
              functie: medewerker.functie || '',
              status: medewerker.status || 'Niet uitgenodigd',
            }
          : {
             voornaam: '',
              tussenvoegsel: '',
              achternaam: '',
              email: '',
              telefoonnummer: '',
              taal: 'Nederlands',
              functie: '',
              status: 'Niet uitgenodigd',
            }
      );
    }
  }, [open, medewerker, form]);

  const onSubmit = async (data: MedewerkerFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    const dataToSave = {
        ...data,
        achternaam: data.achternaam, // ensure it's there
        // Keep existing non-form values if editing
        ...(medewerker && { status: medewerker.status, functie: medewerker.functie }),
      };

    try {
      if (medewerker) {
        const medewerkerRef = doc(firestore, 'medewerkers', medewerker.id);
        await updateDocumentNonBlocking(medewerkerRef, dataToSave);
      } else {
        const medewerkersColRef = collection(firestore, 'medewerkers');
        await addDocumentNonBlocking(medewerkersColRef, dataToSave);
      }
      
      if (addAnother) {
        form.reset({
            voornaam: '',
            tussenvoegsel: '',
            achternaam: '',
            email: '',
            telefoonnummer: '',
            taal: 'Nederlands',
        });
        setIsSubmitting(false);
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Fout bij opslaan medewerker:', error);
      setIsSubmitting(false);
    }
  };
  

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className='flex items-center gap-2'>
            {medewerker ? 'Medewerker Bewerken' : 'Medewerker toevoegen'}
            <Info className="h-4 w-4 text-muted-foreground" />
          </DialogTitle>
        </DialogHeader>
        <div className="flex">
            <div className="w-1/4 border-r p-6">
                <nav className="flex flex-col gap-1">
                    {navItems.map((item, index) => (
                        <Button
                            key={item}
                            variant={index === 0 ? "secondary" : "ghost"}
                            className="justify-start"
                            disabled={index !== 0} // Disable non-basis tabs
                        >
                            {item}
                        </Button>
                    ))}
                </nav>
            </div>
            <div className="w-3/4 p-6">
                <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="voornaam"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Voornaam*</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="tussenvoegsel"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Tussenvoegsel</FormLabel>
                                <FormControl>
                                    <Input {...field} />
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
                                <FormLabel>Achternaam*</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>E-mail</FormLabel>
                                <FormControl>
                                    <Input type="email" {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="telefoonnummer"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Telefoonnummer</FormLabel>
                                <FormControl>
                                    <Input type="tel" {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                     <FormField
                        control={form.control}
                        name="taal"
                        render={({ field }) => (
                            <FormItem className="w-1/2 pr-2">
                            <FormLabel>Taal</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecteer een taal" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                <SelectItem value="Nederlands">Nederlands</SelectItem>
                                <SelectItem value="Engels">Engels</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />

                    <Separator className='mt-8' />

                    <DialogFooter className="pt-4 flex justify-between w-full">
                        <div className="flex items-center space-x-2">
                             <Checkbox
                                id="add-another"
                                checked={addAnother}
                                onCheckedChange={(checked) => setAddAnother(!!checked)}
                                />
                            <label
                                htmlFor="add-another"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                Nog een medewerker toevoegen
                            </label>
                        </div>
                        <div className="flex gap-2">
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
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Toevoegen...</>
                                ) : 'Toevoegen'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
                </Form>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
