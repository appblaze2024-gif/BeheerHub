'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, updateDoc, collection } from 'firebase/firestore';
import { Loader2, Plus, MoreHorizontal, User as UserIcon } from 'lucide-react';
import { firebaseConfig } from '@/firebase/config';

import {
  useCollection,
  useFirestore,
  useFirebaseApp,
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
import { Checkbox } from './ui/checkbox';

const permissionConfig = [
    { module: 'projects', label: 'Projecten', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'employees', label: 'Medewerkers', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'workPlanning', label: 'Werkplanning', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'edit', label: 'Bewerken' }] },
    { module: 'weeklyReports', label: 'Weekstaten', actions: [{ id: 'view', label: 'Bekijken' }] },
    { module: 'reports', label: 'Rapportages', actions: [{ id: 'view', label: 'Bekijken' }] },
    { module: 'vehicles', label: 'Wagenpark', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'objects', label: 'Objecten', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'inventory', label: 'Voorraadbeheer', actions: [{ id: 'view', label: 'Bekijken' }] },
    { module: 'issues', label: 'Meldingen', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'navigation', label: 'Navigatiemodule', actions: [{ id: 'use', label: 'Gebruiken' }] },
    { module: 'mail', label: 'Mail', actions: [{ id: 'use', label: 'Gebruiken' }] },
    { module: 'users', label: 'Gebruikersbeheer', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
];

const allPermissions = permissionConfig;

const userFormSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht.'),
  lastName: z.string().min(1, 'Achternaam is verplicht.'),
  email: z.string().email('Voer een geldig e-mailadres in.'),
  role: z.enum(['Super admin', 'toezichthouder', 'ondersteuner', 'medewerkers']),
  permissions: z.record(z.record(z.boolean())).optional(),
  status: z.string().optional(),
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
  const role = form.watch('role');

  React.useEffect(() => {
    if (open) {
      const defaultPermissions: { [key: string]: { [key: string]: boolean } } = {};
      allPermissions.forEach(mod => {
        defaultPermissions[mod.module] = {};
        mod.actions.forEach(perm => {
          defaultPermissions[mod.module][perm.id] = false;
        });
      });

      if (user) {
        form.reset({
          email: user.email || '',
          role: user.role || 'medewerkers',
          permissions: user.permissions || defaultPermissions,
          status: user.status || 'Niet uitgenodigd',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
        });
      } else {
        form.reset({
          email: '',
          role: 'medewerkers',
          permissions: defaultPermissions,
          status: 'Niet uitgenodigd',
          firstName: '',
          lastName: '',
        });
      }
    }
  }, [open, user, form]);
  
  React.useEffect(() => {
    if (role === 'Super admin') {
        const allTruePermissions: { [key: string]: { [key: string]: boolean } } = {};
        allPermissions.forEach(mod => {
            allTruePermissions[mod.module] = {};
            mod.actions.forEach(perm => {
                allTruePermissions[mod.module][perm.id] = true;
            });
        });
        form.setValue('permissions', allTruePermissions);
    }
  }, [role, form])

  const onSubmit = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try {
      const displayName = `${data.firstName} ${data.lastName}`.trim();

      if (user) { // Edit existing user
        const userRef = doc(firestore, 'users', user.id);
        await updateDoc(userRef, { 
            firstName: data.firstName,
            lastName: data.lastName,
            displayName,
            role: data.role,
            permissions: data.permissions,
            status: data.status,
        });
        toast({ title: 'Gebruiker bijgewerkt', description: `De rol en rechten voor ${user.email} zijn bijgewerkt.` });
      } else { // Create new user
        const tempApp = initializeApp(firebaseConfig, `user-creation-${Date.now()}`);
        const tempAuth = getAuth(tempApp);
        
        try {
            const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
            const userCredential = await createUserWithEmailAndPassword(tempAuth, data.email, tempPassword);
            const newUser = userCredential.user;
            
            const userProfileData: UserProfile = {
                id: newUser.uid,
                email: newUser.email || '',
                firstName: data.firstName,
                lastName: data.lastName,
                displayName,
                role: data.role,
                permissions: data.permissions || {},
                sidebarCollapsed: true,
                status: 'Niet uitgenodigd',
            };

            await setDoc(doc(firestore, 'users', newUser.uid), userProfileData);

            toast({ title: 'Gebruiker aangemaakt', description: `Stuur ${data.email} een uitnodiging om het account te activeren.`});
        } finally {
            await deleteApp(tempApp);
        }
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving user:", error);
      let description = 'Er is een onbekende fout opgetreden. Probeer het later opnieuw.';
      if (error.code === 'auth/email-already-in-use') {
          description = 'Dit e-mailadres is al in gebruik.';
      } else if (error.code === 'auth/invalid-email') {
          description = 'Het ingevoerde e-mailadres is ongeldig.';
      } else if (error.code) {
          description = `Er is een fout opgetreden: ${error.code}`;
      }
      toast({
        variant: 'destructive',
        title: 'Fout opgetreden',
        description: description,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSuperAdminEditing = role === 'Super admin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{user ? 'Gebruiker bewerken' : 'Nieuwe gebruiker aanmaken'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Voornaam</FormLabel>
                  <FormControl><Input placeholder="Jan" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Achternaam</FormLabel>
                  <FormControl><Input placeholder="Janssen" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                              <SelectTrigger><SelectValue placeholder="Selecteer een rol" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                              <SelectItem value="Super admin">Super admin</SelectItem>
                              <SelectItem value="toezichthouder">Toezichthouder</SelectItem>
                              <SelectItem value="ondersteuner">Ondersteuner</SelectItem>
                              <SelectItem value="medewerkers">Medewerkers</SelectItem>
                          </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
            
            {user && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer een status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Actief">Actief</SelectItem>
                        <SelectItem value="Inactief">Inactief</SelectItem>
                        <SelectItem value="Niet uitgenodigd">Niet uitgenodigd</SelectItem>
                        <SelectItem value="Uitgenodigd">Uitgenodigd</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div>
              <FormLabel>Rechten</FormLabel>
              <div className="space-y-4 mt-2">
                {allPermissions.map((module) => (
                  <div key={module.module} className="border p-4 rounded-md">
                    <h4 className="font-semibold capitalize mb-2">{module.label}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {module.actions.map((permission) => (
                        <FormField
                          key={permission.id}
                          control={form.control}
                          name={`permissions.${module.module}.${permission.id}`}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  disabled={isSubmitting || isSuperAdminEditing}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {permission.label}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className="sticky bottom-0 bg-background py-4 -mx-4 px-6">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuleren</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {user ? 'Opslaan' : 'Aanmaken'}
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
  const auth = getAuth(useFirebaseApp());
  const { profile: currentAdminProfile, isLoading: isAdminLoading } = useProfile();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserProfile | null>(null);
  const { toast } = useToast();

  const isSuperUser = currentAdminProfile?.role === 'Super admin';
  const canManageUsers = isSuperUser || !!currentAdminProfile?.permissions?.users?.view;

  const usersCollection = React.useMemo(() => {
    if (!firestore || !canManageUsers) return null;
    return collection(firestore, 'users');
  }, [firestore, canManageUsers]);

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useCollection<UserProfile>(usersCollection);

  const handleAddNew = () => {
    setSelectedUser(null);
    setIsDialogOpen(true);
  };
  
  const handleEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };
  
  const handleSendInvitation = async (user: UserProfile) => {
    if (!user.email) {
        toast({ variant: 'destructive', title: 'Fout', description: 'Gebruiker heeft geen e-mailadres.' });
        return;
    }

    toast({ description: `Uitnodiging wordt verstuurd naar ${user.email}...` });
    
    try {
        await sendPasswordResetEmail(auth, user.email, {
            url: `${window.location.origin}/reset-password`,
            handleCodeInApp: true,
        });
        
        const userRef = doc(firestore, 'users', user.id);
        await updateDoc(userRef, { status: 'Uitgenodigd' });

        toast({ title: 'Uitnodiging verstuurd!', description: `Een e-mail is naar ${user.email} gestuurd om een wachtwoord in te stellen. Vraag hen de spamfolder te controleren.` });
    } catch (error: any) {
        console.error("Error sending invitation:", error);
        toast({ variant: 'destructive', title: 'Versturen mislukt', description: error.message || 'Kon de uitnodiging niet versturen.' });
    }
  };

  const canCreate = isSuperUser || !!currentAdminProfile?.permissions?.users?.create;
  const canEdit = isSuperUser || !!currentAdminProfile?.permissions?.users?.edit;

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
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
  
  if (!canManageUsers) {
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
          {canCreate && (
            <Button onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" /> Gebruiker aanmaken
            </Button>
          )}
        </CardHeader>
        <CardContent>
            <div className="border rounded-lg">
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] px-4 py-2 font-semibold bg-muted text-muted-foreground">
                    <span>Naam</span>
                    <span>E-mail</span>
                    <span>Rol</span>
                    <span>Status</span>
                    <span />
                </div>
                {isLoadingUsers ? (
                     <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : usersError ? (
                    <div className="p-4 text-destructive-foreground bg-destructive/80 text-center">{usersError.message}</div>
                ) : users && users.length > 0 ? (
                    users.map(user => (
                        <div key={user.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center px-4 py-3 border-t">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback>
                                        {getInitials(user.firstName, user.lastName)}
                                    </AvatarFallback>
                                </Avatar>
                                <span>{user.displayName || 'N.B.'}</span>
                            </div>
                            <span className="truncate">{user.email}</span>
                            <Badge variant={user.role === 'Super admin' ? 'default' : 'secondary'} className="w-fit">{user.role}</Badge>
                            <div>
                                {user.role !== 'Super admin' && (
                                    <Badge
                                        variant={
                                            user.status === 'Actief' ? 'outline'
                                            : user.status === 'Inactief' ? 'secondary'
                                            : user.status === 'Uitgenodigd' ? 'outline'
                                            : 'destructive'
                                        }
                                        className={
                                            user.status === 'Actief' ? 'text-green-600 border-green-600 w-fit'
                                            : user.status === 'Inactief' ? 'w-fit'
                                            : user.status === 'Uitgenodigd' ? 'text-blue-600 border-blue-600 w-fit'
                                            : 'w-fit'
                                        }
                                        >
                                        {user.status || 'Niet uitgenodigd'}
                                    </Badge>
                                )}
                            </div>
                            <div>
                              {canEdit && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onClick={() => handleEdit(user)}>Bewerken</DropdownMenuItem>
                                        {(user.status === 'Niet uitgenodigd' || user.status === 'Uitgenodigd') && user.role !== 'Super admin' && (
                                            <DropdownMenuItem onClick={() => handleSendInvitation(user)}>
                                                {user.status === 'Niet uitgenodigd' ? 'Verstuur uitnodiging' : 'Uitnodiging opnieuw versturen'}
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                              )}
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

    