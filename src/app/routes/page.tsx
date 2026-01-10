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

    const features = map.queryRenderedFeatures(e.point);
    const roadFeature = features.find(
      (f: any) => f.sourceLayer === 'road' && f.geometry.type === 'LineString'
    ) as Feature<LineString> | undefined;

    if (roadFeature) {
      // 1. Add a new waypoint at the click location
      const newWaypoint: Feature<Point> = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [e.lngLat.lng, e.lngLat.lat],
        },
        properties: {
          // Use a unique identifier for the road segment. Mapbox feature.id is not always stable.
          // A combination of properties can work, or we can generate one.
          // For simplicity, we'll use a stringified version of its geometry as a key.
          roadId: JSON.stringify(roadFeature.geometry.coordinates),
        },
      };
      setWaypoints(prevWaypoints => [...prevWaypoints, newWaypoint]);

      // 2. Add the road segment to be highlighted, avoiding duplicates
      const isRoadAlreadySelected = selectedRoads.some(
        r => JSON.stringify(r.geometry.coordinates) === JSON.stringify(roadFeature.geometry.coordinates)
      );

      if (!isRoadAlreadySelected) {
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

    // Get the last waypoint to be removed
    const lastWaypoint = waypoints[waypoints.length - 1];
    const roadIdToRemove = lastWaypoint.properties?.roadId;

    // Remove the last waypoint
    const newWaypoints = waypoints.slice(0, -1);
    setWaypoints(newWaypoints);

    // Check if any *remaining* waypoints are still on the same road segment
    const isRoadStillNeeded = newWaypoints.some(
      (wp) => wp.properties?.roadId === roadIdToRemove
    );

    // If no other waypoints reference this road, remove it from the highlighted roads
    if (!isRoadStillNeeded && roadIdToRemove) {
      setSelectedRoads(prevRoads => prevRoads.filter(
        (r) => JSON.stringify(r.geometry.coordinates) !== roadIdToRemove
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
        interactiveLayerIds={['road-path', 'road-street', 'road-primary', 'road-motorway', 'road-trunk', 'road-secondary', 'road-tertiary']}
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
