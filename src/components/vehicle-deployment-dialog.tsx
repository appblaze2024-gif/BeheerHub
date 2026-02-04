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
import { Truck, User, AlertCircle, CheckCircle2, Clock, Power, PowerOff } from 'lucide-react';
import type { Dienst, Voertuig, Machine, Medewerker } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VehicleDeploymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekDays: Date[];
  diensten: Dienst[] | null;
  allEquipment: (Voertuig & { __type: 'voertuig' } | Machine & { __type: 'machine' })[];
  unavailableVehicles: Record<string, string[]>;
  onToggleUnavailability: (dateKey: string, vehicleId: string, checked: boolean) => void;
  medewerkers: Medewerker[] | null;
  canEdit?: boolean;
}

export function VehicleDeploymentDialog({
  open,
  onOpenChange,
  weekDays,
  diensten,
  allEquipment,
  unavailableVehicles,
  onToggleUnavailability,
  medewerkers,
  canEdit = false,
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
            isUnavailable,
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
      <DialogContent className="sm:max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
            <Truck className="h-6 w-6 text-primary" />
            Voertuigen & Machines Planning
          </DialogTitle>
          <DialogDescription className="font-medium">
            Beheer de beschikbaarheid en bekijk de inzet van materieel voor de geselecteerde werkdag.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b bg-muted/20">
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {weekDays.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const isSelected = selectedDay === dayStr;
                    return (
                        <Button
                            key={dayStr}
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedDay(dayStr)}
                            className={cn(
                                "flex flex-col h-auto py-2 px-5 min-w-[100px] border-2 transition-all",
                                isSelected ? "border-primary shadow-md scale-105" : "border-transparent opacity-70 hover:opacity-100"
                            )}
                        >
                            <span className={cn("text-[10px] uppercase font-black tracking-widest", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>{format(day, 'eeee', { locale: nl })}</span>
                            <span className="text-sm font-black">{format(day, 'dd MMM', { locale: nl })}</span>
                        </Button>
                    );
                })}
            </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 grid grid-cols-3 gap-4 bg-muted/10 border-b">
                <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest mb-1">Ingepland</p>
                            <p className="text-4xl font-black text-blue-700 dark:text-blue-300 leading-none">{scheduledCount}</p>
                        </div>
                        <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-full">
                            <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] text-green-600 dark:text-green-400 font-black uppercase tracking-widest mb-1">Beschikbaar</p>
                            <p className="text-4xl font-black text-green-700 dark:text-green-300 leading-none">{availableCount}</p>
                        </div>
                        <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded-full">
                            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] text-red-600 dark:text-red-400 font-black uppercase tracking-widest mb-1">Uit Inzet</p>
                            <p className="text-4xl font-black text-red-700 dark:text-red-300 leading-none">{unavailableCount}</p>
                        </div>
                        <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded-full">
                            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <ScrollArea className="flex-1 p-6 bg-slate-50 dark:bg-slate-900/20">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-10">
                    {deploymentData.map(item => (
                        <div 
                            key={item.id}
                            className={cn(
                                "flex flex-col border-2 rounded-2xl overflow-hidden transition-all duration-200 shadow-sm group",
                                item.status === 'scheduled' && "border-blue-200 bg-blue-50/20 dark:bg-blue-950/10",
                                item.status === 'unavailable' && "border-red-200 bg-red-50/20 dark:bg-red-950/10",
                                item.status === 'available' && "border-slate-200 bg-card hover:border-primary/30 hover:shadow-md"
                            )}
                        >
                            <div className={cn(
                                "p-4 flex items-start justify-between border-b-2",
                                item.status === 'scheduled' && "bg-blue-100/40 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900",
                                item.status === 'unavailable' && "bg-red-100/40 dark:bg-red-900/20 border-red-100 dark:border-red-900",
                                item.status === 'available' && "bg-muted/30 border-slate-100 dark:border-slate-800"
                            )}>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-black text-xl tracking-tight truncate leading-none">{item.name}</h4>
                                        <Badge variant="outline" className="text-[9px] h-4 uppercase font-black bg-background/80 tracking-widest border-2">
                                            {item.type}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground font-bold truncate uppercase tracking-tighter">{item.merk} {item.model}</p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className={cn(
                                        "h-3 w-3 rounded-full",
                                        item.status === 'scheduled' && "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse",
                                        item.status === 'unavailable' && "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
                                        item.status === 'available' && "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                                    )} />
                                    
                                    {canEdit && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className={cn(
                                                            "h-8 w-8 rounded-full transition-colors",
                                                            item.isUnavailable 
                                                                ? "text-red-600 hover:text-red-700 hover:bg-red-100" 
                                                                : "text-slate-400 hover:text-red-600 hover:bg-slate-100"
                                                        )}
                                                        onClick={() => onToggleUnavailability(selectedDay, item.id, !item.isUnavailable)}
                                                    >
                                                        {item.isUnavailable ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{item.isUnavailable ? "Beschikbaar maken" : "Markeer als defect/beurt"}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                </div>
                            </div>
                            <div className="p-4 flex-1">
                                {item.status === 'scheduled' ? (
                                    <div className="space-y-3">
                                        {item.assignments.map((as, idx) => (
                                            <div key={idx} className="flex flex-col gap-2 p-3 rounded-xl bg-background/80 border-2 border-blue-100 dark:border-blue-900 shadow-sm">
                                                <div className="flex items-center gap-2 text-blue-900 dark:text-blue-100 font-black text-xs uppercase tracking-tight">
                                                    <User className="h-4 w-4 text-blue-500" />
                                                    <span className="truncate">{as.medewerkerName}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                                                        <Clock className="h-3.5 w-3.5" />
                                                        {as.times}
                                                    </div>
                                                    <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest px-2 py-0 h-5">
                                                        {as.werksoort}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : item.status === 'unavailable' ? (
                                    <div className="flex flex-col items-center justify-center py-6 text-center">
                                        <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full mb-3">
                                            <AlertCircle className="h-8 w-8 text-red-500 opacity-80" />
                                        </div>
                                        <p className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-widest">Niet inzetbaar</p>
                                        <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase">Onderhoud of defect</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-6 text-center">
                                        <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full mb-3 transition-transform group-hover:scale-110">
                                            <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
                                        </div>
                                        <p className="text-sm font-black text-green-600 dark:text-green-400 uppercase tracking-widest">Vrij voor inzet</p>
                                        <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase">Geen diensten toegewezen</p>
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
