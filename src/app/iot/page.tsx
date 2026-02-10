
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Wifi, Database, Cpu, Plus, MapPin, Battery, Activity, Loader2, Signal, SignalLow, Trash2, MoreVertical, Terminal, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFirestore, useCollection, deleteDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { MapboxView } from '@/components/mapbox-view';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { AddSensorDialog } from '@/components/add-sensor-dialog';
import type { Sensor } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
} from '@/components/ui/alert-dialog';
import { firebaseConfig } from '@/firebase/config';

export default function IoTPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [selectedSensorId, setSelectedSensorId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const sensorsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'sensors');
  }, [firestore]);

  const { data: sensors, isLoading } = useCollection<Sensor>(sensorsQuery);

  const selectedSensor = React.useMemo(() => 
    sensors?.find(s => s.id === selectedSensorId), 
    [sensors, selectedSensorId]
  );

  const handleDelete = async (id: string) => {
    if (!firestore) return;
    await deleteDocumentNonBlocking(doc(firestore, 'sensors', id));
    if (selectedSensorId === id) setSelectedSensorId(null);
    toast({ title: 'Sensor verwijderd', description: 'De koppeling is succesvol verbroken.' });
  };

  const getStatusBadge = (status: Sensor['status']) => {
    switch (status) {
      case 'Online': return <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50">Live</Badge>;
      case 'Offline': return <Badge variant="destructive">Offline</Badge>;
      case 'Batterij laag': return <Badge variant="outline" className="text-orange-600 border-orange-600 bg-orange-50">Accu Laag</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Gekopieerd', description: 'API URL naar klembord gekopieerd.' });
  };

  // Construct the REST API URL for the sensor
  const apiEndpoint = selectedSensor 
    ? `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/sensors/${selectedSensor.id}?key=${firebaseConfig.apiKey}`
    : '';

  return (
    <div className="flex flex-col flex-1 p-4 min-h-0 bg-background overflow-hidden">
      <PageHeader 
        title="IoT & Sensorbeheer" 
        description="Beheer hardware-koppelingen via unieke serienummers."
        className="p-0 mb-4"
      >
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nieuwe Sensor Koppelen
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="shadow-none border-slate-200">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actieve Koppelingen</p>
              <p className="text-xl font-black">{sensors?.length || 0}</p>
            </div>
            <Wifi className="h-5 w-5 text-green-500" />
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Inkomende Data</p>
              <p className="text-xl font-black">Live</p>
            </div>
            <Activity className="h-5 w-5 text-blue-500" />
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Systeem Gateway</p>
              <p className="text-xl font-black">Firestore REST</p>
            </div>
            <Terminal className="h-5 w-5 text-purple-500" />
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-0 overflow-hidden">
        {/* Sensor Lijst */}
        <Card className="xl:col-span-4 flex flex-col shadow-none overflow-hidden border-slate-200">
          <CardHeader className="p-3 border-b bg-muted/20">
            <CardTitle className="text-xs font-bold uppercase tracking-tight">Geregistreerde Serienummers</CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/20">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : sensors && sensors.length > 0 ? (
              <div className="divide-y divide-slate-200">
                {sensors.map(sensor => (
                  <div 
                    key={sensor.id} 
                    className={cn(
                      "p-3 flex items-start gap-3 cursor-pointer hover:bg-white transition-all",
                      selectedSensorId === sensor.id && "bg-white dark:bg-zinc-900 shadow-sm border-l-4 border-l-primary pl-2"
                    )}
                    onClick={() => setSelectedSensorId(sensor.id)}
                  >
                    <div className={cn(
                      "p-2 rounded-lg",
                      sensor.status === 'Online' ? "bg-green-100 text-green-700" : "bg-zinc-200 text-zinc-500"
                    )}>
                      <Cpu className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-xs truncate">{sensor.name}</p>
                        <p className="text-[9px] text-muted-foreground font-mono bg-slate-200 px-1 rounded uppercase">{sensor.id}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[9px] h-4 font-bold">{sensor.type}</Badge>
                        {getStatusBadge(sensor.status)}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" /> Ontkoppelen
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Sensor ontkoppelen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Weet je zeker dat je serienummer '{sensor.id}' wilt verwijderen? De hardware zal geen data meer kunnen opslaan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuleren</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(sensor.id)} className="bg-destructive text-destructive-foreground">Verwijderen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-12 text-muted-foreground">
                <SignalLow className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-widest">Geen koppelingen</p>
                <p className="text-[10px] mt-1">Registreer je eerste serienummer om data te ontvangen.</p>
              </div>
            )}
          </div>
        </Card>

        {/* Kaart & Details */}
        <Card className="xl:col-span-8 flex flex-col shadow-none border-slate-200 overflow-hidden">
          <div className="flex-1 relative">
            <MapboxView 
              objects={sensors?.map(s => ({
                id: s.id,
                latitude: s.latitude,
                longitude: s.longitude,
                name: s.name,
                type: s.type
              }))}
              highlightedObject={selectedSensor ? { id: selectedSensor.id, latitude: selectedSensor.latitude, longitude: selectedSensor.longitude } : null}
            />
            
            {selectedSensor && (
              <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col gap-2">
                {/* API Info Card */}
                <Card className="bg-zinc-900 text-zinc-100 border-none shadow-2xl">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                        <Terminal className="h-3 w-3" /> API Endpoint voor deze sensor
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 text-[10px] text-zinc-400 hover:text-white"
                        onClick={() => copyToClipboard(apiEndpoint)}
                      >
                        {copied ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                        {copied ? 'Gekopieerd' : 'Kopieer URL'}
                      </Button>
                    </div>
                    <div className="bg-black/50 p-2 rounded font-mono text-[9px] break-all border border-zinc-800 text-green-400">
                      PATCH {apiEndpoint}
                    </div>
                  </CardContent>
                </Card>

                {/* Status Card */}
                <Card className="bg-background/95 backdrop-blur shadow-xl border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Geselecteerd serienummer</p>
                          <h3 className="text-lg font-black tracking-tight">{selectedSensor.id}</h3>
                          <div className="flex gap-2">
                            <Badge className="bg-primary text-primary-foreground font-bold">{selectedSensor.name}</Badge>
                            {getStatusBadge(selectedSensor.status)}
                          </div>
                        </div>
                        <div className="border-l border-slate-200 pl-4 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold">
                            <Battery className={cn("h-4 w-4", selectedSensor.batteryLevel && selectedSensor.batteryLevel < 20 ? "text-red-500" : "text-green-500")} />
                            <span>{selectedSensor.batteryLevel}% Accu</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{selectedSensor.latitude.toFixed(5)}, {selectedSensor.longitude.toFixed(5)}</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSelectedSensorId(null)}><XIcon className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </Card>
      </div>

      <AddSensorDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
    </div>
  );
}

function XIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
