'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, collection } from 'firebase/firestore';
import { Loader2, Plus, MoreHorizontal, User as UserIcon, Nfc, Mail, MapPin, ShieldCheck, ChevronRight, AlertCircle, Info, Search } from 'lucide-react';
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
import type { Project, Wijk } from '@/lib/types';
import { permissionConfig, getDefaultPermissions } from '@/lib/permissions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


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
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = ({ serialNumber }: any) => {
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
        const userRef = doc(firestore!, 'users', user.id);
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

            await setDocumentNonBlocking(doc(firestore!, 'users', newUser.uid), userProfileData, {});

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
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-3xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white shrink-0">
          <DialogTitle className="text-xl font-black uppercase tracking-tight">
            {user ? 'Gebruiker bewerken' : 'Nieuwe gebruiker'}
          </DialogTitle>
          <DialogDescription className="text-slate-400 font-bold">Beheer hier de accountgegevens en module-rechten.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Voornaam*</FormLabel>
                    <FormControl><Input placeholder="Jan" {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                    <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Achternaam*</FormLabel>
                    <FormControl><Input placeholder="Janssen" {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                    <FormMessage />
                    </FormItem>
                )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mailadres*</FormLabel>
                        <FormControl>
                        <Input type="email" placeholder="gebruiker@example.com" {...field} disabled={!!user} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField control={form.control} name="role" render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rol*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50"><SelectValue placeholder="Selecteer een rol" /></SelectTrigger>
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
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">NFC Tag ID (Login Badge)</FormLabel>
                    <div className="flex items-center gap-2">
                        <FormControl>
                        <Input placeholder="Scan of voer ID in" {...field} value={field.value || ''} className="h-11 font-mono font-bold rounded-xl border-slate-100 bg-slate-50" />
                        </FormControl>
                        <Button type="button" variant="outline" onClick={handleNfcScan} disabled={isNfcScanning} className="h-11 rounded-xl px-4 border-slate-200">
                        {isNfcScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Nfc className="h-4 w-4" />}
                        <span className="ml-2 hidden sm:inline">Scan</span>
                        </Button>
                    </div>
                    {isNfcScanning && <p className="text-[10px] font-bold text-primary uppercase animate-pulse">Wachten op NFC-tag...</p>}
                    {nfcScanError && <FormMessage>{nfcScanError}</FormMessage>}
                    <FormMessage />
                    </FormItem>
                )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="wijk" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Wijk</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'geen_wijk'}>
                                <FormControl><SelectTrigger className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50"><SelectValue placeholder="Koppel aan wijk" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="geen_wijk">-- Geen wijk --</SelectItem>
                                    {wijken.filter(w => !!w.naam).map((w: Wijk) => (<SelectItem key={w.id} value={w.naam}>{w.naam}</SelectItem>))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="veegroute" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Veegroute</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'geen_veegroute'}>
                                <FormControl><SelectTrigger className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50"><SelectValue placeholder="Koppel aan veegroute" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="geen_veegroute">-- Geen veegroute --</SelectItem>
                                    {veegroutes.filter(w => !!w.naam).map((w: Wijk) => (<SelectItem key={w.id} value={w.naam}>{w.naam}</SelectItem>))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="prullenbakkenroute" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prullenbakkenroute</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'geen_prullenbakkenroute'}>
                                <FormControl><SelectTrigger className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50"><SelectValue placeholder="Koppel aan route" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="geen_prullenbakkenroute">-- Geen prullenbakkenroute --</SelectItem>
                                    {prullenbakkenroutes.filter(w => !!w.naam).map((w: Wijk) => (<SelectItem key={w.id} value={w.naam}>{w.naam}</SelectItem>))}
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
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50">
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

                <div className="space-y-4">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Module Rechten</FormLabel>
                    {role === 'Super admin' && (
                        <Alert className="bg-primary/5 border-primary/20 rounded-2xl">
                            <Info className="h-4 w-4 text-primary" />
                            <AlertTitle className="text-xs font-black uppercase">Volledige toegang</AlertTitle>
                            <AlertDescription className="text-[10px] font-bold text-slate-500">
                                Super admins hebben automatisch volledige toegang tot alle modules.
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="space-y-4">
                    {allPermissions.map((module) => (
                        <div key={module.module} className="bg-slate-50/50 p-4 rounded-2xl border-2 border-slate-100 space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            <h4 className="font-black text-[11px] uppercase tracking-tight">{module.label}</h4>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {module.actions.map((permission) => (
                            <FormField
                                key={permission.id}
                                control={form.control}
                                name={`permissions.${module.module}.${permission.id}`}
                                render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-1">
                                    <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        disabled={isSubmitting || isSuperAdminEditing}
                                        className="rounded-md"
                                    />
                                    </FormControl>
                                    <FormLabel className="text-[11px] font-bold text-slate-600 cursor-pointer">
                                    {permission.label}
                                    </FormLabel>
                                </FormItem>
                                )}
                            />
                            ))}
                        </div>
                        {module.tabs && (
                            <div className="pt-2 border-t border-slate-100">
                                <h5 className="font-black text-[9px] uppercase tracking-widest text-slate-400 mb-3">Tabs & Secties</h5>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {module.tabs.map((tab) => (
                                        <FormField
                                            key={tab.id}
                                            control={form.control}
                                            name={`permissions.${module.module}.tabs.${tab.id}`}
                                            render={({ field }) => (
                                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-1">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value}
                                                            onCheckedChange={field.onChange}
                                                            disabled={isSubmitting || isSuperAdminEditing}
                                                            className="rounded-md"
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="text-[11px] font-medium text-slate-500 cursor-pointer italic">
                                                        {tab.label}
                                                    </FormLabel>
                                                </FormItem>
                                            )}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        </div>
                    ))}
                    </div>
                </div>
            </div>

            <DialogFooter className="p-6 bg-slate-50 border-t shrink-0">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="font-bold">Annuleren</Button>
              <Button type="submit" disabled={isSubmitting} className="font-black uppercase tracking-tight px-8 shadow-xl shadow-primary/20 h-11 rounded-xl">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {user ? 'Opslaan' : 'Gebruiker aanmaken'}
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
  const isMobile = useIsMobile();

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
        
        const userRef = doc(firestore!, 'users', user.id);
        await updateDocumentNonBlocking(userRef, { status: 'Uitgenodigd' });

        toast({ title: 'Uitnodiging verstuurd!', description: `Een e-mail is naar ${user.email} gestuurd om een wachtwoord in te stellen.` });
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
       <Card className="rounded-[2rem] border-none shadow-xl">
        <CardHeader className="p-8">
          <CardTitle className="text-xl font-black uppercase tracking-tight">Gebruikersbeheer</CardTitle>
          <CardDescription className="font-bold text-slate-400">Gebruikers laden...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center p-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </CardContent>
      </Card>
    )
  }
  
  if (!canManageUsers) {
      return (
           <Card className="rounded-[2rem] border-none shadow-xl bg-red-50">
                <CardHeader className="p-8">
                    <CardTitle className="text-xl font-black uppercase tracking-tight text-red-900">Geen Toegang</CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-0">
                    <p className="font-bold text-red-600">U heeft geen rechten om de gebruikers van dit systeem te beheren.</p>
                </CardContent>
           </Card>
      )
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-[2rem] border-none shadow-xl bg-white overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-8 border-b bg-slate-50/50">
          <div>
            <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-900">Gebruikersbeheer</CardTitle>
            <CardDescription className="font-bold text-slate-400">
              Voeg collega's toe en beheer hun toegang tot de BeheerHub modules.
            </CardDescription>
          </div>
          {canCreate && (
            <Button onClick={handleAddNew} className="w-full sm:w-auto h-11 font-black uppercase tracking-tight px-8 shadow-xl shadow-primary/20 rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> Gebruiker aanmaken
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
            {isLoadingUsers ? (
                <div className="flex flex-col items-center justify-center p-20 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Synchroniseren...</p>
                </div>
            ) : usersError ? (
                <div className="p-12 text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-red-600 uppercase tracking-tight">{usersError.message}</p>
                </div>
            ) : users && users.length > 0 ? (
                <div className="divide-y divide-slate-100">
                    {/* Desktop Table View */}
                    <div className="hidden lg:block">
                        <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1.5fr_1fr] px-8 py-4 font-black uppercase tracking-[0.15em] text-[10px] text-slate-400 bg-white sticky top-0 z-10">
                            <span>Naam</span>
                            <span>E-mail</span>
                            <span>Rol</span>
                            <span>Toegewezen Gebieden</span>
                            <span>Status / Actie</span>
                        </div>
                        {users.map(user => (
                            <div 
                                key={user.id} 
                                onClick={() => canEdit && handleEdit(user)} 
                                className="grid grid-cols-[1.5fr_1.5fr_1fr_1.5fr_1fr] items-center px-8 py-5 hover:bg-slate-50 transition-all cursor-pointer group"
                            >
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10 border-2 border-white shadow-md ring-1 ring-slate-100 transition-transform group-hover:scale-110">
                                        <AvatarFallback className="bg-slate-100 text-primary font-black text-xs uppercase">
                                            {getInitials(user.firstName, user.lastName)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="font-black uppercase tracking-tight text-slate-900 group-hover:text-primary transition-colors">{user.displayName || 'Geen naam'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                    <Mail className="h-3.5 w-3.5 opacity-30" />
                                    <span className="truncate">{user.email}</span>
                                </div>
                                <div>
                                    <Badge variant={user.role === 'Super admin' ? 'default' : 'secondary'} className={cn(
                                        "h-6 px-3 text-[9px] font-black uppercase tracking-widest",
                                        user.role === 'Super admin' ? "bg-slate-900" : "bg-slate-100 text-slate-500 border-none"
                                    )}>
                                        {user.role}
                                    </Badge>
                                </div>
                                <div className="flex flex-col gap-1 pr-4">
                                    {user.wijk && <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[8px] h-4 font-black uppercase border-primary/20 text-primary bg-primary/5">W</Badge><span className="text-[10px] font-bold text-slate-600 truncate">{user.wijk}</span></div>}
                                    {user.veegroute && <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[8px] h-4 font-black uppercase border-green-200 text-green-600 bg-green-50">V</Badge><span className="text-[10px] font-bold text-slate-600 truncate">{user.veegroute}</span></div>}
                                    {user.prullenbakkenroute && <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[8px] h-4 font-black uppercase border-blue-200 text-blue-600 bg-blue-50">P</Badge><span className="text-[10px] font-bold text-slate-600 truncate">{user.prullenbakkenroute}</span></div>}
                                    {!user.wijk && !user.veegroute && !user.prullenbakkenroute && <span className="text-[10px] font-bold text-slate-300 italic">Geen toewijzingen</span>}
                                </div>
                                <div className="flex justify-between items-center pr-4">
                                    {(user.status === 'Niet uitgenodigd' || user.status === 'Uitgenodigd') && user.role !== 'Super admin' && canEdit ? (
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            className="h-8 font-black uppercase text-[9px] tracking-widest rounded-lg border-primary/30 text-primary hover:bg-primary/5"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSendInvitation(user);
                                            }}
                                        >
                                            {user.status === 'Niet uitgenodigd' ? 'Uitnodigen' : 'Nieuwe link'}
                                        </Button>
                                    ) : (
                                        <Badge
                                            className={cn(
                                                "h-6 px-3 text-[9px] font-black uppercase tracking-widest border-none",
                                                user.status === 'Actief' ? 'bg-green-100 text-green-700'
                                                : user.status === 'Inactief' ? 'bg-slate-100 text-slate-500'
                                                : 'bg-orange-100 text-orange-700'
                                            )}
                                        >
                                            {user.status || 'N.v.t.'}
                                        </Badge>
                                    )}
                                    <ChevronRight className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Mobile Card View */}
                    <div className="lg:hidden p-4 space-y-4 bg-slate-50/30">
                        {users.map(user => (
                            <Card 
                                key={user.id} 
                                onClick={() => canEdit && handleEdit(user)} 
                                className="rounded-[2rem] border-none shadow-lg bg-white active:scale-[0.98] transition-transform overflow-hidden"
                            >
                                <div className="p-6 flex flex-col gap-5">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-14 w-14 border-4 border-white shadow-xl ring-1 ring-slate-100 shrink-0">
                                                <AvatarFallback className="bg-slate-100 text-primary font-black text-base uppercase">
                                                    {getInitials(user.firstName, user.lastName)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <p className="font-black uppercase tracking-tight text-slate-900 text-base truncate leading-tight mb-1">{user.displayName || 'Geen naam'}</p>
                                                <p className="text-xs font-bold text-slate-400 truncate flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 opacity-50" /> {user.email}</p>
                                            </div>
                                        </div>
                                        <Badge variant={user.role === 'Super admin' ? 'default' : 'secondary'} className="text-[10px] font-black uppercase tracking-widest px-3 h-6">
                                            {user.role}
                                        </Badge>
                                    </div>

                                    <div className="bg-slate-50/80 p-4 rounded-[1.5rem] space-y-3 border border-slate-100">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1 flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Toewijzingen</p>
                                        <div className="flex flex-wrap gap-2">
                                            {user.wijk && <Badge variant="outline" className="text-[11px] font-black bg-white border-primary/20 text-primary px-3 py-1">W: {user.wijk}</Badge>}
                                            {user.veegroute && <Badge variant="outline" className="text-[11px] font-black bg-white border-green-200 text-green-600 px-3 py-1">V: {user.veegroute}</Badge>}
                                            {user.prullenbakkenroute && <Badge variant="outline" className="text-[11px] font-black bg-white border-blue-200 text-blue-600 px-3 py-1">P: {user.prullenbakkenroute}</Badge>}
                                            {!user.wijk && !user.veegroute && !user.prullenbakkenroute && <span className="text-xs font-bold text-slate-300 italic py-1">Geen actieve gebieden</span>}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                        <div className="flex items-center gap-2.5">
                                            <div className={cn("h-3 w-3 rounded-full shadow-sm", user.status === 'Actief' ? "bg-green-500" : "bg-orange-400")} />
                                            <span className="text-xs font-black uppercase tracking-widest text-slate-500">{user.status || 'Onbekend'}</span>
                                        </div>
                                        {(user.status === 'Niet uitgenodigd' || user.status === 'Uitgenodigd') && user.role !== 'Super admin' && canEdit && (
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                className="h-10 font-black uppercase text-xs rounded-xl px-6 border-primary/30 text-primary bg-primary/5 shadow-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSendInvitation(user);
                                                }}
                                            >
                                                Stuur Link
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="p-20 text-center text-slate-300">
                    <UserIcon className="h-16 w-16 mx-auto mb-4 opacity-10" />
                    <p className="font-black uppercase tracking-widest text-xs">Geen gebruikers gevonden in de database.</p>
                </div>
            )}
        </CardContent>
      </Card>
      
      {canManageUsers && (
        <UserDialog 
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            user={selectedUser}
            onSuccess={() => {}}
            wijken={allWijken}
            veegroutes={allVeegroutes}
            prullenbakkenroutes={allPrullenbakkenroutes}
        />
      )}
    </div>
  );
}
