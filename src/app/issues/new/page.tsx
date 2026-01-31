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


const newMeldingSchema = z.object({
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

  soort_melding: z.string().optional(),
  ext_referentie: z.string().optional(),
  straatnaam: z.string().optional(),
  nummer: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  wijk: z.string().optional(),
  pasnr: z.string().optional(),
  soort_adres: z.string().optional(),
  
  melder: z.string().min(1, 'Naam melder is verplicht'),
  telefoon_melder: z.string().optional(),
  email_melder: z.string().email('Ongeldig emailadres').optional().or(z.literal('')),
  burgerservicenummer: z.string().optional(),

  extra_informatie: z.string().min(1, 'Memo is verplicht'),
});

type NewMeldingFormValues = z.infer<typeof newMeldingSchema>;

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

const FormRow = ({ label, children, labelFor }: { label: string; children: React.ReactNode; labelFor?: string }) => (
    <div className="grid grid-cols-[140px_1fr] items-center gap-x-2">
        <FormLabel htmlFor={labelFor} className="text-xs text-right">{label}</FormLabel>
        {children}
    </div>
);

export default function NewIssuePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useProfile();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

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
      melder: 'Bijlsma',
      telefoon_melder: '0653315267',
      extra_informatie: 'Bewoner aan de balie wil graag een eigen zoutkist laten vullen, het gaat hier om eigen bak van 10 kilo van dit gebouw met appartementen: zegt dat dit door ons 10 jaar geleden! werd gedaan (denkt ie zelf). Ik vraag het na en bel meneer terug. Ana M Receptie',
      hoofdcategorie: 'Zoutkisten',
      subcategorie: 'Zoutkist leeg'
    },
  });
  
  const watchedHoofdcategorie = form.watch('hoofdcategorie');

  const onSubmit = async (data: NewMeldingFormValues) => {
    if (!firestore) return;
    
    setIsSubmitting(true);
    
    const meldingenCollectionRef = collection(firestore, 'meldingen');

    try {
      await addDocumentNonBlocking(meldingenCollectionRef, {
        ...data,
        intakenummer: meldingsnummer,
        datum: format(data.meldingsdatum || now, 'yyyy-MM-dd'),
        tijdstip: data.meldingsuur || format(now, 'HH:mm'),
        aangenomen_door: profile?.displayName || profile?.email || 'Onbekend',
        latitude: 0,
        longitude: 0,
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
    <div className="flex flex-col h-full overflow-hidden text-sm bg-gray-100 dark:bg-gray-900">
        <div className="flex-shrink-0 px-4 py-1.5 border-b flex justify-between items-center bg-gray-200/60 dark:bg-gray-800/60">
            <h1 className="font-semibold text-xs">Melding : {meldingsnummer}</h1>
            <span className="text-xs text-muted-foreground">Laatst gewijzigd door A.M. Ayala Trujillo op 30-01-2026 om 09:08:33.</span>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
            <div className="p-3 grid grid-cols-12 gap-4">
               {/* Left Column */}
               <div className="col-span-7 space-y-1.5">
                   <FormRow label="Meldingsnummer">
                        <Input value={meldingsnummer} disabled className="h-7 text-xs"/>
                   </FormRow>
                    <FormRow label="Soort melder">
                       <div className="flex items-center">
                            <FormField control={form.control} name="soort_melder" render={({ field }) => (
                                <FormControl><Input placeholder="Burger telefonisch" {...field} className="h-7 text-xs rounded-r-none" /></FormControl>
                            )} />
                            <Button size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                        </div>
                    </FormRow>
                    <FormRow label="Hoofdindeling">
                        <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer categorie" /></SelectTrigger></FormControl>
                                <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                            </Select>
                        )} />
                    </FormRow>
                    <FormRow label="Indeling">
                         <div className="flex items-center">
                             <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value} disabled={!watchedHoofdcategorie}>
                                    <FormControl><SelectTrigger className="h-7 text-xs rounded-r-none"><SelectValue placeholder="Selecteer indeling" /></SelectTrigger></FormControl>
                                    <SelectContent>{(subcategorieOptions[watchedHoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                </Select>
                            )} />
                            <Button size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                        </div>
                    </FormRow>
                    <FormRow label="Behandelende afdeling">
                         <FormField control={form.control} name="behandelende_afdeling" render={({ field }) => (
                            <FormControl><Input {...field} className="h-7 text-xs" /></FormControl>
                        )} />
                    </FormRow>
                    <FormRow label="Behandelaar">
                        <div className="flex items-center">
                            <FormField control={form.control} name="behandelaar" render={({ field }) => (
                                <FormControl><Input {...field} className="h-7 text-xs rounded-r-none" /></FormControl>
                            )} />
                            <Button size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                        </div>
                    </FormRow>
                    <FormRow label="Status">
                        <FormField control={form.control} name="status" render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecteer status" /></SelectTrigger></FormControl>
                                <SelectContent>{statusOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                            </Select>
                        )} />
                    </FormRow>
                    <FormRow label="Voorvaldatum">
                        <div className="flex gap-2 items-center">
                            <FormField control={form.control} name="voorvaldatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl>)} />
                             <FormField control={form.control} name="voorvaltijd" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} /></FormControl>)} />
                        </div>
                    </FormRow>
                    <FormRow label="Meldingsdatum">
                        <div className="flex gap-2 items-center">
                             <FormField control={form.control} name="meldingsdatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl>)} />
                             <FormField control={form.control} name="meldingsuur" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} /></FormControl>)} />
                        </div>
                    </FormRow>
                     <FormRow label="Actiedatum">
                        <FormField control={form.control} name="actiedatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl>)} />
                    </FormRow>
                    <FormRow label="Afhandeldatum">
                        <div className="flex gap-2 items-center">
                             <FormField control={form.control} name="afhandeldatum" render={({ field }) => (<FormControl><Input type='date' className="h-7 text-xs" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={e => field.onChange(e.target.valueAsDate)} /></FormControl>)} />
                            <FormField control={form.control} name="afhandeltijd" render={({ field }) => (<FormControl><Input type="time" className="h-7 text-xs w-24" {...field} /></FormControl>)} />
                        </div>
                    </FormRow>
                    <FormRow label="Afhandelaar">
                        <div className="flex items-center">
                            <FormField control={form.control} name="afhandelaar" render={({ field }) => (<FormControl><Input {...field} className="h-7 text-xs rounded-r-none" /></FormControl>)} />
                            <Button size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                        </div>
                    </FormRow>
               </div>

               {/* Right Column */}
                <div className="col-span-5 space-y-2">
                     <div className="grid grid-cols-[140px_1fr] items-center gap-x-2">
                        <div/>
                        <div className="grid grid-cols-2 gap-2">
                             <FormRow label="Soort melding">
                                <FormField control={form.control} name="soort_melding" render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="h-7 text-xs"><SelectValue/></SelectTrigger></FormControl>
                                        <SelectContent><SelectItem value="Balie">Balie</SelectItem><SelectItem value="Telefoon">Telefoon</SelectItem><SelectItem value="Email">Email</SelectItem></SelectContent>
                                    </Select>
                                )} />
                            </FormRow>
                            <FormRow label="Ext. referentie">
                                 <FormField control={form.control} name="ext_referentie" render={({ field }) => (<FormControl><Input {...field} className="h-7 text-xs" /></FormControl>)} />
                            </FormRow>
                        </div>
                    </div>
                    <div className='p-2 border rounded-md bg-gray-50 dark:bg-gray-800/30 space-y-1.5'>
                        <h3 className="font-semibold text-xs mb-2">Adresgegevens</h3>
                        <FormRow label="Straatnaam">
                            <div className="flex items-center">
                                <FormField control={form.control} name="straatnaam" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs rounded-r-none" /></FormControl> )} />
                                <Button size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                            </div>
                        </FormRow>
                        <FormRow label="Nummer">
                             <div className="flex items-center gap-2">
                                <FormField control={form.control} name="nummer" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs w-20" /></FormControl> )} />
                                <Input className="h-7 text-xs" />
                            </div>
                        </FormRow>
                        <FormRow label="Postcode">
                             <div className="flex items-center gap-2">
                                <FormField control={form.control} name="postcode" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" /></FormControl> )} />
                                <FormField control={form.control} name="plaats" render={({ field }) => (
                                    <div className="flex items-center">
                                        <FormControl><Input placeholder="Nieuw-Vennep" {...field} className="h-7 text-xs rounded-r-none" /></FormControl>
                                        <Button size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                                    </div>
                                )} />
                            </div>
                        </FormRow>
                        <FormRow label="Gebied">
                             <div className="flex items-center">
                                <FormField control={form.control} name="wijk" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs rounded-r-none" /></FormControl> )} />
                                <Button size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                            </div>
                        </FormRow>
                        <FormRow label="Pasnr">
                             <FormField control={form.control} name="pasnr" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" /></FormControl> )} />
                        </FormRow>
                        <FormRow label="Soort adres">
                             <FormField control={form.control} name="soort_adres" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" /></FormControl> )} />
                        </FormRow>
                    </div>

                    <div className='p-2 border rounded-md bg-gray-50 dark:bg-gray-800/30 space-y-1.5'>
                        <h3 className="font-semibold text-xs mb-2">Medewerker / Melder</h3>
                        <FormRow label="Medewerker intake">
                             <div className="flex items-center">
                                <Input value={profile?.displayName || profile?.email || ''} disabled className="h-7 text-xs rounded-r-none" />
                                <Button size="icon" variant="outline" className="h-7 w-7 rounded-l-none border-l-0"><Search className="h-4 w-4"/></Button>
                            </div>
                        </FormRow>
                        <FormRow label="Naam melder">
                             <FormField control={form.control} name="melder" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" /></FormControl> )} />
                        </FormRow>
                        <FormRow label="Telefoon melder">
                            <FormField control={form.control} name="telefoon_melder" render={({ field }) => ( <FormControl><Input type="tel" {...field} className="h-7 text-xs" /></FormControl> )} />
                        </FormRow>
                        <FormRow label="E-mail melder">
                             <FormField control={form.control} name="email_melder" render={({ field }) => ( <FormControl><Input type="email" {...field} className="h-7 text-xs" /></FormControl> )} />
                        </FormRow>
                        <FormRow label="Burgerservicenummer">
                            <FormField control={form.control} name="burgerservicenummer" render={({ field }) => ( <FormControl><Input {...field} className="h-7 text-xs" /></FormControl> )} />
                        </FormRow>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 px-3 pb-3">
                 <Tabs defaultValue="memo" className="flex-1 flex flex-col min-h-0">
                    <TabsList>
                        <TabsTrigger value="memo">Memo</TabsTrigger>
                        <TabsTrigger value="bijlagen">Bijlagen</TabsTrigger>
                        <TabsTrigger value="bestanden">Bestanden</TabsTrigger>
                        <TabsTrigger value="locatie">Locatie</TabsTrigger>
                        <TabsTrigger value="dubbele">Dubbele Meldingen</TabsTrigger>
                    </TabsList>
                    <TabsContent value="memo" className="flex-1 mt-1">
                        <FormField control={form.control} name="extra_informatie" render={({ field }) => ( <FormItem className="h-full flex flex-col"><FormLabel className='sr-only'>Memo</FormLabel><FormControl><Textarea placeholder="Bewoner aan de balie wil graag..." {...field} className="flex-1 resize-none text-xs" /></FormControl><FormMessage /></FormItem> )} />
                    </TabsContent>
                    <TabsContent value="bijlagen"><div className="text-center p-4 text-muted-foreground text-xs">Nog geen bijlagen.</div></TabsContent>
                    <TabsContent value="bestanden"><div className="text-center p-4 text-muted-foreground text-xs">Nog geen bestanden.</div></TabsContent>
                    <TabsContent value="locatie"><div className="text-center p-4 text-muted-foreground text-xs">Locatiegegevens worden hier getoond.</div></TabsContent>
                    <TabsContent value="dubbele"><div className="text-center p-4 text-muted-foreground text-xs">Geen dubbele meldingen gevonden.</div></TabsContent>
                </Tabs>
            </div>
            
            <div className="flex-shrink-0 flex justify-end gap-2 px-3 pb-2 border-t pt-2 bg-gray-50 dark:bg-gray-800">
                <Button type="button" variant="ghost" onClick={() => router.back()} className="h-8">Annuleren</Button>
                <Button type="submit" disabled={isSubmitting} className="h-8">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Melding Opslaan
                </Button>
            </div>
          </form>
        </Form>
    </div>
  );
}
