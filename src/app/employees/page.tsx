'use client';

import * as React from 'react';
import {
  MoreHorizontal,
  Plus,
  Search,
  ChevronDown,
  Filter,
} from 'lucide-react';
import { collection, doc, deleteDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useCollection,
  useFirestore,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { MedewerkerDialog } from '@/components/medewerker-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Medewerker } from '@/lib/types';
import { useProfile } from '@/firebase/profile-provider';
import { LoadingScreen } from '@/components/loading-screen';


export default function EmployeesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedMedewerker, setSelectedMedewerker] = React.useState<Medewerker | null>(null);
  const [selectedRows, setSelectedRows] = React.useState<string[]>([]);
  const { profile, isLoading: isProfileLoading } = useProfile();
  
  const isSuperUser = profile?.role === 'Super admin';
  const canCreate = isSuperUser || !!profile?.permissions?.employees?.create;
  const canEdit = isSuperUser || !!profile?.permissions?.employees?.edit;
  const canDelete = isSuperUser || !!profile?.permissions?.employees?.delete;

  const medewerkersCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'medewerkers');
  }, [firestore]);

  const { data: medewerkers, isLoading } = useCollection<Medewerker>(
    medewerkersCollection
  );

  const filteredMedewerkers = React.useMemo(() => {
    if (!medewerkers) return [];
    if (!searchTerm) return medewerkers;

    return medewerkers.filter(
      (m) =>
        m.voornaam?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.achternaam?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [medewerkers, searchTerm]);
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(filteredMedewerkers.map(m => m.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRows([...selectedRows, id]);
    } else {
      setSelectedRows(selectedRows.filter(rowId => rowId !== id));
    }
  };

  const handleRowClick = (medewerkerId: string) => {
    router.push(`/employees/${medewerkerId}`);
  };

  const handleAddNew = () => {
    setSelectedMedewerker(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (e: React.MouseEvent, medewerker: Medewerker) => {
    e.stopPropagation();
    setSelectedMedewerker(medewerker);
    setIsDialogOpen(true);
  };

  const handleDelete = (e: React.MouseEvent, medewerkerId: string) => {
    e.stopPropagation();
    if (!firestore) return;
    const medewerkerRef = doc(firestore, 'medewerkers', medewerkerId);
    deleteDocumentNonBlocking(medewerkerRef);
  };
  
  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  const isAllSelected = selectedRows.length > 0 && selectedRows.length === filteredMedewerkers.length;


  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="flex flex-col lg:flex-row items-center justify-between gap-4 p-4 md:p-6">
        <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1">
          <Button variant="outline" size="sm" className="shrink-0">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          {canCreate && (
            <Button onClick={handleAddNew} size="sm" className="shrink-0">
              <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Medewerker toevoegen</span><span className="sm:hidden">Nieuw</span>
            </Button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek een medewerker"
              className="pl-9 h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  Bulkacties <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem disabled={selectedRows.length === 0}>
                  Verwijder geselecteerde
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
      <div className="flex-1 px-4 md:px-6 pb-6 min-h-0">
        <Card className="h-full flex flex-col overflow-hidden">
          <CardContent className="p-0 flex-1 overflow-auto relative">
            {isLoading || isProfileLoading ? (
              <LoadingScreen message="Medewerkers laden..." />
            ) : (
              <div className="h-full">
                <div className="min-w-[800px] divide-y divide-gray-200 dark:divide-gray-800">
                  <div className="grid grid-cols-[40px_1fr_1fr_1fr_1fr_1fr_50px] px-4 py-3 text-left text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest sticky top-0 bg-white dark:bg-slate-900 z-10">
                    <Checkbox 
                      onCheckedChange={handleSelectAll}
                      checked={isAllSelected}
                      aria-label="Selecteer alle rijen"
                      disabled={!canDelete}
                    />
                    <span>Naam</span>
                    <span>E-mail</span>
                    <span>Telefoon</span>
                    <span className="hidden md:inline">Mobiel</span>
                    <span>Status</span>
                    <span />
                  </div>
                  {filteredMedewerkers.length > 0 ? (
                    filteredMedewerkers.map((medewerker) => (
                      <div
                        key={medewerker.id}
                        onClick={() => handleRowClick(medewerker.id)}
                        className="grid grid-cols-[40px_1fr_1fr_1fr_1fr_1fr_50px] items-center px-4 py-3 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <Checkbox
                          onCheckedChange={(checked) => {
                              handleSelectRow(medewerker.id, !!checked)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          checked={selectedRows.includes(medewerker.id)}
                          aria-label={`Selecteer ${medewerker.voornaam} ${medewerker.achternaam}`}
                          disabled={!canDelete}
                        />
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 ring-2 ring-white shadow-sm">
                            <AvatarImage
                              src={medewerker.avatarUrl}
                              alt={`${medewerker.voornaam} ${medewerker.achternaam}`}
                            />
                            <AvatarFallback className="text-[10px] font-black bg-primary text-white">
                              {getInitials(medewerker.voornaam, medewerker.achternaam)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-black text-slate-900 truncate">{`${medewerker.voornaam || ''} ${medewerker.tussenvoegsel || ''} ${medewerker.achternaam || ''}`.trim()}</span>
                        </div>
                        <span className="truncate text-slate-500 font-medium">{medewerker.email || '-'}</span>
                        <span className="truncate text-slate-500 font-medium">{medewerker.telefoonnummer || '-'}</span>
                        <span className="truncate text-slate-500 font-medium hidden md:inline">{medewerker.mobiel || '-'}</span>
                        <div className="flex">
                            <Badge
                            variant={medewerker.status === 'Actief' || medewerker.status === 'Inactief' ? 'outline' : 'secondary'}
                            className={cn(
                                "font-black uppercase text-[9px] tracking-tighter h-5 px-2",
                                medewerker.status === 'Actief' ? 'text-green-600 border-green-200 bg-green-50'
                                : medewerker.status === 'Inactief' ? 'text-red-600 border-red-200 bg-red-50'
                                : 'bg-slate-100 text-slate-500'
                            )}
                            >
                            {medewerker.status}
                            </Badge>
                        </div>
                        {(canEdit || canDelete) && (
                          <div className="flex justify-end">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                {canEdit && <DropdownMenuItem onClick={(e) => handleEdit(e, medewerker)}>Bewerken</DropdownMenuItem>}
                                {canDelete && <>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 font-bold">Verwijderen</DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Deze actie kan niet ongedaan worden gemaakt. Dit zal de medewerker permanent verwijderen.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                        <AlertDialogAction onClick={(e) => handleDelete(e, medewerker.id)} className="bg-red-600 hover:bg-red-700">
                                            Doorgaan
                                        </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                    </AlertDialog>
                                </>}
                                </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center text-muted-foreground bg-slate-50/50">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p className="font-bold uppercase text-xs tracking-widest">Geen medewerkers gevonden.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {canCreate && (
        <MedewerkerDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          medewerker={selectedMedewerker}
        />
      )}
    </div>
  );
}
