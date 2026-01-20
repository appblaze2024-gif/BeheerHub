'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Clock, MoreHorizontal, Plus, Printer, Trash2, Copy } from 'lucide-react';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  add,
  sub,
  isSameDay,
  parse,
  isToday,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { collection, query, where, doc, getDocs, writeBatch } from 'firebase/firestore';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
  useCollection,
  deleteDocumentNonBlocking,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  errorEmitter,
  FirestorePermissionError,
} from '@/firebase';
import type { Medewerker, Dienst, Voertuig } from '@/lib/types';
import { DienstToevoegenDialog } from '@/components/dienst-toevoegen-dialog';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PrintDayDialog } from '@/components/print-day-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from '@/hooks/use-mobile';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';


const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
};

const getWeekContractHours = (medewerker: Medewerker): number => {
    if (!medewerker || !medewerker.urenPerDag) {
      return 40;
    }
    let totalMinutes = 0;
    for (const day in medewerker.urenPerDag) {
        const times = medewerker.urenPerDag[day as keyof typeof medewerker.urenPerDag];
        if (times && times.start && times.eind) {
            try {
                const startTijd = parse(times.start, 'HH:mm', new Date());
                const eindTijd = parse(times.eind, 'HH:mm', new Date());
                let duration = (eindTijd.getTime() - startTijd.getTime()) / (1000 * 60);
                if (duration < 0) duration += 24 * 60; // Overnight
                totalMinutes += duration;
            } catch(e) {
                // ignore parsing error
            }
        }
    }
    return totalMinutes / 60;
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
  vehicleAvailability?: {
    unavailable: Record<string, string[]>;
    available: Record<string, string[]>;
  };
};

const DienstItem = ({ dienst, onEdit, onDelete, onContextMenu, isNonWorkingDay }: { dienst: Dienst, onEdit: (dienst: Dienst) => void, onDelete: (dienst: Dienst) => void, onContextMenu: (e: React.MouseEvent, dienst: Dienst) => void, isNonWorkingDay: boolean }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

    const handleEdit = (e: React.MouseEvent) => {
        // Prevent triggering edit when clicking delete button
        if ((e.target as HTMLElement).closest('.delete-button')) {
            return;
        }
        onEdit(dienst);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData('application/json', JSON.stringify(dienst));
      e.currentTarget.style.opacity = '0.5';
    }

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.style.opacity = '1';
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            setShowDeleteConfirm(true);
        }
    };
    
    const isZiek = dienst.werksoort === 'Ziek';
    const isVerlof = dienst.werksoort === 'Verlof' || dienst.werksoort === 'ADV';

    return (
        <>
            <div 
                onClick={handleEdit}
                onKeyDown={handleKeyDown}
                onContextMenu={(e) => onContextMenu(e, dienst)}
                tabIndex={0}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                className={cn(
                    "rounded-md p-2 text-xs cursor-pointer relative group/dienst focus:outline-none focus:ring-2 focus:ring-primary",
                     isZiek 
                        ? "bg-yellow-200 text-yellow-900 hover:bg-yellow-300 dark:bg-yellow-900/50 dark:text-white dark:hover:bg-yellow-900/70"
                     : isVerlof
                        ? "bg-orange-200 text-orange-900 hover:bg-orange-300 dark:bg-orange-900/50 dark:text-white dark:hover:bg-orange-900/70"
                        : isNonWorkingDay
                            ? 'border border-gray-600 text-gray-200 bg-transparent'
                            : "bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-white dark:hover:bg-blue-900/70"
                )}
            >
                <p className="font-semibold truncate">{dienst.werksoort}</p>
                <p className="truncate">{dienst.starttijd} - {dienst.eindtijd}</p>
                {dienst.voertuignummer && (
                    <p className="truncate">Voertuignummer: {dienst.voertuignummer}</p>
                )}
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="delete-button absolute top-0 right-0 h-6 w-6 opacity-0 group-hover/dienst:opacity-100 focus:opacity-100"
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent opening edit sheet
                        setShowDeleteConfirm(true);
                    }}
                >
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
            </div>
             <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deze actie kan niet ongedaan worden gemaakt. Dit zal de dienst permanent verwijderen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(dienst)}>
                        Doorgaan
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};


