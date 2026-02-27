'use client';

import * as React from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft, Info, Clock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Melding, UserProfile } from '@/lib/types';
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
import { LoadingScreen } from '@/components/loading-screen';

const closedStatuses = ["Afgerond", "Niet in beheer", "Geweigerd", "Dubbel gemeld"];

export default function ArchiveIssuesPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');

  // OPTIMIZED QUERY: Filter by status only to avoid composite index requirements
  const archiveQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'in', closedStatuses)
    );
  }, [firestore]);

  const { data: archivedMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(archiveQuery);

  // Fetch users to map email to display name for older records
  const usersQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'users');
  }, [firestore, user]);
  const { data: users } = useCollection<UserProfile>(usersQuery);

  const userMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    users?.forEach(u => {
      if (u.email) {
        map[u.email.toLowerCase()] = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
      }
    });
    return map;
  }, [users]);

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

  const formatDisplayName = (nameOrEmail?: string) => {
    if (!nameOrEmail) return '-';
    
    const normalized = nameOrEmail.toLowerCase();
    
    // Check if it's an email we can map to a full name using our userMap
    if (userMap[normalized]) {
      return userMap[normalized];
    }

    if (nameOrEmail.includes('@')) {
      // Try to format email like firstname.lastname@...
      const part = nameOrEmail.split('@')[0];
      if (part.includes('.')) {
        return part
          .split('.')
          .map(p => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ');
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    
    // If it already looks like a full name (has space), return it
    if (nameOrEmail.includes(' ')) return nameOrEmail;

    // Capitalize if it's a single word/username
    return nameOrEmail.charAt(0).toUpperCase() + nameOrEmail.slice(1);
  };

  const formatDuration = (minutes?: number) => {
    if (minutes === undefined || minutes === null) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}u ${mins}m`;
  };

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
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Extern nr.</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Adres</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Meld Datum</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Afgehandeld op</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Duur</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Door</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500">Opmerkingen</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMeldingen.map((melding) => (
                                <TableRow key={melding.id} onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer h-12 hover:bg-slate-50 transition-colors border-b border-slate-100">
                                    <TableCell className="font-black py-2 px-4 border-r border-slate-100">{melding.intakenummer || '-'}</TableCell>
                                    <TableCell className="py-2 px-4 border-r border-slate-100 text-[11px] font-bold text-slate-500">{melding.extern_meldingsnummer || '-'}</TableCell>
                                    <TableCell className="truncate py-2 px-4 border-r border-slate-100 max-w-[200px] text-xs font-bold text-slate-900">{[melding.straatnaam, melding.plaats].filter(Boolean).join(', ') || '-'}</TableCell>
                                    <TableCell className="py-2 px-4 border-r border-slate-100 text-[11px] font-bold text-slate-600">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yy') : '-'}</TableCell>
                                    <TableCell className="py-2 px-4 border-r border-slate-100">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-primary">{melding.afhandeling_datum ? format(new Date(melding.afhandeling_datum), 'dd-MM-yy') : '-'}</span>
                                            <span className="text-[9px] font-bold text-slate-400">{melding.afhandeling_tijdstip || '--:--'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-2 px-4 border-r border-slate-100">
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                                            <Clock className="h-3 w-3 text-slate-400" />
                                            {formatDuration(melding.gewerkteMinuten)}
                                        </div>
                                    </TableCell>
                                    <TableCell className='truncate py-2 px-4 border-r border-slate-100 text-xs font-black text-slate-900'>{formatDisplayName(melding.afgehandeld_door)}</TableCell>
                                    <TableCell className="py-2 px-4 max-w-xs">
                                        <div className="flex items-start gap-2">
                                            {melding.afhandeling_bijzonderheden ? (
                                                <>
                                                    <MessageSquare className="h-3 w-3 mt-0.5 text-blue-500 shrink-0" />
                                                    <p className="text-[11px] font-medium text-slate-500 italic truncate" title={melding.afhandeling_bijzonderheden}>
                                                        {melding.afhandeling_bijzonderheden}
                                                    </p>
                                                </>
                                            ) : (
                                                <span className="text-[10px] text-slate-300 font-medium">Geen bijzonderheden</span>
                                            )}
                                        </div>
                                    </TableCell>
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
