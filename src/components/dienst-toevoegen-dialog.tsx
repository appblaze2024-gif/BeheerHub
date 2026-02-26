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
  useUser,
} from '@/firebase';
import { useGlobalLoading } from '@/context/global-loading-context';
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
import type { Medewerker, Dienst, Voertuig, Machine, UserProfile } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from './ui/select';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';

const dienstFormSchema = z.object({
  werksoort: z.string().min(1, 'Omschrijving is verplicht.'),
  starttijd: z.string().min(1, 'Starttijd is verplicht.'),
  eindtijd: z.string().min(1, 'Eindtijd is verplicht.'),
  voertuignummer: z.string().optional().nullable(),
  notities: z.string().optional(),
  celkleur: z.string().optional(),
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
  currentUserProfile?: UserProfile | null;
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
  currentUserProfile,
}: DienstToevoegenDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { startProcessing } = useGlobalLoading();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [quickSubmitType, setQuickSubmitType] = React.useState<'Verlof' | 'ADV' | 'Ziek' | null>(null);
  const [useCustomColor, setUseCustomColor] = React.useState(false);

  const form = useForm<DienstFormValues>({
    resolver: zodResolver(dienstFormSchema),
  });


  React.useEffect(() => {
    if (open) {
      if (dienst) {
        const hasColor = !!dienst.celkleur;
        setUseCustomColor(hasColor);
        form.reset({
          ...dienst,
          voertuignummer: dienst.voertuignummer || null,
          notities: dienst.notities || '',
          celkleur: dienst.celkleur || currentUserProfile?.lastUsedDienstColor || '#000000',
        });
      } else if (medewerker && datum) {
        const dayName = format(datum, 'eeee', { locale: nl }).toLowerCase() as keyof NonNullable<Medewerker['urenPerDag']>;
        const defaultTimes = medewerker.urenPerDag?.[dayName];
        setUseCustomColor(false);
        form.reset({
          werksoort: '',
          starttijd: defaultTimes?.start || '07:00',
          eindtijd: defaultTimes?.eind || '15:30',
          voertuignummer: null,
          notities: '',
          celkleur: currentUserProfile?.lastUsedDienstColor || '#000000',
        });
      }
    } else {
        setIsSubmitting(false);
        setQuickSubmitType(null);
        setUseCustomColor(false);
    }
  }, [open, dienst, form, medewerker, datum, currentUserProfile]);

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
        celkleur: null,
    };

    try {
        const dienstenColRef = collection(firestore, 'projects', project.id, 'diensten');
        addDocumentNonBlocking(dienstenColRef, dienstData);
        onSuccess();
        startProcessing(600);
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
    
    const medewerkerId = medewerker?.id || dienst?.medewerkerId;
    if (!medewerkerId) {
        setIsSubmitting(false);
        return;
    }

    const dienstData = {
      ...data,
      medewerkerId: medewerkerId,
      projectId: project.id,
      datum: format(datum || new Date(dienst!.datum), 'yyyy-MM-dd'),
      voertuignummer: data.voertuignummer === " " ? null : data.voertuignummer,
      celkleur: useCustomColor ? data.celkleur : null,
    };

    try {
      if (dienst) {
        const dienstRef = doc(firestore, 'projects', project.id, 'diensten', dienst.id);
        updateDocumentNonBlocking(dienstRef, dienstData);
      } else {
        const dienstenColRef = collection(firestore, 'projects', project.id, 'diensten');
        addDocumentNonBlocking(dienstenColRef, dienstData);
      }

      if (useCustomColor && data.celkleur && user) {
        const userProfileRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userProfileRef, { lastUsedDienstColor: data.celkleur });
      }

      onSuccess();
      startProcessing(600);
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
      deleteDocumentNonBlocking(dienstRef);
      onSuccess();
      startProcessing(600);
    } catch (error) {
        console.error("Fout bij verwijderen dienst:", error);
    } finally {
      setIsSubmitting(false);
    }
  }
  
  if (!medewerker && !dienst) return null;
  
  const formattedDate = format(datum || (dienst ? new Date(dienst.datum) : new Date()), 'eeee d MMMM yyyy', { locale: nl });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dienst ? 'Dienst Bewerken' : 'Dienst Toevoegen'}: {formattedDate}</DialogTitle>
           <DialogDescription>Voer de details voor de dienst in en klik op opslaan.</DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
            {!dienst && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button type="button" variant="outline" className="w-full text-[10px] font-black uppercase" onClick={() => handleFullDaySubmit('Verlof')} disabled={isSubmitting}>
                            {isSubmitting && quickSubmitType === 'Verlof' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Verlof
                        </Button>
                        <Button type="button" variant="outline" className="w-full text-[10px] font-black uppercase" onClick={() => handleFullDaySubmit('ADV')} disabled={isSubmitting}>
                            {isSubmitting && quickSubmitType === 'ADV' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            ADV
                        </Button>
                        <Button type="button" variant="outline" className="w-full text-[10px] font-black uppercase" onClick={() => handleFullDaySubmit('Ziek')} disabled={isSubmitting}>
                            {isSubmitting && quickSubmitType === 'Ziek' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Ziek
                        </Button>
                    </div>
                    <div className="relative"><Separator /><span className="absolute left-1/2 -translate-x-1/2 -top-2 bg-background px-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">OF REGULIER</span></div>
                </>
            )}
            <Form {...form}>
            <form id="dienst-toevoegen-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medewerker</FormLabel>
                    <Input value={medewerker ? `${medewerker.voornaam} ${medewerker.achternaam}` : ''} disabled className="h-9 font-bold bg-slate-50" />
                </FormItem>
                <FormField
                control={form.control}
                name="werksoort"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Omschrijving</FormLabel>
                    <FormControl><Input placeholder='Bijv. Schoffelen' {...field} className="h-9 font-bold" /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />

                <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="starttijd" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Starttijd</FormLabel>
                        <FormControl><Input type="time" {...field} className="h-9 font-bold" /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="eindtijd" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Eindtijd</FormLabel>
                        <FormControl><Input type="time" {...field} className="h-9 font-bold" /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                </div>
                
                <FormField control={form.control} name="voertuignummer" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Voertuig/Machine</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                            <FormControl><SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Selecteer voertuig" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value=" ">Geen voertuig/machine</SelectItem>
                                {equipment.map((v) => (
                                    <SelectItem key={v.id} value={(v as any).voertuignummer || (v as any).machinenummer || v.id}>
                                        {(v as any).voertuignummer || (v as any).machinenummer || v.id} ({v.merk} {v.model})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
                
                <FormField control={form.control} name="notities" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Opmerking</FormLabel>
                        <FormControl><Textarea placeholder="Voeg een opmerking toe..." {...field} className="min-h-[80px] text-xs font-bold" /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                <div className="flex items-center space-x-2 pt-2">
                    <Checkbox id="use-celkleur" checked={useCustomColor} onCheckedChange={(checked) => setUseCustomColor(!!checked)} />
                    <label htmlFor="use-celkleur" className="text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer">Gebruik aangepaste kleur</label>
                </div>

                {useCustomColor && (
                  <FormField control={form.control} name="celkleur" render={({ field }) => (
                      <FormItem>
                          <FormControl>
                              <div className="flex items-center gap-2">
                                  <Input type="color" value={field.value || '#000000'} onChange={field.onChange} className="h-10 w-12 p-1" />
                                  <Input type="text" value={field.value || ''} onChange={field.onChange} placeholder="#RRGGBB" className="flex-1 h-10 font-mono text-xs" />
                              </div>
                          </FormControl>
                      </FormItem>
                  )} />
                )}
            </form>
            </Form>
        </div>

        <DialogFooter className="pt-4 sm:justify-between px-6 pb-6">
              <div>
                {dienst && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="text-red-600 hover:bg-red-50" disabled={isSubmitting}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Dienst verwijderen?</AlertDialogTitle><AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-600">Verwijderen</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="font-bold">Annuleren</Button>
                <Button type="submit" form="dienst-toevoegen-form" disabled={isSubmitting} className="font-black uppercase tracking-tight px-8">
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan</> : (dienst ? 'Opslaan' : 'Toevoegen')}
                </Button>
              </div>
            </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
