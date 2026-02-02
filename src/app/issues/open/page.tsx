
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

      <div className="flex-1 overflow-auto p-4">
        <Table className="border-collapse border border-slate-200 w-full">
            <TableHeader className="sticky top-0 bg-slate-50 z-10 dark:bg-slate-800">
            <TableRow>
                <TableHead className="py-2 px-3 border border-slate-200">Intakenr.</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Extern meldingsnr.</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Datum</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Tijd</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Hoofdcategorie</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Subcategorie</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Adres</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Wijk</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Melder</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Aangenomen door</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Omschrijving</TableHead>
                <TableHead className="py-2 px-3 border border-slate-200">Status</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {isLoadingMeldingen ? (
                <TableRow>
                <TableCell colSpan={12} className="h-24 text-center border border-slate-200">
                    Meldingen laden...
                </TableCell>
                </TableRow>
            ) : filteredMeldingen.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center border border-slate-200">
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
                    <TableRow key={melding.id} onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer h-auto hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell className="font-medium py-1 px-3 border border-slate-200">{melding.intakenummer || '-'}</TableCell>
                        <TableCell className="py-1 px-3 border border-slate-200">{melding.extern_meldingsnummer || '-'}</TableCell>
                        <TableCell className="py-1 px-3 border border-slate-200">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yyyy') : '-'}</TableCell>
                        <TableCell className="py-1 px-3 border border-slate-200">{melding.tijdstip || '-'}</TableCell>
                        <TableCell className="py-1 px-3 border border-slate-200">{melding.hoofdcategorie || '-'}</TableCell>
                        <TableCell className="py-1 px-3 border border-slate-200">{melding.subcategorie || '-'}</TableCell>
                        <TableCell className="truncate py-1 px-3 border border-slate-200">{[melding.straatnaam, melding.plaats].filter(Boolean).join(', ') || '-'}</TableCell>
                        <TableCell className="truncate py-1 px-3 border border-slate-200">{melding.wijk || '-'}</TableCell>
                        <TableCell className='truncate py-1 px-3 border border-slate-200'>{melding.melder || '-'}</TableCell>
                        <TableCell className='truncate py-1 px-3 border border-slate-200'>{melding.aangenomen_door || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate py-1 px-3 border border-slate-200">{melding.extra_informatie || '-'}</TableCell>
                        <TableCell className="py-1 px-3 border border-slate-200">
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
