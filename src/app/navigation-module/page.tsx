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
  
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);

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

    // Mapbox Directions API has a limit of 25 coordinates for driving-traffic profile.
    // We use 24 for destinations + 1 for origin.
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

  const handleStartNavigation = () => {
    if (!origin || objectsInWijk.length === 0) return;
    
    setIsNavigating(true);

    const allPoints: [number, number][] = [
      origin,
      ...objectsInWijk.map(o => [o.longitude, o.latitude] as [number, number])
    ];
    
    calculateRoute(allPoints);

    mapRef.current?.getMap().flyTo({
        center: origin,
        zoom: 18,
        pitch: 60,
        bearing: -20,
    });
  };
  
  const handleStopNavigation = () => {
    setIsNavigating(false);
    setRoute(null);
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
            zoom: isNavigating ? 18 : 15,
            pitch: isNavigating ? 60 : 0,
        });
    }
  };
  
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
             <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between items-center">
                <div className="bg-card/90 backdrop-blur-sm p-3 rounded-full shadow-lg flex items-center gap-4 text-card-foreground">
                    <p className="font-semibold text-lg">12:30 PM</p>
                    <div className="border-l border-gray-300 h-6"></div>
                    <p className="text-sm">52 km</p>
                    <p className="text-sm text-gray-500">1:15 PM aankomst</p>
                </div>
                <Button variant="destructive" size="icon" className="rounded-full h-12 w-12" onClick={handleStopNavigation}>
                    <X className="h-6 w-6" />
                </Button>
            </div>
        )}


        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle={isNavigating ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12"}
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {origin && (
            <Marker longitude={origin[0]} latitude={origin[1]}>
              <div className="p-1 bg-blue-500 rounded-full border-4 border-white shadow-md flex items-center justify-center">
                <Navigation className="w-5 h-5 text-white transform -rotate-45" />
              </div>
            </Marker>
          )}

          {!isNavigating && objectsInWijk.map(obj => (
             <Marker
                key={obj.id}
                longitude={obj.longitude}
                latitude={obj.latitude}
             >
              <div className="w-2.5 h-2.5 bg-gray-700 rounded-full border-2 border-white" />
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
