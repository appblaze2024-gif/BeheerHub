'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, Popup, type MapRef } from 'react-map-gl';
import { useCollection, useFirestore, useUser, useMemoFirebase, updateDocumentNonBlocking, useFirebaseApp, useDoc } from '@/firebase';
import { collection, query, where, doc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Play, 
  CheckCircle2, 
  Pause, 
  MapPin, 
  Gauge, 
  Loader2,
  History,
  Navigation2,
  SignalLow,
  Navigation,
  AlertTriangle,
  Flag,
  X as XIcon,
  Home,
  LocateFixed,
  FileText,
  Filter,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Maximize,
  Minimize,
  Sparkles,
  FastForward,
  LayoutGrid,
  MessageSquare,
  Cpu,
  Trash2,
  Bell,
  CheckCircle,
  RefreshCw,
  Zap,
  Settings2,
  Eye,
  ArrowUp,
  ArrowDown,
  User,
  Search,
  Camera,
  Package,
  Mic,
  Paperclip,
  Check
} from 'lucide-react';
import { useProject } from '@/context/project-context';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Project, Route, Veegroute, Prullenbakkenroute, Object as MapObject, Melding, UploadedFile, Hoeveelheid } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import * as turf from '@turf/turf';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/firebase/profile-provider';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RouteHistoryDialog } from '@/components/route-history-dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { translateText } from '@/ai/flows/translate-text-flow';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

// Vaste coördinaten voor de Aarbergerweg 5 in Rijsenhout
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
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    'line-color': '#2563eb', // Krachtig blauw (Echte navigatielijn)
    'line-width': 10,
    'line-opacity': 1,
  },
};

const routeLayerCasing: Layer = {
  id: 'route-casing',
  type: 'line',
  source: 'route-line',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    'line-color': '#1e40af', // Diep blauwe omlijning
    'line-width': 16,
    'line-opacity': 0.2,
  },
};

