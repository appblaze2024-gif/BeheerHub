'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, Popup } from 'react-map-gl';
import {
  Search,
  Navigation,
  Loader2,
  MapPin,
  List,
  LocateFixed,
  X,
  Play,
  Pause,
  Settings,
  Volume2,
  CheckCircle,
  XCircle,
  Clock,
  Route as RouteIcon,
  ArrowUp,
  Gauge,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  Undo2,
  Car,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import type { Route } from 'docs/backend';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useMemo, useCallback } from 'react';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MapObject {
    id: string;
    latitude: number;
    longitude: number;
    locatieWerkgebieden?: string[];
    vulgraad?: number;
    [key: string]: any;
}

interface Wijk {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
};

type Prullenbakkenroute = Wijk;

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
  veegroutes?: Wijk[];
  prullenbakkenroutes?: Prullenbakkenroute[];
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
    location: [number, number];
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
    'line-width': 10,
    'line-opacity': 0.9,
  },
};

const getManeuverIcon = (type: string, modifier?: string) => {
    switch (type) {
        case 'turn':
        case 'fork':
        case 'off ramp':
        case 'rotary':
            if (modifier?.includes('left')) return ArrowUpLeft;
            if (modifier?.includes('right')) return ArrowUpRight;
            if (modifier?.includes('slight left')) return ArrowUpLeft;
            if (modifier?.includes('slight right')) return ArrowUpRight;
            if (modifier?.includes('straight')) return ArrowUp;
            return ArrowUp;
        case 'depart':
            return ArrowUp;
        case 'arrive':
            return MapPin;
        case 'roundabout':
            if (modifier?.includes('left')) return ArrowUpLeft;
            if (modifier?.includes('right')) return ArrowUpRight;
            return Undo2;
        default:
            return ArrowUp;
    }
}

const getHeatmapColor = (vulgraad: number | undefined): string => {
    if (vulgraad === undefined || vulgraad === null || vulgraad <= 0) {
      return 'bg-blue-600'; // Default to blue if no vulgraad
    }
    // Hue: 120 is green, 0 is red.
    // We want green (120) at 0% and red (0) at 100%.
    const hue = 120 * (1 - vulgraad / 100);
    return `hsl(${hue}, 80%, 50%)`;
};


