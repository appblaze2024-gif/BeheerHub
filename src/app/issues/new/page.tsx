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
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


// Schema based on the provided image
const newMeldingSchema = z.object({
  // Left side
  soort_melder: z.string().optional(),
  hoofdcategorie: z.string().min(1, 'Hoofdindeling is verplicht'),
  subcategorie: z.string().min(1, 'Indeling is verplicht'),
  behandelende_afdeling: z.string().optional(),
  behandelaar: z.string().optional(),
  status: z.string().min(1, 'Status is verplicht'),
  voorvaldatum: z.date().optional(),
  voorvaltijd: z.string().optional(),
  meldingsdatum: z.date().optional(),
  meldingsuur: z.string().optional(),
  actiedatum: z.date().optional().nullable(),
  afhandeldatum: z.date().optional().nullable(),
  afhandeltijd: z.string().optional(),
  afhandelaar: z.string().optional(),

  // Right side
  soort_melding: z.string().optional(),
  ext_referentie: z.string().optional(),
  straatnaam: z.string().optional(),
  nummer: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  wijk: z.string().optional(), // 'Gebied' in UI
  pasnr: z.string().optional(),
  soort_adres: z.string().optional(),

  // Melder section on right
  melder: z.string().min(1, 'Naam melder is verplicht'),
  telefoon_melder: z.string().optional(),
  email_melder: z.string().email('Ongeldig emailadres').optional().or(z.literal('')),
  burgerservicenummer: z.string().optional(),

  // Memo
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
const hoofdcategorieOptions = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig", "Zoutkisten"];
const subcategorieOptions: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Verstopte put", "Wateroverlast"],
    "Zoutkisten": ["Zoutkist leeg"],
    "Overig": ["Overige meldingen"]
};

export default function NewIssuePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useProfile();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  
  const now = new Date();
  const meldingsnummer = format(now, 'yyyyMMddHHmmss');

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      status: 'In behandeling',
      voorvaldatum: now,
      voorvaltijd: format(now, 'HH:mm'),
      meldingsdatum: now,
      meldingsuur: format(now, 'HH:mm'),
      behandelende_afdeling: "Kantoor R'hout Reiniging",
      soort_melding: 'Balie',
    },
  });
  
  const watchedHoofdcategorie = form.watch('hoofdcategorie');

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore) return;
    if (!location) {
        toast({
            variant: "destructive",
            title: "Locatie vereist",
            description: "Selecteer een locatie via het zoekveld."
        });
        return;
    }
    setIsSubmitting(true);
    
    const meldingenCollectionRef = collection(firestore, 'meldingen');

    try {
      await addDocumentNonBlocking(meldingenCollectionRef, {
        ...data,
        intakenummer: meldingsnummer,
        datum: format(data.meldingsdatum || now, 'yyyy-MM-dd'),
        tijdstip: data.meldingsuur || format(now, 'HH:mm'),
        aangenomen_door: profile?.displayName || profile?.email || 'Onbekend',
        latitude: location.latitude,
        longitude: location.longitude,
      });

      toast({
        title: 'Melding aangemaakt',
        description: `Melding ${meldingsnummer} is succesvol aangemaakt.`,
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
    <div className="flex flex-col flex-1 min-h-0 p-4 bg-gray-100 dark:bg-gray-900">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Left Column */}
                <div className="xl:col-span-2 space-y-3">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     <FormItem>
                        <FormLabel className="text-xs">Meldingsnummer</FormLabel>
                        <FormControl><Input value={meldingsnummer} disabled /></FormControl>
                     </FormItem>
                    <FormField control={form.control} name="soort_melder" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Soort melder</FormLabel><FormControl><Input placeholder="Burger telefonisch" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                          <FormItem><FormLabel className="text-xs">Hoofdindeling</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Selecteer categorie" /></SelectTrigger></FormControl>
                                  <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                              </Select>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="subcategorie" render={({ field }) => (
                          <FormItem><FormLabel className="text-xs">Indeling</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={!watchedHoofdcategorie}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Selecteer indeling" /></SelectTrigger></FormControl>
                                  <SelectContent>{(subcategorieOptions[watchedHoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                              </Select>
                              <FormMessage />
                          </FormItem>
                      )} />
                   </div>
                    <FormField control={form.control} name="behandelende_afdeling" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Behandelende afdeling</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="behandelaar" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Behandelaar</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecteer status" /></SelectTrigger></FormControl>
                                <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <FormField control={form.control} name="voorvaldatum" render={({ field }) => (
                            <FormItem className="md:col-span-2"><FormLabel className="text-xs">Voorvaldatum</FormLabel><FormControl><Input type='date' value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="voorvaltijd" render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">Tijd</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <FormField control={form.control} name="meldingsdatum" render={({ field }) => (
                            <FormItem className="md:col-span-2"><FormLabel className="text-xs">Meldingsdatum</FormLabel><FormControl><Input type='date' value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="meldingsuur" render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">Tijd</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                         <FormField control={form.control} name="actiedatum" render={({ field }) => (
                            <FormItem className="md:col-span-2"><FormLabel className="text-xs">Actiedatum</FormLabel><FormControl><Input type='date' value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                         <FormField control={form.control} name="afhandeldatum" render={({ field }) => (
                            <FormItem className="md:col-span-2"><FormLabel className="text-xs">Afhandeldatum</FormLabel><FormControl><Input type='date' value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="afhandeltijd" render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">Tijd</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                     <FormField control={form.control} name="afhandelaar" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Afhandelaar</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                {/* Right Column */}
                <div className="lg:col-span-1 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                         <FormField control={form.control} name="soort_melding" render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">Soort melding</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                    <SelectContent><SelectItem value="Balie">Balie</SelectItem><SelectItem value="Telefoon">Telefoon</SelectItem><SelectItem value="Email">Email</SelectItem></SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="ext_referentie" render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">Ext. referentie</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    
                    <Card className='bg-gray-50 dark:bg-gray-800/50'><CardContent className='p-3 space-y-3'>
                        <h3 className="font-semibold">Adresgegevens</h3>
                         <FormField control={form.control} name="straatnaam" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Straatnaam</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                         <div className="grid grid-cols-3 gap-2">
                             <FormField control={form.control} name="nummer" render={({ field }) => ( <FormItem className='col-span-1'><FormLabel className="text-xs">Nummer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                             <div className='col-span-2' />
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                             <FormField control={form.control} name="postcode" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Postcode</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                             <FormField control={form.control} name="plaats" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Plaats</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                         </div>
                          <FormField control={form.control} name="wijk" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Gebied</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                           <FormField control={form.control} name="pasnr" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Pasnr</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                         <FormField control={form.control} name="soort_adres" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Soort adres</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                    </CardContent></Card>
                    
                     <Card className='bg-gray-50 dark:bg-gray-800/50'><CardContent className='p-3 space-y-3'>
                        <h3 className="font-semibold">Medewerker / Melder</h3>
                        <FormItem><FormLabel className="text-xs">Medewerker intake</FormLabel><FormControl><Input value={profile?.displayName || profile?.email || ''} disabled /></FormControl></FormItem>
                        <FormField control={form.control} name="melder" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Naam melder</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="telefoon_melder" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Telefoon melder</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="email_melder" render={({ field }) => ( <FormItem><FormLabel className="text-xs">E-mail melder</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="burgerservicenummer" render={({ field }) => ( <FormItem><FormLabel className="text-xs">Burgerservicenummer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                    </CardContent></Card>
                </div>
              </div>
            </CardContent>
          </Card>
          
            <Tabs defaultValue="memo" className="bg-card p-4 rounded-lg">
                <TabsList>
                    <TabsTrigger value="memo">Memo</TabsTrigger>
                    <TabsTrigger value="bijlagen">Bijlagen</TabsTrigger>
                    <TabsTrigger value="bestanden">Bestanden</TabsTrigger>
                    <TabsTrigger value="locatie">Locatie</TabsTrigger>
                    <TabsTrigger value="dubbele">Dubbele Meldingen</TabsTrigger>
                </TabsList>
                <TabsContent value="memo" className="mt-4">
                    <FormField control={form.control} name="extra_informatie" render={({ field }) => ( <FormItem><FormLabel className='sr-only'>Memo</FormLabel><FormControl><Textarea rows={5} placeholder="Bewoner aan de balie wil graag..." {...field} /></FormControl><FormMessage /></FormItem> )} />
                </TabsContent>
                <TabsContent value="bijlagen"><div className="text-center p-8 text-muted-foreground">Nog geen bijlagen.</div></TabsContent>
                <TabsContent value="bestanden"><div className="text-center p-8 text-muted-foreground">Nog geen bestanden.</div></TabsContent>
                <TabsContent value="locatie"><div className="text-center p-8 text-muted-foreground">Locatiegegevens worden hier getoond.</div></TabsContent>
                <TabsContent value="dubbele"><div className="text-center p-8 text-muted-foreground">Geen dubbele meldingen gevonden.</div></TabsContent>
            </Tabs>
            
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
