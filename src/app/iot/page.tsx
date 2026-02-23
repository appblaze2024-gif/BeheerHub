'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { 
  Wifi, 
  Cpu, 
  Plus, 
  MapPin, 
  Loader2, 
  Trash2, 
  MoreVertical, 
  Copy, 
  Check, 
  Info, 
  List,
  Ruler,
  Clock,
  Radio,
  ArrowLeft,
  Settings,
  Code,
  ArrowRight,
  Target,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFirestore, useCollection, deleteDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { MapboxView } from '@/components/mapbox-view';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { Separator } from '@/components/ui/separator';

export default function IoTPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isTablet = useIsMobile(1024);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [selectedSensorId, setSelectedSensorId] = React.useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);

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
      case 'Online': return <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50 text-[9px] h-4">Live</Badge>;
      case 'Offline': return <Badge variant="destructive" className="text-[9px] h-4">Offline</Badge>;
      case 'Batterij laag': return <Badge variant="outline" className="text-orange-600 border-orange-600 bg-orange-50 text-[9px] h-4">Accu</Badge>;
      default: return <Badge variant="secondary" className="text-[9px] h-4">{status}</Badge>;
    }
  };

  const copyToClipboard = (text: string, type: 'url' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
    } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
    }
    toast({ title: 'Gekopieerd', description: 'Inhoud naar klembord gekopieerd.' });
  };

  const apiEndpoint = selectedSensor 
    ? `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/sensors/${selectedSensor.id}?key=${firebaseConfig.apiKey}&updateMask.fieldPaths=vulgraad&updateMask.fieldPaths=currentDistanceCm`
    : '';

  const arduinoCode = selectedSensor ? `/*
 * BEHEERHUB IOT ENGINE - Heltec CubeCell HTCC-AB01
 * Hardware: HTCC-AB01 (HTTC-001)
 * Sensor: TOF10120 (Time-of-Flight Laser Sensor)
 * Transport: LoRaWAN (KPN Things)
 */

#include "LoRaWan_APP.h"
#include "Arduino.h"
#include <Wire.h>

#define TOF10120_ADDR 0x52

/* --- LoraWAN Keys (Sync from BeheerHub) --- */
uint8_t devEui[] = { ${selectedSensor.devEui ? selectedSensor.devEui.match(/.{1,2}/g)?.map(x => `0x${x}`).join(', ') : '0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00'} };
uint8_t appEui[] = { ${selectedSensor.appEui ? selectedSensor.appEui.match(/.{1,2}/g)?.map(x => `0x${x}`).join(', ') : '0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00'} };
uint8_t appKey[] = { ${selectedSensor.appKey ? selectedSensor.appKey.match(/.{1,2}/g)?.map(x => `0x${x}`).join(', ') : '0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00'} };

uint32_t appTxDutyCycle = 43200000; // 2x per dag
bool overTheAirActivation = true;
LoRaMacRegion_t loraWanRegion = ACTIVE_REGION;
DeviceClass_t  loraWanClass = CLASS_A;

uint16_t readTOF10120() {
    Wire.beginTransmission(TOF10120_ADDR);
    Wire.write(0x00);
    Wire.endTransmission();
    delay(30);
    Wire.requestFrom(TOF10120_ADDR, 2);
    if (Wire.available() >= 2) {
        uint8_t hi = Wire.read();
        uint8_t lo = Wire.read();
        return (hi << 8) | lo;
    }
    return 0;
}

static void prepareTxFrame( uint8_t port ) {
    uint16_t distMm = readTOF10120();
    uint16_t distCm = distMm / 10;
    
    // Bak diepte: ${selectedSensor.binDepthCm || 100}cm
    int vulgraad = map(distCm, 0, ${selectedSensor.binDepthCm || 100}, 100, 0);
    if (vulgraad < 0) vulgraad = 0;
    if (vulgraad > 100) vulgraad = 100;
    
    appDataSize = 3;
    appData[0] = (uint8_t)(distCm >> 8);
    appData[1] = (uint8_t)distCm;
    appData[2] = (uint8_t)vulgraad;
}

void setup() {
    boardInitMcu();
    Serial.begin(115200);
    Wire.begin();
}

void loop() {
    switch( deviceState ) {
        case DEVICE_STATE_INIT: LoRaWAN.init(loraWanRegion,loraWanClass); break;
        case DEVICE_STATE_JOIN: LoRaWAN.join(); break;
        case DEVICE_STATE_SEND: prepareTxFrame( 2 ); LoRaWAN.send(); deviceState = DEVICE_STATE_CYCLE; break;
        case DEVICE_STATE_CYCLE: txDutyCycleTime = appTxDutyCycle + randr( 0, 1000 ); LoRaWAN.cycle(txDutyCycleTime); deviceState = DEVICE_STATE_SLEEP; break;
        case DEVICE_STATE_SLEEP: LoRaWAN.sleep(); break;
        default: deviceState = DEVICE_STATE_INIT; break;
    }
}` : '';

  if (isLoading) {
    return <LoadingScreen message="Internet of Things Dashboard laden..." />;
  }

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6 min-h-0 bg-slate-50 dark:bg-zinc-950 overflow-hidden">
      <PageHeader 
        title="Internet of Things" 
        description="Beheer hardware-koppelingen via unieke Chip ID / DevEUI."
        className="p-0 mb-6"
      >
        <Button onClick={() => setIsAddDialogOpen(true)} className="font-black h-10 uppercase tracking-tight">
          <Plus className="mr-2 h-4 w-4" /> Nieuwe Sensor
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="shadow-sm border-slate-100 rounded-2xl overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Apparaten</p>
              <p className="text-3xl font-black text-slate-900 leading-none">{sensors?.length || 0}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-2xl"><Cpu className="h-6 w-6 text-blue-500" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-100 rounded-2xl overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Verbinding</p>
              <p className="text-3xl font-black text-slate-900 leading-none">KPN Things</p>
            </div>
            <div className="bg-purple-50 p-3 rounded-2xl"><Radio className="h-6 w-6 text-purple-500" /></div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-100 rounded-2xl overflow-hidden hidden lg:flex">
          <CardContent className="p-4 flex items-center justify-between w-full">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Gem. Vulgraad</p>
              <p className="text-3xl font-black text-green-600 leading-none">
                {sensors?.length ? Math.round(sensors.reduce((acc, s) => acc + (s.vulgraad || 0), 0) / sensors.length) : 0}%
              </p>
            </div>
            <div className="bg-green-50 p-3 rounded-2xl"><Wifi className="h-6 w-6 text-green-500" /></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <Card className={cn(
            "lg:col-span-3 flex flex-col shadow-sm rounded-2xl overflow-hidden border-slate-100",
            isTablet && selectedSensorId ? "hidden" : "flex"
        )}>
          <CardHeader className="p-4 border-b bg-slate-50/50">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gekoppelde Units</CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {sensors && sensors.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {sensors.map(sensor => (
                  <div 
                    key={sensor.id} 
                    className={cn(
                      "p-4 flex items-start gap-4 cursor-pointer transition-all hover:bg-slate-50/50",
                      selectedSensorId === sensor.id && !isTablet && "bg-blue-50 border-l-4 border-l-primary"
                    )}
                    onClick={() => {
                        setSelectedSensorId(sensor.id);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1.5">
                        <p className="font-black text-xs uppercase tracking-tight text-slate-900 truncate pr-2">{sensor.name}</p>
                        {getStatusBadge(sensor.status)}
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <code className="text-[9px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono font-bold text-slate-500 uppercase">{sensor.id}</code>
                          <span className="text-[10px] font-black text-slate-900">{sensor.vulgraad || 0}%</span>
                        </div>
                        <Progress value={sensor.vulgraad || 0} variant="gauge" className="h-1" />
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-600"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 font-bold">
                              <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Verbinding verbreken?</AlertDialogTitle>
                              <AlertDialogDescription>De sensor met ID '{sensor.id}' wordt uit het systeem verwijderd.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuleren</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(sensor.id)} className="bg-red-600">Verwijderen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-12 text-center text-slate-300">
                <List className="h-12 w-12 mb-4 opacity-10" />
                <p className="text-[10px] font-black uppercase tracking-widest">Geen apparaten</p>
              </div>
            )}
          </div>
        </Card>

        <Card className={cn(
            "lg:col-span-9 flex flex-col shadow-sm rounded-2xl border-slate-100 overflow-hidden",
            !selectedSensor && "hidden lg:flex"
        )}>
          {selectedSensor ? (
            <Tabs defaultValue="map" className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="px-4 py-2 border-b bg-slate-50/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    {isTablet && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white shadow-sm border border-slate-200 mr-2" onClick={() => setSelectedSensorId(null)}>
                            <ArrowLeft className="h-4 w-4 text-slate-600" />
                        </Button>
                    )}
                    <TabsList className="h-9 bg-transparent gap-2 p-0">
                    <TabsTrigger value="map" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest gap-2">
                        <MapPin className="h-3.5 w-3.5" /> Dashboard
                    </TabsTrigger>
                    <TabsTrigger value="code" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest gap-2">
                        <Code className="h-3.5 w-3.5" /> Hardware Code
                    </TabsTrigger>
                    <TabsTrigger value="kpn" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 h-full rounded-lg text-[10px] font-black uppercase tracking-widest gap-2">
                        <Radio className="h-3.5 w-3.5" /> KPN Koppeling
                    </TabsTrigger>
                    </TabsList>
                </div>
                <div className="hidden sm:flex items-center gap-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Chip ID / DevEUI:</p>
                    <span className="text-[10px] font-mono font-bold bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm uppercase">{selectedSensor.id}</span>
                </div>
              </div>

              <TabsContent value="map" className="flex-1 m-0 relative flex flex-col data-[state=active]:flex overflow-hidden">
                <div className="flex-1 relative w-full h-full min-h-0">
                  <MapboxView 
                    objects={sensors?.map(s => ({
                      id: s.id,
                      latitude: s.latitude,
                      longitude: s.longitude,
                      name: s.name,
                      type: s.type,
                      vulgraad: s.vulgraad
                    }))}
                    highlightedObject={selectedSensor ? { id: selectedSensor.id, latitude: selectedSensor.latitude, longitude: selectedSensor.longitude } : null}
                  />
                  
                  <div className="absolute top-4 right-4 z-10 w-full max-w-[240px] space-y-3">
                    <Card className="bg-white/95 backdrop-blur shadow-2xl border-none rounded-2xl overflow-hidden">
                      <div className="bg-slate-900 px-4 py-2 flex items-center justify-between">
                        <p className="text-[9px] font-black text-white uppercase tracking-widest">Live Sensor Data</p>
                        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                      </div>
                      <CardContent className="p-5 space-y-5">
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Vulgraad</p>
                            <p className="text-4xl font-black text-slate-900 leading-none">{selectedSensor.vulgraad || 0}%</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Afstand</p>
                            <p className="text-sm font-black text-slate-600">{selectedSensor.currentDistanceCm || 0} cm</p>
                          </div>
                        </div>
                        <Progress value={selectedSensor.vulgraad || 0} variant="gauge" className="h-2 bg-slate-100" />
                        
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                          <div className="flex items-center gap-2">
                            <div className="bg-slate-100 p-1.5 rounded-lg"><Ruler className="h-3.5 w-3.5 text-slate-500" /></div>
                            <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Config Diepte</p>
                              <p className="text-[10px] font-black text-slate-900">{selectedSensor.binDepthCm || 100} cm</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="bg-slate-100 p-1.5 rounded-lg"><Clock className="h-3.5 w-3.5 text-slate-500" /></div>
                            <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Laatste Meting</p>
                              <p className="text-[10px] font-black text-slate-900">{selectedSensor.lastSeen ? selectedSensor.lastSeen.split(' ')[1] : '--:--'}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="code" className="flex-1 m-0 p-6 bg-slate-50 dark:bg-zinc-950 overflow-y-auto data-[state=active]:flex flex-col">
                <div className="max-w-4xl mx-auto w-full space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Arduino C++ Sketch</h3>
                            <p className="text-sm text-slate-500 font-medium">Kopieer deze code naar uw Arduino IDE (Heltec CubeCell Framework).</p>
                        </div>
                        <Button 
                            className="h-10 px-6 font-black uppercase tracking-tight"
                            onClick={() => copyToClipboard(arduinoCode, 'code')}
                        >
                            {copiedCode ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                            {copiedCode ? 'Gekopieerd' : 'Kopieer Code'}
                        </Button>
                    </div>

                    <div className="bg-slate-900 rounded-2xl p-6 shadow-2xl border-none overflow-hidden relative group">
                        <pre className="text-blue-400 font-mono text-[11px] leading-relaxed overflow-x-auto selection:bg-blue-500/30">
                            {arduinoCode}
                        </pre>
                    </div>
                </div>
              </TabsContent>

              <TabsContent value="kpn" className="flex-1 m-0 p-6 bg-slate-50 dark:bg-zinc-950 overflow-y-auto data-[state=active]:flex flex-col">
                <div className="max-w-3xl mx-auto w-full space-y-8">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">LoRa configuration</h3>
                            <Button variant="ghost" size="sm" className="text-red-500 font-bold uppercase text-[10px] tracking-widest gap-2">
                                <Trash2 className="h-3.5 w-3.5" /> Reset LoRa configuration
                            </Button>
                        </div>
                        <Card className="bg-white dark:bg-zinc-900 border-2 border-slate-100 shadow-sm rounded-2xl overflow-hidden">
                            <CardContent className="p-6 space-y-6">
                                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                                    <span className="text-sm font-black text-slate-900 uppercase tracking-tight">DevEUI</span>
                                    <code className="text-sm font-mono text-slate-600 bg-slate-50 p-2 rounded-lg border uppercase">{selectedSensor.devEui || 'Niet ingesteld'}</code>
                                </div>
                                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                                    <span className="text-sm font-black text-slate-900 uppercase tracking-tight">AppEUI</span>
                                    <code className="text-sm font-mono text-slate-600 bg-slate-50 p-2 rounded-lg border uppercase">{selectedSensor.appEui || 'Niet ingesteld'}</code>
                                </div>
                                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                                    <span className="text-sm font-black text-slate-900 uppercase tracking-tight">AppKey</span>
                                    <div className="flex items-center gap-2">
                                        <code className="text-sm font-mono text-slate-600 bg-slate-50 p-2 rounded-lg border flex-1">
                                            {selectedSensor.appKey ? '••••••••••••••••••••••••••••••••' : 'Niet ingesteld'}
                                        </code>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Separator className="bg-slate-200" />

                    <div className="space-y-2">
                        <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">KPN Things Koppeling</h3>
                        <p className="text-sm text-slate-500 font-medium">Stel een Webhook Destination in om sensordata direct door te sturen.</p>
                    </div>

                    <Card className="bg-slate-900 text-white border-none shadow-xl rounded-2xl overflow-hidden">
                        <div className="bg-white/5 px-6 py-4 flex items-center justify-between border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/20 rounded-xl">
                                    <Radio className="h-5 w-5 text-blue-400" />
                                </div>
                                <span className="text-xs font-black uppercase tracking-widest">Connection URL</span>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-9 px-4 font-black uppercase text-[10px] bg-white/10 hover:bg-white/20"
                                onClick={() => copyToClipboard(apiEndpoint, 'url')}
                            >
                                {copiedUrl ? <Check className="h-3.5 w-3.5 mr-2 text-green-400" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
                                {copiedUrl ? 'Gekopieerd' : 'Kopieer URL'}
                            </Button>
                        </div>
                        <CardContent className="p-6 space-y-6">
                            <div className="bg-black/40 p-4 rounded-xl font-mono text-[11px] break-all border border-white/5 text-blue-400 shadow-inner">
                                <span className="select-all">{apiEndpoint}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <Settings className="h-4 w-4" />
                                        <h4 className="text-[10px] font-black uppercase tracking-widest">Webhook Config (KPN)</h4>
                                    </div>
                                    <ul className="text-[11px] space-y-2 text-slate-300 font-medium leading-relaxed">
                                        <li className="flex gap-2">1. Kies <strong>HTTP POST</strong> als methode.</li>
                                        <li className="flex gap-2">2. Voeg Custom Header toe:</li>
                                        <li className="bg-black/30 p-2 rounded border border-white/5 font-mono text-[10px] text-white">
                                            X-HTTP-Method-Override: PATCH
                                        </li>
                                        <li className="flex gap-2">3. Gebruik de <strong>Chip ID</strong> als DevEUI.</li>
                                    </ul>
                                </div>
                                <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-2 text-purple-400">
                                        <Code className="h-4 w-4" />
                                        <h4 className="text-[10px] font-black uppercase tracking-widest">Gekoppelde Velden</h4>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-slate-400">Uw Payload Decoder in KPN Things moet deze JSON-velden versturen:</p>
                                        <pre className="text-[10px] font-mono text-purple-300 p-2 bg-black/30 rounded-lg">
{`{
  "fields": {
    "vulgraad": { "integerValue": "..." },
    "currentDistanceCm": { "integerValue": "..." }
  }
}`}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-100 flex gap-4 items-start shadow-sm">
                        <div className="bg-blue-100 p-3 rounded-2xl shrink-0">
                            <Info className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="space-y-1">
                            <h4 className="text-xs font-black uppercase text-blue-900 tracking-tight">KPN Things Method Override</h4>
                            <p className="text-xs text-blue-700 leading-relaxed font-medium">
                                Omdat KPN Things destinations standaard <strong>POST</strong> gebruiken, maar Firestore een <strong>PATCH</strong> vereist voor updates, moet u de <code>X-HTTP-Method-Override</code> header gebruiken zoals hierboven beschreven. BeheerHub herkent dit en verwerkt de data als een update.
                            </p>
                        </div>
                    </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-zinc-950">
                <div className="bg-slate-50 dark:bg-zinc-900 p-12 rounded-full mb-8 relative">
                    <Radio className="h-20 w-20 text-slate-200 dark:text-zinc-800" />
                    <div className="absolute top-2 right-2 h-8 w-8 bg-primary rounded-full flex items-center justify-center text-white animate-bounce shadow-lg">
                        <ArrowRight className="h-5 w-5" />
                    </div>
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900 mb-2">Configureer Koppeling</h3>
                <p className="text-sm text-slate-400 font-medium max-w-sm mx-auto mb-10">
                    Selecteer een apparaat in de lijst om de <strong>KPN Things koppeling</strong> en de <strong>live data-feed</strong> te beheren.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-lg w-full">
                    <div className="p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/30">
                        <h4 className="text-[10px] font-black uppercase mb-2 text-primary tracking-widest flex items-center gap-2"><Plus className="h-3 w-3" /> Stap 1</h4>
                        <p className="text-[11px] text-slate-500 font-bold leading-relaxed uppercase tracking-tighter">Registreer uw Heltec board via de 'Nieuwe Sensor' knop.</p>
                    </div>
                    <div className="p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/30">
                        <h4 className="text-[10px] font-black uppercase mb-2 text-primary tracking-widest flex items-center gap-2"><Radio className="h-3 w-3" /> Stap 2</h4>
                        <p className="text-[11px] text-slate-500 font-bold leading-relaxed uppercase tracking-tighter">Koppel de Webhook URL aan uw KPN Things Destination.</p>
                    </div>
                </div>
            </div>
          )}
        </Card>
      </div>

      <AddSensorDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
    </div>
  );
}
