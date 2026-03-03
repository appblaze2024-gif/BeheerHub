
'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef } from 'react-map-gl';
import { useCollection, useFirestore, useUser, useMemoFirebase, updateDocumentNonBlocking, useFirebaseApp, useDoc } from '@/firebase';
import { collection, query, where, doc, getDocs, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Play, 
  CheckCircle2, 
  MapPin, 
  Gauge, 
  Loader2,
  Clock,
  Navigation,
  RefreshCw,
  Search,
  Camera,
  MessageSquare,
  Mic,
  Check,
  LayoutGrid,
  Bell,
  LocateFixed,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Object as MapObject, Melding, UploadedFile } from '@/lib/types';
import { cn } from '@/lib/utils';
import * as turf from '@turf/turf';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/firebase/profile-provider';
import { useToast } from '@/components/ui/use-toast';
import { LoadingScreen } from '@/components/loading-screen';
import { addSeconds, format as formatDate, differenceInCalendarDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { translateText } from '@/ai/flows/translate-text-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';
const SIMULATION_START_LOCATION = { latitude: 52.2644, longitude: 4.7242 };

const translationLanguages = [
  { code: 'nl-NL', name: 'Dutch', flag: 'nl', label: 'Nederlands' },
  { code: 'en-US', name: 'English', flag: 'us', label: 'Engels' },
  { code: 'pl-PL', name: 'Polish', flag: 'pl', label: 'Pools' },
  { code: 'uk-UA', name: 'Ukrainian', flag: 'ua', label: 'Oekraïens' },
  { code: 'de-DE', name: 'German', flag: 'de', label: 'Duits' },
  { code: 'hu-HU', name: 'Hungarian', flag: 'hu', label: 'Hongaars' },
];

const routeLayer: Layer = {
  id: 'route',
  type: 'line',
  source: 'route-line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#2563eb', 'line-width': 10, 'line-opacity': 1 },
};

const routeLayerCasing: Layer = {
  id: 'route-casing',
  type: 'line',
  source: 'route-line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#1e40af', 'line-width': 16, 'line-opacity': 0.2 },
};

const getMeldingAgeColor = (datum?: string) => {
    if (!datum) return 'bg-slate-400';
    try {
        const d = new Date(datum);
        const diffDays = Math.abs(differenceInCalendarDays(new Date(), d));
        if (diffDays <= 1) return 'bg-slate-400'; 
        if (diffDays === 2) return 'bg-yellow-400'; 
        if (diffDays === 3) return 'bg-orange-500'; 
        return 'bg-red-600'; 
    } catch (e) { return 'bg-slate-400'; }
};

/**
 * Geïntegreerde Werkbon Component die als overlay verschijnt
 */