export default function Page() {
  const mapRef = React.useRef<any>();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913, // Default center of NL
    latitude: 52.1326,
    zoom: 7,
    pitch: 0,
    bearing: 0,
  });
  
  const [snappedOrigin, setSnappedOrigin] = React.useState<[number, number] | null>(null);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [displayedRoute, setDisplayedRoute] = React.useState<any>(null);
  
  const [currentInstruction, setCurrentInstruction] = React.useState<RouteInstruction | null>(null);
  
  const [distanceToManeuver, setDistanceToManeuver] = React.useState<number | null>(null);
  const [isCalculating, setIsCalculating] = React.useState(false);
  const [isNavigating, setIsNavigating] = React.useState(false);
  const [destination, setDestination] = React.useState<MapObject | null>(null);
  const [hoveredObject, setHoveredObject] = React.useState<MapObject | null>(null);
  const [selectedObjectForInfo, setSelectedObjectForInfo] = React.useState<MapObject | null>(null);
  
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedRouteType, setSelectedRouteType] = React.useState<'veeg' | 'prullenbak' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<string | null>(null);
  const [isCompletionSheetOpen, setIsCompletionSheetOpen] = React.useState(false);
  
  const watchIdRef = React.useRef<number | null>(null);
  
  const [pendingObjects, setPendingObjects] = React.useState<MapObject[]>([]);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [skippedObjects, setSkippedObjects] = React.useState<string[]>([]);
  const [currentTime, setCurrentTime] = React.useState('');
  const [activeRouteHistoryId, setActiveRouteHistoryId] = React.useState<string | null>(null);
  
  const [activeCompletionTab, setActiveCompletionTab] = React.useState('dag');
  const [completionDay, setCompletionDay] = React.useState<string>('maandag');
  const [completionVulgraad, setCompletionVulgraad] = React.useState<string>('25-50');
  const [hasBijzonderheden, setHasBijzonderheden] = React.useState('nee');
  const [bijzonderhedenText, setBijzonderhedenText] = React.useState<string>('');
  const [remainingDistance, setRemainingDistance] = React.useState<number | null>(null);

  // Simulation state
  const [isSimulating, setIsSimulating] = React.useState(false);
  const simulationIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const [currentSpeed, setCurrentSpeed] = React.useState(0); // in km/h

  // Refs for state management inside callbacks
  const positionRef = React.useRef<[number, number] | null>(null);
  const routeRef = React.useRef<any>(null);
  const routeInfoRef = React.useRef<RouteInfo | null>(null);
  const routeInstructionsRef = React.useRef<RouteInstruction[]>([]);
  const currentInstructionIndexRef = React.useRef(0);


  const objectsCollection = useMemo(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'objects');
  }, [firestore, user]);
  
  const projectsCollection = useMemo(() => {
      if (!firestore) return null;
      return collection(firestore, 'projects');
  }, [firestore]);

  const { data: objects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);


  const userHistoryCollection = useMemo(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, `users/${user.uid}/routes`));
  }, [firestore, user]);

  const { data: historyRoutes, isLoading: isLoadingHistory } = useCollection<Route>(userHistoryCollection);
  
  const availableHistoryRoutes = React.useMemo(() => {
    if (!historyRoutes || !selectedProjectId) return [];
    return historyRoutes.filter((r) => r.projectId === selectedProjectId)
      .sort((a, b) => {
        const timeA = a.startTime?.toDate ? new Date(a.startTime.toDate()).getTime() : Date.now();
        const timeB = b.startTime?.toDate ? new Date(b.startTime.toDate()).getTime() : Date.now();
        return timeB - timeA;
      });
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

    // Geographic filtering
    let geoObjects: MapObject[] = [];
    try {
        const wijkFeatures = JSON.parse(selectedRoute.subGebieden);
        if (Array.isArray(wijkFeatures) && wijkFeatures.length > 0) {
            geoObjects = objects.filter(obj => {
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
        }
    } catch(e) {
        console.error("Error filtering objects in wijk:", e);
    }
    
    // Manual assignment filtering
    const manualObjects = objects.filter(obj =>
        (obj.locatieWerkgebieden || []).includes(selectedRoute.naam)
    );
    
    // Combine and remove duplicates
    const combined = [...geoObjects, ...manualObjects];
    const uniqueObjects = Array.from(new Map(combined.map(item => [item.id, item])).values());
    
    return uniqueObjects;
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
          positionRef.current = [longitude, latitude];
          setSnappedOrigin([longitude, latitude]);
          setViewState(prev => ({...prev, longitude, latitude, zoom: 14}));
          setLocationError(null);
        },
        () => {
          setLocationError("Kon uw locatie niet ophalen. Zorg ervoor dat u locatietoestemming heeft gegeven.");
          const fallbackLocation: [number, number] = [5.4697, 51.4416];
          positionRef.current = fallbackLocation;
          setSnappedOrigin(fallbackLocation);
        }
      );
    } else {
      setLocationError("Geolocatie wordt niet ondersteund door deze browser.");
      const fallbackLocation: [number, number] = [5.4697, 51.4416];
      positionRef.current = fallbackLocation;
      setSnappedOrigin(fallbackLocation);
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
      routeRef.current = null;
      setDisplayedRoute(null);
      routeInfoRef.current = null;
      routeInstructionsRef.current = [];
      return;
    }
  
    routeRef.current = null;
    setDisplayedRoute(null);
    routeInfoRef.current = null;
    routeInstructionsRef.current = [];
    
    const limitedPoints = validPoints.slice(0, 25);
    const coordinates = limitedPoints.map(p => p.join(',')).join(';');
    const radiuses = limitedPoints.map(() => 'unlimited').join(';');
  
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?geometries=geojson&overview=full&steps=true&language=nl&radiuses=${radiuses}&access_token=${MAPBOX_TOKEN}`
      );
  
      if (!response.ok) {
        throw new Error(`Failed to fetch route: ${response.statusText}`);
      }
  
      const data = await response.json();
      
      if (data.routes && data.routes.length > 0) {
        const currentRoute = data.routes[0];
        const routeGeoJSON = {
          type: 'Feature',
          properties: {},
          geometry: currentRoute.geometry,
        };

        const snappedStart = data.waypoints[0].location;
        setSnappedOrigin(snappedStart);
        
        routeRef.current = routeGeoJSON;
        setDisplayedRoute(routeGeoJSON);
        setRemainingDistance(currentRoute.distance);

        routeInfoRef.current = {
          distance: currentRoute.distance,
          duration: currentRoute.duration,
        };
        if (currentRoute.legs[0]?.steps) {
          routeInstructionsRef.current = currentRoute.legs[0].steps;
          setCurrentInstruction(routeInstructionsRef.current[0]);
          currentInstructionIndexRef.current = 0;
          setDistanceToManeuver(routeInstructionsRef.current[0].distance);

          const map = mapRef.current?.getMap();
          if (map) {
            const firstPoint = turf.point(routeGeoJSON.geometry.coordinates[0]);
            const secondPoint = turf.point(routeGeoJSON.geometry.coordinates[1]);
            const initialBearing = turf.bearing(firstPoint, secondPoint);
            
            map.easeTo({
              center: snappedStart,
              zoom: 20,
              bearing: initialBearing,
              pitch: 70,
              duration: 1500,
              padding: { top: map.getCanvas().height * 0.35 },
            });
          }
        }
      }
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
        setIsCalculating(false);
    }
  };

 const updateMapAndPosition = React.useCallback(() => {
    const userLocation = positionRef.current;
    if (!userLocation || !routeRef.current?.geometry) return;

    const map = mapRef.current?.getMap();
    if (!map) return;

    const routeLine = routeRef.current.geometry;
    const currentPoint = turf.point(userLocation);
    
    const snapped = turf.nearestPointOnLine(routeLine, currentPoint, { units: 'meters' });
    if (!snapped) return;

    const snappedCoords = snapped.geometry.coordinates as [number, number];
    setSnappedOrigin(coords => coords ? (coords[0] !== snappedCoords[0] || coords[1] !== snappedCoords[1] ? snappedCoords : coords) : snappedCoords);

    const distanceTraveled = turf.length(
        turf.lineSlice(turf.point(routeLine.coordinates[0]), snapped, routeLine),
        { units: 'meters' }
    );
    
    setRemainingDistance(Math.max(0, (routeInfoRef.current?.distance || 0) - distanceTraveled));
    
    const remainingLine = turf.lineSlice(
        snapped,
        turf.point(routeLine.coordinates[routeLine.coordinates.length - 1]),
        routeLine
    );
    setDisplayedRoute((current: any) => {
        if (!current || !turf.booleanEqual(turf.feature(current.geometry), turf.feature(remainingLine.geometry))) {
            return remainingLine;
        }
        return current;
    });
    
    let distanceTraveledOnInstructions = 0;
    let upcomingInstructionIndex = -1;
    for (let i = 0; i < routeInstructionsRef.current.length; i++) {
        distanceTraveledOnInstructions += routeInstructionsRef.current[i].distance;
        if (distanceTraveledOnInstructions > distanceTraveled) {
            upcomingInstructionIndex = i;
            break;
        }
    }

    if (upcomingInstructionIndex !== -1) {
        const distanceToNextManeuver = distanceTraveledOnInstructions - distanceTraveled;
        setDistanceToManeuver(distanceToNextManeuver);
        if (currentInstructionIndexRef.current !== upcomingInstructionIndex) {
            currentInstructionIndexRef.current = upcomingInstructionIndex;
            setCurrentInstruction(routeInstructionsRef.current[upcomingInstructionIndex]);
        }
    }

    let newBearing = 0;
    const nextPointDistance = distanceTraveled + 10;
    if (nextPointDistance <= (routeInfoRef.current?.distance || 0)) {
        const nextPointOnRoute = turf.along(routeLine, nextPointDistance, { units: 'meters' });
        newBearing = turf.bearing(snapped, nextPointOnRoute);
    }
    
    map.easeTo({
        center: snappedCoords,
        zoom: 20,
        bearing: newBearing,
        pitch: 70,
        duration: 1000,
        easing: (t: number) => t,
        padding: { top: map.getCanvas().height * 0.35 },
    });
}, []);


  const startTracking = React.useCallback(() => {
    if (!navigator.geolocation || isSimulating) {
      console.log("Geolocation is not supported or simulation is active.");
      return;
    }
  
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
  
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { longitude, latitude, speed: gpsSpeed } = position.coords;
        positionRef.current = [longitude, latitude];
        
        const newSpeed = (gpsSpeed || 0) * 3.6; // m/s to km/h
        setCurrentSpeed(newSpeed);
  
        updateMapAndPosition();
      },
      (error) => {
        console.error("Error watching position:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  }, [isSimulating, updateMapAndPosition]);

  const stopTracking = () => {
    if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
    }
  };
  
 const simulationStateRef = React.useRef({
    distance: 0,
    isPausedAtManeuver: false,
    pauseTimeout: null as NodeJS.Timeout | null,
  });

  const handleToggleSimulation = () => {
    const isStarting = !isSimulating;
    setIsSimulating(isStarting);

    if (isStarting) {
        if (simulationIntervalRef.current) {
            clearInterval(simulationIntervalRef.current);
        }
        stopTracking();
        simulationStateRef.current = { distance: 0, isPausedAtManeuver: false, pauseTimeout: null };
        currentInstructionIndexRef.current = 0;
        
        if (routeRef.current && routeRef.current.geometry.coordinates.length > 0) {
          const startCoords = routeRef.current.geometry.coordinates[0];
          positionRef.current = startCoords;
          updateMapAndPosition();
        }

        simulationIntervalRef.current = setInterval(() => {
            if (!routeRef.current || !routeInstructionsRef.current.length || simulationStateRef.current.isPausedAtManeuver) return;
            
            const routeLine = routeRef.current.geometry;
            const totalDistance = routeInfoRef.current?.distance || 0;
            
            const cumulativeDistanceToNextManeuver = routeInstructionsRef.current
              .slice(0, currentInstructionIndexRef.current + 1)
              .reduce((acc, i) => acc + i.distance, 0);

            const distanceToNextManeuver = cumulativeDistanceToNextManeuver - simulationStateRef.current.distance;
            setDistanceToManeuver(distanceToNextManeuver);

            if (distanceToNextManeuver < 5 && !simulationStateRef.current.isPausedAtManeuver) {
                simulationStateRef.current.isPausedAtManeuver = true;
                setCurrentSpeed(0);

                if(simulationStateRef.current.pauseTimeout) clearTimeout(simulationStateRef.current.pauseTimeout);
                simulationStateRef.current.pauseTimeout = setTimeout(() => {
                    currentInstructionIndexRef.current += 1;
                    const nextInstruction = routeInstructionsRef.current[currentInstructionIndexRef.current];
                    setCurrentInstruction(nextInstruction);
                    simulationStateRef.current.isPausedAtManeuver = false;
                }, 2000);
                return;
            }
            
            let speedInMps;
            if (distanceToNextManeuver < 100) {
                speedInMps = 30 / 3.6;
            } else {
                speedInMps = 70 / 3.6;
            }

            simulationStateRef.current.distance += speedInMps;
            
            if (simulationStateRef.current.distance >= totalDistance) {
                simulationStateRef.current.distance = totalDistance;
                handleToggleSimulation();
            }

            setCurrentSpeed(speedInMps * 3.6);
            
            const newPoint = turf.along(routeLine, simulationStateRef.current.distance, { units: 'meters' });
            positionRef.current = newPoint.geometry.coordinates as [number, number];

            updateMapAndPosition();

        }, 1000);
    } else {
        if (simulationIntervalRef.current) {
            clearInterval(simulationIntervalRef.current);
            simulationIntervalRef.current = null;
        }
        if (simulationStateRef.current.pauseTimeout) {
            clearTimeout(simulationStateRef.current.pauseTimeout);
        }
        setCurrentSpeed(0);
    }
  };
  
  const handleStartNavigation = React.useCallback(async () => {
    if (!positionRef.current || !user || !firestore || !selectedProjectId || !selectedRouteId || !selectedRoute) return;

    const allObjects = objectsInWijk;
    const allObjectIds = allObjects.map(obj => obj.id);

    const routesCollection = collection(firestore, `users/${user.uid}/routes`);

    const routeHistoryData: Partial<Route> = {
        userId: user.uid,
        projectId: selectedProjectId,
        originalRouteId: selectedRouteId,
        routeName: selectedRoute.naam,
        date: new Date().toISOString().split('T')[0],
        startTime: serverTimestamp() as any,
        endTime: null,
        allObjectIds: allObjectIds,
        completedObjects: [],
        skippedObjects: [],
        totalObjects: allObjectIds.length,
    };

    const docRef = doc(routesCollection);
    await setDoc(docRef, routeHistoryData);
    setActiveRouteHistoryId(docRef.id);

    setCompletedObjects([]);
    setSkippedObjects([]);
    setPendingObjects(allObjects);

    const firstObject = findNextObject(positionRef.current, allObjects);

    if (firstObject) {
        setDestination(firstObject);
        await calculateRoute([positionRef.current, [firstObject.longitude, firstObject.latitude]]);
    }

    startTracking();
  }, [user, firestore, selectedProjectId, selectedRouteId, selectedRoute, objectsInWijk, startTracking]);

  const handleResumeRoute = React.useCallback(async (historyId: string) => {
    const routeToResume = historyRoutes?.find(r => r.id === historyId);
    if (!routeToResume || !objects || !positionRef.current) {
        console.error("Route to resume not found or objects/origin not ready.");
        return;
    }

    const project = projects?.find(p => p.id === routeToResume.projectId);
    if (!project) {
        console.error("Project for the route not found.");
        return;
    }

    setSelectedProjectId(project.id);
    setSelectedRouteId(routeToResume.originalRouteId);
    if (project.veegroutes?.some(r => r.id === routeToResume.originalRouteId)) {
        setSelectedRouteType('veeg');
    } else if (project.prullenbakkenroutes?.some(r => r.id === routeToResume.originalRouteId)) {
        setSelectedRouteType('prullenbak');
    }

    const routeObjects = (routeToResume.allObjectIds || [])
        .map(id => objects.find(o => o.id === id))
        .filter((o): o is MapObject => !!o);

    if (routeObjects.length === 0 && (routeToResume.allObjectIds || []).length > 0) {
        return;
    }

    setActiveRouteHistoryId(routeToResume.id);
    const completed = routeToResume.completedObjects || [];
    const skipped = routeToResume.skippedObjects || [];
    setCompletedObjects(completed);
    setSkippedObjects(skipped);

    const remainingObjects = routeObjects.filter(
        obj => !completed.includes(obj.id) && !skipped.includes(obj.id)
    );
    setPendingObjects(remainingObjects);

    const nextObject = findNextObject(positionRef.current, remainingObjects);
    if (nextObject) {
        setDestination(nextObject);
        await calculateRoute([positionRef.current, [nextObject.longitude, nextObject.latitude]]);
    } 
    startTracking();
  }, [historyRoutes, objects, projects, startTracking]);

  const handleStartOrResume = useCallback(() => {
    setIsNavigating(true);
    setIsCalculating(true);
    if (selectedHistoryId) {
        handleResumeRoute(selectedHistoryId);
    } else if (selectedRouteId) {
        handleStartNavigation();
    }
  }, [selectedHistoryId, selectedRouteId, handleResumeRoute, handleStartNavigation]);
  
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

  const updateObjectStatus = async (objectId: string, status: 'completed' | 'skipped'): Promise<MapObject[]> => {
      if (!firestore || !user || !activeRouteHistoryId) return pendingObjects;

      const newCompleted = status === 'completed' ? [...completedObjects, objectId] : completedObjects;
      const newSkipped = status === 'skipped' ? [...skippedObjects, objectId] : skippedObjects;

      setCompletedObjects(newCompleted);
      setSkippedObjects(newSkipped);

      const routeHistoryRef = doc(firestore, `users/${user.uid}/routes`, activeRouteHistoryId);
      updateDocumentNonBlocking(routeHistoryRef, {
        completedObjects: newCompleted,
        skippedObjects: newSkipped
      });

      if (status === 'completed' && destination) {
        const objectRef = doc(firestore, 'objects', destination.id);
        const [min, max] = completionVulgraad.split('-').map(Number);
        const vulgraadValue = (min + max) / 2;

        updateDocumentNonBlocking(objectRef, {
            lastCleaned: serverTimestamp(),
            lastCleanedDay: completionDay,
            vulgraad: vulgraadValue,
            bijzonderheden: hasBijzonderheden === 'ja' ? bijzonderhedenText : null,
        });
      }
      const newPending = pendingObjects.filter(obj => obj.id !== objectId);
      setPendingObjects(newPending);
      return newPending;
  }


  const handleNextObject = async (status: 'completed' | 'skipped') => {
    if (!positionRef.current || !destination) return;
    
    const newPendingObjects = await updateObjectStatus(destination.id, status);

    const nextObject = findNextObject(positionRef.current, newPendingObjects);

    if (nextObject) {
      setDestination(nextObject);
      const routePoints: ([number, number] | null)[] = [positionRef.current, [nextObject.longitude, nextObject.latitude]];
      await calculateRoute(routePoints);
    } else {
      // All objects are done
      setDestination(null);
      routeRef.current = null;
      setDisplayedRoute(null);
      routeInfoRef.current = null;
      routeInstructionsRef.current = [];
      setCurrentInstruction(null);
      handleStopNavigation(); // Also stop navigation fully
    }
    setIsCompletionSheetOpen(false);
  };

  const handleStopNavigation = () => {
    if (firestore && user && activeRouteHistoryId) {
      const routeHistoryRef = doc(firestore, `users/${user.uid}/routes`, activeRouteHistoryId);
      updateDocumentNonBlocking(routeHistoryRef, {
        endTime: serverTimestamp()
      });
    }
    
    if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
    }
     if (simulationStateRef.current.pauseTimeout) {
      clearTimeout(simulationStateRef.current.pauseTimeout);
    }
    setIsSimulating(false);
    setCurrentSpeed(0);

    setIsNavigating(false);
    setIsCalculating(false);
    
    routeRef.current = null;
    setDisplayedRoute(null);
    routeInfoRef.current = null;
    setRemainingDistance(null);
    routeInstructionsRef.current = [];
    setCurrentInstruction(null);
    setDistanceToManeuver(null);
    setDestination(null);
    setPendingObjects([]);
    setCompletedObjects([]);
    setSkippedObjects([]);
    setActiveRouteHistoryId(null);
    setSelectedRouteId(null);
    setSelectedRouteType(null);
    setSelectedHistoryId(null);
    stopTracking();
    
    const currentOrigin = positionRef.current;
    if(currentOrigin) {
      setViewState(prev => ({ ...prev, pitch: 0, bearing: 0, zoom: 14, longitude: currentOrigin[0], latitude: currentOrigin[1] }));
      mapRef.current?.getMap().easeTo({
          center: currentOrigin,
          zoom: 14,
          pitch: 0,
          bearing: 0,
      });
    }
  }

  const centerOnLocation = () => {
    const centerPoint = snappedOrigin;
    if (centerPoint) {
      const map = mapRef.current?.getMap();
      if (map) {
        const options: any = {
          center: centerPoint,
          zoom: isNavigating ? 20 : 17,
        };

        if (isNavigating) {
          options.pitch = 70;
          options.bearing = viewState.bearing;
          options.padding = {top: map.getCanvas().height * 0.35}
        } else {
          options.pitch = 0;
          options.bearing = 0;
        }
        
        map.easeTo(options);
      }
    }
  };
  
  const objectsForCurrentRoute = React.useMemo(() => {
      const currentHistoryRoute = historyRoutes?.find(r => r.id === activeRouteHistoryId);
      if (isNavigating && currentHistoryRoute && currentHistoryRoute.allObjectIds) {
          return (currentHistoryRoute.allObjectIds || [])
              .map(id => objects?.find(o => o.id === id))
              .filter((o): o is MapObject => !!o);
      }
      return objectsInWijk || [];
  }, [isNavigating, activeRouteHistoryId, historyRoutes, objects, objectsInWijk]);
  
  const progressValue = objectsForCurrentRoute && objectsForCurrentRoute.length > 0 ? ((completedObjects.length + skippedObjects.length) / objectsForCurrentRoute.length) * 100 : 0;
  
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
  
  const ManeuverIcon = currentInstruction ? getManeuverIcon(currentInstruction.maneuver.type, currentInstruction.maneuver.modifier) : ArrowUp;


  const getMarkerColor = (objectId: string, vulgraad?: number): string => {
    if (completedObjects.includes(objectId)) {
        return 'bg-green-500';
    }
    if (skippedObjects.includes(objectId)) {
        return 'bg-gray-500';
    }
    return getHeatmapColor(vulgraad);
}
  
  const handleMarkerClick = (obj: MapObject) => {
    if (isNavigating && destination?.id === obj.id) {
        setActiveCompletionTab('dag');
        setCompletionDay('maandag');
        setCompletionVulgraad('25-50');
        setHasBijzonderheden('nee');
        setBijzonderhedenText('');
        setIsCompletionSheetOpen(true);
    } else {
        setSelectedObjectForInfo(obj);
    }
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
                            routeRef.current = null;
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
                                    {availableHistoryRoutes.map(r => (
                                      <SelectItem key={r.id} value={r.id}>
                                        {r.routeName} - {r.startTime?.toDate ? new Date(r.startTime.toDate()).toLocaleString() : 'Recent'}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}

                    <Button onClick={handleStartOrResume} disabled={(!selectedRouteId && !selectedHistoryId) || isCalculating}>
                        {isCalculating ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Bezig...</>
                        ) : selectedHistoryId ? 'Hervat Route' : 'Start Route'}
                    </Button>

                </div>
            </div>
        )}
        
        {isNavigating && currentInstruction && (
             <div className="absolute top-4 left-4 z-10 w-80">
                <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg">
                    <div className="flex items-center gap-4">
                        <ManeuverIcon className="h-10 w-10" />
                        <div>
                            <p className="text-3xl font-bold">{distanceToManeuver ? formatDistance(distanceToManeuver) : '...'}</p>
                            <p className="text-lg font-medium leading-tight">{currentInstruction.maneuver.instruction}</p>
                        </div>
                    </div>
                </div>
                 <div className="bg-card/90 backdrop-blur-sm p-3 rounded-xl shadow-lg text-card-foreground mt-2">
                    <div className="flex justify-between items-center mb-1 px-1">
                        <p className="font-semibold text-sm">Voortgang</p>
                        <p className="font-semibold text-sm">
                        {completedObjects.length + skippedObjects.length} / {objectsForCurrentRoute.length}{' '}
                        objecten
                        </p>
                    </div>
                    <Progress value={progressValue} className="h-2" />
                    <div className="flex items-center justify-center gap-2 mt-2 text-card-foreground">
                        <Gauge className="h-6 w-6" />
                        <span className="font-bold text-3xl">{currentSpeed.toFixed(0)}</span>
                        <span className="text-base">km/h</span>
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
                 <Button variant="secondary" size="icon" className="bg-card/80 border-stone-300 text-card-foreground hover:bg-muted shadow-lg" onClick={handleToggleSimulation}>
                    {isSimulating ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
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
                
                <div className="flex justify-center">
                    <div className="bg-card/90 backdrop-blur-sm p-3 rounded-xl shadow-lg flex items-center justify-center gap-4 text-card-foreground">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            <span className="font-bold text-lg">{currentTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <RouteIcon className="h-5 w-5" />
                            <span>
                                {remainingDistance !== null ? formatDistance(remainingDistance) : routeInfoRef.current ? formatDistance(routeInfoRef.current.distance) : '-'}
                            </span>
                        </div>
                        <div className="text-muted-foreground text-sm">
                            {routeInfoRef.current
                            ? `${formatDuration(routeInfoRef.current.duration)} aankomst`
                            : '-'}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end"></div>
              </div>
            </div>
        )}


        <MapGL
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {snappedOrigin && (
            <Marker longitude={snappedOrigin[0]} latitude={snappedOrigin[1]} rotationAlignment="map" rotation={viewState.bearing}>
               <div className="flex items-center justify-center">
                 <svg width={isNavigating ? "32" : "16"} height={isNavigating ? "32" : "16"} viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r="25" fill="#3b82f6" stroke="#ffffff" strokeWidth="4" />
                </svg>
              </div>
            </Marker>
          )}
          
          {isNavigating && objectsForCurrentRoute?.map(obj => {
              const isCurrentDestination = destination?.id === obj.id;
              const color = getMarkerColor(obj.id, obj.vulgraad);
              
              if (isCurrentDestination) {
                return (
                  <Marker
                    key={obj.id}
                    longitude={obj.longitude}
                    latitude={obj.latitude}
                    anchor="bottom"
                    onClick={() => handleMarkerClick(obj)}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredObject(obj)}
                    onMouseLeave={() => setHoveredObject(null)}
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
                    onClick={() => handleMarkerClick(obj)}
                    onMouseEnter={() => setHoveredObject(obj)}
                    onMouseLeave={() => setHoveredObject(null)}
                 >
                  <div className={`w-3 h-3 rounded-full border-2 border-white cursor-pointer`} style={{backgroundColor: color.startsWith('hsl') ? color : undefined}}/>
                </Marker>
              )
          })}

          {!isNavigating && objectsInWijk?.map(obj => {
            const color = getHeatmapColor(obj.vulgraad);
            return (
             <Marker
                key={obj.id}
                longitude={obj.longitude}
                latitude={obj.latitude}
                onClick={() => handleMarkerClick(obj)}
                onMouseEnter={() => setHoveredObject(obj)}
                onMouseLeave={() => setHoveredObject(null)}
             >
              <div className={`w-2.5 h-2.5 rounded-full border-2 border-white cursor-pointer`} style={{backgroundColor: color.startsWith('hsl') ? color : undefined}} />
            </Marker>
          )})}
          
          {hoveredObject && !selectedObjectForInfo && (
              <Popup
                longitude={hoveredObject.longitude}
                latitude={hoveredObject.latitude}
                closeButton={false}
                closeOnClick={false}
                anchor="top"
                offset={10}
                onClose={() => setHoveredObject(null)}
              >
                <div className="bg-gray-800 text-white text-xs font-semibold px-2 py-1 rounded-md">
                    ID: {hoveredObject.id}
                </div>
              </Popup>
          )}
          
          {selectedObjectForInfo && (
              <Popup
                longitude={selectedObjectForInfo.longitude}
                latitude={selectedObjectForInfo.latitude}
                closeButton={true}
                closeOnClick={true}
                anchor="top"
                offset={10}
                onClose={() => setSelectedObjectForInfo(null)}
              >
                <div className="bg-gray-800 text-white font-semibold p-2 rounded-md">
                    ID: {selectedObjectForInfo.id}
                </div>
              </Popup>
          )}

          {displayedRoute && (
            <Source id="route" type="geojson" data={displayedRoute}>
              <Layer {...routeLayer} />
            </Source>
          )}
        </MapGL>
        <Dialog open={isCompletionSheetOpen} onOpenChange={setIsCompletionSheetOpen}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>OBJECT-ID: {destination?.id}</DialogTitle>
                    <DialogDescription>
                        Markeer dit object als voltooid en ga verder naar de volgende.
                    </DialogDescription>
                </DialogHeader>
                <Tabs value={activeCompletionTab} onValueChange={setActiveCompletionTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="dag">Dag</TabsTrigger>
                    <TabsTrigger value="vulgraad">Vulgraad</TabsTrigger>
                    <TabsTrigger value="bijzonderheden">Bijzonderheden</TabsTrigger>
                    <TabsTrigger value="actie">Actie</TabsTrigger>
                  </TabsList>
                  <TabsContent value="dag" className="pt-4">
                    <RadioGroup
                      value={completionDay}
                      onValueChange={(value) => {
                        setCompletionDay(value);
                        setActiveCompletionTab('vulgraad');
                      }}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          {['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag'].map(day => (
                            <div key={day} className="flex items-center space-x-2">
                               <RadioGroupItem value={day} id={`day-${day}`} />
                               <Label htmlFor={`day-${day}`} className='capitalize'>{day}</Label>
                            </div>
                          ))}
                      </div>
                    </RadioGroup>
                  </TabsContent>
                  <TabsContent value="vulgraad" className="pt-4">
                      <RadioGroup
                        value={completionVulgraad}
                        onValueChange={(value) => {
                          setCompletionVulgraad(value);
                          setActiveCompletionTab('bijzonderheden');
                        }}
                      >
                        <div className="grid grid-cols-2 gap-4">
                            {['0-25', '25-50', '50-75', '75-100'].map(range => (
                                <div key={range} className="flex items-center space-x-2">
                                  <RadioGroupItem value={range} id={`vulgraad-${range}`} />
                                  <Label htmlFor={`vulgraad-${range}`}>{range}%</Label>
                                </div>
                            ))}
                        </div>
                      </RadioGroup>
                  </TabsContent>
                  <TabsContent value="bijzonderheden" className="pt-4 space-y-4">
                      <RadioGroup
                        value={hasBijzonderheden}
                        onValueChange={(value) => {
                          setHasBijzonderheden(value);
                          if (value === 'nee') {
                            setActiveCompletionTab('actie');
                          }
                        }}
                      >
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="ja" id="bijzonderheden-ja" />
                              <Label htmlFor="bijzonderheden-ja">Ja</Label>
                            </div>
                             <div className="flex items-center space-x-2">
                              <RadioGroupItem value="nee" id="bijzonderheden-nee" />
                              <Label htmlFor="bijzonderheden-nee">Nee</Label>
                            </div>
                        </div>
                      </RadioGroup>
                      {hasBijzonderheden === 'ja' && (
                        <Textarea 
                            placeholder="Voer bijzonderheden in..."
                            value={bijzonderhedenText}
                            onChange={(e) => setBijzonderhedenText(e.target.value)}
                        />
                      )}
                  </TabsContent>
                  <TabsContent value="actie" className="pt-8 flex items-center justify-center">
                    <div className="flex-row justify-center gap-4 flex">
                        <Button onClick={() => handleNextObject('skipped')} variant='outline' size="icon" className='h-32 w-32 rounded-full border-4 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600'>
                            <XCircle className='h-16 w-16' />
                        </Button>
                        <Button onClick={() => handleNextObject('completed')} variant='outline' size="icon" className='h-32 w-32 rounded-full border-4 border-green-500 text-green-500 hover:bg-green-50 hover:text-green-600'>
                            <CheckCircle className='h-16 w-16' />
                        </Button>
                    </div>
                  </TabsContent>
                </Tabs>
                 <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Sluiten</Button>
                  </DialogClose>
                 </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
