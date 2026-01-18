'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, updateDoc, collection } from 'firebase/firestore';
import { Loader2, Plus, MoreHorizontal, User as UserIcon } from 'lucide-react';
import { firebaseConfig } from '@/firebase/config';

import {
  useCollection,
  useFirestore,
  useUser,
} from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import type { UserProfile } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useToast } from '@/components/ui/use-toast';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';


const userFormSchema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in.'),
  password: z.string().optional(),
  role: z.enum(['admin', 'user']),
}).refine(data => !data.password || data.password.length >= 6, {
    message: 'Wachtwoord moet minimaal 6 tekens lang zijn.',
    path: ['password'],
});

type UserFormValues = z.infer<typeof userFormSchema>;

function UserDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfile | null;
  onSuccess: () => void;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      if (user) {
        form.reset({
          email: user.email || '',
          role: user.role || 'user',
          password: '',
        });
      } else {
        form.reset({
          email: '',
          password: '',
          role: 'user',
        });
      }
    }
  }, [open, user, form]);

  const onSubmit = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try {
      if (user) { // Edit existing user
        const userRef = doc(firestore, 'users', user.id);
        await updateDoc(userRef, { role: data.role });
        toast({ title: 'Gebruiker bijgewerkt', description: `De rol voor ${user.email} is bijgewerkt.` });
      } else { // Create new user
        if (!data.password) {
          form.setError('password', { message: 'Wachtwoord is verplicht voor nieuwe gebruikers.'});
          setIsSubmitting(false);
          return;
        }

        // Use a temporary app instance to create user without signing out the admin
        const tempApp = initializeApp(firebaseConfig, 'user-creation-app');
        const tempAuth = getAuth(tempApp);
        
        try {
            const userCredential = await createUserWithEmailAndPassword(tempAuth, data.email, data.password);
            const newUser = userCredential.user;
            
            const userProfileData: UserProfile = {
                id: newUser.uid,
                email: newUser.email || '',
                role: data.role,
                firstName: '',
                lastName: '',
                sidebarCollapsed: true,
            };

            await setDoc(doc(firestore, 'users', newUser.uid), userProfileData);

            toast({ title: 'Gebruiker aangemaakt', description: `${data.email} is succesvol toegevoegd.`});
        } finally {
            await deleteApp(tempApp);
        }
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving user:", error);
      toast({
        variant: 'destructive',
        title: 'Fout opgetreden',
        description: error.code === 'auth/email-already-in-use' ? 'Dit e-mailadres is al in gebruik.' : error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Gebruiker bewerken' : 'Nieuwe gebruiker aanmaken'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mailadres</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="gebruiker@example.com" {...field} disabled={!!user} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!user && (
              <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wachtwoord</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
             <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder="Selecteer een rol" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="user">Gebruiker</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuleren</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Opslaan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


export function UserManagement() {
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { profile: currentAdminProfile, isLoading: isAdminLoading } = useProfile();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserProfile | null>(null);

  const isSuperUser = currentUser?.email === 'dstoutenburg@meerlanden.nl';
  const isAdmin = currentAdminProfile?.role === 'admin' || isSuperUser;

  const usersCollection = React.useMemo(() => {
    if (!firestore || !isAdmin) return null;
    return collection(firestore, 'users');
  }, [firestore, isAdmin]);

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersCollection);

  const handleAddNew = () => {
    setSelectedUser(null);
    setIsDialogOpen(true);
  };
  
  const handleEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  if (isAdminLoading) {
    return (
       <Card>
        <CardHeader>
          <CardTitle>Gebruikersbeheer</CardTitle>
          <CardDescription>
            Voeg gebruikers toe en beheer hun rollen en rechten.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  
  if (!isAdmin) {
      return (
           <Card>
                <CardHeader>
                    <CardTitle>Geen Toegang</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>U heeft geen rechten om gebruikers te beheren.</p>
                </CardContent>
           </Card>
      )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Gebruikersbeheer</CardTitle>
            <CardDescription>
              Voeg gebruikers toe en beheer hun rollen en rechten.
            </CardDescription>
          </div>
          <Button onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" /> Gebruiker toevoegen
          </Button>
        </CardHeader>
        <CardContent>
            <div className="border rounded-lg">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] px-4 py-2 font-semibold bg-muted text-muted-foreground">
                    <span>Naam</span>
                    <span>E-mail</span>
                    <span>Rol</span>
                    <span />
                </div>
                {isLoadingUsers ? (
                     <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : users && users.length > 0 ? (
                    users.map(user => (
                        <div key={user.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center px-4 py-3 border-t">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback>
                                        {user.firstName?.[0] || '?'}{user.lastName?.[0] || ''}
                                    </AvatarFallback>
                                </Avatar>
                                <span>{user.firstName || user.lastName ? `${user.firstName} ${user.lastName}`.trim() : 'N.B.'}</span>
                            </div>
                            <span className="truncate">{user.email}</span>
                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="w-fit">{user.role}</Badge>
                            <div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onClick={() => handleEdit(user)}>Bewerken</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center p-8 text-muted-foreground">Geen gebruikers gevonden.</div>
                )}
            </div>
        </CardContent>
      </Card>
      <UserDialog 
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        user={selectedUser}
        onSuccess={() => {}}
      />
    </>
  );
}