function IntegratedWerkbonOverlay({ 
    meldingId, 
    onClose, 
    onCompleted 
}: { 
    meldingId: string, 
    onClose: () => void, 
    onCompleted: (id: string) => void 
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { profile } = useProfile();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = React.useState('Werkzaamheden');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [afhandelingBijzonderheden, setAfhandelingBijzonderheden] = React.useState('');
    const [isListening, setIsListening] = React.useState(false);
    const [sourceLang, setSourceLang] = React.useState(translationLanguages[0]);
    const [targetLang, setTargetLang] = React.useState(translationLanguages[0]);
    const [isTranslating, setIsTranslating] = React.useState(false);
    const recognitionRef = React.useRef<any>(null);

    const meldingRef = useMemoFirebase(() => firestore ? doc(firestore, 'meldingen', meldingId) : null, [firestore, meldingId]);
    const { data: melding, isLoading } = useDoc<Melding>(meldingRef);

    React.useEffect(() => {
        if (melding) {
            setAfhandelingBijzonderheden(melding.afhandeling_bijzonderheden || '');
        }
    }, [melding]);

    const handleStartWork = async () => {
        if (!firestore || !melding) return;
        updateDocumentNonBlocking(doc(firestore, 'meldingen', melding.id), { workStartedAt: new Date().toISOString() });
    };

    const handleAfronden = async () => {
        if (!firestore || !melding || !user) return;
        setIsSubmitting(true);
        let minutesWorked = melding.gewerkteMinuten || 0;
        if (melding.workStartedAt) {
            minutesWorked += Math.round((Date.now() - new Date(melding.workStartedAt).getTime()) / (1000 * 60));
        }
        const finisher = profile?.displayName || user.email || 'Onbekend';
        try {
            updateDocumentNonBlocking(doc(firestore, 'meldingen', melding.id), {
                status: 'Afgerond',
                afhandeling_datum: formatDate(new Date(), 'yyyy-MM-dd'),
                afhandeling_tijdstip: formatDate(new Date(), 'HH:mm'),
                afgehandeld_door: finisher,
                afhandeling_bijzonderheden: afhandelingBijzonderheden || null,
                gewerkteMinuten: minutesWorked,
                workStartedAt: null, 
            });
            toast({ title: 'Werkbon afgerond' });
            onCompleted(melding.id);
            onClose();
        } catch (error) { toast({ variant: "destructive", title: 'Fout bij afronden' }); } finally { setIsSubmitting(false); }
    };

    const toggleListening = () => {
        if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const recognition = new SpeechRecognition();
        recognition.lang = sourceLang.code;
        recognition.continuous = true;
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event: any) => {
            const transcript = event.results[event.results.length - 1][0].transcript;
            setAfhandelingBijzonderheden(prev => prev + (prev ? ' ' : '') + transcript);
        };
        recognitionRef.current = recognition;
        recognition.start();
    };

    const handleAITranslate = async () => {
        if (!afhandelingBijzonderheden || isTranslating) return;
        setIsTranslating(true);
        try {
            const result = await translateText(afhandelingBijzonderheden, targetLang.name);
            setAfhandelingBijzonderheden(result.translatedText);
        } catch (err) { toast({ variant: 'destructive', title: 'Vertaalfout' }); } finally { setIsTranslating(false); }
    };

    if (isLoading || !melding) return <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full bg-white animate-in slide-in-from-bottom duration-300">
            <header className="h-14 border-b bg-slate-50 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full"><XIcon className="h-5 w-5" /></Button>
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-tight leading-none">{melding.intakenummer}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{melding.subcategorie}</p>
                    </div>
                </div>
                {melding.workStartedAt ? (
                    <Button className="bg-orange-600 hover:bg-orange-700 h-9 font-black uppercase px-6 text-xs rounded-xl shadow-lg shadow-orange-600/20" onClick={handleAfronden} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Check className="mr-2 h-3 w-3" />}
                        AFHANDELEN
                    </Button>
                ) : (
                    <Button className="bg-green-600 hover:bg-green-700 h-9 font-black uppercase px-6 text-xs rounded-xl shadow-lg shadow-green-600/20" onClick={handleStartWork}>
                        START WERK
                    </Button>
                )}
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <TabsList className="bg-white border-b h-10 px-4 justify-start gap-6">
                    <TabsTrigger value="Werkzaamheden" className="text-[10px]"><FileText className="h-3 w-3 mr-1.5" /> Werk</TabsTrigger>
                    <TabsTrigger value="Opmerkingen" className="text-[10px]"><MessageSquare className="h-3 w-3 mr-1.5" /> Notitie</TabsTrigger>
                    <TabsTrigger value="Fotos" className="text-[10px]"><Camera className="h-3 w-3 mr-1.5" /> Foto's</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-6">
                        <TabsContent value="Werkzaamheden" className="mt-0 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-[8px] font-black uppercase text-slate-400">Locatie</p><p className="text-xs font-bold">{melding.straatnaam} {melding.huisnummer}</p></div>
                                <div><p className="text-[8px] font-black uppercase text-slate-400">Plaats</p><p className="text-xs font-bold uppercase">{melding.plaats}</p></div>
                                <div className="col-span-2"><p className="text-[8px] font-black uppercase text-slate-400">Omschrijving</p><p className="text-xs font-medium italic text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border">"{melding.extra_informatie || 'Geen omschrijving.'}"</p></div>
                            </div>
                        </TabsContent>

                        <TabsContent value="Opmerkingen" className="mt-0 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Button variant={isListening ? "destructive" : "outline"} size="sm" onClick={toggleListening} className="h-8 text-[10px] font-black"><Mic className="h-3.5 w-3.5 mr-1.5" /> DICTEER</Button>
                                <Button variant="outline" size="sm" onClick={handleAITranslate} disabled={isTranslating} className="h-8 text-[10px] font-black"><RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isTranslating && "animate-spin")} /> VERTAAL</Button>
                            </div>
                            <Textarea 
                                placeholder="Typ hier de bijzonderheden..." 
                                className="min-h-[200px] text-xs font-medium rounded-xl bg-slate-50 border-slate-100" 
                                value={afhandelingBijzonderheden}
                                onChange={(e) => setAfhandelingBijzonderheden(e.target.value)}
                            />
                        </TabsContent>

                        <TabsContent value="Fotos" className="mt-0">
                            <div className="grid grid-cols-3 gap-2">
                                {melding.fotos?.map((p, i) => (
                                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border bg-slate-100"><Image src={p.url} alt="foto" fill className="object-cover" /></div>
                                ))}
                                <Button variant="outline" className="aspect-square rounded-xl border-dashed flex flex-col gap-1 text-[10px] font-black uppercase text-slate-400"><Camera className="h-5 w-5" /> FOTO</Button>
                            </div>
                        </TabsContent>
                    </div>
                </ScrollArea>
            </Tabs>
        </div>
    );
}

