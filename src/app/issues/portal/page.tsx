'use client';

import * as React from 'react';
import { useCollection, useFirestore, updateDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import { Search, ListFilter, ArrowLeft, MoreHorizontal, Mail, Info, CheckCircle2, XCircle, MessageSquare, LayoutGrid, Tag } from 'lucide-react';
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
import { AcceptAssignDialog } from '@/components/accept-assign-dialog';
import { LoadingScreen } from '@/components/loading-screen';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';

export default function MeldingenportaalPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');

  const [isForwardDialogOpen, setIsForwardDialogOpen] = React.useState(false);
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = React.useState(false);
  const [selectedMelding, setSelectedMelding] = React.useState<Melding | null>(null);

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
        melding.subcategorie,
        melding.werkgebied
      ];
      return searchFields.some(field => 
        field?.toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [newMeldingen, debouncedSearchTerm]);

  const handleStatusChange = async (melding: Melding, newStatus: string) => {
    if (!firestore) return;
    const mRef = doc(firestore, 'meldingen', melding.id);
    try {
        updateDocumentNonBlocking(mRef, { 
            status: newStatus,
            updatedAt: new Date().toISOString()
        });
        toast({ title: "Status bijgewerkt", description: `Melding ${melding.intakenummer} is bijgewerkt.` });
    } catch(error) {
        toast({ variant: "destructive", title: "Fout", description: "Kon de status niet bijwerken." });
    }
  };

  const handleOpenAccept = (melding: Melding) => {
    setSelectedMelding(melding);
    setIsAcceptDialogOpen(true);
  };

  const handleOpenForward = (melding: Melding) => {
    setSelectedMelding(melding);
    setIsForwardDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden bg-background">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border-b shrink-0 gap-4 bg-slate-50/50">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.push('/')} className="shrink-0 rounded-full h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg md:text-xl font-black uppercase tracking-tight text-slate-900">Portaal</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Zoek..." className="pl-9 h-9 border-slate-200 rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-2 md:p-4">
        {isLoadingMeldingen ? (
            <LoadingScreen message="Portaal laden..." />
        ) : filteredMeldingen.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <Info className="h-12 w-12 text-slate-300 mb-4 opacity-20" />
                <p className="font-black uppercase tracking-tight text-slate-900">Geen nieuwe aanvragen</p>
            </div>
        ) : (
            <div className="border rounded-2xl overflow-hidden shadow-sm bg-white overflow-x-auto custom-scrollbar">
                <Table className="min-w-[1200px]">
                    <TableHeader className="bg-slate-100 sticky top-0 z-10">
                        <TableRow>
                            <TableHead className="font-black uppercase text-[10px] text-slate-500 sticky left-0 bg-slate-100 z-20">Intakenr.</TableHead>
                            <TableHead className="font-black uppercase text-[10px] text-slate-500">Adres</TableHead>
                            <TableHead className="font-black uppercase text-[10px] text-slate-500">Omschrijving</TableHead>
                            <TableHead className="font-black uppercase text-[10px] text-slate-500">Categorie</TableHead>
                            <TableHead className="font-black uppercase text-[10px] text-slate-500">Werkgebied</TableHead>
                            <TableHead className="font-black uppercase text-[10px] text-slate-500">Datum</TableHead>
                            <TableHead className="font-black uppercase text-[10px] text-slate-500">Melder</TableHead>
                            <TableHead className="text-right font-black uppercase text-[10px] text-slate-500">Acties</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMeldingen.map((melding) => {
                            const meldDatum = melding.datum || melding.meldingsdatum;
                            return (
                                <TableRow key={melding.id} className="cursor-pointer hover:bg-slate-50 transition-colors h-14">
                                    <TableCell className="font-black text-xs sticky left-0 bg-white group-hover:bg-slate-50 z-10" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.intakenummer}</TableCell>
                                    <TableCell className="text-xs font-bold" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>
                                        <div className="flex flex-col">
                                            <span className="truncate max-w-[200px]">{[melding.straatnaam, melding.huisnummer].filter(Boolean).join(' ')}</span>
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">{[melding.postcode, melding.plaats].filter(Boolean).join(' ')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs max-w-[200px]" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>
                                        <div className="flex items-center gap-2">
                                            <MessageSquare className="h-3 w-3 text-slate-300 shrink-0" />
                                            <p className="truncate text-slate-500 italic font-medium" title={melding.extra_informatie}>
                                                {melding.extra_informatie || '-'}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>
                                        <div className="flex flex-col">
                                            <span className="font-black text-slate-900 uppercase tracking-tight text-[10px]">{melding.hoofdcategorie}</span>
                                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{melding.subcategorie}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>
                                        <Badge variant="outline" className="font-black text-[9px] uppercase tracking-tighter bg-slate-50 border-slate-200">
                                            <LayoutGrid className="h-2.5 w-2.5 mr-1 text-primary" />
                                            {melding.werkgebied || '-'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-[11px] font-bold text-slate-600" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>
                                        {meldDatum ? format(new Date(meldDatum), 'dd-MM-yy') : '-'}
                                    </TableCell>
                                    <TableCell className='text-xs font-medium' onClick={() => router.push(`/issues/new?id=${melding.id}`)}>
                                        <div className="flex flex-col">
                                            <span className="font-black text-slate-900 uppercase tracking-tight">{melding.melder || '-'}</span>
                                            {melding.aangenomen_door && (
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Door: {melding.aangenomen_door}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-10 w-10 text-green-600 rounded-full" onClick={() => handleOpenAccept(melding)}>
                                                <CheckCircle2 className="h-5 w-5" />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 rounded-full">
                                                        <MoreHorizontal className="h-5 w-5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl p-2 border-slate-100">
                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleOpenAccept(melding); }} className="font-bold rounded-xl h-11 cursor-pointer">Accepteren</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleOpenForward(melding); }} className="font-bold rounded-xl h-11 cursor-pointer"><Mail className="mr-2 h-4 w-4 text-primary" />Extern doorzetten</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleStatusChange(melding, 'Geweigerd'); }} className="font-bold rounded-xl h-11 text-red-600 cursor-pointer"><XCircle className="mr-2 h-4 w-4" />Weigeren</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        )}
      </div>

      <ForwardExternalDialog open={isForwardDialogOpen} onOpenChange={setIsForwardDialogOpen} melding={selectedMelding} onSuccess={() => {}} />
      <AcceptAssignDialog 
        key={selectedMelding?.id || 'none'}
        open={isAcceptDialogOpen} 
        onOpenChange={setIsAcceptDialogOpen} 
        melding={selectedMelding} 
        onSuccess={() => {}} 
      />
    </div>
  );
}