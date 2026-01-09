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
import { PageHeader } from '@/components/page-header';
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


export default function EmployeesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedMedewerker, setSelectedMedewerker] = React.useState<Medewerker | null>(null);
  const [selectedRows, setSelectedRows] = React.useState<string[]>([]);

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
      <PageHeader title="Medewerkers">
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" /> Medewerker toevoegen
          </Button>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek een medewerker"
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Bulkacties <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem disabled={selectedRows.length === 0}>
                Verwijder geselecteerde
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>
      <div className="flex-1 overflow-auto px-6 pb-6">
        <Card className="h-full">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <div className="grid grid-cols-[40px_3fr_3fr_2fr_2fr_2fr_50px] px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Checkbox 
                    onCheckedChange={handleSelectAll}
                    checked={isAllSelected}
                    aria-label="Selecteer alle rijen"
                  />
                  <span>Naam</span>
                  <span>E-mail</span>
                  <span>Telefoon</span>
                  <span>Mobiel</span>
                  <span>Status</span>
                  <span />
                </div>
                {isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Medewerkers laden...
                  </div>
                ) : filteredMedewerkers.length > 0 ? (
                  filteredMedewerkers.map((medewerker) => (
                    <div
                      key={medewerker.id}
                      onClick={() => handleRowClick(medewerker.id)}
                      className="grid grid-cols-[40px_3fr_3fr_2fr_2fr_2fr_50px] items-center px-4 py-3 text-sm cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        onCheckedChange={(checked) => {
                            handleSelectRow(medewerker.id, !!checked)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        checked={selectedRows.includes(medewerker.id)}
                        aria-label={`Selecteer ${medewerker.voornaam} ${medewerker.achternaam}`}
                      />
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={medewerker.avatarUrl}
                            alt={`${medewerker.voornaam} ${medewerker.achternaam}`}
                          />
                          <AvatarFallback>
                            {getInitials(medewerker.voornaam, medewerker.achternaam)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate">{`${medewerker.voornaam || ''} ${medewerker.tussenvoegsel || ''} ${medewerker.achternaam || ''}`.trim()}</span>
                      </div>
                      <span className="truncate">{medewerker.email || '-'}</span>
                      <span className="truncate">{medewerker.telefoonnummer || '-'}</span>
                      <span className="truncate">{medewerker.mobiel || '-'}</span>
                      <Badge
                        variant={medewerker.status === 'Actief' ? 'outline' : 'secondary'}
                        className={medewerker.status === 'Actief' ? 'text-green-600 border-green-600 w-14 justify-center' : 'px-2'}
                      >
                        {medewerker.status}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => handleEdit(e, medewerker)}>
                            Bewerken
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                               <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Verwijderen</DropdownMenuItem>
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
                                <AlertDialogAction onClick={(e) => handleDelete(e, medewerker.id)}>
                                    Doorgaan
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    Geen medewerkers gevonden.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <MedewerkerDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        medewerker={selectedMedewerker}
      />
    </div>
  );
}
