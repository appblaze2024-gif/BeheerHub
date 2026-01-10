'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import { Button } from '@/components/ui/button';
import { Trash2, Undo2 } from 'lucide-react';
import type { FeatureCollection, LineString, Feature, Point } from 'geojson';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const [selectedRoads, setSelectedRoads] = React.useState<Feature<LineString>[]>([]);
  const [waypoints, setWaypoints] = React.useState<Feature<Point>[]>([]);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const handleMapClick = (e: mapboxgl.MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Find the road feature under the click
    const features = map.queryRenderedFeatures(e.point);
    const roadFeature = features.find(
      (f) => f.sourceLayer === 'road' && f.geometry.type === 'LineString'
    ) as Feature<LineString> | undefined;

    if (roadFeature) {
      // Add a waypoint (dot) at the clicked location
      const newWaypoint: Feature<Point> = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [e.lngLat.lng, e.lngLat.lat],
        },
        properties: {
          roadId: roadFeature.id, // Link waypoint to road segment
        },
      };
      setWaypoints(prevWaypoints => [...prevWaypoints, newWaypoint]);

      // Add the road segment to be highlighted, avoid duplicates
      if (!selectedRoads.some(r => r.id === roadFeature.id)) {
        setSelectedRoads(prevRoads => [...prevRoads, roadFeature]);
      }
    }
  };
  
  const clearRoute = () => {
    setSelectedRoads([]);
    setWaypoints([]);
  };

  const undoLastSelection = () => {
    if (waypoints.length === 0) return;

    // Remove the last waypoint
    const lastWaypoint = waypoints[waypoints.length - 1];
    setWaypoints(prevWaypoints => prevWaypoints.slice(0, -1));

    // Check if any other waypoints are linked to the same road segment
    const isRoadStillNeeded = waypoints.slice(0, -1).some(
      (wp) => wp.properties?.roadId === lastWaypoint.properties?.roadId
    );

    // If no other waypoints are on this road segment, remove it from the highlighted roads
    if (!isRoadStillNeeded) {
      setSelectedRoads(prevRoads => prevRoads.filter(
        r => r.id !== lastWaypoint.properties?.roadId
      ));
    }
  };
  
  const selectedRouteGeoJSON: FeatureCollection<LineString> = React.useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: selectedRoads,
    };
  }, [selectedRoads]);

  const waypointsGeoJSON: FeatureCollection<Point> = React.useMemo(() => {
    return {
        type: 'FeatureCollection',
        features: waypoints,
    };
  }, [waypoints]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-card p-4 rounded-lg shadow-lg">
        <h2 className="text-lg font-semibold">Route Definiëren</h2>
        {waypoints.length === 0 ? (
           <p className="text-sm text-muted-foreground">Klik op een weg om deze te selecteren.</p>
        ) : (
           <p className="text-sm text-green-600 font-medium">{waypoints.length} punt(en) geselecteerd.</p>
        )}
      </div>

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {waypoints.length > 0 && (
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
        <Source id="waypoints-data" type="geojson" data={waypointsGeoJSON}>
            <Layer
                id="waypoints-points"
                type="circle"
                source="waypoints-data"
                paint={{
                    'circle-radius': 6,
                    'circle-color': '#ffffff',
                    'circle-stroke-color': '#000000',
                    'circle-stroke-width': 2,
                }}
            />
        </Source>
      </Map>
    </div>
  );
}
