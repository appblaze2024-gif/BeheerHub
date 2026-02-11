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

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const routeLayer: Layer = {
  id: 'route',
  type: 'line',
  source: 'route',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    'line-color': '#3b82f6',
    'line-width': 8,
    'line-opacity': 0.8,
  },
};

function getManeuverIcon(step: any) {
    if (!step) return <ArrowUp className="h-10 w-10 text-white" />;
    
    const modifier = step?.maneuver?.modifier;
    const type = step?.maneuver?.type;

    if (type === 'arrive') return <CheckCircle2 className="h-10 w-10 text-green-400" />;
    if (type === 'depart') return <ArrowUp className="h-10 w-10 text-white" />;
    
    switch (modifier) {
        case 'left': return <CornerUpLeft className="h-10 w-10 text-white" />;
        case 'right': return <CornerUpRight className="h-10 w-10 text-white" />;
        case 'slight left': return <ArrowUpLeft className="h-10 w-10 text-white" />;
        case 'slight right': return <ArrowUpRight className="h-10 w-10 text-white" />;
        case 'sharp left': return <CornerUpLeft className="h-10 w-10 text-white stroke-[3]" />;
        case 'sharp right': return <CornerUpRight className="h-10 w-10 text-white stroke-[3]" />;
        case 'uturn': return <RotateCcw className="h-10 w-10 text-white" />;
        case 'straight': return <ArrowUp className="h-10 w-10 text-white" />;
        default: {
            if (type && type.includes('roundabout')) {
                return <RefreshCw className="h-10 w-10 text-white" />;
            }
            return <ArrowUp className="h-10 w-10 text-white" />;
        }
    }
}

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
  const [userLocation, setUserLocation] = React.useState<{ latitude: number, longitude: number, speed: number | null, heading: number | null } | null>(initialUserLocation ? { ...initialUserLocation, speed: 0, heading: 0 } : null);
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
    targetSpeedMs: 13.8, // ~50 km/h
    lastTimestamp: 0
  });

  const nextObject = objectsOnRoute[currentObjectIndex];

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

  const remainingRouteGeometry = React.useMemo(() => {
    if (!currentRouteGeometry || isCalculatingRoute) return null;
    try {
        const coords = currentRouteGeometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return currentRouteGeometry;

        const line = turf.lineString(coords);
        const totalDist = turf.length(line, { units: 'meters' });
        
        let startDist = 0;
        if (isSimulating) {
            startDist = Math.min(simStateRef.current.distanceTravelled, totalDist - 0.1);
        } else if (userLocation) {
            const startPoint = turf.point([userLocation.longitude, userLocation.latitude]);
            const snappedStart = turf.nearestPointOnLine(line, startPoint);
            startDist = turf.length(turf.lineSlice(turf.point(coords[0]), snappedStart, line), { units: 'meters' });
        }

        if (startDist >= totalDist - 1) return null;

        const sliced = turf.lineSliceAlong(line, startDist, totalDist, { units: 'meters' });
        return sliced.geometry;
    } catch (e) { 
        return currentRouteGeometry; 
    }
  }, [currentRouteGeometry, userLocation?.latitude, userLocation?.longitude, isSimulating, isCalculatingRoute]);

  // LIVE GPS TRACKING EFFECT
  React.useEffect(() => {
    if (isSimulating) return;
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading } = position.coords;
        setUserLocation({ latitude, longitude, speed, heading });
        
        if (isFollowing && !isPaused) {
            const currentSpeedKmh = speed ? speed * 3.6 : 0;
            // Track-Up logic: Rotate map to heading
            setViewState(prev => ({
                ...prev,
                latitude,
                longitude,
                bearing: heading !== null ? heading : prev.bearing,
                // Adjust zoom based on speed like simulation
                zoom: 18.5 - (Math.min(currentSpeedKmh, 50) / 25),
                pitch: 65,
            }));
        }

        if (currentRouteGeometry) {
            try {
                const coords = currentRouteGeometry.coordinates;
                if (coords && coords.length >= 2) {
                    const line = turf.lineString(coords);
                    const totalDist = turf.length(line, { units: 'meters' });
                    const userPoint = turf.point([longitude, latitude]);
                    const snapped = turf.nearestPointOnLine(line, userPoint);
                    const distToStart = turf.length(turf.lineSlice(turf.point(coords[0]), snapped, line), { units: 'meters' });
                    const remaining = Math.max(0, totalDist - distToStart);
                    setDistanceRemainingToDestination(remaining);
                    if (remaining < 100) setHasReachedCurrentTarget(true);
                    else setHasReachedCurrentTarget(false);
                }
            } catch (e) {}
        }
      },
      () => {
        toast({ title: "Locatiefout", description: "Zorg ervoor dat locatietoegang is ingeschakeld op dit apparaat.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSimulating, toast, currentRouteGeometry, isFollowing, isPaused]);

  // SIMULATION ANIMATION EFFECT
  React.useEffect(() => {
    if (!isSimulating || !currentRouteGeometry || !nextObject || arrivedObject || isCalculatingRoute) return;

    const coords = currentRouteGeometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;

    let line: any;
    try {
        line = turf.lineString(coords);
    } catch (e) {
        return;
    }
    
    const totalDistance = turf.length(line, { units: 'meters' });
    if (totalDistance <= 0) return;

    const animate = (timestamp: number) => {
        if (isPaused || arrivedObject || isCalculatingRoute || !currentRouteGeometry) {
            simStateRef.current.lastTimestamp = timestamp;
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        if (!simStateRef.current.lastTimestamp) simStateRef.current.lastTimestamp = timestamp;
        const deltaTime = (timestamp - simStateRef.current.lastTimestamp) / 1000;
        simStateRef.current.lastTimestamp = timestamp;

        const distanceToDestination = totalDistance - simStateRef.current.distanceTravelled;
        
        if (distanceToDestination < 30) {
            simStateRef.current.targetSpeedMs = 4;
        } else {
            simStateRef.current.targetSpeedMs = 13.8;
        }

        const accel = simStateRef.current.targetSpeedMs > simStateRef.current.currentSpeedMs ? 3 : 6;
        simStateRef.current.currentSpeedMs += (simStateRef.current.targetSpeedMs - simStateRef.current.currentSpeedMs) * deltaTime * accel;
        simStateRef.current.distanceTravelled += simStateRef.current.currentSpeedMs * deltaTime;
        
        setDistanceRemainingToDestination(Math.max(0, totalDistance - simStateRef.current.distanceTravelled));

        if (simStateRef.current.distanceTravelled >= totalDistance - 0.5) {
            const finalCoord = coords[coords.length - 1];
            setUserLocation({ latitude: finalCoord[1], longitude: finalCoord[0], speed: 0, heading: 0 });
            setHasReachedCurrentTarget(true);
            return;
        } else if (totalDistance - simStateRef.current.distanceTravelled < 100) {
            setHasReachedCurrentTarget(true);
        } else {
            setHasReachedCurrentTarget(false);
        }

        try {
            const currentPoint = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
            const lookAheadPoint = turf.along(line, Math.min(simStateRef.current.distanceTravelled + 2, totalDistance), { units: 'meters' });
            
            const [lng, lat] = currentPoint.geometry.coordinates;
            const heading = (turf.bearing(currentPoint, lookAheadPoint) + 360) % 360;

            setUserLocation({ latitude: lat, longitude: lng, speed: simStateRef.current.currentSpeedMs, heading: heading });

            setViewState(prev => ({
                ...prev,
                latitude: lat,
                longitude: lng,
                bearing: heading,
                zoom: 18.5 - (simStateRef.current.currentSpeedMs / 25), 
            }));
        } catch (e) {}

        animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSimulating, isPaused, arrivedObject, currentRouteGeometry, nextObject?.id, isCalculatingRoute]);

  // ROUTE CALCULATION EFFECT
  React.useEffect(() => {
    if (!userLocation || !nextObject || arrivedObject) return;
    
    const fetchRoute = async () => {
      setIsCalculatingRoute(true);
      const { longitude, latitude } = userLocation;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${longitude},${latitude};${nextObject.longitude},${nextObject.latitude}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}&language=nl`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          setCurrentRouteGeometry(data.routes[0].geometry);
          setCurrentLeg(data.routes[0].legs[0]);
          setDistanceRemainingToDestination(data.routes[0].legs[0].distance);
          setHasReachedCurrentTarget(data.routes[0].legs[0].distance < 100);
          if (isSimulating) {
              simStateRef.current.distanceTravelled = 0;
              simStateRef.current.currentSpeedMs = 0;
          }
        }
      } catch (error) {
          console.error("Failed to fetch route:", error);
      } finally {
          setTimeout(() => setIsCalculatingRoute(false), 800);
      }
    };
    fetchRoute();
  }, [nextObject?.id, arrivedObject, isSimulating]);
  
  const handleArrivedAction = (type: 'finish' | 'issue') => {
    if (!arrivedObject) return;
    
    const finishedId = arrivedObject.id;
    setCompletedObjects(prev => [...prev, finishedId]);
    
    setIsCalculatingRoute(true);
    setArrivedObject(null);
    setHasReachedCurrentTarget(false);
    setCurrentObjectIndex(prev => prev + 1);
    
    setCurrentRouteGeometry(null);
    setCurrentLeg(null);
    
    if (isSimulating) {
        simStateRef.current = {
            distanceTravelled: 0,
            currentSpeedMs: 0,
            targetSpeedMs: 13.8,
            lastTimestamp: 0
        };
    }
  };

  const handleMarkerClick = (obj: MapObject, idx: number) => {
    if (idx !== currentObjectIndex) return;

    if (!userLocation) {
        toast({ title: "Locatie onbekend", description: "Wacht op GPS signaal..." });
        return;
    }

    const dist = turf.distance(
        turf.point([userLocation.longitude, userLocation.latitude]),
        turf.point([obj.longitude, obj.latitude]),
        { units: 'meters' }
    );

    if (dist <= 100) {
        setArrivedObject(obj);
    } else {
        toast({ 
            title: "Buiten bereik", 
            description: `Rijd eerst dichterbij. U bent nog ${Math.round(dist)}m verwijderd.` 
        });
    }
  };

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

  const speedKmh = userLocation?.speed ? Math.round(userLocation.speed * 3.6) : 0;

  return (
    <div className="w-full h-full relative bg-slate-100 overflow-hidden">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={evt => {
            setViewState(evt.viewState);
            // If user manually moves the map, stop auto-following
            if (evt.viewState.latitude !== viewState.latitude || evt.viewState.longitude !== viewState.longitude) {
                if (isFollowing) setIsFollowing(false);
            }
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {userLocation && (
          <Marker 
            longitude={userLocation.longitude} 
            latitude={userLocation.latitude} 
            anchor="center"
            // When map bearing follows heading, the marker rotation should be 0 
            // so it always points UP relative to the device.
            rotation={isFollowing ? 0 : (userLocation.heading || 0)} 
          >
            <div className="relative flex items-center justify-center transition-all duration-150 ease-linear">
                <div className="absolute h-16 w-16 bg-blue-500/20 rounded-full animate-pulse" />
                <div className="h-12 w-12 bg-blue-600 rounded-full border-[4px] border-white shadow-2xl flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-white fill-current">
                        <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
                    </svg>
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
                        handleMarkerClick(obj, idx);
                    }}
                >
                    <div className={cn(
                        "w-8 h-8 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-[10px] font-black text-white transition-all cursor-pointer hover:scale-110",
                        isTarget ? "bg-blue-600 scale-125 ring-4 ring-blue-500/30" : "bg-slate-400",
                        inRange && "bg-green-600 ring-green-500/50"
                    )}>
                        {inRange && (
                            <div className="absolute inset-0 rounded-full animate-ping bg-green-400 opacity-75" />
                        )}
                        {idx + 1}
                    </div>
                </Marker>
            );
        })}

        {remainingRouteGeometry && (
          <Source id="route-line" type="geojson" data={remainingRouteGeometry}>
            <Layer {...routeLayer} />
          </Source>
        )}
      </MapGL>
      
      {navHudData && !arrivedObject && !isCalculatingRoute && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-lg">
              <Card className="bg-slate-900/95 backdrop-blur-xl text-white shadow-2xl border-none overflow-hidden">
                  <CardContent className="p-4 flex items-center gap-5">
                      <div className="bg-blue-600 p-3 rounded-xl shadow-inner">
                          {getManeuverIcon(navHudData.step)}
                      </div>
                      <div className="min-w-0 flex-1">
                          <p className="text-4xl font-black tracking-tighter tabular-nums mb-0.5">
                              {navHudData.distance > 1000 ? `${(navHudData.distance/1000).toFixed(1)} km` : `${Math.round(navHudData.distance)} m`}
                          </p>
                          <p className="text-xs font-black opacity-80 uppercase tracking-widest leading-tight truncate">
                              {navHudData.instruction}
                          </p>
                      </div>
                  </CardContent>
              </Card>
          </div>
      )}

      {isCalculatingRoute && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-md">
              <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl shadow-2xl border border-slate-100">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="font-black uppercase tracking-widest text-xs text-slate-500">Volgende locatie berekenen...</p>
              </div>
          </div>
      )}

      {arrivedObject && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
              <Card className="w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                  <CardHeader className="text-center pb-2">
                      <div className="mx-auto bg-green-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                          <MapPin className="h-8 w-8 text-green-600 fill-current" />
                      </div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Bestemming Bereikt</CardTitle>
                      <CardDescription className="font-bold text-slate-500">
                          Unit ID: <span className="text-slate-900">{arrivedObject.id}</span>
                      </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 pt-2 space-y-3">
                      <Button 
                        onClick={() => handleArrivedAction('finish')} 
                        className="w-full h-14 bg-green-600 hover:bg-green-700 text-lg font-black uppercase tracking-tight gap-2"
                      >
                          <CheckCircle2 className="h-5 w-5" /> Afronden & Door
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => handleArrivedAction('issue')} 
                        className="w-full h-12 border-2 border-orange-200 text-orange-600 hover:bg-orange-50 font-black uppercase tracking-tight gap-2"
                      >
                          <AlertTriangle className="h-4 w-4" /> Issue Melden
                      </Button>
                      <Button variant="ghost" onClick={() => setArrivedObject(null)} className="w-full">
                          Sluiten
                      </Button>
                  </CardContent>
              </Card>
          </div>
      )}

      <div className="absolute bottom-10 left-6 z-10 flex flex-col gap-3">
         <Card className="w-40 shadow-2xl bg-white/95 backdrop-blur-xl border-none overflow-hidden">
            <CardContent className="p-0">
                <div className="bg-slate-50 border-b p-2 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Snelheid</span>
                    <Badge variant="outline" className="text-[8px] font-black text-blue-600 border-blue-200">MAX 50</Badge>
                </div>
                <div className="p-3 flex items-baseline gap-1 justify-center">
                    <span className="text-5xl font-black tracking-tighter tabular-nums text-slate-900">{speedKmh}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase">km/h</span>
                </div>
            </CardContent>
        </Card>
        
        {!isFollowing && (
            <Button 
                onClick={() => setIsFollowing(true)}
                className="h-12 w-12 rounded-full shadow-2xl bg-primary text-white border-none hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
                title="Locatie herstellen"
            >
                <LocateFixed className="h-6 w-6" />
            </Button>
        )}
      </div>

      <div className="absolute bottom-10 right-6 z-10 w-64">
          <Card className="bg-white/95 backdrop-blur-xl border-none shadow-2xl p-4">
              <div className="space-y-2.5">
                  <div className="flex justify-between items-end">
                      <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Route Voortgang</p>
                          <p className="text-lg font-black text-slate-900 leading-none">
                            {completedObjects.length} <span className="text-slate-300">/ {objectsOnRoute.length}</span>
                          </p>
                      </div>
                      <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Volgende stop</p>
                          <p className="text-sm font-black text-blue-600 truncate max-w-[120px]">{nextObject?.id}</p>
                      </div>
                  </div>
                  <Progress value={(completedObjects.length / objectsOnRoute.length) * 100} className="h-1.5 bg-slate-100" />
              </div>
          </Card>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex gap-3">
            <Button variant="secondary" size="lg" className="h-14 w-14 rounded-full shadow-2xl bg-white/95 backdrop-blur-xl border-none hover:scale-110 active:scale-95 transition-all flex items-center justify-center" onClick={() => setIsPaused(!isPaused)}>
                {isPaused ? <Play className="h-7 w-7 fill-current text-blue-600" /> : <Pause className="h-7 w-7 fill-current text-blue-600" />}
            </Button>
            <Button variant="destructive" size="lg" className="h-14 w-14 rounded-full shadow-2xl border-none hover:scale-110 active:scale-95 transition-all flex items-center justify-center" onClick={onExit}><XIcon className="h-7 w-7" /></Button>
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
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const isSuperUser = profile?.role === 'Super admin';
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [routeType, setRouteType] = React.useState<'veeg' | 'prullenbak' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('--nieuwe-route--');
  
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [objectsOnRoute, setObjectsOnRoute] = React.useState<MapObject[]>([]);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  
  const mapRef = React.useRef<MapRef>(null);

  // Watch device location automatically
  React.useEffect(() => {
    if (!navigator.geolocation) {
        console.warn("Geolocation is not supported by this browser.");
        return;
    }

    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        (err) => {
            console.warn("Could not get device location:", err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  React.useEffect(() => {
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const projectIdFromUrl = searchParams.get('projectId');
    if (projectIdFromUrl && selectedProjectId !== projectIdFromUrl) setSelectedProjectId(projectIdFromUrl);
    if (lat && lng && navigationState !== 'navigating') {
      const meldingObject: MapObject = { id: `dest-${lat}-${lng}`, latitude: parseFloat(lat), longitude: parseFloat(lng) };
      setObjectsOnRoute([meldingObject]);
      setNavigationState('navigating');
    }
  }, [searchParams, selectedProjectId, setSelectedProjectId, navigationState]);

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);

  const selectedProject = React.useMemo(() => projects?.find(p => p.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const availableRoutes = React.useMemo(() => {
      if (!selectedProject) return [];
      if (routeType === 'veeg') return selectedProject.veegroutes || [];
      if (routeType === 'prullenbak') return selectedProject.prullenbakkenroutes || [];
      return [];
  }, [selectedProject, routeType]);

  const selectedRouteDef = React.useMemo(() => {
    if (!selectedRouteId || selectedRouteId === '--nieuwe-route--' || !selectedProject) return null;
    const allRoutes = [...(selectedProject.veegroutes || []), ...(selectedProject.prullenbakkenroutes || [])];
    return allRoutes.find(r => r.id === selectedRouteId) ?? null;
  }, [selectedRouteId, selectedProject]);

  const objectsOnRouteQuery = useMemoFirebase(() => {
    if (!firestore || !selectedRouteDef) return null;
    return query(
      collection(firestore, 'objects'),
      where('locatieWerkgebieden', 'array-contains', selectedRouteDef.naam)
    );
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
          
          if (selectedRouteDef && 'startLatitude' in selectedRouteDef && selectedRouteDef.startLatitude && selectedRouteDef.startLongitude) {
              features.push(turf.point([selectedRouteDef.startLongitude, selectedRouteDef.startLatitude]));
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
    let startLoc = userLocation;
    setIsSimulationMode(simulate);
    
    const predefinedStart = selectedRouteDef && 'startLatitude' in selectedRouteDef && selectedRouteDef.startLatitude && selectedRouteDef.startLongitude
        ? { latitude: selectedRouteDef.startLatitude, longitude: selectedRouteDef.startLongitude }
        : null;

    // Preference for simulation: Depot
    if (simulate && predefinedStart) {
        startLoc = predefinedStart;
    } else if (!startLoc && predefinedStart) {
        // Fallback for live if GPS not ready: Depot
        startLoc = predefinedStart;
    } else if (simulate && !startLoc && objectsOnMap && objectsOnMap.length > 0) {
        // Ultimate fallback: first object
        startLoc = { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };
    }
    
    if (!startLoc && !simulate) { 
        toast({ 
            title: "Locatie vereist", 
            description: "Schakel GPS in of klik op de kaart voor een startpunt.", 
            variant: "destructive" 
        });
        return; 
    }
    
    if (!selectedProjectId || !selectedRouteDef || !objectsOnMap || !user) return;
    
    setIsStarting(true);
    if (objectsOnMap.length === 0) { 
        toast({ title: "Geen objecten", description: "Deze route bevat geen prullenbakken." });
        setIsStarting(false); 
        return; 
    }
    
    const startCoords = startLoc || { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };
    
    const unvisited = [...objectsOnMap];
    const sortedObjects: MapObject[] = [];
    let currentPos = startCoords;

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const dist = turf.distance(
          turf.point([currentPos.longitude, currentPos.latitude]),
          turf.point([unvisited[i].longitude, unvisited[i].latitude])
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const nextPoint = unvisited.splice(nearestIdx, 1)[0];
      sortedObjects.push(nextPoint);
      currentPos = { latitude: nextPoint.latitude, longitude: nextPoint.longitude };
    }
    
    setObjectsOnRoute(sortedObjects);
    setUserLocation(startCoords);
    setNavigationState('navigating');
    setIsStarting(false);
  };
  
  if (navigationState === 'navigating') {
    return <NavigatingView objectsOnRoute={objectsOnRoute} onExit={() => { setNavigationState('setup'); setObjectsOnRoute([]); if (searchParams.has('lat')) router.back(); }} initialUserLocation={userLocation} isSimulating={isSimulationMode} />;
  }

  return (
    <div className="w-full h-full relative bg-slate-100">
      <MapGL 
        ref={mapRef} 
        initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 7 }} 
        style={{ width: '100%', height: '100%' }} 
        mapStyle={mapStyle} 
        mapboxAccessToken={MAPBOX_TOKEN} 
        onClick={e => setUserLocation({ latitude: e.lngLat.lat, longitude: e.lngLat.lng })} 
        interactive={true}
      >
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
        
        {selectedRouteDef && 'startLatitude' in selectedRouteDef && selectedRouteDef.startLatitude && selectedRouteDef.startLongitude && (
            <Marker longitude={selectedRouteDef.startLongitude} latitude={selectedRouteDef.startLatitude} anchor="center">
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
      <Card className="absolute top-4 left-4 z-10 w-full max-w-sm shadow-2xl bg-white/95 backdrop-blur border-2 border-slate-100">
        <CardHeader className="p-5 border-b bg-slate-50/50">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="h-10 w-10 hover:bg-white rounded-full flex items-center justify-center"><ArrowLeft className="h-5 w-5" /></Button>
            <CardTitle className="text-lg font-black uppercase tracking-tighter">Navigatie Setup</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Project</Label>
            <Select value={selectedProjectId || ''} onValueChange={v => setSelectedProjectId(v || null)} disabled={isLoadingProjects}>
              <SelectTrigger className="h-12 border-2 font-bold"><SelectValue placeholder="Selecteer project" /></SelectTrigger>
              <SelectContent>{projects?.map(p => <SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type Inzet</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button variant={routeType === 'veeg' ? 'default' : 'outline'} onClick={() => setRouteType('veeg')} disabled={!selectedProjectId} className={cn("font-black h-12 border-2", routeType === 'veeg' ? "bg-blue-600 border-blue-600 shadow-md text-white" : "border-slate-200")}>Veegwagen</Button>
              <Button variant={routeType === 'prullenbak' ? 'default' : 'outline'} onClick={() => setRouteType('prullenbak')} disabled={!selectedProjectId} className={cn("font-black h-12 border-2", routeType === 'prullenbak' ? "bg-blue-600 border-blue-600 shadow-md text-white" : "border-slate-200")}>Prullenbakken</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Route Keuze</Label>
            <Select onValueChange={setSelectedRouteId} value={selectedRouteId} disabled={!routeType}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="--nieuwe-route--">-- Kies een route --</SelectItem>
                    {availableRoutes.map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>
                            {r.naam} {r.startAdres ? ' (Startlocatie ingesteld)' : ''}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>
          {selectedRouteDef && 'startAdres' in selectedRouteDef && selectedRouteDef.startAdres && (
              <div className="p-3 rounded-xl bg-blue-50 border-2 border-blue-100 flex items-start gap-3">
                  <Home className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Route Startpunt</p>
                      <p className="text-xs font-bold text-slate-700 truncate">{selectedRouteDef.startAdres}</p>
                  </div>
              </div>
          )}
          <div className="flex flex-col gap-3 pt-2">
            <Button className="w-full h-16 text-xl font-black bg-blue-600 hover:bg-blue-700 shadow-xl rounded-2xl uppercase tracking-tighter flex items-center justify-center text-white" onClick={() => handleStartRoute(false)} disabled={!selectedRouteId || selectedRouteId === '--nieuwe-route--' || isStarting}>
                {isStarting ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : <Navigation className="mr-3 h-6 w-6 fill-current" />} START LIVE RIT
            </Button>
            {isSuperUser && (
                <Button variant="outline" className="w-full h-14 border-dashed border-2 border-blue-200 text-blue-600 hover:bg-blue-50/50 font-black uppercase tracking-tighter rounded-2xl flex items-center justify-center" onClick={() => handleStartRoute(true)} disabled={!selectedRouteId || selectedRouteId === '--nieuwe-route--' || isStarting}>
                    <Gauge className="mr-2 h-5 w-5" /> SIMULATOR STARTEN
                </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
