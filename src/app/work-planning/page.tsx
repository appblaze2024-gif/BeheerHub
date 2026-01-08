'use client';

import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  add,
  sub,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { collection } from 'firebase/firestore';

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
import { cn } from '@/lib/utils';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { Medewerker } from '@/lib/types';


const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
};

export default function WorkPlanningPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const firestore = useFirestore();

  const medewerkersCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'medewerkers');
  }, [firestore]);

  const { data: medewerkers, isLoading } =
    useCollection<Medewerker>(medewerkersCollection);

  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const end = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start, end });

  const prevWeek = () => setCurrentDate(sub(currentDate, { weeks: 1 }));
  const nextWeek = () => setCurrentDate(add(currentDate, { weeks: 1 }));

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      <PageHeader title="Bezetting">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Project:
          </span>
          <Select defaultValue="aalsmeer">
            <SelectTrigger className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aalsmeer">
                Gemeente Aalsmeer [DVO Aalsmeer]
              </SelectItem>
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
          {isLoading ? (
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
                      <span>0u 0m / 8,00u</span>
                    </div>
                    <p className="text-xs text-green-600 font-semibold">
                      +8u 0m
                    </p>
                  </div>
                </div>
                {weekDays.map((day, index) => (
                  <div
                    key={day.toISOString()}
                    className="p-2 border-b border-r min-h-[80px]"
                  >
                    {/* Placeholder for planning items */}
                  </div>
                ))}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
