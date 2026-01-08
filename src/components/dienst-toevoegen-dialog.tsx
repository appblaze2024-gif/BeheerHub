'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
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
import type { Medewerker, Dienst } from '@/lib/types';

const dienstFormSchema = z.object({
  werksoort: z.string().min(1, 'Werksoort is verplicht.'),
  starttijd: z.string().min(1, 'Starttijd is verplicht.'),
  eindtijd: z.string().min(1, 'Eindtijd is verplicht.'),
  onbetaaldePauze: z.coerce.number().min(0).default(0),
  verbergEindtijd: z.boolean().default(false),
  herhaalDienst: z.boolean().default(false),
  goedkeuringVereist: z.boolean().default(false),
  informeerMedewerkers: z.boolean().default(false),
  voertuigId: z.string().optional(),
});

type DienstFormValues = z.infer<typeof dienstFormSchema>;

interface DienstToevoegenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medewerker: Medewerker;
  datum: Date;
  project: {
    id: string;
    werksoorten?: { id: string; werksoort: string }[];
  };
  dienst?: Dienst;
}

export function DienstToevoegenDialog({
  open,
  onOpenChange,
  medewerker,
  datum,
  project,
  dienst,
}: DienstToevoegenDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const voertuigenCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'voertuigen');
  }, [firestore]);

  const { data: voertuigen, isLoading: isLoadingVoertuigen } =
    useCollection(voertuigenCollection);

  const form = useForm<DienstFormValues>({
    resolver: zodResolver(dienstFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      if (dienst) {
        form.reset({
          ...dienst,
          onbetaaldePauze: dienst.onbetaaldePauze || 0,
          verbergEindtijd: dienst.verbergEindtijd || false,
          herhaalDienst: dienst.herhaalDienst || false,
          goedkeuringVereist: dienst.goedkeuringVereist || false,
          informeerMedewerkers: dienst.informeerMedewerkers || false,
          voertuigId: dienst.voertuigId || undefined,
        });
      } else {
        form.reset({
          werksoort: '',
          starttijd: '08:00',
          eindtijd: '17:00',
          onbetaaldePauze: 0,
          verbergEindtijd: false,
          herhaalDienst: false,
          goedkeuringVereist: false,
          informeerMedewerkers: false,
          voertuigId: undefined,
        });
      }
    }
  }, [open, dienst, form]);

  const onSubmit = async (data: DienstFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    const dienstData = {
      ...data,
      medewerkerId: medewerker.id,
      projectId: project.id,
      datum: format(datum, 'yyyy-MM-dd'),
      voertuigId: data.voertuigId || null,
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
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan dienst:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const medewerkerNaam = `${medewerker.voornaam || ''} ${
    medewerker.tussenvoegsel || ''
  } ${medewerker.achternaam || ''}`.trim();
  const formattedDate = format(datum, 'eeee d MMMM yyyy', { locale: nl });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dienst ? 'Dienst Bewerken' : 'Dienst Toevoegen'}: {formattedDate}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Medewerker</FormLabel>
                <Input value={medewerkerNaam} disabled />
              </FormItem>
              <FormField
                control={form.control}
                name="werksoort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dienst</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer een werksoort" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {project.werksoorten?.map((ws) => (
                          <SelectItem key={ws.id} value={ws.werksoort}>
                            {ws.werksoort}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

            <div className="flex items-center justify-between">
              <FormField
                control={form.control}
                name="verbergEindtijd"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Verberg eindtijd voor medewerkers</FormLabel>
                  </FormItem>
                )}
              />
              <div className="flex items-center gap-2">
                <FormLabel>Onbetaalde pauze</FormLabel>
                <FormField
                  control={form.control}
                  name="onbetaaldePauze"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="number" className="w-20" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <span>min</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <FormField
                control={form.control}
                name="herhaalDienst"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Herhaal dienst</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="goedkeuringVereist"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Goedkeuring vereist</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="informeerMedewerkers"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Informeer medewerkers</FormLabel>
                  </FormItem>
                )}
              />
            </div>
            
             <FormField
                control={form.control}
                name="voertuigId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voertuigen</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Geen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="geen">Geen</SelectItem>
                        {voertuigen?.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.merk} {v.model} [{v.id}]
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />


            <DialogFooter className="pt-4">
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
                    {dienst ? 'Opslaan...' : 'Toevoegen...'}
                  </>
                ) : (
                  dienst ? 'Opslaan' : 'Toevoegen'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
