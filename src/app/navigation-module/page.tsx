
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
import { ArrowLeft, X, ArrowUp, Compass } from 'lucide-react';
import { useProject } from '@/context/project-context';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter } from 'next/navigation';
import type { Project, Route, Veegroute, Prullenbakkenroute, Object as MapObject } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import * as turf from '@turf/turf';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/firebase/profile-provider';

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
    initialUserLocation 
}: { 
    objectsOnRoute: MapObject[], 
    onExit: () => void,
    initialUserLocation: { latitude: number; longitude: number; } | null
}) {
  const mapRef = React.useRef<MapRef>(null);
  const [userLocation, setUserLocation] = React.useState<{ latitude: number, longitude: number, speed: number | null } | null>(initialUserLocation ? { ...initialUserLocation, speed: 0 } : null);
  const [currentObjectIndex, setCurrentObjectIndex] = React.useState(0);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [currentRoute, setCurrentRoute] = React.useState<any>(null);
  const [currentLeg, setCurrentLeg] = React.useState<any>(null);
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  const [viewState, setViewState] = React.useState({
    pitch: 60,
    bearing: 0,
    zoom: 17,
    latitude: initialUserLocation?.latitude || 52.1326,
    longitude: initialUserLocation?.longitude || 5.2913,
  });

  const nextObject = objectsOnRoute[currentObjectIndex];

  // Effect for Geolocation
  React.useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed: position.coords.speed,
        });
        mapRef.current?.flyTo({ center: [position.coords.longitude, position.coords.latitude], duration: 1000 });
      },
      (error) => console.error("Error watching position:", error),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const fetchRouteTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Debounced effect to fetch the route
  React.useEffect(() => {
    if (!userLocation || !nextObject) return;
    
    // If a timeout is already scheduled, clear it
    if (fetchRouteTimeoutRef.current) {
      clearTimeout(fetchRouteTimeoutRef.current);
    }
    
    // Schedule a new fetch after a delay
    fetchRouteTimeoutRef.current = setTimeout(() => {
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
      fetchRoute();
    }, 1500); // 1.5-second debounce

    // Cleanup function to clear the timeout if the component unmounts
    return () => {
      if (fetchRouteTimeoutRef.current) {
        clearTimeout(fetchRouteTimeoutRef.current);
      }
    };
  }, [userLocation, nextObject]); // Re-run effect when location or destination changes
  
  // Effect to check for arrival
  React.useEffect(() => {
    if (!userLocation || !nextObject) return;

    const userPoint = turf.point([userLocation.longitude, userLocation.latitude]);
    const objectPoint = turf.point([nextObject.longitude, nextObject.latitude]);
    const distance = turf.distance(userPoint, objectPoint, { units: 'meters' });

    if (distance < 20) { // 20 meters threshold
      setCompletedObjects(prev => [...prev, nextObject.id]);
      setCurrentObjectIndex(prev => prev + 1);
    }
  }, [userLocation, nextObject]);

  if (currentObjectIndex >= objectsOnRoute.length) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
            <h1 className="text-2xl font-bold">Route Voltooid!</h1>
            <p>{completedObjects.length} van de {objectsOnRoute.length} objecten afgerond.</p>
            <Button onClick={onExit}>Terug naar start</Button>
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
            <Compass className="h-8 w-8 text-blue-600 bg-white rounded-full p-1 shadow-lg" />
          </Marker>
        )}
        {objectsOnRoute.map(obj => (
            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} anchor="center">
                <div className="w-3 h-3 bg-purple-500 rounded-full border-2 border-white" />
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
            <Card className="bg-primary text-primary-foreground w-72">
                <CardContent className="p-4 flex items-center gap-4">
                    <ArrowUp className="h-10 w-10 shrink-0"/>
                    <div>
                        <p className="text-3xl font-bold">{distance > 1000 ? `${(distance/1000).toFixed(1)} km` : `${Math.round(distance)} m`}</p>
                        <p className="text-sm">{firstStep.maneuver.instruction}</p>
                    </div>
                </CardContent>
            </Card>
        )}
         <Card className="w-72">
            <CardHeader className="p-4">
                <CardTitle className="text-base">Voortgang</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-sm">{completedObjects.length} / {objectsOnRoute.length} objecten</p>
                </div>
                <Progress value={(completedObjects.length / objectsOnRoute.length) * 100} />
                <div className="flex items-center justify-center gap-2 mt-4">
                    <span className="text-5xl font-bold">{speedKmh}</span>
                    <span className="text-lg text-muted-foreground">km/h</span>
                </div>
            </CardContent>
        </Card>
      </div>

       <div className="absolute bottom-6 left-6 z-10">
            <Button variant="destructive" size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={onExit}>
                <X className="h-8 w-8" />
            </Button>
      </div>

    </div>
  );
}