export default function StartNavigationPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { profile } = useProfile();
  const { toast } = useToast();
  const { setIsHeaderVisible } = useNavigationUI();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const isPrivileged = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [objectsOnRoute, setObjectsOnRoute] = React.useState<MapObject[]>([]);
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const [isLocating, setIsLocating] = React.useState(false);
  const [activeWerkbonId, setActiveWerkbonId] = React.useState<string | null>(null);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [isListExpanded, setIsListExpanded] = React.useState(true);

  // Navigation logic states
  const [smoothLocation, setSmoothLocation] = React.useState<any>(null);
  const [currentRouteGeometry, setCurrentRouteGeometry] = React.useState<any>(null);
  const [distanceRemaining, setDistanceRemaining] = React.useState(0);
  const [speedKmh, setSpeedKmh] = React.useState(0);
  const [heading, setHeading] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);

  const mapRef = React.useRef<MapRef>(null);
  const simAnimationRef = React.useRef<number | null>(null);
  const simStateRef = React.useRef({ distanceTravelled: 0, currentSpeedMs: 0 });

  React.useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setUserLocation(loc);
            if (navigationState !== 'navigating') setSmoothLocation({ ...loc, heading: pos.coords.heading || 0 });
        },
        null, { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigationState]);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw']));
  }, [firestore]);

  const { data: rawMeldingen, isLoading } = useCollection<Melding>(meldingenQuery);

  const filteredMeldingen = React.useMemo(() => {
    if (!rawMeldingen) return [];
    let pool = [...rawMeldingen].filter(m => !completedObjects.includes(m.id));
    if (!isPrivileged) {
        const userName = profile?.displayName || profile?.email || 'Onbekend';
        pool = pool.filter(m => m.behandelaar === userName);
    }
    if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase();
        pool = pool.filter(m => m.intakenummer.toLowerCase().includes(q) || (m.straatnaam || '').toLowerCase().includes(q));
    }
    return pool;
  }, [rawMeldingen, isPrivileged, profile, debouncedSearchQuery, completedObjects]);

  const nextObject = React.useMemo(() => {
    if (filteredMeldingen.length === 0) return null;
    const base = userLocation || SIMULATION_START_LOCATION;
    return [...filteredMeldingen].sort((a, b) => {
        const distA = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([a.longitude, a.latitude]));
        const distB = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([b.longitude, b.latitude]));
        return distA - distB;
    })[0];
  }, [filteredMeldingen, userLocation]);

  const fetchRoute = async () => {
    if (!nextObject || !userLocation) return;
    const start = userLocation;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.longitude},${start.latitude};${nextObject.longitude},${nextObject.latitude}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]) {
            setCurrentRouteGeometry(data.routes[0].geometry);
            setDistanceRemaining(Math.round(data.routes[0].distance));
        }
    } catch (e) {}
  };

  React.useEffect(() => {
    if (navigationState === 'navigating') fetchRoute();
  }, [nextObject?.id, navigationState]);

  const handleStartRit = (simulate = false) => {
    if (filteredMeldingen.length === 0) { toast({ title: "Geen taken" }); return; }
    setIsSimulationMode(simulate);
    setNavigationState('navigating');
    setIsListExpanded(false);
    if (simulate) startSimulation();
  };

  const startSimulation = () => {
    if (!currentRouteGeometry) return;
    const line = turf.lineString(currentRouteGeometry.coordinates);
    const totalDist = turf.length(line, { units: 'meters' });
    simStateRef.current = { distanceTravelled: 0, currentSpeedMs: 0 };

    const animate = (timestamp: number) => {
        if (isPaused || activeWerkbonId) { simAnimationRef.current = requestAnimationFrame(animate); return; }
        const deltaTime = 0.016; 
        const speedMs = 13.8; 
        simStateRef.current.distanceTravelled += speedMs * deltaTime;
        
        if (simStateRef.current.distanceTravelled >= totalDist) {
            const final = currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1];
            setSmoothLocation({ latitude: final[1], longitude: final[0], heading: 0 });
            setSpeedKmh(0);
            return;
        }

        const curr = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
        const ahead = turf.along(line, simStateRef.current.distanceTravelled + 2, { units: 'meters' });
        const [lng, lat] = curr.geometry.coordinates;
        const head = (turf.bearing(curr, ahead) + 360) % 360;
        
        setSmoothLocation({ latitude: lat, longitude: lng, heading: head });
        setSpeedKmh(Math.round(speedMs * 3.6));
        setHeading(head);
        
        simAnimationRef.current = requestAnimationFrame(animate);
    };
    simAnimationRef.current = requestAnimationFrame(animate);
  };

  const handleLocateUser = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserLocation(loc);
        mapRef.current?.getMap().flyTo({ center: [loc.longitude, loc.latitude], zoom: 16 });
        setIsLocating(false);
    }, () => setIsLocating(false), { enableHighAccuracy: true });
  };

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
        {/* Fullscreen Map */}
        <div className="absolute inset-0 z-0">
            <MapGL 
                ref={mapRef} 
                initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 7 }} 
                style={{ width: '100%', height: '100%' }} 
                mapStyle={mapStyle} 
                mapboxAccessToken={MAPBOX_TOKEN}
                onMove={evt => {
                    if (navigationState === 'navigating') {
                        // Keep following if in navigation mode and not manually panning? 
                        // Simplified for MVP: always allow manual pan
                    }
                }}
            >
                {/* User Marker */}
                {smoothLocation && (
                    <Marker longitude={smoothLocation.longitude} latitude={smoothLocation.latitude} anchor="center" rotation={smoothLocation.heading}>
                        <div className="relative flex items-center justify-center w-12 h-12">
                            <svg viewBox="0 0 100 100" className="h-10 w-10 text-primary drop-shadow-2xl"><path d="M50 5 L90 95 L50 75 L10 95 Z" fill="currentColor" stroke="white" strokeWidth="4" /></svg>
                        </div>
                    </Marker>
                )}

                {/* Mission Markers */}
                {filteredMeldingen.map((m) => (
                    <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center" onClick={() => setActiveWerkbonId(m.id)}>
                        <div className={cn("w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center cursor-pointer transition-transform hover:scale-110", getMeldingAgeColor(m.datum))}>
                            <Bell className="h-4 w-4 text-white" />
                        </div>
                    </Marker>
                ))}

                {/* Navigation Line */}
                {currentRouteGeometry && navigationState === 'navigating' && (
                    <Source id="route-line" type="geojson" data={currentRouteGeometry}>
                        <Layer {...routeLayerCasing} /><Layer {...routeLayer} />
                    </Source>
                )}
            </MapGL>
        </div>

        {/* Floating Header UI */}
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
                <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full shadow-2xl bg-white/90 backdrop-blur-md" onClick={() => router.push('/')}><ArrowLeft className="h-6 w-6" /></Button>
            </div>
            <div className="flex items-center gap-3 pointer-events-auto">
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-full shadow-2xl bg-white/90 backdrop-blur-md text-primary" onClick={handleLocateUser} disabled={isLocating}><LocateFixed className="h-6 w-6" /></Button>
                {navigationState === 'setup' ? (
                    <>
                        {isPrivileged && <Button variant="outline" className="h-12 px-6 font-black uppercase bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl" onClick={() => handleStartRit(true)}><Gauge className="mr-2 h-5 w-5" /> SIMULATOR</Button>}
                        <Button className="h-12 px-8 font-black uppercase bg-orange-600 text-white hover:bg-orange-700 shadow-2xl rounded-2xl" onClick={() => handleStartRit(false)}><Play className="mr-2 h-5 w-5 fill-current" /> START RIT</Button>
                    </>
                ) : (
                    <Button variant="destructive" className="h-12 px-8 font-black uppercase rounded-2xl shadow-2xl" onClick={() => { setNavigationState('setup'); setIsListExpanded(true); setCurrentRouteGeometry(null); if(simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current); }}>STOP RIT</Button>
                )}
            </div>
        </div>

        {/* Navigation Info Overlay */}
        {navigationState === 'navigating' && !activeWerkbonId && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-lg animate-in slide-in-from-bottom duration-500">
                <Card className="bg-white/95 backdrop-blur-md shadow-2xl border-none rounded-[2.5rem] overflow-hidden">
                    <CardContent className="p-6 flex items-center justify-between gap-6">
                        <div className="flex flex-col items-center">
                            <p className="text-3xl font-black">{formatDate(addSeconds(new Date(), (distanceRemaining/5000)*3600), 'HH:mm')}</p>
                            <p className="text-[10px] font-black text-slate-400 uppercase">aankomst</p>
                        </div>
                        <div className="flex-1 flex flex-col gap-2">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                                <span>Volgende: {nextObject?.intakenummer}</span>
                                <span>{(distanceRemaining/1000).toFixed(1)} km</span>
                            </div>
                            <Progress value={100} className="h-2 bg-slate-100" />
                        </div>
                        <div className="h-16 w-16 rounded-full border-4 border-primary flex flex-col items-center justify-center bg-white shadow-lg">
                            <span className="text-xl font-black text-primary leading-none">{speedKmh}</span>
                            <span className="text-[7px] font-black uppercase text-slate-400">km/h</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )}

        {/* Collapsible Mission List */}
        <div className={cn(
            "absolute bottom-0 left-0 right-0 z-40 transition-transform duration-500 ease-in-out bg-white border-t-4 border-slate-900 rounded-t-[2.5rem] shadow-2xl flex flex-col",
            isListExpanded ? "h-[45%]" : "h-14 translate-y-[calc(100%-3.5rem)]"
        )}>
            <div className="h-14 flex items-center justify-between px-8 cursor-pointer" onClick={() => setIsListExpanded(!isListExpanded)}>
                <div className="flex items-center gap-4">
                    <LayoutGrid className="h-5 w-5 text-primary" />
                    <span className="font-black uppercase text-sm tracking-tight">Openstaande Opdrachten ({filteredMeldingen.length})</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative w-48 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Zoek op nummer..." className="h-9 pl-9 rounded-xl border-slate-200 bg-slate-50" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onClick={e => e.stopPropagation()} />
                    </div>
                    {isListExpanded ? <ChevronDown className="h-6 w-6 text-slate-300" /> : <ChevronUp className="h-6 w-6 text-slate-300" />}
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full px-4 pb-10">
                    <Table className="min-w-[1000px]">
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                            <TableRow className="h-10 hover:bg-transparent">
                                <TableHead className="font-black uppercase text-[10px] w-32 border-r">Intakenr.</TableHead>
                                <TableHead className="font-black uppercase text-[10px] w-48 border-r">Adres</TableHead>
                                <TableHead className="font-black uppercase text-[10px] border-r">Omschrijving</TableHead>
                                <TableHead className="font-black uppercase text-[10px] w-40 border-r">Subtype</TableHead>
                                <TableHead className="font-black uppercase text-[10px] w-32">Wijk</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMeldingen.map(m => (
                                <TableRow key={m.id} className="h-14 hover:bg-blue-50 transition-colors cursor-pointer border-b" onClick={() => setActiveWerkbonId(m.id)}>
                                    <TableCell className="font-black text-xs border-r">
                                        <div className="flex items-center gap-2"><div className={cn("h-2 w-2 rounded-full", getMeldingAgeColor(m.datum))} />{m.intakenummer}</div>
                                    </TableCell>
                                    <TableCell className="text-xs font-bold border-r truncate max-w-[180px]">{m.straatnaam} {m.huisnummer}</TableCell>
                                    <TableCell className="text-xs font-medium border-r italic text-slate-500 truncate max-w-[300px]">"{m.extra_informatie}"</TableCell>
                                    <TableCell className="text-[10px] font-black uppercase border-r text-slate-900 truncate">{m.subcategorie}</TableCell>
                                    <TableCell className="text-[10px] font-black uppercase">
                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">{m.werkgebied || m.wijk || '-'}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
        </div>

        {/* Integrated Werkbon Overlay */}
        {activeWerkbonId && (
            <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                <div className="w-full max-w-4xl h-[85vh] rounded-[2.5rem] overflow-hidden shadow-2xl ring-1 ring-white/20">
                    <IntegratedWerkbonOverlay 
                        meldingId={activeWerkbonId} 
                        onClose={() => setActiveWerkbonId(null)} 
                        onCompleted={(id) => {
                            setCompletedObjects(prev => [...prev, id]);
                            if (navigationState === 'navigating') {
                                // Route recalculation happens automatically via useEffect on nextObject change
                                toast({ title: "Melding afgerond", description: "Route naar volgende punt wordt berekend..." });
                            }
                        }} 
                    />
                </div>
            </div>
        )}
    </div>
  );
}
