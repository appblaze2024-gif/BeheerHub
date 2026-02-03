
'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Send, Paperclip, X, FileIcon, CheckCircle2 } from 'lucide-react';
import { sendEmail } from '@/app/mail/actions';
import { useToast } from '@/components/ui/use-toast';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';

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
import type { Melding, UploadedFile } from '@/lib/types';

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

// Helper to fetch file and convert to base64
const fetchToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export function ForwardExternalDialog({ open, onOpenChange, melding, onSuccess }: ForwardExternalDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isSending, setIsSending] = React.useState(false);
  const [selectedAttachments, setSelectedAttachments] = React.useState<string[]>([]);

  const form = useForm<ForwardFormValues>({
    resolver: zodResolver(forwardSchema),
    defaultValues: { to: '', cc: '', subject: '', body: '' },
  });

  const allFiles = React.useMemo(() => {
    if (!melding) return [];
    return [...(melding.files || []), ...(melding.fotos || [])];
  }, [melding]);

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
      
      // Default select all attachments
      setSelectedAttachments(allFiles.map(f => f.storagePath));
      setIsSending(false);
    }
  }, [open, melding, form, allFiles]);

  const toggleAttachment = (path: string) => {
    setSelectedAttachments(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  async function onSubmit(data: ForwardFormValues) {
    if (!melding || !firestore) return;
    setIsSending(true);

    try {
        const selectedFiles = allFiles.filter(f => selectedAttachments.includes(f.storagePath));
        
        // Fetch all selected files and convert to base64
        const attachmentPayloads = await Promise.all(
            selectedFiles.map(async (file) => ({
                content: await fetchToBase64(file.url),
                filename: file.name,
                type: file.type,
            }))
        );

        const result = await sendEmail({
            ...data,
            attachments: attachmentPayloads,
        });

        if (result.success) {
            // Update issue status
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
         toast({
            variant: 'destructive',
            title: 'Fout bij verzenden',
            description: error.message || 'Er is een fout opgetreden bij het verzenden van de e-mail.',
        });
    } finally {
        setIsSending(false);
    }
  }

  if (!melding) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Melding Extern Doorzetten</DialogTitle>
          <DialogDescription>Stel de e-mail op voor de externe partij. De meldingdetails zijn al ingevuld.</DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ScrollArea className="flex-1 px-6">
                <div className="space-y-4 py-2">
                    <FormField
                    control={form.control}
                    name="to"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Ontvanger(s)</FormLabel>
                        <FormControl>
                            <Input placeholder="" {...field} />
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
                        <FormLabel>CC</FormLabel>
                        <FormControl>
                            <Input placeholder="" {...field} />
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
                        <FormLabel>Onderwerp</FormLabel>
                        <FormControl>
                            <Input {...field} />
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
                        <FormLabel>Bericht</FormLabel>
                        <FormControl>
                            <Textarea className="min-h-[200px] text-xs" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />

                    {allFiles.length > 0 && (
                    <div className="space-y-2">
                        <FormLabel>Bijlagen selecteren ({selectedAttachments.length}/{allFiles.length})</FormLabel>
                        <div className="grid grid-cols-1 gap-2 rounded-md border p-2 bg-muted/30">
                            {allFiles.map((file) => (
                            <div 
                                key={file.storagePath} 
                                className="flex items-center space-x-3 p-2 rounded hover:bg-muted transition-colors cursor-pointer"
                                onClick={() => toggleAttachment(file.storagePath)}
                            >
                                <Checkbox 
                                    id={file.storagePath} 
                                    checked={selectedAttachments.includes(file.storagePath)}
                                    onCheckedChange={() => toggleAttachment(file.storagePath)}
                                />
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="text-xs truncate">{file.name}</span>
                                </div>
                            </div>
                            ))}
                        </div>
                    </div>
                    )}
                </div>
            </ScrollArea>
            
            <DialogFooter className="p-6 pt-4 border-t bg-muted/10">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSending}>Annuleren</Button>
                <Button type="submit" disabled={isSending}>
                    {isSending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Bezig met voorbereiden...
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
      </DialogContent>
    </Dialog>
  );
}
