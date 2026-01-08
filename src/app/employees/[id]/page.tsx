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
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { doc } from 'firebase/firestore';
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
  useMemoFirebase,
  updateDocumentNonBlocking,
} from '@/firebase';
import type { Medewerker } from '@/lib/types';
import { MedewerkerDialog } from '@/components/medewerker-dialog';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@/components/ui/dropdown-menu';

function DetailField({
  label,
  value,
  fieldName,
  medewerkerId,
}: {
  label: string;
  value: string | undefined | null;
  fieldName: keyof Medewerker;
  medewerkerId: string;
}) {
  const firestore = useFirestore();
  const [isEditing, setIsEditing] = React.useState(false);
  const [currentValue, setCurrentValue] = React.useState(value || '');

  React.useEffect(() => {
    setCurrentValue(value || '');
  }, [value]);

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
    <div className="flex items-center justify-between border-b py-2">
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isEditing ? (
          <Input
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="h-8 text-sm"
            autoFocus
          />
        ) : (
          <p className="text-sm font-medium min-h-[2rem] flex items-center">{currentValue || '-'}</p>
        )}
      </div>
      <div className="flex items-center gap-1 ml-2">
        {isEditing ? (
          <>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave}>
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}

function AfwezigheidTab() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());

  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const end = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start, end });
  const weekNumber = getISOWeek(currentDate);

  const prevWeek = () => setCurrentDate(sub(currentDate, { weeks: 1 }));
  const nextWeek = () => setCurrentDate(add(currentDate, { weeks: 1 }));
  const goToToday = () => setCurrentDate(new Date());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-8" onClick={goToToday}>Vandaag</Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-sm font-semibold flex items-center gap-2">
                <span className='capitalize'>{format(start, 'd MMM')} - {format(end, 'd MMM yyyy', { locale: nl })}</span>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">Week {weekNumber}</span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="text-center text-xs font-semibold text-muted-foreground">
                  {format(day, 'E', { locale: nl })}
                </div>
              ))}
              {weekDays.map((day) => (
                <div 
                  key={day.toISOString()} 
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'p-2 border rounded-md h-16 cursor-pointer', 
                    isSameDay(day, selectedDate) && 'bg-primary/20 border-primary',
                    isToday(day) && 'bg-blue-100 dark:bg-blue-900/30'
                  )}
                >
                  <span className={cn(
                    "text-sm",
                     isToday(day) && 'font-bold text-primary',
                     isSameDay(day, selectedDate) && 'text-black dark:text-white font-bold'
                    )}>{format(day, 'd')}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-4 mt-4 text-xs">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>Goedgekeurd</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-yellow-500" />
                <span>Onbeslist</span>
              </div>
              <Button variant="link" size="sm" className="text-xs">
                <CalendarDays className="h-3 w-3 mr-1" />
                Toevoegen aan kalender
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Afwezigheid</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="aanvragen">
              <div className="flex justify-between items-start">
                <TabsList>
                  <TabsTrigger value="aanvragen">Aanvragen</TabsTrigger>
                  <TabsTrigger value="nagekeken">Nagekeken</TabsTrigger>
                  <TabsTrigger value="verleden">Verleden</TabsTrigger>
                </TabsList>
                <Button><Plus className="h-4 w-4 mr-2" />Afwezigheid toevoegen</Button>
              </div>
              <TabsContent value="aanvragen" className="mt-6">
                <div className="text-center text-muted-foreground py-12">
                  <CalendarDays className="h-12 w-12 mx-auto mb-2" />
                  <p>Geen verzoeken</p>
                  <Button variant="link" size="sm">Nagekeken afwezigheden bekijken</Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saldo's</CardTitle>
            <p className="text-xs text-muted-foreground">1 januari - 31 december</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg p-3">
              <p className="text-sm font-medium">Verlof</p>
              <p className="text-xl font-bold text-primary">0u 0m</p>
              <p className="text-xs text-muted-foreground">Resterend</p>
            </div>
             <div className="border rounded-lg p-3">
              <p className="text-sm font-medium">ADV</p>
              <p className="text-xl font-bold text-primary">0u 0m</p>
              <p className="text-xs text-muted-foreground">Resterend</p>
            </div>
             <div className="border rounded-lg p-3">
              <p className="text-sm font-medium">TVT</p>
              <p className="text-xl font-bold text-primary">0u 0m</p>
              <p className="text-xs text-muted-foreground">Resterend</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RoosterTab() {
  const [currentDate, setCurrentDate] = React.useState(new Date());

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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className='flex items-center gap-4'>
            <h2 className="text-xl font-bold capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: nl })}
            </h2>
            <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                    <ChevronLeft className="h-5 w-5" />
                </Button>
                 <span className='text-sm font-medium text-muted-foreground'>
                    {format(firstDayOfMonth, 'd MMM', { locale: nl })} - {format(lastDayOfMonth, 'd MMM', { locale: nl })}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
                    <ChevronRight className="h-5 w-5" />
                </Button>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline">Acties</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {/* Acties hier */}
                </DropdownMenuContent>
            </DropdownMenu>
            <Button>
                <Plus className='h-4 w-4 mr-2'/>
                Beschikbaarheid toevoegen
            </Button>
        </div>
      </div>
      <div className="flex-1 grid grid-rows-[auto_1fr] border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[repeat(7,1fr)_120px] text-xs font-semibold text-center border-b">
           {daysOfWeek.map((day) => (
             <div key={day} className="p-2 border-r last:border-r-0">{day}</div>
           ))}
           <div className='p-2 bg-muted/50'>Beschikbaarheid</div>
        </div>
        <div className="grid grid-cols-1 grid-rows-5 flex-1 bg-gray-200">
           {weeks.map((weekStart, weekIndex) => {
              const daysInWeek = eachDayOfInterval({start: weekStart, end: endOfWeek(weekStart, {weekStartsOn: 1})})
              return (
                <div key={weekIndex} className="grid grid-cols-[repeat(7,1fr)_120px] border-t first:border-t-0 bg-white">
                  {daysInWeek.map((day, dayIndex) => (
                    <div key={day.toISOString()} className={cn("p-2 border-r", !isSameMonth(day, currentDate) && 'bg-muted/30')}>
                        <span className={cn('text-xs font-semibold', !isSameMonth(day, currentDate) && 'text-muted-foreground/50', isToday(day) && 'flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white')}>{format(day, 'd')}</span>
                    </div>
                  ))}
                  <div className='p-2 flex items-center justify-center'>
                     {/* Dummy data, replace with real logic */}
                     {format(weekStart, 'w') % 2 === 0 && <CheckCircle className='h-5 w-5 text-green-500'/>}
                  </div>
                </div>
              )
           })}
        </div>
      </div>
    </div>
  )
}

