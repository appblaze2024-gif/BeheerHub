'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef, FillLayer, LineLayer } from 'react-map-gl';
import { useCollection, useFirestore, useUser } from '@/firebase';
import { collection, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, X, ArrowUp, Compass, Play, Navigation as NavigationIcon } from 'lucide-react';
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
    'line-width': 6,
    'line-opacity': 0.8,
  },
};

const routeAreaFillLayer: FillLayer = {
    id: 'route-area-fill',
    type: 'fill',
    paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.1,
    },
};

const routeAreaOutlineLayer: LineLayer = {
    id: 'route-area-outline',
    type: 'line',
    paint: {
        'line-color': '#3b82f6',
        'line-width': 1.5,
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
  const [currentRoute, setCurrentRoute] = React.useState<any>(null);
  const [currentLeg, setCurrentLeg] = React.useState<any>(null);
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
  const isSinglePointNavigation = objectsOnRoute.length === 1 && destinationAddress;

  // Effect for Simulation or Real Geolocation
  React.useEffect(() => {
    if (isSimulating) {
        let simIndex = 0;
        const interval = setInterval(() => {
            const currentPos = userLocation || { latitude: objectsOnRoute[0].latitude, longitude: objectsOnRoute[0].longitude };
            const targetPos = objectsOnRoute[currentObjectIndex];
            
            if (!targetPos) return;

            // Move user slightly towards next object
            const lerp = 0.05;
            const newLat = currentPos.latitude + (targetPos.latitude - currentPos.latitude) * lerp;
            const newLng = currentPos.longitude + (targetPos.longitude - currentPos.longitude) * lerp;
            
            setUserLocation({
                latitude: newLat,
                longitude: newLng,
                speed: 15 / 3.6, // 15 km/h
                heading: null // We'll calculate it below
            });
        }, 100);
        return () => clearInterval(interval);
    } else {
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
    }
  }, [isSimulating, objectsOnRoute, currentObjectIndex, toast]);

  // Update perspective based on location and target
  React.useEffect(() => {
    if (!userLocation || !nextObject) return;

    // Calculate heading towards next object if real heading is not available
    const effectiveHeading = userLocation.heading !== null 
        ? userLocation.heading 
        : calculateBearing(userLocation.latitude, userLocation.longitude, nextObject.latitude, nextObject.longitude);

    setViewState(prev => ({
      ...prev,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      bearing: effectiveHeading,
    }));

    mapRef.current?.flyTo({ 
      center: [userLocation.longitude, userLocation.latitude], 
      bearing: effectiveHeading,
      pitch: 65,
      zoom: 18,
      duration: isSimulating ? 150 : 1000,
      essential: true
    });
  }, [userLocation?.latitude, userLocation?.longitude, nextObject?.id, isSimulating]);

  // Fetch Route Data
  React.useEffect(() => {
    if (!userLocation || !nextObject) return;
    
    const fetchRoute = async () => {
      const { longitude, latitude } = userLocation;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${longitude},${latitude};${nextObject.longitude},${nextObject.latitude}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          setCurrentRoute(data.routes[0].geometry);
          setCurrentLeg(data.routes[0].legs[0]);
        }
      } catch (error) {
        console.error("Error fetching directions:", error);
      }
    };
    
    // Fetch only if needed or debounced
    const timeout = setTimeout(fetchRoute, isSimulating ? 5000 : 2000);
    return () => clearTimeout(timeout);
  }, [nextObject?.id, isSimulating]);
  
  // Check for arrival
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

  if (currentObjectIndex >= objectsOnRoute.length) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-background p-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h1 className="text-2xl font-bold">Route Voltooid!</h1>
            <p className="text-muted-foreground">{completedObjects.length} van de {objectsOnRoute.length} objecten succesvol afgerond.</p>
            <Button onClick={onExit} size="lg">Terug naar start</Button>
        </div>
    )
  }

  const speedKmh = userLocation?.speed ? (userLocation.speed * 3.6).toFixed(0) : 0;
  const firstStep = currentLeg?.steps?.[0];
  const distance = currentLeg?.distance || 0;

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
                <div className="h-8 w-8 bg-blue-600 rounded-full border-4 border-white shadow-2xl flex items-center justify-center">
                    <NavigationIcon className="h-4 w-4 text-white fill-current" />
                </div>
            </div>
          </Marker>
        )}
        {objectsOnRoute.map(obj => (
            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center">
                <div className="w-4 h-4 bg-purple-500 rounded-full border-4 border-white shadow-md" />
            </Marker>
        ))}
        {currentRoute && (
          <Source id="route-line" type="geojson" data={currentRoute}>
            <Layer {...routeLayer} />
          </Source>
        )}
      </MapGL>
      
      {/* UI Overlays */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-4">
        {firstStep && (
            <Card className="bg-primary text-primary-foreground w-72 shadow-2xl border-none">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="bg-white/20 p-2 rounded-lg">
                        <ArrowUp className="h-10 w-10 shrink-0"/>
                    </div>
                    <div>
                        <p className="text-3xl font-black">{distance > 1000 ? `${(distance/1000).toFixed(1)} km` : `${Math.round(distance)} m`}</p>
                        <p className="text-xs font-bold uppercase tracking-wider opacity-80">{firstStep.maneuver.instruction}</p>
                    </div>
                </CardContent>
            </Card>
        )}
         <Card className="w-72 shadow-xl">
            <CardHeader className="p-4 pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {isSimulating ? "SIMULATIE ACTIEF" : (isSinglePointNavigation ? "BESTEMMING" : "ROUTE VOORTGANG")}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <div className="flex justify-between items-center mb-2 min-h-[20px]">
                    {isSinglePointNavigation ? (
                        <p className="text-sm font-bold truncate">{destinationAddress}</p>
                    ) : (
                        <div className="flex flex-col w-full">
                            <div className="flex justify-between text-xs font-bold mb-1">
                                <span>{completedObjects.length} / {objectsOnRoute.length}</span>
                                <span>{Math.round((completedObjects.length / objectsOnRoute.length) * 100)}%</span>
                            </div>
                            <Progress value={(completedObjects.length / objectsOnRoute.length) * 100} className="h-1.5" />
                        </div>
                    )}
                </div>
                <div className="flex items-baseline justify-center gap-1 mt-4">
                    <span className="text-6xl font-black tracking-tighter">{speedKmh}</span>
                    <span className="text-lg font-bold text-muted-foreground">km/h</span>
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

function CheckCircle2(props: any) {
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
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
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

  const routeHistoryQuery = React.useMemo(() => {
      if (!firestore || !user || !selectedProjectId) return null;
      return query(
          collection(firestore, 'users', user.uid, 'routes'),
          where('projectId', '==', selectedProjectId)
      );
  }, [firestore, user, selectedProjectId]);

  const { data: routeHistory, isLoading: isLoadingRouteHistory } = useCollection<Route>(routeHistoryQuery);
  
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

    const historyItem = routeHistory?.find(r => r.id === selectedRouteId);
    const originalId = historyItem ? historyItem.originalRouteId : selectedRouteId;

    const allRoutes = [...(selectedProject.veegroutes || []), ...(selectedProject.prullenbakkenroutes || [])];
    return allRoutes.find(r => r.id === originalId) ?? null;
  }, [selectedRouteId, routeHistory, selectedProject]);

  const objectsOnMap = React.useMemo(() => {
    if (!selectedRouteDef || !allObjects) {
      return [];
    }
    
    const routeName = selectedRouteDef.naam;
    if (!routeName) return [];

    return allObjects.filter(obj => 
      obj.locatieWerkgebieden && obj.locatieWerkgebieden.includes(routeName)
    );
  }, [selectedRouteDef, allObjects]);

  const routeGeoJSON = React.useMemo(() => {
    if (!selectedRouteDef) return null;
    try {
      const features = JSON.parse(selectedRouteDef.subGebieden);
      if (Array.isArray(features) && features.length > 0) {
        return {
          type: 'FeatureCollection' as const,
          features: features.map((feature: any) => ({
            type: 'Feature' as const,
            properties: {},
            geometry: feature.geometry,
          })),
        };
      }
    } catch (e) {
      console.error('Invalid GeoJSON for wijk(en)', e);
    }
    return null;
  }, [selectedRouteDef]);

  // Handle automatic map fitting/zooming when a route is selected
  React.useEffect(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const fit = () => {
          let features: any[] = [];
          if (routeGeoJSON?.features) features = [...features, ...routeGeoJSON.features];
          if (objectsOnMap && objectsOnMap.length > 0) {
              const objectPoints = objectsOnMap.map(obj => turf.point([obj.longitude, obj.latitude]));
              features = [...features, ...objectPoints];
          }

          if (features.length > 0) {
              try {
                  const collection = turf.featureCollection(features);
                  const bbox = turf.bbox(collection);
                  if (bbox[0] !== Infinity && !isNaN(bbox[0])) {
                      map.fitBounds(bbox as [number, number, number, number], { 
                          padding: 100, 
                          duration: 1000,
                          maxZoom: 16 
                      });
                  }
              } catch(e) {
                  console.error("Error fitting bounds", e);
              }
          }
      };

      if (map.isStyleLoaded()) fit();
      else map.once('style.load', fit);
  }, [routeGeoJSON, objectsOnMap]);

  React.useEffect(() => {
    setIsHeaderVisible(navigationState !== 'navigating');
    
    if (navigationState === 'setup') {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
        }),
        (error) => console.error("Error getting location:", error),
        { enableHighAccuracy: true }
      );
    }
    
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible, navigationState]);

  const handleStartRoute = async (simulate = false) => {
    let startLoc = userLocation;
    setIsSimulationMode(simulate);
    
    if (simulate && !startLoc && objectsOnMap.length > 0) {
        startLoc = { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };
        setUserLocation(startLoc);
    }

    if (!startLoc && !simulate) {
        alert("Kon uw locatie niet bepalen. Zorg ervoor dat GPS aan staat.");
        return;
    }

    if (!selectedProjectId || !selectedRouteDef || !allObjects || !user) return;

    setIsStarting(true);
    
    const filteredObjects = objectsOnMap;

    if (filteredObjects.length === 0) {
        alert("Geen objecten gevonden voor deze route.");
        setIsStarting(false);
        return;
    }

    const startCoords = startLoc || { latitude: objectsOnMap[0].latitude, longitude: objectsOnMap[0].longitude };

    const sortedObjects = filteredObjects.sort((a, b) => {
        const distA = turf.distance(turf.point([startCoords.longitude, startCoords.latitude]), turf.point([a.longitude, a.latitude]));
        const distB = turf.distance(turf.point([startCoords.longitude, startCoords.latitude]), turf.point([b.longitude, b.latitude]));
        return distA - distB;
    });

    try {
        const routeHistoryCol = collection(firestore, 'users', user.uid, 'routes');
        await addDoc(routeHistoryCol, {
            userId: user.uid,
            projectId: selectedProjectId,
            originalRouteId: selectedRouteDef.id,
            routeName: selectedRouteDef.naam,
            date: new Date().toISOString().split('T')[0],
            startTime: new Date().toISOString(),
            allObjectIds: sortedObjects.map(o => o.id),
            totalObjects: sortedObjects.length,
        });
    } catch (e) {
        console.error("Error saving route history:", e);
    }
    
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
    } else {
        router.push('/navigation-module');
    }
  };

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };
  
  if (userLocation) {
    initialViewState.longitude = userLocation.longitude;
    initialViewState.latitude = userLocation.latitude;
    initialViewState.zoom = 12;
  }
  
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
        interactive={true}
      >
        {userLocation && (
          <Marker
            longitude={userLocation.longitude}
            latitude={userLocation.latitude}
            anchor="center"
          >
            <div className="relative flex h-5 w-5 items-center justify-center">
              <div className="absolute h-6 w-6 rounded-full bg-blue-500/50 animate-pulse" />
              <div className="relative h-4 w-4 rounded-full bg-blue-600 border-2 border-white" />
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
                <div className="w-2 h-2 bg-purple-600 rounded-full" />
            </Marker>
        ))}

      </MapGL>
        
      <Card className="absolute top-4 left-4 z-10 w-full max-w-sm shadow-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-lg">Navigatie Starten</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Project</Label>
            <Select
              value={selectedProjectId || ''}
              onValueChange={(value) => {
                setSelectedProjectId(value || null);
                setRouteType(null);
                setSelectedRouteId('--nieuwe-route--');
              }}
              disabled={isLoadingProjects}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecteer een project" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id!}>
                    {project.projectnaam} [{project.projectnummer}]
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Type Route</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant={routeType === 'veeg' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('veeg'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
                className="font-bold"
              >
                Veegwagen
              </Button>
              <Button 
                variant={routeType === 'prullenbak' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('prullenbak'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
                className="font-bold"
              >
                Prullenbakken
              </Button>
            </div>
          </div>
          
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-black tracking-tighter">
              <span className="bg-card px-2 text-muted-foreground">Historie</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Selecteer Route</Label>
            <Select onValueChange={setSelectedRouteId} value={selectedRouteId} disabled={!routeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="--nieuwe-route--">-- Kies een route --</SelectItem>
                    {availableRoutes.map((route: Veegroute | Prullenbakkenroute) => (
                        <SelectItem key={route.id} value={route.id}>
                            {route.naam}
                        </SelectItem>
                    ))}
                    {routeHistory && routeHistory.length > 0 && (
                        <>
                            <Separator className='my-1' />
                            <Label className="px-2 py-1.5 text-xs text-muted-foreground font-normal italic">Onlangs gereden</Label>
                            {routeHistory.map((route: Route) => (
                                <SelectItem key={route.id} value={route.id}>
                                    {route.routeName}
                                </SelectItem>
                            ))}
                        </>
                    )}
                </SelectContent>
            </Select>
          </div>
          
          <div className="flex flex-col gap-3 pt-4">
            <Button 
                className="w-full h-12 text-lg font-black" 
                onClick={() => handleStartRoute(false)} 
                disabled={!selectedProjectId || !routeType || !selectedRouteId || selectedRouteId === '--nieuwe-route--' || isLoadingObjects || isStarting}
            >
                {isStarting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
                START ROUTE
            </Button>
            
            {isSuperUser && (
                <Button 
                    variant="outline" 
                    className="w-full h-12 border-dashed border-primary text-primary hover:bg-primary/5 font-black uppercase tracking-tight" 
                    onClick={() => handleStartRoute(true)} 
                    disabled={!selectedProjectId || !routeType || !selectedRouteId || selectedRouteId === '--nieuwe-route--' || isLoadingObjects || isStarting}
                >
                    <Play className="mr-2 h-4 w-4" />
                    Simulatie Modus (Demo)
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
