'use client';

import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, doc } from 'firebase/firestore';
import { Loader2, ScrollText, Sparkles, User, MapPin, Calendar, Check, X, Image as ImageIcon } from 'lucide-react';
import type { MeetingMinute, Contractor, AgendaItem } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { generateMinuteContent } from '@/ai/flows/generate-minute-content-flow';
import { useToast } from './ui/use-toast';

const DEFAULT_AGENDA = [
  "Opening/ Mededeling",
  "Vaststellen agenda",
  "Verslag vorig overleg",
  "Actiepunten",
  "Jaarplanning / voortgang",
  "Ontwikkeling in Areaal",
  "Stand van zaken project / kwaliteit uitgevoerd werk",
  "Schouw- en meldingsplan (Bestekmeting / Bestekmeldingen / Openstaand)",
  "Onkruidbestrijding (Elementverharding & ongebonden)",
  "Onkruidbestrijding goten",
  "KAM - VGM (VCA)",
  "Facturen, betalingen, financieel overzicht",
  "Contractafwijkingen en meer- en minderwerk",
  "Rondvraag",
  "Sluiting en volgende overleg"
];

const minuteSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  documentTitle: z.string().optional(),
  documentSubtitle: z.string().optional(),
  logoLeftUrl: z.string().optional(),
  logoRightUrl: z.string().optional(),
  date: z.string().min(1, 'Datum is verplicht'),
  location: z.string().optional(),
  attendees: z.string().optional(),
  createdBy: z.string().min(1, 'Verslaglegger is verplicht'),
  agendaItems: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string()
  })),
  actionPoints: z.string().optional(),
});

type MinuteFormValues = z.infer<typeof minuteSchema>;

