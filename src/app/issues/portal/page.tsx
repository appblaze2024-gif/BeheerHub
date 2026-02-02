'use client';

import * as React from 'react';
import { useCollection, useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Melding } from '@/lib/types';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function MeldingenportaalPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');
  const { setIsHeaderVisible } = useNavigationUI();

  React.useEffect(() => {
    setIsHeaderVisible(false);
    return () => {
      setIsHeaderVisible(true);
    };
  }, [setIsHeaderVisible]);

  const meldingenCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'meldingen');
  }, [firestore]);

  const { data: allMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenCollection);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const newMeldingen = React.useMemo(() => {
    if (!allMeldingen) return [];
    return allMeldingen.filter(m => m.status === 'Nieuw');
  }, [allMeldingen]);

  const filteredMeldingen = React.useMemo(() => {
    if (!newMeldingen) return [];
    if (!debouncedSearchTerm) return newMeldingen;

    const lowercasedFilter = debouncedSearchTerm.toLowerCase();
    return newMeldingen.filter(melding =>
      Object.values(melding).some(value =>
        String(value).toLowerCase().includes(lowercasedFilter)
      )
    );
  }, [newMeldingen, debouncedSearchTerm]);

  const handleStatusChange = async (melding: Melding, newStatus: string) => {
    if (!firestore) return;
    const meldingRef = doc(firestore, 'meldingen', melding.id);
    try {
        await updateDocumentNonBlocking(meldingRef, { status: newStatus });
        toast({
            title: "Status bijgewerkt",
            description: `Melding ${melding.intakenummer} is bijgewerkt naar "${newStatus}".`,
        });
    } catch(error) {
        console.error("Error updating status:", error);
        toast({
            variant: "destructive",
            title: "Fout",
            description: "Kon de status van de melding niet bijwerken.",
        });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold">Meldingenportaal</h1>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Zoek nieuwe meldingen..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Button variant="outline">
                <ListFilter className="mr-2 h-4 w-4" />
                Filters
            </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="border rounded-lg">
        <Table>
            <TableHeader className="sticky top-0 bg-slate-50 z-10 dark:bg-slate-800">
            <TableRow>
                <TableHead>Intakenr.</TableHead>
                <TableHead>Adres</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Melder</TableHead>
                <TableHead className="text-right">Acties</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {isLoadingMeldingen ? (
                <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                    Nieuwe meldingen laden...
                </TableCell>
                </TableRow>
            ) : filteredMeldingen.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                        Geen nieuwe meldingen gevonden.
                    </TableCell>
                </TableRow>
            ) : (
                filteredMeldingen.map((melding) => (
                    <TableRow key={melding.id} className="cursor-pointer" >
                        <TableCell className="font-medium" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.intakenummer || '-'}</TableCell>
                        <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{[melding.straatnaam, melding.plaats].filter(Boolean).join(', ') || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.extra_informatie || '-'}</TableCell>
                        <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.datum ? format(new Date(melding.datum), 'dd-MM-yyyy') : '-'}</TableCell>
                        <TableCell onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.melder || '-'}</TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <span className="sr-only">Acties</span>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleStatusChange(melding, 'In behandeling')}>
                                        Accepteren en intern doorzetten
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusChange(melding, 'Extern doorgezet')}>
                                        Extern doorzetten
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusChange(melding, 'Niet in beheer')}>
                                        Niet voor onze afdeling
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                  ))
            )}
            </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}
