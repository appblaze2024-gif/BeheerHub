'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Send } from 'lucide-react';
import {
  useUser,
} from '@/firebase';
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

const mailSchema = z.object({
  to: z.string().email({ message: 'Voer een geldig e-mailadres in.' }),
  cc: z.string().optional(),
  subject: z.string().min(1, { message: 'Onderwerp is verplicht.' }),
  body: z.string().min(1, { message: 'Bericht mag niet leeg zijn.' }),
});

type MailFormValues = z.infer<typeof mailSchema>;

export function ComposeMailDialog({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { user } = useUser();
  const [open, setOpen] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  const form = useForm<MailFormValues>({
    resolver: zodResolver(mailSchema),
    defaultValues: { to: '', cc: '', subject: '', body: '' },
  });

  async function onSubmit(data: MailFormValues) {
    setIsSending(true);
    const result = await sendEmail({
      ...data,
      fromName: user?.displayName || user?.email || undefined,
    });

    if (result.success) {
      toast({
        title: 'E-mail verzonden!',
        description: `Uw e-mail aan ${data.to} is succesvol in de wachtrij geplaatst.`,
      });
      form.reset();
      setOpen(false);
    } else {
      toast({
        variant: 'destructive',
        title: 'Fout bij verzenden',
        description: result.message || 'Er is een fout opgetreden bij het verzenden van de e-mail.',
      });
    }
    setIsSending(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
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
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSending}>Annuleren</Button>
              <Button type="submit" disabled={isSending}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Verstuur
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
