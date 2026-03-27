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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { Loader2, Link2, Plus, Trash2, ShieldCheck, Globe, Key, Database, X, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { ApiIntegration } from '@/lib/types';
import { cn } from '@/lib/utils';

const integrationSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  endpoint: z.string().url('Voer een geldige URL in'),
  method: z.enum(['POST', 'PUT', 'GET']),
  sourceModule: z.enum(['meldingen', 'users', 'objects', 'projects', 'voertuigen', 'machines']),
  headers: z.array(z.object({
    key: z.string(),
    value: z.string()
  })),
  mapping: z.array(z.object({
    fsKey: z.string(),
    apiKey: z.string()
  })),
  active: z.boolean().default(true)
});

type IntegrationFormValues = z.infer<typeof integrationSchema>;

const FS_FIELDS: Record<string, string[]> = {
    meldingen: ['intakenummer', 'status', 'hoofdcategorie', 'subcategorie', 'straatnaam', 'huisnummer', 'plaats', 'datum', 'latitude', 'longitude'],
    users: ['displayName', 'email', 'role', 'status', 'wijk'],
    objects: ['idNummer', 'locatieType', 'locatieSubType', 'straatnaam', 'huisnummer', 'latitude', 'longitude'],
    projects: ['projectnaam', 'projectnummer', 'opdrachtgever', 'locatie', 'startdatum'],
    voertuigen: ['id', 'voertuignummer', 'merk', 'model', 'status', 'apk_vervaldatum'],
    machines: ['id', 'machinenummer', 'merk', 'model', 'status']
};

