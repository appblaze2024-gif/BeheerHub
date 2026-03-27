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
import { Loader2, Link2, Plus, Trash2, ShieldCheck, Globe, Key, Database, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { ApiIntegration } from '@/lib/types';

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
      <DialogContent className="sm:max-w-3xl h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 border-b bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-none"><Link2 className="h-5 w-5 text-white" /></div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">
                {integration ? 'Koppeling Bewerken' : 'Nieuwe API Koppeling'}
              </DialogTitle>
              <DialogDescription className="text-slate-400 font-bold uppercase text-[10px]">Stel de interface parameters in.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 bg-white">
          <Form {...form}>
            <form id="integration-form" onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-10">
              {/* Basic Settings */}
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b pb-2 flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" /> Bestemming
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase">Interne Naam</FormLabel>
                      <FormControl><Input placeholder="Bv. Koppeling Gemeente CRM..." {...field} className="h-11 font-bold rounded-none border-2" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sourceModule" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase">Bron Gegevens</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="h-11 font-bold rounded-none border-2"><SelectValue placeholder="Selecteer een bron" /></SelectTrigger></FormControl>
                        <SelectContent className="rounded-none">
                          <SelectItem value="meldingen">Meldingen (Klantvragen)</SelectItem>
                          <SelectItem value="users">Personeel (Collega's)</SelectItem>
                          <SelectItem value="objects">Objecten (Areaal)</SelectItem>
                          <SelectItem value="projects">Projecten</SelectItem>
                          <SelectItem value="voertuigen">Wagenpark</SelectItem>
                          <SelectItem value="machines">Machines</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="md:col-span-1">
                    <FormField control={form.control} name="method" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase">Methode</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="h-11 font-bold rounded-none border-2"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent className="rounded-none">
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                            <SelectItem value="GET">GET</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <div className="md:col-span-3">
                    <FormField control={form.control} name="endpoint" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase">Webhook URL / API Endpoint</FormLabel>
                        <FormControl><Input placeholder="https://api.partner.nl/v1/sync..." {...field} className="h-11 font-mono text-xs rounded-none border-2" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              </div>

              {/* Headers */}
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Key className="h-3.5 w-3.5" /> Authenticatie & Headers
                  </h3>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-black uppercase rounded-none" onClick={() => appendHeader({ key: '', value: '' })}>
                    <Plus className="h-3 w-3 mr-1" /> Header toevoegen
                  </Button>
                </div>
                <div className="grid gap-3">
                  {headerFields.map((field, index) => (
                    <div key={field.id} className="flex gap-3 animate-in fade-in slide-in-from-left-2">
                      <Input {...form.register(`headers.${index}.key`)} placeholder="Key (bv. X-API-KEY)" className="h-10 text-xs font-mono rounded-none border-2" />
                      <Input {...form.register(`headers.${index}.value`)} placeholder="Value" className="h-10 text-xs font-mono rounded-none border-2" />
                      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-red-600 rounded-none shrink-0" onClick={() => removeHeader(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {headerFields.length === 0 && <p className="text-[9px] text-slate-400 italic">Geen aangepaste headers.</p>}
                </div>
              </div>

              {/* Field Mapping */}
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Database className="h-3.5 w-3.5" /> Veld Mapping
                  </h3>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-black uppercase rounded-none" onClick={() => appendMapping({ fsKey: '', apiKey: '' })}>
                    <Plus className="h-3 w-3 mr-1" /> Regel toevoegen
                  </Button>
                </div>
                <div className="grid gap-3">
                  {mappingFields.map((field, index) => (
                    <div key={field.id} className="flex gap-3 items-center animate-in fade-in slide-in-from-left-2">
                      <div className="flex-1">
                        <Select onValueChange={(val) => form.setValue(`mapping.${index}.fsKey`, val)} value={form.watch(`mapping.${index}.fsKey`)}>
                            <FormControl><SelectTrigger className="h-10 text-xs font-bold rounded-none border-2"><SelectValue placeholder="Bronveld..." /></SelectTrigger></FormControl>
                            <SelectContent className="rounded-none">
                                {FS_FIELDS[sourceModule]?.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                            </SelectContent>
                        </Select>
                      </div>
                      <div className="text-slate-300">&rarr;</div>
                      <div className="flex-1">
                        <Input {...form.register(`mapping.${index}.apiKey`)} placeholder="Bestemming veldnaam..." className="h-10 text-xs font-black rounded-none border-2" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-red-600 rounded-none shrink-0" onClick={() => removeMapping(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {mappingFields.length === 0 && <p className="text-[9px] text-slate-400 italic">Configureer welke velden naar het externe systeem verzonden moeten worden.</p>}
                </div>
              </div>
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold rounded-none">Annuleren</Button>
          <Button type="submit" form="integration-form" disabled={isSubmitting} className="font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20 rounded-none">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Instellingen Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
