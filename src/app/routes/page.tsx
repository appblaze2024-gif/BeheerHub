'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Play } from 'lucide-react';
import type { FeatureCollection, Point, LineString } from 'geojson';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const emptyGeoJSON: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: [],
};

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [startPoint, setStartPoint] = React.useState<[number, number] | null>(null);
  const [endPoint, setEndPoint] = React.useState<[number, number] | null>(null);
  const [route, setRoute] = React.useState<FeatureCollection<LineString> | null>(null);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const handleMapClick = (e: mapboxgl.MapLayerMouseEvent) => {
    if (isLoading) return;

    const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];

    if (!startPoint) {
      setStartPoint(coords);
      setEndPoint(null);
      setRoute(null);
    } else if (!endPoint) {
      setEndPoint(coords);
    }
  };

  const fetchRoute = React.useCallback(async () => {
    if (!startPoint || !endPoint) return;

    setIsLoading(true);
    setRoute(null);

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startPoint[0]},${startPoint[1]};${endPoint[0]},${endPoint[1]}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const routeGeometry = data.routes[0].geometry;
        setRoute({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: routeGeometry,
          }],
        });
      } else {
        console.error('Geen route gevonden:', data.message);
        clearRoute();
      }
    } catch (error) {
      console.error('Fout bij het ophalen van de route:', error);
      clearRoute();
    } finally {
      setIsLoading(false);
    }
  }, [startPoint, endPoint]);

  React.useEffect(() => {
    if (startPoint && endPoint) {
      fetchRoute();
    }
  }, [startPoint, endPoint, fetchRoute]);

  const clearRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setRoute(null);
    setIsLoading(false);
  };
  
  const pointsGeoJSON: FeatureCollection<Point> = React.useMemo(() => {
    const features = [];
    if (startPoint) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: startPoint },
        properties: { type: 'start' },
      });
    }
    if (endPoint) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: endPoint },
        properties: { type: 'end' },
      });
    }
    return {
      type: 'FeatureCollection',
      features,
    };
  }, [startPoint, endPoint]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-card p-4 rounded-lg shadow-lg">
        <h2 className="text-lg font-semibold">Route Definiëren</h2>
        {!startPoint && <p className="text-sm text-muted-foreground">Klik op de kaart om een startpunt te kiezen.</p>}
        {startPoint && !endPoint && <p className="text-sm text-muted-foreground">Klik op de kaart om een eindpunt te kiezen.</p>}
        {route && <p className="text-sm text-green-600 font-medium">Route succesvol berekend!</p>}
      </div>

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {isLoading && (
          <Button variant="default" size="lg" disabled>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Route berekenen...
          </Button>
        )}
        {(startPoint || endPoint || route) && !isLoading && (
          <Button onClick={clearRoute} variant="destructive" size="lg">
            <Trash2 className="mr-2 h-5 w-5" />
            Wis Route
          </Button>
        )}
        {route && !isLoading && (
            <Button onClick={() => alert('Route verwerken...')} variant="default" size="lg">
              <Play className="mr-2 h-5 w-5" />
              Verwerk Route
            </Button>
        )}
      </div>

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleMapClick}
        cursor={isLoading ? 'wait' : startPoint && !endPoint ? 'crosshair' : 'grab'}
      >
        <Source id="points-data" type="geojson" data={pointsGeoJSON}>
            <Layer
                id="start-point"
                type="circle"
                source="points-data"
                filter={['==', ['get', 'type'], 'start']}
                paint={{
                    'circle-radius': 8,
                    'circle-color': '#22c55e',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }}
            />
             <Layer
                id="end-point"
                type="circle"
                source="points-data"
                filter={['==', ['get', 'type'], 'end']}
                paint={{
                    'circle-radius': 8,
                    'circle-color': '#ef4444',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }}
            />
        </Source>

        {route && (
          <Source id="route-data" type="geojson" data={route}>
            <Layer
              id="route-line"
              type="line"
              source="route-data"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': '#3b82f6',
                'line-width': 6,
                'line-opacity': 0.8,
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
