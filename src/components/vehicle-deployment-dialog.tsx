'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Truck, User, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import type { Dienst, Voertuig, Machine, Medewerker } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface VehicleDeploymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekDays: Date[];
  diensten: Dienst[] | null;
  allEquipment: (Voertuig & { __type: 'voertuig' } | Machine & { __type: 'machine' })[];
  unavailableVehicles: Record<string, string[]>;
  medewerkers: Medewerker[] | null;
}

export function VehicleDeploymentDialog({
  open,
  onOpenChange,
  weekDays,
  diensten,
  allEquipment,
  unavailableVehicles,
  medewerkers,
}: VehicleDeploymentDialogProps) {
  const [selectedDay, setSelectedDay] = React.useState<string>('');

  React.useEffect(() => {
    if (open && weekDays.length > 0) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const isTodayInWeek = weekDays.some(d => format(d, 'yyyy-MM-dd') === todayStr);
        setSelectedDay(isTodayInWeek ? todayStr : format(weekDays[0], 'yyyy-MM-dd'));
    }
  }, [open, weekDays]);

  const deploymentData = React.useMemo(() => {
    if (!selectedDay) return [];

    const unavailableIds = unavailableVehicles[selectedDay] || [];
    const dayDiensten = diensten?.filter(d => d.datum === selectedDay) || [];
    
    return allEquipment.map(item => {
        const id = item.id;
        const name = (item as any).voertuignummer || (item as any).machinenummer || item.id;
        const isUnavailable = unavailableIds.includes(id);
        
        const assignedDiensten = dayDiensten.filter(d => d.voertuignummer === name || d.voertuignummer === id);
        const isScheduled = assignedDiensten.length > 0;
        
        let status: 'scheduled' | 'unavailable' | 'available' = 'available';
        if (isUnavailable) status = 'unavailable';
        else if (isScheduled) status = 'scheduled';

        return {
            id,
            name,
            merk: item.merk,
            model: item.model,
            type: item.__type,
            status,
            assignments: assignedDiensten.map(d => {
                const medewerker = medewerkers?.find(m => m.id === d.medewerkerId);
                return {
                    medewerkerName: medewerker ? `${medewerker.voornaam || ''} ${medewerker.achternaam || ''}`.trim() : 'Onbekend',
                    times: `${d.starttijd} - ${d.eindtijd}`,
                    werksoort: d.werksoort
                };
            })
        };
    });
  }, [selectedDay, allEquipment, unavailableVehicles, diensten, medewerkers]);

  const scheduledCount = deploymentData.filter(d => d.status === 'scheduled').length;
  const availableCount = deploymentData.filter(d => d.status === 'available').length;
  const unavailableCount = deploymentData.filter(d => d.status === 'unavailable').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Voertuigeninzet
          </DialogTitle>
          <DialogDescription>
            Status en inzet van alle voertuigen en machines voor de geselecteerde dag.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-2 border-b bg-muted/10">
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {weekDays.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    return (
                        <Button
                            key={dayStr}
                            variant={selectedDay === dayStr ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedDay(dayStr)}
                            className={cn(
                                "flex flex-col h-auto py-1.5 px-4 min-w-[90px] border-2",
                                selectedDay === dayStr ? "border-primary" : "border-transparent"
                            )}
                        >
                            <span className="text-[10px] uppercase opacity-70 font-bold">{format(day, 'eeee', { locale: nl })}</span>
                            <span className="text-sm font-bold">{format(day, 'dd MMM', { locale: nl })}</span>
                        </Button>
                    );
                })}
            </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 grid grid-cols-3 gap-4 bg-muted/30">
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm">
                    <CardContent className="p-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">Ingepland</p>
                            <p className="text-3xl font-black text-blue-700 dark:text-blue-300">{scheduledCount}</p>
                        </div>
                        <Clock className="h-8 w-8 text-blue-500/40" />
                    </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 shadow-sm">
                    <CardContent className="p-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-green-600 dark:text-green-400 font-bold uppercase tracking-wider">Vrij</p>
                            <p className="text-3xl font-black text-green-700 dark:text-green-300">{availableCount}</p>
                        </div>
                        <CheckCircle2 className="h-8 w-8 text-green-500/40" />
                    </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 shadow-sm">
                    <CardContent className="p-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-red-600 dark:text-red-400 font-bold uppercase tracking-wider">Defect/Beurt</p>
                            <p className="text-3xl font-black text-red-700 dark:text-red-300">{unavailableCount}</p>
                        </div>
                        <AlertCircle className="h-8 w-8 text-red-500/40" />
                    </CardContent>
                </Card>
            </div>

            <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
                    {deploymentData.map(item => (
                        <div 
                            key={item.id}
                            className={cn(
                                "flex flex-col border rounded-xl overflow-hidden transition-all shadow-sm",
                                item.status === 'scheduled' && "border-blue-200 bg-blue-50/40 dark:bg-blue-950/20",
                                item.status === 'unavailable' && "border-red-200 bg-red-50/40 dark:bg-red-950/20 grayscale-[0.5]",
                                item.status === 'available' && "border-slate-200 bg-card hover:border-slate-300"
                            )}
                        >
                            <div className={cn(
                                "p-3 flex items-start justify-between border-b",
                                item.status === 'scheduled' && "bg-blue-100/50 dark:bg-blue-900/30",
                                item.status === 'unavailable' && "bg-red-100/50 dark:bg-red-900/30",
                                item.status === 'available' && "bg-muted/30"
                            )}>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <h4 className="font-black text-lg truncate leading-tight">{item.name}</h4>
                                        <Badge variant="outline" className="text-[9px] h-4 uppercase font-bold bg-background/50">
                                            {item.type}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground font-medium truncate">{item.merk} {item.model}</p>
                                </div>
                                <div className={cn(
                                    "h-2.5 w-2.5 rounded-full mt-1.5 shrink-0",
                                    item.status === 'scheduled' && "bg-blue-500 animate-pulse",
                                    item.status === 'unavailable' && "bg-red-500",
                                    item.status === 'available' && "bg-green-500"
                                )} />
                            </div>
                            <div className="p-3 flex-1">
                                {item.status === 'scheduled' ? (
                                    <div className="space-y-3">
                                        {item.assignments.map((as, idx) => (
                                            <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-lg bg-background/60 border border-blue-100 dark:border-blue-900">
                                                <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 font-bold text-xs">
                                                    <User className="h-3.5 w-3.5" />
                                                    <span className="truncate">{as.medewerkerName}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] font-medium pl-5 text-muted-foreground">
                                                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {as.times}</span>
                                                    <Badge variant="secondary" className="text-[9px] h-4 py-0 font-normal">{as.werksoort}</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : item.status === 'unavailable' ? (
                                    <div className="flex flex-col items-center justify-center py-4 text-center">
                                        <AlertCircle className="h-6 w-6 text-red-500 mb-2 opacity-50" />
                                        <p className="text-xs font-bold text-red-600/70 dark:text-red-400/70 uppercase tracking-tighter">Niet beschikbaar</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-4 text-center">
                                        <CheckCircle2 className="h-6 w-6 text-green-500 mb-2 opacity-50" />
                                        <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-tighter">Vrij voor inzet</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
