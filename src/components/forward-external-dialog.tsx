'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Send, X, FileIcon, MapPin, Search } from 'lucide-react';
import { sendEmail } from '@/app/mail/actions';
import { useToast } from '@/components/ui/use-toast';
import { useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection } from 'firebase/firestore';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { Melding, UserProfile } from '@/lib/types';
import { MapboxView } from './mapbox-view';
import { cn } from '@/lib/utils';

const forwardSchema = z.object({
  to: z.string().min(1, { message: 'Voer minimaal één e-mailadres in.' }),
  cc: z.string().optional(),
  subject: z.string().min(1, { message: 'Onderwerp is verplicht.' }),
  body: z.string().min(1, { message: 'Bericht mag niet leeg zijn.' }),
});

type ForwardFormValues = z.infer<typeof forwardSchema>;

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface ForwardExternalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  melding: Melding | null;
  onSuccess: () => void;
}

export function ForwardExternalDialog({ open, onOpenChange, melding, onSuccess }: ForwardExternalDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [isSending, setIsSending] = React.useState(false);
  const [selectedAttachments, setSelectedAttachments] = React.useState<string[]>([]);
  const [userSearchTerm, setUserSearchTerm] = React.useState('');

  const form = useForm<ForwardFormValues>({
    resolver: zodResolver(forwardSchema),
    defaultValues: { to: '', cc: '', subject: '', body: '' },
  });

  const usersQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users');
  }, [firestore, user]);

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

  React.useEffect(() => {
    if (open && melding) {
      const address = `${melding.straatnaam || ''} ${melding.huisnummer || ''}, ${melding.plaats || ''}`.trim();
      const initialBody = `Geachte heer/mevrouw,\n\nHierbij sturen wij u een melding door ter afhandeling.\n\nDetails melding:\n- Intakenummer: ${melding.intakenummer}\n- Categorie: ${melding.hoofdcategorie} - ${melding.subcategorie}\n- Locatie: ${address}\n- Datum: ${melding.datum} om ${melding.tijdstip}\n\nOmschrijving:\n${melding.extra_informatie}\n\nMet vriendelijke groet,\nTeam BeheerHub`;

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
  }, [open, melding, form, allFiles]);

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
            console.warn("Map attachment failed:", mapError);
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

            toast({ title: 'E-mail verzonden!', description: `De melding is succesvol doorgezet naar ${data.to}.` });
            onSuccess();
            onOpenChange(false);
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
         toast({ variant: 'destructive', title: 'Verzenden mislukt', description: error.message || 'Er is een fout opgetreden.' });
    } finally {
        setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[95vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 border-b shrink-0 relative bg-slate-50/80 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900">Melding Extern Doorzetten</DialogTitle>
              <DialogDescription className="font-bold text-slate-500">Stel de e-mail op voor de externe partij of een interne collega.</DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-200 transition-colors">
                <X className="h-6 w-6 text-slate-600" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="p-6">
            {melding ? (
              <Form {...form}>
                <form id="forward-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-4">
                  <div className="h-48 w-full rounded-2xl border-2 border-slate-100 overflow-hidden relative shadow-inner bg-slate-100">
                      <MapboxView longitude={melding.longitude} latitude={melding.latitude} interactive={false} />
                      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-200 shadow-sm flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-red-500" /> Locatie Melding (Wordt als kaart bijgevoegd)
                      </div>
                  </div>

                  <div className="space-y-4 bg-slate-50/50 p-5 rounded-2xl border-2 border-slate-100">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collega selecteren</FormLabel>
                          <div className="relative w-48">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                              <Input placeholder="Zoek collega..." className="h-8 pl-8 text-[10px] font-bold rounded-lg border-slate-200 focus:ring-primary/20 bg-white" value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} />
                          </div>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                          {filteredUsers.map((u) => {
                              const isChecked = u.email && form.watch('to').split(',').map(e => e.trim()).includes(u.email);
                              return (
                                  <div key={u.id} className={cn("flex items-center space-x-3 p-2.5 rounded-xl transition-all cursor-pointer group border-2", isChecked ? "bg-white border-primary/20 shadow-sm" : "hover:bg-white border-transparent")} onClick={() => u.email && toggleUserEmail(u.email)}>
                                      <Checkbox checked={!!isChecked} onCheckedChange={() => u.email && toggleUserEmail(u.email)} className="rounded-md" />
                                      <div className="min-w-0 flex-1 flex items-center justify-between">
                                          <p className="text-[11px] font-black uppercase tracking-tight text-slate-900 truncate group-hover:text-primary transition-colors">{u.displayName || u.email}</p>
                                          <Badge variant="outline" className="text-[8px] h-4 uppercase font-bold tracking-tighter opacity-60 border-slate-200">{u.role}</Badge>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>

                  <div className="space-y-5">
                    <FormField control={form.control} name="to" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Ontvanger(s)</FormLabel>
                          <FormControl><Input placeholder="voorbeeld@email.nl" {...field} className="h-11 font-bold rounded-xl border-slate-200" /></FormControl>
                          <FormMessage />
                        </FormItem>
                    )} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FormField control={form.control} name="cc" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CC</FormLabel>
                            <FormControl><Input placeholder="" {...field} className="h-11 font-bold rounded-xl border-slate-200" /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="subject" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Onderwerp</FormLabel>
                            <FormControl><Input {...field} className="h-11 font-black rounded-xl border-slate-200" /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="body" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bericht</FormLabel>
                          <FormControl><Textarea className="min-h-[250px] text-xs font-medium leading-relaxed resize-none rounded-2xl border-slate-200 focus:ring-primary/20" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                    )} />
                  </div>

                  {allFiles.length > 0 && (
                  <div className="space-y-3">
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bijlagen insluiten ({selectedAttachments.length}/{allFiles.length})</FormLabel>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl border-2 border-slate-100 p-3 bg-slate-50/30">
                          {allFiles.map((file) => (
                          <div key={file.storagePath} className={cn("flex items-center space-x-3 p-2.5 rounded-xl transition-all cursor-pointer border-2", selectedAttachments.includes(file.storagePath) ? "bg-white border-primary/20 shadow-sm" : "border-transparent hover:bg-white")} onClick={() => setSelectedAttachments(prev => prev.includes(file.storagePath) ? prev.filter(p => p !== file.storagePath) : [...prev, file.storagePath])}>
                              <Checkbox checked={selectedAttachments.includes(file.storagePath)} onCheckedChange={() => setSelectedAttachments(prev => prev.includes(file.storagePath) ? prev.filter(p => p !== file.storagePath) : [...prev, file.storagePath])} className="rounded-md" />
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                                  <span className="text-[11px] font-bold text-slate-700 truncate">{file.name}</span>
                              </div>
                          </div>
                          ))}
                      </div>
                  </div>
                  )}
                </form>
              </Form>
            ) : (
              <div className="p-20 text-center flex flex-col items-center gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Data laden...</p>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="p-6 shrink-0 border-t bg-slate-50/80 backdrop-blur-md">
            <Button 
                type="submit" 
                form="forward-form"
                disabled={isSending || !melding} 
                className="w-full font-black uppercase tracking-tight h-12 px-8 shadow-xl shadow-primary/20 rounded-xl text-base"
            >
                {isSending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Bezig met verzenden...</> : <><Send className="mr-2 h-5 w-5" /> Verstuur en Doorzetten</>}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}