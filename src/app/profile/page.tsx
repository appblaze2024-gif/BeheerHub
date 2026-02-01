'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useUser, useFirestore, useDoc, setDocumentNonBlocking } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserManagement } from '@/components/user-management';
import type { UserProfile } from '@/lib/types';
import { useProfile } from '@/firebase/profile-provider';
import { GemeenteSelect } from '@/components/gemeente-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MapGL from 'react-map-gl';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const mapStyles = [
    { name: 'Standaard', url: 'mapbox://styles/mapbox/streets-v12' },
    { name: 'Buiten', url: 'mapbox://styles/mapbox/outdoors-v12' },
    { name: 'Licht', url: 'mapbox://styles/mapbox/light-v11' },
    { name: 'Donker', url: 'mapbox://styles/mapbox/dark-v11' },
    { name: 'Satelliet', url: 'mapbox://styles/mapbox/satellite-v9' },
    { name: 'Satelliet met straten', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { name: 'Navigatie (dag)', url: 'mapbox://styles/mapbox/navigation-day-v1' },
    { name: 'Navigatie (nacht)', url: 'mapbox://styles/mapbox/navigation-night-v1' },
];

const profileFormSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht.'),
  lastName: z.string().min(1, 'Achternaam is verplicht.'),
  schouwenGemeente: z.string().nullable(),
  schouwenMapStyle: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;


export default function ProfilePage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const { profile, isLoading: isProfileLoading } = useProfile();


  const userProfileRef = React.useMemo(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile, isLoading: isProfileLoadingFromDoc } = useDoc<UserProfile>(userProfileRef);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      schouwenGemeente: null,
      schouwenMapStyle: 'mapbox://styles/mapbox/streets-v12',
    },
  });

  const { reset, watch } = form;
  const watchedMapStyle = watch('schouwenMapStyle');

  React.useEffect(() => {
    if (userProfile) {
        reset({
          firstName: userProfile.firstName || '',
          lastName: userProfile.lastName || '',
          schouwenGemeente: userProfile.schouwenGemeente || null,
          schouwenMapStyle: userProfile.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12',
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
        displayName: displayName,
        schouwenGemeente: data.schouwenGemeente,
        schouwenMapStyle: data.schouwenMapStyle,
      }, { merge: true });
      toast({
        title: 'Profiel opgeslagen',
        description: 'Uw gegevens zijn succesvol bijgewerkt.',
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

  const canViewTab = (tabId: 'profile' | 'users') => {
    if (isProfileLoading) return false;
    if (profile?.role === 'Super admin') return true;
    return profile?.permissions?.users?.tabs?.[tabId] ?? false;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-6">
      <Tabs defaultValue="profile" className="flex flex-col flex-1 space-y-6">
        <TabsList>
          {canViewTab('profile') && <TabsTrigger value="profile">Mijn Profiel</TabsTrigger>}
          {canViewTab('users') && <TabsTrigger value="users">Gebruikers</TabsTrigger>}
        </TabsList>
        
        {canViewTab('profile') && <TabsContent value="profile">
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle>Mijn Profiel</CardTitle>
              <CardDescription>
                Deze naam wordt gebruikt als afzender bij het versturen van e-mails. Pas hier ook uw kaartvoorkeuren aan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isProfileLoadingFromDoc ? (
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
                     {profile?.role !== 'medewerkers' && <FormField
                        control={form.control}
                        name="schouwenGemeente"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Standaard Gemeente (Schouwen)</FormLabel>
                            <FormControl>
                                <GemeenteSelect
                                    value={field.value}
                                    onValueChange={field.onChange}
                                />
                            </FormControl>
                            <FormDescription>
                                Stel de standaardgemeente in die op het dashboard wordt getoond.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                         <FormField
                            control={form.control}
                            name="schouwenMapStyle"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Standaard Kaartstijl</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecteer een kaartstijl" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {mapStyles.map(style => (
                                      <SelectItem key={style.url} value={style.url}>{style.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                    Kies de kaartstijl die standaard in de applicatie wordt gebruikt.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="aspect-video w-full rounded-md overflow-hidden border">
                              <MapGL
                                initialViewState={{
                                  latitude: 52.1326,
                                  longitude: 5.2913,
                                  zoom: 5
                                }}
                                mapStyle={watchedMapStyle}
                                mapboxAccessToken={MAPBOX_TOKEN}
                                style={{width: '100%', height: '100%'}}
                              />
                          </div>
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
        </TabsContent>}
        
        {canViewTab('users') && <TabsContent value="users">
          <UserManagement />
        </TabsContent>}
      </Tabs>
    </div>
  );
}