export default function WorkPlanningPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [isPrintDayDialogOpen, setIsPrintDayDialogOpen] = React.useState(false);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | undefined>();
  
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [selectedMedewerker, setSelectedMedewerker] = React.useState<Medewerker | undefined>();
  const [selectedDay, setSelectedDay] = React.useState<Date | undefined>();
  const [selectedDienst, setSelectedDienst] = React.useState<Dienst | undefined>();
  
  const [diensten, setDiensten] = React.useState<Dienst[] | null>(null);
  const [isLoadingDiensten, setIsLoadingDiensten] = React.useState(false);
  const [dragOverCell, setDragOverCell] = React.useState<{medewerkerId: string, day: string} | null>(null);
  const isTablet = useIsMobile(1024);

  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    dienst?: Dienst;
    cellContext?: { medewerker: Medewerker; datum: Date };
  } | null>(null);
  const [copiedDienst, setCopiedDienst] = React.useState<Dienst | null>(null);
  const [selectedCells, setSelectedCells] = React.useState<{ medewerkerId: string; datum: string }[]>([]);
  const [unavailableVehicles, setUnavailableVehicles] = React.useState<Record<string, string[]>>({});
  const [availableVehicles, setAvailableVehicles] = React.useState<Record<string, string[]>>({});
  const isFirestoreDataLoaded = React.useRef(false);


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

  const voertuigenCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'voertuigen');
  }, [firestore]);

  const { data: voertuigen, isLoading: isLoadingVoertuigen } = useCollection<Voertuig>(voertuigenCollection);


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
      const contextualError = new FirestorePermissionError({
        path: `projects/${selectedProjectId}/diensten`,
        operation: 'list',
      });
      errorEmitter.emit('permission-error', contextualError);
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

  React.useEffect(() => {
    if (selectedProject) {
        isFirestoreDataLoaded.current = false;
        setUnavailableVehicles(selectedProject.vehicleAvailability?.unavailable || {});
        setAvailableVehicles(selectedProject.vehicleAvailability?.available || {});
        setTimeout(() => {
            isFirestoreDataLoaded.current = true;
        }, 200);
    } else {
        setUnavailableVehicles({});
        setAvailableVehicles({});
    }
  }, [selectedProject]);

  React.useEffect(() => {
    if (!isFirestoreDataLoaded.current || !firestore || !selectedProjectId) {
        return;
    }

    const handler = setTimeout(() => {
        const projectRef = doc(firestore, 'projects', selectedProjectId);
        updateDocumentNonBlocking(projectRef, {
            vehicleAvailability: {
                unavailable: unavailableVehicles,
                available: availableVehicles,
            }
        }).catch(e => console.error("Error saving vehicle availability", e));
    }, 1500);

    return () => clearTimeout(handler);
  }, [unavailableVehicles, availableVehicles, firestore, selectedProjectId]);

  
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

  const handleDienstDelete = async (dienst: Dienst) => {
      if (!firestore || !selectedProjectId || !dienst.id) return;
      const dienstRef = doc(firestore, 'projects', selectedProjectId, 'diensten', dienst.id);
      await deleteDocumentNonBlocking(dienstRef);
      fetchDiensten();
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
    
    // For Mac, Option key is metaKey. For Windows, use Ctrl key.
    const isCopy = e.altKey || e.ctrlKey;
  
    // For a move, only update if there's a change
    if (!isCopy && droppedDienst.medewerkerId === newMedewerkerId && droppedDienst.datum === newDatumString) {
      return;
    }
  
    try {
      if (!droppedDienst.projectId) {
        console.error("Dropped dienst is missing projectId");
        return;
      }

      const dienstenColRef = collection(firestore, 'projects', droppedDienst.projectId, 'diensten');
  
      if (isCopy) {
        // Copy action: create a new document
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...newDienstData } = droppedDienst;
        await addDocumentNonBlocking(dienstenColRef, {
          ...newDienstData,
          medewerkerId: newMedewerkerId,
          datum: newDatumString,
        });
      } else {
        // Move action: update the existing document
        const dienstRef = doc(dienstenColRef, droppedDienst.id);
        await updateDocumentNonBlocking(dienstRef, {
          medewerkerId: newMedewerkerId,
          datum: newDatumString,
        });
      }
      fetchDiensten(); // Refetch data to show the result
    } catch(error) {
      console.error("Error updating dienst:", error);
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, medewerkerId: string, day: Date) => {
    e.preventDefault();
    setDragOverCell({ medewerkerId, day: format(day, 'yyyy-MM-dd') });
  }

  const calculateWeekHours = (medewerkerId: string) => {
    if (!diensten) return 0;
    
    const medewerkerDiensten = diensten.filter(d => d.medewerkerId === medewerkerId);
    let totalMinutes = 0;

    medewerkerDiensten.forEach(d => {
      if (!d.starttijd || !d.eindtijd) return;
      try {
        const startTijd = parse(d.starttijd, 'HH:mm', new Date());
        const eindTijd = parse(d.eindtijd, 'HH:mm', new Date());
        let duration = (eindTijd.getTime() - startTijd.getTime()) / (1000 * 60);
        if (duration < 0) duration += 24 * 60; // Overnight
        duration -= d.onbetaaldePauze || 0;
        totalMinutes += duration;
      } catch (e) {
        console.error("Error parsing time for week hour calculation", e);
      }
    });

    return totalMinutes / 60;
  };
  
 const handlePrintWeek = () => {
    document.body.classList.add('print-week-view');
    document.body.classList.remove('print-day-view');
    window.print();
 };

  const generateDayPdf = (dayToPrint: Date) => {
    if (!selectedProject || !medewerkers || !diensten) return;

    const doc = new jsPDF();
    const title = `Dagplanning: ${selectedProject.projectnaam}`;
    const dateStr = format(dayToPrint, 'eeee d MMMM yyyy', { locale: nl });

    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    doc.text(dateStr, 14, 30);

    const body = medewerkers.map(medewerker => {
      const medewerkerDiensten = diensten.filter(d =>
        d.medewerkerId === medewerker.id && isSameDay(new Date(d.datum), dayToPrint)
      );

      const dienstenText = medewerkerDiensten.map(d =>
        `${d.werksoort}\n${d.starttijd} - ${d.eindtijd}`
      ).join('\n\n');

      return [
        `${medewerker.voornaam || ''} ${medewerker.achternaam || ''}`.trim(),
        dienstenText
      ];
    });

    (doc as any).autoTable({
      startY: 40,
      head: [['Medewerker', 'Dienst']],
      body: body,
      theme: 'grid',
      styles: {
        valign: 'middle'
      },
      headStyles: {
        fillColor: [22, 160, 133], // A teal color
        textColor: 255
      },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 'auto' },
      }
    });

    doc.save(`dagplanning_${format(dayToPrint, 'yyyy-MM-dd')}.pdf`);
  };

  // Add a cleanup effect for the print classes
  React.useEffect(() => {
    const afterPrint = () => {
       document.body.className = document.body.className.replace(/print-(day|week)-view/g, '').trim();
    };

    window.addEventListener('afterprint', afterPrint);

    return () => {
        window.removeEventListener('afterprint', afterPrint);
    };
  }, []);

  const renderActionButtons = () => {
    const buttons = [
      <Button key="print-day" variant="outline" onClick={() => setIsPrintDayDialogOpen(true)}><Printer className="mr-2 h-4 w-4" /> Print Dag</Button>,
      <Button key="print-week" variant="outline" onClick={handlePrintWeek}><Printer className="mr-2 h-4 w-4" /> Print Week</Button>
    ];

    if (isTablet) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {buttons.map((btn, i) => <DropdownMenuItem key={i} asChild>{btn}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
    return buttons;
  }

  const handleContextMenu = (e: React.MouseEvent, context: { dienst?: Dienst; cellContext?: { medewerker: Medewerker; datum: Date } }) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, ...context });
  };
  
  const handlePaste = async () => {
    if (!copiedDienst || selectedCells.length === 0 || !firestore || !selectedProjectId) return;
  
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...dienstToCopy } = copiedDienst;
    const batch = writeBatch(firestore);
    const dienstenColRef = collection(firestore, 'projects', selectedProjectId, 'diensten');
  
    selectedCells.forEach(cell => {
        const newDienstData = {
          ...dienstToCopy,
          medewerkerId: cell.medewerkerId,
          datum: cell.datum,
        };
        const newDocRef = doc(dienstenColRef);
        batch.set(newDocRef, newDienstData);
    });
  
    try {
      await batch.commit();
      fetchDiensten();
      setSelectedCells([]); // Clear selection after pasting
    } catch (error) {
      console.error('Error pasting diensten:', error);
    }
  };

   const handleDeleteSelected = async () => {
    if (selectedCells.length === 0 || !firestore || !selectedProjectId || !diensten) return;

    const dienstenToDelete = diensten.filter(d => 
      selectedCells.some(cell => cell.medewerkerId === d.medewerkerId && cell.datum === d.datum)
    );

    if (dienstenToDelete.length === 0) return;

    const batch = writeBatch(firestore);
    const dienstenColRef = collection(firestore, 'projects', selectedProjectId, 'diensten');

    dienstenToDelete.forEach(dienst => {
      const docRef = doc(dienstenColRef, dienst.id);
      batch.delete(docRef);
    });

    try {
      await batch.commit();
      fetchDiensten();
      setSelectedCells([]);
    } catch (error) {
      console.error('Error deleting selected diensten:', error);
    }
  };
  
  const handleCellClick = (e: React.MouseEvent, medewerkerId: string, datum: string) => {
    const cell = { medewerkerId, datum };
    const isSelected = selectedCells.some(c => c.medewerkerId === medewerkerId && c.datum === datum);
    
    if (e.ctrlKey || e.metaKey) { // For multi-select
        if (isSelected) {
            setSelectedCells(prev => prev.filter(c => !(c.medewerkerId === medewerkerId && c.datum === datum)));
        } else {
            setSelectedCells(prev => [...prev, cell]);
        }
    } else { // For single select
        setSelectedCells(isSelected ? [] : [cell]);
    }
  };

  const handleUnavailableVehicleToggle = (dateKey: string, vehicleId: string, checked: boolean) => {
    setUnavailableVehicles(prev => {
        const newState = { ...prev };
        const currentForDay = newState[dateKey] || [];
        const newForDay = checked
            ? [...currentForDay, vehicleId]
            : currentForDay.filter(id => id !== vehicleId);
        
        if (newForDay.length === 0) {
            delete newState[dateKey];
        } else {
            newState[dateKey] = newForDay;
        }
        return newState;
    });
  };

  const handleAvailableVehicleToggle = (dateKey: string, vehicleId: string, checked: boolean) => {
    setAvailableVehicles(prev => {
        const newState = { ...prev };
        const currentForDay = newState[dateKey] || [];
        const newForDay = checked
            ? [...currentForDay, vehicleId]
            : currentForDay.filter(id => id !== vehicleId);
        
        if (newForDay.length === 0) {
            delete newState[dateKey];
        } else {
            newState[dateKey] = newForDay;
        }
        return newState;
    });
  };

  const availableVoertuigenForDialog = React.useMemo(() => {
    if (!voertuigen) return [];
    if (!selectedDay) return voertuigen;
    
    const dateKey = format(selectedDay, 'yyyy-MM-dd');
    const unavailableForDay = unavailableVehicles[dateKey] || [];
    const availableForDay = availableVehicles[dateKey] || [];

    if (availableForDay.length > 0) {
        // If specific vehicles are marked as available, only they are available (and not unavailable).
        return voertuigen.filter(v => availableForDay.includes(v.id) && !unavailableForDay.includes(v.id));
    }
    
    // Otherwise, all vehicles are available except those marked as unavailable.
    return voertuigen.filter(v => !unavailableForDay.includes(v.id));
  }, [voertuigen, selectedDay, unavailableVehicles, availableVehicles]);


  return (
    <div className="flex flex-col flex-1 h-full min-h-0" id="planning-container">
      <PageHeader title="Bezetting">
        <div className="flex items-center gap-2">
          {renderActionButtons()}
          <span className="text-sm font-medium text-muted-foreground hidden lg:inline">
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
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevWeek}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-center w-64">
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
          <div className="sticky top-0 z-20 p-2 bg-background border-b border-r"></div>
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "sticky top-0 z-20 p-2 text-center bg-background border-b border-r day-column",
                isToday(day) && "bg-muted/50"
              )}
            >
              <p className="font-semibold capitalize text-sm">
                {format(day, 'eee', { locale: nl })}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(day, 'dd-MM', { locale: nl })}
              </p>
            </div>
          ))}

          {/* UNAVAILABLE VEHICLES ROW */}
          <div className="p-3 border-b border-r flex items-center bg-background h-11 medewerker-header sticky left-0 z-10">
            <span className="font-semibold text-sm whitespace-nowrap">Onbeschikbaar</span>
          </div>
          {weekDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const unavailableForDay = unavailableVehicles[dateKey] || [];
              const buttonText = unavailableForDay.length > 0
                  ? voertuigen?.filter(v => unavailableForDay.includes(v.id)).map(v => v.voertuignummer || v.id).join(', ')
                  : "Geen";
              return (
                  <div key={`${day.toISOString()}-unavailable`} className="p-1 border-b border-r day-column bg-background h-11">
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full h-full text-xs justify-start text-left">
                                  <span className='truncate'>{buttonText}</span>
                              </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto">
                              <DropdownMenuLabel>Onbeschikbare voertuigen</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {voertuigen && voertuigen.length > 0 ? voertuigen.map(v => (
                                  <DropdownMenuCheckboxItem
                                      key={v.id}
                                      checked={unavailableForDay.includes(v.id)}
                                      onCheckedChange={(checked) => handleUnavailableVehicleToggle(dateKey, v.id, !!checked)}
                                      onSelect={(e) => e.preventDefault()}
                                  >
                                      {v.voertuignummer || v.id} ({v.merk})
                                  </DropdownMenuCheckboxItem>
                              )) : <DropdownMenuItem disabled>Geen voertuigen geladen</DropdownMenuItem>}
                          </DropdownMenuContent>
                      </DropdownMenu>
                  </div>
              );
          })}
          
           {/* AVAILABLE VEHICLES ROW */}
          <div className="p-3 border-b border-r flex items-center bg-background h-11 medewerker-header sticky left-0 z-10">
            <span className="font-semibold text-sm whitespace-nowrap">Beschikbaar</span>
          </div>
          {weekDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const availableForDay = availableVehicles[dateKey] || [];
              const buttonText = availableForDay.length > 0
                  ? voertuigen?.filter(v => availableForDay.includes(v.id)).map(v => v.voertuignummer || v.id).join(', ')
                  : "Alle";
              return (
                  <div key={`${day.toISOString()}-available`} className="p-1 border-b border-r day-column bg-background h-11">
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full h-full text-xs justify-start text-left">
                                  <span className='truncate'>{buttonText}</span>
                              </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto">
                              <DropdownMenuLabel>Beschikbare voertuigen</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {voertuigen && voertuigen.length > 0 ? voertuigen.map(v => (
                                  <DropdownMenuCheckboxItem
                                      key={v.id}
                                      checked={availableForDay.includes(v.id)}
                                      onCheckedChange={(checked) => handleAvailableVehicleToggle(dateKey, v.id, !!checked)}
                                      onSelect={(e) => e.preventDefault()}
                                  >
                                      {v.voertuignummer || v.id} ({v.merk})
                                  </DropdownMenuCheckboxItem>
                              )) : <DropdownMenuItem disabled>Geen voertuigen geladen</DropdownMenuItem>}
                          </DropdownMenuContent>
                      </DropdownMenu>
                  </div>
              );
          })}


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
            medewerkers?.filter(m => m.status === 'Actief').map((medewerker) => (
              <React.Fragment key={medewerker.id}>
                <div className="flex flex-col justify-center p-3 border-b border-r medewerker-header sticky left-0 bg-background z-10">
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
                      <span>{formatHours(calculateWeekHours(medewerker.id))} / {formatHours(getWeekContractHours(medewerker))}</span>
                    </div>
                  </div>
                </div>
                {weekDays.map((day) => {
                  const datumString = format(day, 'yyyy-MM-dd');
                  const dienstenForDay = diensten?.filter(d => 
                      d.medewerkerId === medewerker.id && 
                      isSameDay(new Date(d.datum), day)
                  );
                  const isDragOver = dragOverCell?.medewerkerId === medewerker.id && dragOverCell?.day === datumString;
                  const isSelected = selectedCells.some(c => c.medewerkerId === medewerker.id && c.datum === datumString);
                  
                  const dayName = format(day, 'eeee', { locale: nl }).toLowerCase() as keyof NonNullable<Medewerker['urenPerDag']>;
                  const isWeekend = dayName === 'zaterdag' || dayName === 'zondag';
                  const defaultUren = { maandag: { start: '07:00', eind: '15:30' }, dinsdag: { start: '07:00', eind: '15:30' }, woensdag: { start: '07:00', eind: '15:30' }, donderdag: { start: '07:00', eind: '15:30' }, vrijdag: { start: '07:00', eind: '15:30' }, zaterdag: { start: '', eind: '' }, zondag: { start: '', eind: '' } };
                  const urenPerDag = { ...defaultUren, ...(medewerker.urenPerDag || {}) };

                  const dagUren = urenPerDag[dayName];
                  const isNonWorkingDay = !dagUren || !dagUren.start || !dagUren.eind;
                  const isVisuallyNonWorkingDay = isNonWorkingDay && !isWeekend;


                  return (
                    <div
                        key={day.toISOString()}
                        onDrop={(e) => !isVisuallyNonWorkingDay && handleDrop(e, medewerker.id, day)}
                        onDragOver={(e) => !isVisuallyNonWorkingDay && handleDragOver(e, medewerker.id, day)}
                        onDragLeave={() => setDragOverCell(null)}
                        onContextMenu={(e) => {
                          if (isVisuallyNonWorkingDay) return;
                          if (!(e.target as HTMLElement).closest('.group\\/dienst')) {
                            handleContextMenu(e, { cellContext: { medewerker, datum: day } });
                          }
                        }}
                        onClick={(e) => {
                            if (isVisuallyNonWorkingDay) return;
                            if ((e.target as HTMLElement).closest('.group\\/dienst')) return;
                            handleOpenSheetForNew(medewerker, day);
                        }}
                        className={cn(
                            "group relative p-2 border-b border-r min-h-[80px] flex flex-col gap-1 transition-colors day-column",
                            isVisuallyNonWorkingDay
                                ? 'bg-black' 
                                : isToday(day) ? "bg-muted/50" : "",
                            isDragOver && !isVisuallyNonWorkingDay && "bg-blue-100 dark:bg-blue-900/30",
                            isSelected && !isVisuallyNonWorkingDay && "bg-primary/10",
                            !isVisuallyNonWorkingDay && "cursor-pointer"
                        )}
                    >
                        <div className="flex-1 space-y-1 relative z-10">
                          {isLoadingDiensten ? (
                              <Skeleton className="h-10 w-full" />
                          ) : (
                            dienstenForDay?.map(dienst => (
                                <DienstItem key={dienst.id} dienst={dienst} onEdit={handleOpenSheetForEdit} onDelete={handleDienstDelete} onContextMenu={(e, d) => {
                                    e.stopPropagation(); // Prevent grid cell context menu
                                    handleContextMenu(e, { dienst: d });
                                }} isNonWorkingDay={isVisuallyNonWorkingDay} />
                            ))
                          )}
                        </div>
                    </div>
                )})}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
      <DropdownMenu open={!!contextMenu} onOpenChange={(isOpen) => !isOpen && setContextMenu(null)}>
          <DropdownMenuTrigger
            style={contextMenu ? { position: 'fixed', left: contextMenu.x, top: contextMenu.y } : {}}
          />
          <DropdownMenuContent onContextMenu={(e) => e.preventDefault()}>
            {contextMenu?.cellContext && (
                <DropdownMenuItem onClick={() => {
                    handleOpenSheetForNew(contextMenu.cellContext!.medewerker, contextMenu.cellContext!.datum);
                    setContextMenu(null);
                }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nieuwe dienst
                </DropdownMenuItem>
            )}
            {contextMenu?.dienst && (
              <DropdownMenuItem onClick={() => {
                  setCopiedDienst(contextMenu.dienst!);
                  setContextMenu(null);
                }}>
                <Copy className="mr-2 h-4 w-4" />
                Kopiëren
              </DropdownMenuItem>
            )}

            {(contextMenu?.cellContext || contextMenu?.dienst) && (copiedDienst || selectedCells.length > 0) && <DropdownMenuSeparator />}

            {copiedDienst && (
              <DropdownMenuItem onClick={handlePaste} disabled={selectedCells.length === 0}>
                <Copy className="mr-2 h-4 w-4" />
                Plakken
              </DropdownMenuItem>
            )}
            {selectedCells.length > 0 && (
                <DropdownMenuItem onClick={handleDeleteSelected} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Verwijder selectie
                </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      <DienstToevoegenDialog
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            medewerker={selectedMedewerker}
            datum={selectedDay}
            project={selectedProject}
            dienst={selectedDienst}
            onSuccess={handleSheetSuccess}
            voertuigen={availableVoertuigenForDialog}
        />
        <PrintDayDialog 
            open={isPrintDayDialogOpen}
            onOpenChange={setIsPrintDayDialogOpen}
            weekDays={weekDays}
            onPrint={generateDayPdf}
        />
    </div>
  );
}
