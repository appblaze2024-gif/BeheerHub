'use client';

import * as React from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft, Info, User, Pencil, LayoutGrid, Calendar, MapPin, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Melding } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format, isToday } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/firebase/profile-provider';
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
import { AcceptAssignDialog } from '@/components/accept-assign-dialog';
import { useIsMobile } from '@/hooks/use-mobile';

const openStatuses = [
  "Intern doorgezet",
  "In behandeling",
  "Gepland op korte termijn",
  "Gepland op langere termijn",
  "Extern doorgezet",
];

export default function OpenIssuesPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { profile } = useProfile();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');
  
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
  const [selectedMeldingForAssign, setSelectedMeldingForAssign] = React.useState<Melding | null>(null);

  const isPrivileged = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'meldingen'),
      where('status', 'in', openStatuses)
    );
  }, [firestore, user]);

  const { data: openMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenQuery);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const filteredMeldingen = React.useMemo(() => {
    if (!openMeldingen) return [];
    
    let visibleMeldingen = openMeldingen;
    if (!isPrivileged) {
        const userName = profile?.displayName || profile?.email || 'Onbekend';
        visibleMeldingen = openMeldingen.filter(m => m.behandelaar === userName);
    }

    if (!debouncedSearchTerm) return visibleMeldingen;

    const lowercasedFilter = debouncedSearchTerm.toLowerCase();
    return visibleMeldingen.filter(melding => {
      return Object.values(melding).some(value =>
        String(value).toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [openMeldingen, debouncedSearchTerm, isPrivileged, profile]);
  
  const statusColorMap: { [key: string]: string } = {
    "Nieuw": "bg-red-500",
    "Open": "bg-cyan-500",
    "Intern doorgezet": "bg-yellow-500",
    "In behandeling": "bg-blue-500",
    "Gepland op korte termijn": "bg-purple-500",
    "Gepland op langere termijn": "bg-indigo-500",
  };

  const handleOpenAssign = (e: React.MouseEvent, melding: Melding) => {
    if (!isPrivileged) return;
    e.stopPropagation();
    setSelectedMeldingForAssign(melding);
    setAssignDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6.1rem)] overflow-hidden bg-background">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b shrink-0 gap-4 bg-slate-50/50">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="shrink-0 rounded-full h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-black uppercase tracking-tight">Openstaande Meldingen</h1>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Zoek meldingen..."
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
            <LoadingScreen message="Meldingen laden..." />
        ) : filteredMeldingen.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <Info className="h-12 w-12 text-slate-300 mb-4" />
                <p className="font-black uppercase tracking-tight text-slate-900">Geen openstaande meldingen</p>
                <p className="text-sm text-slate-500 mt-1">Alle actieve meldingen zijn verwerkt of voldoen niet aan de zoekterm.</p>
            </div>
        ) : (
            <div className="space-y-4">
                {/* Mobile View: Card List */}
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
                                    <Badge
                                        className={cn(
                                            "text-[9px] font-black uppercase tracking-tighter h-5 px-2 text-white border-none",
                                            statusColorMap[melding.status] || 'bg-slate-400'
                                        )}
                                    >
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
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-3 w-3 text-slate-300" />
                                            <span className="text-[10px] font-bold text-slate-500">
                                                {melding.datum ? format(new Date(melding.datum), 'dd MMM yyyy') : '-'}
                                            </span>
                                        </div>
                                        <button 
                                            className={cn(
                                                "flex items-center gap-2 px-2.5 py-1 rounded-full border-2 transition-all",
                                                isPrivileged ? "border-primary/20 bg-primary/5 hover:bg-primary/10" : "border-slate-100 bg-slate-50"
                                            )}
                                            onClick={(e) => handleOpenAssign(e, melding)}
                                        >
                                            <User className="h-3 w-3 text-primary" />
                                            <span className="text-[10px] font-black text-primary uppercase truncate max-w-[100px]">
                                                {melding.behandelaar || 'Niet toegewezen'}
                                            </span>
                                            {isPrivileged && <Pencil className="h-2.5 w-2.5 text-primary opacity-50" />}
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Desktop View: Table */}
                <div className="hidden md:block border rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="overflow-x-auto">
                        <Table className="border-collapse w-full">
                            <TableHeader className="sticky top-0 bg-slate-100 z-10">
                            <TableRow className="hover:bg-transparent border-b-2 border-slate-200">
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Intakenr.</TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 hidden lg:table-cell">Extern nr.</TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Datum</TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 hidden md:table-cell">Hoofdindeling</TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Indeling</TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Adres</TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 hidden xl:table-cell">Wijk</TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Toegewezen gebruiker</TableHead>
                                <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500">Status</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredMeldingen.map((melding) => {
                                let displayStatus = melding.status;
                                if (melding.status === 'Nieuw') {
                                    try {
                                    if (!isToday(new Date(melding.datum))) {
                                        displayStatus = 'Open';
                                    }
                                    } catch (e) {}
                                }
                                
                                return (
                                    <TableRow key={melding.id} onClick={() => router.push(`/issues/new?id=${melding.id}`)} className="cursor-pointer h-12 hover:bg-blue-50/50 transition-colors border-b border-slate-100">
                                        <TableCell className="font-black py-2 px-4 border-r border-slate-100">{melding.intakenummer || '-'}</TableCell>
                                        <TableCell className="py-2 px-4 border-r border-slate-100 hidden lg:table-cell text-slate-400 font-bold">{melding.extern_meldingsnummer || '-'}</TableCell>
                                        <TableCell className="py-2 px-4 border-r border-slate-100 text-xs font-bold text-slate-600">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yy') : '-'}</TableCell>
                                        <TableCell className="py-2 px-4 border-r border-slate-100 hidden md:table-cell font-medium text-slate-500">{melding.hoofdcategorie || '-'}</TableCell>
                                        <TableCell className="py-2 px-4 border-r border-slate-100 font-bold text-slate-900">{melding.subcategorie || '-'}</TableCell>
                                        <TableCell className="truncate py-2 px-4 border-r border-slate-100 max-w-[200px] text-xs font-medium">{[melding.straatnaam, melding.huisnummer].filter(Boolean).join(' ') || '-'}</TableCell>
                                        <TableCell className="truncate py-2 px-4 border-r border-slate-100 hidden xl:table-cell text-xs">
                                            <div className="flex items-center gap-1.5">
                                                <LayoutGrid className="h-3 w-3 text-slate-300" />
                                                <span className="font-bold">{melding.werkgebied || melding.wijk || '-'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell 
                                            className={cn(
                                                "py-2 px-4 border-r border-slate-100 group/cell",
                                                isPrivileged && "hover:bg-slate-100/80 transition-colors"
                                            )}
                                            onClick={(e) => handleOpenAssign(e, melding)}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <User className="h-3.5 w-3.5 text-slate-400" />
                                                    <span className="text-[11px] font-black text-slate-700 truncate max-w-[120px]">
                                                        {melding.behandelaar || '-'}
                                                    </span>
                                                </div>
                                                {isPrivileged && <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover/cell:opacity-100 transition-opacity" />}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2 px-4">
                                            <Badge
                                                className={cn(
                                                    "text-[9px] font-black uppercase tracking-tighter h-5 px-2 text-white border-none",
                                                    statusColorMap[displayStatus] || 'bg-slate-400'
                                                )}
                                            >
                                                {displayStatus}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        )}
      </div>

      <AcceptAssignDialog 
        key={selectedMeldingForAssign?.id || 'none'}
        open={assignDialogOpen} 
        onOpenChange={setAssignDialogOpen} 
        melding={selectedMeldingForAssign} 
        onSuccess={() => {}} 
      />
    </div>
  );
}
