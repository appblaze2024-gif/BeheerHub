'use client';

import * as React from 'react';
import MapGL, { Source, Layer, type MapRef, Marker, Popup } from 'react-map-gl';
import { useProfile } from '@/firebase/profile-provider';
import * as turf from '@turf/turf';
import { useCollection, useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { Object as MapObject, Melding, Besteksmelding, Project } from '@/lib/types';
import { Layers, LocateFixed } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const boundaryLayer: Layer = {
  id: 'municipality-outline',
  type: 'line',
  paint: {
    'line-color': '#000000',
    'line-width': 2,
  },
};

const LayerToggle = ({ label, count, checked, onCheckedChange, color }: { label: string, count: number, checked: boolean, onCheckedChange: (checked: boolean) => void, color: string }) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Checkbox id={label} checked={checked} onCheckedChange={onCheckedChange} />
        <Label htmlFor={label} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <div className={cn("h-3 w-3 rounded-full", color)} />
          {label}
        </Label>
      </div>
      <Badge variant="secondary" className="font-mono text-xs">{count}</Badge>
    </div>
);

export default function DashboardPage() {
  const mapRef = React.useRef<MapRef>(null);
  const { profile } = useProfile();
  const firestore = useFirestore();

  const [boundary, setBoundary] = React.useState<any>(null);
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  });

  const [visibleLayers, setVisibleLayers] = React.useState({
    objects: false,
    meldingen: false,
    besteksmeldingen: false,
  });

  const [selectedPin, setSelectedPin] = React.useState<any>(null);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = React.useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = React.useState(false);
  const [userLocation, setUserLocation] = React.useState<{ latitude: number, longitude: number } | null>(null);
  const locationWatcherId = React.useRef<number | null>(null);

  const objectsQuery = React.useMemo(() => firestore ? collection(firestore, 'objects') : null, [firestore]);
  const meldingenQuery = React.useMemo(() => firestore ? collection(firestore, 'meldingen') : null, [firestore]);
  const projectsQuery = React.useMemo(() => firestore ? collection(firestore, 'projects') : null, [firestore]);

  const { data: objects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsQuery);
  const { data: meldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenQuery);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);
  
  const [allBesteksmeldingen, setAllBesteksmeldingen] = React.useState<Besteksmelding[]>([]);
  const [isLoadingBesteksmeldingen, setIsLoadingBesteksmeldingen] = React.useState(true);

  React.useEffect(() => {
    if (!projects || !firestore) {
      if (!isLoadingProjects) {
        setIsLoadingBesteksmeldingen(false);
      }
      return;
    };
    
    const fetchAll = async () => {
      setIsLoadingBesteksmeldingen(true);
      const promises = projects.map(p => {
        if (!p.id) return Promise.resolve(null);
        return getDocs(collection(firestore, 'projects', p.id, 'besteksmeldingen'));
      });
      const snapshots = await Promise.all(promises);
      const allMeldingen = snapshots.filter(s => s).flatMap(snap => snap!.docs.map(d => ({ ...d.data(), id: d.id } as Besteksmelding)));
      setAllBesteksmeldingen(allMeldingen);
      setIsLoadingBesteksmeldingen(false);
    }
    fetchAll();
  }, [projects, firestore, isLoadingProjects]);


  React.useEffect(() => {
    if (profile?.schouwenGemeente) {
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          profile.schouwenGemeente
        )}&format=json&polygon_geojson=1&countrycodes=nl`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.length > 0 && data[0].geojson) {
            const geojsonData = data[0].geojson;
            setBoundary(geojsonData);
            
            if (mapRef.current?.getMap().isStyleLoaded()) {
                const bbox = turf.bbox(geojsonData);
                mapRef.current?.fitBounds(bbox as [number, number, number, number], {
                    padding: 40,
                    duration: 1000,
                });
            }
          }
        })
        .catch(console.error);
    } else {
        setBoundary(null);
    }
  }, [profile?.schouwenGemeente]);

  const onMapLoad = React.useCallback(() => {
      if (boundary) {
          const bbox = turf.bbox(boundary);
          mapRef.current?.fitBounds(bbox as [number, number, number, number], {
              padding: 40,
          });
      }
  }, [boundary]);

  React.useEffect(() => {
    if (isTrackingLocation) {
      if (!navigator.geolocation) {
        console.error("Geolocation is not supported by your browser.");
        setIsTrackingLocation(false);
        return;
      }
      
      locationWatcherId.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
          mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15 });
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsTrackingLocation(false); // Turn off if there's an error
        },
        { enableHighAccuracy: true }
      );
    } else {
      if (locationWatcherId.current !== null) {
        navigator.geolocation.clearWatch(locationWatcherId.current);
        locationWatcherId.current = null;
      }
      setUserLocation(null); // Clear location when tracking is off
    }

    return () => {
      if (locationWatcherId.current !== null) {
        navigator.geolocation.clearWatch(locationWatcherId.current);
      }
    };
  }, [isTrackingLocation]);

  const renderMarkers = (items: any[] | null, color: string, type: string) => {
      if (!items) return null;
      return items.map((item) => {
          if (typeof item.latitude !== 'number' || typeof item.longitude !== 'number') return null;
          return (
            <Marker
                key={`${type}-${item.id}`}
                longitude={item.longitude}
                latitude={item.latitude}
                onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    setSelectedPin({...item, type});
                }}
            >
                <div className={cn("w-3 h-3 rounded-full cursor-pointer border border-white", color)} />
            </Marker>
          )
      });
  }

  const renderPopup = () => {
    if (!selectedPin) return null;

    let title = 'Details';
    let details: [string, any][] = [];

    switch (selectedPin.type) {
      case 'object':
        title = `Object: ${selectedPin.id}`;
        details = [
          ['Type', selectedPin.locatieSubType || '-'],
          ['Status', selectedPin.isActief ? 'Actief' : 'Inactief'],
          ['Vulgraad', `${selectedPin.vulgraad || 0}%`],
        ];
        break;
      case 'melding':
        title = `Melding: ${selectedPin.intakenummer}`;
        details = [
          ['Categorie', selectedPin.subcategorie],
          ['Status', selectedPin.status],
          ['Melder', selectedPin.melder],
        ];
        break;
      case 'besteksmelding':
        title = `Bestek: ${selectedPin.werksoort}`;
        details = [
          ['Status', selectedPin.status],
          ['Omschrijving', selectedPin.omschrijving],
        ];
        break;
      default:
        return null;
    }
    
    return (
        <Popup
            longitude={selectedPin.longitude}
            latitude={selectedPin.latitude}
            onClose={() => setSelectedPin(null)}
            closeOnClick={false}
            anchor="bottom"
            >
            <div className="p-1 max-w-xs">
                <h3 className="font-bold text-base mb-2">{title}</h3>
                <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-sm">
                    {details.map(([key, value]) => (
                        <React.Fragment key={key}>
                            <span className="font-semibold">{key}:</span>
                            <span className="truncate">{value}</span>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </Popup>
    )
  }

  return (
    <div className="flex-1 w-full h-full relative">
       <MapGL
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onLoad={onMapLoad}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {boundary && (
          <Source id="municipality-boundary" type="geojson" data={boundary}>
            <Layer {...boundaryLayer} />
          </Source>
        )}

        {visibleLayers.objects && renderMarkers(objects, 'bg-blue-600', 'object')}
        {visibleLayers.meldingen && renderMarkers(meldingen, 'bg-red-600', 'melding')}
        {visibleLayers.besteksmeldingen && renderMarkers(allBesteksmeldingen, 'bg-orange-500', 'besteksmelding')}

        {userLocation && (
          <Marker longitude={userLocation.longitude} latitude={userLocation.latitude}>
            <div className="relative flex h-4 w-4 items-center justify-center">
              <div className="absolute h-6 w-6 rounded-full bg-blue-500/50 animate-pulse" />
              <div className="relative h-3 w-3 rounded-full bg-blue-600 border-2 border-white" />
            </div>
          </Marker>
        )}

        {renderPopup()}

      </MapGL>
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
            <Button
                variant="secondary"
                size="icon"
                className="rounded-full h-12 w-12 shadow-lg"
                onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
            >
                <Layers className="h-6 w-6" />
            </Button>
            <Button
                variant={isTrackingLocation ? "default" : "secondary"}
                size="icon"
                className="rounded-full h-12 w-12 shadow-lg"
                onClick={() => setIsTrackingLocation(!isTrackingLocation)}
            >
                <LocateFixed className="h-6 w-6" />
            </Button>
            {isLayersPanelOpen && (
                <Card className="w-64">
                    <CardHeader className="flex flex-row items-center justify-between p-3 border-b">
                        <CardTitle className="text-base">Kaartlagen</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2">
                        <LayerToggle 
                            label="Objecten" 
                            count={objects?.length || 0}
                            checked={visibleLayers.objects} 
                            onCheckedChange={(checked) => setVisibleLayers(v => ({...v, objects: !!checked}))}
                            color="bg-blue-600"
                        />
                        <LayerToggle 
                            label="Meldingen" 
                            count={meldingen?.length || 0}
                            checked={visibleLayers.meldingen} 
                            onCheckedChange={(checked) => setVisibleLayers(v => ({...v, meldingen: !!checked}))}
                            color="bg-red-600"
                        />
                        <LayerToggle 
                            label="Besteksmeldingen" 
                            count={allBesteksmeldingen?.length || 0}
                            checked={visibleLayers.besteksmeldingen} 
                            onCheckedChange={(checked) => setVisibleLayers(v => ({...v, besteksmeldingen: !!checked}))}
                            color="bg-orange-500"
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    </div>
  );
}
