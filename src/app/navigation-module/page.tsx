'use client';

import * as React from 'react';
import Map, { Marker, Source, Layer, Popup } from 'react-map-gl';
import {
  Search,
  Navigation,
  Loader2,
  MapPin,
  List,
  LocateFixed,
  X,
  Mic,
  Settings,
  Volume2,
  CheckCircle,
  ChevronRight,
  Clock,
  Route,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as turf from '@turf/turf';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MapObject {
    id: string;
    latitude: number;
    longitude: number;
    [key: string]: any;
}

interface Wijk {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
};

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
};


const routeLayer: any = {
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
    'line-opacity': 0.9,
  },
};

export default function NavigationModulePage() {
  const mapRef = React.useRef<any>();
  const firestore = useFirestore();
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913, // Default center of NL
    latitude: 52.1326,
    zoom: 7,
  });
  
  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);
  
  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: objects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const [origin, setOrigin] = React.useState<[number, number] | null>(null);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [route, setRoute] = React.useState<any>(null);
  const [isCalculating, setIsCalculating] = React.useState(false);
  const [isNavigating, setIsNavigating] = React.useState(false);
  const [destination, setDestination] = React.useState<MapObject | null>(null);
  
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);
  
  const watchIdRef = React.useRef<number | null>(null);
  
  const [pendingObjects, setPendingObjects] = React.useState<MapObject[]>([]);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [currentTime, setCurrentTime] = React.useState('');

  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const projectWijken = React.useMemo(() => {
    if (!selectedProject?.wijken) return [];
    return selectedProject.wijken.filter(w => 
      !w.naam.toLowerCase().includes('veegmachine') && !w.naam.toLowerCase().includes('voorvegen')
    ).sort((a, b) => a.naam.localeCompare(b.naam, undefined, { numeric: true }));
  }, [selectedProject]);
  
  const selectedWijk = React.useMemo(() => {
      if (!selectedProject || !selectedWijkId) return null;
      return selectedProject.wijken?.find(w => w.id === selectedWijkId) ?? null;
  }, [selectedProject, selectedWijkId]);
  
  const objectsInWijk = React.useMemo(() => {
    if (!objects || !selectedWijk) return [];

    try {
        const wijkFeatures = JSON.parse(selectedWijk.subGebieden);
        if (!Array.isArray(wijkFeatures) || wijkFeatures.length === 0) return [];

        return objects.filter(obj => {
            if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') {
                return false;
            }
            const point = turf.point([obj.longitude, obj.latitude]);
            for (const feature of wijkFeatures) {
                if (turf.booleanPointInPolygon(point, feature)) {
                    return true;
                }
            }
            return false;
        });
    } catch(e) {
        console.error("Error filtering objects in wijk:", e);
        return [];
    }
  }, [objects, selectedWijk]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { longitude, latitude } = position.coords;
          setOrigin([longitude, latitude]);
          setViewState(prev => ({...prev, longitude, latitude, zoom: 14}));
          setLocationError(null);
        },
        () => {
          setLocationError("Kon uw locatie niet ophalen. Zorg ervoor dat u locatietoestemming heeft gegeven.");
          setOrigin([5.4697, 51.4416]); 
        }
      );
    } else {
      setLocationError("Geolocatie wordt niet ondersteund door deze browser.");
      setOrigin([5.4697, 51.4416]); 
    }
  }, []);

  React.useEffect(() => {
    if (selectedWijk && mapRef.current) {
      try {
        const features = JSON.parse(selectedWijk.subGebieden);
        if (!Array.isArray(features) || features.length === 0) return;

        const featureCollection = turf.featureCollection(features);
        const bbox = turf.bbox(featureCollection);
        
        if (bbox[0] !== Infinity) {
          mapRef.current.getMap().fitBounds(bbox, {
            padding: { top: 100, bottom: 100, left: 500, right: 100 },
            duration: 1000
          });
        }
      } catch (error) {
        console.error("Error calculating bounding box for wijk:", error);
      }
    }
  }, [selectedWijk]);

  const calculateRoute = async (points: [number, number][]) => {
    if (points.length < 2) return;
    setIsCalculating(true);
    setRoute(null);

    const limitedPoints = points.slice(0, 25);

    try {
        const coordinates = limitedPoints.map(p => p.join(',')).join(';');
        const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
        );
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            const routeGeometry = data.routes[0].geometry;
            setRoute({
                type: 'Feature',
                properties: {},
                geometry: routeGeometry,
            });
        }
    } catch (error) {
        console.error('Error calculating route:', error);
    } finally {
        setIsCalculating(false);
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      console.log("Geolocation is not supported by this browser.");
      return;
    }
    
    if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { longitude, latitude, heading } = position.coords;
        setOrigin([longitude, latitude]);

        const map = mapRef.current?.getMap();
        if (map) {
          map.easeTo({
            center: [longitude, latitude],
            bearing: heading ?? map.getBearing(),
            zoom: 20,
            pitch: 60,
            duration: 500
          });
        }
      },
      (error) => {
        console.error("Error watching position:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
    }
  };
  
  const findNextObject = (currentOrigin: [number, number], availableObjects: MapObject[]): MapObject | null => {
      if (!currentOrigin || availableObjects.length === 0) return null;
      
      const from = turf.point(currentOrigin);
      let closestObject: MapObject | null = null;
      let minDistance = Infinity;

      availableObjects.forEach(obj => {
          if (obj.latitude != null && obj.longitude != null) {
              const to = turf.point([obj.longitude, obj.latitude]);
              const distance = turf.distance(from, to, { units: 'kilometers' });
              if (distance < minDistance) {
                  minDistance = distance;
                  closestObject = obj;
              }
          }
      });
      return closestObject;
  }

  const handleStartNavigation = () => {
    if (!origin || objectsInWijk.length === 0) return;
    
    setPendingObjects(objectsInWijk);
    setCompletedObjects([]);
    setIsNavigating(true);

    const firstObject = findNextObject(origin, objectsInWijk);
    
    if (firstObject) {
      setDestination(firstObject);
      const routePoints: [number, number][] = [
        origin,
        [firstObject.longitude, firstObject.latitude]
      ];
      calculateRoute(routePoints);
    }

    startTracking();

    mapRef.current?.getMap().flyTo({
        center: origin,
        zoom: 20,
        pitch: 60,
        bearing: 0,
    });
  };
  
  const handleNextObject = () => {
    if (!origin || !destination) return;
    
    // Mark current destination as complete
    const newCompleted = [...completedObjects, destination.id];
    setCompletedObjects(newCompleted);

    // Find next closest from pending objects
    const newPending = pendingObjects.filter(obj => !newCompleted.includes(obj.id));
    setPendingObjects(newPending);

    const nextObject = findNextObject(origin, newPending);

    if (nextObject) {
      setDestination(nextObject);
      const routePoints: [number, number][] = [origin, [nextObject.longitude, nextObject.latitude]];
      calculateRoute(routePoints);
    } else {
      // All objects are done
      setDestination(null);
      setRoute(null);
    }
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
    setRoute(null);
    setDestination(null);
    setPendingObjects([]);
    setCompletedObjects([]);
    stopTracking();
    
    setViewState(prev => ({ ...prev, pitch: 0, bearing: 0, zoom: 14 }));
     if(origin) {
        mapRef.current?.getMap().flyTo({
            center: origin,
            zoom: 14,
            pitch: 0,
            bearing: 0,
        });
     }
  }

  const centerOnLocation = () => {
    if (origin) {
        mapRef.current?.getMap().flyTo({
            center: origin,
            zoom: isNavigating ? 20 : 15,
            pitch: isNavigating ? 60 : 0,
        });
    }
  };
  
  const progressValue = objectsInWijk.length > 0 ? (completedObjects.length / objectsInWijk.length) * 100 : 0;
  const allObjectsCompleted = pendingObjects.length === 0 && completedObjects.length > 0 && objectsInWijk.length > 0;


  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 relative bg-gray-800">
        {!isNavigating && (
            <div className="absolute top-4 left-4 z-10 bg-card/90 backdrop-blur-sm p-4 rounded-lg shadow-lg w-full max-w-sm text-card-foreground">
                <h2 className="text-lg font-bold mb-2">Navigatie per Wijk</h2>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="project-select">Project</Label>
                        <Select
                        value={selectedProjectId || ''}
                        onValueChange={(value) => {
                            setSelectedProjectId(value);
                            setSelectedWijkId(null);
                            setRoute(null);
                        }}
                        disabled={isLoadingProjects}
                        >
                        <SelectTrigger id="project-select">
                            <SelectValue placeholder="Selecteer een project" />
                        </SelectTrigger>
                        <SelectContent>
                            {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>)}
                        </SelectContent>
                        </Select>
                    </div>
                    <div>
                    <Label htmlFor='wijk-select'>Wijk</Label>
                        <Select
                            value={selectedWijkId || ''}
                            onValueChange={v => setSelectedWijkId(v)}
                            disabled={!selectedProject}
                        >
                            <SelectTrigger id="wijk-select">
                                <SelectValue placeholder="Selecteer een wijk" />
                            </SelectTrigger>
                            <SelectContent>
                                {projectWijken.map(w => (
                                <SelectItem key={w.id} value={w.id}>
                                    {w.naam} ({objects?.filter(obj => {
                                        if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
                                        const point = turf.point([obj.longitude, obj.latitude]);
                                        try {
                                            const features = JSON.parse(w.subGebieden);
                                            return features.some((f:any) => turf.booleanPointInPolygon(point, f));
                                        } catch { return false; }
                                    }).length})
                                </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleStartNavigation} disabled={!selectedWijkId || objectsInWijk.length === 0 || isCalculating}>
                        {isCalculating ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Bezig...</>
                        ) : 'Start Route'}
                    </Button>
                </div>
            </div>
        )}
        
        {isNavigating && (
             <div className="absolute top-4 left-4 z-10 w-64">
                <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg">
                    <div className="flex items-center gap-4">
                        <Navigation className="h-10 w-10 transform -rotate-45" />
                        <div>
                            <p className="text-3xl font-bold">500m</p>
                            <p className="text-lg">Volgende afslag</p>
                        </div>
                    </div>
                </div>
             </div>
        )}
        
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
            <Button onClick={centerOnLocation} variant="secondary" size="icon" className="bg-card/80 border-stone-300 text-card-foreground hover:bg-muted shadow-lg">
                <LocateFixed className="h-5 w-5" />
            </Button>
            {isNavigating && (
                <>
                 <Button variant="secondary" size="icon" className="bg-card/80 border-stone-300 text-card-foreground hover:bg-muted shadow-lg">
                    <Volume2 className="h-5 w-5" />
                </Button>
                 <Button variant="secondary" size="icon" className="bg-card/80 border-stone-300 text-card-foreground hover:bg-muted shadow-lg">
                    <Settings className="h-5 w-5" />
                </Button>
                </>
            )}
        </div>
        
        {locationError && !isNavigating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-md z-20">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Locatie Fout</AlertTitle>
              <AlertDescription>{locationError}</AlertDescription>
            </Alert>
          </div>
        )}

        {isNavigating && (
             <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between items-end">
                <div className='flex flex-col gap-2'>
                    <div className="bg-card/90 backdrop-blur-sm p-2 rounded-lg shadow-lg text-card-foreground">
                        <div className="flex justify-between items-center mb-1 px-1">
                            <p className="font-semibold text-xs">Voortgang</p>
                            <p className="font-semibold text-xs">{completedObjects.length} / {objectsInWijk.length} objecten</p>
                        </div>
                        <Progress value={progressValue} className='h-2' />
                    </div>
                    <div className="bg-card/90 backdrop-blur-sm p-3 rounded-lg shadow-lg flex items-center gap-4 text-card-foreground">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            <span className="font-bold text-lg">{currentTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Route className="h-5 w-5" />
                            <span>52 km</span>
                        </div>
                         <div className="text-muted-foreground text-sm">
                            13:15 aankomst
                        </div>
                    </div>
                </div>
                 <div className="flex items-end gap-4">
                    {allObjectsCompleted ? (
                       <div className='flex items-center gap-2 bg-green-600 text-white font-bold p-3 rounded-lg shadow-lg'>
                            <CheckCircle className="h-6 w-6" />
                            <span>Route Voltooid!</span>
                       </div>
                    ) : (
                        <Button size="lg" onClick={handleNextObject} disabled={!destination}>
                            Volgende Object <ChevronRight className="h-5 w-5 ml-2" />
                        </Button>
                    )}

                    <Button variant="destructive" size="icon" className="rounded-full h-12 w-12" onClick={handleStopNavigation}>
                        <X className="h-6 w-6" />
                    </Button>
                </div>
            </div>
        )}


        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {origin && (
            <Marker longitude={origin[0]} latitude={origin[1]}>
              <div className="p-1 bg-blue-500 rounded-full border-4 border-white shadow-md flex items-center justify-center">
                <Navigation className="w-5 h-5 text-white transform -rotate-45" />
              </div>
            </Marker>
          )}
          
          {isNavigating && destination && (
            <Marker
              longitude={destination.longitude}
              latitude={destination.latitude}
              anchor="bottom"
            >
              <MapPin className="w-8 h-8 text-blue-600" />
            </Marker>
          )}

          {!isNavigating && objectsInWijk.map(obj => (
             <Marker
                key={obj.id}
                longitude={obj.longitude}
                latitude={obj.latitude}
             >
              <div className={cn("w-2.5 h-2.5 rounded-full border-2 border-white", completedObjects.includes(obj.id) ? "bg-green-500" : "bg-gray-700" )} />
            </Marker>
          ))}

          {route && (
            <Source id="route" type="geojson" data={route}>
              <Layer {...routeLayer} />
            </Source>
          )}
        </Map>
      </div>
    </div>
  );
}

