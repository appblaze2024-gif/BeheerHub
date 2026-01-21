'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2 } from 'lucide-react';
import {
  useFirestore,
  deleteDocumentNonBlocking,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';
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
  AlertDialogTrigger,
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
import type { Medewerker, Dienst, Voertuig, Machine } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from './ui/select';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';

const dienstFormSchema = z.object({
  werksoort: z.string().min(1, 'Omschrijving is verplicht.'),
  starttijd: z.string().min(1, 'Starttijd is verplicht.'),
  eindtijd: z.string().min(1, 'Eindtijd is verplicht.'),
  voertuignummer: z.string().optional().nullable(),
  notities: z.string().optional(),
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
  equipment: (Voertuig & { __type?: 'voertuig' } | Machine & { __type?: 'machine' })[];
}

export function DienstToevoegenDialog({
  open,
  onOpenChange,
  medewerker,
  datum,
  project,
  dienst,
  onSuccess,
  equipment,
}: DienstToevoegenDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [quickSubmitType, setQuickSubmitType] = React.useState<'Verlof' | 'ADV' | 'Ziek' | null>(null);

  const form = useForm<DienstFormValues>({
    resolver: zodResolver(dienstFormSchema),
  });


  React.useEffect(() => {
    if (open) {
      if (dienst) {
        form.reset({
          ...dienst,
          voertuignummer: dienst.voertuignummer || null,
          notities: dienst.notities || '',
        });
      } else if (medewerker && datum) {
        const dayName = format(datum, 'eeee', { locale: nl }).toLowerCase() as keyof NonNullable<Medewerker['urenPerDag']>;
        const defaultTimes = medewerker.urenPerDag?.[dayName];
        
        form.reset({
          werksoort: '',
          starttijd: defaultTimes?.start || '07:00',
          eindtijd: defaultTimes?.eind || '15:30',
          voertuignummer: null,
          notities: '',
        });
      } else {
         form.reset({
          werksoort: '',
          starttijd: '07:00',
          eindtijd: '15:30',
          voertuignummer: null,
          notities: '',
        });
      }
    } else {
        setIsSubmitting(false);
        setQuickSubmitType(null);
    }
  }, [open, dienst, form, medewerker, datum]);

  const handleFullDaySubmit = async (werksoort: 'Verlof' | 'ADV' | 'Ziek') => {
    if (!firestore || !project?.id || !datum || !medewerker) return;
    
    setIsSubmitting(true);
    setQuickSubmitType(werksoort);

    const dayName = format(datum, 'eeee', { locale: nl }).toLowerCase() as keyof NonNullable<Medewerker['urenPerDag']>;
    const defaultTimes = medewerker.urenPerDag?.[dayName];

    const starttijd = (defaultTimes?.start && defaultTimes.start !== '') ? defaultTimes.start : '00:00';
    const eindtijd = (defaultTimes?.eind && defaultTimes.eind !== '') ? defaultTimes.eind : '23:59';
    
    const dienstData = {
        werksoort: werksoort,
        starttijd: starttijd,
        eindtijd: eindtijd,
        medewerkerId: medewerker.id,
        projectId: project.id,
        datum: format(datum, 'yyyy-MM-dd'),
        voertuignummer: null,
    };

    try {
        const dienstenColRef = collection(firestore, 'projects', project.id, 'diensten');
        await addDocumentNonBlocking(dienstenColRef, dienstData);
        onSuccess();
    } catch (error) {
        console.error(`Fout bij opslaan ${werksoort}:`, error);
    } finally {
        setIsSubmitting(false);
        setQuickSubmitType(null);
    }
  };

  const onSubmit = async (data: DienstFormValues) => {
    if (!firestore || !project?.id || (!datum && !dienst)) return;
    setIsSubmitting(true);
    
    const dienstData = {
      ...data,
      medewerkerId: medewerker?.id || dienst?.medewerkerId,
      projectId: project.id,
      datum: format(datum || new Date(dienst!.datum), 'yyyy-MM-dd'),
      voertuignummer: data.voertuignummer === " " ? null : data.voertuignummer,
    };

    try {
      if (dienst) {
        const dienstRef = doc(firestore, 'projects', project.id, 'diensten', dienst.id);
        await updateDocumentNonBlocking(dienstRef, dienstData);
      } else {
        const dienstenColRef = collection(
          firestore,
          'projects',
          project.id,
          'diensten'
        );
        await addDocumentNonBlocking(dienstenColRef, dienstData);
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
        
        <div className="py-4 space-y-4">
            {!dienst && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button type="button" variant="outline" className="w-full" onClick={() => handleFullDaySubmit('Verlof')} disabled={isSubmitting}>
                            {isSubmitting && quickSubmitType === 'Verlof' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Hele dag Verlof
                        </Button>
                        <Button type="button" variant="outline" className="w-full" onClick={() => handleFullDaySubmit('ADV')} disabled={isSubmitting}>
                            {isSubmitting && quickSubmitType === 'ADV' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Hele dag ADV
                        </Button>
                        <Button type="button" variant="outline" className="w-full" onClick={() => handleFullDaySubmit('Ziek')} disabled={isSubmitting}>
                            {isSubmitting && quickSubmitType === 'Ziek' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Hele dag Ziek
                        </Button>
                    </div>
                    <div className="relative">
                        <Separator />
                        <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-background px-2 text-xs text-muted-foreground">OF</span>
                    </div>
                </>
            )}
            <Form {...form}>
            <form id="dienst-toevoegen-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        <FormLabel>Voertuig/Machine</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecteer een voertuig of machine" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value=" ">Geen voertuig/machine</SelectItem>
                                {equipment.filter(e => e.__type === 'voertuig').length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Voertuigen</SelectLabel>
                                        {equipment.filter(e => e.__type === 'voertuig').map((v) => (
                                            <SelectItem key={v.id} value={(v as Voertuig).voertuignummer || v.id}>
                                            {(v as Voertuig).voertuignummer || v.id} ({v.merk} {v.model})
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                                {equipment.filter(e => e.__type === 'machine').length > 0 && (
                                     <SelectGroup>
                                        <SelectLabel>Machines</SelectLabel>
                                        {equipment.filter(e => e.__type === 'machine').map((m) => (
                                            <SelectItem key={m.id} value={(m as Machine).machinenummer || m.id}>
                                            {(m as Machine).machinenummer || m.id} ({m.merk} {m.model})
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                
                <FormField
                    control={form.control}
                    name="notities"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Opmerking</FormLabel>
                        <FormControl>
                        <Textarea placeholder="Voeg een opmerking toe..." {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />

            </form>
            </Form>
        </div>

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
                  {isSubmitting && !quickSubmitType ? (
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
