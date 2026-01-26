'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { addDays, format, isWeekend } from 'date-fns';
import { nl } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { useFirestore, addDocumentNonBlocking, useCollection } from '@/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import type { Medewerker, Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from './ui/use-toast';

const afwezigheidFormSchema = z.object({
  dateRange: z.object({
    from: z.date({ required_error: 'Een startdatum is verplicht.' }),
    to: z.date().optional(),
  }),
  type: z.string().min(1, 'Type is verplicht.'),
  projectId: z.string().min(1, 'Project is verplicht.'),
  notities: z.string().optional(),
});

type AfwezigheidFormValues = z.infer<typeof afwezigheidFormSchema>;

interface AfwezigheidDialogProps {
  children: React.ReactNode;
  medewerker: Medewerker;
  onSuccess: () => void;
}

export function AfwezigheidDialog({
  children,
  medewerker,
  onSuccess,
}: AfwezigheidDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const form = useForm<AfwezigheidFormValues>({
    resolver: zodResolver(afwezigheidFormSchema),
  });

  const onSubmit = async (data: AfwezigheidFormValues) => {
    if (!firestore || !data.dateRange.from) {
      return;
    }
    setIsSubmitting(true);
    
    const { from, to } = data.dateRange;
    const endDate = to || from;
    let currentDate = from;

    const batch = writeBatch(firestore);
    const dienstenColRef = collection(firestore, 'projects', data.projectId, 'diensten');

    let count = 0;
    while (currentDate <= endDate) {
      if (!isWeekend(currentDate)) {
        const dayName = format(currentDate, 'eeee', { locale: nl }).toLowerCase() as keyof NonNullable<Medewerker['urenPerDag']>;
        const defaultTimes = medewerker.urenPerDag?.[dayName];

        const dienstData = {
          medewerkerId: medewerker.id,
          projectId: data.projectId,
          werksoort: data.type,
          datum: format(currentDate, 'yyyy-MM-dd'),
          starttijd: defaultTimes?.start && defaultTimes.start !== '' ? defaultTimes.start : '00:00',
          eindtijd: defaultTimes?.eind && defaultTimes.eind !== '' ? defaultTimes.eind : '00:00',
          onbetaaldePauze: 0,
          notities: data.notities || '',
        };
        const newDienstRef = doc(dienstenColRef);
        batch.set(newDienstRef, dienstData);
        count++;
      }
      currentDate = addDays(currentDate, 1);
    }
    
    if (count === 0) {
        toast({
            variant: "destructive",
            title: "Geen dagen geselecteerd",
            description: "De geselecteerde periode bevat geen werkdagen.",
        });
        setIsSubmitting(false);
        return;
    }

    try {
        await batch.commit();
        toast({
            title: 'Afwezigheid opgeslagen',
            description: `${count} dag(en) afwezigheid voor ${medewerker.voornaam} zijn toegevoegd aan de planning.`,
        });
        onSuccess();
        onOpenChange(false);
    } catch(e) {
        console.error(e);
        toast({
            variant: "destructive",
            title: "Fout bij opslaan",
            description: "Kon de afwezigheid niet opslaan.",
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    if(!open) {
        form.reset();
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Afwezigheid Toevoegen</DialogTitle>
          <DialogDescription>
            Voer de afwezigheidsperiode en details in voor {medewerker.voornaam}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="dateRange"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Periode</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          id="date"
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value?.from && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value?.from ? (
                            field.value.to ? (
                              <>
                                {format(field.value.from, "LLL dd, y", { locale: nl })} -{" "}
                                {format(field.value.to, "LLL dd, y", { locale: nl })}
                              </>
                            ) : (
                              format(field.value.from, "LLL dd, y", { locale: nl })
                            )
                          ) : (
                            <span>Kies een periode</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={field.value?.from}
                        selected={field.value as DateRange}
                        onSelect={field.onChange}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecteer een type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Verlof">Verlof</SelectItem>
                      <SelectItem value="ADV">ADV</SelectItem>
                      <SelectItem value="Ziek">Ziek</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingProjects}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecteer een project" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>)}
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
                  <FormLabel>Notities</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optionele notities" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
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
