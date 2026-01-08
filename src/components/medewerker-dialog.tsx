'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Info, Loader2, CalendarIcon } from 'lucide-react';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { format } from 'date-fns';

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
import type { Medewerker } from '@/lib/types';
import { Separator } from './ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { Textarea } from './ui/textarea';

const medewerkerFormSchema = z.object({
  voornaam: z.string().min(1, 'Voornaam is verplicht.'),
  tussenvoegsel: z.string().optional(),
  achternaam: z.string().min(1, 'Achternaam is verplicht.'),
  email: z.string().email('Voer een geldig e-mailadres in.').optional().or(z.literal('')),
  telefoonnummer: z.string().optional(),
  mobiel: z.string().optional(),
  taal: z.string().default('Nederlands'),
  functie: z.string().optional(),
  status: z.string().default('Niet uitgenodigd'),
  soortMedewerker: z.string().optional(),
  kostprijs: z.coerce.number().optional(),
  verkoopprijs: z.coerce.number().optional(),
  indiensttreding: z.date().optional().nullable(),
  uitdiensttreding: z.date().optional().nullable(),
  contractType: z.string().optional(),
  urenPerDag: z.object({
    maandag: z.coerce.number().optional(),
    dinsdag: z.coerce.number().optional(),
    woensdag: z.coerce.number().optional(),
    donderdag: z.coerce.number().optional(),
    vrijdag: z.coerce.number().optional(),
    zaterdag: z.coerce.number().optional(),
    zondag: z.coerce.number().optional(),
  }).optional(),
  notities: z.string().optional(),
});

type MedewerkerFormValues = z.infer<typeof medewerkerFormSchema>;

interface MedewerkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medewerker?: Medewerker | null;
}

const navItems = ["Basis", "Details", "Vrije velden", "Contract"];

const functieOptions = ["Voorman", "Grondwerker", "Machinist", "Stratenmaker", "Chauffeur", "Kantoor"];
const statusOptions = ["Actief", "Inactief", "Niet uitgenodigd"];
const soortMedewerkerOptions = ["Eigen medewerker", "ZZP'er", "Inhuur"];
const contractTypeOptions = ["Vast", "Tijdelijk", "Oproep", "Nul-uren"];
const weekDagen = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;


