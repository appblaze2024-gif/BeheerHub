'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking, useUser } from '@/firebase';
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
  intakenummer: z.string().optional(),
  
  // Inhoud
  hoofdcategorie: z.string().min(1, 'Hoofdcategorie is verplicht'),
  subcategorie: z.string().min(1, 'Subcategorie is verplicht'),
  adres: z.string().min(1, 'Adres is verplicht'),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  extra_informatie: z.string().min(1, 'Extra informatie is verplicht'),

  // Afhandeling
  status: z.string().min(1, 'Status is verplicht'),
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
const statusOptions = [
    "Nieuw",
    "Intern doorgezet",
    "In behandeling",
    "Gepland op korte termijn",
    "Gepland op langere termijn",
    "Dubbel gemeld",
    "Afgerond",
    "Niet in beheer"
];

interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
}


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MeldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  melding?: any | null;
}

export function MeldingDialog({
  open,
  onOpenChange,
  melding,
}: MeldingDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });
  
  const hoofdcategorie = form.watch('hoofdcategorie');
  const adresQuery = form.watch('adres');

  const fetchCoordinates = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!address) return null;
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        return { lat, lng };
      }
    } catch (error) {
      console.error('Error fetching coordinates:', error);
    }
    return null;
  };

  const generateIntakeNummer = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
    return `${year}${month}${day}${randomPart}`;
  };

  React.useEffect(() => {
    if (open) {
      const userName = user?.displayName || user?.email || '';
      if (melding) {
          form.reset({
              ...melding,
              adres: `${melding.straatnaam || ''}${melding.huisnummer ? ' ' + melding.huisnummer : ''}, ${melding.postcode || ''}, ${melding.plaats || ''}`.trim(),
              aangenomen_door: melding.aangenomen_door || userName,
          });
      } else {
        form.reset({
            tijdstip: format(new Date(), 'HH:mm:ss'),
            melder: userName,
            aangenomen_door: userName,
            intakenummer: generateIntakeNummer(),
            extern_meldingsnummer: '',
            hoofdcategorie: '',
            subcategorie: '',
            adres: '',
            postcode: '',
            plaats: '',
            extra_informatie: '',
            status: 'Nieuw',
            afhandeling_datum: '',
            afgehandeld_door: '',
            afhandeling_bijzonderheden: '',
        });
      }
    } else {
        form.reset();
        setIsSubmitting(false);
        setSuggestions([]);
        setIsSearching(false);
    }
  }, [open, melding, form, user]);

  
   React.useEffect(() => {
    if (form.formState.isDirty && form.getValues('hoofdcategorie') !== (melding?.hoofdcategorie || '')) {
        form.setValue('subcategorie', '');
    }
  }, [hoofdcategorie, form, melding]);

  React.useEffect(() => {
    if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
    }

    if (!adresQuery || !form.formState.dirtyFields.adres) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            adresQuery
          )}&format=json&countrycodes=nl&limit=5`
        );
        const data: Suggestion[] = await response.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Fout bij zoeken:", error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [adresQuery, form.formState.dirtyFields.adres]);

  const handleSuggestionClick = (suggestion: Suggestion) => {
    form.setValue('adres', suggestion.display_name, { shouldValidate: true, shouldDirty: true });
    setSuggestions([]);
  };

  const onSubmit = async (data: MeldingFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    const coordinates = await fetchCoordinates(data.adres);

    if (!coordinates) {
        form.setError('adres', { type: 'manual', message: 'Kon adres niet vinden. Controleer de invoer.'});
        setIsSubmitting(false);
        return;
    }
    
    // Naar adres parsen voor afzonderlijke velden
    const addressParts = data.adres.split(',').map(s => s.trim());
    const straatnaam = addressParts[0] || '';
    const postcode = addressParts.length > 1 ? addressParts[1] : '';
    const plaats = addressParts.length > 2 ? addressParts[2] : '';


    const meldingData = {
      ...data,
      straatnaam,
      postcode,
      plaats,
      latitude: coordinates.lat,
      longitude: coordinates.lng,
      datum: melding ? melding.datum : format(new Date(), 'yyyy-MM-dd'),
    };
    // Verwijder het volledige 'adres' veld, aangezien het nu is opgesplitst
    delete (meldingData as any).adres;

    try {
        if (melding) {
            const meldingRef = doc(firestore, 'meldingen', melding.id);
            await updateDocumentNonBlocking(meldingRef, meldingData);
        } else {
            const meldingenColRef = collection(firestore, 'meldingen');
            await addDocumentNonBlocking(meldingenColRef, meldingData);
        }
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan melding:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{melding ? 'Melding Bewerken' : 'Formulier melding / Klacht'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="intakenummer" render={({ field }) => (
                        <FormItem><FormLabel>Intakenummer</FormLabel><FormControl><Input {...field} disabled /></FormControl></FormItem>
                    )} />
                     <FormField control={form.control} name="extern_meldingsnummer" render={({ field }) => (
                        <FormItem><FormLabel>Extern meldingsnummer</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="tijdstip" render={({ field }) => (
                        <FormItem><FormLabel>Tijdstip</FormLabel><FormControl><Input {...field} disabled /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="melder" render={({ field }) => (
                        <FormItem><FormLabel>Melder</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="aangenomen_door" render={({ field }) => (
                        <FormItem><FormLabel>Aangenomen door</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
               <div className="grid grid-cols-1 gap-4">
                  <FormField control={form.control} name="adres" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Adres</FormLabel>
                        <div className="relative w-full">
                            <FormControl>
                                <Input {...field} placeholder="Straatnaam, postcode, plaats" autoComplete="off" />
                            </FormControl>
                            {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                        </div>
                         {suggestions.length > 0 && (
                            <div className="relative z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {suggestions.map((suggestion) => (
                                <div
                                    key={suggestion.place_id}
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className="px-4 py-2 text-sm cursor-pointer hover:bg-muted"
                                >
                                    {suggestion.display_name}
                                </div>
                                ))}
                            </div>
                        )}
                        <FormMessage />
                    </FormItem>
                  )} />
              </div>
              <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                  <FormItem><FormLabel>Extra informatie melding</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <Separator />
            
            <div className="space-y-4">
                <h3 className="text-lg font-medium">Afhandeling</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem><FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                     )} />
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
