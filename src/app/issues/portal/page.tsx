'use client';

import * as React from 'react';
import { useCollection, useFirestore, updateDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft, MoreHorizontal, Mail, Info, CheckCircle2, XCircle } from 'lucide-react';
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
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ForwardExternalDialog } from '@/components/forward-external-dialog';
import { LoadingScreen } from '@/components/loading-screen';
import { Badge } from '@/components/ui/badge';

export default function MeldingenportaalPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');

  const [selectedMeldingForForward, setSelectedMeldingForForward] = React.useState<Melding | null>(null);

  // Portaal Query: Only fetch 'Nieuw' meldingen, sorted by creation date
  const portalQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'meldingen'), 
      where('status', '==', 'Nieuw')
    );
  }, [firestore]);

  const { data: rawMeldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(portalQuery);

  const newMeldingen = React.useMemo(() => {
    if (!rawMeldingen) return [];
    return [...rawMeldingen].sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
    });
  }, [rawMeldingen]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const filteredMeldingen = React.useMemo(() => {
    if (!newMeldingen) return [];
    if (!debouncedSearchTerm) return newMeldingen;

    const lowercasedFilter = debouncedSearchTerm.toLowerCase();
    return newMeldingen.filter(melding => {
      const searchFields = [
        melding.intakenummer,
        melding.straatnaam,
        melding.plaats,
        melding.extra_informatie,
        melding.melder,
        melding.hoofdcategorie,
        melding.subcategorie
      ];
      return searchFields.some(field => 
        field?.toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [newMeldingen, debouncedSearchTerm]);

  const handleStatusChange = async (melding: Melding, newStatus: string) => {
    if (!firestore) return;
    const meldingRef = doc(firestore, 'meldingen', melding.id);
    try {
        await updateDocumentNonBlocking(meldingRef, { 
            status: newStatus,
            updatedAt: new Date().toISOString()
        });
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
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b shrink-0 gap-4 bg-slate-50/50">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.push('/')} className="shrink-0 rounded-full h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Meldingenportaal</h1>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Zoek nieuwe meldingen..."
                    className="pl-9 h-9 border-slate-200"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Button variant="outline" size="sm" className="h-9 font-bold">
                <ListFilter className="mr-2 h-4 w-4" />
                Filter
            </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {isLoadingMeldingen ? (
            <LoadingScreen message="Portaal laden..." />
        ) : filteredMeldingen.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <Info className="h-12 w-12 text-slate-300 mb-4 opacity-20" />
                <p className="font-black uppercase tracking-tight text-slate-900">Geen nieuwe aanvragen</p>
                <p className="text-sm text-slate-500 mt-1 font-medium">Alle binnengekomen meldingen zijn verwerkt.</p>
            </div>
        ) : (
            <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
                <div className="overflow-x-auto">
                    <Table className="border-collapse w-full">
                        <TableHeader className="sticky top-0 bg-slate-100 z-10 shadow-sm">
                        <TableRow className="hover:bg-transparent border-b-2 border-slate-200">
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Intakenr.</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Adres</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 hidden md:table-cell">Omschrijving</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200">Datum</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 border-r border-slate-200 hidden lg:table-cell">Melder</TableHead>
                            <TableHead className="py-3 px-4 font-black uppercase tracking-widest text-[10px] text-slate-500 text-right">Acties</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMeldingen.map((melding) => (
                                <TableRow key={melding.id} className="cursor-pointer h-12 hover:bg-slate-50 transition-colors border-b border-slate-100" >
                                    <TableCell className="font-black py-2 px-4 border-r border-slate-100" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.intakenummer || '-'}</TableCell>
                                    <TableCell className="py-2 px-4 border-r border-slate-100 text-xs font-bold text-slate-900" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{[melding.straatnaam, melding.plaats].filter(Boolean).join(', ') || '-'}</TableCell>
                                    <TableCell className="max-w-xs truncate py-2 px-4 border-r border-slate-100 hidden md:table-cell text-xs italic text-slate-500" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.extra_informatie || '-'}</TableCell>
                                    <TableCell className="py-2 px-4 border-r border-slate-100 text-[11px] font-bold text-slate-600" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.datum ? format(new Date(melding.datum), 'dd-MM-yy') : '-'}</TableCell>
                                    <TableCell className='truncate py-2 px-4 border-r border-slate-100 hidden lg:table-cell text-xs font-medium' onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.melder || '-'}</TableCell>
                                    <TableCell className="text-right py-2 px-4">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleStatusChange(melding, 'In behandeling')}>
                                                <CheckCircle2 className="h-4 w-4" />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-600">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl p-2 border-slate-100">
                                                    <DropdownMenuItem onClick={() => handleStatusChange(melding, 'In behandeling')} className="font-bold rounded-lg h-10 cursor-pointer">
                                                        Accepteren & Doorzetten
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setSelectedMeldingForForward(melding)} className="font-bold rounded-lg h-10 cursor-pointer">
                                                        <Mail className="mr-2 h-4 w-4 text-primary" />
                                                        Extern doorzetten
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(melding, 'Geweigerd')} className="font-bold rounded-lg h-10 text-red-600 cursor-pointer">
                                                        <XCircle className="mr-2 h-4 w-4" />
                                                        Melding weigeren
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(melding, 'Niet in beheer')} className="font-bold rounded-lg h-10 text-red-600 cursor-pointer">
                                                        <XCircle className="mr-2 h-4 w-4" />
                                                        Niet in beheer
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
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

      <ForwardExternalDialog
        open={!!selectedMeldingForForward}
        onOpenChange={(open) => {
          if (!open) {
            // Delay clearing the selection to allow for smooth close animation
            setTimeout(() => setSelectedMeldingForForward(null), 200);
          }
        }}
        melding={selectedMeldingForForward}
        onSuccess={() => {}}
      />
    </div>
  );
}
