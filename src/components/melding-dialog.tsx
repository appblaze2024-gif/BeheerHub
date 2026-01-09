'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
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
import { Separator } from './ui/separator';

const meldingFormSchema = z.object({
  // Melding
  tijdstip: z.string().min(1, 'Tijdstip is verplicht'),
  melder: z.string().min(1, 'Melder is verplicht'),
  aangenomen_door: z.string().min(1, 'Veld is verplicht'),
  extern_meldingsnummer: z.string().optional(),
  
  // Inhoud
  hoofdcategorie: z.string().min(1, 'Hoofdcategorie is verplicht'),
  subcategorie: z.string().min(1, 'Subcategorie is verplicht'),
  straatnaam: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  extra_informatie: z.string().min(1, 'Extra informatie is verplicht'),

  // Afhandeling
  afhandeling_datum: z.string().optional(),
  afgehandeld_door: z.string().optional(),
  afhandeling_bijzonderheden: z.string().optional(),
});


type MeldingFormValues = z.infer<typeof meldingFormSchema>;

const hoofdcategorieOptions = ["Gladheid", "Afval", "Groen", "Weg en verkeer", "Overig"];
const subcategorieOptions: Record<string, string[]> = {
    "Gladheid": ["Glad in de route", "Glad buiten de route", "Opvriezen wegdek"],
    "Afval": ["Zwerfafval", "Dumping", "Volle prullenbak"],
    "Groen": ["Onkruid", "Boomonderhoud", "Maaien"],
    "Weg en verkeer": ["Schade wegdek", "Verkeersbord", "Verlichting"],
    "Overig": ["Overige melding"]
};

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MeldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coordinates: { lat: number; lng: number } | null;
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
      tijdstip: format(new Date(), 'HH:mm:ss'),
      melder: 'Medewerker Gemeenten',
      aangenomen_door: '',
      extern_meldingsnummer: '',
      hoofdcategorie: '',
      subcategorie: '',
      straatnaam: '',
      postcode: '',
      plaats: '',
      extra_informatie: '',
      afhandeling_datum: '',
      afgehandeld_door: '',
      afhandeling_bijzonderheden: '',
    },
  });
  
  const hoofdcategorie = form.watch('hoofdcategorie');

  React.useEffect(() => {
    const fetchAddress = async () => {
      if (coordinates) {
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates.lng},${coordinates.lat}.json?access_token=${MAPBOX_TOKEN}`
          );
          const data = await response.json();
          if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const context = feature.context;
            
            form.setValue('straatnaam', feature.text || '');

            const postcode = context.find((c: any) => c.id.startsWith('postcode'))?.text;
            const plaats = context.find((c: any) => c.id.startsWith('place'))?.text;

            form.setValue('postcode', postcode || '');
            form.setValue('plaats', plaats || '');
          }
        } catch (error) {
          console.error('Error fetching address:', error);
        }
      }
    };
    if (open) {
        fetchAddress();
        form.setValue('tijdstip', format(new Date(), 'HH:mm:ss'));
    }
  }, [open, coordinates, form]);
  
   React.useEffect(() => {
    form.setValue('subcategorie', '');
  }, [hoofdcategorie, form]);

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
      datum: format(new Date(), 'yyyy-MM-dd'),
      intakenummer: `M${Date.now()}`,
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
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Formulier melding / Klacht</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <FormField control={form.control} name="tijdstip" render={({ field }) => (
                        <FormItem><FormLabel>Tijdstip</FormLabel><FormControl><Input {...field} disabled /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="melder" render={({ field }) => (
                        <FormItem><FormLabel>Melder</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="aangenomen_door" render={({ field }) => (
                        <FormItem><FormLabel>Aangenomen door</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="extern_meldingsnummer" render={({ field }) => (
                        <FormItem><FormLabel>Extern meldingsnummer</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                </div>
            </div>
            
            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Inhoud</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hoofdcategorie</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecteer een hoofdcategorie" /></SelectTrigger></FormControl>
                      <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="subcategorie" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subcategorie</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!hoofdcategorie}><FormControl><SelectTrigger><SelectValue placeholder="Selecteer een subcategorie" /></SelectTrigger></FormControl>
                      <SelectContent>{(subcategorieOptions[hoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <FormField control={form.control} name="straatnaam" render={({ field }) => (
                    <FormItem><FormLabel>Adres</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="postcode" render={({ field }) => (
                    <FormItem><FormLabel>Postcode</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="plaats" render={({ field }) => (
                    <FormItem><FormLabel>Plaats</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
              </div>
              <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                  <FormItem><FormLabel>Extra informatie melding</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <Separator />
            
            <div className="space-y-4">
                <h3 className="text-lg font-medium">Afhandeling</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <FormField control={form.control} name="afhandeling_datum" render={({ field }) => (
                       <FormItem><FormLabel>Datum</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="afgehandeld_door" render={({ field }) => (
                        <FormItem><FormLabel>Afgehandeld door</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                </div>
                 <FormField control={form.control} name="afhandeling_bijzonderheden" render={({ field }) => (
                    <FormItem><FormLabel>Bijzonderheden</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>
                )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan...</> : 'Melding Opslaan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
