'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef, NavigationControl } from 'react-map-gl';
import { useCollection, useFirestore, useUser } from '@/firebase';
import { collection, query, where, addDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  X, 
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
  Navigation
} from 'lucide-react';
import { useProject } from '@/context/project-context';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Project, Route, Veegroute, Prullenbakkenroute, Object as MapObject } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import * as turf from '@turf/turf';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/firebase/profile-provider';
import { useToast } from '@/components/ui/use-toast';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type ProjectWithRoutes = Project & {
  veegroutes?: Veegroute[];
  prullenbakkenroutes?: Prullenbakkenroute[];
};

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
    'line-width': 10,
    'line-opacity': 0.8,
  },
};

// Helper to select appropriate icon for maneuver
function getManeuverIcon(step: any) {
    const modifier = step?.maneuver?.modifier;
    const type = step?.maneuver?.type;

    if (type === 'arrive') return <CheckCircle2 className="h-14 w-14 text-green-400" />;
    if (type === 'depart') return <ArrowUp className="h-14 w-14 text-white" />;
    
    switch (modifier) {
        case 'left': return <CornerUpLeft className="h-14 w-14 text-white" />;
        case 'right': return <CornerUpRight className="h-14 w-14 text-white" />;
        case 'slight left': return <ArrowUpLeft className="h-14 w-14 text-white" />;
        case 'slight right': return <ArrowUpRight className="h-14 w-14 text-white" />;
        case 'sharp left': return <CornerUpLeft className="h-14 w-14 text-white stroke-[3]" />;
        case 'sharp right': return <CornerUpRight className="h-14 w-14 text-white stroke-[3]" />;
        case 'uturn': return <RotateCcw className="h-14 w-14 text-white" />;
        default: return <ArrowUp className="h-14 w-14 text-white" />;
    }
}

