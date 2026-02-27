
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
  Sparkles
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

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

// Vaste coördinaten voor de Aarbergerweg in Rijsenhout
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

  const isWorkOrder = routeType === 'meldingen';

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartY.current - touchEndY;

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
          setHasReachedCurrentTarget(roundedRemaining < 150);
          if (isWorkOrder && roundedRemaining < 25) onExit();
      }
    } catch (e) {}
  }, [snappedLocation?.latitude, snappedLocation?.longitude, currentRouteGeometry, isCalculatingRoute, isWorkOrder, onExit]);

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
        setTargetLocation(prev => ({ latitude, longitude, speed: speedMs, heading: heading !== null ? heading : (prev?.heading ?? 0) }));
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
            return (
                <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center" onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    
                    if (routeType === 'meldingen') {
                        // Werkbonnen: Geen afstandsbeperking
                        setArrivedObject(obj);
                    } else {
                        // Prullenbakken/Veegroutes: Moet binnen 150m zijn
                        if (!targetLocation) {
                            toast({ title: "GPS Signaal", description: "Wachten op locatiebepaling...", variant: "destructive" });
                            return;
                        }
                        const dist = turf.distance(
                            turf.point([targetLocation.longitude, targetLocation.latitude]),
                            turf.point([obj.longitude, obj.latitude]),
                            { units: 'meters' }
                        );
                        if (dist < 150) {
                            setArrivedObject(obj);
                        } else {
                            toast({ 
                                title: "Te ver weg", 
                                description: `U moet binnen 150m van de ${routeType === 'prullenbak' ? 'bak' : 'locatie'} zijn om deze af te melden.`,
                                variant: "destructive" 
                            });
                        }
                    }
                }}>
                    <div className="relative flex flex-col items-center">
                        <div className={cn("absolute h-12 w-12 rounded-full bg-blue-500/20", inRange && "animate-pulse")} />
                        <div className={cn("relative h-10 w-10 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-all", isTarget ? "bg-primary scale-125 ring-4 ring-primary/30" : "bg-slate-400", inRange && "scale-125 bg-green-600")}>
                            <Flag className="h-5 w-5 text-white fill-current" />
                        </div>
                        <div className="mt-1 bg-black/60 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow uppercase">{idx + 1}</div>
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
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{isWorkOrder ? 'Bonnen gereed' : 'Bakken gereed'}</span>
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
          <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
              <Card className="w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                  <CardHeader className="text-center pb-2">
                      <div className="mx-auto bg-blue-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4"><MapPin className="h-8 w-8 text-blue-600 fill-current" /></div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Bestemming Selectie</CardTitle>
                      <CardDescription className="font-bold text-slate-500">{isWorkOrder ? 'Meldingsnummer' : 'Object ID'}: <span className="text-slate-900">{arrivedObject.name || arrivedObject.id}</span></CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 pt-2 space-y-3">
                      <Button onClick={() => { if (isWorkOrder) router.push(`/issues?id=${arrivedObject.id}`); else router.push(`/objects?id=${arrivedObject.id}`); }} className="w-full h-14 bg-primary hover:bg-primary/90 text-lg font-black uppercase tracking-tight gap-2">
                          <FileText className="h-5 w-5" /> Open Details
                      </Button>
                      <Button variant="outline" onClick={() => handleArrivedAction('finish')} className="w-full h-12 border-2 font-black uppercase tracking-tight gap-2">
                          <CheckCircle2 className="h-4 w-4" /> Marker Verbergen
                      </Button>
                      <Button variant="ghost" onClick={() => setArrivedObject(null)} className="w-full">Sluiten</Button>
                  </CardContent>
              </Card>
          </div>
      )}

      <div className={cn("absolute bottom-0 left-0 right-0 z-[80] w-full flex flex-col items-center", isMobile ? "px-3 pb-3" : "px-6 pb-6")}>
        {!isFollowing && (<Button onClick={() => setIsFollowing(true)} className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-2xl bg-primary text-white border-none hover:scale-110 active:scale-95 transition-all flex items-center justify-center mb-4"><LocateFixed className="h-6 w-6" /></Button>)}
        {isMobile ? (
            <div className="w-full flex flex-col items-center gap-3">
                <Card className={cn("w-full bg-white shadow-2xl border-none rounded-[32px] pt-2 pb-4 px-8 transition-all duration-300 ease-in-out cursor-pointer", isDrawerExpanded ? "max-h-[300px]" : "max-h-[110px]")} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}>
                    <div className="h-1.5 w-12 bg-slate-200 rounded-full mx-auto mb-3" />
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col items-center"><p className="text-2xl font-black text-black leading-none mb-1">{arrivalTime}</p><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">aankomst</p></div>
                        <div className="flex flex-col items-center"><p className="text-2xl font-black text-black leading-none mb-1">{durationMin}</p><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">min.</p></div>
                        <div className="flex flex-col items-center"><p className="text-2xl font-black text-black leading-none mb-1">{distanceKm}</p><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">km</p></div>
                    </div>
                    <div className={cn("mt-8 flex gap-4 transition-all duration-300", isDrawerExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none")}>
                        <Button variant="ghost" size="lg" className="h-14 w-14 rounded-full bg-blue-50 border-none shrink-0" onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}>{isPaused ? <Play className="h-6 w-6 fill-current text-primary" /> : <Pause className="h-6 w-6 fill-current text-primary" />}</Button>
                        <Button variant="destructive" size="lg" className="h-14 flex-1 rounded-full text-lg font-black uppercase tracking-tighter" onClick={(e) => { e.stopPropagation(); onExit(); }}>STOP RIT</Button>
                    </div>
                </Card>
            </div>
        ) : (
            <div className="w-full max-w-4xl flex items-end justify-between gap-4">
                <div className="flex gap-2 p-1.5 bg-white/95 backdrop-blur-xl rounded-full shadow-2xl border border-slate-100">
                    <Button variant="ghost" size="lg" className="h-14 w-14 rounded-full hover:bg-slate-50 transition-all flex items-center justify-center p-0" onClick={() => setIsPaused(!isPaused)}>{isPaused ? <Play className="h-7 w-7 fill-current text-primary" /> : <Pause className="h-7 w-7 fill-current text-primary" />}</Button>
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
  
  const initialType = searchParams.get('type') as 'veeg' | 'prullenbak' | 'meldingen' | null;
  const [routeType, setRouteType] = React.useState<'veeg' | 'prullenbak' | 'meldingen' | null>(initialType);
  
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('--nieuwe-route--');
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [objectsOnRoute, setObjectsOnRoute] = React.useState<MapObject[]>([]);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = React.useState(false);
  const [autoStartTimeoutReached, setAutoStartTimeoutReached] = React.useState(false);
  const [urlMeldingLocatie, setUrlMeldingLocatie] = React.useState<{ latitude: number; longitude: number; straat?: string } | null>(null);
  
  const mapRef = React.useRef<MapRef>(null);
  const autoStartAttempted = React.useRef(false);

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

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);

  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore || routeType !== 'meldingen') return null;
    return query(
      collection(firestore, 'meldingen'), 
      where('status', 'not-in', ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld'])
    );
  }, [firestore, routeType]);

  const { data: allMeldingen } = useCollection<Melding>(meldingenQuery);

  const selectedProject = React.useMemo(() => projects?.find(p => p.id === selectedProjectId) || null, [projects, selectedProjectId]);
  const availableRoutes = React.useMemo(() => {
      if (!selectedProject) return [];
      if (routeType === 'veeg') return selectedProject.veegroutes || [];
      if (routeType === 'prullenbak') return selectedProject.prullenbakkenroutes || [];
      return [];
  }, [selectedProject, routeType]);

  const selectedRouteDef = React.useMemo(() => {
    if (!selectedRouteId || selectedRouteId === '--nieuwe-route--' || !selectedProject) return null;
    const allRoutes = [...(selectedProject.veegroutes || []), ...(selectedProject.prullenbakkenroutes || [])];
    return allRoutes.find(r => r.id === selectedRouteId) || null;
  }, [selectedRouteId, selectedProject]);

  const objectsOnRouteQuery = useMemoFirebase(() => {
    if (!firestore || !selectedRouteDef) return null;
    return query(collection(firestore, 'objects'), where('locatieWerkgebieden', 'array-contains', selectedRouteDef.naam));
  }, [firestore, selectedRouteDef?.naam]);

  const { data: objectsOnMap } = useCollection<MapObject>(objectsOnRouteQuery);

  const routeGeoJSONFeatures = React.useMemo(() => {
    if (!selectedRouteDef) return null;
    try {
      const features = JSON.parse(selectedRouteDef.subGebieden);
      if (Array.isArray(features) && features.length > 0) return { type: 'FeatureCollection' as const, features: features.map((f: any) => ({ type: 'Feature' as const, properties: {}, geometry: f.geometry })) };
    } catch (e) {}
    return null;
  }, [selectedRouteDef]);

  const handleStartRoute = React.useCallback(async (simulate = false, useFixedStart = false) => {
    setIsSimulationMode(simulate);
    const predefinedStart = selectedRouteDef && 'startLatitude' in selectedRouteDef && (selectedRouteDef as any).startLatitude ? { latitude: (selectedRouteDef as any).startLatitude, longitude: (selectedRouteDef as any).startLongitude } : null;
    
    let startLoc = userLocation;
    if (useFixedStart) {
        startLoc = SIMULATION_START_LOCATION;
    } else if (simulate && predefinedStart) {
        startLoc = predefinedStart;
    } else if (!startLoc && predefinedStart) {
        startLoc = predefinedStart;
    } else if (simulate && !startLoc && objectsOnMap && objectsOnMap.length > 0) {
        startLoc = { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };
    }

    if (!startLoc && !simulate) {
        toast({ title: "Locatie vereist", description: "GPS vereist voor Live Rit.", variant: "destructive" });
        return;
    }

    setIsStarting(true);
    let sortedObjects: MapObject[] = [];
    
    if (routeType === 'meldingen' && allMeldingen) {
        if (allMeldingen.length === 0) { 
            toast({ title: "Geen meldingen", description: "Geen openstaande meldingen." }); 
            setIsStarting(false); 
            return; 
        }
        
        const startCoords = startLoc || { latitude: allMeldingen[0].latitude, longitude: allMeldingen[0].longitude };
        
        try {
            // Road distance sorting using Mapbox Matrix API
            const subset = allMeldingen.slice(0, 24);
            const points = [startCoords, ...subset.map(m => ({ longitude: m.longitude, latitude: m.latitude }))];
            const coordsString = points.map(p => `${p.longitude},${p.latitude}`).join(';');
            
            const matrixUrl = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordsString}?annotations=distance&access_token=${MAPBOX_TOKEN}`;
            const response = await fetch(matrixUrl);
            const data = await response.json();

            if (data.code === 'Ok' && data.distances) {
                let currentIndex = 0; 
                let unvisitedIndices = subset.map((_, i) => i + 1); 

                while (unvisitedIndices.length > 0) {
                    let nearestIndex = -1;
                    let minDistance = Infinity;

                    for (const idx of unvisitedIndices) {
                        const d = data.distances[currentIndex][idx];
                        if (d !== null && d < minDistance) {
                            minDistance = d;
                            nearestIndex = idx;
                        }
                    }

                    if (nearestIndex === -1) {
                        nearestIndex = unvisitedIndices[0];
                    }

                    const melding = subset[nearestIndex - 1];
                    sortedObjects.push({ 
                        id: melding.id, 
                        latitude: melding.latitude, 
                        longitude: melding.longitude, 
                        name: melding.intakenummer 
                    } as MapObject);

                    unvisitedIndices = unvisitedIndices.filter(i => i !== nearestIndex);
                    currentIndex = nearestIndex;
                }
                
                if (allMeldingen.length > 24) {
                    const remaining = allMeldingen.slice(24);
                    remaining.forEach(next => {
                        sortedObjects.push({ id: next.id, latitude: next.latitude, longitude: next.longitude, name: next.intakenummer } as MapObject);
                    });
                }
            } else {
                throw new Error("Matrix API non-OK response");
            }
        } catch (error) {
            console.warn("Road distance sort failed, falling back to straight-line:", error);
            const unvisited = [...allMeldingen];
            let currentPos = startCoords;
            while (unvisited.length > 0) {
                let nearestIdx = 0; let minD = Infinity;
                unvisited.forEach((u, i) => {
                    const d = turf.distance(turf.point([currentPos.longitude, currentPos.latitude]), turf.point([u.longitude, u.latitude]));
                    if (d < minD) { minD = d; nearestIdx = i; }
                });
                const next = unvisited.splice(nearestIdx, 1)[0];
                sortedObjects.push({ id: next.id, latitude: next.latitude, longitude: next.longitude, name: next.intakenummer } as MapObject);
                currentPos = { latitude: next.latitude, longitude: next.longitude };
            }
        }
        setTripStartLocation(startCoords);
    } else if (selectedRouteDef && objectsOnMap) {
        const startCoords = startLoc || { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };
        const unvisited = [...objectsOnMap]; let currentPos = startCoords;
        while (unvisited.length > 0) {
          let nearestIdx = 0; let minD = Infinity;
          unvisited.forEach((u, i) => {
            const d = turf.distance(turf.point([currentPos.longitude, currentPos.latitude]), turf.point([u.longitude, u.latitude]));
            if (d < minD) { minD = d; nearestIdx = i; }
          });
          const next = unvisited.splice(nearestIdx, 1)[0];
          sortedObjects.push(next); currentPos = { latitude: next.latitude, longitude: next.longitude };
        }
        setTripStartLocation(startCoords);
    } else if (urlMeldingLocatie) {
        sortedObjects = [{ id: 'Bestemming', latitude: urlMeldingLocatie.latitude, longitude: urlMeldingLocatie.longitude, name: urlMeldingLocatie.straat || 'Melding' }];
        setTripStartLocation(startLoc || { latitude: urlMeldingLocatie.latitude - 0.005, longitude: urlMeldingLocatie.longitude });
    }
    setObjectsOnRoute(sortedObjects); setNavigationState('navigating'); setIsStarting(false);
  }, [userLocation, selectedRouteDef, urlMeldingLocatie, routeType, allMeldingen, user, objectsOnMap, toast]);

  React.useEffect(() => {
    const isMeldingenRoute = routeType === 'meldingen';
    const isReadyToAutoStart = !!urlMeldingLocatie || (isMeldingenRoute && allMeldingen && allMeldingen.length > 0);

    if (isReadyToAutoStart && navigationState === 'setup' && !autoStartAttempted.current) {
      if (userLocation) {
        autoStartAttempted.current = true;
        handleStartRoute(false);
      } else {
        const timer = setTimeout(() => {
          if (!userLocation) {
            setAutoStartTimeoutReached(true);
          }
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [userLocation, urlMeldingLocatie, routeType, allMeldingen, navigationState, handleStartRoute]);

  const isAutoMeldingen = searchParams.get('type') === 'meldingen';
  const showSetupCard = !isAutoMeldingen && (!urlMeldingLocatie || userLocation || autoStartTimeoutReached);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {navigationState === 'navigating' ? (
        <NavigatingView objectsOnRoute={objectsOnRoute} onExit={() => { setNavigationState('setup'); setObjectsOnRoute([]); if (searchParams.has('lat')) router.back(); }} initialUserLocation={tripStartLocation} isSimulating={isSimulationMode} routeType={routeType} />
      ) : (
        <div className="w-full h-full relative">
          <MapGL ref={mapRef} initialViewState={{ longitude: userLocation?.longitude || 5.2913, latitude: userLocation?.latitude || 52.1326, zoom: userLocation ? 14 : 7 }} style={{ width: '100%', height: '100%' }} mapStyle={mapStyle} mapboxAccessToken={MAPBOX_TOKEN} onClick={e => { setUserLocation({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }); }}>
            {userLocation && (<Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center"><div className="relative flex flex-col items-center"><div className="absolute h-10 w-10 rounded-full bg-green-500/30 animate-ping" /><div className="relative h-8 w-8 rounded-full bg-green-600 border-4 border-white shadow-xl flex items-center justify-center"><MapPin className="h-4 w-4 text-white fill-current" /></div></div></Marker>)}
            {urlMeldingLocatie && (<Marker longitude={urlMeldingLocatie.longitude} latitude={urlMeldingLocatie.latitude} anchor="center"><div className="relative flex flex-col items-center"><div className="absolute h-12 w-12 rounded-full bg-blue-50/20 animate-pulse" /><div className="relative h-10 w-10 rounded-full bg-primary border-4 border-white shadow-2xl flex items-center justify-center"><Flag className="h-5 w-5 text-white fill-current" /></div></div></Marker>)}
            {routeGeoJSONFeatures && (<Source id="route-area" type="geojson" data={{ type: 'FeatureCollection', features: routeGeoJSONFeatures.features }}><Layer id="route-area-fill" type="fill" paint={{ 'fill-color': '#32ADE6', 'fill-opacity': 0.05 }} /><Layer id="route-area-outline" type="line" paint={{ 'line-color': '#32ADE6', 'line-width': 1, 'line-dasharray': [2, 2] }} /></Source>)}
            {objectsOnMap?.map(obj => (<Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude}><div className="w-4 h-4 bg-primary rounded-full border-2 border-white shadow-lg" /></Marker>))}
            {routeType === 'meldingen' && allMeldingen?.map(m => (<Marker key={m.id} longitude={m.longitude} latitude={m.latitude}><div className="w-5 h-5 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[8px] font-black text-white">!</div></Marker>))}
          </MapGL>
          
          {(autoStartTimeoutReached && !userLocation && isAutoMeldingen) && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
                <Card className="w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300 border-none rounded-3xl overflow-hidden">
                    <CardHeader className="text-center pb-2 bg-slate-900 text-white">
                        <div className="mx-auto bg-white/10 p-4 rounded-full w-20 h-20 flex items-center justify-center mb-4"><SignalLow className="h-10 w-10 text-white animate-pulse" /></div>
                        <CardTitle className="text-xl font-black uppercase tracking-tight text-white">Geen Locatie Gevonden</CardTitle>
                        <CardDescription className="text-slate-400 font-bold">We kunnen uw GPS-positie momenteel niet vaststellen.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 space-y-4 bg-white">
                        <p className="text-center text-sm font-medium text-slate-500 leading-relaxed">
                            Wilt u een simulatie starten vanaf de bedrijfslocatie om de werkbonnen te bekijken?
                        </p>
                        <Button onClick={() => handleStartRoute(true, true)} className="w-full h-14 bg-primary hover:bg-primary/90 text-sm font-black uppercase tracking-widest gap-2 shadow-xl shadow-primary/20">
                            <Sparkles className="h-5 w-5" /> Start Simulatie (Aarbergerweg)
                        </Button>
                        <Button variant="ghost" onClick={() => router.push('/')} className="w-full font-bold text-slate-400">
                            Terug naar Dashboard
                        </Button>
                    </CardContent>
                </Card>
            </div>
          )}

          {showSetupCard && (
            <Card className="absolute top-4 left-4 z-10 w-full max-w-[280px] shadow-2xl bg-white/95 backdrop-blur border-2 border-slate-100 rounded-2xl shadow-2xl p-4 hidden sm:block animate-in slide-in-from-left-4 duration-300">
                <CardHeader className="p-3 border-b bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="h-7 w-7 hover:bg-white rounded-full flex items-center justify-center">
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </Button>
                    <CardTitle className="text-sm font-black uppercase tracking-tighter">Navigatie Setup</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Project</Label>
                    <Select value={selectedProjectId || ''} onValueChange={v => setSelectedProjectId(v || null)} disabled={isLoadingProjects}>
                      <SelectTrigger className="h-8 border font-bold text-xs">
                        <SelectValue placeholder="Kies project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map(p => (
                          <SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!urlMeldingLocatie && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Type Inzet</Label>
                        <div className="grid grid-cols-3 gap-1">
                          <Button 
                            variant={routeType === 'veeg' ? 'default' : 'outline'} 
                            onClick={() => setRouteType('veeg')} 
                            disabled={!selectedProjectId} 
                            className={cn("font-black h-8 border text-[9px] p-1", routeType === 'veeg' ? "bg-primary border-primary text-white" : "border-slate-200")}
                          >
                            Veeg
                          </Button>
                          <Button 
                            variant={routeType === 'prullenbak' ? 'default' : 'outline'} 
                            onClick={() => setRouteType('prullenbak')} 
                            disabled={!selectedProjectId} 
                            className={cn("font-black h-8 border text-[9px] p-1", routeType === 'prullenbak' ? "bg-primary border-primary text-white" : "border-slate-200")}
                          >
                            Bakken
                          </Button>
                          <Button 
                            variant={routeType === 'meldingen' ? 'default' : 'outline'} 
                            onClick={() => setRouteType('meldingen')} 
                            disabled={!selectedProjectId} 
                            className={cn("font-black h-8 border text-[9px] p-1", routeType === 'meldingen' ? "bg-primary border-primary text-white" : "border-slate-200")}
                          >
                            Melding
                          </Button>
                        </div>
                      </div>

                      {routeType !== 'meldingen' && (
                        <div className="space-y-1">
                          <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Route Keuze</Label>
                          <Select onValueChange={setSelectedRouteId} value={selectedRouteId} disabled={!routeType}>
                            <SelectTrigger className="h-8 border font-bold text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="--nieuwe-route--">-- Kies een route --</SelectItem>
                              {availableRoutes.map((r: any) => (
                                <SelectItem key={r.id} value={r.id}>{r.naam}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex flex-col gap-1.5 pt-1">
                    <Button 
                      className="w-full h-9 text-xs font-black bg-primary hover:bg-primary/90 shadow-lg uppercase tracking-tighter" 
                      onClick={() => handleStartRoute(false)} 
                      disabled={(urlMeldingLocatie ? !userLocation : (routeType === 'meldingen' ? false : selectedRouteId === '--nieuwe-route--')) || isStarting}
                    >
                      {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Navigation className="mr-2 h-4 w-4 fill-current" />} 
                      {urlMeldingLocatie ? 'START RIT' : 'START LIVE RIT'}
                    </Button>
                    <div className="grid grid-cols-2 gap-1.5">
                      {isPrivileged && (
                        <Button 
                          variant="outline" 
                          className="h-8 border-slate-200 text-slate-600 font-black uppercase text-[9px]" 
                          onClick={() => setIsHistoryDialogOpen(true)}
                        >
                          <History className="mr-1.5 h-3 w-3" /> GESCHIEDENIS
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        className="h-8 border-dashed border-primary/30 text-primary font-black uppercase text-[9px]" 
                        onClick={() => handleStartRoute(true)} 
                        disabled={(urlMeldingLocatie ? false : (routeType === 'meldingen' ? false : selectedRouteId === '--nieuwe-route--')) || isStarting}
                      >
                        <Gauge className="mr-1.5 h-3 w-3" /> SIMULATOR
                      </Button>
                    </div>
                  </div>
                </CardContent>
            </Card>
          )}
        </div>
      )}
      {isPrivileged && (<RouteHistoryDialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen} projectId={selectedProjectId} />)}
    </div>
  );
}
