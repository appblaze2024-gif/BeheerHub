'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useUser, useFirestore, useDoc, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

const profileFormSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht.'),
  lastName: z.string().min(1, 'Achternaam is verplicht.'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

type UserProfile = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
};


export default function SettingsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);

  const userProfileRef = React.useMemo(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
    },
  });

  const { reset } = form;

  React.useEffect(() => {
    if (userProfile) {
      reset({
        firstName: userProfile.firstName || '',
        lastName: userProfile.lastName || '',
      });
    } else if (user?.displayName && !isProfileLoading && !userProfile) { // Check that we are not loading and profile is confirmed null
        const nameParts = user.displayName.split(' ');
        const firstName = nameParts.shift() || '';
        const lastName = nameParts.join(' ');
        reset({ firstName, lastName });
    }
  }, [userProfile, user, isProfileLoading, reset]);

  const onSubmit = async (data: ProfileFormValues) => {
    if (!userProfileRef) return;

    setIsSaving(true);
    const displayName = `${data.firstName} ${data.lastName}`.trim();
    try {
      await setDocumentNonBlocking(userProfileRef, { 
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: displayName 
      }, { merge: true });
      toast({
        title: 'Profiel opgeslagen',
        description: 'Uw weergavenaam is succesvol bijgewerkt.',
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Er is een fout opgetreden bij het opslaan van uw profiel.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0">
      <PageHeader title="Instellingen" description="Beheer uw profiel- en weergave-instellingen." />
      <div className="mt-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Mijn Profiel</CardTitle>
            <CardDescription>
              Deze naam wordt gebruikt als afzender bij het versturen van e-mails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isProfileLoading ? (
              <div className="flex items-center space-x-4">
                  <div className="space-y-2 w-full">
                      <Loader2 className='mx-auto h-6 w-6 animate-spin' />
                      <p className='text-center text-sm text-muted-foreground'>Profiel laden...</p>
                  </div>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Voornaam</FormLabel>
                          <FormControl>
                            <Input placeholder="Jan" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Achternaam</FormLabel>
                          <FormControl>
                            <Input placeholder="Janssen" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Opslaan
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
