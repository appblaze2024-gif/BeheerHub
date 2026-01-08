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
import { Printer, Upload, Calendar, CalendarDays } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';

type Project = {
  id: string;
  projectnaam: string;
  projectnummer: string;
};

export default function WeeklyReportsPage() {
  const firestore = useFirestore();
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | undefined>();

  const projectsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } =
    useCollection<Project>(projectsCollection);
    
  React.useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const formatCurrency = (value: number) => {
    return `€ ${value.toLocaleString('nl-NL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const reportData = [
    {
      postnummer: '00001',
      omschrijving: 'veegkipper incl. chauffeur',
      eenheid: 'stuk',
      calculatieUren: 1,
      prijsPer1h: 89.36,
      totVorigePeriode: 0.0,
      inWeek: 8.0,
      tmPeriode: 8.0,
      restant: -7.0,
      procentGereed: 800.0,
      totaalInPeriode: 714.88,
      totaalTmWeek: 714.88,
    },
  ];
  
  const subtotal = reportData.reduce((acc, item) => acc + item.totaalInPeriode, 0);

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-gray-50 dark:bg-gray-900/50">
      <header className="bg-white dark:bg-card p-4 rounded-lg shadow-sm mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Printer className="mr-2" /> Afdrukken
            </Button>
            <Button variant="outline">
              <Upload className="mr-2" /> Importeren
            </Button>
            <Button variant="outline">
              <Calendar className="mr-2" /> Termijn
            </Button>
            <Button variant="outline">
              <CalendarDays className="mr-2" /> Maand
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Project:</span>
            <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                disabled={isLoadingProjects}
            >
              <SelectTrigger className="w-[250px]">
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
            <span className="text-sm font-medium">Weekcode:</span>
            <Select defaultValue="2">
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="2026">
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-md">
              <span>05-01-2026 - 11-01-2026</span>
              <span className="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-full h-5 w-5 flex items-center justify-center text-xs">
                1
              </span>
            </div>
            <Input placeholder="Postnummer" className="w-[150px]" />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto bg-white dark:bg-card rounded-lg shadow-sm">
        <Table className="min-w-full">
          <TableHeader className="bg-gray-100/50 dark:bg-gray-800/20">
            <TableRow>
              <TableHead className="w-[100px]">Postnummer</TableHead>
              <TableHead className="w-[250px]">Omschrijving</TableHead>
              <TableHead>Eenheid</TableHead>
              <TableHead>Calculatie uren</TableHead>
              <TableHead>Prijs per 1h</TableHead>
              <TableHead>Tot vorige periode</TableHead>
              <TableHead className="bg-yellow-100/50 dark:bg-yellow-900/20">In week</TableHead>
              <TableHead>t/m periode</TableHead>
              <TableHead>Restant</TableHead>
              <TableHead>% Gereed</TableHead>
              <TableHead className="bg-yellow-100/50 dark:bg-yellow-900/20 text-right">Totaal in periode</TableHead>
              <TableHead className="text-right">totaal t/m week</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportData.map((item, index) => (
              <TableRow key={index}>
                <TableCell>{item.postnummer}</TableCell>
                <TableCell>{item.omschrijving}</TableCell>
                <TableCell>{item.eenheid}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={item.calculatieUren}
                    className="w-20"
                  />
                </TableCell>
                <TableCell>{item.prijsPer1h.toFixed(2)}</TableCell>
                <TableCell>{item.totVorigePeriode.toFixed(2)}</TableCell>
                <TableCell className="bg-yellow-100/50 dark:bg-yellow-900/20">{item.inWeek.toFixed(2)}</TableCell>
                <TableCell>{item.tmPeriode.toFixed(2)}</TableCell>
                <TableCell className={item.restant < 0 ? "text-red-600" : ""}>{item.restant.toFixed(2)}</TableCell>
                <TableCell>{item.procentGereed.toFixed(1)}</TableCell>
                <TableCell className="bg-yellow-100/50 dark:bg-yellow-900/20 text-right font-medium">
                  {formatCurrency(item.totaalInPeriode)}
                </TableCell>
                <TableCell className="text-right font-medium">
                   {formatCurrency(item.totaalTmWeek)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-gray-100/50 dark:bg-gray-800/20">
              <TableCell colSpan={10} />
              <TableCell className="bg-yellow-100/50 dark:bg-yellow-900/20 text-right font-bold">Subtotaal</TableCell>
              <TableCell className="text-right font-bold">{formatCurrency(subtotal)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
