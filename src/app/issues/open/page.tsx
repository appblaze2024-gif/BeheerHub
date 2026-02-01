'use client';

import * as React from 'react';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Melding } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format, isToday } from 'date-fns';
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
    "Open": "bg-cyan-500",
    "Intern doorgezet": "bg-yellow-500",
    "In behandeling": "bg-blue-500",
    "Gepland op korte termijn": "bg-purple-500",
    "Gepland op langere termijn": "bg-indigo-500",
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold">Openstaande Meldingen</h1>
        </div>
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
      </header>

      <div className="flex-1 overflow-auto">
        <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
                <TableHead className="py-2 px-4">Intakenr.</TableHead>
                <TableHead className="py-2 px-4">Datum</TableHead>
                <TableHead className="py-2 px-4">Tijd</TableHead>
                <TableHead className="py-2 px-4">Melder</TableHead>
                <TableHead className="py-2 px-4">Adres</TableHead>
                <TableHead className="py-2 px-4">Omschrijving</TableHead>
                <TableHead className="py-2 px-4">Status</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {isLoadingMeldingen ? (
                <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                    Meldingen laden...
                </TableCell>
                </TableRow>
            ) : filteredMeldingen.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                        Geen openstaande meldingen gevonden.
                    </TableCell>
                </TableRow>
            ) : (
                filteredMeldingen.map((melding) => {
                  let displayStatus = melding.status;
                  if (melding.status === 'Nieuw') {
                    try {
                      if (!isToday(new Date(melding.datum))) {
                        displayStatus = 'Open';
                      }
                    } catch (e) {
                       // if date is invalid, keep status as is
                    }
                  }
                  
                  return (
                    <TableRow key={melding.id} onClick={() => router.push(`/issues?id=${melding.id}`)} className="cursor-pointer h-auto">
                        <TableCell className="font-medium py-2 px-4">{melding.intakenummer}</TableCell>
                        <TableCell className="py-2 px-4">{format(new Date(melding.datum), 'dd-MM-yyyy')}</TableCell>
                        <TableCell className="py-2 px-4">{melding.tijdstip}</TableCell>
                        <TableCell className='truncate py-2 px-4'>{melding.melder}</TableCell>
                        <TableCell className="truncate py-2 px-4">{melding.straatnaam}, {melding.plaats}</TableCell>
                        <TableCell className="max-w-xs truncate py-2 px-4">{melding.extra_informatie}</TableCell>
                        <TableCell className="py-2 px-4">
                        <Badge
                            className="text-white"
                            style={{ backgroundColor: statusColorMap[displayStatus] || 'bg-gray-500' }}
                        >
                            {displayStatus}
                        </Badge>
                        </TableCell>
                    </TableRow>
                  )
                })
            )}
            </TableBody>
        </Table>
      </div>
    </div>
  );
}
