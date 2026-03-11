'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Printer, Upload, Calendar, CalendarDays, ChevronLeft, ChevronRight, MoreHorizontal, ClipboardList } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import {
  startOfWeek,
  endOfWeek,
  format,
  getISOWeek,
  getYear,
  setISOWeek,
  setYear,
  addWeeks,
  subWeeks,
  parse,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import type { Dienst } from '@/lib/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useProject } from '@/context/project-context';
import { LoadingScreen } from '@/components/loading-screen';


type Werksoort = {
  id: string;
  postnummer: string;
  werksoort: string;
  eenheid: string;
  fictieveH: string;
  uurprijs: string;
};

type Project = {
  id: string;
  projectnaam: string;
  projectnummer: string;
  werksoorten?: Werksoort[];
};

type ReportRow = {
  postnummer: string;
  omschrijving: string;
  eenheid: string;
  calculatieUren: number;
  prijsPer1h: number;
  totVorigePeriode: number;
  inWeek: number;
  tmPeriode: number;
  restant: number;
  procentGereed: number;
  totaalInPeriode: number;
  totaalTmWeek: number;
};

export default function WeeklyReportsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const isMobile = useIsMobile(1024);

  const projectsCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'projects');
  }, [firestore, user]);

  const { data: projects, isLoading: isLoadingProjects } =
    useCollection<Project>(projectsCollection);

  const selectedProject = React.useMemo(() => {
    return projects?.find((p) => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  const dienstenQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId || !user) return null;
    
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    const startDateString = format(start, 'yyyy-MM-dd');
    const endDateString = format(end, 'yyyy-MM-dd');

    return query(
      collection(firestore, 'projects', selectedProjectId, 'diensten'),
      where('datum', '>=', startDateString),
      where('datum', '<=', endDateString)
    );
  }, [firestore, selectedProjectId, currentDate, user]);


  const { data: diensten, isLoading: isLoadingDiensten } = useCollection<Dienst>(dienstenQuery);
  
  const weekNumber = getISOWeek(currentDate);
  const currentYear = getYear(currentDate);

  const handleWeekChange = (week: string) => {
    const newDate = setISOWeek(currentDate, parseInt(week));
    setCurrentDate(newDate);
  };
  
  const handleYearChange = (year: string) => {
    const newDate = setYear(currentDate, parseInt(year));
    setCurrentDate(newDate);
  };
  
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));


  const reportData = React.useMemo((): ReportRow[] => {
    if (!selectedProject?.werksoorten) {
      return [];
    }

    const urenPerWerksoort: Record<string, number> = {};

    if (diensten) {
      for (const d of diensten) {
        if (!d.starttijd || !d.eindtijd) continue;
        try {
          const startTijd = parse(d.starttijd, 'HH:mm', new Date());
          const eindTijd = parse(d.eindtijd, 'HH:mm', new Date());
          let duurInMinuten = (eindTijd.getTime() - startTijd.getTime()) / (1000 * 60);
          
          if (duurInMinuten < 0) duurInMinuten += 24 * 60; // For overnight shifts

          duurInMinuten -= d.onbetaaldePauze || 0;
          
          const duurInUren = duurInMinuten / 60;

          urenPerWerksoort[d.werksoort] = (urenPerWerksoort[d.werksoort] || 0) + duurInUren;
        } catch (e) {
          // invalid time
        }
      }
    }

    return selectedProject.werksoorten.map((ws) => {
      const inWeek = urenPerWerksoort[ws.werksoort] || 0;
      const prijsPer1h = parseFloat(ws.uurprijs) || 0;
      const calculatieUren = parseFloat(ws.fictieveH) || 0;
      
      const totaalInPeriode = inWeek * prijsPer1h;
      // Placeholder values for other cumulative fields
      const totVorigePeriode = 0.0;
      const tmPeriode = totVorigePeriode + inWeek;
      const restant = calculatieUren - tmPeriode;
      const procentGereed = calculatieUren > 0 ? (tmPeriode / calculatieUren) * 100 : 0;
      const totaalTmWeek = tmPeriode * prijsPer1h;

      return {
        postnummer: ws.postnummer,
        omschrijving: ws.werksoort,
        eenheid: ws.eenheid,
        calculatieUren: calculatieUren,
        prijsPer1h: prijsPer1h,
        totVorigePeriode: totVorigePeriode,
        inWeek: inWeek,
        tmPeriode: tmPeriode,
        restant: restant,
        procentGereed: procentGereed,
        totaalInPeriode: totaalInPeriode,
        totaalTmWeek: totaalTmWeek,
      };
    });
  }, [selectedProject?.werksoorten, diensten]);
  
  const subtotal = reportData.reduce((acc, item) => acc + item.totaalInPeriode, 0);
  const totalTmWeek = reportData.reduce((acc, item) => acc + item.totaalTmWeek, 0);

  const formatCurrency = (value: number) => {
    return `€ ${value.toLocaleString('nl-NL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const years = Array.from({ length: 10 }, (_, i) => getYear(new Date()) - 5 + i);

  const renderActionButtons = () => {
    const buttons = [
      <Button key="print" variant="outline" size="sm" className="font-bold">
        <Printer className="mr-2 h-4 w-4" /> Afdrukken
      </Button>,
      <Button key="import" variant="outline" size="sm" className="font-bold">
        <Upload className="mr-2 h-4 w-4" /> Importeren
      </Button>,
      <Button key="termijn" variant="outline" size="sm" className="font-bold">
        <Calendar className="mr-2 h-4 w-4" /> Termijn
      </Button>,
      <Button key="maand" variant="outline" size="sm" className="font-bold">
        <CalendarDays className="mr-2 h-4 w-4" /> Maand
      </Button>,
    ];

    if (isMobile) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {buttons.map((button, index) => (
              <DropdownMenuItem key={index} asChild>{React.cloneElement(button, { variant: 'ghost', className: 'w-full justify-start' })}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return buttons;
  }

  if (isLoadingProjects || (isLoadingDiensten && !reportData.length && selectedProjectId)) {
    return <LoadingScreen message="Weekstaten laden..." />;
  }

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6 min-h-0 bg-slate-50/50">
      <header className="bg-white dark:bg-card p-4 rounded-2xl shadow-sm mb-6 border border-slate-100">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1">
            {renderActionButtons()}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-end gap-3 flex-1 min-w-0 w-full">
            <Select
                value={selectedProjectId || ''}
                onValueChange={(value) => setSelectedProjectId(value || null)}
                disabled={isLoadingProjects}
            >
              <SelectTrigger className="w-full md:w-auto md:max-w-xs h-10 font-bold bg-slate-50/50">
                <SelectValue placeholder="Selecteer een project" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id!}>
                    {project.projectnaam} [{project.projectnummer}]
                    </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-gray-800 p-1 rounded-xl w-full md:w-auto justify-between md:justify-start">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={prevWeek}><ChevronLeft className='h-4 w-4'/></Button>
                <div className="flex items-center gap-1 px-2">
                    <Select value={weekNumber.toString()} onValueChange={handleWeekChange}>
                    <SelectTrigger className="w-[70px] h-8 border-none bg-transparent font-black text-xs shadow-none">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Array.from({ length: 53 }, (_, i) => i + 1).map(week => (
                            <SelectItem key={week} value={week.toString()}>{week}</SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                    <Select value={currentYear.toString()} onValueChange={handleYearChange}>
                    <SelectTrigger className="w-[80px] h-8 border-none bg-transparent font-black text-xs shadow-none">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {years.map(year => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>
                 <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={nextWeek}><ChevronRight className='h-4 w-4'/></Button>
            </div>
            <Input placeholder="Zoek op Postnr." className="w-full md:w-32 h-10 font-bold bg-slate-50/50" />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden bg-white dark:bg-card rounded-2xl shadow-sm border border-slate-100 flex flex-col">
        <div className="overflow-auto flex-1 relative">
            <Table className="min-w-[1200px] border-collapse border-slate-200">
            <TableHeader className="bg-slate-100 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent h-12">
                <TableHead className="w-[100px] p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">Postnr.</TableHead>
                <TableHead className="w-[250px] p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">Omschrijving</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">Eenheid</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">Calc. uren</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">Prijs/1h</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">Tot Vorige</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-primary bg-blue-50/50">In week</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">t/m per.</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">Restant</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-slate-500">% Gereed</TableHead>
                <TableHead className="p-2 border-r border-slate-200 font-black uppercase tracking-widest text-[10px] text-primary bg-blue-50/50 text-right">Totaal Per.</TableHead>
                <TableHead className="p-2 font-black uppercase tracking-widest text-[10px] text-slate-500 text-right">Totaal t/m wk</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {reportData.length > 0 ? (
                reportData.map((item, index) => (
                    <TableRow key={index} className="h-12 hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                    <TableCell className="p-2 border-r border-slate-100 font-black text-xs text-slate-900">{item.postnummer}</TableCell>
                    <TableCell className="p-2 border-r border-slate-100 font-bold text-xs text-slate-600 truncate max-w-[250px]">{item.omschrijving}</TableCell>
                    <TableCell className="p-2 border-r border-slate-100 text-xs font-bold text-slate-400 uppercase">{item.eenheid}</TableCell>
                    <TableCell className="p-2 border-r border-slate-100">
                        <Input
                        type="number"
                        defaultValue={item.calculatieUren.toFixed(2)}
                        className="w-20 h-8 font-black text-[11px] text-center"
                        />
                    </TableCell>
                    <TableCell className="p-2 border-r border-slate-100 text-xs font-bold">{item.prijsPer1h.toFixed(2)}</TableCell>
                    <TableCell className="p-2 border-r border-slate-100 text-xs font-bold text-slate-400">{item.totVorigePeriode.toFixed(2)}</TableCell>
                    <TableCell className="p-2 border-r border-slate-100 bg-blue-50/20 font-black text-xs text-primary">{item.inWeek.toFixed(2)}</TableCell>
                    <TableCell className="p-2 border-r border-slate-100 text-xs font-bold">{item.tmPeriode.toFixed(2)}</TableCell>
                    <TableCell className={cn("p-2 border-r border-slate-100 text-xs font-black", item.restant < 0 ? "text-red-600" : "text-slate-900")}>{item.restant.toFixed(2)}</TableCell>
                    <TableCell className="p-2 border-r border-slate-100">
                        <div className="flex items-center gap-2">
                            <Progress value={item.procentGereed} className="h-1 flex-1" />
                            <span className="text-[10px] font-black tabular-nums">{item.procentGereed.toFixed(0)}%</span>
                        </div>
                    </TableCell>
                    <TableCell className="p-2 border-r border-slate-100 bg-blue-50/20 text-right font-black text-xs text-primary">
                        {formatCurrency(item.totaalInPeriode)}
                    </TableCell>
                    <TableCell className="p-2 text-right font-black text-xs text-slate-900">
                        {formatCurrency(item.totaalTmWeek)}
                    </TableCell>
                    </TableRow>
                ))
                ) : (
                    <TableRow>
                        <TableCell colSpan={12} className="text-center h-64 p-4 border-b">
                            <div className="flex flex-col items-center justify-center h-full">
                                <ClipboardList className="h-12 w-12 text-slate-300 mb-4 opacity-20" />
                                <p className="font-black uppercase text-xs tracking-widest text-slate-400">
                                    { selectedProject ? "Geen werksoorten gevonden voor dit project. Voeg werksoorten toe op de projectpagina." : "Selecteer een project om de weekstaat te bekijken." }
                                </p>
                            </div>
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
            {reportData.length > 0 && (
                <TableFooter className="sticky bottom-0 bg-slate-900 text-white z-10">
                    <TableRow className="h-14 hover:bg-slate-900">
                    <TableCell colSpan={10} className="p-4 border-none text-[10px] font-black uppercase tracking-widest opacity-50">Totaalbedragen voor geselecteerde periode</TableCell>
                    <TableCell className="p-4 text-right font-black text-sm border-none">Subtotaal</TableCell>
                    <TableCell className="p-4 text-right font-black text-lg border-none text-primary-foreground">{formatCurrency(subtotal)}</TableCell>
                    </TableRow>
                </TableFooter>
            )}
            </Table>
        </div>
      </div>
    </div>
  );
}
