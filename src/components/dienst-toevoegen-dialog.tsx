'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2 } from 'lucide-react';
import {
  useFirestore,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { collection, doc, addDoc, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

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
} from "@/components/ui/alert-dialog";
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
import type { Medewerker, Dienst, Voertuig } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const dienstFormSchema = z.object({
  werksoort: z.string().min(1, 'Omschrijving is verplicht.'),
  starttijd: z.string().min(1, 'Starttijd is verplicht.'),
  eindtijd: z.string().min(1, 'Eindtijd is verplicht.'),
  voertuignummer: z.string().optional().nullable(),
});

type DienstFormValues = z.infer<typeof dienstFormSchema>;


interface DienstToevoegenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medewerker?: Medewerker;
  datum?: Date;
  project?: {
    id: string;
  };
  dienst?: Dienst;
  onSuccess: () => void;
  voertuigen: Voertuig[];
}

export function DienstToevoegenDialog({
  open,
  onOpenChange,
  medewerker,
  datum,
  project,
  dienst,
  onSuccess,
  voertuigen,
}: DienstToevoegenDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  const form = useForm<DienstFormValues>({
    resolver: zodResolver(dienstFormSchema),
  });


  React.useEffect(() => {
    if (open) {
      if (dienst) {
        form.reset({
          ...dienst,
          voertuignummer: dienst.voertuignummer || undefined,
        });
      } else {
        form.reset({
          werksoort: '',
          starttijd: '07:00',
          eindtijd: '15:30',
          voertuignummer: undefined,
        });
      }
    }
  }, [open, dienst, form]);

  const onSubmit = async (data: DienstFormValues) => {
    if (!firestore || !project?.id || (!datum && !dienst)) return;
    setIsSubmitting(true);
    
    const dienstData = {
      ...data,
      medewerkerId: medewerker?.id || dienst?.medewerkerId,
      projectId: project.id,
      datum: format(datum || new Date(dienst!.datum), 'yyyy-MM-dd'),
    };

    try {
      if (dienst) {
        const dienstRef = doc(firestore, 'projects', project.id, 'diensten', dienst.id);
        await updateDoc(dienstRef, dienstData);
      } else {
        const dienstenColRef = collection(
          firestore,
          'projects',
          project.id,
          'diensten'
        );
        await addDoc(dienstenColRef, dienstData);
      }
      onSuccess();
    } catch (error) {
      console.error('Fout bij opslaan dienst:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!firestore || !dienst || !project?.id || !dienst.id) return;
    setIsSubmitting(true);
    try {
      const dienstRef = doc(firestore, 'projects', project.id, 'diensten', dienst.id);
      await deleteDocumentNonBlocking(dienstRef);
      onSuccess();
    } catch (error) {
        console.error("Fout bij verwijderen dienst:", error);
    } finally {
      setIsSubmitting(false);
    }
  }
  
  if (!medewerker && !dienst) {
    return null;
  }
  
  const medewerkerNaam = medewerker ? `${medewerker.voornaam || ''} ${
    medewerker.tussenvoegsel || ''
  } ${medewerker.achternaam || ''}`.trim() : 'Laden...';
  
  const displayDate = datum || (dienst ? new Date(dienst.datum) : new Date());

  const formattedDate = format(displayDate, 'eeee d MMMM yyyy', { locale: nl });

  const effectiveMedewerkerName = medewerker ? medewerkerNaam : dienst?.medewerkerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dienst ? 'Dienst Bewerken' : 'Dienst Toevoegen'}: {formattedDate}</DialogTitle>
           <DialogDescription>
            Voer de details voor de dienst in en klik op opslaan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="dienst-toevoegen-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormItem>
                <FormLabel>Medewerker</FormLabel>
                <Input value={effectiveMedewerkerName} disabled />
            </FormItem>
            <FormField
              control={form.control}
              name="werksoort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dienst omschrijving</FormLabel>
                  <FormControl>
                    <Input placeholder='Bijv. Schoffelen' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="starttijd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starttijd</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="eindtijd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Eindtijd</FormLabel>
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
                name="voertuignummer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voertuignummer</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecteer een voertuig" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Geen voertuig</SelectItem>
                          {voertuigen.map((v) => (
                            <SelectItem key={v.id} value={v.voertuignummer || v.id}>
                              {v.voertuignummer || v.id} ({v.merk} {v.model})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

          </form>
        </Form>
        <DialogFooter className="pt-4 sm:justify-between">
              <div>
                {dienst && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive" disabled={isSubmitting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Verwijderen
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Deze actie kan niet ongedaan worden gemaakt. Dit zal de dienst permanent verwijderen.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Doorgaan</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
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
                <Button type="submit" form="dienst-toevoegen-form" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {dienst ? 'Opslaan...' : 'Toevoegen...'}
                    </>
                  ) : (
                    dienst ? 'Opslaan' : 'Toevoegen'
                  )}
                </Button>
              </div>
            </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