const useInternalIsMobile = (width: number = 768) => {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < width);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [width]);
  return isMobile;
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
    } catch (e) {
        return 'bg-slate-400';
    }
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
    const app = useFirebaseApp();
    const { user } = useUser();
    const { profile } = useProfile();
    const { toast } = useToast();
    const isMobile = useInternalIsMobile(768);

    const [activeTab, setActiveTab] = React.useState('Werkzaamheden');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [afhandelingBijzonderheden, setAfhandelingBijzonderheden] = React.useState('');
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [sourceLang, setSourceLang] = React.useState(translationLanguages[0]);
    const [targetLang, setTargetLang] = React.useState(translationLanguages[0]);
    const [isListening, setIsListening] = React.useState(false);
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
        updateDocumentNonBlocking(doc(firestore, 'meldingen', melding.id), { 
            workStartedAt: new Date().toISOString() 
        });
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
            toast({ title: 'Werkbon afgerond', description: 'U wordt doorverwezen naar de volgende opdracht.' });
            onCompleted(melding.id);
            onClose();
        } catch (error) { 
            toast({ variant: "destructive", title: 'Fout bij afronden' }); 
        } finally { 
            setIsSubmitting(false); 
        }
    };

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast({ variant: 'destructive', title: 'Niet ondersteund', description: 'Spraakherkenning niet beschikbaar.' });
            return;
        }
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

    if (isLoading || !melding) return <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full bg-white animate-in slide-in-from-bottom duration-300">
            <header className="h-14 border-b bg-slate-50 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full"><ArrowLeft className="h-5 w-5" /></Button>
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-tight leading-none">{melding.intakenummer}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{melding.subcategorie}</p>
                    </div>
                </div>
                {melding.workStartedAt ? (
                    <Button className="bg-orange-600 hover:bg-orange-700 h-9 font-black uppercase px-6 text-xs rounded-xl shadow-lg shadow-orange-600/20" onClick={handleAfronden} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
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

function NavigatingView({ 
    objectsOnRoute, 
    onExit,
    initialUserLocation,
    isSimulating = false,
    routeType
}: { 
    objectsOnRoute: MapObject[], 
    onExit: () => void,
    initialUserLocation: { latitude: number; longitude: number; } | null,
    isSimulating?: boolean,
    routeType: 'veeg' | 'prullenbak' | 'meldingen' | null
}) {
  const mapRef = React.useRef<MapRef>(null);
  const isMobile = useInternalIsMobile(768);
  const { toast } = useToast();
  
  const [targetLocation, setTargetLocation] = React.useState<{ latitude: number, longitude: number, speed: number | null, heading: number | null } | null>(initialUserLocation ? { ...initialUserLocation, speed: 0, heading: 0 } : null);
  const [smoothLocation, setSmoothLocation] = React.useState<{ latitude: number, longitude: number, speed: number | null, heading: number | null } | null>(initialUserLocation ? { ...initialUserLocation, speed: 0, heading: 0 } : null);
  
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [currentRouteGeometry, setCurrentRouteGeometry] = React.useState<any>(null);
  const [currentLeg, setCurrentLeg] = React.useState<any>(null);
  const [isPaused, setIsPaused] = React.useState(false);
  const [arrivedObject, setArrivedObject] = React.useState<MapObject | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = React.useState(false);
  const [distanceRemainingToDestination, setDistanceRemainingToDestination] = React.useState(0);
  const [hasReachedCurrentTarget, setHasReachedCurrentTarget] = React.useState(false);
  const [isFollowing, setIsFollowing] = React.useState(true);
  const [gpsError, setGpsError] = React.useState<'permission' | 'signal' | null>(null);
  const [throttledGeometry, setThrottledGeometry] = React.useState<any>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = React.useState(false);
  
  const [activeWerkbonId, setActiveWerkbonId] = React.useState<string | null>(null);

  const smoothingAnimationRef = React.useRef<number | null>(null);
  const simAnimationRef = React.useRef<number | null>(null);
  const simStateRef = React.useRef({ distanceTravelled: 0, currentSpeedMs: 0, targetSpeedMs: 13.8, lastTimestamp: 0 });
  const totalSimDistanceRef = React.useRef(0);

  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  
  const [viewState, setViewState] = React.useState({
    pitch: 65,
    bearing: 0,
    zoom: 18.5,
    latitude: initialUserLocation?.latitude || 52.1326,
    longitude: initialUserLocation?.longitude || 5.2913,
  });

  const nextObject = React.useMemo(() => {
    const remaining = objectsOnRoute.filter(obj => !completedObjects.includes(obj.id));
    if (remaining.length === 0) return null;
    if (!targetLocation) return remaining[0];
    const currentPt = turf.point([targetLocation.longitude, targetLocation.latitude]);
    return [...remaining].sort((a, b) => {
        const distA = turf.distance(currentPt, turf.point([a.longitude, a.latitude]));
        const distB = turf.distance(currentPt, turf.point([b.longitude, b.latitude]));
        return distA - distB;
    })[0];
  }, [objectsOnRoute, completedObjects, targetLocation?.latitude, targetLocation?.longitude]);

  const currentSpeedLimit = React.useMemo(() => {
    if (!currentLeg?.annotation?.maxspeed) return 50;
    const maxspeeds = currentLeg.annotation.maxspeed;
    const totalLegDist = currentLeg.distance;
    const ratio = (totalLegDist - distanceRemainingToDestination) / (totalLegDist || 1);
    const index = Math.floor(ratio * maxspeeds.length);
    const speedVal = maxspeeds[Math.min(index, maxspeeds.length - 1)];
    let limit = 50;
    if (typeof speedVal === 'number') limit = speedVal;
    else if (typeof speedVal === 'string') limit = parseInt(speedVal) || 50;
    return limit <= 0 ? 50 : limit;
  }, [currentLeg, distanceRemainingToDestination]);

  const targetLocationRef = React.useRef(targetLocation);
  const isPausedRef = React.useRef(isPaused);
  const isFollowingRef = React.useRef(isFollowing);
  const currentSpeedLimitRef = React.useRef(currentSpeedLimit);

  React.useEffect(() => { targetLocationRef.current = targetLocation; }, [targetLocation]);
  React.useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  React.useEffect(() => { isFollowingRef.current = isFollowing; }, [isFollowing]);
  React.useEffect(() => { currentSpeedLimitRef.current = currentSpeedLimit; }, [currentSpeedLimit]);

  React.useEffect(() => {
    let lastTime = performance.now();
    const animateSmoothly = (time: number) => {
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;
        setSmoothLocation(prevSmooth => {
            const target = targetLocationRef.current;
            if (!target || !prevSmooth || isPausedRef.current) return prevSmooth;
            const lerpFactor = isSimulating ? 1 : 0.15; 
            const newLat = prevSmooth.latitude + (target.latitude - prevSmooth.latitude) * lerpFactor;
            const newLng = prevSmooth.longitude + (target.longitude - prevSmooth.longitude) * lerpFactor;
            let diff = (target.heading || 0) - (prevSmooth.heading || 0);
            while (diff < -180) diff += 360;
            while (diff > 180) diff -= 360;
            const newHeading = (prevSmooth.heading || 0) + diff * (lerpFactor * 0.5);
            if (isFollowingRef.current && !activeWerkbonId) {
                const speedKmh = (target.speed || 0) * 3.6;
                const targetZoom = Math.max(15, 18.5 - (Math.min(speedKmh, 80) / 30));
                setViewState(prev => ({ ...prev, latitude: newLat, longitude: newLng, bearing: newHeading, zoom: prev.zoom + (targetZoom - prev.zoom) * 0.05 }));
            }
            return { latitude: newLat, longitude: newLng, speed: target.speed, heading: newHeading };
        });
        smoothingAnimationRef.current = requestAnimationFrame(animateSmoothly);
    };
    smoothingAnimationRef.current = requestAnimationFrame(animateSmoothly);
    return () => { if (smoothingAnimationRef.current) cancelAnimationFrame(smoothingAnimationRef.current); };
  }, [isSimulating, activeWerkbonId]);

  React.useEffect(() => {
    if (isSimulating) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        setTargetLocation(prev => ({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, speed: pos.coords.speed || 0, heading: pos.coords.heading !== null ? pos.coords.heading : (prev?.heading || 0) }));
      },
      (err) => { if (err.code === 1) setGpsError('permission'); else setGpsError('signal'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSimulating]);

  React.useEffect(() => {
    if (!isSimulating || !currentRouteGeometry || !nextObject || activeWerkbonId) return;
    const coords = currentRouteGeometry.coordinates;
    const line = turf.lineString(coords);
    const totalDistance = turf.length(line, { units: 'meters' });
    totalSimDistanceRef.current = totalDistance;
    const runSimulation = (timestamp: number) => {
        if (isPausedRef.current || activeWerkbonId || !currentRouteGeometry) {
            simStateRef.current.lastTimestamp = timestamp;
            simAnimationRef.current = requestAnimationFrame(runSimulation);
            return;
        }
        if (!simStateRef.current.lastTimestamp) simStateRef.current.lastTimestamp = timestamp;
        const deltaTime = Math.min((timestamp - simStateRef.current.lastTimestamp) / 1000, 0.1);
        simStateRef.current.lastTimestamp = timestamp;
        const distLeft = totalDistance - simStateRef.current.distanceTravelled;
        const currentLimitMs = currentSpeedLimitRef.current / 3.6;
        simStateRef.current.targetSpeedMs = distLeft < 40 ? 3 : currentLimitMs - 0.5; 
        const accel = simStateRef.current.targetSpeedMs > simStateRef.current.currentSpeedMs ? 4 : 8;
        simStateRef.current.currentSpeedMs += (simStateRef.current.targetSpeedMs - simStateRef.current.currentSpeedMs) * deltaTime * accel;
        simStateRef.current.distanceTravelled += simStateRef.current.currentSpeedMs * deltaTime;
        if (simStateRef.current.distanceTravelled >= totalDistance - 0.2) {
            const final = coords[coords.length - 1];
            setTargetLocation({ latitude: final[1], longitude: final[0], speed: 0, heading: 0 });
            return;
        } 
        try {
            const currentPoint = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
            const lookAheadPoint = turf.along(line, Math.min(simStateRef.current.distanceTravelled + 5, totalDistance), { units: 'meters' });
            const [lng, lat] = currentPoint.geometry.coordinates;
            const heading = (turf.bearing(currentPoint, lookAheadPoint) + 360) % 360;
            setTargetLocation({ latitude: lat, longitude: lng, speed: simStateRef.current.currentSpeedMs, heading: heading });
        } catch (e) {}
        simAnimationRef.current = requestAnimationFrame(runSimulation);
    };
    simAnimationRef.current = requestAnimationFrame(runSimulation);
    return () => { if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current); };
  }, [isSimulating, currentRouteGeometry, nextObject?.id, activeWerkbonId]);

  React.useEffect(() => {
    if (!targetLocation || !nextObject || isCalculatingRoute) return;
    const fetchRoute = async () => {
      setIsCalculatingRoute(true);
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${targetLocation.longitude},${targetLocation.latitude};${nextObject.longitude},${nextObject.latitude}?steps=true&geometries=geojson&overview=full&annotations=maxspeed&access_token=${MAPBOX_TOKEN}&language=nl`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          setCurrentRouteGeometry(route.geometry);
          setCurrentLeg(route.legs[0]);
          setDistanceRemainingToDestination(Math.round(route.legs[0].distance));
          setHasReachedCurrentTarget(route.legs[0].distance < 150);
        }
      } catch (error) {} finally { setIsCalculatingRoute(false); }
    };
    fetchRoute();
  }, [nextObject?.id, isSimulating]);

  const speedKmh = targetLocation?.speed ? Math.round(targetLocation.speed * 3.6) : 0;
  const isSpeeding = speedKmh > currentSpeedLimit;
  const arrivalTime = React.useMemo(() => {
    if (!currentLeg?.duration) return formatDate(new Date(), 'HH:mm');
    const dur = (distanceRemainingToDestination / (currentLeg.distance || 1)) * currentLeg.duration;
    return formatDate(addSeconds(new Date(), dur), 'HH:mm');
  }, [currentLeg, distanceRemainingToDestination]);

  return (
    <div className="w-full h-full relative bg-slate-100 overflow-hidden">
      <MapGL ref={mapRef} {...viewState} onMove={evt => { setViewState(evt.viewState); if (isFollowing) setIsFollowing(false); }} style={{ width: '100%', height: '100%' }} mapStyle={mapStyle} mapboxAccessToken={MAPBOX_TOKEN}>
        {smoothLocation && (
          <Marker longitude={smoothLocation.longitude} latitude={smoothLocation.latitude} anchor="center" rotationAlignment="map" pitchAlignment="map" rotation={smoothLocation.heading || 0}>
            <div className="relative flex items-center justify-center w-12 h-12">
                <div className="absolute h-12 w-12 bg-blue-50/20 rounded-full animate-pulse" />
                <svg viewBox="0 0 100 100" className="h-10 w-10 text-primary drop-shadow-2xl"><path d="M50 5 L90 95 L50 75 L10 95 Z" fill="currentColor" stroke="white" strokeWidth="4" /></svg>
            </div>
          </Marker>
        )}
        {objectsOnRoute.map((obj) => {
            if (completedObjects.includes(obj.id)) return null;
            const isTarget = nextObject?.id === obj.id;
            const inRange = isTarget && hasReachedCurrentTarget;
            return (
                <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center" onClick={(e) => { e.originalEvent.stopPropagation(); setActiveWerkbonId(obj.id); }}>
                    <div className="relative flex flex-col items-center">
                        <div className={cn("absolute h-12 w-12 rounded-full bg-blue-500/20", inRange && "animate-pulse")} />
                        <div className={cn("relative h-10 w-10 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-all bg-slate-400", isTarget && "scale-125 ring-4 ring-slate-900/20")}>
                            <Bell className="h-5 w-5 text-slate-600 stroke-[2.5]" />
                        </div>
                    </div>
                </Marker>
            );
        })}
        {currentRouteGeometry && (
          <Source id="route-line" type="geojson" data={currentRouteGeometry}>
            <Layer {...routeLayerCasing} /><Layer {...routeLayer} />
          </Source>
        )}
      </MapGL>
      
      {/* UI Elements during navigation */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[70] w-[92%] max-w-lg">
        {!activeWerkbonId && (
            <Card className="bg-white text-black shadow-xl border-none rounded-full py-1">
                <CardContent className="p-3 flex items-center justify-between gap-4">
                    <Badge className="bg-primary text-white font-black text-xs h-6 px-3">{completedObjects.length}/{objectsOnRoute.length}</Badge>
                    <div className="flex-1"><Progress value={(completedObjects.length / objectsOnRoute.length) * 100} className="h-1.5" /></div>
                </CardContent>
            </Card>
        )}
      </div>

      <div className="absolute right-4 top-20 z-[70] flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-white border-[6px] border-red-600 flex items-center justify-center shadow-xl font-black">{currentSpeedLimit}</div>
          <div className={cn("h-14 w-14 rounded-full backdrop-blur shadow-2xl border-4 flex flex-col items-center justify-center", isSpeeding ? "bg-red-50 border-red-200" : "bg-white border-slate-100")}>
              <span className={cn("text-xl font-black", isSpeeding ? "text-red-600" : "text-slate-900")}>{speedKmh}</span>
              <span className="text-[6px] font-black uppercase text-slate-400">km/h</span>
          </div>
      </div>

      {activeWerkbonId && (
          <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm p-4 flex items-end sm:items-center justify-center">
              <div className="w-full max-w-4xl h-[85vh] rounded-[2rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
                  <IntegratedWerkbonOverlay 
                    meldingId={activeWerkbonId} 
                    onClose={() => setActiveWerkbonId(null)} 
                    onCompleted={(id) => {
                        setCompletedObjects(prev => [...prev, id]);
                        if (isSimulating) {
                            simStateRef.current.distanceTravelled = 0;
                            simStateRef.current.currentSpeedMs = 0;
                        }
                    }}
                  />
              </div>
          </div>
      )}

      {hasReachedCurrentTarget && !activeWerkbonId && (
          <div className="absolute inset-0 z-[90] flex items-center justify-center pointer-events-none p-4">
              <div className="bg-white p-8 rounded-[2rem] shadow-2xl border-none pointer-events-auto flex flex-col items-center gap-4 animate-in zoom-in">
                  <div className="bg-blue-100 p-4 rounded-2xl"><MapPin className="h-10 w-10 text-blue-600" /></div>
                  <h3 className="text-xl font-black uppercase">Aankomst!</h3>
                  <Button onClick={() => nextObject && setActiveWerkbonId(nextObject.id)} className="h-14 px-12 bg-primary font-black uppercase rounded-2xl shadow-xl">WERKBON OPENEN</Button>
              </div>
          </div>
      )}

      <div className="absolute bottom-6 left-0 right-0 z-[80] flex flex-col items-center px-6">
        <Card className="w-full max-w-lg bg-white shadow-2xl border-none rounded-[32px] p-4">
            <div className="flex items-center justify-between px-4">
                <div className="flex flex-col items-center"><p className="text-2xl font-black">{arrivalTime}</p><p className="text-[10px] font-black text-slate-400 uppercase">aankomst</p></div>
                <div className="flex flex-col items-center"><p className="text-2xl font-black">{(distanceRemainingToDestination/1000).toFixed(1)}</p><p className="text-[10px] font-black text-slate-400 uppercase">km</p></div>
                <Button variant="destructive" className="h-12 px-8 rounded-2xl font-black uppercase" onClick={onExit}>STOP RIT</Button>
            </div>
        </Card>
      </div>
    </div>
  );
}

export default function StartNavigationPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedProjectId } = useProject();
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
  const [showAssignmentInfo, setShowAssignmentInfo] = React.useState(false);
  const [isLocating, setIsLocating] = React.useState(false);
  const [activeWerkbonId, setActiveWerkbonId] = React.useState<string | null>(null);

  const mapRef = React.useRef<MapRef>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
        (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        null, { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const routeType = 'meldingen';
  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'meldingen'), where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw']));
  }, [firestore]);

  const { data: rawMeldingen, isLoading } = useCollection<Melding>(meldingenQuery);

  const sortedMeldingen = React.useMemo(() => {
    if (!rawMeldingen) return [];
    let pool = [...rawMeldingen];
    if (!isPrivileged) {
        const userName = profile?.displayName || profile?.email || 'Onbekend';
        pool = pool.filter(m => m.behandelaar === userName);
    }
    if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase();
        pool = pool.filter(m => m.intakenummer.toLowerCase().includes(q) || (m.straatnaam || '').toLowerCase().includes(q));
    }
    const baseLoc = userLocation || SIMULATION_START_LOCATION;
    let currentPos = [baseLoc.longitude, baseLoc.latitude];
    const result: Melding[] = [];
    let tempPool = [...pool];
    while (tempPool.length > 0) {
        const next = tempPool.reduce((prev, curr) => {
            const distPrev = turf.distance(turf.point(currentPos), turf.point([prev.longitude, prev.latitude]));
            const distCurr = turf.distance(turf.point(currentPos), turf.point([curr.longitude, curr.latitude]));
            return distCurr < distPrev ? curr : prev;
        });
        result.push(next);
        currentPos = [next.longitude, next.latitude];
        tempPool = tempPool.filter(m => m.id !== next.id);
    }
    return result;
  }, [rawMeldingen, isPrivileged, profile, userLocation, debouncedSearchQuery]);

  const handleStartRit = (simulate = false) => {
    if (sortedMeldingen.length === 0) { toast({ title: "Geen taken", description: "Er zijn geen openstaande meldingen voor u." }); return; }
    setIsSimulationMode(simulate);
    setObjectsOnRoute(sortedMeldingen.map(m => ({ id: m.id, latitude: m.latitude, longitude: m.longitude, name: m.intakenummer, datum: m.datum } as MapObject)));
    setNavigationState('navigating');
    setIsHeaderVisible(false);
  };

  const handleLocateUser = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const newLoc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setUserLocation(newLoc);
            if (mapRef.current) mapRef.current.getMap().flyTo({ center: [newLoc.longitude, newLoc.latitude], zoom: 14 });
            setIsLocating(false);
        },
        () => setIsLocating(false),
        { enableHighAccuracy: true }
    );
  };

  if (isLoading) return <LoadingScreen />;

  if (navigationState === 'navigating') {
    return <NavigatingView objectsOnRoute={objectsOnRoute} onExit={() => { setNavigationState('setup'); setIsHeaderVisible(true); }} initialUserLocation={userLocation || SIMULATION_START_LOCATION} isSimulating={isSimulationMode} routeType="meldingen" />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="relative h-[50%] lg:h-[60%] overflow-hidden shrink-0">
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border-none text-slate-900" onClick={() => router.push('/')}><ArrowLeft className="h-4 w-4" /></Button>
            </div>
            <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border-none text-primary" onClick={handleLocateUser} disabled={isLocating}>{isLocating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}</Button>
                {isPrivileged && <Button variant="outline" className="h-9 px-4 font-black uppercase tracking-widest border-none text-slate-900 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl" onClick={() => handleStartRit(true)}><Gauge className="mr-2 h-4 w-4" /> SIMULATOR</Button>}
                <Button className="h-9 px-6 font-black uppercase tracking-widest bg-orange-600 text-white hover:bg-orange-700 shadow-2xl rounded-2xl" onClick={() => handleStartRit(false)}><Navigation className="mr-2 h-4 w-4 fill-current" /> START RIT</Button>
            </div>
            <MapGL ref={mapRef} initialViewState={{ longitude: userLocation?.longitude || 5.2913, latitude: userLocation?.latitude || 52.1326, zoom: userLocation ? 14 : 7 }} style={{ width: '100%', height: '100%' }} mapStyle={mapStyle} mapboxAccessToken={MAPBOX_TOKEN}>
                {sortedMeldingen?.map((m) => (
                    <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center">
                        <div className={cn("w-7 h-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center font-black text-[10px]", getMeldingAgeColor(m.datum))}>
                            <Bell className="h-3 w-3 text-slate-600" />
                        </div>
                    </Marker>
                ))}
            </MapGL>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col bg-white border-t-4 border-slate-900">
            <div className="p-3 bg-slate-50 border-b flex items-center justify-between shrink-0 gap-4">
                <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" /><Input placeholder="Zoek bon of adres..." className="h-8 pl-8 text-[10px] font-bold rounded-xl border-slate-200" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
                {isPrivileged && (
                    <Button variant={showAssignmentInfo ? "default" : "outline"} size="sm" className="h-8 text-[9px] font-black uppercase gap-2 rounded-xl" onClick={() => setShowAssignmentInfo(!showAssignmentInfo)}><User className="h-3 w-3" /> TOEGEWEZEN</Button>
                )}
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar">
                <Table className="min-w-[1200px]">
                    <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                        <TableRow className="h-10 hover:bg-transparent">
                            <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r px-3 w-32 sticky left-0 bg-slate-100 z-20">Intakenr.</TableHead>
                            <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r px-3 w-48">Adres</TableHead>
                            <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r px-3">Omschrijving</TableHead>
                            <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r px-3 w-32">Hoofdtype</TableHead>
                            <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r px-3 w-40">Subtype</TableHead>
                            <TableHead className="font-black uppercase text-[9px] text-slate-500 border-r px-3 w-32">Werkgebied</TableHead>
                            <TableHead className="font-black uppercase text-[9px] text-slate-500 px-3 w-20 sticky right-0 bg-slate-100 z-20 border-l">Afstand</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedMeldingen.map((m) => {
                            const base = userLocation || SIMULATION_START_LOCATION;
                            const dist = turf.distance(turf.point([base.longitude, base.latitude]), turf.point([m.longitude, m.latitude])).toFixed(1);
                            return (
                                <TableRow key={m.id} className="h-14 hover:bg-blue-50 transition-colors border-b border-slate-100 cursor-pointer" onClick={() => setActiveWerkbonId(m.id)}>
                                    <TableCell className="font-black text-[10px] border-r px-3 sticky left-0 bg-white group-hover:bg-blue-50 z-10">
                                        <div className="flex items-center gap-2"><div className={cn("h-5 w-5 rounded-md flex items-center justify-center shrink-0 opacity-80", getMeldingAgeColor(m.datum))}><Bell className="h-3 w-3 text-slate-600" /></div>{m.intakenummer}</div>
                                    </TableCell>
                                    <TableCell className="text-[10px] font-bold border-r px-3"><div className="flex flex-col truncate w-40"><span>{m.straatnaam} {m.huisnummer}</span><span className="text-[7px] font-black text-slate-400 uppercase leading-none">{m.plaats}</span></div></TableCell>
                                    <TableCell className="text-[10px] font-medium border-r px-3 text-slate-600 italic truncate max-w-[200px]">"{m.extra_informatie || 'Geen omschrijving'}"</TableCell>
                                    <TableCell className="text-[9px] font-black border-r text-slate-500 uppercase px-3 truncate">{m.hoofdcategorie}</TableCell>
                                    <TableCell className="text-[9px] font-black border-r text-slate-900 uppercase px-3 truncate">{m.subcategorie}</TableCell>
                                    <TableCell className="text-[9px] font-black border-r px-3"><Badge variant="outline" className="h-6 px-2.5 text-[10px] font-black uppercase bg-blue-50 border-blue-200 text-blue-700 shadow-sm flex items-center gap-1.5 w-fit"><LayoutGrid className="h-3 w-3 text-blue-400" />{m.werkgebied || m.wijk || '-'}</Badge></TableCell>
                                    <TableCell className="px-3 py-1 font-black text-[10px] sticky right-0 bg-white group-hover:bg-blue-50 z-10 border-l tabular-nums">{dist} km</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>

        {/* Integrated Werkbon for setup mode (e.g. clicking from list before starting rit) */}
        {activeWerkbonId && (
            <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-4xl h-[85vh] rounded-[2rem] overflow-hidden shadow-2xl">
                    <IntegratedWerkbonOverlay 
                        meldingId={activeWerkbonId} 
                        onClose={() => setActiveWerkbonId(null)} 
                        onCompleted={() => {}} 
                    />
                </div>
            </div>
        )}
    </div>
  );
}
