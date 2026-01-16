'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection, useFirestore }from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Medewerker } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sendEmail } from './actions';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Send } from 'lucide-react';

const mailSchema = z.object({
  to: z.string().email({ message: 'Selecteer een geldige ontvanger.' }),
  subject: z.string().min(1, { message: 'Onderwerp is verplicht.' }),
  body: z.string().min(1, { message: 'Bericht mag niet leeg zijn.' }),
});

type MailFormValues = z.infer<typeof mailSchema>;

export default function MailPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSending, setIsSending] = React.useState(false);

  const medewerkersCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'medewerkers');
  }, [firestore]);

  const { data: medewerkers, isLoading: isLoadingMedewerkers } = useCollection<Medewerker>(medewerkersCollection);

  const form = useForm<MailFormValues>({
    resolver: zodResolver(mailSchema),
    defaultValues: {
      to: '',
      subject: '',
      body: '',
    },
  });

  async function onSubmit(data: MailFormValues) {
    setIsSending(true);
    try {
      // Here we call a server action. In a real app, this would send the email.
      // For now, we'll simulate it.
      await sendEmail(data);
      toast({
        title: 'E-mail verzonden!',
        description: `Uw e-mail aan ${data.to} is succesvol in de wachtrij geplaatst.`,
      });
      form.reset();
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
    <div className="flex flex-col flex-1 p-6 min-h-0">
      <PageHeader title="Interne Mail" />
      <div className="flex-1 mt-6">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Nieuw Bericht</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Onderwerp</FormLabel>
                      <FormControl>
                        <Input placeholder="Onderwerp van uw bericht" {...field} />
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
                        <Textarea
                          placeholder="Typ hier uw bericht..."
                          className="min-h-[200px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSending}>
                    {isSending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="mr-2 h-4 w-4" />
                    )}
                    Verstuur
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
