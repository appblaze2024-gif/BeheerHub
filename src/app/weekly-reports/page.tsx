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
import { Printer, Upload, Calendar, CalendarDays, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useCollection, useFirestore } from '@/firebase';
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
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const isMobile = useIsMobile(1024);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } =
    useCollection<Project>(projectsCollection);

  const selectedProject = React.useMemo(() => {
    return projects?.find((p) => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  const dienstenQuery = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    const startDateString = format(start, 'yyyy-MM-dd');
    const endDateString = format(end, 'yyyy-MM-dd');

    return query(
      collection(firestore, 'projects', selectedProjectId, 'diensten'),
      where('datum', '>=', startDateString),
      where('datum', '<=', endDateString)
    );
  }, [firestore, selectedProjectId, currentDate]);


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
      <Button key="print" variant="outline">
        <Printer className="mr-2 h-4 w-4" /> Afdrukken
      </Button>,
      <Button key="import" variant="outline">
        <Upload className="mr-2 h-4 w-4" /> Importeren
      </Button>,
      <Button key="termijn" variant="outline">
        <Calendar className="mr-2 h-4 w-4" /> Termijn
      </Button>,
      <Button key="maand" variant="outline">
        <CalendarDays className="mr-2 h-4 w-4" /> Maand
      </Button>,
    ];

    if (isMobile) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-background">
      <header className="bg-white dark:bg-card p-4 rounded-lg shadow-sm mb-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            {renderActionButtons()}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-end gap-2 flex-1 min-w-0 w-full">
            <Select
                value={selectedProjectId || ''}
                onValueChange={(value) => setSelectedProjectId(value || null)}
                disabled={isLoadingProjects}
            >
              <SelectTrigger className="w-full md:w-auto md:max-w-xs">
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
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-md">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevWeek}><ChevronLeft className='h-4 w-4'/></Button>
                <Select value={weekNumber.toString()} onValueChange={handleWeekChange}>
                <SelectTrigger className="w-[80px] h-8">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {Array.from({ length: 53 }, (_, i) => i + 1).map(week => (
                        <SelectItem key={week} value={week.toString()}>{week}</SelectItem>
                    ))}
                </SelectContent>
                </Select>
                <Select value={currentYear.toString()} onValueChange={handleYearChange}>
                <SelectTrigger className="w-[100px] h-8">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                     {years.map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                </SelectContent>
                </Select>
                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextWeek}><ChevronRight className='h-4 w-4'/></Button>
            </div>
            <Input placeholder="Postnummer" className="w-full md:w-auto h-10" />
          </div>
        </div>
      </header>

      <div className="overflow-auto bg-white dark:bg-card rounded-lg shadow-sm">
        <Table className="min-w-full border-collapse h-full">
          <TableHeader className="bg-gray-100/50 dark:bg-gray-800/20 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[100px] p-1 border-t border-b border-l border-r border-black">Postnummer</TableHead>
              <TableHead className="w-[250px] p-1 border-t border-b border-r border-black">Omschrijving</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black">Eenheid</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black">Calculatie uren</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black">Prijs per 1h</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black">Tot vorige periode</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black bg-yellow-100/50 dark:bg-yellow-900/20">In week</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black">t/m periode</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black">Restant</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black">% Gereed</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black bg-yellow-100/50 dark:bg-yellow-900/20 text-right">Totaal in periode</TableHead>
              <TableHead className="p-1 border-t border-b border-r border-black">totaal t/m week</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportData.length > 0 ? (
              reportData.map((item, index) => (
                <TableRow key={index} className="h-auto">
                  <TableCell className="p-1 border-b border-l border-r border-black">{item.postnummer}</TableCell>
                  <TableCell className="p-1 border-b border-r border-black">{item.omschrijving}</TableCell>
                  <TableCell className="p-1 border-b border-r border-black">{item.eenheid}</TableCell>
                  <TableCell className="p-1 border-b border-r border-black">
                    <Input
                      type="number"
                      defaultValue={item.calculatieUren.toFixed(2)}
                      className="w-24 h-8"
                    />
                  </TableCell>
                  <TableCell className="p-1 border-b border-r border-black">{item.prijsPer1h.toFixed(2)}</TableCell>
                  <TableCell className="p-1 border-b border-r border-black">{item.totVorigePeriode.toFixed(2)}</TableCell>
                  <TableCell className="p-1 border-b border-r border-black bg-yellow-100/50 dark:bg-yellow-900/20 font-medium">{item.inWeek.toFixed(2)}</TableCell>
                  <TableCell className="p-1 border-b border-r border-black">{item.tmPeriode.toFixed(2)}</TableCell>
                  <TableCell className={`p-1 border-b border-r border-black ${item.restant < 0 ? "text-red-600" : ""}`}>{item.restant.toFixed(2)}</TableCell>
                  <TableCell className="p-1 border-b border-r border-black">{item.procentGereed.toFixed(1)}%</TableCell>
                  <TableCell className="p-1 border-b border-r border-black bg-yellow-100/50 dark:bg-yellow-900/20 text-right font-medium">
                    {formatCurrency(item.totaalInPeriode)}
                  </TableCell>
                  <TableCell className="p-1 border-b border-r border-black text-right font-medium">
                    {formatCurrency(item.totaalTmWeek)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
                 <TableRow>
                    <TableCell colSpan={12} className="text-center h-24 p-1 border-b border-l border-r border-black">
                        { selectedProject ? "Geen werksoorten gevonden voor dit project. Voeg werksoorten toe op de projectpagina." : "Selecteer een project om de weekstaat te bekijken." }
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
          {reportData.length > 0 && (
            <TableFooter className="sticky bottom-0 bg-gray-50 dark:bg-gray-900/50">
                <TableRow className="h-auto">
                <TableCell colSpan={10} className="p-1 border-b border-l border-r border-black" />
                <TableCell className="p-1 border-b border-r border-black text-right font-bold bg-gray-100/50 dark:bg-gray-800/20">Subtotaal</TableCell>
                <TableCell className="p-1 border-b border-r border-black text-right font-bold bg-gray-100/50 dark:bg-gray-800/20">{formatCurrency(subtotal)}</TableCell>
                </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
