'use client';

import * as React from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft, Info, Clock, MessageSquare, MapPin, Calendar, User, Tag, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useProfile } from '@/firebase/profile-provider';

const closedStatuses = ["Afgerond", "Niet in beheer", "Geweigerd", "Dubbel gemeld"];

export default function ArchiveIssuesPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');
  const [sortConfig, setSortConfig] = React.useState<{ field: string; order: 'asc' | 'desc' }>({ 
    field: 'afhandeling_datum', 
    order: 'desc' 
  });

  const archiveQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'in', closedStatuses)
    );
  }, [firestore, user]);

  const { data: archivedMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(archiveQuery);

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

  React.useEffect(() => {
    if (profile?.archiveSortConfig) {
      setSortConfig(profile.archiveSortConfig);
    }
  }, [profile]);

  const handleSort = (field: string) => {
    let newOrder: 'asc' | 'desc' = 'asc';
    if (sortConfig.field === field && sortConfig.order === 'asc') {
      newOrder = 'desc';
    }
    const newConfig = { field, order: newOrder };
    setSortConfig(newConfig);
    
    if (firestore && user) {
      const userRef = doc(firestore, 'users', user.uid);
      updateDocumentNonBlocking(userRef, { archiveSortConfig: newConfig });
    }
  };

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

    result.sort((a, b) => {
        let valA: any = (a as any)[sortConfig.field];
        let valB: any = (b as any)[sortConfig.field];

        // Specific sorting logic for dates including time
        if (sortConfig.field === 'afhandeling_datum') {
            const timeA = (a as any).afhandeling_tijdstip || '00:00';
            const timeB = (b as any).afhandeling_tijdstip || '00:00';
            valA = valA ? new Date(`${valA}T${timeA}`).getTime() : 0;
            valB = valB ? new Date(`${valB}T${timeB}`).getTime() : 0;
        } else if (sortConfig.field === 'datum') {
            const timeA = (a as any).tijdstip || '00:00';
            const timeB = (b as any).tijdstip || '00:00';
            valA = valA ? new Date(`${valA}T${timeA}`).getTime() : 0;
            valB = valB ? new Date(`${valB}T${timeB}`).getTime() : 0;
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
        } else if (typeof valA === 'number') {
            valA = valA || 0;
            valB = valB || 0;
        } else {
            valA = valA || '';
            valB = valB || '';
        }

        if (valA < valB) return sortConfig.order === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.order === 'asc' ? 1 : -1;
        return 0;
    });

    return result;
  }, [archivedMeldingen, debouncedSearchTerm, sortConfig]);

  const formatDisplayName = (nameOrEmail?: string) => {
    if (!nameOrEmail) return '-';
    
    const normalized = nameOrEmail.toLowerCase();
    
    if (userMap[normalized]) {
      return userMap[normalized];
    }

    if (nameOrEmail.includes('@')) {
      const part = nameOrEmail.split('@')[0];
      if (part.includes('.')) {
        return part
          .split('.')
          .map(p => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ');
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    
    if (nameOrEmail.includes(' ')) return nameOrEmail;

    return nameOrEmail.charAt(0).toUpperCase() + nameOrEmail.slice(1);
  };

  const formatDuration = (minutes?: number) => {
    if (minutes === undefined || minutes === null) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}u ${mins}m`;
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortConfig.field !== field) return <ArrowUpDown className="h-3 w-3 opacity-20" />;
    return sortConfig.order === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6.1rem)] overflow-hidden bg-background">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b shrink-0 gap-4 bg-slate-50/50">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="shrink-0 rounded-full h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Meldingen Archief</h1>
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
                <Info className="h-12 w-12 text-slate-300 mb-4" />
                <p className="font-black uppercase tracking-tight text-slate-900">Geen afgeronde meldingen</p>
                <p className="text-sm text-slate-500 mt-1">Het archief is momenteel leeg.</p>
            </div>
        ) : (
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:hidden">
                    {filteredMeldingen.map((melding) => (
                        <Card 
                            key={melding.id} 
                            onClick={() => router.push(`/issues/new?id=${melding.id}`)}
                            className="overflow-hidden border-none shadow-lg active:scale-[0.98] transition-transform"
                        >
                            <CardContent className="p-0">
                                <div className="p-4 bg-slate-50 border-b flex justify-between items-start">
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">Intakenummer</p>
                                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{melding.intakenummer}</p>
                                    </div>
                                    <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-tighter h-5 px-2 bg-slate-200 text-slate-600 border-none">
                                        {melding.status}
                                    </Badge>
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                                            <MapPin className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-900 leading-snug">
                                                {[melding.straatnaam, melding.huisnummer].filter(Boolean).join(' ')}
                                            </p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                                {[melding.postcode, melding.plaats].filter(Boolean).join(' ')}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-50 p-2 rounded-lg shrink-0">
                                            <Tag className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-slate-700 truncate">{melding.subcategorie}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{melding.hoofdcategorie}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3 w-3 text-slate-300" />
                                                <span className="text-[10px] font-bold text-slate-500">
                                                    Afgehandeld: {melding.afhandeling_datum ? format(new Date(`${melding.afhandeling_datum}T${melding.afhandeling_tijdstip || '00:00'}`), 'dd MMM yyyy, HH:mm') : '-'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-3 w-3 text-slate-300" />
                                                <span className="text-[10px] font-bold text-slate-500">
                                                    Duur: {formatDuration(melding.gewerkteMinuten)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border-2 border-slate-100 bg-slate-50">
                                            <User className="h-3 w-3 text-primary" />
                                            <span className="text-[10px] font-black text-primary uppercase truncate max-w-[100px]">
                                                {formatDisplayName(melding.afgehandeld_door)}
                                            </span>
                                        </div>
                                    </div>
                                    {melding.afhandeling_bijzonderheden && (
                                        <div className="pt-2 border-t border-slate-100">
                                            <div className="flex items-start gap-2">
                                                <MessageSquare className="h-3 w-3 mt-0.5 text-blue-500 shrink-0" />
                                                <p className="text-[10px] font-medium text-slate-500 italic line-clamp-2">
                                                    {melding.afhandeling_bijzonderheden}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="hidden md:block border rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="overflow-x-auto">
                        <Table className="border-collapse w-full">
                            <TableHeader className="sticky top-0 bg-slate-100 z-10">
                            <TableRow className="hover:bg-transparent border-b-2 border-slate-200">
                                <TableHead onClick={() => handleSort('intakenummer')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Intakenr.
                                        <SortIcon field="intakenummer" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('extern_meldingsnummer')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Extern nr.
                                        <SortIcon field="extern_meldingsnummer" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('straatnaam')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Adres
                                        <SortIcon field="straatnaam" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('datum')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Meld Datum/Tijd
                                        <SortIcon field="datum" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('afhandeling_datum')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Afgehandeld op (incl. tijd)
                                        <SortIcon field="afhandeling_datum" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('gewerkteMinuten')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Duur
                                        <SortIcon field="gewerkteMinuten" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('afgehandeld_door')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Door
                                        <SortIcon field="afgehandeld_door" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('afhandeling_bijzonderheden')} className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 cursor-pointer hover:bg-slate-200 transition-colors">
                                    <div className="flex items-center justify-between gap-1">
                                        Opmerkingen
                                        <SortIcon field="afhandeling_bijzonderheden" />
                                    </div>
                                </TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredMeldingen.map((melding) => (
                                    <TableRow key={melding.id} onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer h-12 hover:bg-slate-50 transition-colors border-b border-slate-100">
                                        <TableCell className="font-black py-2 px-4 border-r border-slate-100">{melding.intakenummer || '-'}</TableCell>
                                        <TableCell className="py-2 px-4 border-r border-slate-100 text-[11px] font-bold text-slate-500">{melding.extern_meldingsnummer || '-'}</TableCell>
                                        <TableCell className="truncate py-2 px-4 border-r border-slate-100 max-w-[200px] text-xs font-bold text-slate-900">{[melding.straatnaam, melding.plaats].filter(Boolean).join(', ') || '-'}</TableCell>
                                        <TableCell className="py-2 px-4 border-r border-slate-100">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold text-slate-600">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yy') : '-'}</span>
                                                <span className="text-[9px] font-bold text-slate-400">{melding.tijdstip || '--:--'}</span>
                                            </div>
                                        </TableCell>
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
            </div>
        )}
      </div>
    </div>
  );
}
