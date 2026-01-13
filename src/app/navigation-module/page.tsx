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
  XCircle,
  Clock,
  Route as RouteIcon,
  ArrowUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as turf from '@turf/turf';
import { useCollection, useFirestore, useUser, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, getDocs, setDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import type { Route } from 'docs/backend';
import { Separator } from '@/components/ui/separator';


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
  veegroutes?: Wijk[];
  prullenbakkenroutes?: Wijk[];
};

interface RouteInfo {
    distance: number; // in meters
    duration: number; // in seconds
}

interface RouteInstruction {
  distance: number;
  maneuver: {
    instruction: string;
    type: string;
    modifier?: string;
  }
}


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
  const { user } = useUser();
  
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913, // Default center of NL
    latitude: 52.1326,
    zoom: 7,
  });
  
  const objectsCollection = React.useMemo(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'objects');
  }, [firestore, user]);
  
  const projectsCollection = React.useMemo(() => {
      if (!firestore) return null;
      return collection(firestore, 'projects');
  }, [firestore]);

  const { data: objects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const [origin, setOrigin] = React.useState<[number, number] | null>(null);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [route, setRoute] = React.useState<any>(null);
  const [routeInfo, setRouteInfo] = React.useState<RouteInfo | null>(null);
  const [routeInstructions, setRouteInstructions] = React.useState<RouteInstruction[]>([]);
  const [isCalculating, setIsCalculating] = React.useState(false);
  const [isNavigating, setIsNavigating] = React.useState(false);
  const [destination, setDestination] = React.useState<MapObject | null>(null);
  
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedRouteType, setSelectedRouteType] = React.useState<'veeg' | 'prullenbak' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<string | null>(null);
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = React.useState(false);
  
  const watchIdRef = React.useRef<number | null>(null);
  
  const [pendingObjects, setPendingObjects] = React.useState<MapObject[]>([]);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [skippedObjects, setSkippedObjects] = React.useState<string[]>([]);
  const [currentTime, setCurrentTime] = React.useState('');
  const [activeRouteHistoryId, setActiveRouteHistoryId] = React.useState<string | null>(null);

  const userHistoryCollection = React.useMemo(() => {
    if (!firestore || !user) return null;
    return collection(firestore, `users/${user.uid}/routes`);
  }, [firestore, user]);

  const { data: historyRoutes, isLoading: isLoadingHistory } = useCollection<Route>(userHistoryCollection);
  
  const availableHistoryRoutes = React.useMemo(() => {
    if (!historyRoutes || !selectedProjectId) return [];
    return historyRoutes.filter((r) => r.projectId === selectedProjectId)
      .sort((a, b) => new Date(b.startTime.toDate()).getTime() - new Date(a.startTime.toDate()).getTime());
  }, [historyRoutes, selectedProjectId]);


  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

 const availableRoutes = React.useMemo(() => {
    if (!selectedProject) return [];
    if (selectedRouteType === 'veeg') {
      return selectedProject.veegroutes || [];
    }
    if (selectedRouteType === 'prullenbak') {
      return selectedProject.prullenbakkenroutes || [];
    }
    return [];
  }, [selectedProject, selectedRouteType]);

  const selectedRoute = React.useMemo(() => {
    if (!selectedRouteId) return null;
    // Search in all route types because we might be resuming a route
    const allRoutes = [
        ...(selectedProject?.veegroutes || []),
        ...(selectedProject?.prullenbakkenroutes || [])
    ];
    return allRoutes.find(r => r.id === selectedRouteId) ?? null;
  }, [selectedProject, selectedRouteId]);
  
  
  const objectsInWijk = React.useMemo(() => {
    if (!objects || !selectedRoute) return [];

    try {
        const wijkFeatures = JSON.parse(selectedRoute.subGebieden);
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
  }, [objects, selectedRoute]);

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
    if (selectedRoute && mapRef.current) {
      try {
        const features = JSON.parse(selectedRoute.subGebieden);
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
  }, [selectedRoute]);

  const calculateRoute = async (points: (number[] | null)[]) => {
    const validPoints = points.filter((p): p is [number, number] =>
      p != null && Array.isArray(p) && p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])
    );
  
    if (validPoints.length < 2) {
      console.error("Not enough valid points to calculate a route.");
      setRoute(null);
      setRouteInfo(null);
      setRouteInstructions([]);
      return;
    }
  
    setIsCalculating(true);
    setRoute(null);
    setRouteInfo(null);
    setRouteInstructions([]);
  
    const limitedPoints = validPoints.slice(0, 25);
  
    try {
      const coordinates = limitedPoints.map(p => p.join(',')).join(';');
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?geometries=geojson&overview=full&steps=true&language=nl&access_token=${MAPBOX_TOKEN}`
      );
  
      if (!response.ok) {
        throw new Error(`Failed to fetch route: ${response.statusText}`);
      }
  
      const data = await response.json();
      
      if (data.routes && data.routes.length > 0) {
        const currentRoute = data.routes[0];
        setRoute({
          type: 'Feature',
          properties: {},
          geometry: currentRoute.geometry,
        });
        setRouteInfo({
          distance: currentRoute.distance,
          duration: currentRoute.duration,
        });
        if (currentRoute.legs[0]?.steps) {
          setRouteInstructions(currentRoute.legs[0].steps);
        }
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
        if (map && isNavigating) { // Only easeTo when navigating
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

  const handleStartOrResume = () => {
    if (selectedHistoryId) {
      handleResumeRoute(selectedHistoryId);
    } else {
      handleStartNavigation();
    }
  };
  
  const startNewNavigationFromRoute = async (routeDefinition: any, totalObjects: number) => {
    if (!origin || !user || !firestore || !selectedProjectId) return;

    setIsCalculating(true);
    const routesCollection = collection(firestore, `users/${user.uid}/routes`);
    const newRouteDocRef = doc(routesCollection); // Create a new doc reference with a generated ID

    const newRouteHistoryData: Omit<Route, 'id'> = {
      userId: user.uid,
      projectId: selectedProjectId,
      originalRouteId: routeDefinition.id,
      routeName: routeDefinition.naam,
      date: new Date().toISOString().split('T')[0],
      startTime: serverTimestamp() as any, // Cast because SDK types can be tricky
      endTime: null,
      completedObjects: [],
      skippedObjects: [],
      totalObjects: totalObjects,
    };
    
    await setDoc(newRouteDocRef, newRouteHistoryData);
    setActiveRouteHistoryId(newRouteDocRef.id);

    // 2. Set up navigation state
    setPendingObjects(objectsInWijk || []);
    setCompletedObjects([]);
    setSkippedObjects([]);
    setIsNavigating(true);

    const firstObject = findNextObject(origin, objectsInWijk || []);
    
    if (firstObject) {
      setDestination(firstObject);
      await calculateRoute([origin, [firstObject.longitude, firstObject.latitude]]);
    }

    startTracking();
    setIsCalculating(false);

    mapRef.current?.getMap().flyTo({
        center: origin,
        zoom: 20,
        pitch: 60,
        bearing: 0,
    });
  }

  const handleStartNavigation = async () => {
    if (!selectedRoute || !objectsInWijk) return;
    await startNewNavigationFromRoute(selectedRoute, objectsInWijk.length);
  };

  const handleResumeRoute = async (historyId: string) => {
    if (!historyRoutes) return;

    const routeToResume = historyRoutes.find(r => r.id === historyId);
    if (!routeToResume) return;

    // A "resumed" route is actually a new route that copies the old one.
    const project = projects?.find(p => p.id === routeToResume.projectId);
    const allProjectRoutes = [
        ...(project?.veegroutes || []),
        ...(project?.prullenbakkenroutes || [])
    ];
    const originalRoute = allProjectRoutes.find(r => r.id === routeToResume.originalRouteId);

    if (!originalRoute || !objects) {
        console.error("Original route or objects definition not found for this history item.");
        setLocationError("Kon de oorspronkelijke route niet vinden.");
        return;
    }
    
    // Set the selected route so objectsInWijk can be calculated
    setSelectedRouteId(originalRoute.id);
    
    if(project?.veegroutes?.some(r => r.id === originalRoute.id)) {
        setSelectedRouteType('veeg');
    } else if (project?.prullenbakkenroutes?.some(r => r.id === originalRoute.id)) {
        setSelectedRouteType('prullenbak');
    }

    // The actual start logic will trigger in a useEffect once objectsInWijk is recalculated
  };

  // This effect continues the resume process after state updates trigger recalculation of objectsInWijk
  React.useEffect(() => {
    // Only trigger for "resume" flow, not for starting a totally new route
    if (selectedHistoryId && objectsInWijk && !isNavigating) {
      const historyRoute = historyRoutes?.find(r => r.id === selectedHistoryId);
      const originalRouteDef = selectedRoute;
      if (historyRoute && originalRouteDef) {
          startNewNavigationFromRoute(originalRouteDef, objectsInWijk.length);
      }
    }
  }, [selectedHistoryId, objectsInWijk, isNavigating, historyRoutes, selectedRoute]);
  
  const updateObjectStatus = async (objectId: string, status: 'completed' | 'skipped') => {
      if (!firestore || !user || !activeRouteHistoryId) return;

      const newCompleted = status === 'completed' ? [...completedObjects, objectId] : completedObjects;
      const newSkipped = status === 'skipped' ? [...skippedObjects, objectId] : skippedObjects;

      setCompletedObjects(newCompleted);
      setSkippedObjects(newSkipped);

      const routeHistoryRef = doc(firestore, `users/${user.uid}/routes`, activeRouteHistoryId);
      updateDocumentNonBlocking(routeHistoryRef, {
        completedObjects: newCompleted,
        skippedObjects: newSkipped
      });

      const newPending = pendingObjects.filter(obj => obj.id !== objectId);
      setPendingObjects(newPending);
      
      return newPending;
  }


  const handleNextObject = async (status: 'completed' | 'skipped') => {
    if (!origin || !destination) return;
    
    const newPending = await updateObjectStatus(destination.id, status);

    const nextObject = findNextObject(origin, newPending);

    if (nextObject) {
      setDestination(nextObject);
      const routePoints: ([number, number] | null)[] = [origin, [nextObject.longitude, nextObject.latitude]];
      calculateRoute(routePoints);
    } else {
      // All objects are done
      setDestination(null);
      setRoute(null);
      setRouteInfo(null);
      setRouteInstructions([]);
      handleStopNavigation(); // Also stop navigation fully
    }
    setIsCompletionDialogOpen(false);
  };

  const handleStopNavigation = () => {
    if (firestore && user && activeRouteHistoryId) {
      const routeHistoryRef = doc(firestore, `users/${user.uid}/routes`, activeRouteHistoryId);
      updateDocumentNonBlocking(routeHistoryRef, {
        endTime: serverTimestamp()
      });
    }

    setIsNavigating(false);
    setRoute(null);
    setRouteInfo(null);
    setRouteInstructions([]);
    setDestination(null);
    setPendingObjects([]);
    setCompletedObjects([]);
    setSkippedObjects([]);
    setActiveRouteHistoryId(null);
    setSelectedRouteId(null);
    setSelectedRouteType(null);
    setSelectedHistoryId(null);
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
  
  const progressValue = objectsInWijk && objectsInWijk.length > 0 ? ((completedObjects.length + skippedObjects.length) / objectsInWijk.length) * 100 : 0;
  const allObjectsCompleted = pendingObjects.length === 0 && (completedObjects.length > 0 || skippedObjects.length > 0) && objectsInWijk && objectsInWijk.length > 0;
  
  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatDuration = (seconds: number) => {
    const arrivalTime = new Date(Date.now() + seconds * 1000);
    return arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const firstInstruction = routeInstructions[0];

  const getMarkerColor = (objectId: string): string => {
    if (completedObjects.includes(objectId)) {
      return 'bg-green-500';
    }
    if (skippedObjects.includes(objectId)) {
      return 'bg-gray-500';
    }
    return 'bg-blue-600';
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 relative bg-gray-800">
        {!isNavigating && (
            <div className="absolute top-4 left-4 z-10 bg-card/90 backdrop-blur-sm p-4 rounded-lg shadow-lg w-full max-w-sm text-card-foreground">
                <h2 className="text-lg font-bold mb-2">Start een nieuwe route</h2>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="project-select">Project</Label>
                        <Select
                        value={selectedProjectId || ''}
                        onValueChange={(value) => {
                            setSelectedProjectId(value);
                            setSelectedRouteType(null);
                            setSelectedRouteId(null);
                            setSelectedHistoryId(null);
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
                     {selectedProjectId && !selectedHistoryId && (
                        <div>
                          <Label>Route Type</Label>
                           <div className='grid grid-cols-2 gap-2 mt-2'>
                              <Button variant={selectedRouteType === 'veeg' ? 'secondary' : 'outline'} onClick={() => { setSelectedRouteType('veeg'); setSelectedRouteId(null); }}>
                                Veegwagenroutes
                              </Button>
                              <Button variant={selectedRouteType === 'prullenbak' ? 'secondary' : 'outline'} onClick={() => { setSelectedRouteType('prullenbak'); setSelectedRouteId(null); }}>
                                Prullenbakkenroutes
                              </Button>
                           </div>
                        </div>
                    )}
                    {selectedRouteType && !selectedHistoryId && (
                      <div>
                        <Label htmlFor='route-select'>Route</Label>
                          <Select
                              value={selectedRouteId || ''}
                              onValueChange={v => setSelectedRouteId(v)}
                              disabled={!selectedProject || availableRoutes.length === 0}
                          >
                              <SelectTrigger id="route-select">
                                  <SelectValue placeholder="Selecteer een route" />
                              </SelectTrigger>
                              <SelectContent>
                                  {availableRoutes.map(w => (
                                  <SelectItem key={w.id} value={w.id}>
                                      {w.naam}
                                  </SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                      </div>
                    )}
                    
                    {availableHistoryRoutes.length > 0 && (
                        <>
                            <div className="relative my-4">
                                <Separator />
                                <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-card px-2 text-xs text-muted-foreground">OF</span>
                            </div>

                            <div>
                                <Label htmlFor="resume-route-select">Kies uit routegeschiedenis</Label>
                                <Select onValueChange={(v) => setSelectedHistoryId(v === "new" ? null : v)} value={selectedHistoryId || 'new'}>
                                <SelectTrigger id="resume-route-select">
                                    <SelectValue placeholder="Selecteer een gereden route" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="new">-- Nieuwe Route --</SelectItem>
                                    {availableHistoryRoutes.map(r => <SelectItem key={r.id} value={r.id}>{r.routeName} - {new Date(r.startTime.toDate()).toLocaleString()}</SelectItem>)}
                                </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}

                    <Button onClick={handleStartOrResume} disabled={(!selectedRouteId && !selectedHistoryId) || isCalculating}>
                        {isCalculating ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Bezig...</>
                        ) : selectedHistoryId ? 'Start Route Opnieuw' : 'Start Route'}
                    </Button>

                </div>
            </div>
        )}
        
        {isNavigating && firstInstruction && (
             <div className="absolute top-4 left-4 z-10 w-80">
                <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg">
                    <div className="flex items-center gap-4">
                        <ArrowUp className="h-10 w-10" />
                        <div>
                            <p className="text-3xl font-bold">{formatDistance(firstInstruction.distance)}</p>
                            <p className="text-lg font-medium leading-tight">{firstInstruction.maneuver.instruction}</p>
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
            <div className="absolute bottom-4 left-0 right-0 z-10 px-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
                <div className="flex justify-start">
                    <Button
                    variant="destructive"
                    className="rounded-full h-16 w-16 p-0 flex items-center justify-center shadow-lg"
                    onClick={handleStopNavigation}
                    >
                    <X className="h-8 w-8" />
                    </Button>
                </div>
                
                <div className="flex flex-col items-center gap-2">
                    <div className="bg-card/90 backdrop-blur-sm p-3 rounded-lg shadow-lg text-card-foreground w-96">
                    <div className="flex justify-between items-center mb-1 px-1">
                        <p className="font-semibold text-sm">Voortgang</p>
                        <p className="font-semibold text-sm">
                        {completedObjects.length + skippedObjects.length} / {(objectsInWijk || []).length}{' '}
                        objecten
                        </p>
                    </div>
                    <Progress value={progressValue} className="h-2" />
                    </div>
                    <div className="bg-card/90 backdrop-blur-sm p-3 rounded-lg shadow-lg flex items-center justify-between gap-4 text-card-foreground w-96">
                    <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        <span className="font-bold text-lg">{currentTime}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <RouteIcon className="h-5 w-5" />
                        <span>
                        {routeInfo ? formatDistance(routeInfo.distance) : '-'}
                        </span>
                    </div>
                    <div className="text-muted-foreground text-sm">
                        {routeInfo
                        ? `${formatDuration(routeInfo.duration)} aankomst`
                        : '-'}
                    </div>
                    </div>
                </div>

                <div className="flex justify-end"></div>
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
          
          {isNavigating && objectsInWijk?.map(obj => {
              const isCurrentDestination = destination?.id === obj.id;
              
              if (isCurrentDestination) {
                return (
                  <Marker
                    key={obj.id}
                    longitude={obj.longitude}
                    latitude={obj.latitude}
                    anchor="bottom"
                    onClick={() => setIsCompletionDialogOpen(true)}
                    className="cursor-pointer"
                  >
                    <MapPin className="w-8 h-8 text-blue-600 animate-pulse" />
                  </Marker>
                )
              }
              
              return (
                 <Marker
                    key={obj.id}
                    longitude={obj.longitude}
                    latitude={obj.latitude}
                    anchor="center"
                 >
                  <div className={cn("w-3 h-3 rounded-full border-2 border-white", getMarkerColor(obj.id))} />
                </Marker>
              )
          })}

          {!isNavigating && objectsInWijk && objectsInWijk.map(obj => (
             <Marker
                key={obj.id}
                longitude={obj.longitude}
                latitude={obj.latitude}
             >
              <div className={cn("w-2.5 h-2.5 rounded-full border-2 border-white", getMarkerColor(obj.id) )} />
            </Marker>
          ))}

          {route && (
            <Source id="route" type="geojson" data={route}>
              <Layer {...routeLayer} />
            </Source>
          )}
        </Map>
         <AlertDialog open={isCompletionDialogOpen} onOpenChange={setIsCompletionDialogOpen}>
            <AlertDialogContent className='max-w-xs'>
                <AlertDialogHeader>
                    <AlertDialogTitle className='text-center'>Object Voltooien?</AlertDialogTitle>
                    <AlertDialogDescription className='text-center'>
                        Markeer dit object als voltooid en ga verder naar de volgende.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                 <AlertDialogFooter className="sm:justify-center gap-4">
                     <AlertDialogCancel asChild>
                        <Button onClick={() => handleNextObject('skipped')} variant='outline' size="icon" className='h-6 w-6 rounded-full border-4 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600'>
                            <XCircle className='h-3 w-3' />
                        </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                         <Button onClick={() => handleNextObject('completed')} variant='outline' size="icon" className='h-6 w-6 rounded-full border-4 border-green-500 text-green-500 hover:bg-green-50 hover:text-green-600'>
                            <CheckCircle className='h-3 w-3' />
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
