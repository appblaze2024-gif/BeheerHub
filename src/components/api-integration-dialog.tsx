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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { Loader2, Globe, Key, Database, X, Info, Settings, Plus, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ApiIntegration } from '@/lib/types';
import { cn } from '@/lib/utils';

const integrationSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  endpoint: z.string().url('Voer een geldige URL in'),
  method: z.literal('GET'),
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
      method: 'GET',
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
          method: 'GET',
          sourceModule: integration.sourceModule,
          headers: integration.headers || [],
          mapping: Object.entries(integration.mapping).map(([fsKey, apiKey]) => ({ fsKey, apiKey })),
          active: integration.active
        });
      } else {
        form.reset({
          name: '',
          endpoint: '',
          method: 'GET',
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
        method: 'GET',
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
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-white leading-none mb-1">
                {integration ? 'REST Service Configureren' : 'Nieuwe REST Service'}
              </DialogTitle>
              <DialogDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Definieer het endpoint voor data-uitlezing (Read-Only).</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 bg-white">
          <Form {...form}>
            <form id="integration-form" onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-12">
              
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b-2 border-slate-100 pb-2 flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-primary" /> Service Identiteit & Endpoint
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-[10px] font-black uppercase text-slate-500 ml-1">Project / Service Naam</FormLabel>
                      <FormControl><Input placeholder="Bv. Overheid API v2..." {...field} className="h-11 font-black uppercase text-xs rounded-none border-2 border-slate-200 bg-white focus:ring-primary/20 shadow-sm" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sourceModule" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-[10px] font-black uppercase text-slate-500 ml-1">Doel Dataset (Polling)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="h-11 font-black uppercase text-[10px] rounded-none border-2 border-slate-200 bg-white shadow-sm"><SelectValue placeholder="Selecteer bron" /></SelectTrigger></FormControl>
                        <SelectContent className="rounded-none shadow-2xl">
                          <SelectItem value="meldingen" className="text-xs font-bold uppercase">Meldingen</SelectItem>
                          <SelectItem value="users" className="text-xs font-bold uppercase">Personeel</SelectItem>
                          <SelectItem value="objects" className="text-xs font-bold uppercase">Objecten</SelectItem>
                          <SelectItem value="projects" className="text-xs font-bold uppercase">Projecten</SelectItem>
                          <SelectItem value="voertuigen" className="text-xs font-bold uppercase">Wagenpark</SelectItem>
                          <SelectItem value="machines" className="text-xs font-bold uppercase">Machines</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-32">
                    <FormField control={form.control} name="method" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-[10px] font-black uppercase text-slate-500 ml-1">Method</FormLabel>
                        <FormControl>
                          <Input value="GET" readOnly className="h-11 font-black bg-slate-50 border-2 border-slate-200 rounded-none text-center text-xs" />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex-1">
                    <FormField control={form.control} name="endpoint" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-[10px] font-black uppercase text-slate-500 ml-1">External Target URL</FormLabel>
                        <FormControl><Input placeholder="https://api.external-system.com/..." {...field} className="h-11 font-mono text-xs rounded-none border-2 border-slate-200 bg-white focus:ring-primary/20 shadow-sm" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-center border-b-2 border-slate-100 pb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Key className="h-3.5 w-3.5 text-primary" /> Request Headers (Auth)
                  </h3>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-black uppercase rounded-none border-slate-200 hover:bg-slate-50" onClick={() => appendHeader({ key: '', value: '' })}>
                    <Plus className="h-3 w-3 mr-1" /> Add Header
                  </Button>
                </div>
                <div className="grid gap-3">
                  {headerFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1fr_44px] gap-3 animate-in fade-in">
                      <Input {...form.register(`headers.${index}.key`)} placeholder="Header (e.g. Authorization)" className="h-11 text-xs font-mono font-bold rounded-none border-2 border-slate-200 bg-white" />
                      <Input {...form.register(`headers.${index}.value`)} placeholder="Value (e.g. Bearer token...)" className="h-11 text-xs font-mono font-bold rounded-none border-2 border-slate-200 bg-white" />
                      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-slate-300 hover:text-red-600 rounded-none shrink-0" onClick={() => removeHeader(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-center border-b-2 border-slate-100 pb-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-primary" /> Response Fields
                  </h3>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-black uppercase rounded-none border-slate-200 hover:bg-slate-50" onClick={() => appendMapping({ fsKey: '', apiKey: '' })}>
                    <Plus className="h-3 w-3 mr-1" /> Add Field
                  </Button>
                </div>
                
                <div className="bg-slate-900 text-white/80 p-5 rounded-none border-l-4 border-primary shadow-inner">
                    <div className="flex items-start gap-4">
                        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold uppercase tracking-tight leading-relaxed">
                            Omdat de API nu alleen GET ondersteunt, worden deze mappings gebruikt om specifieke velden uit de externe respons te identificeren (polling).
                        </p>
                    </div>
                </div>

                <div className="grid gap-3">
                  {mappingFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr_auto_1fr_44px] gap-4 items-center p-2.5 bg-slate-50/50 border-2 border-slate-100 rounded-none">
                      <div className="flex-1">
                        <Select onValueChange={(val) => form.setValue(`mapping.${index}.fsKey`, val)} value={form.watch(`mapping.${index}.fsKey`)}>
                            <FormControl><SelectTrigger className="h-11 text-xs font-black uppercase rounded-none border-2 border-slate-200 bg-white"><SelectValue placeholder="BeheerHub Veld..." /></SelectTrigger></FormControl>
                            <SelectContent className="rounded-none shadow-2xl">
                                {FS_FIELDS[sourceModule]?.map(f => <SelectItem key={f} value={f} className="text-xs font-bold">{f}</SelectItem>)}
                            </SelectContent>
                        </Select>
                      </div>
                      <div className="text-primary font-black text-xl leading-none">&larr;</div>
                      <div className="flex-1">
                        <Input {...form.register(`mapping.${index}.apiKey`)} placeholder="External Key Name..." className="h-11 text-xs font-black uppercase rounded-none border-2 border-slate-200 bg-white shadow-sm" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-slate-300 hover:text-red-600 rounded-none shrink-0" onClick={() => removeMapping(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
          <div className="flex items-center justify-between w-full">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-slate-500 px-8 h-12">Annuleren</Button>
            <Button type="submit" form="integration-form" disabled={isSubmitting} className="font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20 rounded-none text-sm min-w-[220px]">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Configuratie Activeren'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
