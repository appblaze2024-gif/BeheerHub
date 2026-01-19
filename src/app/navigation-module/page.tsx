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
import { useCollection, useFirestore, useUser, addDocumentNonBlocking, updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, getDocs, collectionGroup } from 'firebase/firestore';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useMemo, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import Image from 'next/image';
import { ResponsiveContainer, RadialBarChart, PolarAngleAxis, RadialBar } from 'recharts';
import { useProfile } from '@/firebase/profile-provider';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UserProfile } from '@/lib/types';


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

export default function Page() {
  const mapRef = React.useRef<any>();
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
  const { setIsHeaderVisible } = useNavigationUI();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913, // Default center of NL
    latitude: 52.1326,
    zoom: 7,
    pitch: 0,
    bearing: 0,
  });
  
  const [locationError, setLocationError] = React.useState<string | null>(null);
  
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
  
  const trackWatchIdRef = React.useRef<number | null>(null);
  
  const [pendingObjects, setPendingObjects] = React.useState<MapObject[]>([]);
  const [completedObjects, setCompletedObjects] = React.useState<string[]>([]);
  const [skippedObjects, setSkippedObjects] = React.useState<string[]>([]);
  const [currentTime, setCurrentTime] = React.useState('');
  const [activeRouteHistoryId, setActiveRouteHistoryId] = React.useState<string | null>(null);
  
  const [completionVulgraadPercentage, setCompletionVulgraadPercentage] = React.useState<number>(38);
  const [remainingDistance, setRemainingDistance] = React.useState<number | null>(null);
  const [justCompletedObjectId, setJustCompletedObjectId] = React.useState<string | null>(null);
  
  const [userPosition, setUserPosition] = React.useState<[number, number] | null>(null);
  const [isSinglePointNav, setIsSinglePointNav] = React.useState(false);


  // Simulation state
  const [isSimulating, setIsSimulating] = React.useState(false);
  const simulationIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const [currentSpeed, setCurrentSpeed] = React.useState(0); // in km/h

  // Refs for state management inside callbacks
  const positionRef = React.useRef<[number, number] | null>(null);
  const snappedOriginRef = React.useRef<[number, number] | null>(null);
  const routeRef = React.useRef<any>(null);
  const routeInfoRef = React.useRef<RouteInfo | null>(null);
  const routeInstructionsRef = React.useRef<RouteInstruction[]>([]);
  const currentInstructionIndexRef = React.useRef(0);
  
  const [displayedRoute, setDisplayedRoute] = React.useState<any>(null);


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

  const usersCollection = useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersCollection);

  const usersMap = useMemo(() => {
    if (!users) return new Map<string, string>();
    return new Map(users.map(u => [u.id, u.displayName || u.email || 'Onbekende gebruiker']));
  }, [users]);

  const userHistoryCollection = useMemo(() => {
    if (!firestore || !user) return null;
    const isAdminOrSupervisor = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';

    if (isAdminOrSupervisor) {
      return query(collectionGroup(firestore, 'routes'));
    }
    
    return query(collection(firestore, `users/${user.uid}/routes`));
  }, [firestore, user, profile]);

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
      const routes = selectedProject.veegroutes || [];
      if (profile?.veegroute) {
        return routes.filter(r => r.naam === profile.veegroute);
      }
      return routes;
    }
    if (selectedRouteType === 'prullenbak') {
      const routes = selectedProject.prullenbakkenroutes || [];
      if (profile?.prullenbakkenroute) {
        return routes.filter(r => r.naam === profile.prullenbakkenroute);
      }
      return routes;
    }
    return [];
  }, [selectedProject, selectedRouteType, profile]);

  const objectCountsForRoutes = React.useMemo(() => {
    if (!objects || !availableRoutes.length) return {};
    const counts: Record<string, number> = {};

    for (const route of availableRoutes) {
      // Geographic filtering
      let geoObjects: MapObject[] = [];
      try {
        const wijkFeatures = JSON.parse(route.subGebieden);
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
      } catch (e) {
        // console.error("Error filtering objects in wijk:", e);
      }

      // Manual assignment filtering
      const manualObjects = objects.filter(obj =>
        (obj.locatieWerkgebieden || []).includes(route.naam)
      );

      // Combine and remove duplicates
      const combined = [...geoObjects, ...manualObjects];
      const uniqueObjects = Array.from(new Map(combined.map(item => [item.id, item])).values());
      counts[route.id] = uniqueObjects.length;
    }
    return counts;
  }, [objects, availableRoutes]);

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
    if (!mapContainerRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.getMap().resize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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
          snappedOriginRef.current = [longitude, latitude];
          setUserPosition([longitude, latitude]);
          setViewState(prev => ({...prev, longitude, latitude, zoom: 14}));
          setLocationError(null);
        },
        () => {
          setLocationError("Kon uw locatie niet ophalen. Zorg ervoor dat u locatietoestemming heeft gegeven.");
          const fallbackLocation: [number, number] = [5.4697, 51.4416];
          positionRef.current = fallbackLocation;
          snappedOriginRef.current = fallbackLocation;
          setUserPosition(fallbackLocation);
        }
      );
    } else {
      setLocationError("Geolocatie wordt niet ondersteund door deze browser.");
      const fallbackLocation: [number, number] = [5.4697, 51.4416];
      positionRef.current = fallbackLocation;
      snappedOriginRef.current = fallbackLocation;
      setUserPosition(fallbackLocation);
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
  
  React.useEffect(() => {
    // This effect runs once on mount
    // It returns a cleanup function that runs on unmount
    return () => {
      setIsHeaderVisible(true);
    };
  }, [setIsHeaderVisible]);

  const calculateRoute = useCallback(async (points: (number[] | null)[]) => {
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
        snappedOriginRef.current = snappedStart;
        
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
              pitch: 60,
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
  }, []);
  
  React.useEffect(() => {
    const destLat = searchParams.get('dest_lat');
    const destLon = searchParams.get('dest_lon');
    const destId = searchParams.get('dest_id');

    if (destLat && destLon && destId && userPosition) {
        if (isNavigating) return;

        const destinationObject: MapObject = {
            id: destId,
            latitude: parseFloat(destLat),
            longitude: parseFloat(destLon),
        };
        
        setIsSinglePointNav(true);
        setDestination(destinationObject);
        setIsNavigating(true);
        setIsCalculating(true);
        setIsHeaderVisible(false);
        calculateRoute([userPosition, [destinationObject.longitude, destinationObject.latitude]]);
        setPendingObjects([]);
        setCompletedObjects([]);
        setSkippedObjects([]);
    }
  }, [searchParams, userPosition, calculateRoute, setIsHeaderVisible, isNavigating]);


  const getMarkerColor = (objectId: string): string => {
    if (completedObjects.includes(objectId)) {
        return 'bg-green-500';
    }
    if (skippedObjects.includes(objectId)) {
        return 'bg-gray-500';
    }
    return 'bg-blue-600';
  }
  
  const handleMarkerClick = useCallback((obj: MapObject) => {
    if (isNavigating && destination?.id === obj.id) {
        setCompletionVulgraadPercentage(obj.vulgraad || 38);
        setIsCompletionSheetOpen(true);
    } else {
        setSelectedObjectForInfo(obj);
    }
  }, [isNavigating, destination]);

 const updateMapAndPosition = useCallback(() => {
    const userLocation = positionRef.current;
    if (!userLocation || !isNavigating) return;

    // Check distance to destination
    if (destination && !isCompletionSheetOpen && destination.id !== justCompletedObjectId) {
        const distanceToDestination = turf.distance(
            userLocation,
            [destination.longitude, destination.latitude],
            { units: 'meters' }
        );
        if (distanceToDestination < 15) {
            if (isSimulating) {
                simulationStateRef.current.isPaused = true;
                setCurrentSpeed(0);
            }
            handleMarkerClick(destination);
            return;
        }
    }

    if (!routeRef.current?.geometry) return;

    const map = mapRef.current?.getMap();
    if (!map) return;

    const routeLine = routeRef.current.geometry;
    const currentPoint = turf.point(userLocation);
    
    const snapped = turf.nearestPointOnLine(routeLine, currentPoint, { units: 'meters' });
    if (!snapped) return;

    // Check for deviation
    const deviation = turf.distance(currentPoint, snapped, { units: 'meters' });
    if (deviation > 50) {
        console.log("Deviation detected. Rerouting...");
        const nextObject = findNextObject(userLocation, pendingObjects);
        if (nextObject) {
            setDestination(nextObject);
            calculateRoute([userLocation, [nextObject.longitude, nextObject.latitude]]);
        }
        return; // Stop further processing for this update
    }

    const snappedCoords = snapped.geometry.coordinates as [number, number];
    snappedOriginRef.current = snappedCoords;

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
    setDisplayedRoute(remainingLine);
    
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
        pitch: 60,
        duration: 1000,
        easing: (t: number) => t,
        padding: { top: map.getCanvas().height * 0.35 },
    });
}, [pendingObjects, isNavigating, destination, isCompletionSheetOpen, calculateRoute, handleMarkerClick, justCompletedObjectId, isSimulating]);


 React.useEffect(() => {
    if (!isNavigating || isSimulating) {
      if (trackWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(trackWatchIdRef.current);
        trackWatchIdRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!isMounted) return;
        const { longitude, latitude, speed: gpsSpeed } = position.coords;
        positionRef.current = [longitude, latitude];
        const newSpeed = (gpsSpeed || 0) * 3.6; // m/s to km/h
        setCurrentSpeed(newSpeed);
        updateMapAndPosition();
        setLocationError(null);
      },
      (error) => {
        if (!isMounted) return;
        console.error("Error watching position:", error);
        setLocationError(`Locatiefout: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    trackWatchIdRef.current = watchId;

    return () => {
      isMounted = false;
      if (trackWatchIdRef.current) {
        navigator.geolocation.clearWatch(trackWatchIdRef.current);
        trackWatchIdRef.current = null;
      }
    };
  }, [isNavigating, isSimulating, updateMapAndPosition]);

  
 const simulationStateRef = React.useRef({
    distance: 0,
    isPaused: false,
    pauseTimeout: null as NodeJS.Timeout | null,
  });

  const handleStopNavigation = useCallback(() => {
    if (isSinglePointNav) {
        router.push('/issues');
    }

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
    setIsSinglePointNav(false);
    setIsHeaderVisible(true);
    setJustCompletedObjectId(null);
    
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
    
    const currentGpsLocation = positionRef.current;
    if (currentGpsLocation && mapRef.current) {
        snappedOriginRef.current = currentGpsLocation;
        mapRef.current.getMap().easeTo({
            center: currentGpsLocation,
            zoom: 14,
            pitch: 0,
            bearing: 0,
            duration: 1000,
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
        });
    }
  }, [firestore, user, activeRouteHistoryId, setIsHeaderVisible, isSinglePointNav, router]);

  const resumeSimulation = useCallback(() => {
    simulationStateRef.current.isPaused = false;
    if(simulationStateRef.current.pauseTimeout) {
      clearTimeout(simulationStateRef.current.pauseTimeout);
      simulationStateRef.current.pauseTimeout = null;
    }
  }, []);
  
  const handleToggleSimulation = () => {
    const isStarting = !isSimulating;
    setIsSimulating(isStarting);

    if (isStarting) {
        if (simulationIntervalRef.current) {
            clearInterval(simulationIntervalRef.current);
        }
        simulationStateRef.current = { distance: 0, isPaused: false, pauseTimeout: null };
        currentInstructionIndexRef.current = 0;
        
        if (routeRef.current && routeRef.current.geometry.coordinates.length > 0) {
          const startCoords = routeRef.current.geometry.coordinates[0];
          positionRef.current = startCoords;
          updateMapAndPosition();
        }

        simulationIntervalRef.current = setInterval(() => {
            if (!routeRef.current || !routeInstructionsRef.current.length || simulationStateRef.current.isPaused) return;
            
            const routeLine = routeRef.current.geometry;
            const totalDistance = routeInfoRef.current?.distance || 0;
            
            if (simulationStateRef.current.distance >= totalDistance) {
              handleNextObject('completed');
              return;
            }

            const cumulativeDistanceToNextManeuver = routeInstructionsRef.current
              .slice(0, currentInstructionIndexRef.current + 1)
              .reduce((acc, i) => acc + i.distance, 0);

            const distanceToNextManeuver = cumulativeDistanceToNextManeuver - simulationStateRef.current.distance;
            setDistanceToManeuver(distanceToNextManeuver);

            if (distanceToNextManeuver < 5) {
                const nextInstructionIndex = currentInstructionIndexRef.current + 1;
                if (nextInstructionIndex < routeInstructionsRef.current.length) {
                    currentInstructionIndexRef.current = nextInstructionIndex;
                    setCurrentInstruction(routeInstructionsRef.current[nextInstructionIndex]);
                }
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
    await setDocumentNonBlocking(docRef, routeHistoryData, {});
    setActiveRouteHistoryId(docRef.id);

    setCompletedObjects([]);
    setSkippedObjects([]);
    setPendingObjects(allObjects);

    const firstObject = findNextObject(positionRef.current, allObjects);

    if (firstObject) {
        setDestination(firstObject);
        await calculateRoute([positionRef.current, [firstObject.longitude, firstObject.latitude]]);
    }
  }, [user, firestore, selectedProjectId, selectedRouteId, selectedRoute, objectsInWijk, calculateRoute]);

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
  }, [historyRoutes, objects, projects, calculateRoute]);

  const handleStartOrResume = useCallback(() => {
    setJustCompletedObjectId(null);
    setIsNavigating(true);
    setIsCalculating(true);
    setIsHeaderVisible(false);
    if (selectedHistoryId) {
        handleResumeRoute(selectedHistoryId);
    } else if (selectedRouteId) {
        handleStartNavigation();
    }
  }, [selectedHistoryId, selectedRouteId, handleResumeRoute, handleStartNavigation, setIsHeaderVisible]);
  
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
        updateDocumentNonBlocking(objectRef, {
            lastCleaned: serverTimestamp(),
            vulgraad: completionVulgraadPercentage,
        });
      }
      const newPending = pendingObjects.filter(obj => obj.id !== objectId);
      setPendingObjects(newPending);
      return newPending;
  }


  const handleNextObject = async (status: 'completed' | 'skipped') => {
    if (!positionRef.current || !destination) return;
    
    setJustCompletedObjectId(destination.id);
    if(isSinglePointNav) {
        handleStopNavigation();
        return;
    }
    
    const newPendingObjects = await updateObjectStatus(destination.id, status);

    const nextObject = findNextObject(positionRef.current, newPendingObjects);

    if (nextObject) {
      setDestination(nextObject);
      const routePoints: ([number, number] | null)[] = [positionRef.current, [nextObject.longitude, nextObject.latitude]];
      await calculateRoute(routePoints);
      if (isSimulating) {
        simulationStateRef.current.distance = 0;
      }
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
    if(isSimulating) {
        resumeSimulation();
    }
  };

  const centerOnLocation = () => {
    const centerPoint = snappedOriginRef.current;
    if (centerPoint) {
      const map = mapRef.current?.getMap();
      if (map) {
        const options: any = {
          center: centerPoint,
          zoom: isNavigating ? 20 : 17,
        };

        if (isNavigating) {
          options.pitch = 60;
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

  const hue = 120 * (1 - (completionVulgraadPercentage || 0) / 100);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={mapContainerRef} className="flex-1 relative bg-gray-800">
        {!isNavigating && !isSinglePointNav && (
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
                                      <div className="flex justify-between w-full items-center">
                                        <span>{w.naam}</span>
                                        <span className="text-muted-foreground text-xs ml-2">
                                            ({objectCountsForRoutes[w.id] || 0} objecten)
                                        </span>
                                      </div>
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
                                        {(profile?.role === 'Super admin' || profile?.role === 'toezichthouder') && usersMap.get(r.userId) ? (
                                          <span className="font-semibold mr-1">{usersMap.get(r.userId)}:</span>
                                        ) : null}
                                        {r.routeName} - {r.startTime?.toDate ? new Date(r.startTime.toDate()).toLocaleString('nl-NL') : 'Recent'}
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
                 {!isSinglePointNav && (
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
                 )}
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
          {snappedOriginRef.current && (
            <Marker longitude={snappedOriginRef.current[0]} latitude={snappedOriginRef.current[1]} rotationAlignment="map" rotation={viewState.bearing}>
               <div className="flex items-center justify-center">
                 <svg width={isNavigating ? "32" : "16"} height={isNavigating ? "32" : "16"} viewBox="0 0 50 50" className={cn(isNavigating && 'animate-pulse')}>
                    <circle cx="25" cy="25" r="25" fill="#3b82f6" stroke="#ffffff" strokeWidth="4" />
                </svg>
              </div>
            </Marker>
          )}
          
          {isNavigating && destination && (
            <Marker
              key={`destination-marker`}
              longitude={destination.longitude}
              latitude={destination.latitude}
              anchor="bottom"
              onClick={() => handleMarkerClick(destination)}
            >
              <MapPin className={cn("w-10 h-10 animate-pulse", isSinglePointNav ? "text-red-600" : "text-blue-600")} />
            </Marker>
          )}

          {isNavigating && !isSinglePointNav && objectsForCurrentRoute?.map(obj => {
              if (destination?.id === obj.id) return null; // Already rendered as destination

              const color = getMarkerColor(obj.id);

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
                  <div className={cn(`w-3 h-3 rounded-full border-2 border-white cursor-pointer`, color)}/>
                </Marker>
              )
          })}

          {!isNavigating && objectsInWijk?.map(obj => {
            return (
             <Marker
                key={obj.id}
                longitude={obj.longitude}
                latitude={obj.latitude}
                onClick={() => handleMarkerClick(obj)}
                onMouseEnter={() => setHoveredObject(obj)}
                onMouseLeave={() => setHoveredObject(null)}
             >
              <div className={`w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white cursor-pointer`} />
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
            <DialogContent className="sm:max-w-[40vw] rounded-xl">
                <DialogHeader>
                    <DialogTitle>{isSinglePointNav ? 'Bestemming Bereikt' : `OBJECT-ID: ${destination?.id}`}</DialogTitle>
                    <DialogDescription>
                        {isSinglePointNav
                            ? 'U bent aangekomen op de bestemming.'
                            : 'Markeer dit object als voltooid en ga verder naar de volgende.'}
                    </DialogDescription>
                </DialogHeader>
                {isSinglePointNav ? (
                    <div className="flex items-center justify-center py-8">
                      <Button onClick={() => handleNextObject('completed')} size="lg">
                        <CheckCircle className="mr-2 h-5 w-5" />
                        Navigatie Voltooien
                      </Button>
                    </div>
                ) : (
                    <div className="space-y-4 py-4">
                      <div className="space-y-4">
                          <Label className="text-center block">Selecteer vulgraad</Label>
                          <div className="h-48 -mb-4">
                              <ResponsiveContainer width="100%" height="100%">
                                  <RadialBarChart 
                                      cx="50%"
                                      cy="100%"
                                      innerRadius="120%" 
                                      outerRadius="160%" 
                                      data={[{ name: 'vulgraad', value: completionVulgraadPercentage }]} 
                                      startAngle={180} 
                                      endAngle={0}
                                      barSize={40}
                                  >
                                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                      <RadialBar 
                                          background={{ fill: 'hsl(var(--muted))' }}
                                          dataKey='value' 
                                          cornerRadius={12}
                                          fill={`hsl(${hue}, 80%, 50%)`}
                                      />
                                      <text x="50%" y="80%" textAnchor="middle" dominantBaseline="middle" className="text-5xl font-bold fill-foreground">
                                          {completionVulgraadPercentage}%
                                      </text>
                                  </RadialBarChart>
                              </ResponsiveContainer>
                          </div>
                          <div className="flex items-center justify-center gap-4 pt-4">
                              <Button variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={() => setCompletionVulgraadPercentage(v => Math.max(0, v - 5))}>
                                  <span className="text-2xl">-</span>
                              </Button>
                              <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={completionVulgraadPercentage}
                                  onChange={(e) => {
                                      const val = Number(e.target.value);
                                      if (val >= 0 && val <= 100) {
                                          setCompletionVulgraadPercentage(val);
                                      }
                                  }}
                                  className="w-24 text-center text-2xl font-bold h-12"
                              />
                              <Button variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={() => setCompletionVulgraadPercentage(v => Math.min(100, v + 5))}>
                                  <span className="text-2xl">+</span>
                              </Button>
                          </div>
                      </div>
                      <div className="flex items-center justify-center gap-4">
                        <Image 
                            src="https://i.ibb.co/pjqtgDZj/Chat-GPT-Image-15-jan-2026-21-25-58-removebg-preview.png"
                            alt="Gereed"
                            width={200}
                            height={200}
                            onClick={() => handleNextObject('completed')}
                            className="cursor-pointer hover:scale-105 transition-transform"
                        />
                          <Image 
                            src="https://i.ibb.co/qLKX0VYH/Chat-GPT-Image-15-jan-2026-21-28-53-removebg-preview.png"
                            alt="Niet Gereed"
                            width={200}
                            height={200}
                            onClick={() => handleNextObject('skipped')}
                            className="cursor-pointer hover:scale-105 transition-transform"
                        />
                      </div>
                    </div>
                )}
                 <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost" onClick={() => { if(isSimulating) { resumeSimulation() } }}>Sluiten</Button>
                  </DialogClose>
                 </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
