'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Send, X, FileIcon, MapPin, Search, User } from 'lucide-react';
import { sendEmail } from '@/app/mail/actions';
import { useToast } from '@/components/ui/use-toast';
import { useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import type { Melding, UploadedFile, UserProfile } from '@/lib/types';
import { MapboxView } from './mapbox-view';
import { cn } from '@/lib/utils';

const forwardSchema = z.object({
  to: z.string().min(1, { message: 'Voer minimaal één e-mailadres in.' }),
  cc: z.string().optional(),
  subject: z.string().min(1, { message: 'Onderwerp is verplicht.' }),
  body: z.string().min(1, { message: 'Bericht mag niet leeg zijn.' }),
});

type ForwardFormValues = z.infer<typeof forwardSchema>;

interface ForwardExternalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  melding: Melding | null;
  onSuccess: () => void;
}

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export function ForwardExternalDialog({ open, onOpenChange, melding, onSuccess }: ForwardExternalDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isSending, setIsSending] = React.useState(false);
  const [selectedAttachments, setSelectedAttachments] = React.useState<string[]>([]);
  const [userSearchTerm, setUserSearchTerm] = React.useState('');

  const form = useForm<ForwardFormValues>({
    resolver: zodResolver(forwardSchema),
    defaultValues: { to: '', cc: '', subject: '', body: '' },
  });

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: users } = useCollection<UserProfile>(usersQuery);

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    if (!userSearchTerm.trim()) return users;
    const q = userSearchTerm.toLowerCase();
    return users.filter(u => 
      (u.displayName || '').toLowerCase().includes(q) || 
      (u.email || '').toLowerCase().includes(q)
    );
  }, [users, userSearchTerm]);

  const allFiles = React.useMemo(() => {
    if (!melding) return [];
    return [...(melding.files || []), ...(melding.fotos || [])];
  }, [melding]);

  const meldingId = melding?.id;

  React.useEffect(() => {
    if (open && melding) {
      const address = `${melding.straatnaam || ''} ${melding.huisnummer || ''}, ${melding.plaats || ''}`.trim();
      const initialBody = `Geachte heer/mevrouw,

Hierbij sturen wij u een melding door ter afhandeling.

Details melding:
- Intakenummer: ${melding.intakenummer}
- Categorie: ${melding.hoofdcategorie} - ${melding.subcategorie}
- Locatie: ${address}
- Datum: ${melding.datum} om ${melding.tijdstip}

Omschrijving:
${melding.extra_informatie}

Met vriendelijke groet,
Team BeheerHub`;

      form.reset({
        to: '',
        cc: '',
        subject: `Doorzetten melding ${melding.intakenummer}: ${melding.subcategorie}`,
        body: initialBody,
      });
      
      setSelectedAttachments(allFiles.map(f => f.storagePath));
      setIsSending(false);
      setUserSearchTerm('');
    }
  }, [open, meldingId, form, allFiles]);

  const toggleAttachment = (path: string) => {
    setSelectedAttachments(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const toggleUserEmail = (email: string) => {
    if (!email) return;
    const currentTo = form.getValues('to');
    const emails = currentTo.split(',').map(e => e.trim()).filter(Boolean);
    
    let newTo: string;
    if (emails.includes(email)) {
      newTo = emails.filter(e => e !== email).join(', ');
    } else {
      newTo = emails.length > 0 ? [...emails, email].join(', ') : email;
    }
    form.setValue('to', newTo, { shouldValidate: true, shouldDirty: true });
  };

  async function onSubmit(data: ForwardFormValues) {
    if (!melding || !firestore) return;
    setIsSending(true);

    try {
        const selectedFiles = allFiles.filter(f => selectedAttachments.includes(f.storagePath));
        
        const attachmentPayloads = selectedFiles.map((file) => ({
            url: file.url,
            filename: file.name,
            type: file.type,
        }));

        let mapAttachment = null;
        try {
            const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+ff0000(${melding.longitude},${melding.latitude})/${melding.longitude},${melding.latitude},15/600x400@2x?access_token=${MAPBOX_TOKEN}`;
            
            mapAttachment = {
                url: staticMapUrl,
                filename: `locatie_kaart_${melding.intakenummer}.png`,
                type: 'image/png',
            };
        } catch (mapError) {
            console.warn("Kon kaart URL niet genereren:", mapError);
        }

        const finalAttachments = mapAttachment ? [...attachmentPayloads, mapAttachment] : attachmentPayloads;
        const result = await sendEmail({
            ...data,
            attachments: finalAttachments,
        });

        if (result.success) {
            const meldingRef = doc(firestore, 'meldingen', melding.id);
            await updateDocumentNonBlocking(meldingRef, { 
                status: 'Extern doorgezet',
                updatedAt: new Date().toISOString()
            });

            toast({
                title: 'E-mail verzonden!',
                description: `De melding is succesvol doorgezet naar ${data.to}.`,
            });
            onSuccess();
            onOpenChange(false);
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
         console.error("Fout bij doorzetten melding:", error);
         toast({
            variant: 'destructive',
            title: 'Verzenden mislukt',
            description: error.message || 'Er is een onverwachte fout opgetreden.',
        });
    } finally {
        setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Melding Extern Doorzetten</DialogTitle>
          <DialogDescription>Stel de e-mail op voor de externe partij of een interne collega.</DialogDescription>
        </DialogHeader>
        
        {melding ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <ScrollArea className="flex-1 px-6">
                  <div className="space-y-6 py-4">
                      <div className="h-40 w-full rounded-xl border-2 overflow-hidden relative shadow-inner">
                          <MapboxView
                              longitude={melding.longitude}
                              latitude={melding.latitude}
                              interactive={false}
                          />
                          <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm flex items-center gap-1.5">
                              <MapPin className="h-3 w-3 text-red-500" />
                              Locatie Melding (Wordt als kaart bijgevoegd)
                          </div>
                      </div>

                      <div className="space-y-3 bg-slate-50 dark:bg-slate-900/20 p-4 rounded-2xl border-2 border-slate-100">
                          <div className="flex items-center justify-between">
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collega selecteren</FormLabel>
                              <div className="relative w-40">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                                  <Input 
                                      placeholder="Zoek collega..." 
                                      className="h-7 pl-7 text-[10px] font-bold rounded-lg border-slate-200"
                                      value={userSearchTerm}
                                      onChange={(e) => setUserSearchTerm(e.target.value)}
                                  />
                              </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto no-scrollbar">
                              {filteredUsers.map((u) => {
                                  const isChecked = u.email && form.watch('to').split(',').map(e => e.trim()).includes(u.email);
                                  return (
                                      <div 
                                          key={u.id} 
                                          className={cn(
                                              "flex items-center space-x-3 p-2 rounded-xl transition-all cursor-pointer group border-2",
                                              isChecked ? "bg-primary/5 border-primary/20 shadow-sm" : "hover:bg-white border-transparent"
                                          )}
                                          onClick={() => u.email && toggleUserEmail(u.email)}
                                      >
                                          <Checkbox 
                                              checked={isChecked || false}
                                              onCheckedChange={() => u.email && toggleUserEmail(u.email)}
                                          />
                                          <div className="min-w-0">
                                              <p className="text-[11px] font-black uppercase tracking-tight text-slate-900 truncate group-hover:text-primary transition-colors">{u.displayName || u.email}</p>
                                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate">{u.role}</p>
                                          </div>
                                      </div>
                                  );
                              })}
                              {filteredUsers.length === 0 && (
                                  <div className="col-span-2 py-4 text-center text-[10px] font-bold text-slate-400 uppercase">Geen collega's gevonden</div>
                              )}
                          </div>
                      </div>

                      <FormField
                      control={form.control}
                      name="to"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Ontvanger(s)</FormLabel>
                          <FormControl>
                              <Input placeholder="voorbeeld@email.nl, ander@email.nl" {...field} className="h-10 font-bold" />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />
                      <FormField
                      control={form.control}
                      name="cc"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CC</FormLabel>
                          <FormControl>
                              <Input placeholder="" {...field} className="h-10 font-bold" />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />
                      <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Onderwerp</FormLabel>
                          <FormControl>
                              <Input {...field} className="h-10 font-black" />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />
                      <FormField
                      control={form.control}
                      name="body"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bericht</FormLabel>
                          <FormControl>
                              <Textarea className="min-h-[200px] text-xs font-medium leading-relaxed resize-none" {...field} />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />

                      {allFiles.length > 0 && (
                      <div className="space-y-3">
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bijlagen selecteren ({selectedAttachments.length}/{allFiles.length})</FormLabel>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl border-2 border-slate-100 p-2 bg-slate-50/30">
                              {allFiles.map((file) => (
                              <div 
                                  key={file.storagePath} 
                                  className={cn(
                                      "flex items-center space-x-3 p-2 rounded-xl transition-all cursor-pointer border-2",
                                      selectedAttachments.includes(file.storagePath) ? "bg-white border-primary/20 shadow-sm" : "border-transparent hover:bg-white"
                                  )}
                                  onClick={() => toggleAttachment(file.storagePath)}
                              >
                                  <Checkbox 
                                      id={file.storagePath} 
                                      checked={selectedAttachments.includes(file.storagePath)}
                                      onCheckedChange={() => toggleAttachment(file.storagePath)}
                                  />
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                                      <span className="text-[11px] font-bold text-slate-700 truncate">{file.name}</span>
                                  </div>
                              </div>
                              ))}
                          </div>
                      </div>
                      )}
                  </div>
              </ScrollArea>
              
              <DialogFooter className="p-6 pt-4 border-t bg-slate-50/50">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSending} className="font-bold">Annuleren</Button>
                  <Button type="submit" disabled={isSending} className="font-black uppercase tracking-tight h-11 px-8">
                      {isSending ? (
                          <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Bezig...
                          </>
                      ) : (
                          <>
                              <Send className="mr-2 h-4 w-4" />
                              Verstuur en Doorzetten
                          </>
                      )}
                  </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="p-12 text-center text-muted-foreground">Gegevens laden...</div>
        )}
      </DialogContent>
    </Dialog>
  );
}