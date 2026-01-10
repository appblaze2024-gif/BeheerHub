'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import { Button } from '@/components/ui/button';
import { Trash2, Undo2 } from 'lucide-react';
import type { FeatureCollection, LineString, Feature } from 'geojson';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const [selectedRoads, setSelectedRoads] = React.useState<Feature<LineString>[]>([]);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const handleMapClick = (e: mapboxgl.MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const features = map.queryRenderedFeatures(e.point, {
      layers: ['road-primary', 'road-street', 'road-motorway', 'road-trunk', 'road-secondary', 'road-tertiary', 'road-motorway-link', 'road-trunk-link', 'road-primary-link', 'road-secondary-link', 'road-tertiary-link', 'road-path', 'road-service', 'road-living-street', 'road-residential'] 
    });

    if (features.length > 0) {
      const roadFeature = features[0] as Feature<LineString>;
      
      // Prevent adding the exact same road segment twice
      if (!selectedRoads.some(r => r.id === roadFeature.id)) {
        setSelectedRoads(prevRoads => [...prevRoads, roadFeature]);
      }
    }
  };
  
  const clearRoute = () => {
    setSelectedRoads([]);
  };

  const undoLastSelection = () => {
    setSelectedRoads(prevRoads => prevRoads.slice(0, -1));
  }
  
  const selectedRouteGeoJSON: FeatureCollection<LineString> = React.useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: selectedRoads,
    };
  }, [selectedRoads]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-card p-4 rounded-lg shadow-lg">
        <h2 className="text-lg font-semibold">Route Definiëren</h2>
        {selectedRoads.length === 0 && <p className="text-sm text-muted-foreground">Klik op een weg om deze te selecteren.</p>}
        {selectedRoads.length > 0 && <p className="text-sm text-green-600 font-medium">{selectedRoads.length} wegsegment(en) geselecteerd.</p>}
      </div>

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {selectedRoads.length > 0 && (
            <div className="flex gap-2">
                <Button onClick={undoLastSelection} variant="secondary" size="lg" aria-label="Stap terug">
                    <Undo2 className="h-5 w-5" />
                </Button>
                <Button onClick={clearRoute} variant="destructive" size="lg">
                    <Trash2 className="mr-2 h-5 w-5" />
                    Wis Route
                </Button>
            </div>
        )}
      </div>

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleMapClick}
        cursor='pointer'
        interactiveLayerIds={['road-primary', 'road-street', 'road-motorway', 'road-trunk', 'road-secondary', 'road-tertiary', 'road-motorway-link', 'road-trunk-link', 'road-primary-link', 'road-secondary-link', 'road-tertiary-link', 'road-path', 'road-service', 'road-living-street', 'road-residential']}
      >
        <Source id="selected-route-data" type="geojson" data={selectedRouteGeoJSON}>
            <Layer
              id="selected-route-line"
              type="line"
              source="selected-route-data"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': '#3b82f6',
                'line-width': 5,
                'line-opacity': 0.8,
              }}
            />
          </Source>
      </Map>
    </div>
  );
}