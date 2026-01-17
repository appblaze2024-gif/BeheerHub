'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Settings } from 'lucide-react';
import {
  useFirestore,
  useUser,
  useDoc,
  updateDocumentNonBlocking,
} from '@/firebase';
import { doc } from 'firebase/firestore';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from './ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle } from 'lucide-react';

const mailSettingsSchema = z.object({
  incoming: z.object({
    server: z.string().min(1, 'Server is verplicht'),
    port: z.coerce.number().min(1, 'Poort is verplicht'),
    user: z.string().min(1, 'Gebruikersnaam is verplicht'),
    password: z.string().min(1, 'Wachtwoord is verplicht'),
    security: z.string().default('SSL/TLS'),
  }),
  outgoing: z.object({
    server: z.string().min(1, 'Server is verplicht'),
    port: z.coerce.number().min(1, 'Poort is verplicht'),
    user: z.string().min(1, 'Gebruikersnaam is verplicht'),
    password: z.string().min(1, 'Wachtwoord is verplicht'),
    security: z.string().default('SSL/TLS'),
  }),
});

type MailSettingsFormValues = z.infer<typeof mailSettingsSchema>;

export function MailSettingsDialog({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  const userProfileRef = React.useMemo(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<{ mailSettings?: MailSettingsFormValues }>(userProfileRef);

  const form = useForm<MailSettingsFormValues>({
    resolver: zodResolver(mailSettingsSchema),
    defaultValues: {
      incoming: { server: '', port: 993, user: '', password: '', security: 'SSL/TLS' },
      outgoing: { server: '', port: 465, user: '', password: '', security: 'SSL/TLS' },
    }
  });
  
  React.useEffect(() => {
    if (open && userProfile?.mailSettings) {
      form.reset(userProfile.mailSettings);
    } else if (open) {
      form.reset({
        incoming: { server: '', port: 993, user: user?.email || '', password: '', security: 'SSL/TLS' },
        outgoing: { server: '', port: 465, user: user?.email || '', password: '', security: 'SSL/TLS' },
      });
    }
  }, [open, userProfile, user, form]);

  const onSubmit = async (data: MailSettingsFormValues) => {
    if (!userProfileRef) return;
    setIsSubmitting(true);
    try {
      await updateDocumentNonBlocking(userProfileRef, { mailSettings: data });
      toast({
        title: 'Instellingen opgeslagen',
        description: 'Uw e-mailinstellingen zijn succesvol bijgewerkt.',
      });
      setOpen(false);
    } catch (error) {
      console.error('Fout bij opslaan mailinstellingen:', error);
      toast({
        variant: 'destructive',
        title: 'Fout bij opslaan',
        description: 'Kon de e-mailinstellingen niet opslaan.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>E-mailinstellingen</DialogTitle>
          <DialogDescription>
            Configureer hier uw IMAP- en SMTP-instellingen voor het ophalen en verzenden van e-mail.
          </DialogDescription>
        </DialogHeader>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Beveiligingswaarschuwing</AlertTitle>
          <AlertDescription>
            Het opslaan van wachtwoorden op deze manier is onveilig. Gebruik dit alleen voor testdoeleinden.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs defaultValue="incoming" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="incoming">Inkomend (IMAP)</TabsTrigger>
                <TabsTrigger value="outgoing">Uitgaand (SMTP)</TabsTrigger>
              </TabsList>
              
              <TabsContent value="incoming" className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="incoming.server"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server</FormLabel>
                      <FormControl><Input placeholder="imap.example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="incoming.port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Poort</FormLabel>
                      <FormControl><Input type="number" placeholder="993" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="incoming.user"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gebruikersnaam</FormLabel>
                      <FormControl><Input placeholder="gebruiker@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="incoming.password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wachtwoord</FormLabel>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="incoming.security"
                  render={({ field }) => (
                     <FormItem>
                        <FormLabel>Beveiliging</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="SSL/TLS">SSL/TLS</SelectItem>
                                <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                                <SelectItem value="None">Geen</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
              
              <TabsContent value="outgoing" className="space-y-4 pt-4">
                  <FormField
                  control={form.control}
                  name="outgoing.server"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server</FormLabel>
                      <FormControl><Input placeholder="smtp.example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="outgoing.port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Poort</FormLabel>
                      <FormControl><Input type="number" placeholder="465" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="outgoing.user"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gebruikersnaam</FormLabel>
                      <FormControl><Input placeholder="gebruiker@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="outgoing.password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wachtwoord</FormLabel>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="outgoing.security"
                  render={({ field }) => (
                     <FormItem>
                        <FormLabel>Beveiliging</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="SSL/TLS">SSL/TLS</SelectItem>
                                <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                                <SelectItem value="None">Geen</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Instellingen Opslaan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
