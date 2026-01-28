'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, type MapRef } from 'react-map-gl';
import {
  Search,
  LocateFixed,
  Plus,
  Minus,
  Layers,
  ArrowUp,
  Filter,
  Zap,
  Menu,
  Navigation,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useSearchParams } from 'next/navigation';
import polyline from '@mapbox/polyline';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import type { Object as MapObject, Project } from '@/lib/types';
import * as turf from '@turf/turf';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';


const MAPBOX_TOKEN =
  'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const routeLayerStyle: any = {
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#f43f5e', // rose-500, a pinkish-red
    'line-width': 4,
    'line-dasharray': [0, 2.5],
    'line-cap': 'round',
  },
};

const objectStatusColors: Record<string, string> = {
    completed: 'bg-green-500',
    skipped: 'bg-orange-500',
    pending: 'bg-blue-500',
}

interface RouteStop {
  id: string;
  lat: number;
  lng: number;
  status: 'pending' | 'completed' | 'skipped';
}

function RouteSheetContent({ routeStops, onStopClick }: { routeStops: RouteStop[], onStopClick: (stop: RouteStop) => void }) {
    if (routeStops.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">Geen objecten in route.</div>
    }

    return (
        <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
                {routeStops.map(stop => (
                    <Card key={stop.id} onClick={() => onStopClick(stop)} className="cursor-pointer hover:bg-muted">
                        <CardContent className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn("w-4 h-4 rounded-full", objectStatusColors[stop.status])} />
                                <p className="font-semibold">{stop.id}</p>
                            </div>
                             <Badge variant={stop.status === 'pending' ? 'secondary' : stop.status === 'completed' ? 'default' : 'destructive'} className="capitalize">{stop.status}</Badge>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </ScrollArea>
    )
}

export default function NavigationModulePage() {
  const mapRef = React.useRef<MapRef>(null);
  const { setIsHeaderVisible } = useNavigationUI();
  const searchParams = useSearchParams();
  const firestore = useFirestore();

  const destLat = searchParams.get('dest_lat');
  const destLon = searchParams.get('dest_lon');
  const destId = searchParams.get('dest_id');
  const projectId = searchParams.get('projectId');
  const wijkId = searchParams.get('wijkId');
  
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [destination, setDestination] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [route, setRoute] = React.useState<any>(null);
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 15,
  });

  const [currentRouteStops, setCurrentRouteStops] = React.useState<RouteStop[]>([]);
  
  const projectRef = React.useMemo(() => {
      if (!firestore || !projectId) return null;
      return doc(firestore, 'projects', projectId);
  }, [firestore, projectId]);
  const { data: project } = useDoc<Project>(projectRef);
  
  const wijk = React.useMemo(() => {
      if (!project || !wijkId) return null;
      return project.wijken?.find(w => w.id === wijkId);
  }, [project, wijkId]);
  
  const objectsInWijkQuery = React.useMemo(() => {
    if (!firestore || !wijk) return null;
    return collection(firestore, 'objects'); // This should be a more specific query
  }, [firestore, wijk]);
  
  const { data: allObjects } = useCollection<MapObject>(objectsInWijkQuery);


  React.useEffect(() => {
    // Hide the main app header when this component mounts
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);
  
  const centerOnLocation = React.useCallback(() => {
    if (userLocation) {
      mapRef.current?.flyTo({ center: [userLocation.longitude, userLocation.latitude], zoom: 16 });
    }
  }, [userLocation]);

  React.useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { longitude, latitude } = position.coords;
        setUserLocation({ longitude, latitude });
      },
      (error) => console.error(error),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  
  React.useEffect(() => {
      if (destLat && destLon) {
          setDestination({ latitude: parseFloat(destLat), longitude: parseFloat(destLon) });
      }
  }, [destLat, destLon]);

  React.useEffect(() => {
    const fetchRoute = async () => {
      if (userLocation && destination) {
        try {
          const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${userLocation.longitude},${userLocation.latitude};${destination.longitude},${destination.latitude}?geometries=polyline&access_token=${MAPBOX_TOKEN}`
          );
          const data = await response.json();
          if (data.routes && data.routes.length > 0) {
            const routeGeometry = data.routes[0].geometry;
            const decoded = polyline.decode(routeGeometry);
            const coordinates = decoded.map(([lat, lon]) => [lon, lat]);
            setRoute({
              type: 'Feature' as const,
              properties: {},
              geometry: {
                type: 'LineString' as const,
                coordinates,
              },
            });
            
            const allPoints = [userLocation, destination, ...coordinates.map(c => ({longitude: c[0], latitude: c[1]}))];
            const bbox = turf.bbox(turf.featureCollection(allPoints.map(p => turf.point([p.longitude, p.latitude]))));
             mapRef.current?.fitBounds(bbox as [number, number, number, number], {
                padding: { top: 120, bottom: 50, left: 50, right: 50 },
                duration: 1000
            });
          }
        } catch (error) {
          console.error("Error fetching route:", error);
        }
      }
    };
    fetchRoute();
  }, [userLocation, destination]);


  React.useEffect(() => {
    if (!wijk || !allObjects) {
      setCurrentRouteStops([]);
      return;
    }

    try {
      const wijkFeatures = JSON.parse(wijk.subGebieden);
      if (Array.isArray(wijkFeatures) && wijkFeatures.length > 0) {
        const objectsInArea = allObjects.filter(obj => {
          if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
          const point = turf.point([obj.longitude, obj.latitude]);
          for (const polygon of wijkFeatures) {
            if (turf.booleanPointInPolygon(point, polygon)) return true;
          }
          return false;
        });

        setCurrentRouteStops(objectsInArea.map(obj => ({
          id: obj.id,
          lat: obj.latitude,
          lng: obj.longitude,
          status: obj.id === destId ? 'pending' : 'completed', // Dummy status
        })));
      }
    } catch(e) {
      console.error("Error parsing wijk geojson", e);
      setCurrentRouteStops([]);
    }
  }, [wijk, allObjects, destId]);

  const handleZoom = (level: number) => {
    mapRef.current?.getMap().zoomTo(mapRef.current.getMap().getZoom() + level, { duration: 300 });
  };
  
  const handleStopClick = (stop: RouteStop) => {
      setDestination({ latitude: stop.lat, longitude: stop.lng });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden h-full relative">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
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
        {route && (
            <Source id="route-line" type="geojson" data={route}>
                <Layer {...routeLayerStyle} />
            </Source>
        )}
        {currentRouteStops.map(stop => (
          <Marker key={stop.id} longitude={stop.lng} latitude={stop.lat} anchor="center">
            <div className={cn("w-5 h-5 rounded-full shadow-md border-2 border-white", objectStatusColors[stop.status])} />
          </Marker>
        ))}
      </MapGL>

      <header className="absolute top-0 left-0 right-0 z-10 pt-4 px-4 bg-gradient-to-b from-white/90 via-white/70 to-transparent">
        <div className="bg-white p-3 rounded-xl shadow-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg flex items-center justify-center">
              <Navigation className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{project?.projectnaam || 'Navigatie'}</p>
              <h1 className="text-base font-bold">{wijk?.naam || 'Route'}</h1>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <X className="h-6 w-6" />
          </Button>
        </div>
      </header>

      <div className="absolute top-28 left-4 right-4 z-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Zoek adres of sensor"
            className="w-full pl-11 pr-4 py-2 h-14 shadow-lg rounded-lg border-none text-base"
          />
        </div>
      </div>

      <div className="absolute top-1/2 -translate-y-1/2 right-4 z-10 flex flex-col gap-2">
        <Button variant="secondary" size="icon" className="bg-white text-black shadow-lg hover:bg-gray-100 h-12 w-12 rounded-lg" onClick={() => handleZoom(1)}>
          <Plus className="h-6 w-6" />
        </Button>
        <Button variant="secondary" size="icon" className="bg-white text-black shadow-lg hover:bg-gray-100 h-12 w-12 rounded-lg" onClick={() => handleZoom(-1)}>
          <Minus className="h-6 w-6" />
        </Button>
        <div className="h-2" />
        <Button variant="secondary" size="icon" className="bg-white text-black shadow-lg hover:bg-gray-100 h-12 w-12 rounded-lg" onClick={centerOnLocation}>
          <LocateFixed className="h-6 w-6" />
        </Button>
      </div>
      
       <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary" className="absolute bottom-6 left-4 right-4 z-10 bg-white shadow-lg h-12 rounded-lg flex-1">
                <ArrowUp className="mr-2 h-5 w-5" />
                <span className="font-semibold">Toon Route Objecten ({currentRouteStops.length})</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[60%]">
            <SheetHeader>
              <SheetTitle>Route Objecten</SheetTitle>
            </SheetHeader>
            <RouteSheetContent routeStops={currentRouteStops} onStopClick={handleStopClick} />
          </SheetContent>
        </Sheet>
    </div>
  );
}
