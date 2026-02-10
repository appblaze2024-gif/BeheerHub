'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Wifi, Database, Cpu, Plus, MapPin, Battery, Activity, Loader2, Signal, SignalLow, Trash2, MoreVertical, Terminal, Copy, Check, ExternalLink, Code2, Info, BookOpen } from 'lucide-react';
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
    toast({ title: 'Gekopieerd', description: 'Code naar klembord gekopieerd.' });
  };

  // Construct the REST API URL for the sensor
  const apiEndpoint = selectedSensor 
    ? `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/sensors/${selectedSensor.id}?key=${firebaseConfig.apiKey}`
    : '';

  // ESP32 Code Template
  const esp32Code = selectedSensor ? `#include <WiFi.h>
#include <HTTPClient.h>

// --- WiFi Instellingen ---
const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

// --- Project Config (BeheerHub) ---
const String projectId = "${firebaseConfig.projectId}";
const String apiKey = "${firebaseConfig.apiKey}";
const String sensorId = "${selectedSensor.id}";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  
  Serial.print("Verbinden met WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Verbonden!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // API URL voor deze specifieke sensor
    String url = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/sensors/" + sensorId + "?key=" + apiKey;
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Data om te updaten (voorbeeld: status en batterij)
    // We gebruiken de PATCH methode om alleen deze velden te wijzigen
    String payload = "{\\"fields\\": {\\"status\\": {\\"stringValue\\": \\"Online\\"}, \\"batteryLevel\\": {\\"integerValue\\": \\"85\\"}, \\"lastSeen\\": {\\"stringValue\\": \\"2023-10-27T10:00:00Z\\"}}}";
    
    // Firestore REST vereist PATCH met X-HTTP-Method-Override header voor sommige clients
    http.addHeader("X-HTTP-Method-Override", "PATCH");
    int httpResponseCode = http.POST(payload);
    
    if (httpResponseCode > 0) {
      Serial.printf("Data verzonden! Code: %d\\n", httpResponseCode);
    } else {
      Serial.printf("Fout bij verzenden: %s\\n", http.errorToString(httpResponseCode).c_str());
    }
    
    http.end();
  }
  
  // Wacht 5 minuten voor de volgende update
  delay(300000); 
}` : '// Selecteer een sensor om code te genereren';

  return (
    <div className="flex flex-col flex-1 p-4 min-h-0 bg-background overflow-hidden">
      <PageHeader 
        title="IoT & Sensorbeheer" 
        description="Koppel hardware aan je dashboard via unieke serienummers."
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
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gekoppelde Units</p>
              <p className="text-xl font-black">{sensors?.length || 0}</p>
            </div>
            <Cpu className="h-5 w-5 text-blue-500" />
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Connectie Methode</p>
              <p className="text-xl font-black">REST API</p>
            </div>
            <Terminal className="h-5 w-5 text-purple-500" />
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cloud Sync</p>
              <p className="text-xl font-black">Real-time</p>
            </div>
            <Wifi className="h-5 w-5 text-green-500" />
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-0 overflow-hidden">
        {/* Sensor Lijst */}
        <Card className="xl:col-span-3 flex flex-col shadow-none overflow-hidden border-slate-200">
          <CardHeader className="p-3 border-b bg-muted/20">
            <CardTitle className="text-xs font-bold uppercase tracking-tight">Mijn Apparaten</CardTitle>
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
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-xs truncate">{sensor.name}</p>
                        <p className="text-[9px] text-muted-foreground font-mono bg-slate-200 px-1 rounded">{sensor.id}</p>
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
                              <AlertDialogTitle>Sensor verwijderen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                De koppeling met serienummer '{sensor.id}' wordt verbroken.
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
                <SignalLow className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Geen koppelingen</p>
              </div>
            )}
          </div>
        </Card>

        {/* Kaart & Integratie Gids */}
        <Card className="xl:col-span-9 flex flex-col shadow-none border-slate-200 overflow-hidden">
          {selectedSensor ? (
            <Tabs defaultValue="map" className="flex-1 flex flex-col">
              <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between">
                <TabsList className="h-8 bg-transparent gap-2">
                  <TabsTrigger value="map" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 text-xs font-bold gap-2">
                    <MapPin className="h-3 w-3" /> Kaart
                  </TabsTrigger>
                  <TabsTrigger value="code" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 text-xs font-bold gap-2">
                    <Code2 className="h-3 w-3" /> ESP32 Code
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-2">
                        <p className="text-[9px] font-black text-muted-foreground uppercase">Serienummer:</p>
                        <span className="text-[10px] font-mono font-bold">{selectedSensor.id}</span>
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
                    <Card className="bg-zinc-900/95 backdrop-blur text-zinc-100 border-none shadow-2xl">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                    <Terminal className="h-3 w-3" /> Live REST API Endpoint
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
                            <div className="bg-black/50 p-2 rounded font-mono text-[9px] break-all border border-zinc-800 text-green-400">
                                PATCH {apiEndpoint}
                            </div>
                        </CardContent>
                    </Card>
                </div>
              </TabsContent>

              <TabsContent value="code" className="flex-1 m-0 overflow-hidden flex flex-col bg-zinc-950 p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <BookOpen className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-zinc-100 text-sm font-bold">ESP32 Arduino Sketch</h3>
                            <p className="text-zinc-500 text-[10px]">Kopieer deze code naar de Arduino IDE. De API-keys zijn al voor je ingevuld.</p>
                        </div>
                    </div>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="text-xs font-bold gap-2"
                        onClick={() => copyToClipboard(esp32Code)}
                    >
                        <Copy className="h-3 w-3" /> Code Kopiëren
                    </Button>
                </div>
                <div className="flex-1 bg-black/40 rounded border border-zinc-800 p-4 overflow-auto scrollbar-hide">
                    <pre className="text-[11px] font-mono text-blue-300 leading-relaxed">
                        {esp32Code}
                    </pre>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <div className="bg-muted p-6 rounded-full mb-4">
                    <Cpu className="h-12 w-12 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-black tracking-tight mb-2">Geen sensor geselecteerd</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">Selecteer een apparaat aan de linkerkant om de kaart en integratie-instructies te bekijken.</p>
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
