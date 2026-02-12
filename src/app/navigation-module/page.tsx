'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef } from 'react-map-gl';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
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
  ArrowUp, 
  Play, 
  CheckCircle2, 
  Pause, 
  MapPin, 
  Gauge, 
  Loader2,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  RotateCcw,
  RefreshCw,
  Navigation,
  X as XIcon,
  AlertTriangle,
  Home,
  LocateFixed,
  SignalLow,
  History,
  Navigation2,
  Volume2,
  MessageSquareWarning,
  Route as RouteIcon
} from 'lucide-react';
import { useProject } from '@/context/project-context';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Project, Route, Veegroute, Prullenbakkenroute, Object as MapObject } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import * as turf from '@turf/turf';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/firebase/profile-provider';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RouteHistoryDialog } from '@/components/route-history-dialog';
import { LoadingScreen } from '@/components/loading-screen';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { addSeconds, format as formatDate } from 'date-fns';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const routeLayer: Layer = {
  id: 'route',
  type: 'line',
  source: 'route-line',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    'line-color': '#3b82f6',
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
    'line-color': '#1d4ed8',
    'line-width': 14,
    'line-opacity': 0.3,
  },
};

function NavigatingView({ 
    objectsOnRoute, 
    onExit,
    initialUserLocation,
    isSimulating = false
}: { 
    objectsOnRoute: MapObject[], 
    onExit: () => void,
    initialUserLocation: { latitude: number; longitude: number; } | null,
    isSimulating?: boolean
}) {
  const mapRef = React.useRef<MapRef>(null);
  const isMobile = useIsMobile(768);
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
  const [offRouteSince, setOffRouteSince] = React.useState<number | null>(null);
  const [throttledGeometry, setThrottledGeometry] = React.useState<any>(null);
  
  // Drawer state for mobile
  const [isDrawerExpanded, setIsDrawerExpanded] = React.useState(false);
  const touchStartY = React.useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartY.current - touchEndY;

    if (deltaY > 50) { // Swipe up
      setIsDrawerExpanded(true);
    } else if (deltaY < -50) { // Swipe down
      setIsDrawerExpanded(false);
    }
    touchStartY.current = null;
  };

  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const { toast } = useToast();
  
  const [viewState, setViewState] = React.useState({
    pitch: 65,
    bearing: 0,
    zoom: 18.5,
    latitude: initialUserLocation?.latitude || 52.1326,
    longitude: initialUserLocation?.longitude || 5.2913,
  });

  const animationRef = React.useRef<number | null>(null);
  const simStateRef = React.useRef({
    distanceTravelled: 0,
    currentSpeedMs: 0,
    targetSpeedMs: 13.8,
    lastTimestamp: 0
  });

  const nextObject = objectsOnRoute[currentObjectIndex];

  // POSITION SMOOTHING & INTERPOLATION (60FPS LOOP)
  React.useEffect(() => {
    let lastTime = performance.now();
    
    const animateSmoothly = (time: number) => {
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;

        if (targetLocation && smoothLocation && !isPaused) {
            const lerpFactor = isSimulating ? 1 : 0.15; 
            
            const newLat = smoothLocation.latitude + (targetLocation.latitude - smoothLocation.latitude) * lerpFactor;
            const newLng = smoothLocation.longitude + (targetLocation.longitude - smoothLocation.longitude) * lerpFactor;
            
            let diff = (targetLocation.heading || 0) - (smoothLocation.heading || 0);
            while (diff < -180) diff += 360;
            while (diff > 180) diff -= 360;
            const newHeading = (smoothLocation.heading || 0) + diff * (lerpFactor * 0.5);

            const newSmooth = {
                latitude: newLat,
                longitude: newLng,
                speed: targetLocation.speed,
                heading: newHeading
            };

            setSmoothLocation(newSmooth);

            if (isFollowing && !arrivedObject) {
                const currentSpeedKmh = (targetLocation.speed || 0) * 3.6;
                const targetZoom = Math.max(15, 18.5 - (Math.min(currentSpeedKmh, 80) / 30));
                
                setViewState(prev => ({
                    ...prev,
                    latitude: newLat,
                    longitude: newLng,
                    bearing: newHeading,
                    zoom: prev.zoom + (targetZoom - prev.zoom) * 0.05,
                    pitch: 65,
                }));
            }
        }
        animationRef.current = requestAnimationFrame(animateSmoothly);
    };

    animationRef.current = requestAnimationFrame(animateSmoothly);
    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [targetLocation, smoothLocation, isFollowing, isPaused, arrivedObject, isSimulating]);

  // ROAD SNAPPING
  const snappedLocation = React.useMemo(() => {
    if (!smoothLocation || !currentRouteGeometry) return smoothLocation;
    try {
        const coords = currentRouteGeometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return smoothLocation;
        
        const line = turf.lineString(coords);
        const pt = turf.point([smoothLocation.longitude, smoothLocation.latitude]);
        const snapped = turf.nearestPointOnLine(line, pt, { units: 'meters' });
        
        if (snapped.properties.dist! < 35) {
            return {
                ...smoothLocation,
                latitude: snapped.geometry.coordinates[1],
                longitude: snapped.geometry.coordinates[0]
            };
        }
    } catch (e) {}
    return smoothLocation;
  }, [smoothLocation, currentRouteGeometry]);

  // REROUTING LOGIC
  React.useEffect(() => {
    if (!targetLocation || !currentRouteGeometry || isCalculatingRoute || isSimulating) return;
    
    if (targetLocation.latitude === 52.1326 && targetLocation.longitude === 5.2913) return;

    try {
        const coords = currentRouteGeometry.coordinates;
        const line = turf.lineString(coords);
        const pt = turf.point([targetLocation.longitude, targetLocation.latitude]);
        const snapped = turf.nearestPointOnLine(line, pt, { units: 'meters' });
        const distance = snapped.properties.dist || 0;

        if (distance > 60) { 
            if (!offRouteSince) {
                setOffRouteSince(Date.now());
            } else if (Date.now() - offRouteSince > 4000) { 
                setCurrentRouteGeometry(null);
                setOffRouteSince(null);
                lastFetchedTargetId.current = null;
            }
        } else {
            setOffRouteSince(null);
        }
    } catch (e) {}
  }, [targetLocation?.latitude, targetLocation?.longitude, currentRouteGeometry, isCalculatingRoute, offRouteSince, isSimulating]);

  const navHudData = React.useMemo(() => {
    if (!currentLeg?.steps) return null;
    
    const totalLegDist = currentLeg.distance;
    const distTravelled = Math.max(0, totalLegDist - distanceRemainingToDestination);
    
    let cumulativeDistance = 0;
    for (let i = 0; i < currentLeg.steps.length; i++) {
      const step = currentLeg.steps[i];
      cumulativeDistance += step.distance;
      
      if (distTravelled < cumulativeDistance) {
        const distanceToManeuver = cumulativeDistance - distTravelled;
        const currentStep = currentLeg.steps[i];
        const nextStep = currentLeg.steps[i + 1];
        
        return {
          distance: distanceToManeuver,
          instruction: nextStep ? nextStep.maneuver.instruction : currentStep.maneuver.instruction,
          step: nextStep || currentStep
        };
      }
    }
    return null;
  }, [currentLeg, distanceRemainingToDestination]);

  // ROUTE CONSUMPTION (DISAPPEARING LINE)
  React.useEffect(() => {
    if (!currentRouteGeometry || isCalculatingRoute || !snappedLocation) {
        setThrottledGeometry(null);
        return;
    }

    try {
        const coords = currentRouteGeometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        
        const line = turf.lineString(coords);
        const startPoint = turf.point([snappedLocation.longitude, snappedLocation.latitude]);
        const endPoint = turf.point(coords[coords.length - 1]);
        
        const sliced = turf.lineSlice(startPoint, endPoint, line);
        
        setThrottledGeometry({
            type: 'Feature' as const,
            properties: {},
            geometry: sliced.geometry
        });
    } catch (e) {
        setThrottledGeometry({
            type: 'Feature' as const,
            properties: {},
            geometry: currentRouteGeometry
        });
    }
  }, [currentRouteGeometry, isCalculatingRoute, snappedLocation?.longitude, snappedLocation?.latitude]);

  // LIVE GPS WATCHER
  React.useEffect(() => {
    if (isSimulating) return;
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGpsError(null);
        const { latitude, longitude, speed, heading } = position.coords;
        const speedMs = speed || 0;
        
        setTargetLocation(prev => ({
            latitude,
            longitude,
            speed: speedMs,
            heading: heading !== null ? heading : (prev?.heading ?? 0)
        }));
      },
      (error) => {
        if (error.code === 1) setGpsError('permission');
        else setGpsError('signal');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSimulating]);

  // UPDATE REMAINING DISTANCE
  React.useEffect(() => {
    if (!targetLocation || !currentRouteGeometry || isSimulating) return;
    try {
        const coords = currentRouteGeometry.coordinates;
        const line = turf.lineString(coords);
        const totalDist = turf.length(line, { units: 'meters' });
        const userPoint = turf.point([targetLocation.longitude, targetLocation.latitude]);
        const snapped = turf.nearestPointOnLine(line, userPoint);
        const distToStart = turf.length(turf.lineSlice(turf.point(coords[0]), snapped, line), { units: 'meters' });
        const remaining = Math.max(0, totalDist - distToStart);
        setDistanceRemainingToDestination(remaining);
        setHasReachedCurrentTarget(remaining < 80);
    } catch (e) {}
  }, [targetLocation?.latitude, targetLocation?.longitude, currentRouteGeometry, isSimulating]);

  // SIMULATION MODE ANIMATION
  React.useEffect(() => {
    if (!isSimulating || !currentRouteGeometry || !nextObject || arrivedObject || isCalculatingRoute) return;

    const coords = currentRouteGeometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;

    let line: any;
    try {
        line = turf.lineString(coords);
    } catch (e) { return; }
    
    const totalDistance = turf.length(line, { units: 'meters' });
    if (totalDistance <= 0) return;

    const runSimulation = (timestamp: number) => {
        if (isPaused || arrivedObject || isCalculatingRoute || !currentRouteGeometry) {
            simStateRef.current.lastTimestamp = timestamp;
            animationRef.current = requestAnimationFrame(runSimulation);
            return;
        }

        if (!simStateRef.current.lastTimestamp) simStateRef.current.lastTimestamp = timestamp;
        const deltaTime = Math.min((timestamp - simStateRef.current.lastTimestamp) / 1000, 0.1);
        simStateRef.current.lastTimestamp = timestamp;

        const distanceToDestination = totalDistance - simStateRef.current.distanceTravelled;
        simStateRef.current.targetSpeedMs = distanceToDestination < 40 ? 3 : 13.8;

        const accel = simStateRef.current.targetSpeedMs > simStateRef.current.currentSpeedMs ? 4 : 8;
        simStateRef.current.currentSpeedMs += (simStateRef.current.targetSpeedMs - simStateRef.current.currentSpeedMs) * deltaTime * accel;
        simStateRef.current.distanceTravelled += simStateRef.current.currentSpeedMs * deltaTime;
        
        const remaining = Math.max(0, totalDistance - simStateRef.current.distanceTravelled);
        setDistanceRemainingToDestination(remaining);

        if (simStateRef.current.distanceTravelled >= totalDistance - 0.2) {
            const finalCoord = coords[coords.length - 1];
            setTargetLocation({ latitude: finalCoord[1], longitude: finalCoord[0], speed: 0, heading: 0 });
            setHasReachedCurrentTarget(true);
            return;
        } 
        
        setHasReachedCurrentTarget(remaining < 80);

        try {
            const currentPoint = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
            const lookAheadPoint = turf.along(line, Math.min(simStateRef.current.distanceTravelled + 5, totalDistance), { units: 'meters' });
            
            const [lng, lat] = currentPoint.geometry.coordinates;
            const heading = (turf.bearing(currentPoint, lookAheadPoint) + 360) % 360;

            setTargetLocation({ latitude: lat, longitude: lng, speed: simStateRef.current.currentSpeedMs, heading: heading });
        } catch (e) {}

        animationRef.current = requestAnimationFrame(runSimulation);
    };

    animationRef.current = requestAnimationFrame(runSimulation);
    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSimulating, isPaused, arrivedObject, currentRouteGeometry, nextObject?.id, isCalculatingRoute]);

  // ROUTE CALCULATION FETCH
  const lastFetchedTargetId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!targetLocation || !nextObject || arrivedObject || isCalculatingRoute) return;
    
    if (lastFetchedTargetId.current === nextObject.id && currentRouteGeometry) return;

    const fetchRoute = async () => {
      setIsCalculatingRoute(true);
      lastFetchedTargetId.current = nextObject.id;
      const { longitude, latitude } = targetLocation;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${longitude},${latitude};${nextObject.longitude},${nextObject.latitude}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}&language=nl`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          setCurrentRouteGeometry(route.geometry);
          setCurrentLeg(route.legs[0]);
          setDistanceRemainingToDestination(route.legs[0].distance);
          setHasReachedCurrentTarget(route.legs[0].distance < 80);
          
          if (isSimulating) {
              simStateRef.current.distanceTravelled = 0;
              simStateRef.current.currentSpeedMs = 0;
          }
        }
      } catch (error) {
          console.error("Failed to fetch route:", error);
      } finally {
          setIsCalculatingRoute(false);
      }
    };
    fetchRoute();
  }, [nextObject?.id, arrivedObject, isSimulating, targetLocation?.latitude, targetLocation?.longitude, currentRouteGeometry, isCalculatingRoute]);
  
  const handleArrivedAction = (type: 'finish' | 'issue') => {
    if (!arrivedObject) return;
    const finishedId = arrivedObject.id;
    setCompletedObjects(prev => [...prev, finishedId]);
    setArrivedObject(null);
    setHasReachedCurrentTarget(false);
    
    const remaining = objectsOnRoute.filter(obj => !completedObjects.includes(obj.id) && obj.id !== finishedId);
    if (remaining.length > 0) {
        const currentPt = turf.point([targetLocation!.longitude, targetLocation!.latitude]);
        let nextIdx = 0;
        let minDist = Infinity;
        objectsOnRoute.forEach((obj, idx) => {
            if (!completedObjects.includes(obj.id) && obj.id !== finishedId) {
                const d = turf.distance(currentPt, turf.point([obj.longitude, obj.latitude]));
                if (d < minDist) { minDist = d; nextIdx = idx; }
            }
        });
        setCurrentObjectIndex(nextIdx);
    } else {
        setCurrentObjectIndex(objectsOnRoute.length); 
    }

    setCurrentRouteGeometry(null);
    setCurrentLeg(null);
    lastFetchedTargetId.current = null;
    if (isSimulating) {
        simStateRef.current = { distanceTravelled: 0, currentSpeedMs: 0, targetSpeedMs: 13.8, lastTimestamp: 0 };
    }
  };

  const speedKmh = targetLocation?.speed ? Math.round(targetLocation.speed * 3.6) : 0;
  
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

  const distanceKm = React.useMemo(() => {
    return (distanceRemainingToDestination / 1000).toFixed(1);
  }, [distanceRemainingToDestination]);

  if (currentObjectIndex >= objectsOnRoute.length && objectsOnRoute.length > 0 && !arrivedObject && !isCalculatingRoute) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-background p-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h1 className="text-3xl font-black tracking-tight uppercase">Route Voltooid!</h1>
            <p className="text-muted-foreground font-medium">Alle prullenbakken zijn bezocht.</p>
            <Button onClick={onExit} size="lg" className="px-10 h-14 text-lg font-bold uppercase tracking-tighter mt-4">Terug naar Overzicht</Button>
        </div>
    )
  }

  if (isCalculatingRoute && !currentRouteGeometry) {
    return <LoadingScreen message="Route berekenen..." />;
  }

  return (
    <div className="w-full h-full relative bg-slate-100 overflow-hidden">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={evt => {
            setViewState(evt.viewState);
            if (evt.viewState.latitude !== viewState.latitude || evt.viewState.longitude !== viewState.longitude) {
                if (isFollowing) setIsFollowing(false);
            }
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {smoothLocation && (
          <Marker 
            longitude={smoothLocation.longitude} 
            latitude={smoothLocation.latitude} 
            anchor="center"
            rotation={isFollowing ? 0 : (smoothLocation.heading || 0)} 
          >
            <div className="relative flex items-center justify-center">
                <div className="absolute h-16 w-16 bg-blue-500/20 rounded-full animate-pulse" />
                <div className="h-12 w-12 bg-blue-600 rounded-full border-[4px] border-white shadow-2xl flex items-center justify-center transition-transform duration-75">
                    <Navigation2 className="h-7 w-7 text-white fill-current rotate-[45deg]" />
                </div>
            </div>
          </Marker>
        )}

        {objectsOnRoute.map((obj, idx) => {
            if (completedObjects.includes(obj.id)) return null;
            const isTarget = idx === currentObjectIndex;
            const inRange = isTarget && hasReachedCurrentTarget;

            return (
                <Marker 
                    key={obj.id} 
                    longitude={obj.longitude} 
                    latitude={obj.latitude} 
                    anchor="center"
                    onClick={(e) => {
                        e.originalEvent.stopPropagation();
                        const dist = turf.distance(turf.point([targetLocation!.longitude, targetLocation!.latitude]), turf.point([obj.longitude, obj.latitude]), { units: 'meters' });
                        if (dist <= 150) setArrivedObject(obj);
                        else toast({ title: "Buiten bereik", description: `Rijd eerst dichterbij (${Math.round(dist)}m).` });
                    }}
                >
                    <div className={cn(
                        "w-8 h-8 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-[10px] font-black text-white transition-all cursor-pointer hover:scale-110",
                        isTarget ? "bg-blue-600 scale-125 ring-4 ring-blue-500/30" : "bg-slate-400",
                        inRange && "bg-green-600 ring-green-500/50"
                    )}>
                        {inRange && <div className="absolute inset-0 rounded-full animate-ping bg-green-400 opacity-75" />}
                        {idx + 1}
                    </div>
                </Marker>
            );
        })}

        {throttledGeometry && (
          <Source id="route-line" type="geojson" data={throttledGeometry}>
            <Layer {...routeLayerCasing} />
            <Layer {...routeLayer} />
          </Source>
        )}
      </MapGL>
      
      {/* HUD - Top Area (Black Nav Card) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[70] w-[92%] max-w-lg flex flex-col gap-3">
        {navHudData && !arrivedObject && !isCalculatingRoute && (
            <Card className="bg-black text-white shadow-2xl border-none overflow-hidden animate-in slide-in-from-top duration-300 rounded-[28px] py-4">
                <CardContent className="p-4 flex items-center gap-6">
                    <div className="bg-white/10 p-3 rounded-2xl">
                        <Navigation2 className="h-10 w-10 text-white fill-current" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-2xl font-black tracking-tight leading-none mb-1">
                            {navHudData.instruction.split(' op ')[0] || 'Navigeer'} op
                        </p>
                        <p className="text-3xl font-black tracking-tighter leading-tight truncate">
                            {navHudData.instruction.split(' op ')[1] || 'de weg'}
                        </p>
                    </div>
                </CardContent>
                <div className="h-1.5 w-12 bg-white/20 rounded-full mx-auto -mb-2 mt-2" />
            </Card>
        )}

        {gpsError && (
            <Alert variant="destructive" className="bg-red-600 text-white border-none shadow-2xl animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-3">
                    {gpsError === 'permission' ? <XIcon className="h-5 w-5" /> : <SignalLow className="h-5 w-5 animate-pulse" />}
                    <div>
                        <AlertTitle className="font-black uppercase tracking-tight text-[10px] md:text-xs">
                            {gpsError === 'permission' ? 'Locatie Toegang Geweigerd' : 'Zwak GPS Signaal'}
                        </AlertTitle>
                        <AlertDescription className="text-[9px] md:text-[10px] opacity-90 font-bold">
                            {gpsError === 'permission' ? 'Schakel locatietoegang in bij instellingen.' : 'Uw locatie wordt gezocht...'}
                        </AlertDescription>
                    </div>
                </div>
            </Alert>
        )}
      </div>

      {arrivedObject && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
              <Card className="w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                  <CardHeader className="text-center pb-2">
                      <div className="mx-auto bg-green-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                          <MapPin className="h-8 w-8 text-green-600 fill-current" />
                      </div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Bestemming Bereikt</CardTitle>
                      <CardDescription className="font-bold text-slate-500">Unit ID: <span className="text-slate-900">{arrivedObject.id}</span></CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 pt-2 space-y-3">
                      <Button onClick={() => handleArrivedAction('finish')} className="w-full h-14 bg-green-600 hover:bg-green-700 text-lg font-black uppercase tracking-tight gap-2">
                          <CheckCircle2 className="h-5 w-5" /> Afronden & Door
                      </Button>
                      <Button variant="outline" onClick={() => handleArrivedAction('issue')} className="w-full h-12 border-2 border-orange-200 text-orange-600 hover:bg-orange-50 font-black uppercase tracking-tight gap-2">
                          <AlertTriangle className="h-4 w-4" /> Issue Melden
                      </Button>
                      <Button variant="ghost" onClick={() => setArrivedObject(null)} className="w-full">Sluiten</Button>
                  </CardContent>
              </Card>
          </div>
      )}

      {/* Navigation Toolbar - Bottom Drawer */}
      <div className={cn(
          "absolute bottom-0 left-0 right-0 z-[80] w-full flex flex-col items-center",
          isMobile ? "px-0" : "px-6 pb-6"
      )}>
        {!isFollowing && (
            <Button onClick={() => setIsFollowing(true)} className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-2xl bg-primary text-white border-none hover:scale-110 active:scale-95 transition-all flex items-center justify-center mb-4">
                <LocateFixed className="h-6 w-6" />
            </Button>
        )}

        {isMobile ? (
            <Card 
                className={cn(
                    "w-full bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-none rounded-t-[40px] pt-2 pb-8 px-8 transition-all duration-300 ease-in-out cursor-pointer",
                    isDrawerExpanded ? "max-h-[300px]" : "max-h-[140px]"
                )}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
            >
                <div className="h-1.5 w-12 bg-slate-200 rounded-full mx-auto mb-6" />
                <div className="flex items-center justify-between">
                    <div className="flex flex-col items-center">
                        <p className="text-2xl font-black text-black leading-none mb-1">{arrivalTime}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">aankomst</p>
                    </div>
                    <div className="flex flex-col items-center">
                        <p className="text-2xl font-black text-black leading-none mb-1">{durationMin}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">min.</p>
                    </div>
                    <div className="flex flex-col items-center">
                        <p className="text-2xl font-black text-black leading-none mb-1">{distanceKm}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">km</p>
                    </div>
                </div>
                
                <div className={cn(
                    "mt-8 flex gap-4 transition-all duration-300",
                    isDrawerExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
                )}>
                    <Button 
                        variant="ghost" 
                        size="lg" 
                        className="h-14 w-14 rounded-full bg-slate-50 border-none shrink-0" 
                        onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}
                    >
                        {isPaused ? <Play className="h-6 w-6 fill-current text-blue-600" /> : <Pause className="h-6 w-6 fill-current text-blue-600" />}
                    </Button>
                    <Button 
                        variant="destructive" 
                        size="lg" 
                        className="h-14 flex-1 rounded-full text-lg font-black uppercase tracking-tighter" 
                        onClick={(e) => { e.stopPropagation(); onExit(); }}
                    >
                        STOP RIT
                    </Button>
                </div>
            </Card>
        ) : (
            <div className="w-full max-w-4xl flex items-end justify-between gap-4">
                <Card className="shadow-2xl bg-white/95 backdrop-blur-xl border-none overflow-hidden w-40">
                    <CardContent className="p-0">
                        <div className="bg-slate-50 border-b p-2 flex justify-between items-center px-3">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Snelheid</span>
                            <Badge variant="outline" className="text-[8px] font-black text-blue-600 border-blue-200 h-4 px-1">MAX 50</Badge>
                        </div>
                        <div className="p-3 flex items-baseline gap-1 justify-center">
                            <span className="font-black tracking-tighter tabular-nums text-slate-900 text-5xl">{speedKmh}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase">km/h</span>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex gap-2 p-1.5 bg-white/95 backdrop-blur-xl rounded-full shadow-2xl border border-slate-100">
                    <Button variant="ghost" size="lg" className="h-14 w-14 rounded-full hover:bg-slate-50 transition-all flex items-center justify-center p-0" onClick={() => setIsPaused(!isPaused)}>
                        {isPaused ? <Play className="h-7 w-7 fill-current text-blue-600" /> : <Pause className="h-7 w-7 fill-current text-blue-600" />}
                    </Button>
                    <Button variant="destructive" size="lg" className="h-14 w-14 rounded-full shadow-xl border-none hover:scale-105 active:scale-95 transition-all flex items-center justify-center p-0" onClick={onExit}>
                        <XIcon className="h-7 w-7" />
                    </Button>
                </div>

                <Card className="bg-white/95 backdrop-blur-xl border-none shadow-2xl overflow-hidden w-64">
                    <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Aankomst: {arrivalTime}</p>
                                <p className="text-lg font-black text-slate-900 leading-none">{durationMin} min <span className="text-slate-300">/ {distanceKm} km</span></p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Voortgang</p>
                                <p className="text-xs font-black text-blue-600">{completedObjects.length}/{objectsOnRoute.length}</p>
                            </div>
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
  const isSuperUser = profile?.role === 'Super admin';
  const isPrivileged = isSuperUser || profile?.role === 'toezichthouder';
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number }>({ latitude: 52.1326, longitude: 5.2913 });
  const [routeType, setRouteType] = React.useState<'veeg' | 'prullenbak' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('--nieuwe-route--');
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [objectsOnRoute, setObjectsOnRoute] = React.useState<MapObject[]>([]);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = React.useState(false);
  
  const mapRef = React.useRef<MapRef>(null);

  React.useEffect(() => {
    if (navigationState === 'navigating') setIsHeaderVisible(false);
    else setIsHeaderVisible(true);
    return () => setIsHeaderVisible(true);
  }, [navigationState, setIsHeaderVisible]);

  // Optimized GPS Initial Lock
  React.useEffect(() => {
    if (!navigator.geolocation) return;

    // Fast initial rough location
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        null,
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );

    // Continuous precise watch
    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        (err) => console.warn("Location error:", err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  React.useEffect(() => {
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const projectIdFromUrl = searchParams.get('projectId');
    
    if (projectIdFromUrl && selectedProjectId !== projectIdFromUrl) {
        setSelectedProjectId(projectIdFromUrl);
    }

    if (lat && lng && navigationState !== 'navigating') {
      const meldingObject: MapObject = { 
          id: `Bestemming`, 
          latitude: parseFloat(lat), 
          longitude: parseFloat(lng),
          name: searchParams.get('straat') || 'Bestemming'
      };
      setObjectsOnRoute([meldingObject]);
      setNavigationState('navigating');
    }
  }, [searchParams, selectedProjectId, setSelectedProjectId, navigationState]);

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);

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

  const routeGeoJSON = React.useMemo(() => {
    if (!selectedRouteDef) return null;
    try {
      const features = JSON.parse(selectedRouteDef.subGebieden);
      if (Array.isArray(features) && features.length > 0) {
        return { type: 'FeatureCollection' as const, features: features.map((f: any) => ({ type: 'Feature' as const, properties: {}, geometry: f.geometry })) };
      }
    } catch (e) {}
    return null;
  }, [selectedRouteDef]);

  React.useEffect(() => {
      const map = mapRef.current?.getMap();
      if (!map || !selectedRouteDef) return;
      const fit = () => {
          let features: any[] = [];
          if (routeGeoJSON?.features) features = [...features, ...routeGeoJSON.features];
          if (objectsOnMap && objectsOnMap.length > 0) features = [...features, ...objectsOnMap.map(obj => turf.point([obj.longitude, obj.latitude]))];
          if (selectedRouteDef && 'startLatitude' in selectedRouteDef && (selectedRouteDef as any).startLatitude && (selectedRouteDef as any).startLongitude) {
              features.push(turf.point([(selectedRouteDef as any).startLongitude, (selectedRouteDef as any).startLatitude]));
          }
          if (features.length > 0) {
              try {
                  const collection = turf.featureCollection(features);
                  const bbox = turf.bbox(collection);
                  if (bbox[0] !== Infinity) map.fitBounds(bbox as [number, number, number, number], { padding: 100, duration: 1000, maxZoom: 16 });
              } catch(e) {}
          }
      };
      if (map.isStyleLoaded()) fit();
      else map.once('style.load', fit);
  }, [selectedRouteId, routeGeoJSON, objectsOnMap, selectedRouteDef]);

  const handleStartRoute = async (simulate = false) => {
    setIsSimulationMode(simulate);
    const predefinedStart = selectedRouteDef && 'startLatitude' in selectedRouteDef && (selectedRouteDef as any).startLatitude && (selectedRouteDef as any).startLongitude
        ? { latitude: (selectedRouteDef as any).startLatitude, longitude: (selectedRouteDef as any).startLongitude } : null;

    let startLoc = userLocation;
    if (simulate && predefinedStart) startLoc = predefinedStart;
    else if (!startLoc && predefinedStart) startLoc = predefinedStart;
    else if (simulate && !startLoc && objectsOnMap && objectsOnMap.length > 0) startLoc = { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };
    
    if (!startLoc && !simulate) { toast({ title: "Locatie vereist", description: "GPS vereist voor Live Rit.", variant: "destructive" }); return; }
    if (!selectedProjectId || !selectedRouteDef || !objectsOnMap || !user) return;
    
    setIsStarting(true);
    if (objectsOnMap.length === 0) { toast({ title: "Geen objecten", description: "Deze route is leeg." }); setIsStarting(false); return; }
    
    const startCoords = startLoc || { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };

    const unvisited = [...objectsOnMap];
    const sortedObjects: MapObject[] = [];
    let currentPos = startCoords;
    while (unvisited.length > 0) {
      let nearestIdx = 0; let minD = Infinity;
      unvisited.forEach((u, i) => {
        const d = turf.distance(turf.point([currentPos.longitude, currentPos.latitude]), turf.point([u.longitude, u.latitude]));
        if (d < minD) { minD = d; nearestIdx = i; }
      });
      const next = unvisited.splice(nearestIdx, 1)[0];
      sortedObjects.push(next);
      currentPos = { latitude: next.latitude, longitude: next.longitude };
    }
    
    setObjectsOnRoute(sortedObjects);
    setNavigationState('navigating');
    setIsStarting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {navigationState === 'navigating' ? (
        <NavigatingView objectsOnRoute={objectsOnRoute} onExit={() => { setNavigationState('setup'); setObjectsOnRoute([]); if (searchParams.has('lat')) router.back(); }} initialUserLocation={userLocation} isSimulating={isSimulationMode} />
      ) : (
        <div className="w-full h-full relative">
          <MapGL ref={mapRef} initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 7 }} style={{ width: '100%', height: '100%' }} mapStyle={mapStyle} mapboxAccessToken={MAPBOX_TOKEN} onClick={e => setUserLocation({ latitude: e.lngLat.lat, longitude: e.lngLat.lng })} interactive={true}>
            {userLocation && (
              <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
                <div className="relative flex flex-col items-center">
                  <div className="absolute h-10 w-10 rounded-full bg-green-500/30 animate-ping" />
                  <div className="relative h-8 w-8 rounded-full bg-green-600 border-4 border-white shadow-xl flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-white fill-current" />
                  </div>
                </div>
              </Marker>
            )}
            {selectedRouteDef && 'startLatitude' in selectedRouteDef && (selectedRouteDef as any).startLatitude && (selectedRouteDef as any).startLongitude && (
                <Marker longitude={(selectedRouteDef as any).startLongitude} latitude={(selectedRouteDef as any).startLatitude} anchor="center">
                    <div className="relative flex flex-col items-center">
                        <div className="absolute h-12 w-12 rounded-full bg-blue-500/20 animate-pulse" />
                        <div className="relative h-10 w-10 rounded-full bg-blue-600 border-4 border-white shadow-2xl flex items-center justify-center">
                            <Home className="h-5 w-5 text-white fill-current" />
                        </div>
                        <div className="mt-1 bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-tighter">Startpunt</div>
                    </div>
                </Marker>
            )}
            {routeGeoJSON && (
                <Source id="route-area" type="geojson" data={routeGeoJSON}>
                    <Layer id="route-area-fill" type="fill" paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.05 }} />
                    <Layer id="route-area-outline" type="line" paint={{ 'line-color': '#3b82f6', 'line-width': 1, 'line-dasharray': [2, 2] }} />
                </Source>
            )}
            {objectsOnMap?.map(obj => (
                <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude}>
                    <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg" />
                </Marker>
            ))}
          </MapGL>
          <Card className="absolute top-4 left-4 z-10 w-full max-w-[280px] shadow-2xl bg-white/95 backdrop-blur border-2 border-slate-100">
            <CardHeader className="p-3 border-b bg-slate-50/50">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="h-7 w-7 hover:bg-white rounded-full flex items-center justify-center"><ArrowLeft className="h-3.5 w-3.5" /></Button>
                <CardTitle className="text-sm font-black uppercase tracking-tighter">Navigatie Setup</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Project</Label>
                <Select value={selectedProjectId || ''} onValueChange={v => setSelectedProjectId(v || null)} disabled={isLoadingProjects}>
                  <SelectTrigger className="h-8 border font-bold text-xs"><SelectValue placeholder="Selecteer project" /></SelectTrigger>
                  <SelectContent>{projects?.map(p => <SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Type Inzet</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant={routeType === 'veeg' ? 'default' : 'outline'} onClick={() => setRouteType('veeg')} disabled={!selectedProjectId} className={cn("font-black h-8 border text-[10px]", routeType === 'veeg' ? "bg-blue-600 border-blue-600 shadow-md text-white" : "border-slate-200")}>Veegwagen</Button>
                  <Button variant={routeType === 'prullenbak' ? 'default' : 'outline'} onClick={() => setRouteType('prullenbak')} disabled={!selectedProjectId} className={cn("font-black h-8 border text-[10px]", routeType === 'prullenbak' ? "bg-blue-600 border-blue-600 shadow-md text-white" : "border-slate-200")}>Prullenbakken</Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Route Keuze</Label>
                <Select onValueChange={setSelectedRouteId} value={selectedRouteId} disabled={!routeType}>
                    <SelectTrigger className="h-8 border font-bold text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="--nieuwe-route--">-- Kies een route --</SelectItem>
                        {availableRoutes.map((r: any) => (
                            <SelectItem key={r.id} value={r.id}>{r.naam}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <Button className="w-full h-9 text-xs font-black bg-blue-600 hover:bg-blue-700 shadow-lg rounded-lg uppercase tracking-tighter flex items-center justify-center text-white" onClick={() => handleStartRoute(false)} disabled={!selectedRouteId || selectedRouteId === '--nieuwe-route--' || isStarting}>
                    {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Navigation className="mr-2 h-4 w-4 fill-current" />} START LIVE RIT
                </Button>
                <div className="grid grid-cols-2 gap-1.5">
                    {isPrivileged && (
                        <Button variant="outline" className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 font-black uppercase tracking-tighter rounded-lg flex items-center justify-center text-[9px]" onClick={() => setIsHistoryDialogOpen(true)}>
                            <History className="mr-1.5 h-3 w-3" /> GESCHIEDENIS
                        </Button>
                    )}
                    {isSuperUser && (
                        <Button variant="outline" className="h-8 border-dashed border-blue-200 text-blue-600 hover:bg-blue-50/50 font-black uppercase tracking-tighter rounded-lg flex items-center justify-center text-[9px]" onClick={() => handleStartRoute(true)} disabled={!selectedRouteId || selectedRouteId === '--nieuwe-route--' || isStarting}>
                            <Gauge className="mr-1.5 h-3 w-3" /> SIMULATOR
                        </Button>
                    )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {isPrivileged && (
          <RouteHistoryDialog
            open={isHistoryDialogOpen}
            onOpenChange={isHistoryDialogOpen => setIsHistoryDialogOpen(isHistoryDialogOpen)}
            projectId={selectedProjectId}
          />
      )}
    </div>
  );
}
