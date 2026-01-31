'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarIcon, Loader2, MapPin, Search } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/page-header';
import { MapboxView } from '@/components/mapbox-view';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';


// Based on the image and Melding type
const newMeldingSchema = z.object({
  soort_melder: z.string().optional(),
  hoofdcategorie: z.string().min(1, 'Hoofdcategorie is verplicht'),
  subcategorie: z.string().min(1, 'Indeling is verplicht'),
  behandelende_afdeling: z.string().optional(),
  status: z.string().min(1, 'Status is verplicht'),
  voorvaldatum: z.date().optional(),
  voorvaltijd: z.string().optional(),
  straatnaam: z.string().optional(),
  nummer: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  wijk: z.string().optional(),
  melder: z.string().min(1, 'Naam melder is verplicht'),
  telefoon_melder: z.string().optional(),
  email_melder: z.string().email('Ongeldig emailadres').optional().or(z.literal('')),
  extra_informatie: z.string().min(1, 'Memo is verplicht'),
});

type NewMeldingFormValues = z.infer<typeof newMeldingSchema>;

interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
  address: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    suburb?: string;
  };
}

const statusOptions = [
    "Nieuw", "Intern doorgezet", "In behandeling", "Gepland op korte termijn",
    "Gepland op langere termijn", "Dubbel gemeld", "Afgerond", "Niet in beheer"
];
const hoofdcategorieOptions = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig"];
const subcategorieOptions: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Verstopte put", "Wateroverlast"],
    "Overig": ["Overige meldingen"]
};

export default function NewIssuePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useProfile();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Location state
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [addressSearchQuery, setAddressSearchQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      status: 'Nieuw',
      voorvaldatum: new Date(),
      voorvaltijd: format(new Date(), 'HH:mm'),
    },
  });
  
  const watchedHoofdcategorie = form.watch('hoofdcategorie');

  // Address search logic from bestekmelding-dialog
  React.useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (justSelectedSuggestion.current) {
      justSelectedSuggestion.current = false;
      return;
    }
    if (!addressSearchQuery.trim()) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressSearchQuery)}&format=json&countrycodes=nl&limit=5&addressdetails=1`);
        const data: Suggestion[] = await response.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Fout bij zoeken:", error);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [addressSearchQuery]);

  const handleSuggestionClick = (suggestion: Suggestion) => {
    justSelectedSuggestion.current = true;
    setAddressSearchQuery(suggestion.display_name);
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);

    if (!isNaN(lat) && !isNaN(lon)) {
        setLocation({ latitude: lat, longitude: lon });
        form.setValue('straatnaam', suggestion.address.road || '');
        form.setValue('nummer', suggestion.address.house_number || '');
        form.setValue('postcode', suggestion.address.postcode || '');
        form.setValue('plaats', suggestion.address.city || '');
        form.setValue('wijk', suggestion.address.suburb || '');
    }
    setSuggestions([]);
  };

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore) return;
    if (!location) {
        toast({
            variant: "destructive",
            title: "Locatie vereist",
            description: "Selecteer een locatie op de kaart of via het zoekveld."
        });
        return;
    }
    setIsSubmitting(true);
    
    const now = new Date();
    const intakenummer = `${format(now, 'yyyyMMddHHmmss')}`;
    const meldingenCollectionRef = collection(firestore, 'meldingen');

    try {
      await addDocumentNonBlocking(meldingenCollectionRef, {
        ...data,
        intakenummer: intakenummer,
        datum: format(now, 'yyyy-MM-dd'),
        tijdstip: format(now, 'HH:mm'),
        aangenomen_door: profile?.displayName || profile?.email || 'Onbekend',
        latitude: location.latitude,
        longitude: location.longitude,
      });

      toast({
        title: 'Melding aangemaakt',
        description: `Melding ${intakenummer} is succesvol aangemaakt.`,
      });
      router.push('/issues');
    } catch (error) {
      console.error('Fout bij aanmaken melding:', error);
      toast({
        variant: 'destructive',
        title: 'Fout opgetreden',
        description: 'Kon de melding niet aanmaken.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-6">
      <PageHeader title="Nieuwe Melding Maken" />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Melding</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="soort_melder" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Soort Melder</FormLabel>
                            <FormControl><Input placeholder="Burger telefonisch" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div />
                     <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Hoofdindeling</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecteer categorie" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="subcategorie" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Indeling</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value} disabled={!watchedHoofdcategorie}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecteer indeling" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {(subcategorieOptions[watchedHoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="behandelende_afdeling" render={({ field }) => (
                        <FormItem className="col-span-2">
                            <FormLabel>Behandelende Afdeling</FormLabel>
                            <FormControl><Input placeholder="Kantoor R'hout Reiniging" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                  </CardContent>
                </Card>

                 <Card>
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecteer status" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div />
                    <FormField control={form.control} name="voorvaldatum" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Voorvaldatum</FormLabel>
                             <Popover>
                                <PopoverTrigger asChild>
                                <FormControl>
                                    <Button variant={'outline'} className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground' )}>
                                    {field.value ? (format(field.value, 'PPP', { locale: nl })) : (<span>Kies een datum</span>)}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="voorvaltijd" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Voorvaltijd</FormLabel>
                            <FormControl><Input type="time" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                  </CardContent>
                </Card>
              </div>

              {/* Right Column */}
               <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Adresgegevens</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="space-y-2">
                        <FormLabel htmlFor="address-search">Zoek Adres</FormLabel>
                        <div className="relative w-full">
                            <Input id="address-search" placeholder="Zoek een adres..." value={addressSearchQuery} onChange={(e) => setAddressSearchQuery(e.target.value)} autoComplete="off"/>
                            {isSearching ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" /> : <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />}
                            {suggestions.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    {suggestions.map((suggestion) => (
                                    <div key={suggestion.place_id} onClick={() => handleSuggestionClick(suggestion)} className="px-4 py-2 text-sm cursor-pointer hover:bg-muted">
                                        {suggestion.display_name}
                                    </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="aspect-video w-full rounded-md border overflow-hidden">
                        <MapboxView latitude={location?.latitude} longitude={location?.longitude} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField control={form.control} name="straatnaam" render={({ field }) => ( <FormItem><FormLabel>Straatnaam</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                      <FormField control={form.control} name="nummer" render={({ field }) => ( <FormItem><FormLabel>Nummer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                      <FormField control={form.control} name="postcode" render={({ field }) => ( <FormItem><FormLabel>Postcode</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                    </div>
                     <FormField control={form.control} name="plaats" render={({ field }) => ( <FormItem><FormLabel>Plaats</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                  </CardContent>
                </Card>

                 <Card>
                  <CardHeader>
                    <CardTitle>Melder</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <FormField control={form.control} name="melder" render={({ field }) => ( <FormItem><FormLabel>Naam Melder</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                     <FormField control={form.control} name="telefoon_melder" render={({ field }) => ( <FormItem><FormLabel>Telefoon Melder</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem> )} />
                      <FormField control={form.control} name="email_melder" render={({ field }) => ( <FormItem className="col-span-2"><FormLabel>E-mail Melder</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  </CardContent>
                </Card>
              </div>
            </div>
            
            <Card>
                <CardHeader><CardTitle>Memo</CardTitle></CardHeader>
                <CardContent>
                    <FormField control={form.control} name="extra_informatie" render={({ field }) => ( <FormItem><FormControl><Textarea rows={5} placeholder="Bewoner aan de balie wil graag..." {...field} /></FormControl><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>
            
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => router.back()}>Annuleren</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Melding Opslaan
                </Button>
            </div>
          </form>
        </Form>
    </div>
  );
}
