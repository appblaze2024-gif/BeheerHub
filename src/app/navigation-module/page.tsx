'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef } from 'react-map-gl';
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
  Maximize,
  Minimize,
  Sparkles,
  FastForward,
  LayoutGrid,
  MessageSquare,
  Cpu,
  Trash2,
  Bell
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
import { addSeconds, format as formatDate } from 'date-fns';
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
    'line-color': '#1d4ed8', 
    'line-width': 10,
    'line-opacity': 0.9,
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
    'line-color': '#1e3a8a', 
    'line-width': 14,
    'line-opacity': 0.3,
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
  
  const [currentObjectIndex, setCurrentObjectIndex] = React.useState(0);
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

  const nextObject = objectsOnRoute[currentObjectIndex];

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
    simAnimationRef.current = requestAnimationFrame(runSimulation);
    return () => { if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current); };
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
  
  const handleArrivedAction = (type: 'finish' | 'issue') => {
    if (!arrivedObject) return;
    const finishedId = arrivedObject.id;
    setCompletedObjects(prev => [...prev, finishedId]);
    setArrivedObject(null);
    setHasReachedCurrentTarget(false);
    const remaining = objectsOnRoute.filter(obj => !completedObjects.includes(obj.id) && obj.id !== finishedId);
    if (remaining.length > 0) {
        const currentPt = turf.point([targetLocation!.longitude, targetLocation!.latitude]);
        let nextIdx = 0; let minDist = Infinity;
        objectsOnRoute.forEach((obj, idx) => {
            if (!completedObjects.includes(obj.id) && obj.id !== finishedId) {
                const d = turf.distance(currentPt, turf.point([obj.longitude, obj.latitude]));
                if (d < minDist) { minDist = d; nextIdx = idx; }
            }
        });
        setCurrentObjectIndex(nextIdx);
    } else setCurrentObjectIndex(objectsOnRoute.length); 
    setCurrentRouteGeometry(null); setCurrentLeg(null); lastFetchedTargetId.current = null;
  };

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
  const durationMin = React.useMemo(() => {
    if (!currentLeg?.duration) return '0';
    const durationSeconds = (distanceRemainingToDestination / (currentLeg.distance || 1)) * currentLeg.duration;
    return Math.round(durationSeconds / 60);
  }, [currentLeg, distanceRemainingToDestination]);
  const distanceKm = React.useMemo(() => (distanceRemainingToDestination / 1000).toFixed(1), [distanceRemainingToDestination]);

  if (currentObjectIndex >= objectsOnRoute.length && objectsOnRoute.length > 0 && !arrivedObject && !isCalculatingRoute) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-background p-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h1 className="text-3xl font-black tracking-tight uppercase">Route Voltooid!</h1>
            <p className="text-muted-foreground font-medium">Alle bestemmingen zijn bezocht.</p>
            <Button onClick={onExit} size="lg" className="px-10 h-14 text-lg font-bold uppercase tracking-tighter mt-4 bg-primary text-white">Terug naar Overzicht</Button>
        </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-slate-100 overflow-hidden">
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
        {objectsOnRoute.map((obj, idx) => {
            if (completedObjects.includes(obj.id)) return null;
            const isTarget = idx === currentObjectIndex;
            const inRange = isTarget && hasReachedCurrentTarget;
            
            const isMelding = routeType === 'meldingen';
            const typeStr = ((obj.locatieType || '') + ' ' + (obj.locatieSubType || '')).toLowerCase();
            
            const isBrengpark = typeStr.includes('brengparkje hhm') || typeStr.includes('brengpark');
            const isPrullenbakMeerlanden = typeStr.includes('prullenbakken (data meerlanden)');
            
            const useRecyclingBin = !isMelding && isPrullenbakMeerlanden;
            const useWasteBin = !isMelding && !useRecyclingBin && (
              isBrengpark || 
              typeStr.includes('container') || 
              typeStr.includes('ondergrond') ||
              typeStr.includes('ondergr') ||
              typeStr.includes('verzamel')
            );
            
            const Icon = isMelding ? Bell : Trash2;

            return (
                <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center" onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    if (routeType === 'meldingen' || (targetLocation && turf.distance(turf.point([targetLocation.longitude, targetLocation.latitude]), turf.point([obj.longitude, obj.latitude]), { units: 'meters' }) < 150)) {
                        setArrivedObject(obj);
                    } else if (targetLocation) {
                        toast({ title: "Te ver weg", description: `U moet binnen 150m van de ${routeType === 'prullenbak' ? 'bak' : 'locatie'} zijn om deze af te melden.`, variant: "destructive" });
                    }
                }}>
                    <div className="relative flex flex-col items-center">
                        <div className={cn("absolute h-12 w-12 rounded-full bg-blue-500/20", inRange && "animate-pulse")} />
                        <div className={cn(
                            "relative h-10 w-10 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-all", 
                            isTarget ? "bg-primary scale-125 ring-4 ring-primary/30" : "bg-slate-400", 
                            inRange && "scale-125 bg-green-600"
                        )}>
                            {useRecyclingBin ? (
                                <img src="https://i.ibb.co/Xxrq1zP3/recycling-bin.png" alt="recycling bin" className="h-6 w-6" />
                            ) : useWasteBin ? (
                                <img src="https://i.ibb.co/FbgGHW1G/waste-bin.png" alt="container" className="h-6 w-6" />
                            ) : (
                                <Icon className="h-5 w-5 text-white stroke-[2.5]" />
                            )}
                            <div className="absolute -top-2 -right-2 bg-white text-primary rounded-full w-5 h-5 flex items-center justify-center border-2 border-primary shadow-sm">
                                <span className="font-black text-[9px]">{idx + 1}</span>
                            </div>
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
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{routeType === 'meldingen' ? 'Bonnen gereed' : 'Bakken gereed'}</span>
                    </div>
                    <div className="flex-1 max-w-[120px]">
                        <Progress value={(completedObjects.length / objectsOnRoute.length) * 100} className="h-1.5" />
                    </div>
                </CardContent>
            </Card>
        )}

        {gpsError && (
            <Alert variant="destructive" className="bg-red-600 text-white border-none shadow-2xl animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-3">{gpsError === 'permission' ? <XIcon className="h-5 w-5" /> : <SignalLow className="h-5 w-5 animate-pulse" />}
                    <div><AlertTitle className="font-black uppercase tracking-tight text-[10px] md:text-xs">{gpsError === 'permission' ? 'Locatie Toegang Geweigerd' : 'Zwak GPS Signaal'}</AlertTitle><AlertDescription className="text-[9px] md:text-[10px] opacity-90 font-bold">{gpsError === 'permission' ? 'Schakel locatietoegang in.' : 'Uw locatie wordt gezocht...'}</AlertDescription></div>
                </div>
            </Alert>
        )}
      </div>

      <div className={cn("absolute right-4 top-20 z-[70] transition-all duration-300 flex items-center gap-3")}>
          <div className="h-14 w-14 rounded-full bg-white border-[6px] border-red-600 flex items-center justify-center shadow-xl animate-in fade-in zoom-in duration-500"><span className="text-xl font-black text-slate-900 tabular-nums">{currentSpeedLimit}</span></div>
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
                      <CardTitle className="text-lg font-black uppercase tracking-tight text-slate-900 leading-none mb-2">Bestemming Selectie</CardTitle>
                      <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        {routeType === 'meldingen' ? 'Meldingsnummer' : 'Object ID'}: <span className="text-slate-900">{arrivedObject.name || arrivedObject.id}</span>
                      </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 pt-0 space-y-3 flex flex-col items-center">
                      <Button onClick={() => { if (routeType === 'meldingen') router.push(`/issues?id=${arrivedObject.id}`); else router.push(`/objects?id=${arrivedObject.id}`); }} className="w-full h-12 bg-primary hover:bg-primary/90 text-sm font-black uppercase tracking-widest gap-2 rounded-2xl shadow-xl shadow-primary/20">
                          <FileText className="h-5 w-5" /> Open Details
                      </Button>
                      <Button variant="ghost" onClick={() => setArrivedObject(null)} className="w-full h-10 text-xs font-black uppercase tracking-[0.15em] text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl">Sluiten</Button>
                  </CardContent>
              </Card>
          </div>
      )}

      <div className={cn("absolute bottom-0 left-0 right-0 z-[80] w-full flex flex-col items-center", isMobile ? "px-3 pb-3" : "px-6 pb-6")}>
        {!isFollowing && (<Button onClick={() => setIsFollowing(true)} className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-2xl bg-primary text-white border-none hover:scale-110 active:scale-95 transition-all flex items-center justify-center mb-4"><LocateFixed className="h-6 w-6" /></Button>)}
        {isMobile ? (
            <div className="w-full flex flex-col items-center gap-3">
                <Card className={cn("w-full bg-white shadow-2xl border-none rounded-[32px] pt-2 pb-4 px-8 transition-all duration-300 ease-in-out cursor-pointer", isDrawerExpanded ? "max-h-[300px]" : "max-h-[110px]")} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}>
                    <div className="h.5 w-12 bg-slate-200 rounded-full mx-auto mb-3" />
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col items-center"><p className="text-2xl font-black text-black leading-none mb-1">{arrivalTime}</p><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">aankomst</p></div>
                        <div className="flex flex-col items-center"><p className="text-2xl font-black text-black leading-none mb-1">{durationMin}</p><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">min.</p></div>
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
        ) : (
            <div className="w-full max-w-4xl flex items-end justify-between gap-4">
                <div className="flex gap-2 p-1.5 bg-white/95 backdrop-blur-xl rounded-full shadow-2xl border border-slate-100">
                    <Button variant="ghost" size="lg" className="h-14 w-14 rounded-full hover:bg-slate-50 transition-all flex items-center justify-center p-0" onClick={() => setIsPaused(!isPaused)}>{isPaused ? <Play className="h-7 w-7 fill-current text-primary" /> : <Pause className="h-7 w-7 fill-current text-primary" />}</Button>
                    {isSimulating && (
                        <Button variant="ghost" size="lg" className="h-14 w-14 rounded-full hover:bg-orange-50 transition-all flex items-center justify-center p-0" onClick={handleJumpToArrival}>
                            <FastForward className="h-7 w-7 fill-current text-orange-600" />
                        </Button>
                    )}
                    <Button variant="destructive" size="lg" className="h-14 w-14 rounded-full shadow-xl border-none hover:scale-105 active:scale-95 transition-all flex items-center justify-center p-0" onClick={onExit}><XIcon className="h-7 w-7" /></Button>
                </div>
                <Card className="bg-white/95 backdrop-blur-xl border-none shadow-2xl overflow-hidden w-64 hidden md:flex">
                    <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between items-end">
                            <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Aankomst: {arrivalTime}</p><p className="text-lg font-black text-slate-900 leading-none">{durationMin} min <span className="text-slate-300">/ {distanceKm} km</span></p></div>
                            <div className="text-right"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Voortgang</p><p className="text-xs font-black text-primary">{completedObjects.length}/{objectsOnRoute.length}</p></div>
                        </div>
                        <Progress value={(completedObjects.length / (objectsOnRoute.length || 1)) * 100} className="h-1.5 bg-slate-100" />
                    </CardContent>
                </Card>
            </div>
        )}
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
  const [isRecalculating, setIsRecalculating] = React.useState(false);
  const [currentActiveSortBase, setCurrentActiveSortBase] = React.useState(SIMULATION_START_LOCATION);
  
  const initialType = searchParams.get('type') as 'veeg' | 'prullenbak' | 'meldingen' | null;
  const [routeType, setRouteType] = React.useState<'veeg' | 'prullenbak' | 'meldingen' | null>(initialType);
  
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('--nieuwe-route--');
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [objectsOnRoute, setObjectsOnRoute] = React.useState<MapObject[]>([]);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = React.useState(false);
  const [urlMeldingLocatie, setUrlMeldingLocatie] = React.useState<{ latitude: number; longitude: number; straat?: string } | null>(null);
  
  const [previewRouteGeometry, setPreviewRouteGeometry] = React.useState<any>(null);

  const mapRef = React.useRef<MapRef>(null);

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);

  const selectedProject = React.useMemo(() => projects?.find(p => p.id === selectedProjectId) || null, [projects, selectedProjectId]);
  
  const availableRoutes = React.useMemo(() => {
      if (!selectedProject) return [];
      if (routeType === 'veeg') return selectedProject.veegroutes || [];
      if (routeType === 'prullenbak') return selectedProject.prullenbakkenroutes || [];
      return [];
  }, [selectedProject, routeType]);

  const selectedRouteIdDef = React.useMemo(() => {
    if (!selectedRouteId || selectedRouteId === '--nieuwe-route--' || !selectedProject) return null;
    const allRoutes = [...(selectedProject.veegroutes || []), ...(selectedProject.prullenbakkenroutes || [])];
    return allRoutes.find(r => r.id === selectedRouteId) || null;
  }, [selectedRouteId, selectedProject]);

  const routeGeoJSONFeatures = React.useMemo(() => {
    if (!selectedRouteIdDef) return null;
    try {
      const features = JSON.parse(selectedRouteIdDef.subGebieden);
      if (Array.isArray(features) && features.length > 0) return { type: 'FeatureCollection' as const, features: features.map((f: any) => ({ type: 'Feature' as const, properties: {}, geometry: f.geometry })) };
    } catch (e) {}
    return null;
  }, [selectedRouteIdDef]);

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

  React.useEffect(() => {
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const straat = searchParams.get('straat');
    const typeFromUrl = searchParams.get('type') as any;
    if (typeFromUrl) setRouteType(typeFromUrl);
    if (lat && lng) setUrlMeldingLocatie({ latitude: parseFloat(lat), longitude: parseFloat(lng), straat: straat || 'Melding' });
  }, [searchParams]);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore || routeType !== 'meldingen') return null;
    return query(
      collection(firestore, 'meldingen'), 
      where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld', 'Nieuw'])
    );
  }, [firestore, routeType]);

  const { data: allMeldingen } = useCollection<Melding>(meldingenQuery);

  const objectsOnRouteQuery = useMemoFirebase(() => {
    if (!firestore || !selectedRouteIdDef) return null;
    return query(collection(firestore, 'objects'), where('locatieWerkgebieden', 'array-contains', selectedRouteIdDef.naam));
  }, [firestore, selectedRouteIdDef?.naam]);

  const { data: objectsOnMap } = useCollection<MapObject>(objectsOnRouteQuery);

  // Define priority logic centrally
  const getObjectPriority = (obj: any) => {
    const typeStr = ((obj.locatieType || '') + ' ' + (obj.locatieSubType || '')).toLowerCase();
    
    const isBrengpark = typeStr.includes('brengparkje hhm') || typeStr.includes('brengpark');
    const isPrullenbakMeerlanden = typeStr.includes('prullenbakken (data meerlanden)');
    
    if (isPrullenbakMeerlanden) return 3;
    if (isBrengpark || typeStr.includes('container') || typeStr.includes('ondergrond')) return 2;
    return 1;
  };

  const uniqueObjectsOnMap = React.useMemo(() => {
    if (!objectsOnMap) return [];
    const locationMap = new Map<string, MapObject>();
    
    objectsOnMap.forEach(obj => {
      // Use 5 decimal places (~1 meter precision) to collapse icons that are visually on top of each other
      const key = `${obj.latitude.toFixed(5)}_${obj.longitude.toFixed(5)}`;
      const existing = locationMap.get(key);
      if (!existing || getObjectPriority(obj) > getObjectPriority(existing)) {
        locationMap.set(key, obj);
      }
    });
    
    return Array.from(locationMap.values());
  }, [objectsOnMap]);

  const sortedMeldingen = React.useMemo(() => {
    if (routeType !== 'meldingen' || !allMeldingen || allMeldingen.length === 0) return [];
    
    let visibleMeldingen = allMeldingen;
    if (!isPrivileged) {
        const userName = profile?.displayName || profile?.email || 'Onbekend';
        visibleMeldingen = allMeldingen.filter(m => m.behandelaar === userName);
    }

    if (visibleMeldingen.length === 0) return [];

    let unvisited = [...visibleMeldingen];
    let currentPos = currentActiveSortBase;
    let sorted: Melding[] = [];

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minD = Infinity;
      unvisited.forEach((u, i) => {
        const d = turf.distance(
          turf.point([currentPos.longitude, currentPos.latitude]),
          turf.point([u.longitude, u.latitude])
        );
        if (d < minD) {
          minD = d;
          nearestIdx = i;
        }
      });
      const next = unvisited.splice(nearestIdx, 1)[0];
      sorted.push(next);
      currentPos = { latitude: next.latitude, longitude: next.longitude };
    }
    return sorted;
  }, [allMeldingen, routeType, currentActiveSortBase, isPrivileged, profile]);

  React.useEffect(() => {
    const fetchPreview = async () => {
        if (routeType === 'meldingen' && sortedMeldingen.length >= 1) {
            const startWaypoint = `${currentActiveSortBase.longitude},${currentActiveSortBase.latitude}`;
            const meldingWaypoints = sortedMeldingen.slice(0, 24).map(m => `${m.longitude},${m.latitude}`).join(';');
            const waypoints = `${startWaypoint};${meldingWaypoints}`;
            
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.routes && data.routes.length > 0) {
                    setPreviewRouteGeometry(data.routes[0].geometry);
                }
            } catch (e) {}
        } else {
            setPreviewRouteGeometry(null);
        }
    };
    fetchPreview();
  }, [sortedMeldingen, routeType, currentActiveSortBase]);

  React.useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();

    const fitRoute = () => {
        if (routeType === 'meldingen' && previewRouteGeometry) {
            try {
                const line = turf.lineString(previewRouteGeometry.coordinates);
                const bbox = turf.bbox(line);
                if (bbox[0] !== Infinity) {
                    map.fitBounds(bbox as [number, number, number, number], {
                        padding: 80,
                        duration: 1500
                    });
                }
            } catch (e) {}
        } else if (routeType !== 'meldingen' && routeGeoJSONFeatures) {
            try {
                const bbox = turf.bbox(routeGeoJSONFeatures);
                if (bbox[0] !== Infinity) {
                    map.fitBounds(bbox as [number, number, number, number], {
                        padding: 80,
                        duration: 1500
                    });
                }
            } catch (e) {}
        }
    };

    if (map.isStyleLoaded()) {
        fitRoute();
    } else {
        map.on('load', fitRoute);
    }
  }, [previewRouteGeometry, routeGeoJSONFeatures, routeType]);

  const handleStartRoute = React.useCallback(async (simulate = false) => {
    setIsSimulationMode(simulate);
    
    let startLoc = userLocation || SIMULATION_START_LOCATION;
    const isAtBase = turf.distance(turf.point([startLoc.longitude, startLoc.latitude]), turf.point([SIMULATION_START_LOCATION.longitude, SIMULATION_START_LOCATION.latitude]), { units: 'meters' }) < 100;

    setIsStarting(true);

    if (routeType === 'meldingen') {
        if (sortedMeldingen.length === 0) { 
            toast({ title: "Geen meldingen", description: "Geen aan u toegewezen meldingen gevonden." }); 
            setIsStarting(false); 
            return; 
        }

        if (!isAtBase && !simulate) {
            setIsRecalculating(true);
            setCurrentActiveSortBase(startLoc);
            await new Promise(resolve => setTimeout(resolve, 1500));
            setIsRecalculating(false);
        }

        const finalObjects = sortedMeldingen.map(m => ({ id: m.id, latitude: m.latitude, longitude: m.longitude, name: m.intakenummer } as MapObject));
        setObjectsOnRoute(finalObjects);
        setTripStartLocation(startLoc);
    } else if (selectedRouteIdDef && objectsOnMap) {
        // Use the priority-deduplicated list
        const unique = uniqueObjectsOnMap;

        const unvisited = [...unique]; 
        let currentPos = startLoc;
        let finalObjects: MapObject[] = [];
        while (unvisited.length > 0) {
          let nearestIdx = 0; let minD = Infinity;
          unvisited.forEach((u, i) => {
            const d = turf.distance(turf.point([currentPos.longitude, currentPos.latitude]), turf.point([u.longitude, u.latitude]));
            if (d < minD) { minD = d; nearestIdx = i; }
          });
          const next = unvisited.splice(nearestIdx, 1)[0];
          finalObjects.push(next); 
          currentPos = { latitude: next.latitude, longitude: next.longitude };
        }
        setObjectsOnRoute(finalObjects);
        setTripStartLocation(startLoc);
    } else if (urlMeldingLocatie) {
        setObjectsOnRoute([{ id: 'Bestemming', latitude: urlMeldingLocatie.latitude, longitude: urlMeldingLocatie.longitude, name: urlMeldingLocatie.straat || 'Melding' }]);
        setTripStartLocation(startLoc);
    }

    setNavigationState('navigating');
    setIsStarting(false);
  }, [userLocation, selectedRouteIdDef, urlMeldingLocatie, routeType, sortedMeldingen, objectsOnMap, uniqueObjectsOnMap, toast]);

  const isMeldingenType = routeType === 'meldingen';

  if (isRecalculating) {
      return <LoadingScreen message="BeheerHub AI optimaliseert uw route vanaf huidige locatie..." />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {navigationState === 'navigating' ? (
        <NavigatingView objectsOnRoute={objectsOnRoute} onExit={() => { setNavigationState('setup'); setObjectsOnRoute([]); setCurrentActiveSortBase(SIMULATION_START_LOCATION); if (searchParams.has('lat')) router.back(); }} initialUserLocation={tripStartLocation} isSimulating={isSimulationMode} routeType={routeType} />
      ) : (
        <div className="w-full h-full relative flex flex-col">
          <div className={cn("flex flex-col flex-1 min-h-0", isMeldingenType ? "" : "relative")}>
              <div className={cn("relative overflow-hidden shrink-0", isMeldingenType ? "h-[60%]" : "h-full")}>
                  <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                      <Button 
                        variant="secondary" 
                        size="icon" 
                        className="h-10 w-10 rounded-full shadow-2xl bg-white/90 backdrop-blur-md border-none text-slate-900 hover:bg-white" 
                        onClick={() => router.push('/')}
                      >
                          <ArrowLeft className="h-5 w-5" />
                      </Button>
                  </div>

                  <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
                      {profile?.role === 'Super admin' && (
                        <Button 
                          variant="outline"
                          className="h-9 px-4 font-black uppercase tracking-widest border-none text-slate-900 bg-white/90 backdrop-blur-md hover:bg-white rounded-2xl shadow-2xl transition-all hidden sm:flex"
                          onClick={() => handleStartRoute(true)}
                          disabled={(routeType === 'meldingen' ? !sortedMeldingen.length : selectedRouteId === '--nieuwe-route--') || isStarting}
                        >
                            <Gauge className="mr-2 h-4 w-4" /> SIMULATOR
                        </Button>
                      )}
                      <Button 
                        className="h-9 px-6 font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90 shadow-2xl rounded-2xl"
                        onClick={() => handleStartRoute(false)}
                        disabled={(routeType === 'meldingen' ? !sortedMeldingen.length : selectedRouteId === '--nieuwe-route--') || isStarting}
                      >
                          {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Navigation className="mr-2 h-4 w-4 fill-current" />}
                          START RIT
                      </Button>
                  </div>

                  <MapGL 
                    ref={mapRef} 
                    initialViewState={{ longitude: userLocation?.longitude || 5.2913, latitude: userLocation?.latitude || 52.1326, zoom: userLocation ? 14 : 7 }} 
                    style={{ width: '100%', height: '100%' }} 
                    mapStyle={mapStyle} 
                    mapboxAccessToken={MAPBOX_TOKEN}
                  >
                    {userLocation && (<Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center"><div className="relative flex flex-col items-center"><div className="absolute h-10 w-10 rounded-full bg-green-500/30 animate-ping" /><div className="relative h-8 w-8 rounded-full bg-green-600 border-4 border-white shadow-xl flex items-center justify-center"><MapPin className="h-4 w-4 text-white fill-current" /></div></div></Marker>)}
                    {urlMeldingLocatie && (<Marker longitude={urlMeldingLocatie.longitude} latitude={urlMeldingLocatie.latitude} anchor="center"><div className="relative flex flex-col items-center"><div className="absolute h-12 w-12 rounded-full bg-blue-50/20 animate-pulse" /><div className="relative h-10 w-10 rounded-full bg-primary border-4 border-white shadow-2xl flex items-center justify-center"><Flag className="h-5 w-5 text-white fill-current" /></div></div></Marker>)}
                    {routeGeoJSONFeatures && (<Source id="route-area" type="geojson" data={{ type: 'FeatureCollection', features: routeGeoJSONFeatures }}><Layer id="route-area-fill" type="fill" paint={{ 'fill-color': '#32ADE6', 'fill-opacity': 0.05 }} /><Layer id="route-area-outline" type="line" paint={{ 'fill-color': '#32ADE6', 'fill-width': 1, 'line-dasharray': [2, 2] }} /></Source>)}
                    
                    <Marker longitude={SIMULATION_START_LOCATION.longitude} latitude={SIMULATION_START_LOCATION.latitude} anchor="center">
                        <div className="w-8 h-8 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white">
                            <Home className="h-4 w-4 fill-current" />
                        </div>
                    </Marker>

                    {routeType === 'meldingen' && sortedMeldingen?.map((m, idx) => (
                        <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="center" onClick={() => {
                            if (mapRef.current) mapRef.current.getMap().flyTo({ center: [m.longitude, m.latitude], zoom: 17, speed: 1.5 });
                        }}>
                            <div className="relative flex flex-col items-center">
                                {isPrivileged && m.behandelaar && (
                                    <div className="absolute -top-8 bg-white/95 backdrop-blur-sm px-2 py-0.5 rounded-md border border-slate-200 shadow-md text-[8px] font-black text-slate-900 uppercase tracking-tighter whitespace-nowrap z-10 animate-in fade-in slide-in-from-bottom-1">
                                        {m.behandelaar}
                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white border-r border-b border-slate-200 rotate-45" />
                                    </div>
                                )}
                                <div className="w-6 h-6 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-black text-white hover:scale-125 transition-transform cursor-pointer relative z-0">
                                    {idx + 1}
                                </div>
                            </div>
                        </Marker>
                    ))}

                    {isMeldingenType && previewRouteGeometry && (
                        <Source id="preview-route" type="geojson" data={{ type: 'Feature', properties: {}, geometry: previewRouteGeometry }}>
                            <Layer 
                                id="preview-route-line" 
                                type="line" 
                                paint={{ 
                                    'line-color': '#ef4444', 
                                    'line-width': 4,
                                    'line-opacity': 0.6,
                                    'line-dasharray': [2, 1]
                                }} 
                            />
                        </Source>
                    )}

                    {routeType !== 'meldingen' && uniqueObjectsOnMap?.map(obj => {
                        const typeStr = ((obj.locatieType || '') + ' ' + (obj.locatieSubType || '')).toLowerCase();
                        
                        const isBrengpark = typeStr.includes('brengparkje hhm') || typeStr.includes('brengpark');
                        const isPrullenbakMeerlanden = typeStr.includes('prullenbakken (data meerlanden)');
                        
                        const useRecyclingBin = isPrullenbakMeerlanden;
                        const useWasteBin = !useRecyclingBin && (
                          isBrengpark || 
                          typeStr.includes('container') || 
                          typeStr.includes('ondergrond') ||
                          typeStr.includes('ondergr') ||
                          typeStr.includes('verzamel')
                        );
                        
                        return (
                            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center">
                                {useRecyclingBin ? (
                                    <img src="https://i.ibb.co/Xxrq1zP3/recycling-bin.png" alt="recycling bin" className="h-5 w-5 drop-shadow-md" />
                                ) : useWasteBin ? (
                                    <img src="https://i.ibb.co/FbgGHW1G/waste-bin.png" alt="container" className="h-5 w-5 drop-shadow-md" />
                                ) : (
                                    <div className="w-4 h-4 bg-primary rounded-full border-2 border-white shadow-lg" />
                                )}
                            </Marker>
                        );
                    })}
                  </MapGL>

                  {!isMeldingenType && (
                    <Card className="absolute top-20 left-4 z-10 w-full max-w-[280px] shadow-2xl bg-white/95 backdrop-blur border-2 border-slate-100 rounded-2xl p-4 hidden sm:block animate-in slide-in-from-left-4 duration-300">
                        <CardHeader className="p-3 border-b bg-slate-50/50">
                            <CardTitle className="text-sm font-black uppercase tracking-tighter">Instellingen</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 space-y-3">
                            <div className="space-y-1">
                                <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Project</Label>
                                <Select value={selectedProjectId || ''} onValueChange={v => setSelectedProjectId(v || null)} disabled={isLoadingProjects}>
                                    <SelectTrigger className="h-8 border font-bold text-xs"><SelectValue placeholder="Kies project" /></SelectTrigger>
                                    <SelectContent>{projects?.filter(p => !!p.id).map(p => (<SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>))}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Type Inzet</Label>
                                <div className="grid grid-cols-2 gap-1">
                                    <Button variant={routeType === 'veeg' ? 'default' : 'outline'} onClick={() => setRouteType('veeg')} className={cn("font-black h-8 border text-[9px] p-1", routeType === 'veeg' ? "bg-primary border-primary text-white" : "border-slate-200")}>Veeg</Button>
                                    <Button variant={routeType === 'prullenbak' ? 'default' : 'outline'} onClick={() => setRouteType('prullenbak')} className={cn("font-black h-8 border text-[9px] p-1", routeType === 'prullenbak' ? "bg-primary border-primary text-white" : "border-slate-200")}>Bakken</Button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Route Keuze</Label>
                                <Select onValueChange={setSelectedRouteId} value={selectedRouteId}>
                                    <SelectTrigger className="h-8 border font-bold text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="--nieuwe-route--">-- Kies een route --</SelectItem>
                                        {availableRoutes.filter((r: any) => !!r.id).map((r: any) => (<SelectItem key={r.id} value={r.id}>{r.naam}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                  )}
              </div>

              {isMeldingenType && (
                  <div className="flex-1 overflow-hidden flex flex-col bg-white border-t-4 border-slate-900">
                      <div className="p-3 bg-slate-50 border-b flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-3">
                              <div className="bg-primary/10 p-1.5 rounded-lg"><FileText className="h-3.5 w-3.5 text-primary" /></div>
                              <h3 className="font-black uppercase tracking-tighter text-xs text-slate-900">Overzicht Werkbonnen</h3>
                              <Badge variant="outline" className="h-4.5 px-1.5 font-black text-[8px] border-2 bg-white">{sortedMeldingen.length} Route Volgorde</Badge>
                          </div>
                      </div>
                      <ScrollArea className="flex-1">
                          <Table className="min-w-[1200px] border-collapse">
                              <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                                  <TableRow className="h-8 hover:bg-transparent">
                                      <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3 w-12 text-center">#</TableHead>
                                      <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3">Intakenr.</TableHead>
                                      <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3">Adresgegevens</TableHead>
                                      <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3">Omschrijving</TableHead>
                                      <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3">Hoofdtype</TableHead>
                                      <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 border-r px-3">Subtype</TableHead>
                                      <TableHead className="font-black uppercase tracking-widest text-[9px] text-slate-500 px-3">Werkgebied</TableHead>
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {sortedMeldingen.length > 0 ? (
                                      sortedMeldingen.map((m, index) => (
                                          <TableRow 
                                            key={m.id} 
                                            className="h-9 hover:bg-blue-50 transition-colors border-b border-slate-100 cursor-pointer group"
                                            onClick={() => {
                                                if (mapRef.current) {
                                                    mapRef.current.getMap().flyTo({ center: [m.longitude, m.latitude], zoom: 17, speed: 1.5 });
                                                }
                                            }}
                                          >
                                              <TableCell className="font-black text-xs text-center border-r bg-slate-50/50 text-primary w-12">{index + 1}</TableCell>
                                              <TableCell className="font-black text-[11px] border-r group-hover:text-primary transition-colors px-3">{m.intakenummer}</TableCell>
                                              <TableCell className="text-[11px] font-bold border-r px-3">
                                                  <div className="flex flex-col leading-tight">
                                                      <span>{m.straatnaam} {m.huisnummer}</span>
                                                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{m.postcode} {m.plaats}</span>
                                                  </div>
                                              </TableCell>
                                              <TableCell className="text-[11px] font-bold border-r px-3 max-w-[250px]">
                                                  <div className="flex items-center gap-1.5">
                                                      <MessageSquare className="h-2.5 w-2.5 text-slate-300 shrink-0" />
                                                      <p className="truncate text-slate-500 font-medium italic" title={m.extra_informatie}>{m.extra_informatie || '-'}</p>
                                                  </div>
                                              </TableCell>
                                              <TableCell className="text-[10px] font-medium border-r text-slate-500 uppercase px-3">{m.hoofdcategorie}</TableCell>
                                              <TableCell className="text-[10px] font-black border-r text-slate-900 uppercase tracking-tight px-3">{m.subcategorie}</TableCell>
                                              <TableCell className="px-3">
                                                  <Badge variant="outline" className="h-4 px-1.5 text-[8px] font-black uppercase bg-slate-50 border-slate-200">
                                                      {m.werkgebied || '-'}
                                                  </Badge>
                                              </TableCell>
                                          </TableRow>
                                      ))
                                  ) : (
                                      <TableRow>
                                          <TableCell colSpan={7} className="text-center py-12 text-muted-foreground opacity-30">
                                              <LayoutGrid className="h-8 w-8 mx-auto mb-2" />
                                              <p className="font-black uppercase tracking-widest text-[10px]">Geen openstaande meldingen voor uitvoering</p>
                                          </TableCell>
                                      </TableRow>
                                  )}
                              </TableBody>
                          </Table>
                      </ScrollArea>
                  </div>
              )}
          </div>
        </div>
      )}
      {isPrivileged && (<RouteHistoryDialog open={isHistoryDialogOpen} onOpenChange={isHistoryDialogOpen} projectId={selectedProjectId} />)}
    </div>
  );
}