function NavigatingView({ 
    objectsOnRoute, 
    onExit,
    initialUserLocation,
    destinationAddress,
    isSimulating = false
}: { 
    objectsOnRoute: MapObject[], 
    onExit: () => void,
    initialUserLocation: { latitude: number; longitude: number; } | null,
    destinationAddress?: string | null,
    isSimulating?: boolean
}) {
  const mapRef = React.useRef<MapRef>(null);
  const [userLocation, setUserLocation] = React.useState<{ latitude: number, longitude: number, speed: number | null, heading: number | null } | null>(initialUserLocation ? { ...initialUserLocation, speed: 0, heading: null } : null);
  const [currentObjectIndex, setCurrentObjectIndex] = React.useState(0);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [currentRouteGeometry, setCurrentRouteGeometry] = React.useState<any>(null);
  const [currentLeg, setCurrentLeg] = React.useState<any>(null);
  const [isPaused, setIsPaused] = React.useState(false);
  const [distanceRemaining, setDistanceRemaining] = React.useState(0);
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const { toast } = useToast();
  
  const [viewState, setViewState] = React.useState({
    pitch: 60,
    bearing: 0,
    zoom: 18,
    latitude: initialUserLocation?.latitude || 52.1326,
    longitude: initialUserLocation?.longitude || 5.2913,
  });

  const animationRef = React.useRef<number | null>(null);
  const simStateRef = React.useRef({
    distanceTravelled: 0,
    currentSpeedMs: 0,
    targetSpeedMs: 13.8, // ~50 km/h baseline
    lastTimestamp: 0
  });

  const nextObject = objectsOnRoute[currentObjectIndex];

  // Dynamic route line: Only show the path ahead
  const remainingRouteGeometry = React.useMemo(() => {
    if (!currentRouteGeometry) return null;
    
    try {
        const line = turf.lineString(currentRouteGeometry.coordinates);
        const totalDist = turf.length(line, { units: 'meters' });
        
        if (isSimulating) {
            // Simulator: Precise distance-based slicing
            const sliced = turf.lineSliceAlong(line, simStateRef.current.distanceTravelled, totalDist, { units: 'meters' });
            return sliced.geometry;
        } else {
            // Real GPS: Snapping logic
            if (!userLocation) return currentRouteGeometry;
            const startPoint = turf.point([userLocation.longitude, userLocation.latitude]);
            const snappedStart = turf.nearestPointOnLine(line, startPoint);
            const endPoint = turf.point(currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1]);
            const sliced = turf.lineSlice(snappedStart, endPoint, line);
            return sliced.geometry;
        }
    } catch (e) {
        return currentRouteGeometry;
    }
  }, [currentRouteGeometry, userLocation?.latitude, userLocation?.longitude, isSimulating]);

  // Real Geolocation Watcher
  React.useEffect(() => {
    if (isSimulating) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading } = position.coords;
        setUserLocation({ latitude, longitude, speed, heading });
        
        // Update distance remaining for real GPS
        if (currentRouteGeometry) {
            try {
                const line = turf.lineString(currentRouteGeometry.coordinates);
                const totalDist = turf.length(line, { units: 'meters' });
                const userPoint = turf.point([longitude, latitude]);
                const snapped = turf.nearestPointOnLine(line, userPoint);
                const distToStart = turf.length(turf.lineSlice(turf.point(currentRouteGeometry.coordinates[0]), snapped, line), { units: 'meters' });
                setDistanceRemaining(Math.max(0, totalDist - distToStart));
            } catch (e) {
                // fallback to initial leg distance
            }
        }
      },
      (error) => {
        console.error("Locatiefout:", error.code, error.message);
        toast({
            title: "Locatiefout",
            description: "Zorg ervoor dat locatietoegang is ingeschakeld.",
            variant: "destructive",
        })
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSimulating, toast, currentRouteGeometry]);

  // High Performance 60FPS Animation Loop for Simulation
  React.useEffect(() => {
    if (!isSimulating || !currentRouteGeometry || !nextObject) return;

    const coords = currentRouteGeometry.coordinates;
    if (coords.length < 2) return;

    const line = turf.lineString(coords);
    const totalDistance = turf.length(line, { units: 'meters' });

    const animate = (timestamp: number) => {
        if (isPaused) {
            simStateRef.current.lastTimestamp = timestamp;
            animationRef.current = requestAnimationFrame(animate);
            return;
        }

        if (!simStateRef.current.lastTimestamp) simStateRef.current.lastTimestamp = timestamp;
        const deltaTime = (timestamp - simStateRef.current.lastTimestamp) / 1000;
        simStateRef.current.lastTimestamp = timestamp;

        // Optimized Physics
        const lookAheadForSpeed = turf.along(line, Math.min(simStateRef.current.distanceTravelled + 40, totalDistance), { units: 'meters' });
        const lookAheadPoint = turf.along(line, Math.min(simStateRef.current.distanceTravelled + 5, totalDistance), { units: 'meters' });
        const currentPoint = turf.along(line, simStateRef.current.distanceTravelled, { units: 'meters' });
        
        const [lng, lat] = currentPoint.geometry.coordinates;
        const [nextLng, nextLat] = lookAheadPoint.geometry.coordinates;
        
        // Calculate bearing using turf for better precision
        const heading = (turf.bearing(currentPoint, lookAheadPoint) + 360) % 360;
        const lookAheadBearing = (turf.bearing(lookAheadPoint, lookAheadForSpeed) + 360) % 360;
        const bearingDiff = Math.abs(heading - lookAheadBearing);
        const distanceToNextPoint = totalDistance - simStateRef.current.distanceTravelled;

        // Max 50km/h baseline
        if (distanceToNextPoint < 20) {
            simStateRef.current.targetSpeedMs = 3; 
        } else if (bearingDiff > 25) {
            simStateRef.current.targetSpeedMs = 4.5; 
        } else if (bearingDiff > 10) {
            simStateRef.current.targetSpeedMs = 8; 
        } else {
            simStateRef.current.targetSpeedMs = 13.8; 
        }

        const accelFactor = simStateRef.current.targetSpeedMs > simStateRef.current.currentSpeedMs ? 4 : 8; 
        simStateRef.current.currentSpeedMs += (simStateRef.current.targetSpeedMs - simStateRef.current.currentSpeedMs) * deltaTime * accelFactor;

        simStateRef.current.distanceTravelled += simStateRef.current.currentSpeedMs * deltaTime;
        
        // Update distance remaining UI
        setDistanceRemaining(Math.max(0, totalDistance - simStateRef.current.distanceTravelled));

        if (simStateRef.current.distanceTravelled >= totalDistance) {
            const finalCoord = coords[coords.length - 1];
            setUserLocation({ latitude: finalCoord[1], longitude: finalCoord[0], speed: 0, heading: heading });
            simStateRef.current.distanceTravelled = 0;
            return;
        }

        setUserLocation({
            latitude: lat,
            longitude: lng,
            speed: simStateRef.current.currentSpeedMs,
            heading: heading
        });

        setViewState(prev => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            bearing: heading,
            zoom: 18.5 - (simStateRef.current.currentSpeedMs / 15), 
        }));

        animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSimulating, isPaused, currentRouteGeometry, nextObject?.id]);

  // Sync Camera for non-simulated (Real GPS)
  React.useEffect(() => {
    if (isSimulating || !userLocation || !nextObject) return;

    const effectiveHeading = userLocation.heading !== null 
        ? userLocation.heading 
        : (turf.bearing(turf.point([userLocation.longitude, userLocation.latitude]), turf.point([nextObject.longitude, nextObject.latitude])) + 360) % 360;

    setViewState(prev => ({
      ...prev,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      bearing: effectiveHeading,
    }));
  }, [userLocation, nextObject, isSimulating]);

  // Fetch Route Data
  React.useEffect(() => {
    if (!userLocation || !nextObject) return;
    
    const fetchRoute = async () => {
      const { longitude, latitude } = userLocation;
      // Add &language=nl for Dutch instructions
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${longitude},${latitude};${nextObject.longitude},${nextObject.latitude}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}&language=nl`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          setCurrentRouteGeometry(data.routes[0].geometry);
          setCurrentLeg(data.routes[0].legs[0]);
          setDistanceRemaining(data.routes[0].legs[0].distance);
          simStateRef.current.distanceTravelled = 0; 
        }
      } catch (error) {
        console.error("Error fetching directions:", error);
      }
    };
    
    fetchRoute();
  }, [nextObject?.id]);
  
  // Arrival Detection
  React.useEffect(() => {
    if (!userLocation || !nextObject) return;

    const userPoint = turf.point([userLocation.longitude, userLocation.latitude]);
    const objectPoint = turf.point([nextObject.longitude, nextObject.latitude]);
    const distance = turf.distance(userPoint, objectPoint, { units: 'meters' });

    if (distance < 15) { 
      setCompletedObjects(prev => [...prev, nextObject.id]);
      setCurrentObjectIndex(prev => prev + 1);
    }
  }, [userLocation?.latitude, userLocation?.longitude, nextObject?.id]);

  if (currentObjectIndex >= objectsOnRoute.length && objectsOnRoute.length > 0) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-background p-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h1 className="text-3xl font-black tracking-tight">Bestemming Bereikt!</h1>
            <p className="text-muted-foreground font-medium">{completedObjects.length} objecten succesvol afgerond op deze route.</p>
            <Button onClick={onExit} size="lg" className="px-10 h-14 text-lg font-bold">Overzicht Sluiten</Button>
        </div>
    )
  }

  const speedKmh = userLocation?.speed ? Math.round(userLocation.speed * 3.6) : 0;
  const firstStep = currentLeg?.steps?.[0];

  return (
    <div className="w-full h-full relative bg-slate-100 overflow-hidden">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {userLocation && (
          <Marker 
            longitude={userLocation.longitude} 
            latitude={userLocation.latitude} 
            anchor="center"
            rotation={userLocation.heading || 0}
            rotationAlignment="map"
          >
            <div className="relative flex items-center justify-center">
                <div className="absolute h-16 w-16 bg-blue-500/20 rounded-full animate-pulse" />
                <div className="h-14 w-14 bg-blue-600 rounded-full border-[6px] border-white shadow-2xl flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="h-8 w-8 text-white fill-current">
                        <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
                    </svg>
                </div>
            </div>
          </Marker>
        )}
        {objectsOnRoute.map((obj, idx) => (
            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center">
                <div className={cn(
                    "w-7 h-7 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-xs font-black text-white transition-all",
                    idx < currentObjectIndex ? "bg-green-500" : (idx === currentObjectIndex ? "bg-blue-600 scale-125 ring-4 ring-blue-500/30" : "bg-slate-400")
                )}>
                    {idx + 1}
                </div>
            </Marker>
        ))}
        {remainingRouteGeometry && (
          <Source id="route-line" type="geojson" data={remainingRouteGeometry}>
            <Layer {...routeLayer} />
          </Source>
        )}
      </MapGL>
      
      {/* HUD: Instruction Panel */}
      {firstStep && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-lg">
              <Card className="bg-slate-900/95 backdrop-blur-xl text-white shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-none overflow-hidden">
                  <CardContent className="p-5 flex items-center gap-6">
                      <div className="bg-blue-600 p-4 rounded-2xl shadow-inner">
                          {getManeuverIcon(firstStep)}
                      </div>
                      <div className="min-w-0 flex-1">
                          <p className="text-5xl font-black tracking-tighter tabular-nums mb-1">
                              {distanceRemaining > 1000 ? `${(distanceRemaining/1000).toFixed(1)} km` : `${Math.round(distanceRemaining)} m`}
                          </p>
                          <p className="text-sm font-bold opacity-80 uppercase tracking-widest leading-tight">
                              {firstStep.maneuver.instruction}
                          </p>
                      </div>
                  </CardContent>
              </Card>
          </div>
      )}

      {/* HUD: Speed meter */}
      <div className="absolute bottom-10 left-6 z-10">
         <Card className="w-48 shadow-2xl bg-white/95 backdrop-blur-xl border-none overflow-hidden">
            <CardContent className="p-0">
                <div className="bg-slate-50 border-b p-3 flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Snelheid</span>
                    <Badge variant="outline" className="text-[9px] font-black text-blue-600 border-blue-200">MAX 50</Badge>
                </div>
                <div className="p-4 flex items-baseline gap-1 justify-center">
                    <span className="text-6xl font-black tracking-tighter tabular-nums text-slate-900">{speedKmh}</span>
                    <span className="text-xs font-bold text-slate-400 uppercase">km/h</span>
                </div>
            </CardContent>
        </Card>
      </div>

      {/* Progress HUD */}
      <div className="absolute bottom-10 right-6 z-10 w-64">
          <Card className="bg-white/95 backdrop-blur-xl border-none shadow-2xl p-4">
              <div className="space-y-3">
                  <div className="flex justify-between items-end">
                      <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Route Voortgang</p>
                          <p className="text-lg font-black text-slate-900">{completedObjects.length} <span className="text-slate-300">/ {objectsOnRoute.length}</span></p>
                      </div>
                      <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ETA</p>
                          <p className="text-lg font-black text-blue-600">3 min</p>
                      </div>
                  </div>
                  <Progress value={(completedObjects.length / objectsOnRoute.length) * 100} className="h-2 bg-slate-100" />
              </div>
          </Card>
      </div>

      {/* Controls */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex gap-4">
            <Button 
                variant="secondary" 
                size="lg" 
                className="h-16 w-16 rounded-full shadow-2xl bg-white/95 backdrop-blur-xl border-none hover:scale-110 active:scale-95 transition-all"
                onClick={() => setIsPaused(!isPaused)}
            >
                {isPaused ? <Play className="h-8 w-8 fill-current text-blue-600" /> : <Pause className="h-8 w-8 fill-current text-blue-600" />}
            </Button>
            <Button 
                variant="destructive" 
                size="lg" 
                className="h-16 w-16 rounded-full shadow-2xl border-none hover:scale-110 active:scale-95 transition-all" 
                onClick={onExit}
            >
                <X className="h-8 w-8" />
            </Button>
      </div>

    </div>
  );
}


export default function StartNavigationPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { setIsHeaderVisible } = useNavigationUI();
  const { user } = useUser();
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const isSuperUser = profile?.role === 'Super admin';
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [routeType, setRouteType] = React.useState<'veeg' | 'prullenbak' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('--nieuwe-route--');
  
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [objectsOnRoute, setObjectsOnRoute] = React.useState<MapObject[]>([]);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isSimulationMode, setIsSimulationMode] = React.useState(false);
  const [destinationAddress, setDestinationAddress] = React.useState<string | null>(null);
  
  const mapRef = React.useRef<MapRef>(null);

  React.useEffect(() => {
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const straat = searchParams.get('straat');
    const projectIdFromUrl = searchParams.get('projectId');
    
    if (projectIdFromUrl && selectedProjectId !== projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }

    if (lat && lng && navigationState !== 'navigating') {
      const meldingObject: MapObject = {
        id: `destination-${lat}-${lng}`,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        straatnaam: straat ? decodeURIComponent(straat) : undefined,
      };
      setObjectsOnRoute([meldingObject]);
      setDestinationAddress(straat ? decodeURIComponent(straat) : null);
      setNavigationState('navigating');
    }
  }, [searchParams, selectedProjectId, setSelectedProjectId, navigationState]);

  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: allObjects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<ProjectWithRoutes>(projectsCollection);

  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

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

  const objectsOnMap = React.useMemo(() => {
    if (!selectedRouteDef || !allObjects) return [];
    return allObjects.filter(obj => 
      obj.locatieWerkgebieden && obj.locatieWerkgebieden.includes(selectedRouteDef.naam)
    );
  }, [selectedRouteDef, allObjects]);

  const routeGeoJSON = React.useMemo(() => {
    if (!selectedRouteDef) return null;
    try {
      const features = JSON.parse(selectedRouteDef.subGebieden);
      if (Array.isArray(features) && features.length > 0) {
        return { type: 'FeatureCollection' as const, features: features.map((f: any) => ({ type: 'Feature' as const, properties: {}, geometry: f.geometry })) };
      }
    } catch (e) { console.error('Invalid GeoJSON', e); }
    return null;
  }, [selectedRouteDef]);

  const handleMapClick = (e: any) => {
      if (navigationState === 'setup') {
          setUserLocation({
              latitude: e.lngLat.lat,
              longitude: e.lngLat.lng
          });
      }
  };

  React.useEffect(() => {
      const map = mapRef.current?.getMap();
      if (!map || !selectedRouteDef) return;

      const fit = () => {
          let features: any[] = [];
          if (routeGeoJSON?.features) features = [...features, ...routeGeoJSON.features];
          if (objectsOnMap.length > 0) {
              features = [...features, ...objectsOnMap.map(obj => turf.point([obj.longitude, obj.latitude]))];
          }

          if (features.length > 0) {
              try {
                  const collection = turf.featureCollection(features);
                  const bbox = turf.bbox(collection);
                  if (bbox[0] !== Infinity && !isNaN(bbox[0])) {
                      map.fitBounds(bbox as [number, number, number, number], { padding: 100, duration: 1000, maxZoom: 16 });
                  }
              } catch(e) {}
          }
      };

      if (map.isStyleLoaded()) fit();
      else map.once('style.load', fit);
  }, [selectedRouteId, routeGeoJSON, objectsOnMap]);

  const handleStartRoute = async (simulate = false) => {
    let startLoc = userLocation;
    setIsSimulationMode(simulate);
    
    if (simulate && !startLoc && objectsOnMap.length > 0) {
        startLoc = { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };
        setUserLocation(startLoc);
    }

    if (!startLoc && !simulate) {
        alert("Kon uw locatie niet bepalen. Klik op de kaart om een startpunt te kiezen of zet GPS aan.");
        return;
    }

    if (!selectedProjectId || !selectedRouteDef || !allObjects || !user) return;

    setIsStarting(true);
    
    if (objectsOnMap.length === 0) {
        alert("Geen objecten gevonden voor deze route.");
        setIsStarting(false);
        return;
    }

    const startCoords = startLoc || { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };

    const sortedObjects = [...objectsOnMap].sort((a, b) => {
        const distA = turf.distance(turf.point([startCoords.longitude, startCoords.latitude]), turf.point([a.longitude, a.latitude]));
        const distB = turf.distance(turf.point([startCoords.longitude, startCoords.latitude]), turf.point([b.longitude, b.latitude]));
        return distA - distB;
    });

    setObjectsOnRoute(sortedObjects);
    setNavigationState('navigating');
    setIsStarting(false);
  };
  
   const handleExitNavigation = () => {
    setNavigationState('setup');
    setObjectsOnRoute([]);
    setDestinationAddress(null);
    setIsSimulationMode(false);
    if (searchParams.has('lat') && searchParams.has('lng')) {
        router.back();
    }
  };

  const initialViewState = { longitude: 5.2913, latitude: 52.1326, zoom: 7 };
  
  if (navigationState === 'navigating') {
    return (
        <NavigatingView 
            objectsOnRoute={objectsOnRoute} 
            onExit={handleExitNavigation} 
            initialUserLocation={userLocation} 
            destinationAddress={destinationAddress}
            isSimulating={isSimulationMode}
        />
    );
  }

  return (
    <div className="w-full h-full relative bg-slate-100">
      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleMapClick}
        interactive={true}
      >
        {userLocation && (
          <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
            <div className="relative flex flex-col items-center">
              <div className="absolute h-10 w-10 rounded-full bg-green-500/30 animate-ping" />
              <div className="relative h-8 w-8 rounded-full bg-green-600 border-4 border-white shadow-xl flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-white fill-current" />
              </div>
              <span className="bg-green-600 text-white text-[10px] font-black px-2 py-1 rounded-lg mt-2 shadow-2xl uppercase tracking-widest">Startpunt</span>
            </div>
          </Marker>
        )}

        {routeGeoJSON && (
            <Source id="route-area" type="geojson" data={routeGeoJSON}>
                <Layer 
                    id="route-area-fill"
                    type="fill"
                    paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.05 }}
                />
                <Layer 
                    id="route-area-outline"
                    type="line"
                    paint={{ 'line-color': '#3b82f6', 'line-width': 1, 'line-dasharray': [2, 2] }}
                />
            </Source>
        )}
        {objectsOnMap.map(obj => (
            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude}>
                <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg" />
            </Marker>
        ))}
      </MapGL>
        
      <Card className="absolute top-4 left-4 z-10 w-full max-w-sm shadow-2xl bg-white/95 backdrop-blur border-2 border-slate-100">
        <CardHeader className="p-5 border-b bg-slate-50/50">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="h-10 w-10 hover:bg-white rounded-full">
                <ArrowLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-lg font-black uppercase tracking-tighter">Navigatie Setup</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Project Selecteren</Label>
            <Select
              value={selectedProjectId || ''}
              onValueChange={(v) => { setSelectedProjectId(v || null); setRouteType(null); setSelectedRouteId('--nieuwe-route--'); }}
              disabled={isLoadingProjects}
            >
              <SelectTrigger className="h-12 border-2 text-sm font-bold"><SelectValue placeholder="Selecteer een project" /></SelectTrigger>
              <SelectContent>
                {projects?.map((p) => (<SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type Inzet</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant={routeType === 'veeg' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('veeg'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
                className={cn("font-black h-12 border-2 uppercase tracking-tighter", routeType === 'veeg' ? "bg-blue-600 border-blue-600 shadow-md" : "border-slate-200")}
              >
                Veegwagen
              </Button>
              <Button 
                variant={routeType === 'prullenbak' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('prullenbak'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
                className={cn("font-black h-12 border-2 uppercase tracking-tighter", routeType === 'prullenbak' ? "bg-blue-600 border-blue-600 shadow-md" : "border-slate-200")}
              >
                Prullenbakken
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Route Keuze</Label>
            <Select onValueChange={setSelectedRouteId} value={selectedRouteId} disabled={!routeType}>
                <SelectTrigger className="h-12 border-2 text-sm font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="--nieuwe-route--">-- Kies een route --</SelectItem>
                    {availableRoutes.map((r: any) => (<SelectItem key={r.id} value={r.id}>{r.naam}</SelectItem>))}
                </SelectContent>
            </Select>
          </div>

          <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-2xl border-2 border-blue-100 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <Play className="h-3 w-3 text-blue-600 fill-current" />
                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Simulator Tip</p>
              </div>
              <p className="text-[11px] text-blue-800/80 dark:text-blue-300 leading-snug font-medium">Klik ergens op de kaart om het <strong>startpunt</strong> van je gesimuleerde rit te bepalen.</p>
          </div>
          
          <div className="flex flex-col gap-3 pt-2">
            <Button 
                className="w-full h-16 text-xl font-black bg-blue-600 hover:bg-blue-700 shadow-xl rounded-2xl uppercase tracking-tighter" 
                onClick={() => handleStartRoute(false)} 
                disabled={!selectedRouteId || selectedRouteId === '--nieuwe-route--' || isStarting}
            >
                {isStarting ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : <svg viewBox="0 0 24 24" className="mr-3 h-6 w-6 fill-current"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" /></svg>}
                START LIVE RIT
            </Button>
            
            {isSuperUser && (
                <Button 
                    variant="outline" 
                    className="w-full h-14 border-dashed border-2 border-blue-200 text-blue-600 hover:bg-blue-50/50 font-black uppercase tracking-tighter rounded-2xl" 
                    onClick={() => handleStartRoute(true)} 
                    disabled={!selectedRouteId || selectedRouteId === '--nieuwe-route--' || isStarting}
                >
                    <Gauge className="mr-2 h-5 w-5" />
                    SIMULATOR STARTEN
                </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
