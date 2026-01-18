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
import { doc, setDoc } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserManagement } from '@/components/user-management';
import type { UserProfile } from '@/lib/types';

const profileFormSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht.'),
  lastName: z.string().min(1, 'Achternaam is verplicht.'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;


export default function ProfilePage() {
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
    }
  }, [userProfile, reset]);

  const onSubmit = async (data: ProfileFormValues) => {
    if (!userProfileRef) return;

    setIsSaving(true);
    const displayName = `${data.firstName} ${data.lastName}`.trim();
    try {
      await setDoc(userProfileRef, { 
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
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="Instellingen" description="Beheer uw account- en organisatie-instellingen." />
      
      <Tabs defaultValue="profile" className="flex flex-col flex-1 px-6 pb-6 space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Mijn Profiel</TabsTrigger>
          <TabsTrigger value="users">Gebruikers</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Mijn Profiel</CardTitle>
              <CardDescription>
                Deze naam wordt gebruikt als afzender bij het versturen van e-mails.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isProfileLoading ? (
                <div className="flex items-center justify-center space-x-4 h-40">
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
        </TabsContent>
        
        <TabsContent value="users">
          <UserManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
