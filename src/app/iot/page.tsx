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
    toast({ title: 'Gekopieerd' });
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
        appEui: formatHex(selectedSensor.appEui, 8),
        appKey: formatHex(selectedSensor.appKey, 16),
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
      toast({ title: "Code bijgewerkt door AI" });
    } catch (err) {
      toast({ variant: 'destructive', title: "Fout bij genereren" });
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

/* Mandatory CubeCell v1.4.0 Variables */
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
  Wire.beginTransmission(0x52);
  Wire.write(0x00);
  Wire.endTransmission();
  delay(30);
  Wire.requestFrom(0x52, 2);
  return Wire.available() >= 2 ? (Wire.read() << 8) | Wire.read() : 0;
}

void prepareTxFrame(uint8_t port) {
  uint16_t d = readTOF() / 10;
  int v = map(d, 0, ${selectedSensor.binDepthCm || 100}, 100, 0);
  uint16_t b = getBatteryVoltage();
  appDataSize = 5;
  appData[0] = d >> 8; appData[1] = d; appData[2] = constrain(v, 0, 100);
  appData[3] = b >> 8; appData[4] = b;
}

void setup() {
  boardInitMcu();
  Serial.begin(115200);
  Wire.begin();
  LoRaWAN.init(loraWanClass, loraWanRegion);
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
      <PageHeader title="Internet of Things" description="Beheer hardware en KPN koppelingen.">
        <Button onClick={() => setIsAddDialogOpen(true)} className="font-black h-10 uppercase">
          <Plus className="mr-2 h-4 w-4" /> Nieuwe Sensor
        </Button>
      </PageHeader>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 p-4 md:p-6 overflow-hidden">
        <Card className={cn("lg:col-span-3 flex flex-col rounded-2xl overflow-hidden", isTablet && selectedSensorId ? "hidden" : "flex")}>
          <CardHeader className="p-4 border-b bg-slate-50/50">
            <CardTitle className="text-[10px] font-black uppercase text-slate-400">Apparaten</CardTitle>
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

        <Card className={cn("lg:col-span-9 flex flex-col rounded-2xl overflow-hidden", !selectedSensor && "hidden lg:flex")}>
          {selectedSensor ? (
            <Tabs defaultValue="map" className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="px-4 py-2 border-b bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isTablet && <Button variant="ghost" size="icon" onClick={() => setSelectedSensorId(null)} className="h-8 w-8 bg-white border"><ArrowLeft className="h-4 w-4" /></Button>}
                  <TabsList className="bg-transparent h-9 p-0 gap-2">
                    <TabsTrigger value="map" className="px-4 text-[10px] font-black uppercase tracking-widest rounded-lg">Dashboard</TabsTrigger>
                    <TabsTrigger value="code" className="px-4 text-[10px] font-black uppercase tracking-widest rounded-lg">Hardware Code</TabsTrigger>
                    <TabsTrigger value="kpn" className="px-4 text-[10px] font-black uppercase tracking-widest rounded-lg">KPN Setup</TabsTrigger>
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
                        <AlertDialogTitle>Verwijder Sensor</AlertDialogTitle>
                        <AlertDialogDescription>Weet u zeker dat u de sensor {selectedSensor.name} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.</AlertDialogDescription>
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
                      <span>Status</span>
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

              <TabsContent value="code" className="flex-1 m-0 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden">
                <div className="lg:col-span-8 flex flex-col p-6 overflow-hidden bg-slate-100/50">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="font-black uppercase tracking-tight flex items-center gap-2"><FileCode className="h-5 w-5 text-primary" /> Arduino Sketch (v1.4.0)</h3>
                    <Button onClick={() => copyToClipboard(selectedSensor.iotCode || defaultCode, setCopiedCode)} className="h-8 px-4 text-[10px] font-black uppercase shadow-sm">
                      {copiedCode ? <Check className="h-3 w-3 mr-2" /> : <Copy className="h-3 w-3 mr-2" />}
                      Kopieer Code
                    </Button>
                  </div>
                  <div className="flex-1 bg-slate-900 rounded-2xl p-1 shadow-2xl overflow-hidden relative border-[6px] border-slate-800">
                    <ScrollArea className="h-full" scrollbars="both">
                      <pre className="text-blue-400 font-mono text-[11px] leading-relaxed p-6 whitespace-pre min-w-max">
                        {selectedSensor.iotCode || defaultCode}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
                <div className="lg:col-span-4 bg-white border-l flex flex-col overflow-hidden">
                  <div className="p-4 border-b bg-slate-50/50"><h3 className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> AI Code Assistent</h3></div>
                  <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Foutcode of Aanpassing</Label>
                      <Textarea 
                        placeholder="Plak hier uw Arduino IDE foutmelding of vraag om een wijziging..." 
                        className="min-h-[120px] text-xs font-medium rounded-xl bg-slate-50 border-slate-200 focus:ring-primary/20" 
                        value={aiPrompt} 
                        onChange={e => setAiPrompt(e.target.value)} 
                      />
                      <Button className="w-full h-10 font-black uppercase shadow-lg shadow-primary/20" disabled={!aiPrompt.trim() || isFixing} onClick={handleFixWithAI}>
                        {isFixing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                        Herstel met AI
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex-1 flex flex-col min-h-0">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 mb-3 flex items-center gap-2"><History className="h-3.5 w-3.5" /> Historie</h4>
                      <ScrollArea className="flex-1 pr-2">
                        {selectedSensor.iotHistory?.map((m, i) => (
                          <div key={i} className={cn("p-3 rounded-2xl text-[11px] mb-3 shadow-sm", m.role === 'user' ? "bg-slate-100 text-slate-700 ml-4" : "bg-blue-50 text-blue-700 mr-4 border border-blue-100")}>
                            <p className="font-medium leading-relaxed">{m.content}</p>
                          </div>
                        ))}
                        {(!selectedSensor.iotHistory || selectedSensor.iotHistory.length === 0) && (
                          <p className="text-[10px] font-bold text-slate-300 uppercase text-center mt-12">Geen historie</p>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="kpn" className="flex-1 m-0 p-6 bg-slate-50 overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-8">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black uppercase tracking-tight">KPN Things Koppeling</h3>
                    <Button variant="outline" onClick={() => setIsStepsDialogOpen(true)} className="h-9 font-black uppercase text-[10px] gap-2"><ClipboardList className="h-4 w-4" /> Stappenplan</Button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center"><h4 className="text-sm font-black uppercase">1. Payload Decoder</h4><Button variant="outline" size="sm" onClick={() => copyToClipboard(decoderCode, setCopiedDecoder)} className="h-7 text-[9px] font-black uppercase">Kopieer</Button></div>
                    <Card className="bg-slate-900 text-blue-400 p-6 rounded-2xl font-mono text-[11px]"><pre className="whitespace-pre-wrap">{decoderCode}</pre></Card>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase">2. Webhook Target URL</h4>
                    <Card className="bg-slate-900 text-white p-6 rounded-2xl overflow-hidden relative">
                      <div className="flex justify-between items-center mb-4"><span className="text-[10px] font-black uppercase tracking-widest opacity-50">HTTP POST URL</span><Button size="sm" variant="ghost" onClick={() => copyToClipboard(apiEndpoint, setCopiedUrl)} className="h-7 text-[9px] bg-white/10 hover:bg-white/20 text-white uppercase">Kopieer</Button></div>
                      <div className="bg-black/40 p-4 rounded-xl font-mono text-[10px] break-all text-blue-400 border border-white/5">{apiEndpoint}</div>
                      <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/5"><p className="text-[10px] text-slate-400 italic">Voeg in KPN Things een custom header toe: <strong>X-HTTP-Method-Override: PATCH</strong></p></div>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
              <Radio className="h-16 w-16 text-slate-200 mb-6" />
              <h3 className="text-xl font-black uppercase tracking-tight mb-2">Selecteer een Apparaat</h3>
              <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto">Kies een sensor in de lijst om de live data, code en KPN-instellingen te beheren.</p>
            </div>
          )}
        </Card>
      </div>

      <AddSensorDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />

      <Dialog open={isStepsDialogOpen} onOpenChange={setIsStepsDialogOpen}>
        <DialogContent className="sm:max-w-3xl h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-6 border-b bg-slate-50 shrink-0">
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900">Technisch Stappenplan: CubeCell + TOF10120</DialogTitle>
            <DialogDescription className="font-bold text-slate-500">Volg deze stappen voor een correcte installatie en verbinding.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-10 pb-12">
              <div className="space-y-4">
                <div className="flex items-center gap-3"><Badge className="h-8 w-8 rounded-full flex items-center justify-center p-0 text-lg font-black bg-primary">1</Badge><h4 className="font-black uppercase tracking-tight text-slate-900">Hardware Aansluiten</h4></div>
                <Card className="bg-slate-50 border-2 p-5 rounded-2xl grid sm:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Bedrading Sensor</p>
                    <ul className="text-xs space-y-2 font-bold text-slate-700">
                      <li className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-red-500" /> Rood &rarr; 3V3 (VExt)</li>
                      <li className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-black" /> Zwart &rarr; GND</li>
                      <li className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-blue-500" /> Blauw (SDA) &rarr; SDA Pin</li>
                      <li className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-green-500" /> Groen (SCL) &rarr; SCL Pin</li>
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Voeding</p>
                    <p className="text-xs font-medium text-slate-600 leading-relaxed"><Zap className="h-4 w-4 text-orange-500 inline mr-1" /> Sluit de 2500mAh LiPo aan op de witte JST connector. De CubeCell laadt de batterij automatisch op via USB.</p>
                  </div>
                </Card>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3"><Badge className="h-8 w-8 rounded-full flex items-center justify-center p-0 text-lg font-black bg-primary">2</Badge><h4 className="font-black uppercase tracking-tight text-slate-900">Arduino IDE & Join Proces</h4></div>
                <Card className="bg-slate-50 border-2 p-5 rounded-2xl space-y-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Board Manager Config</p>
                    <div className="grid grid-cols-2 gap-3 text-[11px] font-bold text-slate-700">
                      <div className="border-b pb-1">Board: <span className="text-primary">CubeCell-Board (HTCC-AB01)</span></div>
                      <div className="border-b pb-1">Region: <span className="text-primary">REGION_EU868</span></div>
                      <div className="border-b pb-1">Class: <span className="text-primary">CLASS_A</span></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Het Join Proces</p>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">Zodra u de code flasht, zal het board proberen een verbinding (Join) te maken met KPN. Dit kan bij de eerste keer enkele minuten duren. Houd de <strong>Serial Monitor (115200 baud)</strong> open om de status te volgen. Pas na een succesvolle Join wordt de eerste meting verstuurd.</p>
                  </div>
                </Card>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3"><Badge className="h-8 w-8 rounded-full flex items-center justify-center p-0 text-lg font-black bg-primary">3</Badge><h4 className="font-black uppercase tracking-tight text-slate-900">KPN Things Configuratie</h4></div>
                <Card className="bg-slate-50 border-2 p-5 rounded-2xl space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-100 p-2 rounded-xl shrink-0"><Globe className="h-4 w-4 text-blue-600" /></div>
                    <div>
                      <p className="text-xs font-black uppercase">1. Device Registratie</p>
                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed">Gebruik het Chip ID van uw CubeCell als DevEUI in het KPN portaal.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-purple-100 p-2 rounded-xl shrink-0"><FileCode className="h-4 w-4 text-purple-600" /></div>
                    <div>
                      <p className="text-xs font-black uppercase">2. Payload Decoder</p>
                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed">Kopieer de JavaScript code uit de "KPN Koppeling" tab en plak deze bij de Payload Decoder instellingen in KPN.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-orange-100 p-2 rounded-xl shrink-0"><Zap className="h-4 w-4 text-orange-600" /></div>
                    <div>
                      <p className="text-xs font-black uppercase">3. Destination Webhook</p>
                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed">Maak een nieuwe HTTP Destination. Gebruik de URL uit dit dashboard. Stel de methode in op POST en voeg de header <strong>X-HTTP-Method-Override: PATCH</strong> toe.</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="p-6 border-t bg-slate-50 shrink-0"><Button onClick={() => setIsStepsDialogOpen(false)} className="w-full sm:w-auto font-black uppercase tracking-tight px-12 h-12 shadow-xl shadow-primary/20">Ik begrijp het</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