export function MeetingMinuteDialog({
  open,
  onOpenChange,
  contractor,
  minute
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: Contractor;
  minute?: MeetingMinute | null;
}) {
  const firestore = useFirestore();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [improvingId, setImprovingId] = React.useState<string | null>(null);

  const form = useForm<MinuteFormValues>({
    resolver: zodResolver(minuteSchema),
    defaultValues: {
      title: '',
      documentTitle: 'Agenda operationeel Startwerkoverleg',
      documentSubtitle: 'Meerlanden afdeling Noordwijkerhout en Meerlanden',
      logoLeftUrl: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
      logoRightUrl: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
      date: format(new Date(), 'yyyy-MM-dd'),
      location: 'Aarbergerweg 5-7 Rijsenhout',
      attendees: '',
      createdBy: '',
      agendaItems: DEFAULT_AGENDA.map((title, i) => ({ id: `item-${i+1}`, title: `${i+1}. ${title}`, content: '' })),
      actionPoints: '',
    },
  });

  const { fields } = useFieldArray({
    control: form.control,
    name: "agendaItems"
  });

  React.useEffect(() => {
    if (open) {
      if (minute) {
        form.reset({
          title: minute.title,
          documentTitle: minute.documentTitle || 'Agenda operationeel Startwerkoverleg',
          documentSubtitle: minute.documentSubtitle || 'Meerlanden afdeling Noordwijkerhout en Meerlanden',
          logoLeftUrl: minute.logoLeftUrl || 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
          logoRightUrl: minute.logoRightUrl || 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
          date: minute.date,
          location: minute.location || 'Aarbergerweg 5-7 Rijsenhout',
          attendees: minute.attendees || '',
          createdBy: minute.createdBy || profile?.displayName || 'Django Stoutenburg',
          agendaItems: minute.agendaItems || DEFAULT_AGENDA.map((title, i) => ({ id: `item-${i+1}`, title: `${i+1}. ${title}`, content: '' })),
          actionPoints: minute.actionPoints || '',
        });
      } else {
        form.reset({
          title: `Operationeel Startwerkoverleg ${contractor.name}`,
          documentTitle: 'Agenda operationeel Startwerkoverleg',
          documentSubtitle: 'Meerlanden afdeling Noordwijkerhout en Meerlanden',
          logoLeftUrl: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
          logoRightUrl: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
          date: format(new Date(), 'yyyy-MM-dd'),
          location: 'Aarbergerweg 5-7 Rijsenhout',
          attendees: '',
          createdBy: profile?.displayName || 'Django Stoutenburg',
          agendaItems: DEFAULT_AGENDA.map((title, i) => ({ id: `item-${i+1}`, title: `${i+1}. ${title}`, content: '' })),
          actionPoints: '',
        });
      }
    }
  }, [open, minute, contractor, form, profile]);

  const handleAIImprove = async (index: number) => {
    const item = form.getValues(`agendaItems.${index}`);
    if (!item.content.trim()) {
        toast({ title: "Geen tekst", description: "Voer eerst wat steekwoorden in." });
        return;
    }

    setImprovingId(item.id);
    try {
        const result = await generateMinuteContent({
            subjectTitle: item.title,
            rawKeywords: item.content
        });
        form.setValue(`agendaItems.${index}.content`, result.polishedText);
        toast({ title: "Tekst verbeterd", description: "De AI heeft uw notulen geformaliseerd." });
    } catch (err) {
        console.error(err);
        toast({ variant: 'destructive', title: "AI Fout", description: "Kon de tekst niet verbeteren." });
    } finally {
        setImprovingId(null);
    }
  };

  const onSubmit = async (values: MinuteFormValues) => {
    if (!firestore || !contractor) return;
    setIsSubmitting(true);

    try {
      const minutesColRef = collection(firestore, 'contractors', contractor.id, 'minutes');
      
      const data = {
        ...values,
        contractorId: contractor.id,
        projectId: contractor.projectId,
        updatedAt: new Date().toISOString(),
      };

      if (minute) {
        await updateDocumentNonBlocking(doc(firestore, 'contractors', contractor.id, 'minutes', minute.id), data);
      } else {
        await addDocumentNonBlocking(minutesColRef, {
          ...data,
          createdAt: new Date().toISOString(),
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving meeting minute:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[95vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{form.watch('title')}</DialogTitle>
          <DialogDescription>Vergaderverslag voor {contractor.name}</DialogDescription>
        </DialogHeader>

        {/* Document Header with Editable parts */}
        <div className="bg-white border-b shrink-0 p-8 space-y-6">
            <div className="flex justify-between items-start gap-8">
                <div className="flex flex-col gap-2 w-48">
                    <div className="relative w-full h-12 border-2 border-dashed border-slate-100 rounded-lg hover:border-primary/20 transition-all group">
                        <Image src={form.watch('logoLeftUrl') || 'https://placehold.co/200x50'} alt="Logo Links" fill className="object-contain object-left" />
                        <div className="absolute inset-0 bg-white/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Input 
                                placeholder="Logo URL..." 
                                {...form.register('logoLeftUrl')} 
                                className="h-6 text-[8px] border-none bg-transparent focus:ring-0 text-center font-bold" 
                            />
                        </div>
                    </div>
                    <span className="text-[8px] font-black uppercase text-slate-300 text-center tracking-widest">Logo Links (URL)</span>
                </div>

                <div className="flex-1 text-center space-y-2">
                    <Input 
                        {...form.register('documentTitle')} 
                        placeholder="Document Titel..."
                        className="text-2xl font-black uppercase tracking-tight text-slate-700 text-center border-none hover:bg-slate-50 focus:bg-slate-50 h-auto p-1 leading-none shadow-none focus:ring-0"
                    />
                    <Input 
                        {...form.register('documentSubtitle')} 
                        placeholder="Subtitel..."
                        className="text-lg font-bold text-slate-500 text-center border-none hover:bg-slate-50 focus:bg-slate-50 h-auto p-1 leading-none shadow-none focus:ring-0"
                    />
                </div>

                <div className="flex flex-col gap-2 w-48">
                    <div className="relative w-full h-12 border-2 border-dashed border-slate-100 rounded-lg hover:border-primary/20 transition-all group">
                        <Image src={form.watch('logoRightUrl') || 'https://placehold.co/200x50'} alt="Logo Rechts" fill className="object-contain object-right" />
                        <div className="absolute inset-0 bg-white/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Input 
                                placeholder="Logo URL..." 
                                {...form.register('logoRightUrl')} 
                                className="h-6 text-[8px] border-none bg-transparent focus:ring-0 text-center font-bold" 
                            />
                        </div>
                    </div>
                    <span className="text-[8px] font-black uppercase text-slate-300 text-center tracking-widest">Logo Rechts (URL)</span>
                </div>
            </div>

            <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm font-bold text-slate-600 border-t pt-6">
                <span>Overleg:</span>
                <Input placeholder="Titel van het overleg..." {...form.register('title')} className="h-7 py-0 font-black uppercase border-slate-200" />
                
                <span>Vergaderdatum:</span>
                <div className="flex gap-4">
                    <Input type="date" {...form.register('date')} className="h-7 py-0 w-40 font-bold border-slate-200" />
                    <Input placeholder="Locatie..." {...form.register('location')} className="h-7 py-0 flex-1 font-bold border-slate-200" />
                </div>

                <span>Genodigden:</span>
                <Input placeholder="Namen van aanwezigen..." {...form.register('attendees')} className="h-7 py-0 font-bold border-slate-200" />
                
                <span>Verslaglegging:</span>
                <div className="flex items-center gap-2">
                  <Input placeholder="Naam verslaglegger..." {...form.register('createdBy')} className="h-7 py-0 flex-1 font-bold border-slate-200" />
                  <span className="text-slate-400 shrink-0">Meerlanden</span>
                </div>
            </div>
        </div>
        
        <div className="flex-1 overflow-y-auto bg-slate-50 p-8 custom-scrollbar">
          <Form {...form}>
            <form id="minute-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-10 max-w-4xl mx-auto">
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-2">
                    <h3 className="text-xl font-black uppercase tracking-tighter">Agenda</h3>
                </div>

                <div className="space-y-8">
                    {fields.map((field, index) => (
                        <div key={field.id} className="group relative bg-white p-6 rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm">{field.title}</h4>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-[10px] font-black uppercase tracking-widest gap-2 border-blue-100 text-blue-600 hover:bg-blue-50"
                                    onClick={() => handleAIImprove(index)}
                                    disabled={!!improvingId}
                                >
                                    {improvingId === field.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                    AI Verbeteren
                                </Button>
                            </div>
                            <Textarea 
                                {...form.register(`agendaItems.${index}.content`)}
                                placeholder="Typ hier de steekwoorden of het verslag..."
                                className="min-h-[100px] text-xs font-medium leading-relaxed bg-slate-50/50 border-none focus:ring-0 resize-none p-0"
                            />
                        </div>
                    ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 border-b-2 border-blue-600 pb-2">
                    <h3 className="text-xl font-black uppercase tracking-tighter text-blue-600">Actiepunten</h3>
                </div>
                <Textarea 
                    {...form.register('actionPoints')}
                    placeholder="Lijst van acties, eigenaren en deadlines..." 
                    className="min-h-[150px] font-black text-blue-700 leading-relaxed rounded-2xl border-2 border-blue-50 bg-blue-50/30" 
                />
              </div>
            </form>
          </Form>
        </div>

        <DialogFooter className="p-6 border-t bg-white shrink-0 shadow-2xl relative z-10">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold">Annuleren</Button>
          <Button type="submit" form="minute-form" disabled={isSubmitting} className="font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-2 h-4 w-4" /> Verslag Opslaan</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
