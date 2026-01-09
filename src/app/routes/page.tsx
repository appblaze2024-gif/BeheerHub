'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Filter, Trash2 } from 'lucide-react';
import { RoadTypeFilterDialog, allRoadTypes } from '@/components/road-type-filter-dialog';
import type { Feature, FeatureCollection, Polygon, LineString, MultiLineString } from 'geojson';
import * as turf from '@turf/turf';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const drawRef = React.useRef<MapboxDraw | null>(null);

  const [isFilterDialogOpen, setIsFilterDialogOpen] = React.useState(false);
  const [roadTypesInPolygon, setRoadTypesInPolygon] = React.useState<string[]>([]);
  const [selectedRoadTypes, setSelectedRoadTypes] = React.useState<string[]>([]);
  const [routeLayerData, setRouteLayerData] = React.useState<FeatureCollection<LineString | MultiLineString> | null>(null);
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
      
      const allSourceRoads = map.querySourceFeatures('composite', {
          sourceLayer: 'road',
      });

      const roadsInPolygon = allSourceRoads.filter(road => {
        if (!road.geometry) return false;

        try {
          if (road.geometry.type === 'LineString' || road.geometry.type === 'MultiLineString') {
            return turf.booleanIntersects(road.geometry, polygon.geometry);
          }
        } catch(err) {
            console.error("Error checking intersection:", err, road.geometry);
            return false;
        }
        return false;
      }) as Feature<LineString | MultiLineString>[];

      const uniqueRoadTypes = Array.from(new Set(roadsInPolygon.map(road => road.properties?.class).filter(Boolean) as string[]));
      
      setRoadTypesInPolygon(uniqueRoadTypes);
      setSelectedRoadTypes(uniqueRoadTypes);
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
    if (drawRef.current) {
      drawRef.current.deleteAll();
    }
    setDrawnPolygon(null);
    setRouteLayerData(null);
    setRoadTypesInPolygon([]);
    setSelectedRoadTypes([]);
  };

  const roadFilter = React.useMemo(() => {
    if (selectedRoadTypes.length === 0) {
      return ['==', ['get', 'class'], 'none'];
    }
    if (selectedRoadTypes.length === roadTypesInPolygon.length) {
      return null;
    }
    return ['in', ['get', 'class'], ['literal', selectedRoadTypes]];
  }, [selectedRoadTypes, roadTypesInPolygon]);
  
  const layerProps: any = {};
  if (roadFilter) {
    layerProps.filter = roadFilter;
  }

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
              {...layerProps}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
