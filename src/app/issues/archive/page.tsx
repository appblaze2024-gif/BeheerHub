
'use client';

import * as React from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft, Info } from 'lucide-react';
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
import { LoadingScreen } from '@/components/loading-screen';

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

  // OPTIMIZED QUERY: Filter by status only to avoid composite index requirements
  const archiveQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', '==', closedStatus)
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
    
    let result = [...archivedMeldingen];

    if (debouncedSearchTerm) {
        const lowercasedFilter = debouncedSearchTerm.toLowerCase();
        result = result.filter(melding => {
          return Object.values(melding).some(value =>
            String(value).toLowerCase().includes(lowercasedFilter)
          );
        });
    }

    // Sort in memory to handle missing fields and avoid index errors
    result.sort((a, b) => {
        const dateA = a.afhandeling_datum ? new Date(a.afhandeling_datum).getTime() : 0;
        const dateB = b.afhandeling_datum ? new Date(b.afhandeling_datum).getTime() : 0;
        return dateB - dateA;
    });

    return result;
  }, [archivedMeldingen, debouncedSearchTerm]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b shrink-0 gap-4 bg-slate-50/50">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="shrink-0 rounded-full h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-black uppercase tracking-tight">Meldingen Archief</h1>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Zoek in archief..."
                    className="pl-9 h-9 border-slate-200"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Button variant="outline" size="sm" className="h-9">
                <ListFilter className="mr-2 h-4 w-4" />
                Filter
            </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {isLoadingMeldingen ? (
            <LoadingScreen message="Archief laden..." />
        ) : filteredMeldingen.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <Info className="h-12 w-12 text-slate-300 mb-4 opacity-20" />
                <p className="font-black uppercase tracking-tight text-slate-900">Geen afgeronde meldingen</p>
                <p className="text-sm text-slate-500 mt-1">Het archief is momenteel leeg.</p>
            </div>
        ) : (
            <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
                <div className="overflow-x-auto">
                    <Table className="border-collapse w-full">
                        <TableHeader className="sticky top-0 bg-slate-100 z-10">
                        <TableRow className="hover:bg-transparent border-b-2 border-slate-200">
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Intakenr.</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Adres</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 hidden md:table-cell">Omschrijving</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Meld Datum</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Afgehandeld</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 hidden lg:table-cell">Door</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMeldingen.map((melding) => (
                                <TableRow key={melding.id} onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer h-12 hover:bg-slate-50 transition-colors border-b border-slate-100">
                                    <TableCell className="font-black py-2 px-4 border-r border-slate-100">{melding.intakenummer || '-'}</TableCell>
                                    <TableCell className="truncate py-2 px-4 border-r border-slate-100 max-w-[200px] text-xs font-bold text-slate-900">{[melding.straatnaam, melding.plaats].filter(Boolean).join(', ') || '-'}</TableCell>
                                    <TableCell className="max-w-xs truncate py-2 px-4 border-r border-slate-100 hidden md:table-cell text-xs italic text-slate-500">{melding.extra_informatie || '-'}</TableCell>
                                    <TableCell className="py-2 px-4 border-r border-slate-100 text-[11px] font-bold text-slate-600">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yy') : '-'}</TableCell>
                                    <TableCell className="py-2 px-4 border-r border-slate-100 text-[11px] font-black text-primary">{melding.afhandeling_datum ? format(new Date(melding.afhandeling_datum), 'dd-MM-yy') : '-'}</TableCell>
                                    <TableCell className='truncate py-2 px-4 border-r border-slate-100 hidden lg:table-cell text-xs font-bold'>{melding.afgehandeld_door || '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
