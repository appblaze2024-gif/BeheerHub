'use client';

import * as React from 'react';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Plus, Search, ListFilter } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

const openStatuses = [
  "Nieuw",
  "Intern doorgezet",
  "In behandeling",
  "Gepland op korte termijn",
  "Gepland op langere termijn",
];

export default function OpenIssuesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');

  const meldingenCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'meldingen');
  }, [firestore]);

  const { data: allMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenCollection);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const openMeldingen = React.useMemo(() => {
    if (!allMeldingen) return [];
    return allMeldingen.filter(m => openStatuses.includes(m.status));
  }, [allMeldingen]);

  const filteredMeldingen = React.useMemo(() => {
    if (!openMeldingen) return [];
    if (!debouncedSearchTerm) return openMeldingen;

    const lowercasedFilter = debouncedSearchTerm.toLowerCase();
    return openMeldingen.filter(melding => {
      return Object.values(melding).some(value =>
        String(value).toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [openMeldingen, debouncedSearchTerm]);
  
  const statusColorMap: { [key: string]: string } = {
    "Nieuw": "bg-red-500",
    "Intern doorgezet": "bg-yellow-500",
    "In behandeling": "bg-blue-500",
    "Gepland op korte termijn": "bg-purple-500",
    "Gepland op langere termijn": "bg-indigo-500",
  };

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Openstaande Meldingen</h1>
        <div className="flex items-center gap-2">
            <Link href="/issues/new">
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Nieuwe Melding
                </Button>
            </Link>
        </div>
      </header>

      <Card className="flex-1 flex flex-col">
        <CardHeader>
           <div className="flex items-center justify-between">
                <CardTitle>Overzicht</CardTitle>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Zoek meldingen..."
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
           </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto">
            <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                    <TableHead>Intakenr.</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead>Adres</TableHead>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {isLoadingMeldingen ? (
                    <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                        Meldingen laden...
                    </TableCell>
                    </TableRow>
                ) : filteredMeldingen.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                            Geen openstaande meldingen gevonden.
                        </TableCell>
                    </TableRow>
                ) : (
                    filteredMeldingen.map((melding) => (
                    <TableRow key={melding.id} onClick={() => router.push(`/issues?id=${melding.id}`)} className="cursor-pointer">
                        <TableCell className="font-medium">{melding.intakenummer}</TableCell>
                        <TableCell>{format(new Date(melding.datum), 'dd-MM-yyyy')}</TableCell>
                        <TableCell>{melding.hoofdcategorie} &gt; {melding.subcategorie}</TableCell>
                        <TableCell className="truncate">{melding.straatnaam}, {melding.plaats}</TableCell>
                        <TableCell className="max-w-xs truncate">{melding.extra_informatie}</TableCell>
                        <TableCell>
                        <Badge
                            className="text-white"
                            style={{ backgroundColor: statusColorMap[melding.status] || 'bg-gray-500' }}
                        >
                            {melding.status}
                        </Badge>
                        </TableCell>
                    </TableRow>
                    ))
                )}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
