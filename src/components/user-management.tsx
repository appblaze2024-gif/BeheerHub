'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, collection } from 'firebase/firestore';
import { Loader2, Plus, MoreHorizontal, User as UserIcon, Nfc } from 'lucide-react';
import { firebaseConfig } from '@/firebase/config';

import {
  useCollection,
  useFirestore,
  useFirebaseApp,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import type { UserProfile } from '@/lib/types';
import type { Project, Wijk } from '@/app/projects/page';
import { permissionConfig, getDefaultPermissions } from '@/lib/permissions';

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
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Info } from 'lucide-react';


const allPermissions = permissionConfig;

const userFormSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht.'),
  lastName: z.string().min(1, 'Achternaam is verplicht.'),
  email: z.string().email('Voer een geldig e-mailadres in.'),
  role: z.enum(['Super admin', 'toezichthouder', 'ondersteuner', 'medewerkers']),
  permissions: z.record(z.any()).optional(),
  status: z.string().optional(),
  wijk: z.string().optional(),
  veegroute: z.string().optional(),
  prullenbakkenroute: z.string().optional(),
  nfcTagId: z.string().optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

function UserDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
  wijken,
  veegroutes,
  prullenbakkenroutes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfile | null;
  onSuccess: () => void;
  wijken: Wijk[];
  veegroutes: Wijk[];
  prullenbakkenroutes: Wijk[];
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isNfcScanning, setIsNfcScanning] = React.useState(false);
  const [nfcScanError, setNfcScanError] = React.useState<string | null>(null);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
  });
  const role = form.watch('role');

  React.useEffect(() => {
    if (open) {
      const defaultPermissions = getDefaultPermissions();
      if (user) {
        const userPermissions = user.permissions || {};
        const mergedPermissions: { [key: string]: any } = {};

        Object.keys(defaultPermissions).forEach(module => {
            mergedPermissions[module] = {
                ...defaultPermissions[module],
                ...(userPermissions[module] || {}),
            };
            if(defaultPermissions[module].tabs) {
                mergedPermissions[module].tabs = {
                    ...(defaultPermissions[module].tabs || {}),
                    ...(userPermissions[module]?.tabs || {})
                }
            }
        });
        
        form.reset({
          email: user.email || '',
          role: user.role || 'medewerkers',
          permissions: mergedPermissions,
          status: user.status || 'Niet uitgenodigd',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          wijk: user.wijk || 'geen_wijk',
          veegroute: user.veegroute || 'geen_veegroute',
          prullenbakkenroute: user.prullenbakkenroute || 'geen_prullenbakkenroute',
          nfcTagId: user.nfcTagId || '',
        });
      } else {
        form.reset({
          email: '',
          role: 'medewerkers',
          permissions: defaultPermissions,
          status: 'Niet uitgenodigd',
          firstName: '',
          lastName: '',
          wijk: 'geen_wijk',
          veegroute: 'geen_veegroute',
          prullenbakkenroute: 'geen_prullenbakkenroute',
          nfcTagId: '',
        });
      }
    }
  }, [open, user, form]);
  
  React.useEffect(() => {
    if (role === 'Super admin') {
        const allTruePermissions: { [key: string]: { [key: string]: boolean | { [key: string]: boolean } } } = {};
        allPermissions.forEach(mod => {
            allTruePermissions[mod.module] = {};
            mod.actions.forEach(perm => {
                (allTruePermissions[mod.module] as any)[perm.id] = true;
            });
            if (mod.tabs) {
              const tabPermissions: { [key: string]: boolean } = {};
              mod.tabs.forEach(tab => {
                  tabPermissions[tab.id] = true;
              });
              allTruePermissions[mod.module].tabs = tabPermissions;
          }
        });
        form.setValue('permissions', allTruePermissions);
    }
  }, [role, form])

  const handleNfcScan = async () => {
    if (!('NDEFReader' in window)) {
      setNfcScanError('Web NFC wordt niet ondersteund op dit apparaat.');
      return;
    }
    setIsNfcScanning(true);
    setNfcScanError(null);
    try {
      const ndef = new NDEFReader();
      await ndef.scan();
      ndef.onreading = ({ serialNumber }) => {
        if (serialNumber) {
          form.setValue('nfcTagId', serialNumber, { shouldValidate: true, shouldDirty: true });
        }
        setIsNfcScanning(false);
      };
      ndef.onreadingerror = () => {
        setNfcScanError('Kan NFC-tag niet lezen.');
        setIsNfcScanning(false);
      };
    } catch (error) {
      setNfcScanError('Kon NFC-scanner niet starten.');
      setIsNfcScanning(false);
    }
  };

  const onSubmit = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try {
      const displayName = `${data.firstName} ${data.lastName}`.trim();

      const userData = {
        firstName: data.firstName,
        lastName: data.lastName,
        displayName,
        role: data.role,
        permissions: data.permissions,
        status: data.status,
        wijk: data.wijk === 'geen_wijk' ? null : data.wijk,
        veegroute: data.veegroute === 'geen_veegroute' ? null : data.veegroute,
        prullenbakkenroute: data.prullenbakkenroute === 'geen_prullenbakkenroute' ? null : data.prullenbakkenroute,
        nfcTagId: data.nfcTagId || null,
      };

      if (user) { // Edit existing user
        const userRef = doc(firestore, 'users', user.id);
        await updateDocumentNonBlocking(userRef, userData);
        toast({ title: 'Gebruiker bijgewerkt', description: `De gegevens voor ${user.email} zijn bijgewerkt.` });
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
                ...userData,
                sidebarCollapsed: true,
                status: 'Niet uitgenodigd',
            };

            await setDocumentNonBlocking(doc(firestore, 'users', newUser.uid), userProfileData, {});

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
            
            <FormField
              control={form.control}
              name="nfcTagId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NFC Tag ID</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input placeholder="Scan of voer ID in" {...field} value={field.value || ''} />
                    </FormControl>
                    <Button type="button" variant="outline" onClick={handleNfcScan} disabled={isNfcScanning}>
                      {isNfcScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Nfc className="h-4 w-4" />}
                      <span className="ml-2 hidden sm:inline">Scan</span>
                    </Button>
                  </div>
                  {isNfcScanning && <p className="text-sm text-muted-foreground">Wachten op NFC-tag...</p>}
                  {nfcScanError && <FormMessage>{nfcScanError}</FormMessage>}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="wijk" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Wijk</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'geen_wijk'}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Koppel aan wijk" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="geen_wijk">-- Geen wijk --</SelectItem>
                                {wijken.map((w: Wijk) => (<SelectItem key={w.id} value={w.naam}>{w.naam}</SelectItem>))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="veegroute" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Veegroute</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'geen_veegroute'}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Koppel aan veegroute" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="geen_veegroute">-- Geen veegroute --</SelectItem>
                                {veegroutes.map((w: Wijk) => (<SelectItem key={w.id} value={w.naam}>{w.naam}</SelectItem>))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="prullenbakkenroute" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Prullenbakkenroute</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'geen_prullenbakkenroute'}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Koppel aan route" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="geen_prullenbakkenroute">-- Geen prullenbakkenroute --</SelectItem>
                                {prullenbakkenroutes.map((w: Wijk) => (<SelectItem key={w.id} value={w.naam}>{w.naam}</SelectItem>))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
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
                {role === 'Super admin' && (
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Let op!</AlertTitle>
                        <AlertDescription>
                            Super admins hebben automatisch volledige toegang tot alle modules en rechten. De onderstaande instellingen zijn informatief en niet bewerkbaar.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="space-y-4 mt-4">
                  <FormLabel>Rechten</FormLabel>
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
                      {module.tabs && (
                          <>
                              <h5 className="font-semibold text-sm mt-4 mb-2">Tab Rechten</h5>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  {module.tabs.map((tab) => (
                                      <FormField
                                          key={tab.id}
                                          control={form.control}
                                          name={`permissions.${module.module}.tabs.${tab.id}`}
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
                                                      {tab.label}
                                                  </FormLabel>
                                              </FormItem>
                                          )}
                                      />
                                  ))}
                              </div>
                          </>
                      )}
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
  const { user: currentUser } = useUser();
  const { profile: currentAdminProfile, isLoading: isAdminLoading } = useProfile();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserProfile | null>(null);
  const { toast } = useToast();

  const isSuperUser = currentAdminProfile?.role === 'Super admin';
  const canManageUsers = isSuperUser || !!currentAdminProfile?.permissions?.users?.view;

  const usersCollection = useMemoFirebase(() => {
    if (!firestore || !canManageUsers || !currentUser) return null;
    return collection(firestore, 'users');
  }, [firestore, canManageUsers, currentUser]);

  const projectsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useCollection<UserProfile>(usersCollection);
  const { data: projects } = useCollection<Project>(projectsCollection);

  const allWijken = React.useMemo(() => {
    if (!projects) return [];
    const wijkMap = new Map<string, Wijk>();
    projects.forEach(p => {
        (p.wijken || []).forEach(w => {
            if (!wijkMap.has(w.naam)) {
                wijkMap.set(w.naam, w);
            }
        });
    });
    return Array.from(wijkMap.values()).sort((a,b) => a.naam.localeCompare(b.naam));
  }, [projects]);
  
  const allVeegroutes = React.useMemo(() => {
    if (!projects) return [];
    const routeMap = new Map<string, Wijk>();
    projects.forEach(p => {
        (p.veegroutes || []).forEach(w => {
            if (!routeMap.has(w.naam)) {
                routeMap.set(w.naam, w);
            }
        });
    });
    return Array.from(routeMap.values()).sort((a,b) => a.naam.localeCompare(b.naam));
  }, [projects]);

  const allPrullenbakkenroutes = React.useMemo(() => {
    if (!projects) return [];
    const routeMap = new Map<string, Wijk>();
    projects.forEach(p => {
        (p.prullenbakkenroutes || []).forEach(w => {
            if (!routeMap.has(w.naam)) {
                routeMap.set(w.naam, w);
            }
        });
    });
    return Array.from(routeMap.values()).sort((a,b) => a.naam.localeCompare(b.naam));
  }, [projects]);


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
        await updateDocumentNonBlocking(userRef, { status: 'Uitgenodigd' });

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
                <div className="grid grid-cols-[1fr_1fr_1fr_1.5fr_1fr] px-4 py-2 font-semibold bg-muted text-muted-foreground">
                    <span>Naam</span>
                    <span>E-mail</span>
                    <span>Rol</span>
                    <span>Wijken / Routes</span>
                    <span>Status</span>
                </div>
                {isLoadingUsers ? (
                     <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : usersError ? (
                    <div className="p-4 text-destructive-foreground bg-destructive/80 text-center">{usersError.message}</div>
                ) : users && users.length > 0 ? (
                    users.map(user => (
                        <div key={user.id} onClick={() => canEdit && handleEdit(user)} className="grid grid-cols-[1fr_1fr_1fr_1.5fr_1fr] items-center px-4 py-3 border-t hover:bg-muted/50 cursor-pointer">
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
                            <div className="truncate text-xs space-y-0.5">
                                {user.wijk && <div><span className='font-semibold'>W:</span> {user.wijk}</div>}
                                {user.veegroute && <div><span className='font-semibold'>V:</span> {user.veegroute}</div>}
                                {user.prullenbakkenroute && <div><span className='font-semibold'>P:</span> {user.prullenbakkenroute}</div>}
                                {!user.wijk && !user.veegroute && !user.prullenbakkenroute && '-'}
                            </div>
                            <div>
                                {(user.status === 'Niet uitgenodigd' || user.status === 'Uitgenodigd') && user.role !== 'Super admin' && canEdit ? (
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSendInvitation(user);
                                        }}
                                    >
                                        {user.status === 'Niet uitgenodigd' ? 'Verstuur uitnodiging' : 'Opnieuw versturen'}
                                    </Button>
                                ) : user.role !== 'Super admin' ? (
                                    <Badge
                                        variant={
                                            user.status === 'Actief' ? 'outline'
                                            : user.status === 'Inactief' ? 'secondary'
                                            : 'destructive'
                                        }
                                        className={
                                            user.status === 'Actief' ? 'text-green-600 border-green-600 w-fit'
                                            : user.status === 'Inactief' ? 'w-fit'
                                            : 'w-fit'
                                        }
                                    >
                                        {user.status || 'N.v.t.'}
                                    </Badge>
                                ) : null}
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
        wijken={allWijken}
        veegroutes={allVeegroutes}
        prullenbakkenroutes={allPrullenbakkenroutes}
      />
    </>
  );
}