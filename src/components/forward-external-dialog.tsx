'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Send, X, FileIcon, MapPin, Search } from 'lucide-react';
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
  }, [open, melding?.id, form, allFiles]);

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
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 shrink-0 border-b relative bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Melding Extern Doorzetten</DialogTitle>
              <DialogDescription>Stel de e-mail op voor de externe partij of een interne collega.</DialogDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {melding ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="h-48 w-full rounded-xl border-2 overflow-hidden relative shadow-inner bg-slate-100">
                    <MapboxView longitude={melding.longitude} latitude={melding.latitude} interactive={false} />
                    <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-red-500" /> Locatie Melding
                    </div>
                </div>

                <div className="space-y-3 bg-slate-50 dark:bg-slate-900/20 p-4 rounded-2xl border-2 border-slate-100">
                    <div className="flex items-center justify-between border-b pb-2 mb-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collega selecteren</FormLabel>
                        <div className="relative w-40">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                            <Input placeholder="Zoek..." className="h-7 pl-7 text-[10px] font-bold rounded-lg border-slate-200" value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                        {filteredUsers.map((u) => {
                            const isChecked = u.email && form.watch('to').split(',').map(e => e.trim()).includes(u.email);
                            return (
                                <div key={u.id} className={cn("flex items-center space-x-3 p-2 rounded-xl transition-all cursor-pointer group border-2", isChecked ? "bg-white border-primary/20 shadow-sm" : "hover:bg-white border-transparent")} onClick={() => u.email && toggleUserEmail(u.email)}>
                                    <Checkbox checked={!!isChecked} onCheckedChange={() => u.email && toggleUserEmail(u.email)} />
                                    <div className="min-w-0 flex-1 flex items-center justify-between">
                                        <p className="text-[11px] font-black uppercase tracking-tight text-slate-900 truncate group-hover:text-primary transition-colors">{u.displayName || u.email}</p>
                                        <Badge variant="outline" className="text-[8px] h-4 uppercase font-bold tracking-tighter opacity-60">{u.role}</Badge>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-4">
                  <FormField control={form.control} name="to" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Ontvanger(s)</FormLabel>
                        <FormControl><Input placeholder="voorbeeld@email.nl" {...field} className="h-10 font-bold" /></FormControl>
                        <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={form.control} name="cc" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CC</FormLabel>
                        <FormControl><Input placeholder="" {...field} className="h-10 font-bold" /></FormControl>
                        <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={form.control} name="subject" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Onderwerp</FormLabel>
                        <FormControl><Input {...field} className="h-10 font-black" /></FormControl>
                        <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={form.control} name="body" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bericht</FormLabel>
                        <FormControl><Textarea className="min-h-[250px] text-xs font-medium leading-relaxed resize-none" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                  )} />
                </div>

                {allFiles.length > 0 && (
                <div className="space-y-3 pb-6">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bijlagen ({selectedAttachments.length}/{allFiles.length})</FormLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl border-2 border-slate-100 p-2 bg-slate-50/30">
                        {allFiles.map((file) => (
                        <div key={file.storagePath} className={cn("flex items-center space-x-3 p-2 rounded-xl transition-all cursor-pointer border-2", selectedAttachments.includes(file.storagePath) ? "bg-white border-primary/20 shadow-sm" : "border-transparent hover:bg-white")} onClick={() => setSelectedAttachments(prev => prev.includes(file.storagePath) ? prev.filter(p => p !== file.storagePath) : [...prev, file.storagePath])}>
                            <Checkbox checked={selectedAttachments.includes(file.storagePath)} onCheckedChange={() => setSelectedAttachments(prev => prev.includes(file.storagePath) ? prev.filter(p => p !== file.storagePath) : [...prev, file.storagePath])} />
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
              
              <DialogFooter className="p-6 pt-4 border-t bg-slate-50/50 shrink-0">
                  <Button type="submit" disabled={isSending} className="w-full font-black uppercase tracking-tight h-11 px-8 shadow-lg shadow-primary/20">
                      {isSending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Bezig...</> : <><Send className="mr-2 h-4 w-4" /> Verstuur en Doorzetten</>}
                  </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="p-12 text-center text-muted-foreground">Geen melding geselecteerd.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}