'use client';

import * as React from 'react';
import {
  ArrowLeft,
  Pencil,
  Paperclip,
  Plus,
  Search,
  FileText,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle,
  Clock,
  MoreHorizontal,
  Info,
  Copy,
  GanttChart,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  XCircle,
  Users,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  getISOWeek,
  add,
  sub,
  isToday,
  isSameDay,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  isSameMonth,
  startOfDay,
  endOfDay,
  addDays,
  isAfter,
} from 'date-fns';
import { nl } from 'date-fns/locale';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  useDoc,
  useFirestore,
  updateDocumentNonBlocking,
} from '@/firebase';
import type { Medewerker, Dienst } from '@/lib/types';
import { MedewerkerDialog } from '@/components/medewerker-dialog';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useProfile } from '@/firebase/profile-provider';
import { useIsMobile } from '@/hooks/use-mobile';
import { AfwezigheidDialog } from '@/components/afwezigheid-dialog';
import { Loader2 } from 'lucide-react';
import { LoadingScreen } from '@/components/loading-screen';


function DetailField({
  label,
  value,
  fieldName,
  medewerkerId,
  canEdit,
}: {
  label: string;
  value: string | undefined | null;
  fieldName: keyof Medewerker;
  medewerkerId: string;
  canEdit: boolean;
}) {
  const firestore = useFirestore();
  const [isEditing, setIsEditing] = React.useState(false);
  const [currentValue, setCurrentValue] = React.useState(value || '');

  React.useEffect(() => {
    if (!isEditing) {
      setCurrentValue(value || '');
    }
  }, [value, isEditing]);

  const handleSave = async () => {
    if (!firestore || !medewerkerId) return;
    const medewerkerRef = doc(firestore, 'medewerkers', medewerkerId);

    try {
      await updateDocumentNonBlocking(medewerkerRef, {
        [fieldName]: currentValue,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Fout bij bijwerken:', error);
    }
  };

  const handleCancel = () => {
    setCurrentValue(value || '');
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between border-b py-2 text-xs">
      <div className="flex-1 min-w-0">
        <p className="font-bold uppercase tracking-widest text-[9px] text-slate-400 mb-0.5">{label}</p>
        {isEditing ? (
          <div className="flex items-center gap-2 pr-2">
            <Input
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="h-7 text-xs font-bold"
              autoFocus
            />
          </div>
        ) : (
          <p className="text-sm font-black text-slate-900 truncate">{currentValue || '-'}</p>
        )}
      </div>
      {canEdit && <div className="flex items-center gap-1 ml-2">
        {isEditing ? (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-green-600 hover:bg-green-50" onClick={handleSave}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-red-600 hover:bg-red-50" onClick={handleCancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-slate-300 hover:text-primary" onClick={() => setIsEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>}
    </div>
  );
}

type AbsencePeriod = {
  id: string;
  type: string;
  status: 'In behandeling' | 'Goedgekeurd' | 'Afgekeurd' | undefined;
  startDate: Date;
  endDate: Date;
  diensten: Dienst[];
};

function AfwezigheidTab({ canEdit, medewerker, onSuccess, refreshId }: { canEdit: boolean, medewerker: Medewerker, onSuccess: () => void, refreshId: number }) {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const firestore = useFirestore();
  const [absences, setAbsences] = React.useState<Dienst[]>([]);
  const [allCompanyAbsences, setAllCompanyAbsences] = React.useState<Dienst[]>([]);
  const [allMedewerkers, setAllMedewerkers] = React.useState<Medewerker[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const end = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start, end });
  const weekNumber = getISOWeek(currentDate);

  const prevWeek = () => setCurrentDate(sub(currentDate, { weeks: 1 }));
  const nextWeek = () => setCurrentDate(add(currentDate, { weeks: 1 }));
  const goToToday = () => setCurrentDate(new Date());

  React.useEffect(() => {
    const fetchData = async () => {
      if (!firestore) return;
      setIsLoading(true);

      const projectsCol = collection(firestore, 'projects');
      const medewerkersCol = collection(firestore, 'medewerkers');
      
      try {
        const [projectsSnapshot, medewerkersSnapshot] = await Promise.all([
          getDocs(projectsCol),
          getDocs(medewerkersCol)
        ]);
        
        const medewerkersList = medewerkersSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Medewerker));
        setAllMedewerkers(medewerkersList);

        const allAbsencesPromises = projectsSnapshot.docs.map(projectDoc => {
          const dienstenCol = collection(firestore, 'projects', projectDoc.id, 'diensten');
          const q = query(
            dienstenCol,
            where('werksoort', 'in', ['Verlof', 'ADV', 'Ziek'])
          );
          return getDocs(q);
        });

        const allDienstenSnapshots = await Promise.all(allAbsencesPromises);
        
        const companyAbsences: Dienst[] = [];
        allDienstenSnapshots.forEach((dienstenSnapshot, i) => {
          const projectId = projectsSnapshot.docs[i].id;
          dienstenSnapshot.forEach(dienstDoc => {
            companyAbsences.push({ ...dienstDoc.data(), id: dienstDoc.id, projectId: projectId } as Dienst);
          });
        });

        const employeeAbsences = companyAbsences.filter(d => d.medewerkerId === medewerker.id);

        setAbsences(employeeAbsences.sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime()));
        setAllCompanyAbsences(companyAbsences);
      } catch (e) {
        console.error("Failed to fetch absence data:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [firestore, medewerker.id, refreshId]);

  const groupedAbsences = React.useMemo((): AbsencePeriod[] => {
    if (!absences || absences.length === 0) return [];
    
    const sorted = [...absences].sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime());
    
    const periods: AbsencePeriod[] = [];
    let currentPeriod: AbsencePeriod | null = null;
    
    sorted.forEach(absence => {
      const absenceDate = new Date(absence.datum);
      if (!currentPeriod) {
        currentPeriod = {
          id: absence.id,
          type: absence.werksoort,
          status: absence.goedkeuringStatus,
          startDate: absenceDate,
          endDate: absenceDate,
          diensten: [absence],
        };
      } else {
        const nextDay = addDays(currentPeriod.endDate, 1);
        if (
          isSameDay(absenceDate, nextDay) &&
          absence.werksoort === currentPeriod.type &&
          absence.goedkeuringStatus === currentPeriod.status
        ) {
          currentPeriod.endDate = absenceDate;
          currentPeriod.diensten.push(absence);
        } else {
          periods.push(currentPeriod);
          currentPeriod = {
            id: absence.id,
            type: absence.werksoort,
            status: absence.goedkeuringStatus,
            startDate: absenceDate,
            endDate: absenceDate,
            diensten: [absence],
          };
        }
      }
    });

    if (currentPeriod) {
      periods.push(currentPeriod);
    }
    
    return periods;
  }, [absences]);
  
  const today = startOfDay(new Date());
  
  const aanvragenPeriods = groupedAbsences.filter(p => (p.status === 'In behandeling' || p.status === undefined));
  const nagekekenPeriods = groupedAbsences.filter(p => (p.status === 'Goedgekeurd' || p.status === 'Afgekeurd') && !isAfter(today, p.endDate));
  const verledenPeriods = groupedAbsences.filter(p => isAfter(today, p.endDate));

  const handleDeletePeriod = async (period: AbsencePeriod) => {
    if (!firestore) return;
    const batch = writeBatch(firestore);
    period.diensten.forEach(dienst => {
      if (dienst.projectId) {
        const dienstRef = doc(firestore, 'projects', dienst.projectId, 'diensten', dienst.id);
        batch.delete(dienstRef);
      }
    });
    await batch.commit();
    onSuccess();
  };

  const handleUpdateStatus = async (period: AbsencePeriod, status: 'Goedgekeurd' | 'Afgekeurd') => {
    if (!firestore) return;
    const batch = writeBatch(firestore);
    period.diensten.forEach(dienst => {
        if (dienst.projectId) {
            const dienstRef = doc(firestore, 'projects', dienst.projectId, 'diensten', dienst.id);
            batch.update(dienstRef, { goedkeuringStatus: status });
        }
    });
    await batch.commit();
    onSuccess();
  };
  
  const renderPeriod = (period: AbsencePeriod) => {
    const isSingleDay = isSameDay(period.startDate, period.endDate);
    const dateString = isSingleDay
      ? format(period.startDate, 'eeee d MMMM yyyy', { locale: nl })
      : `${format(period.startDate, 'd MMM')} - ${format(period.endDate, 'd MMM yyyy', { locale: nl })}`;

    let statusBadge: React.ReactNode = null;
    if(period.status) {
        let variant: 'default' | 'secondary' | 'destructive' = 'secondary';
        let icon: React.ReactNode = null;
        if(period.status === 'Goedgekeurd') {
            variant = 'default';
            icon = <CheckCircle className="h-3 w-3 mr-1.5" />
        } else if (period.status === 'Afgekeurd') {
            variant = 'destructive';
            icon = <XCircle className="h-3 w-3 mr-1.5" />
        } else if (period.status === 'In behandeling') {
            variant = 'secondary';
            icon = <Clock className="h-3 w-3 mr-1.5" />
        }
        statusBadge = <Badge variant={variant} className="capitalize">{icon} {period.status}</Badge>;
    }

    const medewerkersMap = new Map(allMedewerkers.map(m => [m.id, m]));

    const overlappingAbsences = allCompanyAbsences.filter(absence => {
        if (absence.medewerkerId === medewerker.id) return false;
        
        const absenceDate = new Date(absence.datum);
        const periodStartDate = startOfDay(period.startDate);
        const periodEndDate = endOfDay(period.endDate);

        return absenceDate >= periodStartDate && absenceDate <= periodEndDate;
    });

    const otherEmployeesWithAbsence = [...new Set(overlappingAbsences.map(a => a.medewerkerId))];

    return (
        <div key={period.id} className="flex flex-col p-4 rounded-2xl border bg-slate-50/50 shadow-sm gap-3">
            <div className="flex justify-between items-center">
                <div className="flex-1">
                    <p className="font-black uppercase tracking-tight text-slate-900">{period.type}</p>
                    <p className="text-xs font-bold text-slate-400 mt-0.5">{dateString}</p>
                    <div className="mt-2">{statusBadge}</div>
                </div>
                <div className="flex items-center gap-1">
                {canEdit && period.status === 'In behandeling' && (
                    <>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-green-600 hover:bg-green-50" onClick={() => handleUpdateStatus(period, 'Goedgekeurd')}><ThumbsUp className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-red-600 hover:bg-red-50" onClick={() => handleUpdateStatus(period, 'Afgekeurd')}><ThumbsDown className="h-4 w-4" /></Button>
                    </>
                )}
                {canEdit && <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-slate-300 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeletePeriod(period)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
            </div>
            {otherEmployeesWithAbsence.length > 0 && (
                <div className="mt-2 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><Users className="h-3 w-3" />Gelijktijdige afwezigheid:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {otherEmployeesWithAbsence.map(medewerkerId => {
                            const otherMedewerker = medewerkersMap.get(medewerkerId);
                            return (
                                <Badge key={medewerkerId} variant="outline" className="font-black text-[9px] uppercase tracking-tighter bg-white border-slate-200">
                                    {otherMedewerker ? `${otherMedewerker.voornaam || ''} ${otherMedewerker.achternaam || ''}`.trim() : 'Onbekend'}
                                </Badge>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="rounded-2xl shadow-sm border-slate-100">
            <CardContent className="p-4 md:p-6">
              <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={prevWeek}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" className="h-8 px-4 text-xs font-black uppercase tracking-widest" onClick={goToToday}>Vandaag</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={nextWeek}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
                  <span className="text-slate-900">{format(start, 'd MMM')} - {format(end, 'd MMM yyyy', { locale: nl })}</span>
                  <Badge variant="outline" className="font-black border-slate-200 text-slate-400">Week {weekNumber}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day) => (
                  <div key={day.toISOString()} className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {format(day, 'eee', { locale: nl })}
                  </div>
                ))}
                {weekDays.map((day) => (
                  <div 
                    key={day.toISOString()} 
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      'p-2 border-2 rounded-xl h-16 md:h-20 cursor-pointer flex flex-col items-center justify-center transition-all', 
                      isSameDay(day, selectedDate) ? 'bg-primary border-primary shadow-lg shadow-primary/20' : 'bg-white border-slate-100 hover:border-slate-200',
                      isToday(day) && !isSameDay(day, selectedDate) && 'ring-2 ring-primary/20'
                    )}
                  >
                    <span className={cn(
                      "text-lg font-black",
                       isSameDay(day, selectedDate) ? 'text-white' : (isToday(day) ? 'text-primary' : 'text-slate-900')
                      )}>{format(day, 'd')}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 mt-6 text-[10px] font-black uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-slate-500">Goedgekeurd</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="text-slate-500">In behandeling</span>
                </div>
                <Button variant="link" size="sm" className="h-auto p-0 text-[10px] font-black uppercase tracking-widest text-primary">
                  <CalendarDays className="h-3 w-3 mr-1.5" />
                  Kalender export
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border-slate-100 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b p-4 md:p-6">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Verlof & Afwezigheid</CardTitle>
                {canEdit && (
                    <AfwezigheidDialog medewerker={medewerker} onSuccess={onSuccess}>
                      <Button size="sm" className="w-full sm:w-auto h-9 font-black uppercase tracking-tight"><Plus className="h-4 w-4 mr-2" />Toevoegen</Button>
                    </AfwezigheidDialog>
                  )}
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              <Tabs defaultValue="aanvragen" className="w-full">
                <TabsList className="grid grid-cols-3 w-full bg-slate-100 p-1 rounded-xl h-11">
                    <TabsTrigger value="aanvragen" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Aanvragen</TabsTrigger>
                    <TabsTrigger value="nagekeken" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Historie</TabsTrigger>
                    <TabsTrigger value="verleden" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Archief</TabsTrigger>
                </TabsList>
                
                <TabsContent value="aanvragen" className="mt-6">
                  {isLoading ? (
                    <div className='flex justify-center items-center py-12'><Loader2 className='h-8 w-8 animate-spin text-primary' /></div>
                  ) : aanvragenPeriods.length > 0 ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {aanvragenPeriods.map(renderPeriod)}
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                      <CalendarDays className="h-12 w-12 mx-auto mb-4 text-slate-200" />
                      <p className="font-black uppercase text-[10px] tracking-widest text-slate-400">Geen openstaande aanvragen</p>
                    </div>
                  )}
                </TabsContent>
                 <TabsContent value="nagekeken" className="mt-6">
                  {isLoading ? (
                    <div className='flex justify-center items-center py-12'><Loader2 className='h-8 w-8 animate-spin text-primary' /></div>
                  ) : nagekekenPeriods.length > 0 ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {nagekekenPeriods.map(renderPeriod)}
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                      <p className="font-black uppercase text-[10px] tracking-widest text-slate-400">Geen recente afwezigheid</p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="verleden" className="mt-6">
                    {isLoading ? (
                         <div className='flex justify-center items-center py-12'><Loader2 className='h-8 w-8 animate-spin text-primary' /></div>
                    ) : verledenPeriods.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                           {verledenPeriods.map(renderPeriod)}
                        </div>
                    ) : (
                        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                            <p className="font-black uppercase text-[10px] tracking-widest text-slate-400">Archief is leeg</p>
                        </div>
                    )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="rounded-2xl shadow-sm border-slate-100 overflow-hidden sticky top-6">
            <CardHeader className="bg-slate-50/50 border-b p-4 md:p-6">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Uren Saldo's</CardTitle>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Huidig boekjaar</p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Verlof</p>
                    <p className="text-2xl font-black text-slate-900 leading-none">0u 0m</p>
                </div>
                <Badge variant="secondary" className="h-6 px-2 font-bold text-[10px] uppercase bg-green-50 text-green-600 border-none">Resterend</Badge>
              </div>
               <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">ADV</p>
                    <p className="text-2xl font-black text-slate-900 leading-none">0u 0m</p>
                </div>
                <Badge variant="secondary" className="h-6 px-2 font-bold text-[10px] uppercase bg-slate-100 text-slate-500 border-none">Resterend</Badge>
              </div>
               <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Tijd-voor-Tijd</p>
                    <p className="text-2xl font-black text-slate-900 leading-none">0u 0m</p>
                </div>
                <Badge variant="secondary" className="h-6 px-2 font-bold text-[10px] uppercase bg-blue-50 text-blue-600 border-none">Saldo</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RoosterTab({ medewerker, refreshId }: { medewerker: Medewerker; refreshId: number; }) {
  const firestore = useFirestore();
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [diensten, setDiensten] = React.useState<Record<string, Dienst[]>>({});

  React.useEffect(() => {
    const fetchDiensten = async () => {
      if (!firestore) return;
      
      const firstDayOfMonth = startOfMonth(currentDate);
      const lastDayOfMonth = endOfMonth(currentDate);
      
      setDiensten({});

      const projectsCol = collection(firestore, 'projects');
      const projectsSnapshot = await getDocs(projectsCol);

      const allDiensten: Dienst[] = [];

      for (const projectDoc of projectsSnapshot.docs) {
        const dienstenCol = collection(firestore, 'projects', projectDoc.id, 'diensten');
        // Simplified query to avoid composite index
        const q = query(dienstenCol, where('medewerkerId', '==', medewerker.id));
        const dienstenSnapshot = await getDocs(q);
        
        dienstenSnapshot.forEach(dienstDoc => {
          const dienstData = { id: dienstDoc.id, ...dienstDoc.data() } as Dienst;
          const dienstDatum = new Date(dienstData.datum);
          
          // Client-side filtering for the current month
          if (dienstDatum >= firstDayOfMonth && dienstDatum <= lastDayOfMonth) {
            allDiensten.push(dienstData);
          }
        });
      }

      const groupedDiensten = allDiensten.reduce((acc, dienst) => {
        const dateKey = dienst.datum;
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(dienst);
        return acc;
      }, {} as Record<string, Dienst[]>);

      setDiensten(groupedDiensten);
    };

    fetchDiensten();
  }, [firestore, currentDate, medewerker.id, refreshId]);

  const firstDayOfMonth = startOfMonth(currentDate);
  const lastDayOfMonth = endOfMonth(currentDate);
  const prevMonth = () => setCurrentDate(sub(currentDate, { months: 1 }));
  const nextMonth = () => setCurrentDate(add(currentDate, { months: 1 }));

  const weeks = eachWeekOfInterval(
    {
      start: firstDayOfMonth,
      end: lastDayOfMonth,
    },
    { weekStartsOn: 1 }
  );

  const daysOfWeek = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

  return (
    <div className="p-4 md:p-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className='flex items-center gap-4'>
            <h2 className="text-xl font-black uppercase tracking-tight">
            {format(currentDate, 'MMMM yyyy', { locale: nl })}
            </h2>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none font-bold h-10">Acties</Button>
            <Button className="flex-1 sm:flex-none font-black uppercase tracking-tight h-10">
                <Plus className='h-4 w-4 mr-2'/>
                Beschikbaarheid
            </Button>
        </div>
      </div>
      <div className="flex-1 border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-slate-50">
        <div className="grid grid-rows-[auto_1fr] min-w-[800px] h-full">
          <div className="grid grid-cols-7 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 py-3 border-b-2 border-slate-200">
            {daysOfWeek.map((day) => (
              <div key={day} className="text-center">{day}</div>
            ))}
          </div>
          <div className="overflow-y-auto no-scrollbar">
            {weeks.map((weekStart, weekIndex) => {
                const daysInWeek = eachDayOfInterval({start: weekStart, end: endOfWeek(weekStart, {weekStartsOn: 1})})
                return (
                  <div key={weekIndex} className="grid grid-cols-7 border-b border-slate-100 last:border-0 min-h-[120px]">
                    {daysInWeek.map((day) => {
                      const dateKey = format(day, 'yyyy-MM-dd');
                      const dayDiensten = diensten[dateKey] || [];
                      const isCurrentMonth = isSameMonth(day, currentDate);
                      
                      const dayName = format(day, 'eeee', { locale: nl }).toLowerCase() as keyof NonNullable<Medewerker['urenPerDag']>;
                      const isWeekend = dayName === 'zaterdag' || dayName === 'zondag';
                      const defaultUren = {
                          maandag: { start: '07:00', eind: '15:30' },
                          dinsdag: { start: '07:00', eind: '15:30' },
                          woensdag: { start: '07:00', eind: '15:30' },
                          donderdag: { start: '07:00', eind: '15:30' },
                          vrijdag: { start: '07:00', eind: '15:30' },
                          zaterdag: { start: '', eind: '' },
                          zondag: { start: '', eind: '' }
                      };
                      const urenPerDag = { ...defaultUren };
                      if (medewerker.urenPerDag) {
                          for (const d of Object.keys(defaultUren)) {
                              const dayKey = d as keyof typeof defaultUren;
                              if (medewerker.urenPerDag[dayKey]) {
                                  urenPerDag[dayKey] = { ...urenPerDag[dayKey], ...medewerker.urenPerDag[dayKey] };
                              }
                          }
                      }

                      const dagUren = urenPerDag[dayName];
                      const isNonWorkingDay = !dagUren || !dagUren.start || !dagUren.eind;
                      const isVisuallyNonWorkingDay = isNonWorkingDay && !isWeekend;

                      return (
                          <div key={day.toISOString()} className={cn(
                            "p-2 border-r border-slate-100 last:border-0 transition-colors",
                            isVisuallyNonWorkingDay ? 'bg-slate-900/90' : (isCurrentMonth ? 'bg-white hover:bg-slate-50/50' : 'bg-slate-50/30 opacity-40')
                          )}>
                              <div className="flex justify-between items-start mb-2">
                                <span className={cn(
                                    'text-xs font-black p-1 min-w-[24px] h-6 flex items-center justify-center rounded-lg',
                                    isToday(day) ? 'bg-primary text-white shadow-md' : (isVisuallyNonWorkingDay ? 'text-white/30' : 'text-slate-400')
                                )}>
                                    {format(day, 'd')}
                                </span>
                              </div>
                              <div className="space-y-1.5">
                                  {dayDiensten.map(dienst => {
                                      const isZiek = dienst.werksoort === 'Ziek';
                                      const isVerlof = dienst.werksoort === 'Verlof' || dienst.werksoort === 'ADV';
                                      const isPending = (isVerlof || isZiek) && (dienst.goedkeuringStatus === 'In behandeling' || typeof dienst.goedkeuringStatus === 'undefined');
                                      return (
                                          <div key={dienst.id} className={cn(
                                              "rounded-xl p-2 text-[10px] font-bold leading-tight shadow-sm border-2",
                                              isZiek 
                                                  ? "bg-red-50 text-red-700 border-red-100"
                                              : isVerlof
                                                  ? "bg-orange-50 text-orange-700 border-orange-100"
                                              : isVisuallyNonWorkingDay
                                                  ? 'border-white/10 text-white bg-transparent'
                                                  : "bg-blue-50 text-blue-700 border-blue-100",
                                              isPending && "border-yellow-400 border-dashed"
                                          )}>
                                              <p className="font-black uppercase tracking-tighter truncate">{dienst.werksoort}</p>
                                              <p className="opacity-70 mt-0.5">{dienst.starttijd}-{dienst.eindtijd}</p>
                                              {isPending && (
                                                <div className="flex items-center gap-1 mt-1 text-yellow-600">
                                                    <Clock className="h-2.5 w-2.5" />
                                                    <span className="uppercase text-[8px] font-black">Wacht</span>
                                                </div>
                                              )}
                                          </div>
                                      )
                                  })}
                              </div>
                          </div>
                      )
                    })}
                  </div>
                )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function ContractenTab({ canEdit }: { canEdit: boolean }) {
  // Placeholder data
  const contracts: any[] = [];
  const isMobile = useIsMobile();

  return (
    <div className="p-4 md:p-6">
      <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50 border-b p-4 md:p-6">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Contractbeheer</CardTitle>
            <Info className="h-4 w-4 text-slate-300" />
          </div>
          {canEdit && <Button size="sm" className="font-black h-9 uppercase tracking-tight">
            <Plus className="mr-2 h-4 w-4" /> Toevoegen
          </Button>}
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {contracts.length === 0 ? (
            <div className="p-16 text-center text-muted-foreground bg-white">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-10" />
                <p className="font-black uppercase text-xs tracking-widest text-slate-300">Geen actieve contracten gevonden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
                <div className="min-w-[1000px] border rounded-xl overflow-hidden">
                    {/* Contract list logic here if needed */}
                </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const firestore = useFirestore();
  const id = params.id as string;
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const { profile, isLoading: isProfileLoading } = useProfile();
  const [refreshId, setRefreshId] = React.useState(0);
  
  const handleAbsenceSuccess = () => setRefreshId(id => id + 1);

  const isSuperUser = profile?.role === 'Super admin';
  const canEdit = isSuperUser || !!profile?.permissions?.employees?.edit;

  const employeeRef = React.useMemo(() => {
    if (!firestore || !id) return null;
    return doc(firestore, 'medewerkers', id);
  }, [firestore, id]);

  const { data: medewerker, isLoading } = useDoc<Medewerker>(employeeRef);
  

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };
  
  const handleEdit = () => {
    setIsDialogOpen(true);
  };
  
  const canViewTab = (tabId: string) => {
    if (isSuperUser) return true;
    return profile?.permissions?.employees?.tabs?.[tabId] ?? true;
  };

  if (isLoading || isProfileLoading) {
    return <LoadingScreen message="Medewerker laden..." />;
  }

  if (!medewerker) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-12 text-center bg-slate-50">
        <Users className="h-16 w-16 text-slate-200 mb-4" />
        <p className="font-black uppercase tracking-tight text-slate-900 text-lg">Medewerker niet gevonden</p>
        <Button onClick={() => router.back()} className="mt-6 font-bold">
          <ArrowLeft className="mr-2 h-4 w-4" /> Ga terug
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-white">
      <div className="p-4 md:p-8 bg-slate-50 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="shrink-0 rounded-full h-10 w-10 shadow-sm border-slate-200">
                <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="h-16 w-16 border-4 border-white shadow-xl ring-1 ring-slate-100">
                <AvatarImage
                src={medewerker.avatarUrl}
                alt={`${medewerker.voornaam} ${medewerker.achternaam}`}
                />
                <AvatarFallback className="text-xl font-black bg-primary text-white">
                {getInitials(medewerker.voornaam, medewerker.achternaam)}
                </AvatarFallback>
            </Avatar>
          </div>
          <div className='flex-1 flex flex-col sm:flex-row justify-between items-center w-full gap-4'>
            <div className="text-center sm:text-left">
                <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none mb-1">{`${medewerker.voornaam || ''} ${
                medewerker.tussenvoegsel || ''
                } ${medewerker.achternaam || ''}`.trim()}</h1>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{medewerker.functie || 'Functie niet ingesteld'}</p>
            </div>
            {canEdit && <Button onClick={handleEdit} className="font-black uppercase tracking-tight h-11 px-8">
                <Pencil className="mr-2 h-4 w-4" />
                Bewerken
            </Button>}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <Tabs defaultValue="overzicht" className="flex-1 flex flex-col min-h-0">
          <div className="px-4 md:px-8 pt-4 overflow-x-auto no-scrollbar border-b border-slate-100">
            <TabsList className="w-max inline-flex">
              {canViewTab('overzicht') && <TabsTrigger value="overzicht">Overzicht</TabsTrigger>}
              {canViewTab('afwezigheid') && <TabsTrigger value="afwezigheid">Afwezigheid</TabsTrigger>}
              {canViewTab('rooster') && <TabsTrigger value="rooster">Rooster</TabsTrigger>}
              {canViewTab('contracten') && <TabsTrigger value="contracten">Contracten</TabsTrigger>}
            </TabsList>
          </div>
          {canViewTab('overzicht') && <TabsContent value="overzicht" className="flex-1 overflow-y-auto bg-slate-50/30">
             <div className="p-4 md:p-8 space-y-8">
                <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                  <CardHeader className="bg-slate-50/50 border-b p-4 md:p-6">
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Persoonsgegevens & Contact</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-12 gap-y-6 p-6">
                    <div className="space-y-4">
                      <DetailField label="Voornaam" value={medewerker.voornaam} fieldName="voornaam" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Tussenvoegsel" value={medewerker.tussenvoegsel} fieldName="tussenvoegsel" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Achternaam" value={medewerker.achternaam} fieldName="achternaam" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Geboortedatum" value={medewerker.geboortedatum} fieldName="geboortedatum" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Geboorteplaats" value={medewerker.geboorteplaats} fieldName="geboorteplaats" medewerkerId={id} canEdit={canEdit} />
                    </div>
                    <div className="space-y-4">
                      <DetailField label="Telefoonnr." value={medewerker.telefoonnummer} fieldName="telefoonnummer" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Mobiel nr." value={medewerker.mobiel} fieldName="mobiel" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Nood nr." value={medewerker.noodnummer} fieldName="noodnummer" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Adres" value={medewerker.adres} fieldName="adres" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Plaats" value={`${medewerker.postcode || ''} ${medewerker.plaats || ''}`.trim()} fieldName="plaats" medewerkerId={id} canEdit={canEdit} />
                    </div>
                    <div className="space-y-4">
                      <DetailField label="Nationaliteit" value={medewerker.nationaliteit} fieldName="nationaliteit" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="BSN" value={medewerker.bsn} fieldName="bsn" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="ID/Paspoort nr." value={medewerker.paspoortnummer} fieldName="paspoortnummer" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Bankrekening" value={medewerker.bankrekening} fieldName="bankrekening" medewerkerId={id} canEdit={canEdit} />
                      <DetailField label="Indiensttreding" value={medewerker.indiensttreding} fieldName="indiensttreding" medewerkerId={id} canEdit={canEdit} />
                    </div>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50 border-b p-4 md:p-6">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Documenten</CardTitle>
                      {canEdit && <Button size="icon" variant="ghost" className="h-8 w-8 text-primary"><Plus className="h-4 w-4" /></Button>}
                    </CardHeader>
                    <CardContent className="flex min-h-[160px] items-center justify-center p-6">
                      <div className="text-center opacity-20">
                        <Paperclip className="mx-auto h-8 w-8 mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Geen bestanden</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50 border-b p-4 md:p-6">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Opmerkingen</CardTitle>
                      {canEdit && <Button size="icon" variant="ghost" className="h-8 w-8 text-primary"><Plus className="h-4 w-4" /></Button>}
                    </CardHeader>
                    <CardContent className="flex min-h-[160px] items-center justify-center p-6">
                      <div className="text-center opacity-20">
                        <FileText className="mx-auto h-8 w-8 mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Geen opmerkingen</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
            </div>
          </TabsContent>}
          {canViewTab('afwezigheid') && <TabsContent value="afwezigheid" className="flex-1 overflow-y-auto bg-slate-50/30">
            {medewerker && <AfwezigheidTab canEdit={canEdit} medewerker={medewerker} onSuccess={handleAbsenceSuccess} refreshId={refreshId} />}
          </TabsContent>}
          {canViewTab('rooster') && <TabsContent value="rooster" className="flex-1 overflow-y-auto bg-slate-50/30">
            <RoosterTab medewerker={medewerker} refreshId={refreshId} />
          </TabsContent>}
          {canViewTab('contracten') && <TabsContent value="contracten" className="flex-1 overflow-y-auto bg-slate-50/30">
             <ContractenTab canEdit={canEdit}/>
          </TabsContent>}
        </Tabs>
      </div>
       <MedewerkerDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        medewerker={medewerker}
      />
    </div>
  );
}
