'use client';

import * as React from 'react';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, orderBy } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Plus, 
  Search, 
  User, 
  ChevronRight, 
  Trash2, 
  Pencil, 
  ScrollText,
  Briefcase,
  MoreHorizontal,
  ArrowLeft,
  Loader2,
  Settings2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProject } from '@/context/project-context';
import { LoadingScreen } from '@/components/loading-screen';
import { ContractorDialog } from '@/components/contractor-dialog';
import { MeetingMinuteDialog } from '@/components/meeting-minute-dialog';
import { MinuteTemplateDialog } from '@/components/minute-template-dialog';
import type { Contractor, MeetingMinute, Project } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function MinutesPage() {
  const firestore = useFirestore();
  const { selectedProjectId } = useProject();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedContractor, setSelectedContractor] = React.useState<Contractor | null>(null);
  const [isContractorDialogOpen, setIsContractorDialogOpen] = React.useState(false);
  const [isMinuteDialogOpen, setIsMinuteDialogOpen] = React.useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = React.useState(false);
  const [editingMinute, setEditingMinute] = React.useState<MeetingMinute | null>(null);
  const isMobile = useIsMobile();

  // Projects Query
  const projectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);
  const { data: projects } = useCollection<Project>(projectsQuery);

  // Contractors Query
  const contractorsQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return query(
      collection(firestore, 'contractors'),
      where('projectId', '==', selectedProjectId)
    );
  }, [firestore, selectedProjectId]);
  const { data: contractors, isLoading: isLoadingContractors } = useCollection<Contractor>(contractorsQuery);

  // Minutes Query
  const minutesQuery = useMemoFirebase(() => {
    if (!firestore || !selectedContractor) return null;
    return query(
      collection(firestore, 'contractors', selectedContractor.id, 'minutes'),
      orderBy('date', 'desc')
    );
  }, [firestore, selectedContractor?.id]);
  const { data: minutes, isLoading: isLoadingMinutes } = useCollection<MeetingMinute>(minutesQuery);

  const filteredContractors = React.useMemo(() => {
    if (!contractors) return [];
    if (!searchTerm.trim()) return contractors;
    const q = searchTerm.toLowerCase();
    return contractors.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.contactPerson || '').toLowerCase().includes(q)
    );
  }, [contractors, searchTerm]);

  const handleDeleteContractor = (id: string) => {
    if (!firestore) return;
    deleteDocumentNonBlocking(doc(firestore, 'contractors', id));
    if (selectedContractor?.id === id) setSelectedContractor(null);
  };

  const handleDeleteMinute = (id: string) => {
    if (!firestore || !selectedContractor) return;
    deleteDocumentNonBlocking(doc(firestore, 'contractors', selectedContractor.id, 'minutes', id));
  };

  const activeProject = projects?.find(p => p.id === selectedProjectId);

  if (isLoadingContractors) return <LoadingScreen message="Aannemers laden..." />;

  return (
    <div className="flex flex-col flex-1 h-full bg-slate-50 overflow-hidden">
      <PageHeader 
        title="Notulen & Verslagen" 
        description={activeProject ? `Beheer verslagen voor project: ${activeProject.projectnaam}` : "Selecteer een project om verslagen te beheren."}
      >
        {selectedProjectId && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsContractorDialogOpen(true)} className="font-black h-10 uppercase tracking-tight">
              <Plus className="mr-2 h-4 w-4" /> Nieuwe Aannemer
            </Button>
          </div>
        )}
      </PageHeader>

      {!selectedProjectId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <div className="bg-white p-8 rounded-3xl shadow-xl mb-6">
            <Briefcase className="h-16 w-16 text-slate-200" />
          </div>
          <h3 className="text-xl font-black uppercase tracking-tight mb-2 text-slate-900">Geen project geselecteerd</h3>
          <p className="text-sm text-slate-400 max-w-xs mx-auto font-medium">Selecteer eerst een project in de sidebar om de aannemers en notulen te bekijken.</p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 p-4 md:p-6 overflow-hidden">
          {/* Aannemers Lijst */}
          <Card className={cn(
            "lg:col-span-4 flex flex-col rounded-3xl overflow-hidden border-none shadow-xl",
            isMobile && selectedContractor ? "hidden" : "flex"
          )}>
            <CardHeader className="p-6 border-b bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Zoek aannemer..." 
                  className="pl-10 h-11 rounded-2xl border-slate-100 bg-slate-50 focus:ring-primary/20 font-bold"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2">
              {filteredContractors.length > 0 ? (
                filteredContractors.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => setSelectedContractor(c)}
                    className={cn(
                      "p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between group",
                      selectedContractor?.id === c.id 
                        ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" 
                        : "bg-white hover:bg-slate-50 text-slate-900 border border-slate-100"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-black uppercase text-sm tracking-tight truncate">{c.name}</p>
                      <p className={cn(
                        "text-[10px] font-bold uppercase tracking-widest mt-0.5",
                        selectedContractor?.id === c.id ? "text-white/70" : "text-slate-400"
                      )}>
                        {c.contactPerson || 'Geen contactpersoon'}
                      </p>
                    </div>
                    <ChevronRight className={cn(
                      "h-4 w-4 transition-transform",
                      selectedContractor?.id === c.id ? "text-white" : "text-slate-200 group-hover:text-primary"
                    )} />
                  </div>
                ))
              ) : (
                <div className="py-12 text-center opacity-20">
                  <User className="h-12 w-12 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase">Geen aannemers gevonden</p>
                </div>
              )}
            </div>
          </Card>

          {/* Notulen Overzicht */}
          <Card className={cn(
            "lg:col-span-8 flex flex-col rounded-3xl overflow-hidden border-none shadow-xl bg-white",
            isMobile && !selectedContractor ? "hidden" : "flex"
          )}>
            {selectedContractor ? (
              <div className="flex flex-col h-full">
                <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {isMobile && <Button variant="ghost" size="icon" onClick={() => setSelectedContractor(null)}><ArrowLeft className="h-5 w-5" /></Button>}
                    <div>
                      <h2 className="text-xl font-black uppercase tracking-tight leading-none mb-1 text-slate-900">{selectedContractor.name}</h2>
                      <div className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {selectedContractor.contactPerson}</span>
                        {selectedContractor.email && <span>• {selectedContractor.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsTemplateDialogOpen(true)} className="font-bold h-9 border-slate-300">
                      <Settings2 className="mr-2 h-4 w-4" /> Sjabloon
                    </Button>
                    <Button onClick={() => setIsMinuteDialogOpen(true)} size="sm" className="h-9 font-black uppercase tracking-tight shadow-lg shadow-primary/20">
                      <Plus className="mr-2 h-4 w-4" /> Verslag Maken
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400">
                          <MoreHorizontal className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setIsContractorDialogOpen(true)} className="font-bold">Gegevens bewerken</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteContractor(selectedContractor.id)} className="text-red-600 font-bold">Aannemer verwijderen</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                  {isLoadingMinutes ? (
                    <div className="flex items-center justify-center h-40">
                      <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
                    </div>
                  ) : minutes && minutes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {minutes.map(m => (
                        <div key={m.id} className="group p-5 rounded-[2.5rem] border-2 border-slate-50 hover:border-primary/20 hover:bg-slate-50/30 transition-all cursor-pointer relative">
                          <div className="flex justify-between items-start mb-4">
                            <div className="bg-primary/5 p-3 rounded-2xl">
                              <ScrollText className="h-6 w-6 text-primary" />
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{format(new Date(m.date), 'dd MMM yyyy', { locale: nl })}</p>
                              <Badge variant="outline" className="mt-1 h-5 text-[8px] font-black uppercase border-2">Verslag</Badge>
                            </div>
                          </div>
                          <h4 className="font-black text-slate-900 uppercase tracking-tight mb-2 line-clamp-1">{m.title}</h4>
                          <p className="text-xs text-slate-500 font-medium line-clamp-3 mb-4 leading-relaxed italic">
                            {m.agendaItems?.[0]?.content || 'Geen inhoud'}
                          </p>
                          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-slate-900 flex items-center justify-center text-[8px] font-black text-white uppercase">
                                {m.createdBy?.substring(0, 2) || 'BH'}
                              </div>
                              <span className="text-[10px] font-black text-slate-400 uppercase">{m.createdBy}</span>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-primary" onClick={(e) => { e.stopPropagation(); setEditingMinute(m); setIsMinuteDialogOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteMinute(m.id); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                      <div className="bg-slate-50 p-8 rounded-full mb-4">
                        <ScrollText className="h-12 w-12 opacity-20" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest">Nog geen verslagen aanwezig</p>
                      <p className="text-xs font-medium text-slate-400 mt-2">Maak uw eerste notulen voor deze aannemer.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-300">
                <div className="bg-slate-50 p-10 rounded-full mb-6">
                  <User className="h-16 w-16 opacity-10" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-400 mb-2">Selecteer een aannemer</h3>
                <p className="text-sm font-medium max-w-xs mx-auto leading-relaxed">Kies een aannemer uit de lijst om de verslagenhistorie te bekijken of nieuwe notulen te schrijven.</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {selectedProjectId && (
        <ContractorDialog 
          open={isContractorDialogOpen}
          onOpenChange={setIsContractorDialogOpen}
          projectId={selectedProjectId}
          contractor={selectedContractor}
        />
      )}

      {selectedContractor && (
        <MeetingMinuteDialog 
          open={isMinuteDialogOpen}
          onOpenChange={(open) => {
            setIsMinuteDialogOpen(open);
            if (!open) setEditingMinute(null);
          }}
          contractor={selectedContractor}
          minute={editingMinute}
        />
      )}

      {selectedContractor && (
        <MinuteTemplateDialog
          open={isTemplateDialogOpen}
          onOpenChange={setIsTemplateDialogOpen}
          contractor={selectedContractor}
        />
      )}
    </div>
  );
}
