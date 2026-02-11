'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef, FillLayer, LineLayer } from 'react-map-gl';
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
import { ArrowLeft, X, ArrowUp, Play, Navigation as NavigationIcon, CheckCircle2, Pause, MapPin } from 'lucide-react';
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

// Helper to calculate bearing between two points
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
    const startLat = (lat1 * Math.PI) / 180;
    const startLng = (lon1 * Math.PI) / 180;
    const endLat = (lat2 * Math.PI) / 180;
    const endLng = (lon2 * Math.PI) / 180;

    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
              Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
}

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
    'line-width': 8,
    'line-opacity': 0.8,
  },
};

const routeAreaFillLayer: FillLayer = {
    id: 'route-area-fill',
    type: 'fill',
    paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.05,
    },
};

const routeAreaOutlineLayer: LineLayer = {
    id: 'route-area-outline',
    type: 'line',
    paint: {
        'line-color': '#3b82f6',
        'line-width': 1,
        'line-dasharray': [2, 2]
    },
};


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
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const { toast } = useToast();
  
  const [viewState, setViewState] = React.useState({
    pitch: 65,
    bearing: 0,
    zoom: 18,
    latitude: initialUserLocation?.latitude || 52.1326,
    longitude: initialUserLocation?.longitude || 5.2913,
  });

  const nextObject = objectsOnRoute[currentObjectIndex];

  // Real Geolocation Watcher
  React.useEffect(() => {
    if (isSimulating) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading } = position.coords;
        setUserLocation({ latitude, longitude, speed, heading });
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
  }, [isSimulating, toast]);

  // Simulation Logic: Smoothly follow the road geometry
  React.useEffect(() => {
    if (!isSimulating || isPaused || !currentRouteGeometry || !nextObject) return;

    const coords = currentRouteGeometry.coordinates;
    if (coords.length < 2) return;

    const line = turf.lineString(coords);
    const totalDistance = turf.length(line, { units: 'meters' });
    let distanceTravelled = 0;
    const speedMs = 12.5; // ~45 km/h
    const tickRate = 30; // 30ms intervals (~33 fps)
    
    const interval = setInterval(() => {
        distanceTravelled += (speedMs * tickRate) / 1000;
        
        if (distanceTravelled >= totalDistance) {
            // Arrival detection at end of geometry
            const finalCoord = coords[coords.length - 1];
            setUserLocation({
                latitude: finalCoord[1],
                longitude: finalCoord[0],
                speed: 0,
                heading: null
            });
            clearInterval(interval);
            return;
        }

        const currentPoint = turf.along(line, distanceTravelled, { units: 'meters' });
        const lookAheadPoint = turf.along(line, Math.min(distanceTravelled + 5, totalDistance), { units: 'meters' });
        
        const [lng, lat] = currentPoint.geometry.coordinates;
        const [nextLng, nextLat] = lookAheadPoint.geometry.coordinates;
        
        const heading = calculateBearing(lat, lng, nextLat, nextLng);

        setUserLocation({
            latitude: lat,
            longitude: lng,
            speed: speedMs,
            heading: heading
        });
    }, tickRate);

    return () => clearInterval(interval);
  }, [isSimulating, isPaused, currentRouteGeometry, nextObject]);

  // Update Map perspective based on position
  React.useEffect(() => {
    if (!userLocation || !nextObject) return;

    const effectiveHeading = userLocation.heading !== null 
        ? userLocation.heading 
        : calculateBearing(userLocation.latitude, userLocation.longitude, nextObject.latitude, nextObject.longitude);

    setViewState(prev => ({
      ...prev,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      bearing: effectiveHeading,
    }));

    // Only use flyTo for non-simulated updates to keep real GPS movements smooth
    // For simulation, the state update cycle at 30ms is enough for react-map-gl to render smoothly
    if (!isSimulating) {
        mapRef.current?.flyTo({ 
            center: [userLocation.longitude, userLocation.latitude], 
            bearing: effectiveHeading,
            pitch: 65,
            zoom: 18,
            duration: 1000,
            essential: true
        });
    }
  }, [userLocation, nextObject, isSimulating]);

  // Fetch Route Data from Directions API
  React.useEffect(() => {
    if (!userLocation || !nextObject) return;
    
    const fetchRoute = async () => {
      const { longitude, latitude } = userLocation;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${longitude},${latitude};${nextObject.longitude},${nextObject.latitude}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          setCurrentRouteGeometry(data.routes[0].geometry);
          setCurrentLeg(data.routes[0].legs[0]);
        }
      } catch (error) {
        console.error("Error fetching directions:", error);
      }
    };
    
    fetchRoute();
  }, [nextObject?.id]); // Re-fetch when we target a new object
  
  // Arrival Detection (Real World)
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
            <h1 className="text-2xl font-bold">Route Voltooid!</h1>
            <p className="text-muted-foreground">{completedObjects.length} van de {objectsOnRoute.length} objecten succesvol afgerond.</p>
            <Button onClick={onExit} size="lg">Terug naar overzicht</Button>
        </div>
    )
  }

  const speedKmh = userLocation?.speed ? (userLocation.speed * 3.6).toFixed(0) : 0;
  const firstStep = currentLeg?.steps?.[0];
  const distanceRemaining = currentLeg?.distance || 0;

  return (
    <div className="w-full h-full relative">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {userLocation && (
          <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
            <div className="relative flex items-center justify-center">
                <div className="absolute h-12 w-12 bg-blue-500/20 rounded-full animate-pulse" />
                <div className="h-10 w-10 bg-blue-600 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-transform duration-150" style={{ transform: `rotate(${userLocation.heading || 0}deg)` }}>
                    <NavigationIcon className="h-5 w-5 text-white fill-current" />
                </div>
            </div>
          </Marker>
        )}
        {objectsOnRoute.map((obj, idx) => (
            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center">
                <div className={cn(
                    "w-5 h-5 rounded-full border-4 border-white shadow-md flex items-center justify-center text-[8px] font-bold text-white",
                    idx < currentObjectIndex ? "bg-green-500" : (idx === currentObjectIndex ? "bg-blue-600 scale-125" : "bg-slate-400")
                )}>
                    {idx + 1}
                </div>
            </Marker>
        ))}
        {currentRouteGeometry && (
          <Source id="route-line" type="geojson" data={currentRouteGeometry}>
            <Layer {...routeLayer} />
          </Source>
        )}
      </MapGL>
      
      {/* Simulation Controls */}
      {isSimulating && (
          <div className="absolute top-4 right-4 z-10">
              <Button 
                variant="secondary" 
                size="lg" 
                className="h-12 w-12 rounded-full shadow-xl bg-white/90 backdrop-blur border-2"
                onClick={() => setIsPaused(!isPaused)}
              >
                  {isPaused ? <Play className="h-6 w-6 fill-current" /> : <Pause className="h-6 w-6 fill-current" />}
              </Button>
          </div>
      )}

      {/* UI Overlays */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-4">
        {firstStep && (
            <Card className="bg-primary text-primary-foreground w-72 shadow-2xl border-none">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="bg-white/20 p-2 rounded-lg">
                        <ArrowUp className="h-10 w-10 shrink-0"/>
                    </div>
                    <div>
                        <p className="text-3xl font-black">{distanceRemaining > 1000 ? `${(distanceRemaining/1000).toFixed(1)} km` : `${Math.round(distanceRemaining)} m`}</p>
                        <p className="text-xs font-bold uppercase tracking-wider opacity-80 line-clamp-2">{firstStep.maneuver.instruction}</p>
                    </div>
                </CardContent>
            </Card>
        )}
         <Card className="w-72 shadow-xl bg-white/95 backdrop-blur border-2">
            <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex justify-between items-center">
                    <span>{isSimulating ? "SIMULATIE" : "LIVE NAVIGATIE"}</span>
                    {isPaused && <span className="text-red-500 animate-pulse">GEPAUZEERD</span>}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
                <div className="flex flex-col w-full gap-3">
                    <div className="flex flex-col">
                        <div className="flex justify-between text-[10px] font-black mb-1">
                            <span>ROUTE VOORTGANG</span>
                            <span>{completedObjects.length} / {objectsOnRoute.length}</span>
                        </div>
                        <Progress value={(completedObjects.length / objectsOnRoute.length) * 100} className="h-2" />
                    </div>
                    
                    <div className="flex items-baseline justify-center gap-1">
                        <span className="text-6xl font-black tracking-tighter">{speedKmh}</span>
                        <span className="text-lg font-bold text-muted-foreground">km/h</span>
                    </div>
                </div>
            </CardContent>
        </Card>
      </div>

       <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
            <Button variant="destructive" size="lg" className="h-16 w-16 rounded-full shadow-2xl border-4 border-white" onClick={onExit}>
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

  // Map Click handler for setting start position in simulation mode
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
  }, [selectedRouteDef, routeGeoJSON, objectsOnMap]);

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

    // Sort objects by distance from start to create a logical sequence
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
    <div className="w-full h-full relative">
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
              <div className="absolute h-8 w-8 rounded-full bg-green-500/30 animate-ping" />
              <div className="relative h-6 w-6 rounded-full bg-green-600 border-2 border-white shadow-lg flex items-center justify-center">
                  <MapPin className="h-3 w-3 text-white fill-current" />
              </div>
              <span className="bg-green-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded mt-1 shadow-md">STARTPUNT</span>
            </div>
          </Marker>
        )}

        {routeGeoJSON && (
            <Source id="route-area" type="geojson" data={routeGeoJSON}>
                <Layer {...routeAreaFillLayer} />
                <Layer {...routeAreaOutlineLayer} />
            </Source>
        )}
        {objectsOnMap.map(obj => (
            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude}>
                <div className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow-sm" />
            </Marker>
        ))}
      </MapGL>
        
      <Card className="absolute top-4 left-4 z-10 w-full max-w-sm shadow-2xl bg-white/95 backdrop-blur border-2">
        <CardHeader className="p-4 border-b">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base font-black uppercase tracking-tight">Navigatie Setup</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Stap 1: Project</Label>
            <Select
              value={selectedProjectId || ''}
              onValueChange={(v) => { setSelectedProjectId(v || null); setRouteType(null); setSelectedRouteId('--nieuwe-route--'); }}
              disabled={isLoadingProjects}
            >
              <SelectTrigger className="h-10 border-2"><SelectValue placeholder="Selecteer een project" /></SelectTrigger>
              <SelectContent>
                {projects?.map((p) => (<SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Stap 2: Type Inzet</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant={routeType === 'veeg' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('veeg'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
                className="font-bold h-10 border-2"
              >
                Veegwagen
              </Button>
              <Button 
                variant={routeType === 'prullenbak' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('prullenbak'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
                className="font-bold h-10 border-2"
              >
                Prullenbakken
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Stap 3: Selecteer Route</Label>
            <Select onValueChange={setSelectedRouteId} value={selectedRouteId} disabled={!routeType}>
                <SelectTrigger className="h-10 border-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="--nieuwe-route--">-- Kies een route --</SelectItem>
                    {availableRoutes.map((r: any) => (<SelectItem key={r.id} value={r.id}>{r.naam}</SelectItem>))}
                </SelectContent>
            </Select>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
              <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase mb-1">Tip voor simulator</p>
              <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-tight">Klik op de kaart om de <strong>startlocatie</strong> van de simulatie te bepalen.</p>
          </div>
          
          <div className="flex flex-col gap-2 pt-2">
            <Button 
                className="w-full h-14 text-lg font-black bg-blue-600 hover:bg-blue-700 shadow-lg" 
                onClick={() => handleStartRoute(false)} 
                disabled={!selectedRouteId || selectedRouteId === '--nieuwe-route--' || isStarting}
            >
                {isStarting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <NavigationIcon className="mr-2 h-5 w-5 fill-current" />}
                START LIVE RIT
            </Button>
            
            {isSuperUser && (
                <Button 
                    variant="outline" 
                    className="w-full h-12 border-dashed border-2 border-primary text-primary hover:bg-primary/5 font-black uppercase tracking-tight" 
                    onClick={() => handleStartRoute(true)} 
                    disabled={!selectedRouteId || selectedRouteId === '--nieuwe-route--' || isStarting}
                >
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    SIMULATOR STARTEN
                </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Loader2(props: any) {
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
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    )
}
