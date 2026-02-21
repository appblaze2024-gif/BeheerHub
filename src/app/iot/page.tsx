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
  Terminal, 
  Copy, 
  Check, 
  Code2, 
  Info, 
  BookOpen, 
  Sparkles, 
  Send, 
  ArrowRight,
  List,
  Ruler,
  Clock,
  Battery,
  Zap,
  Smartphone,
  X as XIcon,
  ChevronLeft,
  ArrowLeft,
  Radio,
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
import { generateIoTCode } from '@/ai/flows/generate-iot-code-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';

export default function IoTPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isTablet = useIsMobile(1024);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [selectedSensorId, setSelectedSensorId] = React.useState<string | null>(null);
  const [copied = false, setCopied] = React.useState(false);

  // AI State
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [chatHistory, setChatHistory] = React.useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [customCode, setCustomCode] = React.useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = React.useState('Heltec CubeCell HTCC-AB01');
  const [requestCount, setRequestCount] = React.useState(0);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Gekopieerd', description: 'Informatie naar klembord gekopieerd.' });
  };

  const handleGenerateCode = async () => {
    if (!aiPrompt.trim() || !selectedSensor) return;
    
    setIsGenerating(true);
    const newHistory = [...chatHistory, { role: 'user' as const, content: aiPrompt }];
    setChatHistory(newHistory);
    
    try {
      const result = await generateIoTCode({
        prompt: aiPrompt,
        board: selectedBoard,
        history: chatHistory,
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey,
      });
      
      setCustomCode(result.code);
      setChatHistory([...newHistory, { role: 'model' as const, content: result.explanation }]);
      setAiPrompt('');
      setRequestCount(prev => prev + 1);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Generatie mislukt",
        description: error.message || "Er is een fout opgetreden bij de AI."
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const apiEndpoint = selectedSensor 
    ? `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/sensors/${selectedSensor.id}?key=${firebaseConfig.apiKey}`
    : '';

  const frequency = selectedSensor?.measurementFrequency || 24;
  const delayMs = Math.round((24 * 3600 * 1000) / frequency);
  const binDepth = selectedSensor?.binDepthCm || 100;

  const defaultEsp32Code = selectedSensor ? `#include <WiFi.h>
#include <HTTPClient.h>

// WiFi Instellingen
const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

// Firebase/Firestore Configuratie
const String projectId = "${firebaseConfig.projectId}";
const String apiKey = "${firebaseConfig.apiKey}";
const String sensorId = "${selectedSensor.id}";

// Kalibratie voor bak: ${selectedSensor.name}
const int BIN_DEPTH_CM = ${binDepth}; 
const long FREQUENCY_DELAY_MS = ${delayMs}; // ${frequency} metingen per 24u

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\\nWiFi Verbonden!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/sensors/" + sensorId + "?key=" + apiKey;
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-HTTP-Method-Override", "PATCH");
    
    // --- Meting ---
    int distanceCm = random(10, BIN_DEPTH_CM); 
    int vulgraad = map(distanceCm, 0, BIN_DEPTH_CM, 100, 0);
    vulgraad = constrain(vulgraad, 0, 100);

    String payload = "{\\"fields\\": {";
    payload += "\\"status\\": {\\"stringValue\\": \\"Online\\"},";
    payload += "\\"vulgraad\\": {\\"integerValue\\": \\"" + String(vulgraad) + "\\"},";
    payload += "\\"currentDistanceCm\\": {\\"integerValue\\": \\"" + String(distanceCm) + "\\"},";
    payload += "\\"lastSeen\\": {\\"stringValue\\": \\"" + String(__DATE__) + " " + String(__TIME__) + "\\"}";
    payload += "}}";

    int httpResponseCode = http.POST(payload);
    Serial.print("Data verstuurd. Code: ");
    Serial.println(httpResponseCode);
    http.end();
  }
  delay(FREQUENCY_DELAY_MS); 
}` : '';

  const defaultHeltecCode = selectedSensor ? `/*
 * Heltec CubeCell HTCC-AB01 (HTTC-001) - TOF Sensor
 * Gebruik de CubeCell Framework in Arduino IDE.
 * 
 * SETUP IN KPN THINGS:
 * 1. Maak een Device aan in KPN Things met onderstaande keys.
 * 2. Voeg een 'Webhook' destination toe in het KPN portaal.
 * 3. Gebruik de REST API Endpoint URL onder de 'Dashboard' tab.
 * 4. Stel de Webhook in op 'PATCH' met 'Content-Type: application/json'.
 */

#include "LoRaWan_APP.h"
#include "Arduino.h"

// --- LoraWAN Keys (Van KPN Things Portaal) ---
/* OTAA keys, MSB format */
uint8_t devEui[] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
uint8_t appEui[] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
uint8_t appKey[] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };

/* LoraWAN region EU868 */
LoRaMacRegion_t loraWanRegion = ACTIVE_REGION;
DeviceClass_t  loraWanClass = CLASS_A;

/* Meetinterval: ${frequency} keer per dag */
uint32_t appTxDutyCycle = ${delayMs}; 

/* OTAA Mode */
bool overTheAirActivation = true;
bool loraWanAdr = true;
bool isTxConfirmed = true;
uint8_t appPort = 2;

static void prepareTxFrame( uint8_t port )
{
    // --- Meting TOF Sensor ---
    // Placeholder voor VL53L0X of vergelijkbare sensor
    uint16_t distanceCm = 45; 
    uint8_t vulgraad = 60; // Berekend o.b.v. bakdiepte ${binDepth}cm
    
    appDataSize = 3;
    appData[0] = (uint8_t)(distanceCm >> 8);
    appData[1] = (uint8_t)distanceCm;
    appData[2] = vulgraad;
}

void setup() {
    boardInitMcu();
    Serial.begin(115200);
}

void loop() {
    switch( deviceState ) {
        case DEVICE_STATE_INIT:
            LoRaWAN.init(loraWanRegion,loraWanClass);
            break;
        case DEVICE_STATE_JOIN:
            LoRaWAN.join();
            break;
        case DEVICE_STATE_SEND:
            prepareTxFrame( appPort );
            LoRaWAN.send();
            deviceState = DEVICE_STATE_CYCLE;
            break;
        case DEVICE_STATE_CYCLE:
            txDutyCycleTime = appTxDutyCycle + randr( 0, 1000 );
            LoRaWAN.cycle(txDutyCycleTime);
            deviceState = DEVICE_STATE_SLEEP;
            break;
        case DEVICE_STATE_SLEEP:
            LoRaWAN.sleep();
            break;
        default:
            deviceState = DEVICE_STATE_INIT;
            break;
    }
}` : '';

  const activeCode = customCode || (selectedBoard === 'Heltec CubeCell HTCC-AB01' ? defaultHeltecCode : defaultEsp32Code);

  if (isLoading) {
    return <LoadingScreen message="Internet of Things Dashboard laden..." />;
  }

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6 min-h-0 bg-slate-50 dark:bg-zinc-950 overflow-hidden">
      <PageHeader 
        title="Internet of Things" 
        description="Beheer hardware-koppelingen via unieke serienummers."
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
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Verbindingen</p>
              <p className="text-3xl font-black text-slate-900 leading-none">WiFi / LoRa</p>
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
                        setCustomCode(null);
                        setChatHistory([]);
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
            <Tabs defaultValue="map" className="flex-1 flex flex-col">
              <div className="px-4 py-2 border-b bg-slate-50/50 flex items-center justify-between">
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
                        <Code2 className="h-3.5 w-3.5" /> Hardware Code
                    </TabsTrigger>
                    </TabsList>
                </div>
                <div className="hidden sm:flex items-center gap-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Unit ID:</p>
                    <span className="text-[10px] font-mono font-bold bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm uppercase">{selectedSensor.id}</span>
                </div>
              </div>

              <TabsContent value="map" className="flex-1 m-0 relative flex flex-col">
                <div className="flex-1 relative">
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
                        <p className="text-[9px] font-black text-white uppercase tracking-widest">Live Sensor Status</p>
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
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Bak Diepte</p>
                              <p className="text-[10px] font-black text-slate-900">{selectedSensor.binDepthCm || 100} cm</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="bg-slate-100 p-1.5 rounded-lg"><Clock className="h-3.5 w-3.5 text-slate-500" /></div>
                            <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Freq / 24u</p>
                              <p className="text-[10px] font-black text-slate-900">{selectedSensor.measurementFrequency || 24}x</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4 z-10 space-y-2">
                      <Card className="bg-slate-900/95 backdrop-blur-xl text-white border-none shadow-2xl rounded-2xl overflow-hidden">
                          <div className="bg-white/5 px-4 py-2 flex items-center justify-between border-b border-white/5">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                  <Radio className="h-3.5 w-3.5" /> KPN Things Koppeling (REST API)
                              </p>
                              <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 text-[9px] font-black uppercase tracking-widest hover:bg-white/10"
                                  onClick={() => copyToClipboard(apiEndpoint)}
                              >
                                  {copied ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                                  Kopieer URL
                              </Button>
                          </div>
                          <CardContent className="p-4 space-y-3">
                              <div className="bg-black/40 p-3 rounded-xl font-mono text-[9px] break-all border border-white/5 text-blue-400 shadow-inner">
                                  <span className="text-purple-400 mr-2">PATCH</span> {apiEndpoint}
                              </div>
                              <div className="flex items-start gap-2 p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-[9px] text-blue-200 leading-relaxed font-medium">
                                    Stel in KPN Things een <strong>Webhook Destination</strong> in met bovenstaande URL. Gebruik de <strong>PATCH</strong> methode en zorg dat de payload JSON-velden (vulgraad, currentDistanceCm) overeenkomen met de Firestore structuur.
                                </p>
                              </div>
                          </CardContent>
                      </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="code" className="flex-1 m-0 flex flex-col xl:flex-row overflow-hidden bg-zinc-950">
                <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0 border-r border-zinc-800">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20">
                                <BookOpen className="h-5 w-5 text-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-zinc-100 text-sm font-black uppercase tracking-tight">Arduino Sketch</h3>
                                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">{selectedBoard} | TOF Sensor</p>
                            </div>
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-9 px-5 font-black uppercase tracking-tight gap-2 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                            onClick={() => copyToClipboard(activeCode)}
                        >
                            <Copy className="h-4 w-4" /> Kopieer Code
                        </Button>
                    </div>
                    <div className="flex-1 bg-black/40 rounded-2xl border border-zinc-800 p-6 overflow-auto custom-scrollbar">
                        <pre className="text-[11px] font-mono text-blue-300/90 leading-relaxed">
                            {activeCode}
                        </pre>
                    </div>
                </div>

                <div className="w-full xl:w-80 flex flex-col bg-zinc-900 border-l border-zinc-800">
                    <div className="p-4 md:p-6 border-b border-zinc-800 flex flex-col gap-4 bg-zinc-900/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />
                                <h4 className="text-[10px] font-black text-zinc-100 uppercase tracking-widest">IoT Assistent</h4>
                            </div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Badge variant="secondary" className="text-[9px] bg-zinc-800 text-zinc-500 border-zinc-700 h-5 px-2 gap-1 font-black">
                                            <Zap className="h-2.5 w-2.5" /> {requestCount} / 1500
                                        </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="text-xs">Dagelijkse limiet voor dit project.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <Select value={selectedBoard} onValueChange={setSelectedBoard}>
                            <SelectTrigger className="h-10 bg-zinc-950 border-zinc-800 text-zinc-100 text-[10px] font-black uppercase tracking-widest focus:ring-purple-500/20">
                                <SelectValue placeholder="Kies hardware setup" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                                <SelectItem value="Heltec CubeCell HTCC-AB01">HTCC-AB01 (HTTC-001)</SelectItem>
                                <SelectItem value="ESP32">ESP32 (WiFi)</SelectItem>
                                <SelectItem value="ESP32 + SIM800L (GSM)">ESP32 + SIM800L (GSM)</SelectItem>
                                <SelectItem value="ESP8266">ESP8266 (WiFi)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <ScrollArea className="flex-1 p-4 md:p-6">
                        {chatHistory.length === 0 ? (
                            <div className="text-center py-12 flex flex-col items-center">
                                <div className="bg-zinc-800/50 p-4 rounded-full mb-4">
                                    <Radio className="h-8 w-8 text-zinc-600" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 max-w-[160px] leading-relaxed">Vraag om aanpassingen, bijv: "Voeg VL53L0X TOF sensor toe"</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {chatHistory.map((msg, i) => (
                                    <div key={i} className={cn(
                                        "p-3 rounded-2xl text-[11px] leading-relaxed font-medium transition-all",
                                        msg.role === 'user' ? "bg-purple-50/10 text-purple-900 border border-purple-100 ml-4" : "bg-zinc-800 text-zinc-300 border border-zinc-700 mr-4"
                                    )}>
                                        <p className="font-black uppercase text-[8px] mb-1.5 opacity-40 tracking-widest">{msg.role === 'user' ? 'Gebruiker' : 'Assistent'}</p>
                                        {msg.content}
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>

                    <div className="p-4 md:p-6 border-t border-zinc-800 bg-zinc-950/30">
                        <div className="relative">
                            <Textarea 
                                placeholder="Typ uw vraag..."
                                className="min-h-[100px] bg-zinc-950 border-zinc-800 text-zinc-100 text-[11px] font-medium resize-none pr-12 rounded-2xl shadow-inner focus:ring-purple-500/20"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleGenerateCode();
                                    }
                                }}
                            />
                            <Button 
                                size="icon" 
                                variant="ghost" 
                                className="absolute right-3 bottom-3 h-8 w-8 rounded-full text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                                onClick={handleGenerateCode}
                                disabled={isGenerating || !aiPrompt.trim()}
                            >
                                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-[8px] text-zinc-600 mt-3 text-center font-black uppercase tracking-widest">Gegenereerd met BeheerHub AI Engine</p>
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
                <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900 mb-2">Configureer Hardware</h3>
                <p className="text-sm text-slate-400 font-medium max-w-sm mx-auto mb-10">
                    Selecteer een apparaat in de lijst om de <strong>kalibratie</strong>, <strong>KPN Things koppeling</strong> en <strong>C++ code</strong> te beheren.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-2xl w-full">
                    <div className="p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/30">
                        <h4 className="text-[10px] font-black uppercase mb-2 text-primary tracking-widest flex items-center gap-2"><Plus className="h-3 w-3" /> Stap 1</h4>
                        <p className="text-[11px] text-slate-500 font-bold leading-relaxed uppercase tracking-tighter">Registreer hardware en stel de bak-diepte in.</p>
                    </div>
                    <div className="p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/30">
                        <h4 className="text-[10px] font-black uppercase mb-2 text-primary tracking-widest flex items-center gap-2"><List className="h-3 w-3" /> Stap 2</h4>
                        <p className="text-[11px] text-slate-500 font-bold leading-relaxed uppercase tracking-tighter">Klik op een actieve sensor in de linker lijst.</p>
                    </div>
                    <div className="p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/30">
                        <h4 className="text-[10px] font-black uppercase mb-2 text-primary tracking-widest flex items-center gap-2"><Smartphone className="h-3 w-3" /> Stap 3</h4>
                        <p className="text-[11px] text-slate-500 font-bold leading-relaxed uppercase tracking-tighter">Kies Heltec HTCC-AB01 en stel KPN Things in.</p>
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