export default function EmployeeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const firestore = useFirestore();
  const id = params.id as string;
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const employeeRef = useMemoFirebase(() => {
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        Medewerker wordt geladen...
      </div>
    );
  }

  if (!medewerker) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p>Medewerker niet gevonden.</p>
        <Button onClick={() => router.back()} className="mt-4">
          Terug
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="p-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-12 w-12">
            <AvatarImage
              src={medewerker.avatarUrl}
              alt={`${medewerker.voornaam} ${medewerker.achternaam}`}
            />
            <AvatarFallback className="text-xl">
              {getInitials(medewerker.voornaam, medewerker.achternaam)}
            </AvatarFallback>
          </Avatar>
          <div className='flex-1 flex justify-between items-center'>
            <h1 className="text-2xl font-bold">{`${medewerker.voornaam || ''} ${
              medewerker.tussenvoegsel || ''
            } ${medewerker.achternaam || ''}`.trim()}</h1>
            <Button onClick={handleEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Bewerken
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <Tabs defaultValue="overzicht" className="flex-1 flex flex-col min-h-0">
          <div className="px-6">
            <TabsList>
              <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
              <TabsTrigger value="afwezigheid">Afwezigheid</TabsTrigger>
              <TabsTrigger value="rooster">Rooster</TabsTrigger>
              <TabsTrigger value="contracten">Contracten</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overzicht" className="flex-1 overflow-y-auto">
             <div className="p-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Persoonsgegevens</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-x-12 md:grid-cols-3">
                    <div>
                      <DetailField label="Voornaam" value={medewerker.voornaam} fieldName="voornaam" medewerkerId={id} />
                      <DetailField label="Tussenvoegsel" value={medewerker.tussenvoegsel} fieldName="tussenvoegsel" medewerkerId={id} />
                      <DetailField label="Achternaam" value={medewerker.achternaam} fieldName="achternaam" medewerkerId={id} />
                      <DetailField label="Geboortedatum" value={medewerker.geboortedatum} fieldName="geboortedatum" medewerkerId={id} />
                      <DetailField label="Geboorteplaats" value={medewerker.geboorteplaats} fieldName="geboorteplaats" medewerkerId={id} />
                    </div>
                    <div>
                      <DetailField label="Telefoonnr." value={medewerker.telefoonnummer} fieldName="telefoonnummer" medewerkerId={id} />
                      <DetailField label="Mobiel nr." value={medewerker.mobiel} fieldName="mobiel" medewerkerId={id} />
                      <DetailField label="Nood nr." value={medewerker.noodnummer} fieldName="noodnummer" medewerkerId={id} />
                      <DetailField label="Adres" value={medewerker.adres} fieldName="adres" medewerkerId={id} />
                      <DetailField label="Postcode" value={medewerker.postcode} fieldName="postcode" medewerkerId={id} />
                      <DetailField label="Plaats" value={medewerker.plaats} fieldName="plaats" medewerkerId={id} />
                    </div>
                    <div>
                      <DetailField label="Nationaliteit" value={medewerker.nationaliteit} fieldName="nationaliteit" medewerkerId={id} />
                      <DetailField label="BSN" value={medewerker.bsn} fieldName="bsn" medewerkerId={id} />
                      <DetailField label="ID/Paspoort nr." value={medewerker.paspoortnummer} fieldName="paspoortnummer" medewerkerId={id} />
                      <DetailField label="Bankrekening" value={medewerker.bankrekening} fieldName="bankrekening" medewerkerId={id} />
                      <DetailField label="Datum in dienst" value={medewerker.indiensttreding} fieldName="indiensttreding" medewerkerId={id} />
                      <DetailField label="Personeels nr." value={medewerker.personeelsnummer} fieldName="personeelsnummer" medewerkerId={id} />
                    </div>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Persoonlijke bestanden</CardTitle>
                      <div className="flex items-center gap-2">
                        <div className="relative w-48">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="Persoonlijk bestand z..." className="pl-8 h-9" />
                        </div>
                        <Button size="sm"><Plus className="h-4 w-4 mr-2" />Bestand toevoegen</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Paperclip className="mx-auto h-8 w-8" />
                        <p className="mt-2 text-sm">Geen bestanden gevonden</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Persoonlijke notities</CardTitle>
                      <Button size="sm"><Plus className="h-4 w-4 mr-2" />Notitie toevoegen</Button>
                    </CardHeader>
                    <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <FileText className="mx-auto h-8 w-8" />
                        <p className="mt-2 text-sm">Geen notities gevonden</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
            </div>
          </TabsContent>
          <TabsContent value="afwezigheid" className="flex-1 overflow-y-auto">
            <div className="p-6">
                <AfwezigheidTab />
            </div>
          </TabsContent>
          <TabsContent value="rooster" className="flex-1 overflow-y-auto">
            <div className="p-6 h-full flex flex-col">
              <RoosterTab />
            </div>
          </TabsContent>
          <TabsContent value="contracten" className="flex-1 overflow-y-auto">
            <div className="p-6 flex h-full items-center justify-center text-muted-foreground">
              Contracten zijn nog niet geïmplementeerd.
            </div>
          </TabsContent>
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
