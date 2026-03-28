'use client';

import * as React from 'react';
import { useCollection, useFirestore, updateDocumentNonBlocking, useMemoFirebase, useUser, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import { 
  Search, 
  ListFilter, 
  ArrowLeft, 
  MoreHorizontal, 
  Mail, 
  Info, 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  LayoutGrid, 
  Tag, 
  Users,
  Trash2
} from 'lucide-react';
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
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ForwardExternalDialog } from '@/components/forward-external-dialog';
import { AcceptAssignDialog } from '@/components/accept-assign-dialog';
import { LoadingScreen } from '@/components/loading-screen';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useProfile } from '@/firebase/profile-provider';

export default function MeldingenportaalPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');

  const [isForwardDialogOpen, setIsForwardDialogOpen] = React.useState(false);
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedMelding, setSelectedMelding] = React.useState<Melding | null>(null);
  const [meldingToDelete, setMeldingToDelete] = React.useState<Melding | null>(null);
  
  // Selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [selectedMeldingenForAssign, setSelectedMeldingenForAssign] = React.useState<Melding[]>([]);

  const isSuperAdmin = profile?.role === 'Super admin';

  const portalQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'meldingen'), 
      where('status', '==', 'Nieuw')
    );
  }, [firestore, user]);

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

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredMeldingen.length && filteredMeldingen.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMeldingen.map(m => m.id)));
    }
  };

  const handleOpenAccept = (melding: Melding) => {
    setSelectedMeldingenForAssign([melding]);
    setIsAcceptDialogOpen(true);
  };

  const handleOpenBulkAccept = () => {
    const selected = filteredMeldingen.filter(m => selectedIds.has(m.id));
    setSelectedMeldingenForAssign(selected);
    setIsAcceptDialogOpen(true);
  };

  const handleOpenForward = (melding: Melding) => {
    setSelectedMelding(melding);
    setIsForwardDialogOpen(true);
  };

  const handleDeleteClick = (melding: Melding) => {
    setMeldingToDelete(melding);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteMelding = async (melding: Melding) => {
    if (!firestore || !isSuperAdmin) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'meldingen', melding.id));
        toast({ title: "Melding verwijderd", description: "De melding is permanent gewist." });
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij verwijderen" });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden bg-background">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border-b shrink-0 gap-4 bg-slate-50/50">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.push('/')} className="shrink-0 rounded-none h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg md:text-xl font-black uppercase tracking-tight text-slate-900">Portaal</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Zoek..." className="pl-9 h-9 border-slate-200 rounded-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-2 md:p-4">
        {isLoadingMeldingen ? (
            <LoadingScreen message="Portaal laden..." />
        ) : filteredMeldingen.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50/50 rounded-none border-2 border-dashed border-slate-200">
                <Info className="h-12 w-12 text-slate-300 mb-4 opacity-20" />
                <p className="font-black uppercase tracking-tight text-slate-900">Geen nieuwe aanvragen</p>
            </div>
        ) : (
            <div className="border rounded-none overflow-hidden shadow-sm bg-white overflow-x-auto custom-scrollbar">
                <Table className="min-w-[1300px]">
                    <TableHeader className="bg-slate-100 sticky top-0 z-10">
                        <TableRow>
                            <TableHead className="w-[50px] p-2 border-r border-slate-200 text-center sticky left-0 bg-slate-100 z-30">
                                <Checkbox 
                                    checked={selectedIds.size === filteredMeldingen.length && filteredMeldingen.length > 0} 
                                    onCheckedChange={handleSelectAll}
                                    className="h-5 w-5 rounded-md"
                                />
                            </TableHead>
                            <TableHead className="font-black uppercase text-[10px] text-slate-500 sticky left-[50px] bg-slate-100 z-20">Intakenr.</TableHead>
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
                            const isSelected = selectedIds.has(melding.id);
                            
                            return (
                                <TableRow 
                                    key={melding.id} 
                                    className={cn(
                                        "cursor-pointer hover:bg-slate-50 transition-colors h-14",
                                        isSelected && "bg-blue-50/50"
                                    )}
                                >
                                    <TableCell className="p-2 border-r border-slate-100 text-center sticky left-0 bg-white group-hover:bg-slate-50 z-20" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox 
                                            checked={isSelected} 
                                            onCheckedChange={() => handleToggleSelect(melding.id)}
                                            className="h-5 w-5 rounded-md"
                                        />
                                    </TableCell>
                                    <TableCell className="font-black text-xs sticky left-[50px] bg-white group-hover:bg-slate-50 z-10" onClick={() => router.push(`/issues/new?id=${melding.id}`)}>{melding.intakenummer}</TableCell>
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
                                        <Badge variant="outline" className="font-black text-[9px] uppercase tracking-tighter bg-slate-50 border-slate-200 rounded-none">
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
                                            <Button variant="ghost" size="icon" className="h-10 w-10 text-green-600 rounded-none" onClick={() => handleOpenAccept(melding)}>
                                                <CheckCircle2 className="h-5 w-5" />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 rounded-none">
                                                        <MoreHorizontal className="h-5 w-5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56 rounded-none shadow-xl p-2 border-slate-100">
                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleOpenAccept(melding); }} className="font-bold rounded-none h-11 cursor-pointer">Accepteren</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleOpenForward(melding); }} className="font-bold rounded-none h-11 cursor-pointer"><Mail className="mr-2 h-4 w-4 text-primary" />Extern doorzetten</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleStatusChange(melding, 'Geweigerd'); }} className="font-bold rounded-none h-11 text-red-600 cursor-pointer"><XCircle className="mr-2 h-4 w-4" />Weigeren</DropdownMenuItem>
                                                    {isSuperAdmin && (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDeleteClick(melding); }} className="font-bold rounded-none h-11 text-red-600 cursor-pointer">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Verwijderen uit database
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
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

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-10 duration-300">
          <div className="bg-slate-900 text-white rounded-none px-6 py-3 shadow-2xl flex items-center gap-6 border-2 border-slate-800">
            <div className="flex items-center gap-3 border-r border-white/20 pr-6">
              <div className="bg-primary h-8 w-8 rounded-none flex items-center justify-center font-black text-xs">
                {selectedIds.size}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">Geselecteerd</span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={handleOpenBulkAccept}
                className="h-10 px-6 font-black uppercase text-xs tracking-tight bg-primary hover:bg-primary/90 rounded-none shadow-lg"
              >
                <Users className="mr-2 h-4 w-4" /> Bulk Toewijzen
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setSelectedIds(new Set())}
                className="h-10 text-white hover:bg-white/10 rounded-none font-bold text-xs"
              >
                Annuleren
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Deletion */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-none border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tight">Melding definitief verwijderen?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-slate-500">
              Weet u zeker dat u melding <strong>{meldingToDelete?.intakenummer}</strong> permanent wilt verwijderen uit de database? Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="p-0 gap-2">
            <AlertDialogCancel className="rounded-none font-bold">Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => meldingToDelete && handleDeleteMelding(meldingToDelete)} 
              className="bg-red-600 hover:bg-red-700 rounded-none font-black uppercase px-8"
            >
              Definitief Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ForwardExternalDialog open={isForwardDialogOpen} onOpenChange={setIsForwardDialogOpen} melding={selectedMelding} onSuccess={() => {}} />
      <AcceptAssignDialog 
        key={selectedMeldingenForAssign.length || 'none'}
        open={isAcceptDialogOpen} 
        onOpenChange={setIsAcceptDialogOpen} 
        meldingen={selectedMeldingenForAssign} 
        onSuccess={() => {
          setSelectedIds(new Set());
          setSelectedMeldingenForAssign([]);
        }} 
      />
    </div>
  );
}
