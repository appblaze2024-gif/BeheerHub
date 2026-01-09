'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Filter, Trash2 } from 'lucide-react';
import { RoadTypeFilterDialog, allRoadTypes } from '@/components/road-type-filter-dialog';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const drawRef = React.useRef<MapboxDraw | null>(null);

  const [isFilterDialogOpen, setIsFilterDialogOpen] = React.useState(false);
  const [roadTypesInPolygon, setRoadTypesInPolygon] = React.useState<string[]>([]);
  const [selectedRoadTypes, setSelectedRoadTypes] = React.useState<string[]>([]);
  const [routeLayerData, setRouteLayerData] = React.useState<FeatureCollection | null>(null);
  const [drawnPolygon, setDrawnPolygon] = React.useState<Feature<Polygon> | null>(null);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const updateRoute = (e: { features: Feature[] }) => {
    if (e.features.length > 0) {
      const polygon = e.features[0] as Feature<Polygon>;
      setDrawnPolygon(polygon);
      const map = mapRef.current?.getMap();
      if (!map) return;
      
      const polygonBoundingBox = turf.bbox(polygon);
      const sw = map.project([polygonBoundingBox[0], polygonBoundingBox[1]]);
      const ne = map.project([polygonBoundingBox[2], polygonBoundingBox[3]]);
      
      const roads = map.queryRenderedFeatures([sw, ne], {
        layers: allRoadTypes.map(type => `road-${type}`)
      });

      const roadsInPolygon = roads.filter(road => {
        if (road.geometry.type === 'LineString') {
          // Check if any point of the line is inside the polygon
          return road.geometry.coordinates.some(point => {
            return turf.booleanPointInPolygon(point, polygon);
          });
        }
        return false;
      });

      const uniqueRoadTypes = Array.from(new Set(roadsInPolygon.map(road => road.properties?.class).filter(Boolean) as string[]));
      
      setRoadTypesInPolygon(uniqueRoadTypes);
      setSelectedRoadTypes(uniqueRoadTypes); // Select all by default
      setRouteLayerData({ type: 'FeatureCollection', features: roadsInPolygon });
      setIsFilterDialogOpen(true);
    }
  };

  const onMapLoad = () => {
    const map = mapRef.current?.getMap();
    if (map && !drawRef.current) {
      const draw = new MapboxDraw({
        displayControlsDefault: true,
        controls: {
          polygon: true,
          trash: true
        },
        defaultMode: 'draw_polygon'
      });
      drawRef.current = draw;
      map.addControl(draw, 'top-left');

      map.on('draw.create', updateRoute);
      map.on('draw.update', updateRoute);
      map.on('draw.delete', () => {
        clearRoute();
      });
    }
  };

  const clearRoute = () => {
    drawRef.current?.deleteAll();
    setDrawnPolygon(null);
    setRouteLayerData(null);
    setRoadTypesInPolygon([]);
    setSelectedRoadTypes([]);
  };

  const roadFilter = React.useMemo(() => {
    if (selectedRoadTypes.length === roadTypesInPolygon.length) {
      return null;
    }
    if (selectedRoadTypes.length === 0) {
      return ['==', ['get', 'class'], 'none'];
    }
    return ['in', ['get', 'class'], ['literal', selectedRoadTypes]];
  }, [selectedRoadTypes, roadTypesInPolygon]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {drawnPolygon && (
          <>
            <Button onClick={() => setIsFilterDialogOpen(true)} variant="default" size="lg">
              <Filter className="mr-2 h-5 w-5" />
              Filter Wegtypes
            </Button>
             <Button onClick={clearRoute} variant="destructive" size="lg">
              <Trash2 className="mr-2 h-5 w-5" />
              Wis Route
            </Button>
          </>
        )}
      </div>

      <RoadTypeFilterDialog
        open={isFilterDialogOpen}
        onOpenChange={setIsFilterDialogOpen}
        availableTypes={roadTypesInPolygon}
        selectedTypes={selectedRoadTypes}
        onSelectedTypesChange={setSelectedRoadTypes}
      />

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={onMapLoad}
      >
        {routeLayerData && (
          <Source id="route-data" type="geojson" data={routeLayerData}>
            <Layer
              id="route-line"
              type="line"
              source="route-data"
              paint={{
                'line-color': '#e60000',
                'line-width': 4,
                'line-opacity': 0.8,
              }}
              filter={roadFilter ?? undefined}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}

// Minimal Turf.js functions needed
const turf = {
  bbox: (geojson: any) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    turf.coordEach(geojson, (coord: any) => {
      if (minX > coord[0]) minX = coord[0];
      if (minY > coord[1]) minY = coord[1];
      if (maxX < coord[0]) maxX = coord[0];
      if (maxY < coord[1]) maxY = coord[1];
    });
    return [minX, minY, maxX, maxY];
  },
  coordEach: (geojson: any, callback: any) => {
    if (geojson.type === 'FeatureCollection') {
      for (const feature of geojson.features) {
        turf.coordEach(feature, callback);
      }
    } else if (geojson.type === 'Feature') {
      turf.coordEach(geojson.geometry, callback);
    } else if (geojson.geometry) {
       turf.coordEach(geojson.geometry, callback);
    } else if (geojson.type === 'Polygon' || geojson.type === 'MultiLineString') {
      for (const ring of geojson.coordinates) {
        for (const coord of ring) {
          callback(coord);
        }
      }
    } else if (geojson.type === 'LineString') {
        for (const coord of geojson.coordinates) {
          callback(coord);
        }
    }
  },
  booleanPointInPolygon: (point: number[], polygon: Feature<Polygon>): boolean => {
    const pt = turf.point(point);
    return turf.inside(pt, polygon.geometry);
  },
  point: (coordinates: number[]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: {} }),
  inside: (point: Feature, polygon: Polygon): boolean => {
    const coords = polygon.coordinates;
    let isInside = false;
    for (let i = 0, j = coords[0].length - 1; i < coords[0].length; j = i++) {
        const xi = coords[0][i][0], yi = coords[0][i][1];
        const xj = coords[0][j][0], yj = coords[0][j][1];
        const intersect = ((yi > point.geometry.coordinates[1]) !== (yj > point.geometry.coordinates[1]))
            && (point.geometry.coordinates[0] < (xj - xi) * (point.geometry.coordinates[1] - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
  }
};
