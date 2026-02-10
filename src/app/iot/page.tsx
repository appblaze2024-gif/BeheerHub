
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Wifi, Database, Cpu, Plus, MapPin, Battery, Activity, Loader2, Signal, SignalLow, Trash2, MoreVertical, Terminal, Copy, Check, ExternalLink, Code2, Info, BookOpen, Sparkles, Send, ArrowRight } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateIoTCode } from '@/ai/flows/generate-iot-code-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

export default function IoTPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [selectedSensorId, setSelectedSensorId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // AI State
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [chatHistory, setChatHistory] = React.useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [customCode, setCustomCode] = React.useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = React.useState<string | null>(null);

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
    toast({ title: 'Gekopieerd', description: 'Code naar klembord gekopieerd.' });
  };

  const handleGenerateCode = async () => {
    if (!aiPrompt.trim() || !selectedSensor) return;
    
    setIsGenerating(true);
    const newHistory = [...chatHistory, { role: 'user' as const, content: aiPrompt }];
    setChatHistory(newHistory);
    
    try {
      const result = await generateIoTCode({
        prompt: aiPrompt,
        board: 'ESP32',
        history: chatHistory,
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey,
      });
      
      setCustomCode(result.code);
      setAiExplanation(result.explanation);
      setChatHistory([...newHistory, { role: 'model' as const, content: result.explanation }]);
      setAiPrompt('');
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

  const defaultEsp32Code = selectedSensor ? `#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

const String projectId = "${firebaseConfig.projectId}";
const String apiKey = "${firebaseConfig.apiKey}";
const String sensorId = "${selectedSensor.id}";

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
    
    // Voorbeeld data
    String payload = "{\\"fields\\": {\\"status\\": {\\"stringValue\\": \\"Online\\"}, \\"batteryLevel\\": {\\"integerValue\\": \\"100\\"}}}";
    int httpResponseCode = http.POST(payload);
    http.end();
  }
  delay(300000); 
}` : '';

  const activeCode = customCode || defaultEsp32Code;

  return (
    <div className="flex flex-col flex-1 p-4 min-h-0 bg-slate-50 dark:bg-zinc-950 overflow-hidden">
      <PageHeader 
        title="IoT & Sensoren" 
        description="Beheer hardware-koppelingen via unieke serienummers."
        className="p-0 mb-4"
      >
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nieuwe Sensor
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="shadow-none border-slate-200">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Apparaten</p>
              <p className="text-xl font-black">{sensors?.length || 0}</p>
            </div>
            <Cpu className="h-5 w-5 text-blue-500" />
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">API Methode</p>
              <p className="text-xl font-black">REST PATCH</p>
            </div>
            <Terminal className="h-5 w-5 text-purple-500" />
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gateway Status</p>
              <p className="text-xl font-black text-green-600">Online</p>
            </div>
            <Wifi className="h-5 w-5 text-green-500" />
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-0 overflow-hidden">
        {/* Sidebar: Sensor List */}
        <Card className="xl:col-span-3 flex flex-col shadow-none overflow-hidden border-slate-200">
          <CardHeader className="p-3 border-b bg-muted/20">
            <CardTitle className="text-xs font-bold uppercase tracking-tight">Gekoppelde Units</CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : sensors && sensors.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {sensors.map(sensor => (
                  <div 
                    key={sensor.id} 
                    className={cn(
                      "p-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 transition-all",
                      selectedSensorId === sensor.id && "bg-white shadow-sm border-l-4 border-l-primary pl-2"
                    )}
                    onClick={() => {
                        setSelectedSensorId(sensor.id);
                        setCustomCode(null);
                        setChatHistory([]);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate">{sensor.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-[9px] bg-slate-100 px-1 rounded font-mono">{sensor.id}</code>
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
                              <AlertDialogAction onClick={() => handleDelete(sensor.id)} className="bg-destructive text-white hover:bg-destructive/90">Verwijderen</AlertDialogAction>
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
                <SignalLow className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Geen apparaten</p>
              </div>
            )}
          </div>
        </Card>

        {/* Main Content: Map & Code */}
        <Card className="xl:col-span-9 flex flex-col shadow-none border-slate-200 overflow-hidden">
          {selectedSensor ? (
            <Tabs defaultValue="map" className="flex-1 flex flex-col">
              <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between">
                <TabsList className="h-8 bg-transparent gap-2">
                  <TabsTrigger value="map" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 text-xs font-bold gap-2">
                    <MapPin className="h-3 w-3" /> Kaart & API
                  </TabsTrigger>
                  <TabsTrigger value="code" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 text-xs font-bold gap-2">
                    <Code2 className="h-3 w-3" /> ESP32 Arduino Code
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2">
                        <p className="text-[9px] font-black text-muted-foreground uppercase">Serienummer:</p>
                        <span className="text-[10px] font-mono font-bold bg-slate-200 px-1.5 py-0.5 rounded">{selectedSensor.id}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedSensorId(null)}><XIcon className="h-4 w-4" /></Button>
                </div>
              </div>

              <TabsContent value="map" className="flex-1 m-0 relative">
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
                <div className="absolute bottom-4 left-4 right-4 z-10">
                    <Card className="bg-zinc-900/95 backdrop-blur text-zinc-100 border-none shadow-2xl overflow-hidden">
                        <div className="bg-zinc-800 px-3 py-1.5 flex items-center justify-between border-b border-zinc-700">
                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                <Terminal className="h-3 w-3" /> REST API Endpoint
                            </p>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 text-[9px] text-zinc-400 hover:text-white"
                                onClick={() => copyToClipboard(apiEndpoint)}
                            >
                                {copied ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                                Kopieer URL
                            </Button>
                        </div>
                        <CardContent className="p-3">
                            <div className="bg-black/50 p-2 rounded font-mono text-[9px] break-all border border-zinc-800 text-green-400">
                                PATCH {apiEndpoint}
                            </div>
                        </CardContent>
                    </Card>
                </div>
              </TabsContent>

              <TabsContent value="code" className="flex-1 m-0 flex flex-col xl:flex-row overflow-hidden">
                {/* Code Editor Side */}
                <div className="flex-1 flex flex-col bg-zinc-950 p-4 min-h-0 border-r border-zinc-800">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-500/20 p-2 rounded-lg">
                                <BookOpen className="h-4 w-4 text-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-zinc-100 text-sm font-bold">C++ Sketch</h3>
                                <p className="text-zinc-500 text-[10px]">Geconfigureerd voor project {firebaseConfig.projectId}</p>
                            </div>
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="text-xs font-bold gap-2"
                            onClick={() => copyToClipboard(activeCode)}
                        >
                            <Copy className="h-3 w-3" /> Kopieer
                        </Button>
                    </div>
                    <div className="flex-1 bg-black/40 rounded border border-zinc-800 p-4 overflow-auto scrollbar-hide">
                        <pre className="text-[11px] font-mono text-blue-300 leading-relaxed">
                            {activeCode}
                        </pre>
                    </div>
                </div>

                {/* AI Assistent Side */}
                <div className="w-full xl:w-80 flex flex-col bg-zinc-900 border-l border-zinc-800">
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-purple-400" />
                            <h4 className="text-xs font-black text-zinc-100 uppercase tracking-wider">IoT Assistent</h4>
                        </div>
                        <Badge variant="secondary" className="text-[9px] bg-zinc-800 text-zinc-400">Gemini 2.5</Badge>
                    </div>
                    
                    <ScrollArea className="flex-1 p-4">
                        {chatHistory.length === 0 ? (
                            <div className="text-center py-8">
                                <Info className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
                                <p className="text-xs text-zinc-500 font-medium">Stel een vraag om de code aan te passen. Bijv: "Voeg een DHT11 temperatuursensor toe op pin 4."</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {chatHistory.map((msg, i) => (
                                    <div key={i} className={cn(
                                        "p-2 rounded text-[11px] leading-relaxed",
                                        msg.role === 'user' ? "bg-purple-500/10 text-purple-200 border border-purple-500/20" : "bg-zinc-800 text-zinc-300 border border-zinc-700"
                                    )}>
                                        <p className="font-black uppercase text-[8px] mb-1 opacity-50">{msg.role === 'user' ? 'Jij' : 'Assistent'}</p>
                                        {msg.content}
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>

                    <div className="p-4 border-t border-zinc-800 bg-zinc-950/30">
                        <div className="relative">
                            <Textarea 
                                placeholder="Vraag om een aanpassing..."
                                className="min-h-[80px] bg-zinc-950 border-zinc-800 text-zinc-100 text-xs resize-none pr-10"
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
                                className="absolute right-2 bottom-2 h-7 w-7 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                                onClick={handleGenerateCode}
                                disabled={isGenerating || !aiPrompt.trim()}
                            >
                                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-[9px] text-zinc-600 mt-2 text-center">De AI gebruikt de actuele Firebase-config van dit project.</p>
                    </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-zinc-950">
                <div className="bg-slate-50 dark:bg-zinc-900 p-10 rounded-full mb-6 relative">
                    <Cpu className="h-16 w-16 text-slate-300 dark:text-zinc-700" />
                    <div className="absolute top-0 right-0 h-6 w-6 bg-primary rounded-full flex items-center justify-center text-white animate-bounce">
                        <ArrowRight className="h-4 w-4" />
                    </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">Code & Integratie</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-8">
                    Selecteer een apparaat in de lijst links om de bijbehorende <strong>Arduino code</strong> en <strong>API-instellingen</strong> te bekijken.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-lg">
                    <div className="p-4 rounded-lg border bg-slate-50 dark:bg-zinc-900/50">
                        <h4 className="text-xs font-bold uppercase mb-1 flex items-center gap-2"><Plus className="h-3 w-3 text-primary" /> Stap 1</h4>
                        <p className="text-[11px] text-muted-foreground">Registreer je hardware met het unieke serienummer.</p>
                    </div>
                    <div className="p-4 rounded-lg border bg-slate-50 dark:bg-zinc-900/50">
                        <h4 className="text-xs font-bold uppercase mb-1 flex items-center gap-2"><List className="h-3 w-3 text-primary" /> Stap 2</h4>
                        <p className="text-[11px] text-muted-foreground">Klik op de sensor in de lijst aan de linkerkant.</p>
                    </div>
                    <div className="p-4 rounded-lg border bg-slate-50 dark:bg-zinc-900/50">
                        <h4 className="text-xs font-bold uppercase mb-1 flex items-center gap-2"><Code2 className="h-3 w-3 text-primary" /> Stap 3</h4>
                        <p className="text-[11px] text-muted-foreground">Kopieer de gegenereerde C++ code naar je Arduino IDE.</p>
                    </div>
                    <div className="p-4 rounded-lg border bg-slate-50 dark:bg-zinc-900/50">
                        <h4 className="text-xs font-bold uppercase mb-1 flex items-center gap-2"><Wifi className="h-3 w-3 text-primary" /> Stap 4</h4>
                        <p className="text-[11px] text-muted-foreground">Upload de code en monitor de status live op de kaart.</p>
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
