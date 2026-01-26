'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Clock, MoreHorizontal, Plus, Printer, Trash2, Copy, ClipboardCopy, FileText } from 'lucide-react';
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
import type { Medewerker, Dienst, Voertuig, Machine, UserProfile } from '@/lib/types';
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
import { useProfile } from '@/firebase/profile-provider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';


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

const getContrastColor = (hexcolor: string) => {
    if (!hexcolor) return '#000000';
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) {
      hexcolor = hexcolor.split('').map(char => char + char).join('');
    }
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
};

const DienstItem = ({ dienst, onEdit, onDelete, onContextMenu, isNonWorkingDay, canEdit }: { dienst: Dienst, onEdit: (dienst: Dienst) => void, onDelete: (dienst: Dienst) => void, onContextMenu: (e: React.MouseEvent, dienst: Dienst) => void, isNonWorkingDay: boolean, canEdit: boolean }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

    const handleEdit = (e: React.MouseEvent) => {
        if (!canEdit || isNonWorkingDay) return;
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
        if (canEdit && (e.key === 'Delete' || e.key === 'Backspace')) {
            e.preventDefault();
            setShowDeleteConfirm(true);
        }
    };
    
    const isZiek = dienst.werksoort === 'Ziek';
    const isVerlof = dienst.werksoort === 'Verlof' || dienst.werksoort === 'ADV';
    
    const hasCustomColor = !!dienst.celkleur;
    const customColorStyle = hasCustomColor 
        ? { backgroundColor: dienst.celkleur, color: getContrastColor(dienst.celkleur) } 
        : {};

    return (
        <>
            <div 
                onClick={handleEdit}
                onKeyDown={handleKeyDown}
                onContextMenu={(e) => { if(canEdit) onContextMenu(e, dienst) }}
                tabIndex={0}
                draggable={canEdit}
                onDragStart={canEdit ? handleDragStart : undefined}
                onDragEnd={handleDragEnd}
                className={cn(
                    "rounded-md p-2 text-xs relative group/dienst focus:outline-none focus:ring-2 focus:ring-primary",
                    !hasCustomColor && (isZiek 
                        ? "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-white"
                        : isVerlof
                            ? "bg-orange-200 text-orange-900 dark:bg-orange-900/50 dark:text-white"
                            : isNonWorkingDay
                                ? 'border border-gray-600 text-gray-200 bg-transparent'
                                : "bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-white"
                    ),
                    canEdit && !isNonWorkingDay && (
                        hasCustomColor ? 'hover:brightness-90 transition-all' : (
                            isZiek ? "hover:bg-red-300 dark:hover:bg-red-900/70" 
                            : isVerlof ? "hover:bg-orange-300 dark:hover:bg-orange-900/70" 
                            : "hover:bg-blue-200 dark:hover:bg-blue-900/70"
                        )
                    ),
                    canEdit && !isNonWorkingDay && 'cursor-pointer'
                )}
                style={customColorStyle}
            >
                <p className="font-semibold truncate">{dienst.werksoort}</p>
                 <div className="flex items-center justify-between gap-1">
                    <p className="truncate">{dienst.starttijd} - {dienst.eindtijd}</p>
                    {dienst.notities && (
                        <FileText className={cn("h-3 w-3 shrink-0", !hasCustomColor && 'text-muted-foreground')} title={dienst.notities} />
                    )}
                </div>
                {dienst.voertuignummer && (
                    <p className={cn("truncate text-xs", !hasCustomColor && 'text-muted-foreground')}>Voertuig: {dienst.voertuignummer}</p>
                )}
                {canEdit && <Button 
                    variant="ghost" 
                    size="icon" 
                    className="delete-button absolute top-0 right-0 h-6 w-6 opacity-0 group-hover/dienst:opacity-100 focus:opacity-100"
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent opening edit sheet
                        setShowDeleteConfirm(true);
                    }}
                >
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>}
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
    dayHeaderContext?: { datum: Date };
  } | null>(null);
  const [copiedDienst, setCopiedDienst] = React.useState<Dienst | null>(null);
  const [copiedDay, setCopiedDay] = React.useState<{ diensten: Omit<Dienst, 'id'>[] } | null>(null);
  const [selectedCells, setSelectedCells] = React.useState<{ medewerkerId: string; datum: string }[]>([]);
  const [unavailableVehicles, setUnavailableVehicles] = React.useState<Record<string, string[]>>({});
  const [availableVehicles, setAvailableVehicles] = React.useState<Record<string, string[]>>({});
  const isFirestoreDataLoaded = React.useRef(false);

  const { profile, isLoading: isProfileLoading } = useProfile();
  const isMobile = useIsMobile();
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

  const machinesCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'machines');
  }, [firestore]);

  const { data: machines, isLoading: isLoadingMachines } = useCollection<Machine>(machinesCollection);

  const allEquipment = React.useMemo(() => {
    const all: (Voertuig & {__type: 'voertuig'} | Machine & {__type: 'machine'})[] = [];
    if (voertuigen) {
        all.push(...voertuigen.map(v => ({...v, __type: 'voertuig' as const})));
    }
    if (machines) {
        all.push(...machines.map(m => ({...m, __type: 'machine' as const})));
    }
    return all.sort((a, b) => {
        const numA = (a.__type === 'voertuig' ? a.voertuignummer : a.machinenummer) || a.id;
        const numB = (b.__type === 'voertuig' ? b.voertuignummer : b.machinenummer) || b.id;
        return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [voertuigen, machines]);

  const equipmentMap = React.useMemo(() => {
    const map = new Map<string, (Voertuig & {__type: 'voertuig'}) | (Machine & {__type: 'machine'})>();
    if (allEquipment) {
        for (const item of allEquipment) {
            map.set(item.id, item);
        }
    }
    return map;
  }, [allEquipment]);

  const isSuperUser = profile?.role === 'Super admin';
  const canView = isSuperUser || !!profile?.permissions?.workPlanning?.view;
  const canEdit = isSuperUser || !!profile?.permissions?.workPlanning?.edit;

  const start = React.useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const end = React.useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  
  const fetchDiensten = React.useCallback(async () => {
    if (!firestore || !selectedProjectId) {
      setDiensten([]);
      return;
    }
    if (!canView) {
        setDiensten([]);
        setIsLoadingDiensten(false);
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
  }, [firestore, selectedProjectId, start, end, canView]);

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
    if (!canEdit) return;
    setSelectedMedewerker(medewerker);
    setSelectedDay(datum);
    setSelectedDienst(undefined);
    setIsSheetOpen(true);
  };
  
  const handleOpenSheetForEdit = (dienst: Dienst) => {
    if (!canEdit) return;
    const medewerker = medewerkers?.find(m => m.id === dienst.medewerkerId);
    setSelectedMedewerker(medewerker);
    setSelectedDay(new Date(dienst.datum));
    setSelectedDienst(dienst);
    setIsSheetOpen(true);
  };

  const handleDienstDelete = async (dienst: Dienst) => {
      if (!firestore || !selectedProjectId || !dienst.id || !canEdit) return;
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
  
    if (!firestore || !canEdit) return;
    
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
    if (!canEdit) return;
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

    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    const title = `Dagplanning: ${selectedProject.projectnaam}`;
    const dateStr = format(dayToPrint, 'eeee dd MMMM yyyy', { locale: nl });

    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    doc.text(`Datum: ${dateStr}`, 150, 22);

    const dayDiensten = diensten.filter(d => isSameDay(new Date(d.datum), dayToPrint));
    const medewerkersById = new Map(medewerkers.map(m => [m.id, m]));
    
    const employeesWithDienst = Array.from(new Set(dayDiensten.map(d => d.medewerkerId)))
      .map(id => medewerkersById.get(id))
      .filter((m): m is Medewerker => !!m);

    const tableData: { medewerker: Medewerker; diensten: Dienst[] }[] = [];
    employeesWithDienst.forEach(medewerker => {
      const dienstenForMedewerker = dayDiensten.filter(d => d.medewerkerId === medewerker.id);
      if (dienstenForMedewerker.length > 0) {
        tableData.push({ medewerker, diensten: dienstenForMedewerker });
      }
    });
    
    const groupOrder = ['Machinist', 'Chauffeur', 'Inhuur', 'Onkruidploeg'];
    const groupedData: { [key: string]: { medewerker: Medewerker; diensten: Dienst[] }[] } = {};

    // Initialize groups
    groupOrder.forEach(group => groupedData[group] = []);
    groupedData['Onkruidploeg'] = []; // Explicitly init 'Overig' which is now 'Onkruidploeg'

    tableData.forEach(item => {
        const { medewerker } = item;
        let assignedGroup: string | undefined;

        if (medewerker.soortMedewerker === 'Inhuur') {
            assignedGroup = 'Inhuur';
        } else if (medewerker.functie && groupOrder.includes(medewerker.functie)) {
            assignedGroup = medewerker.functie;
        } else {
            assignedGroup = 'Onkruidploeg';
        }
        
        if(assignedGroup && !groupedData[assignedGroup]) {
             groupedData[assignedGroup] = [];
        }
        if (assignedGroup) {
            groupedData[assignedGroup].push(item);
        }
    });

    const body: any[] = [];
    const head = [['Voertuig', 'FTE', 'activiteit', 'gebied']];
    
    const addRow = (item: { medewerker: Medewerker; dienst: Dienst; }) => {
      const { medewerker, dienst } = item;
      
      const isZiek = dienst.werksoort?.toLowerCase() === 'ziek';
      const isVerlof = dienst.werksoort?.toLowerCase().includes('verlof') || dienst.werksoort?.toLowerCase() === 'adv';
      const hasNotities = dienst.notities && dienst.notities.trim() !== '';

      const activiteitText = dienst.notities || '';
      let gebiedText = dienst.werksoort || '';
      
      if (isZiek) gebiedText = 'Ziek';
      if (isVerlof) gebiedText = 'Verlof';

      const activiteitCell: any = { content: activiteitText };
      const gebiedCell: any = { content: gebiedText };
      
      if (hasNotities && !isZiek && !isVerlof) {
          activiteitCell.styles = { fillColor: [255, 255, 204] }; // Light Yellow
      }
      
      if (isZiek) {
          gebiedCell.styles = { fillColor: [255, 228, 196] }; // Light Orange/Peach
      } else if (isVerlof) {
          gebiedCell.styles = { fillColor: [230, 230, 250] }; // Light Purple
      }

      body.push([
        dienst.voertuignummer || medewerker.personeelsnummer || '',
        `${medewerker.voornaam || ''} ${medewerker.achternaam || ''}`.trim(),
        activiteitCell,
        gebiedCell,
      ]);
    };
    
    const finalGroupOrder = ['Machinist', 'Chauffeur', 'Inhuur', 'Onkruidploeg'];
    
    finalGroupOrder.forEach((groupName) => {
        const items = groupedData[groupName];
        if (!items || items.length === 0) return;

        items.sort((a, b) => (a.medewerker.achternaam || '').localeCompare(b.medewerker.achternaam || ''));

        body.push([{ content: groupName, colSpan: 4, styles: { halign: 'left', fontStyle: 'bold' } }]);
        
        items.forEach(({ medewerker, diensten }) => {
            if (diensten.length > 0) {
                diensten
                    .sort((a,b) => a.starttijd.localeCompare(b.starttijd))
                    .forEach(dienst => {
                        addRow({ medewerker, dienst });
                    })
            }
        });
        
        if (body.length > 0) {
           body.push(['', '', '', '']); // Spacer
        }
    });

    if(body.length > 0 && body[body.length - 1].every((cell: string) => cell === '')) {
        body.pop();
    }


    (doc as any).autoTable({
      startY: 36,
      head: head,
      body: body,
      theme: 'grid',
      styles: {
        cellPadding: 2,
        fontSize: 9,
        valign: 'middle',
        overflow: 'linebreak',
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      },
      headStyles: {
        fillColor: [228, 228, 231], // gray-200
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 40 },
        2: { cellWidth: 60 },
        3: { cellWidth: 'auto' },
      }
    });
    
    const dateKey = format(dayToPrint, 'yyyy-MM-dd');
    const unavailableIds = unavailableVehicles[dateKey] || [];
    const availableForDayIds = availableVehicles[dateKey] || [];

    const unavailableEquipmentNames = allEquipment
        .filter(e => unavailableIds.includes(e.id))
        .map(e => (e as Voertuig).voertuignummer || (e as Machine).machinenummer || e.id)
        .join(', ') || 'Geen';

    let availableEquipmentText: string;
    if (availableForDayIds.length > 0) {
        availableEquipmentText = allEquipment
            .filter(e => availableForDayIds.includes(e.id) && !unavailableIds.includes(e.id))
            .map(e => (e as Voertuig).voertuignummer || (e as Machine).machinenummer || e.id)
            .join(', ') || 'Geen';
    } else {
        availableEquipmentText = 'Alle (m.u.v. onbeschikbaar)';
    }
    
    let finalY = (doc as any).lastAutoTable.finalY;
    if (!finalY || finalY < 36) { // If table was empty or very short
        const headerHeight = 22;
        const dateStrHeight = 8;
        const margin = 14;
        finalY = headerHeight + dateStrHeight + margin; // Estimate where table would have ended
    }
    
    const pageHeight = doc.internal.pageSize.height;
    const pageMargin = 20;

    // Check if there is enough space for the equipment section
    if (finalY > pageHeight - pageMargin - 40) { // estimate 40mm for the section
      doc.addPage();
      finalY = 20; // Start on new page
    }

    finalY += 10; // Add some margin

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Beschikbaar materieel:', 14, finalY);

    doc.setFont('helvetica', 'normal');
    doc.text(availableEquipmentText, 14, finalY + 5, { maxWidth: 180 });

    finalY += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('Onbeschikbaar materieel:', 14, finalY);

    doc.setFont('helvetica', 'normal');
    doc.text(unavailableEquipmentNames, 14, finalY + 5, { maxWidth: 180 });

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

    if (isMobile) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {buttons.map((btn, i) => <DropdownMenuItem key={i}>{btn}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
    return buttons;
  }

  const handleContextMenu = (e: React.MouseEvent, context: { dienst?: Dienst; cellContext?: { medewerker: Medewerker; datum: Date }; dayHeaderContext?: { datum: Date }; }) => {
    e.preventDefault();
    if (!canEdit) return;
    setContextMenu({ x: e.clientX, y: e.clientY, ...context });
  };

  const handleDayHeaderContextMenu = (e: React.MouseEvent, datum: Date) => {
    handleContextMenu(e, { dayHeaderContext: { datum } });
  };
  
  const handleCopyDay = () => {
    if (!contextMenu?.dayHeaderContext || !diensten) return;
    const dateToCopy = contextMenu.dayHeaderContext.datum;
    const dateStringToCopy = format(dateToCopy, 'yyyy-MM-dd');

    const dienstenToCopy = diensten.filter(d => d.datum === dateStringToCopy);

    // Remove IDs so they are created as new documents on paste
    const dienstenWithoutIds = dienstenToCopy.map(({ id, ...rest }) => rest);

    setCopiedDay({ diensten: dienstenWithoutIds });
    setContextMenu(null);
  };
  
  const handlePasteDay = async () => {
    if (!contextMenu?.dayHeaderContext || !copiedDay || !firestore || !selectedProjectId || !canEdit) return;

    const targetDate = contextMenu.dayHeaderContext.datum;
    const targetDateString = format(targetDate, 'yyyy-MM-dd');

    setIsLoadingDiensten(true);
    const batch = writeBatch(firestore);
    const dienstenColRef = collection(firestore, 'projects', selectedProjectId, 'diensten');

    copiedDay.diensten.forEach(dienstToPaste => {
        const newDienstData = {
            ...dienstToPaste,
            datum: targetDateString,
        };
        const newDocRef = doc(dienstenColRef);
        batch.set(newDocRef, newDienstData);
    });

    try {
        await batch.commit();
        fetchDiensten(); // This will handle loading state and refetch
    } catch (error) {
        console.error('Error pasting day:', error);
        setIsLoadingDiensten(false);
    } finally {
        setContextMenu(null);
    }
  };

  const handlePaste = async () => {
    if (!copiedDienst || selectedCells.length === 0 || !firestore || !selectedProjectId || !canEdit) return;
  
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
    if (selectedCells.length === 0 || !firestore || !selectedProjectId || !diensten || !canEdit) return;

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

  const availableEquipmentForDialog = React.useMemo(() => {
    if (!allEquipment) return [];
    
    let filteredEquipment = allEquipment;

    if (selectedDay) {
        const dateKey = format(selectedDay, 'yyyy-MM-dd');
        const unavailableForDay = unavailableVehicles[dateKey] || [];
        const availableForDay = availableVehicles[dateKey] || [];

        if (availableForDay.length > 0) {
            filteredEquipment = allEquipment.filter(e => availableForDay.includes(e.id) && !unavailableForDay.includes(e.id));
        } else {
            filteredEquipment = allEquipment.filter(e => !unavailableForDay.includes(e.id));
        }
    }
    
    return filteredEquipment;
  }, [allEquipment, selectedDay, unavailableVehicles, availableVehicles]);


  return (
    <div className="flex flex-col flex-1 h-full min-h-0" id="planning-container">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 p-6">
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
            <SelectTrigger className="w-full md:w-[280px]">
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
          <Popover>
            <PopoverTrigger asChild>
                <Button variant={'outline'} className="w-64 justify-center text-sm font-semibold">
                    {format(start, 'd MMMM', { locale: nl })} -{' '}
                    {format(end, 'd MMMM yyyy', { locale: nl })}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={currentDate}
                    onSelect={(date) => date && setCurrentDate(date)}
                    captionLayout="dropdown-buttons"
                    fromYear={2020}
                    toYear={new Date().getFullYear() + 5}
                    initialFocus
                    locale={nl}
                />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" onClick={nextWeek}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button>Uren controleren</Button>
        </div>
      </header>
      <div className="flex-1 overflow-auto border-t">
        <div className="grid grid-cols-[250px_repeat(7,1fr)] min-w-[1200px]">
          {/* Header Row */}
          <div className="sticky top-0 z-20 p-2 bg-background border-b border-r">
            <div className="grid grid-rows-3 h-full">
              <div className="row-span-2"></div>
              <div className="flex items-end">
                <span className="font-semibold text-sm">Medewerker</span>
              </div>
            </div>
          </div>
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              onContextMenu={(e) => handleDayHeaderContextMenu(e, day)}
              className={cn(
                "sticky top-0 z-20 p-2 text-center bg-background border-b border-r day-column cursor-context-menu",
                isToday(day) && "bg-muted/50"
              )}
            >
              <p className="font-semibold capitalize text-sm">
                {format(day, 'eee', { locale: nl })}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(day, 'dd-MM', { locale: nl })}
              </p>
               <div className="grid grid-cols-2 gap-1 mt-1">
                 <div className='text-xs text-left text-muted-foreground'>
                   <span className="font-semibold">Onbeschikbaar</span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="xs" className="w-full h-auto text-xs justify-start text-left mt-0.5 truncate p-1" disabled={!canEdit}>
                                {(unavailableVehicles[format(day, 'yyyy-MM-dd')] || []).length > 0 ? (unavailableVehicles[format(day, 'yyyy-MM-dd')] || []).map(id => { const item = equipmentMap.get(id); if (!item) return id; return (item as Voertuig).voertuignummer || (item as Machine).machinenummer || id; }).join(', ') : "Geen"}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto">
                            <DropdownMenuLabel>Onbeschikbaar Materieel</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {allEquipment && allEquipment.length > 0 ? (
                                <>
                                    <DropdownMenuLabel className="text-xs px-2">Voertuigen</DropdownMenuLabel>
                                    {allEquipment.filter(e => e.__type === 'voertuig').map(v => (
                                        <DropdownMenuCheckboxItem
                                            key={v.id}
                                            checked={(unavailableVehicles[format(day, 'yyyy-MM-dd')] || []).includes(v.id)}
                                            onCheckedChange={(checked) => handleUnavailableVehicleToggle(format(day, 'yyyy-MM-dd'), v.id, !!checked)}
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            {(v as Voertuig).voertuignummer || v.id} ({v.merk})
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs px-2">Machines</DropdownMenuLabel>
                                    {allEquipment.filter(e => e.__type === 'machine').map(m => (
                                        <DropdownMenuCheckboxItem
                                            key={m.id}
                                            checked={(unavailableVehicles[format(day, 'yyyy-MM-dd')] || []).includes(m.id)}
                                            onCheckedChange={(checked) => handleUnavailableVehicleToggle(format(day, 'yyyy-MM-dd'), m.id, !!checked)}
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            {(m as Machine).machinenummer || m.id} ({m.merk})
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </>
                            ) : <DropdownMenuItem disabled>Geen materieel</DropdownMenuItem>}
                        </DropdownMenuContent>
                    </DropdownMenu>
                 </div>
                 <div className='text-xs text-left text-muted-foreground'>
                    <span className="font-semibold">Beschikbaar</span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="xs" className="w-full h-auto text-xs justify-start text-left mt-0.5 truncate p-1" disabled={!canEdit}>
                                 {(availableVehicles[format(day, 'yyyy-MM-dd')] || []).length > 0 ? (availableVehicles[format(day, 'yyyy-MM-dd')] || []).map(id => { const item = equipmentMap.get(id); if (!item) return id; return (item as Voertuig).voertuignummer || (item as Machine).machinenummer || id; }).join(', ') : "Alle"}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto">
                           <DropdownMenuLabel>Beschikbaar Materieel</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {allEquipment && allEquipment.length > 0 ? (
                                <>
                                    <DropdownMenuLabel className="text-xs px-2">Voertuigen</DropdownMenuLabel>
                                    {allEquipment.filter(e => e.__type === 'voertuig').map(v => (
                                        <DropdownMenuCheckboxItem
                                            key={v.id}
                                            checked={(availableVehicles[format(day, 'yyyy-MM-dd')] || []).includes(v.id)}
                                            onCheckedChange={(checked) => handleAvailableVehicleToggle(format(day, 'yyyy-MM-dd'), v.id, !!checked)}
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            {(v as Voertuig).voertuignummer || v.id} ({v.merk})
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs px-2">Machines</DropdownMenuLabel>
                                    {allEquipment.filter(e => e.__type === 'machine').map(m => (
                                        <DropdownMenuCheckboxItem
                                            key={m.id}
                                            checked={(availableVehicles[format(day, 'yyyy-MM-dd')] || []).includes(m.id)}
                                            onCheckedChange={(checked) => handleAvailableVehicleToggle(format(day, 'yyyy-MM-dd'), m.id, !!checked)}
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            {(m as Machine).machinenummer || m.id} ({m.merk})
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </>
                            ) : <DropdownMenuItem disabled>Geen materieel</DropdownMenuItem>}
                        </DropdownMenuContent>
                    </DropdownMenu>
                 </div>
              </div>
            </div>
          ))}

          {/* Data Rows */}
          {isLoadingMedewerkers || isProfileLoading ? (
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
          ) : !canView ? (
              <div className="col-span-8 p-8 text-center text-muted-foreground">U heeft geen rechten om deze planning te bekijken.</div>
          ) : (
            medewerkers?.filter(m => m.status === 'Actief').map((medewerker) => (
              <React.Fragment key={medewerker.id}>
                <div className="flex flex-col justify-center p-3 border-b border-r medewerker-header">
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
                        onDrop={(e) => !isVisuallyNonWorkingDay && canEdit && handleDrop(e, medewerker.id, day)}
                        onDragOver={(e) => !isVisuallyNonWorkingDay && canEdit && handleDragOver(e, medewerker.id, day)}
                        onDragLeave={() => setDragOverCell(null)}
                        onContextMenu={(e) => {
                          if (isVisuallyNonWorkingDay || !canEdit) return;
                          if (!(e.target as HTMLElement).closest('.group\\/dienst')) {
                            handleContextMenu(e, { cellContext: { medewerker, datum: day } });
                          }
                        }}
                        onClick={(e) => {
                            if (isVisuallyNonWorkingDay || !canEdit) return;
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
                            !isVisuallyNonWorkingDay && canEdit && "cursor-pointer"
                        )}
                    >
                        <div className="flex-1 space-y-1 relative z-10">
                          {isLoadingDiensten ? (
                              <Skeleton className="h-10 w-full" />
                          ) : (
                            dienstenForDay?.map(dienst => (
                                <DienstItem key={dienst.id} dienst={dienst} onEdit={handleOpenSheetForEdit} onDelete={handleDienstDelete} onContextMenu={(e, d) => {
                                    e.stopPropagation(); // Prevent grid cell context menu
                                    if(canEdit) handleContextMenu(e, { dienst: d });
                                }} isNonWorkingDay={isVisuallyNonWorkingDay} canEdit={canEdit} />
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
            
            {contextMenu?.dayHeaderContext && (
                <>
                    <DropdownMenuItem onClick={handleCopyDay}>
                        <Copy className="mr-2 h-4 w-4" />
                        Kopieer Dag
                    </DropdownMenuItem>
                    {copiedDay && (
                        <DropdownMenuItem onClick={handlePasteDay}>
                            <ClipboardCopy className="mr-2 h-4 w-4" />
                            Plak Dag
                        </DropdownMenuItem>
                    )}
                </>
            )}

            {(contextMenu?.cellContext || contextMenu?.dienst) && (copiedDienst || selectedCells.length > 0) && <DropdownMenuSeparator />}

            {copiedDienst && (
              <DropdownMenuItem onClick={handlePaste} disabled={selectedCells.length === 0}>
                <ClipboardCopy className="mr-2 h-4 w-4" />
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
            equipment={availableEquipmentForDialog}
            currentUserProfile={profile}
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
