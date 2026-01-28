"use client";

import * as React from 'react';
import MapGL, { Source, Layer, type MapRef, Marker, Popup } from 'react-map-gl';
import { useProfile } from '@/firebase/profile-provider';
import * as turf from '@turf/turf';
import { useCollection, useFirestore } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { Object as MapObject, Melding, Besteksmelding, Project } from '@/lib/types';
import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const boundaryLayer: Layer = {
  id: 'municipality-outline',
  type: 'line',
  paint: {
    'line-color': '#000000',
    'line-width': 2,
  },
};

const LayerToggle = ({ label, checked, onCheckedChange, color }: { label: string, checked: boolean, onCheckedChange: (checked: boolean) => void, color: string }) => (
    <div className="flex items-center space-x-2">
      <Checkbox id={label} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={label} className="flex items-center gap-2 text-sm font-medium">
        <div className={cn("h-3 w-3 rounded-full", color)} />
        {label}
      </Label>
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

  // Layer visibility state
  const [visibleLayers, setVisibleLayers] = React.useState({
    objects: false,
    meldingen: false,
    besteksmeldingen: false,
  });

  const [selectedPin, setSelectedPin] = React.useState<any>(null);

  // Fetching data
  const { data: objects, isLoading: isLoadingObjects } = useCollection<MapObject>(
    firestore ? collection(firestore, 'objects') : null
  );
  const { data: meldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(
    firestore ? collection(firestore, 'meldingen') : null
  );
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(
    firestore ? collection(firestore, 'projects') : null
  );
  
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

        {renderPopup()}

      </MapGL>
        <Card className="absolute top-4 right-4 z-10 w-64">
            <CardHeader className="flex flex-row items-center justify-between p-3 border-b">
                <CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> Kaartlagen</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
                <LayerToggle 
                    label="Objecten" 
                    checked={visibleLayers.objects} 
                    onCheckedChange={(checked) => setVisibleLayers(v => ({...v, objects: !!checked}))}
                    color="bg-blue-600"
                />
                 <LayerToggle 
                    label="Meldingen" 
                    checked={visibleLayers.meldingen} 
                    onCheckedChange={(checked) => setVisibleLayers(v => ({...v, meldingen: !!checked}))}
                    color="bg-red-600"
                />
                 <LayerToggle 
                    label="Besteksmeldingen" 
                    checked={visibleLayers.besteksmeldingen} 
                    onCheckedChange={(checked) => setVisibleLayers(v => ({...v, besteksmeldingen: !!checked}))}
                    color="bg-orange-500"
                />
            </CardContent>
        </Card>
    </div>
  );
}
