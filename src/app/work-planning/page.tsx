'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  add,
  sub,
  isSameDay,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { collection, query, where, doc, getDocs, updateDoc } from 'firebase/firestore';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useFirestore,
  useDoc,
  useCollection
} from '@/firebase';
import type { Medewerker, Dienst, Voertuig } from '@/lib/types';
import { DienstToevoegenSheet } from '@/components/dienst-toevoegen-sheet';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
};

const getWeekContractHours = (medewerker: Medewerker): number => {
    if (!medewerker || !medewerker.urenPerDag) {
      return 40;
    }
    const { maandag = 0, dinsdag = 0, woensdag = 0, donderdag = 0, vrijdag = 0, zaterdag = 0, zondag = 0 } = medewerker.urenPerDag;
    return maandag + dinsdag + woensdag + donderdag + vrijdag + zaterdag + zondag;
};

const formatHours = (totalHours: number) => {
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);
    return `${hours},${minutes.toString().padStart(2, '0')}u`;
};

type Project = {
  id: string;
  projectnaam: string;
  projectnummer: string;
};

const DienstItem = ({ dienst, onEdit }: { dienst: Dienst, onEdit: (dienst: Dienst) => void}) => {
    const firestore = useFirestore();

    const medewerkerRef = React.useMemo(() => {
        if (!firestore) return null;
        return doc(firestore, 'medewerkers', dienst.medewerkerId);
    }, [firestore, dienst.medewerkerId]);
    
    const { data: medewerker } = useDoc<Medewerker>(medewerkerRef);
    
    const voertuigRef = React.useMemo(() => {
        if (!firestore || !dienst.voertuigId) return null;
        return doc(firestore, 'voertuigen', dienst.voertuigId);
    }, [firestore, dienst.voertuigId]);

    const { data: voertuig } = useDoc<Voertuig>(voertuigRef);

    const handleEdit = () => {
        if (medewerker) {
            onEdit(dienst);
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData('application/json', JSON.stringify(dienst));
      e.currentTarget.style.opacity = '0.5';
    }

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.style.opacity = '1';
    }
    
    const isZiek = dienst.werksoort === 'Ziek';
    const isVerlof = dienst.werksoort === 'Verlof' || dienst.werksoort === 'ATV';

    return (
        <div 
            onClick={handleEdit}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={cn(
                "rounded-md p-2 text-xs cursor-pointer",
                 isZiek 
                    ? "bg-red-200 text-red-900 hover:bg-red-300 dark:bg-red-900/50 dark:text-white dark:hover:bg-red-900/70"
                 : isVerlof
                    ? "bg-orange-200 text-orange-900 hover:bg-orange-300 dark:bg-orange-900/50 dark:text-white dark:hover:bg-orange-900/70"
                    : "bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-white dark:hover:bg-blue-900/70"
            )}
        >
            <p className="font-semibold truncate">{dienst.werksoort}</p>
            <p className="truncate">{dienst.starttijd} - {dienst.eindtijd}</p>
            {voertuig && voertuig.voertuignummer && (
                <p className="truncate">Voertuignummer: {voertuig.voertuignummer}</p>
            )}
        </div>
    );
};


