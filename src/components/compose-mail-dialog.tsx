'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Send } from 'lucide-react';
import {
  useFirestore,
  useUser,
  useCollection,
} from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Medewerker } from '@/lib/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from './ui/textarea';

const mailSchema = z.object({
  to: z.string().email({ message: 'Selecteer een geldige ontvanger.' }),
  cc: z.string().optional(),
  subject: z.string().min(1, { message: 'Onderwerp is verplicht.' }),
  body: z.string().min(1, { message: 'Bericht mag niet leeg zijn.' }),
});

type MailFormValues = z.infer<typeof mailSchema>;

export function ComposeMailDialog({ children }: { children: React.ReactNode }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();
  const [open, setOpen] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  const medewerkersCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'medewerkers');
  }, [firestore]);

  const { data: medewerkers, isLoading: isLoadingMedewerkers } = useCollection<Medewerker>(medewerkersCollection);

  const form = useForm<MailFormValues>({
    resolver: zodResolver(mailSchema),
    defaultValues: { to: '', cc: '', subject: '', body: '' },
  });

  async function onSubmit(data: MailFormValues) {
    setIsSending(true);
    try {
      await sendEmail({
        ...data,
        fromName: user?.displayName || user?.email || 'BeheerHub Gebruiker',
      });
      toast({
        title: 'E-mail verzonden!',
        description: `Uw e-mail aan ${data.to} is succesvol in de wachtrij geplaatst.`,
      });
      form.reset();
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Fout bij verzenden',
        description: 'Er is een fout opgetreden bij het verzenden van de e-mail.',
      });
    } finally {
      setIsSending(false);
    }
  }

  const validMedewerkers = React.useMemo(() => {
    return medewerkers?.filter(m => m.email && m.status === 'Actief') || [];
  }, [medewerkers]);

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
                  <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingMedewerkers}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer een ontvanger" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingMedewerkers ? (
                        <SelectItem value="loading" disabled>Medewerkers laden...</SelectItem>
                      ) : (
                        validMedewerkers.map(m => (
                          <SelectItem key={m.id} value={m.email!}>
                            {m.voornaam} {m.achternaam} ({m.email})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
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
