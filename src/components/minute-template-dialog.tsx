
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
  DialogDescription,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFirestore, setDocumentNonBlocking, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Loader2, Sparkles, X, Plus, Image as ImageIcon, MapPin } from 'lucide-react';
import type { MinuteTemplate } from '@/lib/types';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useToast } from './ui/use-toast';
import { ScrollArea } from './ui/scroll-area';

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

const templateSchema = z.object({
  documentTitle: z.string().min(1, 'Titel is verplicht'),
  documentSubtitle: z.string().optional(),
  logoLeftUrl: z.string().optional(),
  logoRightUrl: z.string().optional(),
  location: z.string().optional(),
  agendaItems: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string().default('')
  })),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

export function MinuteTemplateDialog({
  open,
  onOpenChange,
  projectId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const templateRef = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return doc(firestore, 'projects', projectId, 'settings', 'minute_template');
  }, [firestore, projectId]);

  const { data: template, isLoading } = useDoc<MinuteTemplate>(templateRef);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      documentTitle: 'Agenda operationeel Startwerkoverleg',
      documentSubtitle: 'Meerlanden afdeling Noordwijkerhout en Meerlanden',
      logoLeftUrl: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
      logoRightUrl: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
      location: 'Aarbergerweg 5-7 Rijsenhout',
      agendaItems: DEFAULT_AGENDA.map((title, i) => ({ id: `item-${i+1}`, title: `${i+1}. ${title}`, content: '' })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "agendaItems"
  });

  React.useEffect(() => {
    if (open && template) {
      form.reset({
        documentTitle: template.documentTitle || 'Agenda operationeel Startwerkoverleg',
        documentSubtitle: template.documentSubtitle || '',
        logoLeftUrl: template.logoLeftUrl || 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
        logoRightUrl: template.logoRightUrl || 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
        location: template.location || '',
        agendaItems: template.agendaItems || DEFAULT_AGENDA.map((title, i) => ({ id: `item-${i+1}`, title: `${i+1}. ${title}`, content: '' })),
      });
    }
  }, [open, template, form]);

  const onSubmit = async (values: TemplateFormValues) => {
    if (!firestore || !projectId) return;
    setIsSubmitting(true);

    try {
      await setDocumentNonBlocking(doc(firestore, 'projects', projectId, 'settings', 'minute_template'), {
        ...values,
        projectId,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      
      toast({ title: "Sjabloon opgeslagen", description: "Nieuwe verslagen gebruiken nu deze instellingen." });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving template:", error);
      toast({ variant: 'destructive', title: "Fout", description: "Kon sjabloon niet opslaan." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 border-b shrink-0 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">Document Sjabloon</DialogTitle>
              <DialogDescription className="text-slate-400 font-bold">Beheer de standaard layout en agenda voor alle verslagen in dit project.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 bg-white">
          <Form {...form}>
            <form id="template-form" onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-10">
              {/* Logo & Header Section */}
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b pb-2 flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5" /> Koptekst & Logo's
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <FormField control={form.control} name="logoLeftUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase">Logo Links (URL)</FormLabel>
                        <FormControl><Input {...field} className="h-10 font-bold" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="logoRightUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase">Logo Rechts (URL)</FormLabel>
                        <FormControl><Input {...field} className="h-10 font-bold" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="space-y-4">
                    <FormField control={form.control} name="documentTitle" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase">Document Titel</FormLabel>
                        <FormControl><Input {...field} className="h-10 font-black uppercase" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="documentSubtitle" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase">Subtitel</FormLabel>
                        <FormControl><Input {...field} className="h-10 font-bold" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase flex items-center gap-2"><MapPin className="h-3 w-3" /> Standaard Locatie</FormLabel>
                    <FormControl><Input {...field} className="h-10 font-bold" /></FormControl>
                  </FormItem>
                )} />
              </div>

              {/* Agenda Section */}
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Standaard Agenda Structuur</h3>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-black uppercase" onClick={() => append({ id: `item-${fields.length + 1}`, title: `${fields.length + 1}. `, content: '' })}>
                    <Plus className="h-3 w-3 mr-1" /> Item toevoegen
                  </Button>
                </div>
                <div className="grid gap-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                      <div className="flex-1">
                        <Input 
                          {...form.register(`agendaItems.${index}.title`)} 
                          className="h-9 text-xs font-bold bg-slate-50 border-slate-100" 
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-slate-300 hover:text-red-600" onClick={() => remove(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
          <DialogClose asChild><Button variant="ghost" className="font-bold">Annuleren</Button></DialogClose>
          <Button type="submit" form="template-form" disabled={isSubmitting} className="font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Instellingen Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
