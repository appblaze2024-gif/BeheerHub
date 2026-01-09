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
import { collection, query, where } from 'firebase/firestore';

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
  useCollection,
  useFirestore,
} from '@/firebase';
import type { Medewerker, Dienst } from '@/lib/types';
import { DienstToevoegenDialog } from '@/components/dienst-toevoegen-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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

type DialogState = {
  open: boolean;
  medewerker?: Medewerker;
  datum?: Date;
  dienst?: Dienst;
}

export default function WorkPlanningPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | undefined>();
  const [dialogState, setDialogState] = React.useState<DialogState>({ open: false });
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

  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const end = endOfWeek(currentDate, { weekStartsOn: 1 });
  
  const dienstenQuery = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    return query(
        collection(firestore, 'projects', selectedProjectId, 'diensten'),
        where('datum', '>=', format(start, 'yyyy-MM-dd')),
        where('datum', '<=', format(end, 'yyyy-MM-dd'))
    );
  }, [firestore, selectedProjectId, start, end]);

  const { data: diensten, isLoading: isLoadingDiensten } = useCollection<Dienst>(dienstenQuery);
  

  const weekDays = eachDayOfInterval({ start, end });

  const prevWeek = () => setCurrentDate(sub(currentDate, { weeks: 1 }));
  const nextWeek = () => setCurrentDate(add(currentDate, { weeks: 1 }));
  
  const openNewDienstDialog = (medewerker: Medewerker, datum: Date) => {
    setDialogState({ open: true, medewerker, datum, dienst: undefined });
  }
  
  const openEditDienstDialog = (dienst: Dienst, medewerker: Medewerker) => {
    setDialogState({ open: true, medewerker, datum: new Date(dienst.datum), dienst });
  }
  
  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

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
            <div className="col-span-8 p-4 text-center text-muted-foreground">
              Medewerkers laden...
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
                  return (
                    <div
                        key={day.toISOString()}
                        className="group relative p-2 border-b border-r min-h-[80px] flex flex-col gap-1"
                    >
                        <div className="flex-1 space-y-1">
                          {dienstenForDay?.map(dienst => (
                              <div key={dienst.id} 
                                   onClick={() => openEditDienstDialog(dienst, medewerker)}
                                   className="bg-secondary text-secondary-foreground rounded-md p-2 text-xs cursor-pointer hover:bg-secondary/80"
                              >
                                  <p className="font-semibold truncate">{dienst.starttijd} - {dienst.eindtijd}</p>
                                  <p className="truncate">{dienst.werksoort}</p>
                              </div>
                          ))}
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn(
                                "h-7 w-7 self-center opacity-0 group-hover:opacity-100 transition-opacity"
                            )}
                            onClick={() => openNewDienstDialog(medewerker, day)}
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
      {dialogState.open && selectedProject && dialogState.medewerker && dialogState.datum && (
        <DienstToevoegenDialog 
            open={dialogState.open}
            onOpenChange={(open) => setDialogState({ ...dialogState, open })}
            medewerker={dialogState.medewerker}
            datum={dialogState.datum}
            project={selectedProject}
            dienst={dialogState.dienst}
        />
      )}
    </div>
  );
}