export function MedewerkerDialog({
  open,
  onOpenChange,
  medewerker,
}: MedewerkerDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [addAnother, setAddAnother] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("Basis");
  
  const defaultUren = {
      maandag: 8, dinsdag: 8, woensdag: 8, donderdag: 8, vrijdag: 8, zaterdag: 0, zondag: 0
  };

  const form = useForm<MedewerkerFormValues>({
    resolver: zodResolver(medewerkerFormSchema),
    defaultValues: {
      voornaam: '',
      tussenvoegsel: '',
      achternaam: '',
      email: '',
      telefoonnummer: '',
      mobiel: '',
      taal: 'Nederlands',
      functie: '',
      status: 'Niet uitgenodigd',
      soortMedewerker: '',
      kostprijs: 0,
      verkoopprijs: 0,
      contractType: '',
      urenPerDag: defaultUren,
      notities: '',
    }
  });

  const dateToJSDate = (date: any): Date | undefined => {
    if (!date) return undefined;
    if (date.toDate) return date.toDate(); // Firestore Timestamp
    if (typeof date === 'string' || typeof date === 'number') {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    if (date instanceof Date && !isNaN(date.getTime())) {
        return date;
    }
    return undefined;
  }
  
  React.useEffect(() => {
    if (open) {
      setActiveTab("Basis");
      setAddAnother(false);
      const defaultValues = {
          voornaam: '',
          tussenvoegsel: '',
          achternaam: '',
          email: '',
          telefoonnummer: '',
          mobiel: '',
          taal: 'Nederlands',
          functie: '',
          status: 'Niet uitgenodigd',
          soortMedewerker: '',
          kostprijs: 0,
          verkoopprijs: 0,
          contractType: '',
          urenPerDag: defaultUren,
          notities: '',
          indiensttreding: undefined,
          uitdiensttreding: undefined,
      };

      if (medewerker) {
          form.reset({
            ...defaultValues,
            ...medewerker,
            indiensttreding: dateToJSDate(medewerker.indiensttreding),
            uitdiensttreding: dateToJSDate(medewerker.uitdiensttreding),
            urenPerDag: medewerker.urenPerDag ? { ...defaultUren, ...medewerker.urenPerDag } : defaultUren
          });
      } else {
          form.reset(defaultValues);
      }
    }
  }, [open, medewerker, form]);

  const onSubmit = async (data: MedewerkerFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    const dataToSave = {
      ...data,
      indiensttreding: data.indiensttreding || null,
      uitdiensttreding: data.uitdiensttreding || null,
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
            mobiel: '',
            taal: 'Nederlands',
            functie: '',
            status: 'Niet uitgenodigd',
            soortMedewerker: '',
            kostprijs: 0,
            verkoopprijs: 0,
            contractType: '',
            urenPerDag: defaultUren,
            notities: '',
            indiensttreding: undefined,
            uitdiensttreding: undefined,
        });
        setActiveTab("Basis");
        setIsSubmitting(false);
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Fout bij opslaan medewerker:', error);
      setIsSubmitting(false);
    }
  };
  
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'Basis':
        return (
          <div className='space-y-6'>
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
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                  control={form.control}
                  name="mobiel"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Mobiel</FormLabel>
                      <FormControl>
                          <Input type="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                      </FormItem>
                  )}
              />
              <FormField
                control={form.control}
                name="taal"
                render={({ field }) => (
                  <FormItem>
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
            </div>
          </div>
        );
      case 'Details':
        return (
          <div className='space-y-6'>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                  control={form.control}
                  name="functie"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Functie</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                  <SelectTrigger><SelectValue placeholder="Selecteer een functie" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                  {functieOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                              </SelectContent>
                          </Select>
                          <FormMessage />
                      </FormItem>
                  )}
              />
              <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                  <SelectTrigger><SelectValue placeholder="Selecteer een status" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                  {statusOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                              </SelectContent>
                          </Select>
                          <FormMessage />
                      </FormItem>
                  )}
              />
            </div>
            <FormField
                control={form.control}
                name="soortMedewerker"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Soort medewerker</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger><SelectValue placeholder="Selecteer een soort" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {soortMedewerkerOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                  control={form.control}
                  name="kostprijs"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Kostprijs per uur</FormLabel>
                          <FormControl>
                              <Input type='number' placeholder='0.00' {...field} />
                          </FormControl>
                          <FormMessage />
                      </FormItem>
                  )}
              />
              <FormField
                  control={form.control}
                  name="verkoopprijs"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Verkoopprijs per uur</FormLabel>
                          <FormControl>
                            <Input type='number' placeholder='0.00' {...field} />
                          </FormControl>
                          <FormMessage />
                      </FormItem>
                  )}
              />
            </div>
          </div>
        )
      case 'Contract':
        return (
          <div className='space-y-6'>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="indiensttreding"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Indiensttreding</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Kies een datum</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ?? undefined}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="uitdiensttreding"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Uitdiensttreding</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Kies een datum</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ?? undefined}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="contractType"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Soort contract</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger><SelectValue placeholder="Selecteer een type" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {contractTypeOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
              />
              <div>
                <FormLabel>Uren per dag</FormLabel>
                <div className="grid grid-cols-7 gap-2 mt-2">
                  {weekDagen.map((day, index) => (
                    <FormField
                      key={day}
                      control={form.control}
                      name={`urenPerDag.${day}`}
                      render={({ field }) => (
                        <FormItem className='text-center'>
                          <FormLabel className='text-xs capitalize'>{day.substring(0, 2)}</FormLabel>
                          <FormControl>
                            <Input type="number" className="text-center" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
               <FormField
                  control={form.control}
                  name="notities"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Notities</FormLabel>
                          <FormControl>
                              <Textarea placeholder="Voeg notities toe..." {...field} />
                          </FormControl>
                          <FormMessage />
                      </FormItem>
                  )}
              />
          </div>
        )
      default:
        return <div className='text-muted-foreground text-center p-8'>Selecteer een categorie.</div>;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className='flex items-center gap-2'>
            {medewerker ? 'Medewerker Bewerken' : 'Medewerker toevoegen'}
            <Info className="h-4 w-4 text-muted-foreground" />
          </DialogTitle>
        </DialogHeader>
        <div className="flex border-t">
            <div className="w-1/4 border-r p-6">
                <nav className="flex flex-col gap-1">
                    {navItems.map((item) => (
                        <Button
                            key={item}
                            type="button"
                            variant={activeTab === item ? "secondary" : "ghost"}
                            className="justify-start"
                            onClick={() => setActiveTab(item)}
                            disabled={item === 'Vrije velden'}
                        >
                            {item}
                        </Button>
                    ))}
                </nav>
            </div>
            <div className="w-3/4 p-6 max-h-[60vh] overflow-y-auto">
                <Form {...form}>
                  <form id="medewerker-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {renderActiveTab()}
                  </form>
                </Form>
            </div>
        </div>
        <Separator />
         <DialogFooter className="p-6 pt-0 flex justify-between w-full">
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
                <Button type="submit" form="medewerker-form" disabled={isSubmitting}>
                    {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan...</>
                    ) : 'Opslaan'}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