export default function StartNavigationPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { setIsHeaderVisible } = useNavigationUI();
  const { user } = useUser();
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [routeType, setRouteType] = React.useState<'veeg' | 'prullenbak' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('--nieuwe-route--');
  
  const [navigationState, setNavigationState] = React.useState<'setup' | 'navigating'>('setup');
  const [objectsOnRoute, setObjectsOnRoute] = React.useState<MapObject[]>([]);
  const [isStarting, setIsStarting] = React.useState(false);
  
  const mapRef = React.useRef<MapRef>(null);

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
      if (Array.isArray(features)) {
        return {
          type: 'FeatureCollection',
          features: features.map((feature: any) => ({
            type: 'Feature',
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

  React.useEffect(() => {
      if (routeGeoJSON && mapRef.current) {
          try {
              const map = mapRef.current.getMap();
              if (map.isStyleLoaded()) {
                  const bbox = turf.bbox(routeGeoJSON);
                  if (bbox[0] !== Infinity) {
                      map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
                  }
              }
          } catch(e) {
              console.error("Error fitting bounds", e);
          }
      }
  }, [routeGeoJSON]);

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

  const handleStartRoute = async () => {
    if (!userLocation || !selectedProjectId || !selectedRouteDef || !allObjects || !user) return;

    setIsStarting(true);
    
    const filteredObjects = objectsOnMap;

    if (filteredObjects.length === 0) {
        alert("Geen objecten gevonden voor deze route.");
        setIsStarting(false);
        return;
    }

    const sortedObjects = filteredObjects.sort((a, b) => {
        const distA = turf.distance(turf.point([userLocation.longitude, userLocation.latitude]), turf.point([a.longitude, a.latitude]));
        const distB = turf.distance(turf.point([userLocation.longitude, userLocation.latitude]), turf.point([b.longitude, b.latitude]));
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
    return <NavigatingView objectsOnRoute={objectsOnRoute} onExit={handleExitNavigation} initialUserLocation={userLocation} />;
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
        
      <Card className="absolute top-4 left-4 z-10 w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-5 w-5" />
            </Button>
            <CardTitle>Start een nieuwe route</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
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
            <Label>Route Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant={routeType === 'veeg' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('veeg'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
              >
                Veegwagenroutes
              </Button>
              <Button 
                variant={routeType === 'prullenbak' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('prullenbak'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
              >
                Prullenbakkenroutes
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">OF</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Kies uit routegeschiedenis</Label>
            <Select onValueChange={setSelectedRouteId} value={selectedRouteId} disabled={!routeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="--nieuwe-route--">-- Nieuwe Route --</SelectItem>
                    {availableRoutes.map((route: Veegroute | Prullenbakkenroute) => (
                        <SelectItem key={route.id} value={route.id}>
                            {route.naam}
                        </SelectItem>
                    ))}
                    {routeHistory && routeHistory.length > 0 && (
                        <>
                            <Separator className='my-1' />
                            <Label className="px-2 py-1.5 text-xs text-muted-foreground font-normal">Recent</Label>
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
          
          <Button className="w-full" onClick={handleStartRoute} disabled={!selectedProjectId || !routeType || !selectedRouteId || selectedRouteId === '--nieuwe-route--' || isLoadingObjects || isStarting}>
            {isStarting ? "Route starten..." : "Start Route"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
