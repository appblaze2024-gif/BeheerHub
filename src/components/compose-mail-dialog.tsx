'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Send, Paperclip, X } from 'lucide-react';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { sendEmail } from '@/app/mail/actions';
import { useToast } from '@/components/ui/use-toast';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
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
import type { EmailAttachment } from '@/ai/flows/fetch-emails-flow';

const mailSchema = z.object({
  to: z.string().email({ message: 'Voer een geldig e-mailadres in.' }),
  cc: z.string().optional(),
  subject: z.string().min(1, { message: 'Onderwerp is verplicht.' }),
  body: z.string().min(1, { message: 'Bericht mag niet leeg zijn.' }),
});

type MailFormValues = z.infer<typeof mailSchema>;

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = error => reject(error);
    });
};

interface ComposeMailDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Partial<MailFormValues & { attachments: EmailAttachment[] }>;
}

type UserProfileData = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
};


export function ComposeMailDialog({ open, onOpenChange, initialData, children }: ComposeMailDialogProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const [isSending, setIsSending] = React.useState(false);
  const [newAttachments, setNewAttachments] = React.useState<File[]>([]);
  const [forwardedAttachments, setForwardedAttachments] = React.useState<EmailAttachment[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const userProfileRef = React.useMemo(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfileData>(userProfileRef);

  const form = useForm<MailFormValues>({
    resolver: zodResolver(mailSchema),
    defaultValues: { to: '', cc: '', subject: '', body: '' },
  });

  React.useEffect(() => {
    if (open) {
      const { attachments: initialAttachments, ...formData } = initialData || {};
      form.reset(formData || { to: '', cc: '', subject: '', body: '' });
      setNewAttachments([]);
      setForwardedAttachments(initialAttachments || []);
      setIsSending(false);
    }
  }, [open, initialData, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setNewAttachments(prev => [...prev, ...Array.from(event.target.files!)]);
      // Reset file input to allow selecting the same file again
      event.target.value = '';
    }
  };

  const removeNewAttachment = (fileToRemove: File) => {
    setNewAttachments(prev => prev.filter(file => file !== fileToRemove));
  };
  
  const removeForwardedAttachment = (fileToRemove: EmailAttachment) => {
    setForwardedAttachments(prev => prev.filter(file => file !== fileToRemove));
  };


  async function onSubmit(data: MailFormValues) {
    if (!user?.email) {
      toast({
        variant: "destructive",
        title: "Fout",
        description: "Kon gebruiker niet verifiëren. Probeer opnieuw in te loggen.",
      });
      return;
    }
    setIsSending(true);

    try {
        const newAttachmentPayloads = await Promise.all(
            newAttachments.map(async (file) => ({
                content: await fileToBase64(file),
                filename: file.name,
                type: file.type,
            }))
        );
        
        const forwardedAttachmentPayloads = forwardedAttachments.map(att => ({
            content: att.content,
            filename: att.filename,
            type: att.contentType,
        }));

        const allAttachments = [...newAttachmentPayloads, ...forwardedAttachmentPayloads];

        let senderName: string;
        if (userProfile?.firstName && userProfile?.lastName) {
          senderName = `${userProfile.firstName} ${userProfile.lastName}`;
        } else if (user?.email) {
          senderName = user.email;
        } else {
           toast({
            variant: "destructive",
            title: "Fout",
            description: "Kon afzendernaam niet vinden. Stel uw naam in op de profielpagina.",
          });
          setIsSending(false);
          return;
        }

        const result = await sendEmail({
            ...data,
            fromName: senderName,
            fromEmail: user.email,
            attachments: allAttachments,
        });

        if (result.success) {
            toast({
                title: 'E-mail verzonden!',
                description: `Uw e-mail aan ${data.to} is succesvol in de wachtrij geplaatst.`,
            });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nieuw Bericht</DialogTitle>
          <DialogDescription>Stel uw e-mail op en verstuur deze naar een medewerker.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aan</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                  <FormLabel>Cc</FormLabel>
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
                    <Textarea className="min-h-[200px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(newAttachments.length > 0 || forwardedAttachments.length > 0) && (
              <div className="space-y-2">
                <FormLabel>Bijlagen</FormLabel>
                <div className="space-y-2 rounded-md border p-2 max-h-32 overflow-y-auto">
                    {forwardedAttachments.map((file, index) => (
                    <div key={`fwd-${index}-${file.filename}`} className="flex items-center justify-between text-sm p-1 hover:bg-muted rounded">
                        <span className="truncate">{file.filename}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeForwardedAttachment(file)}>
                        <X className="h-4 w-4" />
                        </Button>
                    </div>
                    ))}
                  {newAttachments.map((file, index) => (
                    <div key={`new-${index}-${file.name}`} className="flex items-center justify-between text-sm p-1 hover:bg-muted rounded">
                      <span className="truncate">{file.name}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeNewAttachment(file)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <DialogFooter className="sm:justify-between">
                <div>
                     <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isSending}>
                        <Paperclip className="mr-2 h-4 w-4" />
                        Bijlage
                     </Button>
                     <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                     />
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSending}>Annuleren</Button>
                    <Button type="submit" disabled={isSending || isProfileLoading}>
                        {isSending || isProfileLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Verstuur
                    </Button>
                </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
