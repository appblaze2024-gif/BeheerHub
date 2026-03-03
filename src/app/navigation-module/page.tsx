'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, Popup, type MapRef } from 'react-map-gl';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, getDocs, writeBatch } from 'firebase/firestore';
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
  User
} from 'lucide-react';
import { useProject } from '@/context/project-context';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Project, Route, Veegroute, Prullenbakkenroute, Object as MapObject, Melding } from '@/lib/types';
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

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

// Vaste coördinaten voor de Aarbergerweg 5 in Rijsenhout
const SIMULATION_START_LOCATION = { latitude: 52.2644, longitude: 4.7242 };

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

// Helper om kleur op basis van ouderdom te bepalen
const getMeldingAgeColor = (datum?: string) => {
    if (!datum) return 'bg-slate-400';
    try {
        const d = new Date(datum);
        const diffDays = Math.abs(differenceInCalendarDays(new Date(), d));
        
        if (diffDays <= 1) return 'bg-slate-400'; // 1 dag: grijs
        if (diffDays === 2) return 'bg-yellow-400'; // 2 dagen: geel
        if (diffDays === 3) return 'bg-orange-500'; // 3 dagen: oranje
        return 'bg-red-600'; // 4+ dagen: rood
    } catch (e) {
        return 'bg-slate-400';
    }
};

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
  const router = useRouter();
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
  const touchStartY = React.useRef<number | null>(null);

  const lastUpdateDistRef = React.useRef(0);
  const lastDistanceCalcTimeRef = React.useRef(0);
  const lastGeometryUpdateTimeRef = React.useRef(0);

  const handleTouchStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (touchStartY.current === null) return;
    let clientY: number;
    if ('changedTouches' in e) {
      clientY = e.changedTouches[0].clientY;
    } else {
      clientY = (e as React.MouseEvent).clientY;
    }
    const deltaY = touchStartY.current - clientY;

    if (deltaY > 50) { 
      setIsDrawerExpanded(true);
    } else if (deltaY < -50) { 
      setIsDrawerExpanded(false);
    }
    touchStartY.current = null;
  };

  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  
  const [viewState, setViewState] = React.useState({
    pitch: 65,
    bearing: 0,
    zoom: 18.5,
    latitude: initialUserLocation?.latitude || 52.1326,
    longitude: initialUserLocation?.longitude || 5.2913,
  });

  const smoothingAnimationRef = React.useRef<number | null>(null);
  const simAnimationRef = React.useRef<number | null>(null);
  
  const simStateRef = React.useRef({
    distanceTravelled: 0,
    currentSpeedMs: 0,
    targetSpeedMs: 13.8,
    lastTimestamp: 0
  });

  const totalSimDistanceRef = React.useRef(0);

  // Find next target dynamically based on proximity
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
    else if (typeof speedVal === 'string') {
        const parsed = parseInt(speedVal);
        limit = isNaN(parsed) ? 50 : parsed;
    } else if (speedVal?.speed) {
        limit = parseInt(speedVal.speed) || 50;
    }
    return limit <= 0 ? 50 : limit;
  }, [currentLeg, distanceRemainingToDestination]);

  const targetLocationRef = React.useRef(targetLocation);
  const isPausedRef = React.useRef(isPaused);
  const arrivedObjectRef = React.useRef(arrivedObject);
  const isCalculatingRouteRef = React.useRef(isCalculatingRoute);
  const isFollowingRef = React.useRef(isFollowing);
  const currentSpeedLimitRef = React.useRef(currentSpeedLimit);

  React.useEffect(() => { targetLocationRef.current = targetLocation; }, [targetLocation]);
  React.useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  React.useEffect(() => { arrivedObjectRef.current = arrivedObject; }, [arrivedObject]);
  React.useEffect(() => { isCalculatingRouteRef.current = isCalculatingRoute; }, [isCalculatingRoute]);
  React.useEffect(() => { isFollowingRef.current = isFollowing; }, [isFollowing]);
  React.useEffect(() => { currentSpeedLimitRef.current = currentSpeedLimit; }, [currentSpeedLimit]);

  React.useEffect(() => {
    let lastTime = performance.now();
    let lastCameraUpdateLat = 0;
    let lastCameraUpdateLng = 0;

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
            
            const newSmooth = { latitude: newLat, longitude: newLng, speed: target.speed, heading: newHeading };
            
            if (isFollowingRef.current && !arrivedObjectRef.current) {
                const cameraThreshold = 0.000005;
                if (Math.abs(newLat - lastCameraUpdateLat) > cameraThreshold || Math.abs(newLng - lastCameraUpdateLng) > cameraThreshold) {
                    lastCameraUpdateLat = newLat; 
                    lastCameraUpdateLng = newLng;
                    
                    const currentSpeedKmh = (target.speed || 0) * 3.6;
                    const targetZoom = Math.max(15, 18.5 - (Math.min(currentSpeedKmh, 80) / 30));
                    
                    setViewState(prev => ({
                        ...prev,
                        latitude: newLat,
                        longitude: newLng,
                        bearing: newHeading,
                        zoom: prev.zoom + (targetZoom - prev.zoom) * 0.05,
                    }));
                }
            }
            
            return newSmooth;
        });
        smoothingAnimationRef.current = requestAnimationFrame(animateSmoothly);
    };
    
    smoothingAnimationRef.current = requestAnimationFrame(animateSmoothly);
    return () => { if (smoothingAnimationRef.current) cancelAnimationFrame(smoothingAnimationRef.current); };
  }, [isSimulating]);

  const snappedLocation = React.useMemo(() => {
    if (!smoothLocation || !currentRouteGeometry) return smoothLocation;
    try {
        const coords = currentRouteGeometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return smoothLocation;
        const line = turf.lineString(coords);
        const pt = turf.point([smoothLocation.longitude, smoothLocation.latitude]);
        const snapped = turf.nearestPointOnLine(line, pt, { units: 'meters' });
        if (snapped.properties.dist! < 35) {
            return { ...smoothLocation, latitude: snapped.geometry.coordinates[1], longitude: snapped.geometry.coordinates[0] };
        }
    } catch (e) {}
    return smoothLocation;
  }, [smoothLocation, currentRouteGeometry]);

  React.useEffect(() => {
    if (!currentRouteGeometry || !snappedLocation || isCalculatingRoute) return;
    
    const now = Date.now();
    if (now - lastDistanceCalcTimeRef.current < 200) return; 
    lastDistanceCalcTimeRef.current = now;

    try {
      const coords = currentRouteGeometry.coordinates;
      const line = turf.lineString(coords);
      const pt = turf.point([snappedLocation.longitude, snappedLocation.latitude]);
      const endPt = turf.point(coords[coords.length - 1]);
      const sliced = turf.lineSlice(pt, endPt, line);
      const remaining = turf.length(sliced, { units: 'meters' });
      const roundedRemaining = Math.round(remaining);
      
      if (Math.abs(lastUpdateDistRef.current - roundedRemaining) >= 1) {
          setDistanceRemainingToDestination(roundedRemaining);
          lastUpdateDistRef.current = roundedRemaining;
          setHasReachedCurrentTarget(remaining < 150);
      }
    } catch (e) {}
  }, [snappedLocation?.latitude, snappedLocation?.longitude, currentRouteGeometry, isCalculatingRoute]);

  React.useEffect(() => {
    if (!currentRouteGeometry || !snappedLocation) { 
      setThrottledGeometry(null); 
      return; 
    }
    
    const now = Date.now();
    if (now - lastGeometryUpdateTimeRef.current < 250) return; 
    lastGeometryUpdateTimeRef.current = now;
    
    try {
      const coords = currentRouteGeometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      
      const line = turf.lineString(coords);
      const pt = turf.point([snappedLocation.longitude, snappedLocation.latitude]);
      
      const snapped = turf.nearestPointOnLine(line, pt);
      const distanceTravelledAlong = snapped.properties.location || 0; 
      
      const totalDist = turf.length(line, { units: 'kilometers' });
      const sliced = turf.lineSliceAlong(line, distanceTravelledAlong, totalDist, { units: 'kilometers' });
      
      setThrottledGeometry({
        type: 'Feature',
        properties: {},
        geometry: sliced.geometry
      });
    } catch (e) {
      setThrottledGeometry({
        type: 'Feature',
        properties: {},
        geometry: currentRouteGeometry
      });
    }
  }, [currentRouteGeometry, snappedLocation?.longitude, snappedLocation?.latitude]);

  React.useEffect(() => {
    if (isSimulating) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGpsError(null);
        const { latitude, longitude, speed, heading } = position.coords;
        const speedMs = speed || 0;
        setTargetLocation(prev => ({ latitude, longitude, speed: speedMs, heading: heading !== null ? (heading || 0) : (prev?.heading || 0) }));
      },
      (error) => { if (error.code === 1) setGpsError('permission'); else setGpsError('signal'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSimulating]);

  const lastFetchedTargetId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isSimulating || !currentRouteGeometry || !nextObject || arrivedObjectRef.current || isCalculatingRouteRef.current) return;
    const coords = currentRouteGeometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    let line: any; try { line = turf.lineString(coords); } catch (e) { return; }
    const totalDistance = turf.length(line, { units: 'meters' });
    totalSimDistanceRef.current = totalDistance;
    if (totalDistance <= 0) return;
    
    simStateRef.current.distanceTravelled = 0;
    simStateRef.current.currentSpeedMs = 0;
    simStateRef.current.lastTimestamp = 0;

    const runSimulation = (timestamp: number) => {
        if (isPausedRef.current || arrivedObjectRef.current || isCalculatingRouteRef.current || !currentRouteGeometry) {
            simStateRef.current.lastTimestamp = timestamp;
            simAnimationRef.current = requestAnimationFrame(runSimulation);
            return;
        }
        if (!simStateRef.current.lastTimestamp) simStateRef.current.lastTimestamp = timestamp;
        const deltaTime = Math.min((timestamp - simStateRef.current.lastTimestamp) / 1000, 0.1);
        simStateRef.current.lastTimestamp = timestamp;
        
        const distanceToDestination = totalDistance - simStateRef.current.distanceTravelled;
        const currentLimitMs = currentSpeedLimitRef.current / 3.6;
        simStateRef.current.targetSpeedMs = distanceToDestination < 40 ? 3 : currentLimitMs - 0.5; 
        const accel = simStateRef.current.targetSpeedMs > simStateRef.current.currentSpeedMs ? 4 : 8;
        simStateRef.current.currentSpeedMs += (simStateRef.current.targetSpeedMs - simStateRef.current.currentSpeedMs) * deltaTime * accel;
        simStateRef.current.distanceTravelled += simStateRef.current.currentSpeedMs * deltaTime;
        
        if (simStateRef.current.distanceTravelled >= totalDistance - 0.2) {
            const finalCoord = coords[coords.length - 1];
            setTargetLocation(prev => ({ latitude: finalCoord[1], longitude: finalCoord[0], speed: 0, heading: 0 }));
            return;
        } 
        try {
            const currentPoint = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
            const lookAheadPoint = turf.along(line, Math.min(simStateRef.current.distanceTravelled + 5, totalDistance), { units: 'meters' });
            const [lng, lat] = currentPoint.geometry.coordinates;
            const heading = (turf.bearing(currentPoint, lookAheadPoint) + 360) % 360;
            
            setTargetLocation(prev => {
                const d = prev ? turf.distance(turf.point([prev.longitude, prev.latitude]), currentPoint, { units: 'meters' }) : 1;
                return d > 0.1 ? { latitude: lat, longitude: lng, speed: simStateRef.current.currentSpeedMs, heading: heading } : prev;
            });
        } catch (e) {}
        simAnimationRef.current = requestAnimationFrame(runSimulation);
    };
    runSimulation(performance.now());
    return () => { if (simAnimationRef.current) cancelAnimationFrame(runSimulation); };
  }, [isSimulating, currentRouteGeometry, nextObject?.id]);

  React.useEffect(() => {
    if (!targetLocation || !nextObject || arrivedObject || isCalculatingRoute) return;
    if (lastFetchedTargetId.current === nextObject.id && currentRouteGeometry) return;
    
    const fetchRoute = async () => {
      setIsCalculatingRoute(true); lastFetchedTargetId.current = nextObject.id;
      const { longitude, latitude } = targetLocation;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${longitude},${latitude};${nextObject.longitude},${nextObject.latitude}?steps=true&geometries=geojson&overview=full&annotations=maxspeed&access_token=${MAPBOX_TOKEN}&language=nl`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          setCurrentRouteGeometry(route.geometry);
          setCurrentLeg(route.legs[0]);
          const remaining = Math.round(route.legs[0].distance);
          setDistanceRemainingToDestination(remaining);
          lastUpdateDistRef.current = remaining;
          setHasReachedCurrentTarget(remaining < 150);
        }
      } catch (error) { console.error("Failed to fetch route:", error); } finally { setIsCalculatingRoute(false); }
    };
    fetchRoute();
  }, [nextObject?.id, arrivedObject, isSimulating, isCalculatingRoute, currentRouteGeometry === null]);
  
  const handleJumpToArrival = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (simStateRef.current && totalSimDistanceRef.current > 0) {
        simStateRef.current.distanceTravelled = Math.max(0, totalSimDistanceRef.current - 40);
        simStateRef.current.currentSpeedMs = 8; 
        toast({ title: "Simulatie versneld", description: "Bestemming wordt naderd..." });
    }
  };

  const speedKmh = targetLocation?.speed ? Math.round(targetLocation.speed * 3.6) : 0;
  const isSpeeding = speedKmh > currentSpeedLimit;
  const arrivalTime = React.useMemo(() => {
    if (!currentLeg?.duration) return formatDate(new Date(), 'HH:mm');
    const durationSeconds = (distanceRemainingToDestination / (currentLeg.distance || 1)) * currentLeg.duration;
    return formatDate(addSeconds(new Date(), durationSeconds), 'HH:mm');
  }, [currentLeg, distanceRemainingToDestination]);
  const durationMinLabel = React.useMemo(() => {
    if (!currentLeg?.duration) return '0';
    const durationSeconds = (distanceRemainingToDestination / (currentLeg.distance || 1)) * currentLeg.duration;
    return Math.round(durationSeconds / 60);
  }, [currentLeg, distanceRemainingToDestination]);
  const distanceKm = React.useMemo(() => (distanceRemainingToDestination / 1000).toFixed(1), [distanceRemainingToDestination]);

  const isRouteFinished = React.useMemo(() => {
    return completedObjects.length === objectsOnRoute.length && objectsOnRoute.length > 0 && !arrivedObject && !isCalculatingRoute;
  }, [completedObjects, objectsOnRoute, arrivedObject, isCalculatingRoute]);

  if (isRouteFinished) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-background p-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h1 className="text-3xl font-black tracking-tight uppercase">Alle taken gereed!</h1>
            <p className="text-muted-foreground font-medium">U heeft alle meldingen in dit gebied bezocht.</p>
            <Button onClick={onExit} size="lg" className="px-10 h-14 text-lg font-bold uppercase tracking-tighter mt-4 bg-primary text-white">Terug naar Overzicht</Button>
        </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-slate-100 overflow-hidden">
      {isCalculatingRoute && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-sm pointer-events-none">
          <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">Route berekenen...</p>
          </div>
        </div>
      )}

      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={evt => { setViewState(evt.viewState); if (isFollowing) setIsFollowing(false); }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {snappedLocation && (
          <Marker longitude={snappedLocation.longitude} latitude={snappedLocation.latitude} anchor="center" rotationAlignment="map" pitchAlignment="map" rotation={snappedLocation.heading || 0}>
            <div className="relative flex items-center justify-center w-12 h-12">
                <div className="absolute h-12 w-12 bg-blue-50/20 rounded-full animate-pulse" />
                <svg viewBox="0 0 100 100" className="h-10 w-10 text-primary drop-shadow-2xl" style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,0.3))' }}>
                    <path d="M50 5 L90 95 L50 75 L10 95 Z" fill="currentColor" stroke="white" strokeWidth="4" />
                </svg>
            </div>
          </Marker>
        )}
        {objectsOnRoute.map((obj) => {
            if (completedObjects.includes(obj.id)) return null;
            const isTarget = nextObject?.id === obj.id;
            const inRange = isTarget && hasReachedCurrentTarget;
            const isMelding = routeType === 'meldingen';
            const Icon = isMelding ? Bell : Trash2;
            const colorClass = getMeldingAgeColor((obj as any).datum);

            return (
                <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center" onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    if (routeType === 'meldingen' || (targetLocation && turf.distance(turf.point([targetLocation.longitude, targetLocation.latitude]), turf.point([obj.longitude, obj.latitude]), { units: 'meters' }) < 150)) {
                        setArrivedObject(obj);
                    } else if (targetLocation) {
                        toast({ title: "Te ver weg", description: "U bent nog niet dichtbij genoeg.", variant: "destructive" });
                    }
                }}>
                    <div className="relative flex flex-col items-center">
                        <div className={cn("absolute h-12 w-12 rounded-full bg-blue-500/20", inRange && "animate-pulse")} />
                        <div className={cn(
                            "relative h-10 w-10 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-all", 
                            isTarget ? "scale-125 ring-4 ring-slate-900/20" : "bg-slate-400", 
                            colorClass,
                            inRange && "scale-125 ring-4 ring-green-500/30"
                        )}>
                            <Icon className="h-5 w-5 text-slate-600 stroke-[2.5]" />
                        </div>
                    </div>
                </Marker>
            );
        })}
        {throttledGeometry && (
          <Source id="route-line" type="geojson" data={throttledGeometry}>
            <Layer {...routeLayerCasing} /><Layer {...routeLayer} />
          </Source>
        )}
      </MapGL>
      
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[70] w-[92%] max-w-lg flex flex-col gap-3">
        {objectsOnRoute.length > 0 && !arrivedObject && (
            <Card className="bg-white text-black shadow-xl border-none overflow-hidden animate-in slide-in-from-top duration-500 rounded-full py-1">
                <CardContent className="p-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Badge className="bg-primary text-white font-black text-xs h-6 px-3">{completedObjects.length}/{objectsOnRoute.length}</Badge>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gereed</span>
                    </div>
                    <div className="flex-1 max-w-[1200px]">
                        <Progress value={(completedObjects.length / objectsOnRoute.length) * 100} className="h-1.5" />
                    </div>
                </CardContent>
            </Card>
        )}

        {gpsError && (
            <Alert variant="destructive" className="bg-red-600 text-white border-none shadow-2xl animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-3">{gpsError === 'permission' ? <XIcon className="h-5 w-5" /> : <SignalLow className="h-5 w-5 animate-pulse" />}
                    <div><AlertTitle className="font-black uppercase tracking-tight text-[10px] md:text-xs">GPS Signaal</AlertTitle><AlertDescription className="text-[9px] md:text-[10px] opacity-90 font-bold">Uw locatie wordt gezocht...</AlertDescription></div>
                </div>
            </Alert>
        )}
      </div>

      <div className="absolute right-4 top-20 z-[70] transition-all duration-300 flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-white border-[6px] border-red-600 flex items-center justify-center shadow-xl"><span className="text-xl font-black text-slate-900 tabular-nums">{currentSpeedLimit}</span></div>
          <div className={cn("h-14 w-14 rounded-full backdrop-blur shadow-2xl border-4 flex flex-col items-center justify-center overflow-hidden transition-colors duration-500", isSpeeding ? "bg-red-50/95 border-red-200" : "bg-white/95 border-slate-100")}>
              <div className="flex flex-col items-center leading-none z-10"><span className={cn("text-xl font-black tabular-nums transition-colors", isSpeeding ? "text-red-600" : "text-slate-900")}>{speedKmh}</span><span className={cn("text-[6px] font-black uppercase mt-0.5 tracking-widest", isSpeeding ? "text-red-400" : "text-slate-400")}>km/h</span></div>
          </div>
      </div>

      {arrivedObject && (
          <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <Card className="w-full max-w-[380px] shadow-2xl animate-in zoom-in-95 duration-200 rounded-[2rem] overflow-hidden border-none">
                  <CardHeader className="text-center pb-2 p-6">
                      <div className="mx-auto bg-blue-100 p-2.5 rounded-2xl w-14 h-14 flex items-center justify-center mb-4 shadow-sm">
                        <MapPin className="h-7 w-7 text-blue-600 fill-current" />
                      </div>
                      <CardTitle className="text-lg font-black uppercase tracking-tight text-slate-900 leading-none mb-2">Bestemming Bereikt</CardTitle>
                      <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        {routeType === 'meldingen' ? 'Melding' : 'Object'}: <span className="text-slate-900">{arrivedObject.name || arrivedObject.id}</span>
                      </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 pt-0 space-y-3 flex flex-col items-center">
                      <Button 
                        onClick={() => { 
                          if (routeType === 'meldingen') router.push(`/issues?id=${arrivedObject.id}`); 
                          else router.push(`/objects?id=${arrivedObject.id}`); 
                        }} 
                        className="w-full h-12 bg-primary hover:bg-primary/90 text-sm font-black uppercase tracking-widest gap-2 rounded-2xl shadow-xl shadow-primary/20"
                      >
                          <FileText className="h-5 w-5" /> WERKBON OPENEN
                      </Button>
                      <Button variant="ghost" onClick={() => setArrivedObject(null)} className="w-full h-10 text-xs font-black uppercase tracking-[0.15em] text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl">Sluiten</Button>
                  </CardContent>
              </Card>
          </div>
      )}

      <div className={cn("absolute bottom-0 left-0 right-0 z-[80] w-full flex flex-col items-center", isMobile ? "px-3 pb-3" : "px-6 pb-6")}>
        {!isFollowing && (<Button onClick={() => setIsFollowing(true)} className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-2xl bg-primary text-white border-none hover:scale-110 active:scale-95 transition-all flex items-center justify-center mb-4"><LocateFixed className="h-6 w-6" /></Button>)}
        <div className="w-full flex flex-col items-center gap-3">
            <Card className={cn("w-full max-w-lg bg-white shadow-2xl border-none rounded-[32px] pt-2 pb-4 px-8 transition-all duration-300 ease-in-out cursor-pointer", isDrawerExpanded ? "max-h-[300px]" : "max-h-[110px]")} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}>
                <div className="h-1.5 w-12 bg-slate-200 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                    <div className="flex flex-col items-center"><p className="text-2xl font-black text-black leading-none mb-1">{arrivalTime}</p><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">aankomst</p></div>
                    <div className="flex flex-col items-center"><p className="text-2xl font-black text-black leading-none mb-1">{durationMinLabel}</p><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">min.</p></div>
                    <div className="flex flex-col items-center"><p className="text-2xl font-black text-black leading-none mb-1">{distanceKm}</p><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">km</p></div>
                </div>
                <div className={cn("mt-8 flex gap-4 transition-all duration-300", isDrawerExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none")}>
                    <Button variant="ghost" size="lg" className="h-14 w-14 rounded-full bg-blue-50 border-none shrink-0" onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}>{isPaused ? <Play className="h-6 w-6 fill-current text-primary" /> : <Pause className="h-6 w-6 fill-current text-primary" />}</Button>
                    {isSimulating && (
                        <Button variant="ghost" size="lg" className="h-14 w-14 rounded-full bg-orange-50 border-none shrink-0" onClick={handleJumpToArrival}>
                            <FastForward className="h-6 w-6 text-orange-600 fill-current" />
                        </Button>
                    )}
                    <Button variant="destructive" size="lg" className="h-14 flex-1 rounded-full text-lg font-black uppercase tracking-tighter" onClick={(e) => { e.stopPropagation(); onExit(); }}>STOP RIT</Button>
                </div>
            </Card>
        </div>
      </div>
    </div>
  );
}

export default function StartNavigationPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { user } = useUser();
  const { profile } = useProfile();
  const { toast } = useToast();
  const { setIsHeaderVisible } = useNavigationUI();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const isPrivileged = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [tripStartLocation, setTripStartLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [currentActiveSortBase, setCurrentActiveSortBase] = React.useState(SIMULATION_START_LOCATION);
  
  const initialType = searchParams.get('type') as 'veeg' | 'prullenbak' | 'meldingen' | null;
  const [routeType, setRouteType] = React.useState<'veeg' | 'prullenbak' | 'meldingen' | null>(initialType);
  
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('--nieuwe-route--');
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [objectsOnRoute, setObjectsOnRoute] = React.useState<MapObject[]>([]);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  
  const [previewRouteGeometry, setPreviewRouteGeometry] = React.useState<any>(null);
  const [activePopupMeldingId, setActivePopupMeldingId] = React.useState<string | null>(null);
  const [isPreviewCalculating, setIsPreviewCalculating] = React.useState(false);

  const [showCompletedToday, setShowCompletedToday] = React.useState(false);
  const [showAssignmentInfo, setShowAssignmentInfo] = React.useState(false);
  const [hasResumed, setHasResumed] = React.useState(false);

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({
    intakenummer: true,
    adres: true,
    omschrijving: true,
    hoofdtype: true,
    subcategorie: true,
    werkgebied: true,
    toegewezen: true,
    afstand: true
  });

  const mapRef = React.useRef<MapRef>(null);

  // Load preferences
  React.useEffect(() => {
    const saved = localStorage.getItem('nav_col_visibility');
    if (saved) {
        try {
            setColumnVisibility(JSON.parse(saved));
        } catch (e) {}
    }
  }, []);

  const toggleColumn = (col: string) => {
    const next = { ...columnVisibility, [col]: !columnVisibility[col] };
    setColumnVisibility(next);
    localStorage.setItem('nav_col_visibility', JSON.stringify(next));
  };

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);

  const selectedProject = React.useMemo(() => projects?.find(p => p.id === selectedProjectId) || null, [projects, selectedProjectId]);
  
  React.useEffect(() => {
    if (navigationState === 'navigating') setIsHeaderVisible(false);
    else setIsHeaderVisible(true);
    return () => setIsHeaderVisible(true);
  }, [navigationState, setIsHeaderVisible]);

  React.useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
        (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => console.warn("Location error:", err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore || routeType !== 'meldingen') return null;
    return query(
      collection(firestore, 'meldingen'), 
      where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw'])
    );
  }, [firestore, routeType]);

  const { data: rawMeldingen } = useCollection<Melding>(meldingenQuery);

  const completedTodayQuery = useMemoFirebase(() => {
    if (!firestore || routeType !== 'meldingen') return null;
    const today = formatDate(new Date(), 'yyyy-MM-dd');
    return query(
      collection(firestore, 'meldingen'),
      where('status', '==', 'Afgerond'),
      where('afhandeling_datum', '==', today)
    );
  }, [firestore, routeType]);

  const { data: completedMeldingenFromDb } = useCollection<Melding>(completedTodayQuery);

  const myCompletedToday = React.useMemo(() => {
    if (!completedMeldingenFromDb || !profile) return [];
    const myName = profile.displayName || profile.email || 'Onbekend';
    return completedMeldingenFromDb.filter(m => m.afgehandeld_door === myName);
  }, [completedMeldingenFromDb, profile]);

  const sortedMeldingen = React.useMemo(() => {
    if (routeType !== 'meldingen' || !rawMeldingen || rawMeldingen.length === 0) return [];
    
    let pool = [...rawMeldingen];
    if (!isPrivileged) {
        const userName = profile?.displayName || profile?.email || 'Onbekend';
        pool = rawMeldingen.filter(m => m.behandelaar === userName);
    }

    if (pool.length === 0) return [];

    const result: Melding[] = [];
    const baseLoc = userLocation || currentActiveSortBase;
    let currentPos = [baseLoc.longitude, baseLoc.latitude];

    let tempPool = [...pool];
    while (tempPool.length > 0) {
        const nextItem = tempPool.reduce((prev, curr) => {
            const distPrev = turf.distance(turf.point(currentPos), turf.point([prev.longitude, prev.latitude]));
            const distCurr = turf.distance(turf.point(currentPos), turf.point([curr.longitude, curr.latitude]));
            return distCurr < distPrev ? curr : prev;
        });

        result.push(nextItem);
        currentPos = [nextItem.longitude, nextItem.latitude];
        tempPool = tempPool.filter(m => m.id !== nextItem.id);
    }

    return result;
  }, [rawMeldingen, routeType, isPrivileged, profile, userLocation, currentActiveSortBase]);

  const handleStartRit = React.useCallback(async (simulate = false) => {
    setIsSimulationMode(simulate);
    let startLoc = userLocation || SIMULATION_START_LOCATION;
    setIsStarting(true);

    if (routeType === 'meldingen') {
        if (sortedMeldingen.length === 0) { 
            toast({ title: "Geen meldingen", description: "Geen openstaande meldingen voor u gevonden." }); 
            setIsStarting(false); 
            return; 
        }
        setObjectsOnRoute(sortedMeldingen.map(m => ({ id: m.id, latitude: m.latitude, longitude: m.longitude, name: m.intakenummer, datum: m.datum } as MapObject)));
        setTripStartLocation(startLoc);
    }

    setNavigationState('navigating');
    setIsStarting(false);
  }, [userLocation, routeType, sortedMeldingen, toast]);

  React.useEffect(() => {
    const isResume = searchParams.get('resume') === 'true';
    if (isResume && !hasResumed && !isLoadingProjects && projects && routeType === 'meldingen') {
        if (sortedMeldingen.length > 0) {
            setHasResumed(true);
            const timer = setTimeout(() => handleStartRit(false), 100);
            return () => clearTimeout(timer);
        }
    }
  }, [searchParams, hasResumed, isLoadingProjects, projects, routeType, sortedMeldingen, handleStartRit]);

  React.useEffect(() => {
    const fetchPreview = async () => {
        if (routeType === 'meldingen' && sortedMeldingen.length >= 1) {
            setIsPreviewCalculating(true);
            const baseLoc = userLocation || currentActiveSortBase;
            const waypoints = [`${baseLoc.longitude},${baseLoc.latitude}`, ...sortedMeldingen.slice(0, 24).map(m => `${m.longitude},${m.latitude}`)].join(';');
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.routes && data.routes.length > 0) {
                    const geometry = data.routes[0].geometry;
                    setPreviewRouteGeometry(geometry);
                    
                    if (mapRef.current) {
                        const bbox = turf.bbox(geometry);
                        mapRef.current.getMap().fitBounds(bbox as [number, number, number, number], {
                            padding: 100,
                            duration: 1500
                        });
                    }
                }
            } catch (e) {} finally {
                setIsPreviewCalculating(false);
            }
        } else {
            setPreviewRouteGeometry(null);
        }
    };
    fetchPreview();
  }, [sortedMeldingen, routeType, userLocation, currentActiveSortBase]);

  const isMeldingenType = routeType === 'meldingen';
  const tableData = showCompletedToday ? myCompletedToday : sortedMeldingen;
  const startMarkerLocation = userLocation || SIMULATION_START_LOCATION;

  const uniqueAssignees = React.useMemo(() => {
    const assignees = new Set<string>();
    tableData.forEach(m => {
      if (m.behandelaar) assignees.add(m.behandelaar);
    });
    return Array.from(assignees).sort();
  }, [tableData]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {navigationState === 'navigating' ? (
        <NavigatingView objectsOnRoute={objectsOnRoute} onExit={() => { setNavigationState('setup'); setObjectsOnRoute([]); }} initialUserLocation={tripStartLocation} isSimulationMode={isSimulationMode} routeType={routeType} />
      ) : (
        <div className="w-full h-full relative flex flex-col">
          <div className="flex flex-col flex-1 min-h-0">
              <div className={cn("relative overflow-hidden shrink-0 transition-all duration-500 ease-in-out", isMeldingenType ? "h-[50%] lg:h-[60%]" : "h-full")}>
                  {isPreviewCalculating && (
                    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-sm pointer-events-none">
                      <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">Snelste route berekenen...</p>
                      </div>
                    </div>
                  )}

                  <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                      <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border-none text-slate-900" onClick={() => router.push('/')}><ArrowLeft className="h-5 w-5" /></Button>
                  </div>

                  <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
                      {profile?.role === 'Super admin' && (
                        <Button variant="outline" className="h-9 px-4 font-black uppercase tracking-widest border-none text-slate-900 bg-white/90 backdrop-blur-md hover:bg-white rounded-2xl shadow-2xl hidden sm:flex" onClick={() => handleStartRit(true)} disabled={!sortedMeldingen.length || isStarting}><Gauge className="mr-2 h-4 w-4" /> SIMULATOR</Button>
                      )}
                      <Button className="h-9 px-6 font-black uppercase tracking-widest bg-orange-600 text-white hover:bg-orange-700 shadow-2xl rounded-2xl" onClick={() => handleStartRit(false)} disabled={!sortedMeldingen.length || isStarting}>{isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Navigation className="mr-2 h-4 w-4 fill-current" />} START RIT</Button>
                  </div>

                  <MapGL ref={mapRef} initialViewState={{ longitude: userLocation?.longitude || 5.2913, latitude: userLocation?.latitude || 52.1326, zoom: userLocation ? 14 : 7 }} style={{ width: '100%', height: '100%' }} mapStyle={mapStyle} mapboxAccessToken={MAPBOX_TOKEN}>
                    <Marker longitude={startMarkerLocation.longitude} latitude={startMarkerLocation.latitude} anchor="center">
                        <div className="relative flex flex-col items-center">
                            <div className="absolute h-10 w-10 rounded-full bg-primary/20 animate-ping" />
                            <div className="relative h-10 w-10 rounded-2xl bg-white border-2 border-primary shadow-xl flex items-center justify-center">
                                <Home className="h-5 w-5 text-primary fill-current" />
                            </div>
                        </div>
                    </Marker>
                    
                    {isMeldingenType && !showCompletedToday && sortedMeldingen?.map((m, i) => {
                        const colorClass = getMeldingAgeColor(m.datum);
                        return (
                            <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center" onClick={() => setActivePopupMeldingId(m.id)}>
                                <div className={cn(
                                    "w-7 h-7 rounded-full border-2 border-white shadow-lg transition-transform cursor-pointer flex items-center justify-center font-black text-[10px]", 
                                    colorClass,
                                    activePopupMeldingId === m.id ? "scale-125 ring-4 ring-slate-900/20" : "hover:scale-110"
                                )}>
                                    <Bell className="h-3 w-3 text-slate-600" />
                                </div>
                            </Marker>
                        );
                    })}

                    {isMeldingenType && showCompletedToday && myCompletedToday?.map((m) => (
                        <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center" onClick={() => setActivePopupMeldingId(m.id)}>
                            <div className={cn("w-6 h-6 bg-green-600 rounded-full border-2 border-white shadow-lg transition-all cursor-pointer", activePopupMeldingId === m.id ? "scale-150 ring-4 ring-green-500/30" : "hover:scale-110")} />
                        </Marker>
                    ))}

                    {isMeldingenType && activePopupMeldingId && (
                        <Popup longitude={tableData.find(m => m.id === activePopupMeldingId)?.longitude || 0} latitude={tableData.find(m => m.id === activePopupMeldingId)?.latitude || 0} anchor="bottom" onClose={() => setActivePopupMeldingId(null)} closeOnClick={false} className="z-[100]"><div className="p-2 max-w-[250px]"><div className="flex items-center gap-2 mb-1.5 border-b pb-1.5"><Bell className="h-3 w-3 text-primary" /><p className="font-black text-[10px] uppercase text-primary tracking-tight">Bon {tableData.find(m => m.id === activePopupMeldingId)?.intakenummer}</p></div><p className="text-[11px] font-bold text-slate-700 leading-relaxed italic">"{tableData.find(m => m.id === activePopupMeldingId)?.extra_informatie || 'Geen omschrijving.'}"</p></div></Popup>
                    )}

                    {previewRouteGeometry && !showCompletedToday && (
                        <Source id="preview-route" type="geojson" data={{ type: 'Feature', properties: {}, geometry: previewRouteGeometry }}>
                            <Layer id="preview-route-line-casing" type="line" paint={{ 'line-color': '#1e40af', 'line-width': 8, 'line-opacity': 0.2 }} />
                            <Layer id="preview-route-line" type="line" paint={{ 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.6 }} />
                        </Source>
                    )}
                  </MapGL>
              </div>

              {isMeldingenType && (
                  <div className="flex-1 overflow-hidden flex flex-col bg-white border-t-4 border-slate-900 animate-in slide-in-from-bottom duration-500">
                      <div className="p-3 bg-slate-50 border-b flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-3">
                              <div className="bg-primary/10 p-1.5 rounded-lg">{showCompletedToday ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <Zap className="h-3.5 w-3.5 text-primary" />}</div>
                              <h3 className="font-black uppercase tracking-tighter text-xs text-slate-900">{showCompletedToday ? 'Vandaag Afgemeld' : 'Optimale Route Volgorde'}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                              <Button 
                                variant={showAssignmentInfo ? "default" : "outline"} 
                                size="sm" 
                                className={cn("h-8 text-[9px] font-black uppercase tracking-widest gap-2 rounded-xl transition-all", showAssignmentInfo ? "bg-blue-600 text-white" : "border-slate-200 bg-white")} 
                                onClick={() => setShowAssignmentInfo(!showAssignmentInfo)}
                              >
                                  <User className="h-3 w-3" /> TOEGEWEZEN
                              </Button>
                              <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest gap-2 rounded-xl border-slate-200 bg-white">
                                          <Settings2 className="h-3 w-3" /> Kolommen
                                      </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl p-2 border-slate-100">
                                      <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 py-1">Zichtbare velden</DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      {Object.keys(columnVisibility).map((col) => (
                                          <DropdownMenuCheckboxItem
                                              key={col}
                                              checked={columnVisibility[col]}
                                              onCheckedChange={() => toggleColumn(col)}
                                              className="rounded-lg font-bold capitalize text-xs"
                                          >
                                              {col}
                                          </DropdownMenuCheckboxItem>
                                      ))}
                                  </DropdownMenuContent>
                              </DropdownMenu>
                              <Button variant={showCompletedToday ? "default" : "outline"} size="sm" className={cn("h-8 text-[9px] font-black uppercase tracking-widest gap-2 rounded-xl transition-all", showCompletedToday ? "bg-green-600 text-white" : "border-slate-200 bg-white")} onClick={() => setShowCompletedToday(!showCompletedToday)}>{showCompletedToday ? <CheckCircle2 className="h-3 w-3" /> : <History className="h-3 w-3" />}{showCompletedToday ? 'TOON OPENSTAAND' : 'VANDAAG AFGEMELD'}</Button>
                          </div>
                      </div>

                      {showAssignmentInfo && uniqueAssignees.length > 0 && (
                        <div className="bg-blue-50 border-b px-4 py-2.5 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-blue-600" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Route voor medewerker(s):</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {uniqueAssignees.map(name => (
                                    <Badge key={name} variant="outline" className="bg-white border-blue-200 text-blue-700 text-[9px] font-black uppercase px-2.5 h-5 shadow-sm">
                                        {name}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                      )}

                      <ScrollArea className="flex-1">
                          <Table className="min-w-[1400px]">
                              <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                                  <TableRow className="h-8 hover:bg-transparent">
                                      {columnVisibility.intakenummer && <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3 w-32">Intakenr.</TableHead>}
                                      {columnVisibility.adres && <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3 w-64">Adres</TableHead>}
                                      {columnVisibility.omschrijving && <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3 w-80">Omschrijving</TableHead>}
                                      {columnVisibility.hoofdtype && <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3 w-40">Hoofdtype</TableHead>}
                                      {columnVisibility.subcategorie && <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3 w-48">Subtype</TableHead>}
                                      {columnVisibility.werkgebied && <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3 w-40">Werkgebied</TableHead>}
                                      {columnVisibility.toegewezen && <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3 w-40">Toegewezen</TableHead>}
                                      {columnVisibility.afstand && <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 px-3 w-24">Afstand</TableHead>}
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {tableData.length > 0 ? (
                                      tableData.map((m, idx) => {
                                          const baseLoc = userLocation || currentActiveSortBase;
                                          const dist = turf.distance(turf.point([baseLoc.longitude, baseLoc.latitude]), turf.point([m.longitude, m.latitude])).toFixed(1);
                                          const ageColor = getMeldingAgeColor(m.datum);
                                          
                                          return (
                                              <TableRow key={m.id} className={cn("h-14 hover:bg-blue-50 transition-colors border-b border-slate-100 cursor-pointer group", activePopupMeldingId === m.id && "bg-blue-50/80")} onClick={() => { setActivePopupMeldingId(m.id); if (mapRef.current) mapRef.current.getMap().flyTo({ center: [m.longitude, m.latitude], zoom: 17, speed: 1.5 }); }}>
                                                  {columnVisibility.intakenummer && (
                                                      <TableCell className="font-black text-[10px] border-r group-hover:text-primary transition-colors px-3 py-1">
                                                          <div className="flex items-center gap-2">
                                                              {!showCompletedToday && (
                                                                  <span className={cn(
                                                                      "h-5 w-5 rounded-md flex items-center justify-center shrink-0", 
                                                                      ageColor,
                                                                      "bg-opacity-80"
                                                                  )}>
                                                                      <Bell className="h-3 w-3 text-slate-600" />
                                                                  </span>
                                                              )}
                                                              {m.intakenummer}
                                                          </div>
                                                      </TableCell>
                                                  )}
                                                  {columnVisibility.adres && (
                                                      <TableCell className="text-[10px] font-bold border-r px-3 py-1">
                                                          <div className="flex flex-col">
                                                              <span className="truncate max-w-[200px]">{m.straatnaam} {m.huisnummer}</span>
                                                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.plaats}</span>
                                                          </div>
                                                      </TableCell>
                                                  )}
                                                  {columnVisibility.omschrijving && (
                                                      <TableCell className="text-[10px] font-medium border-r px-3 py-1 truncate max-w-[250px] text-slate-600 italic">
                                                          "{m.extra_informatie || 'Geen omschrijving'}"
                                                      </TableCell>
                                                  )}
                                                  {columnVisibility.hoofdtype && (
                                                      <TableCell className="text-[9px] font-black border-r text-slate-500 uppercase tracking-tight px-3 py-1">
                                                          {m.hoofdcategorie}
                                                      </TableCell>
                                                  )}
                                                  {columnVisibility.subcategorie && (
                                                      <TableCell className="text-[9px] font-black border-r text-slate-900 uppercase tracking-tight px-3 py-1">
                                                          {m.subcategorie}
                                                      </TableCell>
                                                  )}
                                                  {columnVisibility.werkgebied && (
                                                      <TableCell className="text-[9px] font-black border-r px-3 py-1">
                                                          <Badge variant="outline" className="h-4 px-1.5 text-[8px] font-black uppercase bg-slate-50 border-slate-200">
                                                              {m.werkgebied || m.wijk || '-'}
                                                          </Badge>
                                                      </TableCell>
                                                  )}
                                                  {columnVisibility.toegewezen && (
                                                      <TableCell className="text-[9px] font-black border-r px-3 py-1">
                                                          <div className="flex items-center gap-2">
                                                              <User className="h-3 w-3 text-slate-400" />
                                                              <span className="truncate max-w-[120px] text-slate-700">{m.behandelaar || '-'}</span>
                                                          </div>
                                                      </TableCell>
                                                  )}
                                                  {columnVisibility.afstand && (
                                                      <TableCell className="px-3 py-1">
                                                          <span className="text-[10px] font-black tabular-nums">{dist} km</span>
                                                      </TableCell>
                                                  )}
                                              </TableRow>
                                          )
                                      })
                                  ) : (
                                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground opacity-30"><LayoutGrid className="h-8 w-8 mx-auto mb-2" /><p className="font-black uppercase tracking-widest text-[10px]">Geen taken gevonden</p></TableCell></TableRow>
                                  )}
                              </TableBody>
                          </Table>
                      </ScrollArea>
                  </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