export function ApiIntegrationDialog({
  open,
  onOpenChange,
  integration
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration?: ApiIntegration | null;
}) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(integrationSchema),
    defaultValues: {
      name: '',
      endpoint: '',
      method: 'POST',
      sourceModule: 'meldingen',
      headers: [],
      mapping: [],
      active: true
    },
  });

  const { fields: headerFields, append: appendHeader, remove: removeHeader } = useFieldArray({
    control: form.control,
    name: "headers"
  });

  const { fields: mappingFields, append: appendMapping, remove: removeMapping } = useFieldArray({
    control: form.control,
    name: "mapping"
  });

  const sourceModule = form.watch('sourceModule');

  React.useEffect(() => {
    if (open) {
      if (integration) {
        form.reset({
          name: integration.name,
          endpoint: integration.endpoint,
          method: integration.method,
          sourceModule: integration.sourceModule,
          headers: integration.headers || [],
          mapping: Object.entries(integration.mapping).map(([fsKey, apiKey]) => ({ fsKey, apiKey })),
          active: integration.active
        });
      } else {
        form.reset({
          name: '',
          endpoint: '',
          method: 'POST',
          sourceModule: 'meldingen',
          headers: [{ key: 'X-API-KEY', value: '' }],
          mapping: [],
          active: true
        });
      }
    }
  }, [open, integration, form]);

  const onSubmit = async (values: IntegrationFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    try {
      const mappingObj: Record<string, string> = {};
      values.mapping.forEach(m => {
          if (m.fsKey && m.apiKey) mappingObj[m.fsKey] = m.apiKey;
      });

      const data = {
        name: values.name,
        endpoint: values.endpoint,
        method: values.method,
        sourceModule: values.sourceModule,
        headers: values.headers,
        mapping: mappingObj,
        active: values.active,
        updatedAt: new Date().toISOString(),
      };

      if (integration) {
        await updateDocumentNonBlocking(doc(firestore, 'api_integrations', integration.id), data);
      } else {
        await addDocumentNonBlocking(collection(firestore, 'api_integrations'), {
          ...data,
          createdAt: new Date().toISOString(),
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving integration:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-none">
        <DialogHeader className="p-6 border-b bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20">
              <Link2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-white leading-none mb-1">
                {integration ? 'Koppeling Bewerken' : 'Nieuwe API Koppeling'}
              </DialogTitle>
              <DialogDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Stel de interface parameters in om data naar een ander systeem te sturen.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 bg-white">
          <Form {...form}>
            <form id="integration-form" onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-12">
              {/* Basic Settings */}
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b-2 border-slate-100 pb-2 flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-primary" /> Bestemming (Waar gaat de data heen?)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-[10px] font-black uppercase text-slate-500 ml-1">Interne Naam</FormLabel>
                      <FormControl><Input placeholder="Bv. Koppeling Gemeente CRM..." {...field} className="h-11 font-bold rounded-none border-2 border-slate-200 bg-white focus:ring-primary/20 shadow-sm" /></FormControl>
                      <FormDescription className="text-[9px] font-bold text-slate-400 uppercase ml-1">Geef deze koppeling een herkenbare naam.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sourceModule" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-[10px] font-black uppercase text-slate-500 ml-1">Welke data verzenden?</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="h-11 font-bold rounded-none border-2 border-slate-200 bg-white focus:ring-primary/20 shadow-sm"><SelectValue placeholder="Selecteer een bron" /></SelectTrigger></FormControl>
                        <SelectContent className="rounded-none shadow-2xl border-slate-100">
                          <SelectItem value="meldingen" className="text-xs font-bold uppercase">Meldingen (Klantvragen)</SelectItem>
                          <SelectItem value="users" className="text-xs font-bold uppercase">Personeel (Collega's)</SelectItem>
                          <SelectItem value="objects" className="text-xs font-bold uppercase">Objecten (Areaal)</SelectItem>
                          <SelectItem value="projects" className="text-xs font-bold uppercase">Projecten</SelectItem>
                          <SelectItem value="voertuigen" className="text-xs font-bold uppercase">Wagenpark</SelectItem>
                          <SelectItem value="machines" className="text-xs font-bold uppercase">Machines</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-[9px] font-bold text-slate-400 uppercase ml-1">Kies de gegevensbron uit BeheerHub.</FormDescription>
                    </FormItem>
                  )} />
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-32">
                    <FormField control={form.control} name="method" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-[10px] font-black uppercase text-slate-500 ml-1">Methode</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-11 font-black rounded-none border-2 border-slate-200 bg-white focus:ring-primary/20 shadow-sm"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent className="rounded-none shadow-2xl border-slate-100">
                            <SelectItem value="POST" className="text-xs font-black">POST</SelectItem>
                            <SelectItem value="PUT" className="text-xs font-black">PUT</SelectItem>
                            <SelectItem value="GET" className="text-xs font-black">GET</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex-1">
                    <FormField control={form.control} name="endpoint" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-[10px] font-black uppercase text-slate-500 ml-1">Webhook URL (Ontvanger)</FormLabel>
                        <FormControl><Input placeholder="https://api.partner.nl/v1/ontvanger" {...field} className="h-11 font-mono text-xs rounded-none border-2 border-slate-200 bg-white focus:ring-primary/20 shadow-sm" /></FormControl>
                        <FormDescription className="text-[9px] font-bold text-slate-400 uppercase ml-1">Het URL-adres van de externe partner.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              </div>

              {/* Headers */}
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b-2 border-slate-100 pb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Key className="h-3.5 w-3.5 text-primary" /> Authenticatie & Headers
                  </h3>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-black uppercase rounded-none border-slate-200 hover:bg-slate-50" onClick={() => appendHeader({ key: '', value: '' })}>
                    <Plus className="h-3 w-3 mr-1" /> Toevoegen
                  </Button>
                </div>
                <div className="grid gap-3">
                  {headerFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1fr_44px] gap-3 animate-in fade-in slide-in-from-left-2">
                      <Input {...form.register(`headers.${index}.key`)} placeholder="Header (bv. X-API-KEY)" className="h-11 text-xs font-mono font-bold rounded-none border-2 border-slate-200 bg-white" />
                      <Input {...form.register(`headers.${index}.value`)} placeholder="Waarde" className="h-11 text-xs font-mono font-bold rounded-none border-2 border-slate-200 bg-white" />
                      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-none shrink-0" onClick={() => removeHeader(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {headerFields.length === 0 && <p className="text-[9px] text-slate-400 italic font-bold uppercase pl-1">Geen headers ingesteld.</p>}
                </div>
              </div>

              {/* Field Mapping */}
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b-2 border-slate-100 pb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-primary" /> Veld Mapping (Vertaling)
                  </h3>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-black uppercase rounded-none border-slate-200 hover:bg-slate-50" onClick={() => appendMapping({ fsKey: '', apiKey: '' })}>
                    <Plus className="h-3 w-3 mr-1" /> Toevoegen
                  </Button>
                </div>
                
                <div className="bg-blue-50 border-2 border-blue-100 p-5 rounded-none flex items-start gap-4">
                    <div className="bg-white p-2 rounded-none shadow-sm"><Info className="h-4 w-4 text-primary" /></div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-slate-900 tracking-tight leading-none mb-1">Hoe werkt mapping?</p>
                        <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase tracking-tight">
                            Koppel een bronveld uit BeheerHub (links) aan de naam die de externe partner verwacht (rechts). 
                            Stel: zij noemen een meldingsnummer "case_id", kies dan links <strong>intakenummer</strong> en vul rechts <strong>case_id</strong> in.
                        </p>
                    </div>
                </div>

                <div className="grid gap-3">
                  {mappingFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr_auto_1fr_44px] gap-4 items-center animate-in fade-in slide-in-from-left-2 p-2.5 bg-slate-50/50 border-2 border-slate-100">
                      <div className="flex-1">
                        <Select onValueChange={(val) => form.setValue(`mapping.${index}.fsKey`, val)} value={form.watch(`mapping.${index}.fsKey`)}>
                            <FormControl><SelectTrigger className="h-11 text-xs font-black uppercase rounded-none border-2 border-slate-200 bg-white shadow-sm"><SelectValue placeholder="BeheerHub veld..." /></SelectTrigger></FormControl>
                            <SelectContent className="rounded-none shadow-2xl border-slate-100">
                                {FS_FIELDS[sourceModule]?.map(f => <SelectItem key={f} value={f} className="text-xs font-bold">{f}</SelectItem>)}
                            </SelectContent>
                        </Select>
                      </div>
                      <div className="text-slate-300 font-black text-xl leading-none">&rarr;</div>
                      <div className="flex-1">
                        <Input {...form.register(`mapping.${index}.apiKey`)} placeholder="Extern veld..." className="h-11 text-xs font-black uppercase rounded-none border-2 border-slate-200 bg-white shadow-sm" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-none shrink-0" onClick={() => removeMapping(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {mappingFields.length === 0 && <p className="text-[9px] text-slate-400 italic font-bold uppercase pl-1">Geen velden gekoppeld. Voeg een regel toe om data te kunnen vertalen.</p>}
                </div>
              </div>
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
          <div className="flex items-center justify-between w-full">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-slate-500 px-8 h-12">Annuleren</Button>
            <Button type="submit" form="integration-form" disabled={isSubmitting} className="font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20 rounded-none text-sm min-w-[200px]">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Instellingen Opslaan'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
