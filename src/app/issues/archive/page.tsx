'use client';

import * as React from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Melding } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
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

const closedStatus = "Afgerond";

export default function ArchiveIssuesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');
  const { setIsHeaderVisible } = useNavigationUI();

  React.useEffect(() => {
    setIsHeaderVisible(false);
    return () => {
      setIsHeaderVisible(true);
    };
  }, [setIsHeaderVisible]);

  // OPTIMIZED QUERY: Only fetch meldingen with 'Afgerond' status
  const archiveQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', '==', closedStatus),
      orderBy('afhandeling_datum', 'desc')
    );
  }, [firestore]);

  const { data: archivedMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(archiveQuery);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const filteredMeldingen = React.useMemo(() => {
    if (!archivedMeldingen) return [];
    if (!debouncedSearchTerm) return archivedMeldingen;

    const lowercasedFilter = debouncedSearchTerm.toLowerCase();
    return archivedMeldingen.filter(melding => {
      return Object.values(melding).some(value =>
        String(value).toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [archivedMeldingen, debouncedSearchTerm]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold">Meldingen Archief</h1>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Zoek in archief..."
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
        <Table className="border-collapse w-full">
            <TableHeader className="sticky top-0 bg-slate-50 z-10 dark:bg-slate-800">
            <TableRow>
                <TableHead className="py-2 px-3 border-b">Intakenr.</TableHead>
                <TableHead className="py-2 px-3 border-b">Adres</TableHead>
                <TableHead className="py-2 px-3 border-b">Omschrijving</TableHead>
                <TableHead className="py-2 px-3 border-b">Melding Datum</TableHead>
                <TableHead className="py-2 px-3 border-b">Afgehandeld Op</TableHead>
                <TableHead className="py-2 px-3 border-b">Afgehandeld Door</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {isLoadingMeldingen ? (
                <TableRow>
                <TableCell colSpan={6} className="h-24 text-center border-t">
                    Archief laden...
                </TableCell>
                </TableRow>
            ) : filteredMeldingen.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center border-t">
                        Geen afgeronde meldingen gevonden.
                    </TableCell>
                </TableRow>
            ) : (
                filteredMeldingen.map((melding) => {
                  return (
                    <TableRow key={melding.id} onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer h-auto hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell className="font-medium py-2 px-3 border-t">{melding.intakenummer || '-'}</TableCell>
                        <TableCell className="truncate py-2 px-3 border-t">{[melding.straatnaam, melding.plaats].filter(Boolean).join(', ') || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate py-2 px-3 border-t">{melding.extra_informatie || '-'}</TableCell>
                        <TableCell className="py-2 px-3 border-t">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yyyy') : '-'}</TableCell>
                        <TableCell className="py-2 px-3 border-t">{melding.afhandeling_datum ? format(new Date(melding.afhandeling_datum), 'dd-MM-yyyy') : '-'}</TableCell>
                        <TableCell className='truncate py-2 px-3 border-t'>{melding.afgehandeld_door || '-'}</TableCell>
                    </TableRow>
                  )
                })
            )}
            </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}
