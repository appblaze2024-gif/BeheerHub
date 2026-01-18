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

const standardActions = [
    { id: 'view', label: 'Bekijken' },
    { id: 'create', label: 'Aanmaken' },
    { id: 'edit', label: 'Bewerken' },
    { id: 'delete', label: 'Verwijderen' },
];

const allPermissions = permissionConfig.map(p => ({
    ...p,
    permissions: p.actions || standardActions
}));

const userFormSchema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in.'),
  role: z.enum(['Super admin', 'toezichthouder', 'ondersteuner', 'medewerkers']),
  permissions: z.record(z.record(z.boolean())).optional(),
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
        mod.permissions.forEach(perm => {
          defaultPermissions[mod.module][perm.id] = false;
        });
      });

      if (user) {
        form.reset({
          email: user.email || '',
          role: user.role || 'medewerkers',
          permissions: user.permissions || defaultPermissions,
        });
      } else {
        form.reset({
          email: '',
          role: 'medewerkers',
          permissions: defaultPermissions,
        });
      }
    }
  }, [open, user, form]);
  
  React.useEffect(() => {
    if (role === 'Super admin') {
        const allTruePermissions: { [key: string]: { [key: string]: boolean } } = {};
        allPermissions.forEach(mod => {
            allTruePermissions[mod.module] = {};
            mod.permissions.forEach(perm => {
                allTruePermissions[mod.module][perm.id] = true;
            });
        });
        form.setValue('permissions', allTruePermissions);
    }
  }, [role, form])

  const onSubmit = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try {
      if (user) { // Edit existing user
        const userRef = doc(firestore, 'users', user.id);
        await updateDoc(userRef, { 
            role: data.role,
            permissions: data.permissions 
        });
        toast({ title: 'Gebruiker bijgewerkt', description: `De rol en rechten voor ${user.email} zijn bijgewerkt.` });
      } else { // Create new user
        const tempApp = initializeApp(firebaseConfig, `user-creation-${Date.now()}`);
        const tempAuth = getAuth(tempApp);
        
        try {
            // Generate a random temporary password
            const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
            
            const userCredential = await createUserWithEmailAndPassword(tempAuth, data.email, tempPassword);
            const newUser = userCredential.user;
            
            const userProfileData: UserProfile = {
                id: newUser.uid,
                email: newUser.email || '',
                role: data.role,
                permissions: data.permissions || {},
                firstName: '',
                lastName: '',
                sidebarCollapsed: true,
            };

            await setDoc(doc(firestore, 'users', newUser.uid), userProfileData);

            // Send password reset email
            await sendPasswordResetEmail(tempAuth, data.email);

            toast({ title: 'Gebruiker uitgenodigd', description: `Een e-mail is naar ${data.email} gestuurd om een wachtwoord in te stellen.`});
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

  const isSuperAdminEditing = role === 'Super admin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{user ? 'Gebruiker bewerken' : 'Nieuwe gebruiker aanmaken'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
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
            <div>
              <FormLabel>Rechten</FormLabel>
              <div className="space-y-4 mt-2">
                {allPermissions.map((module) => (
                  <div key={module.module} className="border p-4 rounded-md">
                    <h4 className="font-semibold capitalize mb-2">{module.label}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {module.permissions.map((permission) => (
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
                {user ? 'Opslaan' : 'Uitnodigen'}
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
  const { profile: currentAdminProfile, isLoading: isAdminLoading } = useProfile();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserProfile | null>(null);

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
  
  const canCreate = isSuperUser || !!currentAdminProfile?.permissions?.users?.create;
  const canEdit = isSuperUser || !!currentAdminProfile?.permissions?.users?.edit;


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
              <Plus className="mr-2 h-4 w-4" /> Gebruiker uitnodigen
            </Button>
          )}
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
                ) : usersError ? (
                    <div className="p-4 text-destructive-foreground bg-destructive/80 text-center">{usersError.message}</div>
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
                            <Badge variant={user.role === 'Super admin' ? 'default' : 'secondary'} className="w-fit">{user.role}</Badge>
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