export default function WorkPlanningPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | undefined>();
  
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [selectedMedewerker, setSelectedMedewerker] = React.useState<Medewerker | undefined>();
  const [selectedDay, setSelectedDay] = React.useState<Date | undefined>();
  const [selectedDienst, setSelectedDienst] = React.useState<Dienst | undefined>();
  
  const [diensten, setDiensten] = React.useState<Dienst[] | null>(null);
  const [isLoadingDiensten, setIsLoadingDiensten] = React.useState(false);
  const [dragOverCell, setDragOverCell] = React.useState<{medewerkerId: string, day: string} | null>(null);


  const firestore = useFirestore();

  const medewerkersCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'medewerkers');
  }, [firestore]);

  const { data: medewerkers, isLoading: isLoadingMedewerkers } =
    useCollection<Medewerker>(medewerkersCollection);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } =
    useCollection<Project>(projectsCollection);

  const start = React.useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const end = React.useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  
  const fetchDiensten = React.useCallback(async () => {
    if (!firestore || !selectedProjectId) {
      setDiensten([]);
      return;
    }
    setIsLoadingDiensten(true);
    const startDateString = format(start, 'yyyy-MM-dd');
    const endDateString = format(end, 'yyyy-MM-dd');

    const dienstenQuery = query(
      collection(firestore, 'projects', selectedProjectId, 'diensten'),
      where('datum', '>=', startDateString),
      where('datum', '<=', endDateString)
    );

    try {
      const querySnapshot = await getDocs(dienstenQuery);
      const dienstenData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Dienst));
      setDiensten(dienstenData);
    } catch (error) {
      console.error("Error fetching diensten: ", error);
      setDiensten([]);
    } finally {
      setIsLoadingDiensten(false);
    }
  }, [firestore, selectedProjectId, start, end]);

  React.useEffect(() => {
    fetchDiensten();
  }, [fetchDiensten]);
  
  const weekDays = eachDayOfInterval({ start, end });

  const prevWeek = () => setCurrentDate(sub(currentDate, { weeks: 1 }));
  const nextWeek = () => setCurrentDate(add(currentDate, { weeks: 1 }));
  
  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);
  
  const handleOpenSheetForNew = (medewerker: Medewerker, datum: Date) => {
    setSelectedMedewerker(medewerker);
    setSelectedDay(datum);
    setSelectedDienst(undefined);
    setIsSheetOpen(true);
  };
  
  const handleOpenSheetForEdit = (dienst: Dienst) => {
    const medewerker = medewerkers?.find(m => m.id === dienst.medewerkerId);
    setSelectedMedewerker(medewerker);
    setSelectedDay(new Date(dienst.datum));
    setSelectedDienst(dienst);
    setIsSheetOpen(true);
  };

  const handleSheetSuccess = () => {
    fetchDiensten();
    setIsSheetOpen(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, newMedewerkerId: string, newDatum: Date) => {
    e.preventDefault();
    setDragOverCell(null);

    if (!firestore) return;
    
    const dienstJson = e.dataTransfer.getData('application/json');
    if (!dienstJson) return;

    const droppedDienst: Dienst = JSON.parse(dienstJson);
    const newDatumString = format(newDatum, 'yyyy-MM-dd');

    // Only update if there's a change
    if(droppedDienst.medewerkerId === newMedewerkerId && droppedDienst.datum === newDatumString) {
      return;
    }

    try {
      const dienstRef = doc(firestore, 'projects', droppedDienst.projectId, 'diensten', droppedDienst.id);
      await updateDoc(dienstRef, {
        medewerkerId: newMedewerkerId,
        datum: newDatumString,
      });
      fetchDiensten(); // Refetch data
    } catch(error) {
      console.error("Error updating dienst:", error);
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, medewerkerId: string, day: Date) => {
    e.preventDefault();
    setDragOverCell({ medewerkerId, day: format(day, 'yyyy-MM-dd') });
  }


  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      <PageHeader title="Bezetting">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Project:
          </span>
          <Select 
            value={selectedProjectId}
            onValueChange={setSelectedProjectId}
            disabled={isLoadingProjects}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Selecteer een project" />
            </SelectTrigger>
            <SelectContent>
              {projects?.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.projectnaam} [{project.projectnummer}]
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline">Voertuigen</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevWeek}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold">
            {format(start, 'd MMMM', { locale: nl })} -{' '}
            {format(end, 'd MMMM yyyy', { locale: nl })}
          </span>
          <Button variant="ghost" size="icon" onClick={nextWeek}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button>Uren controleren</Button>
        </div>
      </PageHeader>
      <div className="flex-1 overflow-auto border-t">
        <div className="grid grid-cols-[250px_repeat(7,1fr)] min-w-[1200px]">
          {/* Header Row */}
          <div className="sticky top-0 z-10 p-2 bg-background border-b border-r"></div>
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className="sticky top-0 z-10 p-2 text-center bg-background border-b border-r"
            >
              <p className="font-semibold capitalize text-sm">
                {format(day, 'eee', { locale: nl })}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(day, 'dd-MM', { locale: nl })}
              </p>
            </div>
          ))}

          {/* Data Rows */}
          {isLoadingMedewerkers ? (
            <div className="col-span-8 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='grid grid-cols-[250px_repeat(7,1fr)]'>
                    <div className='p-3 border-b border-r'>
                        <div className="flex items-center gap-3">
                           <Skeleton className="h-8 w-8 rounded-full" />
                           <Skeleton className="h-4 w-24" />
                        </div>
                    </div>
                    {Array.from({ length: 7 }).map((_, j) => (
                         <div key={j} className="p-2 border-b border-r min-h-[80px]" />
                    ))}
                </div>
              ))}
            </div>
          ) : (
            medewerkers?.map((medewerker) => (
              <React.Fragment key={medewerker.id}>
                <div className="flex flex-col justify-center p-3 border-b border-r">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                       <AvatarImage
                            src={medewerker.avatarUrl}
                            alt={`${medewerker.voornaam} ${medewerker.achternaam}`}
                          />
                      <AvatarFallback>{getInitials(medewerker.voornaam, medewerker.achternaam)}</AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-sm truncate">{`${medewerker.voornaam || ''} ${medewerker.tussenvoegsel || ''} ${medewerker.achternaam || ''}`.trim()}</span>
                  </div>
                  <div className="mt-1 pl-11 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>0u 0m / {formatHours(getWeekContractHours(medewerker))}</span>
                    </div>
                  </div>
                </div>
                {weekDays.map((day) => {
                  const dienstenForDay = diensten?.filter(d => 
                      d.medewerkerId === medewerker.id && 
                      isSameDay(new Date(d.datum), day)
                  );
                  const isDragOver = dragOverCell?.medewerkerId === medewerker.id && dragOverCell?.day === format(day, 'yyyy-MM-dd');
                  return (
                    <div
                        key={day.toISOString()}
                        onDrop={(e) => handleDrop(e, medewerker.id, day)}
                        onDragOver={(e) => handleDragOver(e, medewerker.id, day)}
                        onDragLeave={() => setDragOverCell(null)}
                        className={cn(
                            "group relative p-2 border-b border-r min-h-[80px] flex flex-col gap-1 transition-colors",
                            isDragOver && "bg-blue-50 ring-2 ring-blue-500"
                        )}
                    >
                        <div className="flex-1 space-y-1">
                          {isLoadingDiensten ? (
                              <Skeleton className="h-10 w-full" />
                          ) : (
                            dienstenForDay?.map(dienst => (
                                <DienstItem key={dienst.id} dienst={dienst} onEdit={handleOpenSheetForEdit} />
                            ))
                          )}
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn(
                                "h-7 w-7 self-center opacity-0 group-hover:opacity-100 transition-opacity",
                                !selectedProjectId && 'hidden'
                            )}
                            onClick={() => selectedProjectId && handleOpenSheetForNew(medewerker, day)}
                            disabled={!selectedProjectId}
                        >
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    </div>
                )})}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
      <DienstToevoegenSheet
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            medewerker={selectedMedewerker}
            datum={selectedDay}
            project={selectedProject}
            dienst={selectedDienst}
            onSuccess={handleSheetSuccess}
        />
    </div>
  );
}
