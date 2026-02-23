'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  FileCode,
  Globe,
  Battery,
  Layers,
  Zap,
  ChevronRight,
  ClipboardList,
  Maximize,
  Minimize,
  X as XIcon,
  Sparkles,
  MessageSquare,
  RefreshCcw,
  AlertTriangle,
  History
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useFirestore, useCollection, deleteDocumentNonBlocking, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { firebaseConfig } from '@/firebase/config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { generateIoTCode } from '@/ai/flows/generate-iot-code-flow';

export default function IoTPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isTablet = useIsMobile(1024);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [isStepsDialogOpen, setIsStepsDialogOpen] = React.useState(false);
  const [selectedSensorId, setSelectedSensorId] = React.useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [copiedDecoder, setCopiedDecoder] = React.useState(false);

  // AI Code Logic
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [isFixing, setIsFixing] = React.useState(false);

  const sensorsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'sensors');
  }, [firestore]);

  const { data: sensors, isLoading } = useCollection<Sensor>(sensorsQuery);

  const selectedSensor = React.useMemo(() => 
    sensors?.find(s => s.id === selectedSensorId), 
    [sensors, selectedSensorId]
  );

  const formatHex = (hex: string | undefined, len: number) => {
    if (!hex) return Array(len).fill('0x00').join(', ');
    const cleanHex = hex.replace(/[^0-9A-F]/gi, '');
    const m = cleanHex.match(/.{1,2}/g);
    const bytes = (m || []).map(x => `0x${x.padStart(2, '0').toUpperCase()}`);
    while (bytes.length < len) bytes.push('0x00');
    return bytes.slice(0, len).join(', ');
  };

  const handleDelete = async (id: string) => {
    if (!firestore) return;
    await deleteDocumentNonBlocking(doc(firestore, 'sensors', id));
    if (selectedSensorId === id) setSelectedSensorId(null);
    toast({ title: 'Sensor verwijderd' });
  };

  const copyToClipboard = (text: string, stateSetter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    stateSetter(true);
    setTimeout(() => stateSetter(false), 2000);
    toast({ title: 'Gekopieerd naar klembord' });
  };

  const handleFixWithAI = async () => {
    if (!selectedSensor || !aiPrompt.trim() || isFixing) return;
    setIsFixing(true);
    try {
      const history = selectedSensor.iotHistory || [];
      const result = await generateIoTCode({
        prompt: aiPrompt,
        board: 'Heltec CubeCell HTCC-AB01',
        history: history,
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey,
        devEui: formatHex(selectedSensor.devEui || selectedSensor.id, 8),
        appEui: formatHex(selectedSensor.appEui || '0000000000000000', 8),
        appKey: formatHex(selectedSensor.appKey || '00000000000000000000000000000000', 16),
        binDepthCm: selectedSensor.binDepthCm || 100
      });

      const updatedHistory = [
        ...history,
        { role: 'user' as const, content: aiPrompt },
        { role: 'model' as const, content: result.explanation }
      ];

      await updateDocumentNonBlocking(doc(firestore!, 'sensors', selectedSensor.id), {
        iotCode: result.code,
        iotExplanation: result.explanation,
        iotHistory: updatedHistory.slice(-10)
      });

      setAiPrompt('');
      toast({ title: "Nieuwe code gegenereerd door AI" });
    } catch (err) {
      toast({ variant: 'destructive', title: "Fout bij genereren", description: "Probeer het later nog eens." });
    } finally {
      setIsFixing(false);
    }
  };

  const apiEndpoint = selectedSensor 
    ? `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/sensors/${selectedSensor.id}?key=${firebaseConfig.apiKey}&updateMask.fieldPaths=vulgraad&updateMask.fieldPaths=currentDistanceCm&updateMask.fieldPaths=batteryLevel&updateMask.fieldPaths=lastSeen`
    : '';

  const decoderCode = `function decode(payload) {
    var bytes = payload.data;
    var dist = (bytes[0] << 8) | bytes[1];
    var bat = (bytes[3] << 8) | bytes[4];
    var batPct = Math.min(100, Math.max(0, (bat - 3300) / 9));
    return {
        "fields": {
            "currentDistanceCm": { "integerValue": dist },
            "vulgraad": { "integerValue": bytes[2] },
            "batteryLevel": { "integerValue": Math.round(batPct) },
            "lastSeen": { "stringValue": new Date().toISOString() }
        }
    };
}`;

  const devEui = formatHex(selectedSensor?.devEui || selectedSensor?.id, 8);
  const appEui = formatHex(selectedSensor?.appEui, 8);
  const appKey = formatHex(selectedSensor?.appKey, 16);

  const defaultCode = selectedSensor ? `#include "LoRaWan_APP.h"
#include <Wire.h>

/* KPN LoRaWAN Credentials */
uint8_t devEui[] = { ${devEui} };
uint8_t appEui[] = { ${appEui} };
uint8_t appKey[] = { ${appKey} };

/* Verplichte v1.4.0 Framework Variabelen */
uint16_t userChannelsMask[6] = { 0x00FF, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000 };
uint32_t appTxDutyCycle = 15000;
bool overTheAirActivation = true;
LoRaMacRegion_t loraWanRegion = ACTIVE_REGION;
DeviceClass_t loraWanClass = CLASS_A;
bool loraWanAdr = true;
bool keepNet = false;
bool isTxConfirmed = true;
uint8_t appPort = 2;
uint8_t confirmedNbTrials = 4;

uint16_t readTOF() {
  uint16_t distance = 0;
  Wire.beginTransmission(0x52);
  Wire.write(0x00);
  Wire.endTransmission();
  delay(30);
  Wire.requestFrom(0x52, 2);
  if (Wire.available() >= 2) {
    uint8_t h = Wire.read();
    uint8_t l = Wire.read();
    distance = (h << 8) | l;
  }
  return distance;
}

void prepareTxFrame(uint8_t port) {
  uint16_t d = readTOF() / 10; // Afstand in cm
  int v = map(d, 0, ${selectedSensor.binDepthCm || 100}, 100, 0);
  v = constrain(v, 0, 100);
  uint16_t b = getBatteryVoltage();
  
  appDataSize = 5;
  appData[0] = (uint8_t)(d >> 8); 
  appData[1] = (uint8_t)d; 
  appData[2] = (uint8_t)v;
  appData[3] = (uint8_t)(b >> 8); 
  appData[4] = (uint8_t)b;
}

void setup() {
  boardInitMcu();
  Serial.begin(115200);
  Wire.begin();
  LoRaWAN.init(loraWanClass, loraWanRegion);
  Serial.println("CubeCell v1.4.0 Framework Ready.");
}

void loop() {
  switch(deviceState) {
    case DEVICE_STATE_INIT:
      LoRaWAN.init(loraWanClass, loraWanRegion);
      break;
    case DEVICE_STATE_JOIN:
      LoRaWAN.join();
      break;
    case DEVICE_STATE_SEND:
      prepareTxFrame(appPort);
      LoRaWAN.send();
      deviceState = DEVICE_STATE_CYCLE;
      break;
    case DEVICE_STATE_CYCLE:
      txDutyCycleTime = appTxDutyCycle + randr(0, 1000);
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

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="Internet of Things" description="Hardware beheer en KPN integratie.">
        <Button onClick={() => setIsAddDialogOpen(true)} className="font-black h-10 uppercase">
          <Plus className="mr-2 h-4 w-4" /> Nieuwe Sensor
        </Button>
      </PageHeader>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 p-4 md:p-6 overflow-hidden">
        <Card className={cn("lg:col-span-3 flex flex-col rounded-2xl overflow-hidden", isTablet && selectedSensorId ? "hidden" : "flex")}>
          <CardHeader className="p-4 border-b bg-slate-50/50">
            <CardTitle className="text-[10px] font-black uppercase text-slate-400">Sensoren</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {sensors?.map(s => (
              <div key={s.id} onClick={() => setSelectedSensorId(s.id)} className={cn("p-4 border-b cursor-pointer transition-all hover:bg-slate-50", selectedSensorId === s.id && "bg-blue-50 border-l-4 border-l-primary")}>
                <div className="flex justify-between items-start mb-2">
                  <p className="font-black text-xs uppercase truncate">{s.name}</p>
                  <Badge variant="outline" className="text-[8px] h-4">{s.status}</Badge>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-2">
                  <code className="uppercase">{s.id}</code>
                  <span>{s.vulgraad}%</span>
                </div>
                <Progress value={s.vulgraad} variant="gauge" className="h-1" />
              </div>
            ))}
          </ScrollArea>
        </Card>

        <Card className={cn("lg:col-span-9 flex flex-col rounded-2xl overflow-hidden shadow-xl bg-white", !selectedSensor && "hidden lg:flex")}>
          {selectedSensor ? (
            <Tabs defaultValue="map" className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="px-4 py-2 border-b bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isTablet && <Button variant="ghost" size="icon" onClick={() => setSelectedSensorId(null)} className="h-8 w-8 bg-white border"><ArrowLeft className="h-4 w-4" /></Button>}
                  <TabsList className="bg-transparent h-9 p-0 gap-2 border-none">
                    <TabsTrigger value="map" className="px-4 text-[10px] font-black uppercase tracking-widest rounded-lg border-none data-[state=active]:bg-white shadow-none">Live Status</TabsTrigger>
                    <TabsTrigger value="code" className="px-4 text-[10px] font-black uppercase tracking-widest rounded-lg border-none data-[state=active]:bg-white shadow-none">Hardware Code</TabsTrigger>
                    <TabsTrigger value="kpn" className="px-4 text-[10px] font-black uppercase tracking-widest rounded-lg border-none data-[state=active]:bg-white shadow-none">KPN Setup</TabsTrigger>
                  </TabsList>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px] bg-white border uppercase">{selectedSensor.id}</Badge>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sensor verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>De sensor {selectedSensor.name} wordt permanent gewist.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(selectedSensor.id)} className="bg-red-600">Verwijderen</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <TabsContent value="map" className="flex-1 m-0 relative overflow-hidden">
                <div className="absolute inset-0">
                  <MapboxView 
                    objects={sensors?.map(s => ({ ...s }))} 
                    highlightedObject={selectedSensor}
                  />
                </div>
                <div className="absolute top-4 right-4 w-56 space-y-2 pointer-events-none">
                  <Card className="bg-white/95 backdrop-blur shadow-2xl border-none rounded-2xl overflow-hidden pointer-events-auto">
                    <div className="bg-slate-900 px-4 py-2 flex items-center justify-between text-white text-[9px] font-black uppercase">
                      <span>Live Status</span>
                      <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    </div>
                    <CardContent className="p-4 space-y-4">
                      <div className="flex justify-between items-end">
                        <p className="text-3xl font-black text-slate-900 leading-none">{selectedSensor.vulgraad}%</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{selectedSensor.currentDistanceCm}cm</p>
                      </div>
                      <Progress value={selectedSensor.vulgraad} variant="gauge" className="h-1.5 bg-slate-100" />
                      <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 pt-2 border-t">
                        <div className="flex items-center gap-1"><Battery className="h-3 w-3" /> {selectedSensor.batteryLevel}%</div>
                        <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {selectedSensor.lastSeen ? format(new Date(selectedSensor.lastSeen), 'HH:mm') : '--'}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="code" className="flex-1 m-0 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden bg-slate-50/50">
                <div className="lg:col-span-8 flex flex-col p-6 overflow-hidden">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="font-black uppercase tracking-tight flex items-center gap-2"><FileCode className="h-5 w-5 text-primary" /> Arduino IDE Sketch</h3>
                    <Button onClick={() => copyToClipboard(selectedSensor.iotCode || defaultCode, setCopiedCode)} className="h-8 px-4 text-[10px] font-black uppercase shadow-lg bg-primary hover:bg-primary/90">
                      {copiedCode ? <Check className="h-3.5 w-3.5 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
                      Kopieer Code
                    </Button>
                  </div>
                  <div className="flex-1 bg-slate-900 rounded-2xl shadow-2xl overflow-hidden relative border-[6px] border-slate-800">
                    <div className="h-full overflow-auto p-6 custom-scrollbar">
                      <pre className="text-blue-400 font-mono text-[11px] leading-relaxed whitespace-pre font-bold">
                        {selectedSensor.iotCode || defaultCode}
                      </pre>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-4 bg-white border-l flex flex-col overflow-hidden">
                  <div className="p-4 border-b bg-slate-50/50">
                    <h3 className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> AI Fout-Hersteller</h3>
                  </div>
                  <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Arduino IDE Foutcode</Label>
                      <Textarea 
                        placeholder="Plak hier uw foutmelding of vraag om een aanpassing..." 
                        className="min-h-[150px] text-xs font-medium rounded-xl bg-slate-50 border-slate-200 focus:ring-primary/20 resize-none" 
                        value={aiPrompt} 
                        onChange={e => setAiPrompt(e.target.value)} 
                      />
                      <Button className="w-full h-11 font-black uppercase shadow-xl shadow-primary/20 text-xs" disabled={!aiPrompt.trim() || isFixing} onClick={handleFixWithAI}>
                        {isFixing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                        Code Herstellen met AI
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex-1 flex flex-col min-h-0">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 mb-3 flex items-center gap-2"><History className="h-3.5 w-3.5" /> Fix Historie</h4>
                      <ScrollArea className="flex-1 pr-2">
                        {selectedSensor.iotHistory?.map((m, i) => (
                          <div key={i} className={cn("p-3 rounded-2xl text-[11px] mb-3 shadow-sm border", m.role === 'user' ? "bg-slate-50 border-slate-100 text-slate-600 ml-4" : "bg-blue-50 border-blue-100 text-blue-700 mr-4")}>
                            <p className="font-bold leading-relaxed">{m.content}</p>
                          </div>
                        ))}
                        {(!selectedSensor.iotHistory || selectedSensor.iotHistory.length === 0) && (
                          <p className="text-[10px] font-bold text-slate-300 uppercase text-center mt-12 italic">Geen historie</p>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="kpn" className="flex-1 m-0 p-6 bg-slate-50 overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-8">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black uppercase tracking-tight">KPN Things Integratie</h3>
                    <Button variant="outline" onClick={() => setIsStepsDialogOpen(true)} className="h-9 font-black uppercase text-[10px] gap-2"><ClipboardList className="h-4 w-4" /> Stappenplan</Button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center"><h4 className="text-sm font-black uppercase">1. Payload Decoder (JavaScript)</h4><Button variant="outline" size="sm" onClick={() => copyToClipboard(decoderCode, setCopiedDecoder)} className="h-7 text-[9px] font-black uppercase">Kopieer</Button></div>
                    <Card className="bg-slate-900 text-blue-400 p-6 rounded-2xl font-mono text-[11px] shadow-xl"><pre className="whitespace-pre-wrap font-bold">{decoderCode}</pre></Card>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase">2. Webhook / HTTP Destination</h4>
                    <Card className="bg-slate-900 text-white p-6 rounded-2xl overflow-hidden relative shadow-xl">
                      <div className="flex justify-between items-center mb-4"><span className="text-[10px] font-black uppercase tracking-widest opacity-50">KPN Webhook URL</span><Button size="sm" variant="ghost" onClick={() => copyToClipboard(apiEndpoint, setCopiedUrl)} className="h-7 text-[9px] bg-white/10 hover:bg-white/20 text-white uppercase font-black">Kopieer URL</Button></div>
                      <div className="bg-black/40 p-4 rounded-xl font-mono text-[10px] break-all text-blue-400 border border-white/5 font-bold">{apiEndpoint}</div>
                      <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/5"><p className="text-[10px] text-slate-400 italic"><strong>Belangrijk:</strong> Voeg in KPN Things de header <strong>X-HTTP-Method-Override: PATCH</strong> toe.</p></div>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-slate-50/30">
              <div className="bg-white p-8 rounded-full shadow-xl mb-6">
                <Radio className="h-16 w-16 text-primary animate-pulse" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight mb-2 text-slate-900">Geen apparaat geselecteerd</h3>
              <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto">Selecteer een sensor uit de lijst om de live gegevens, code en instellingen te beheren.</p>
            </div>
          )}
        </Card>
      </div>

      <AddSensorDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />

      <Dialog open={isStepsDialogOpen} onOpenChange={setIsStepsDialogOpen}>
        <DialogContent className="sm:max-w-3xl h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
          <DialogHeader className="p-8 border-b bg-slate-900 shrink-0">
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-white">Technisch Stappenplan: CubeCell + TOF10120</DialogTitle>
            <DialogDescription className="font-bold text-slate-400">Volg deze stappen voor een correcte installatie en verbinding met KPN.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 bg-white">
            <div className="p-8 space-y-10 pb-12">
              <div className="space-y-4">
                <div className="flex items-center gap-3"><Badge className="h-8 w-8 rounded-full flex items-center justify-center p-0 text-lg font-black bg-primary">1</Badge><h4 className="font-black uppercase tracking-tight text-slate-900 text-lg">Hardware Aansluiten</h4></div>
                <Card className="bg-slate-50 border-2 p-6 rounded-3xl grid sm:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Bedrading Laser Sensor</p>
                    <ul className="text-sm space-y-3 font-bold text-slate-700">
                      <li className="flex items-center gap-3"><div className="h-3 w-3 rounded-full bg-red-500" /> Rood &rarr; 3V3 (VExt)</li>
                      <li className="flex items-center gap-3"><div className="h-3 w-3 rounded-full bg-black" /> Zwart &rarr; GND</li>
                      <li className="flex items-center gap-3"><div className="h-3 w-3 rounded-full bg-blue-500" /> Blauw (SDA) &rarr; SDA Pin</li>
                      <li className="flex items-center gap-3"><div className="h-3 w-3 rounded-full bg-green-500" /> Groen (SCL) &rarr; SCL Pin</li>
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Lipo Batterij</p>
                    <p className="text-xs font-bold text-slate-600 leading-relaxed"><Zap className="h-4 w-4 text-orange-500 inline mr-1" /> Sluit de batterij aan op de witte connector. De CubeCell laadt de batterij op zodra deze met USB is verbonden.</p>
                  </div>
                </Card>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3"><Badge className="h-8 w-8 rounded-full flex items-center justify-center p-0 text-lg font-black bg-primary">2</Badge><h4 className="font-black uppercase tracking-tight text-slate-900 text-lg">Arduino IDE Instellingen</h4></div>
                <Card className="bg-slate-50 border-2 p-6 rounded-3xl space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-[11px] font-black text-slate-700 uppercase tracking-tighter">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">Board: <span className="text-primary">HTCC-AB01</span></div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">Region: <span className="text-primary">EU868</span></div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">Class: <span className="text-primary">Class A</span></div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">Baudrate: <span className="text-primary">115200</span></div>
                  </div>
                  <Alert className="bg-blue-50 border-blue-100 rounded-2xl">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-[10px] font-black uppercase text-blue-700">De Join-Cyclus</AlertTitle>
                    <AlertDescription className="text-xs font-medium text-blue-600">
                      Na het flashen probeert de unit te 'joinen'. Dit kan enkele minuten duren. Gebruik de Seriële Monitor om de voortgang te zien.
                    </AlertDescription>
                  </Alert>
                </Card>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3"><Badge className="h-8 w-8 rounded-full flex items-center justify-center p-0 text-lg font-black bg-primary">3</Badge><h4 className="font-black uppercase tracking-tight text-slate-900 text-lg">KPN Things Koppeling</h4></div>
                <Card className="bg-slate-50 border-2 p-6 rounded-3xl space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-100 p-3 rounded-2xl shrink-0 shadow-sm"><Globe className="h-5 w-5 text-blue-600" /></div>
                    <div className="space-y-1">
                      <p className="text-xs font-black uppercase text-slate-900">1. Destination aanmaken</p>
                      <p className="text-[11px] text-slate-500 font-bold leading-relaxed">Ga naar 'Destinations' in KPN. Maak een HTTP Destination met de unieke URL van de geselecteerde sensor (zie tab KPN Setup).</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-purple-100 p-3 rounded-2xl shrink-0 shadow-sm"><FileCode className="h-5 w-5 text-purple-600" /></div>
                    <div className="space-y-1">
                      <p className="text-xs font-black uppercase text-slate-900">2. Payload Decoder instellen</p>
                      <p className="text-[11px] text-slate-500 font-bold leading-relaxed">Kopieer de JavaScript code uit BeheerHub en plak deze bij de Payload settings van uw Device in KPN.</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="p-8 border-t bg-slate-50 shrink-0">
            <Button onClick={() => setIsStepsDialogOpen(false)} className="w-full sm:w-auto font-black uppercase tracking-tight px-12 h-14 shadow-2xl shadow-primary/20 rounded-2xl text-base">
              Ik heb alles gelezen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
