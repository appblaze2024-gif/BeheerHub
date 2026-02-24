
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
import { Label } from '@/components/ui/label';
import { useFirestore, setDocumentNonBlocking, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Loader2, Sparkles, X, Plus, Image as ImageIcon, MapPin, Upload, Settings2 } from 'lucide-react';
import type { MinuteTemplate, Contractor } from '@/lib/types';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  contractor
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: Contractor;
}) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isUploadingLeft, setIsUploadingLeft] = React.useState(false);
  const [isUploadingRight, setIsUploadingRight] = React.useState(false);

  const templateRef = useMemoFirebase(() => {
    if (!firestore || !contractor?.id) return null;
    return doc(firestore, 'contractors', contractor.id, 'settings', 'minute_template');
  }, [firestore, contractor?.id]);

  const { data: template } = useDoc<MinuteTemplate>(templateRef);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      documentTitle: 'Agenda operationeel Startwerkoverleg',
      documentSubtitle: `Overleg met ${contractor.name}`,
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

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right') => {
    const file = event.target.files?.[0];
    if (!file || !app || !contractor.id) return;

    const setUploading = side === 'left' ? setIsUploadingLeft : setIsUploadingRight;
    setUploading(true);

    try {
      const storage = getStorage(app);
      const storagePath = `contractors/${contractor.id}/minute_templates/logo_${side}_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      await uploadTask;
      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      
      form.setValue(side === 'left' ? 'logoLeftUrl' : 'logoRightUrl', downloadUrl, { shouldDirty: true });
      toast({ title: "Logo geüpload", description: `Logo voor ${contractor.name} is succesvol verwerkt.` });
    } catch (err: any) {
      console.error("Logo upload error:", err);
      toast({ 
        variant: 'destructive', 
        title: "Upload mislukt", 
        description: err.message || "Geen rechten om naar deze map te schrijven." 
      });
    } finally {
      setUploading(false);
      // Reset input zodat hetzelfde bestand opnieuw gekozen kan worden indien nodig
      event.target.value = '';
    }
  };

  const onSubmit = async (values: TemplateFormValues) => {
    if (!firestore || !contractor.id) return;
    setIsSubmitting(true);

    try {
      await setDocumentNonBlocking(doc(firestore, 'contractors', contractor.id, 'settings', 'minute_template'), {
        ...values,
        contractorId: contractor.id,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      
      toast({ title: "Sjabloon opgeslagen", description: `Standaard layout voor ${contractor.name} is bijgewerkt.` });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving template:", error);
      toast({ variant: 'destructive', title: "Fout", description: "Kon sjabloon niet opslaan in de database." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 border-b shrink-0 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <Settings2 className="h-6 w-6 text-primary" />
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-white">Sjabloon: {contractor.name}</DialogTitle>
              <DialogDescription className="text-slate-400 font-bold">Beheer de specifieke layout en agenda voor verslagen van deze aannemer.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 bg-white">
          <Form {...form}>
            <form id="template-form" onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-10">
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b pb-2 flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5" /> Koptekst & Logo's
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase">Logo Links (JPG/PNG)</Label>
                      <div className="flex flex-col gap-3">
                        <div className="relative w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center group">
                          {form.watch('logoLeftUrl') ? (
                            <Image src={form.watch('logoLeftUrl')!} alt="Logo Links" fill className="object-contain p-4" />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-slate-200" />
                          )}
                          {isUploadingLeft && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          )}
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="w-full h-9 font-bold"
                          onClick={() => document.getElementById('logo-left-upload')?.click()}
                          disabled={isUploadingLeft}
                        >
                          <Upload className="h-4 w-4 mr-2" /> Afbeelding Kiezen
                        </Button>
                        <input id="logo-left-upload" type="file" className="hidden" accept="image/*" onChange={(e) => handleLogoUpload(e, 'left')} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase">Logo Rechts (JPG/PNG)</Label>
                      <div className="flex flex-col gap-3">
                        <div className="relative w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center group">
                          {form.watch('logoRightUrl') ? (
                            <Image src={form.watch('logoRightUrl')!} alt="Logo Rechts" fill className="object-contain p-4" />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-slate-200" />
                          )}
                          {isUploadingRight && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          )}
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="w-full h-9 font-bold"
                          onClick={() => document.getElementById('logo-right-upload')?.click()}
                          disabled={isUploadingRight}
                        >
                          <Upload className="h-4 w-4 mr-2" /> Afbeelding Kiezen
                        </Button>
                        <input id="logo-right-upload" type="file" className="hidden" accept="image/*" onChange={(e) => handleLogoUpload(e, 'right')} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <FormField control={form.control} name="documentTitle" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase">Document Titel</FormLabel>
                        <FormControl><Input {...field} className="h-11 font-black uppercase rounded-xl border-slate-200" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="documentSubtitle" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase">Subtitel</FormLabel>
                        <FormControl><Input {...field} className="h-11 font-bold rounded-xl border-slate-200" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="location" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase flex items-center gap-2"><MapPin className="h-3 w-3" /> Standaard Locatie</FormLabel>
                        <FormControl><Input {...field} className="h-11 font-bold rounded-xl border-slate-200" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vaste Agenda Structuur</h3>
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
                          className="h-10 text-xs font-bold bg-slate-50 border-slate-100 rounded-xl" 
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-red-600 rounded-xl" onClick={() => remove(index)}>
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
          <Button type="submit" form="template-form" disabled={isSubmitting || isUploadingLeft || isUploadingRight} className="font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20 rounded-xl">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sjabloon Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
