'use client';

import * as React from 'react';
import Map from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Filter, Trash2 } from 'lucide-react';
import { RoadTypeFilterDialog } from '@/components/road-type-filter-dialog';
import type { Feature, FeatureCollection, Polygon, LineString, MultiLineString } from 'geojson';
import * as turf from '@turf/turf';
import { Layer, Source } from 'react-map-gl';

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

  const processRoadsInPolygon = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded() || !drawnPolygon) return;
    
    const allSourceRoads = map.querySourceFeatures('composite', {
        sourceLayer: 'road',
    });

    const roadsInPolygon: Feature<LineString | MultiLineString>[] = [];
    
    allSourceRoads.forEach(road => {
      if (!road.geometry) return;
  
      try {
        if (road.geometry.type === 'LineString' || road.geometry.type === 'MultiLineString') {
          const intersection = turf.intersect(drawnPolygon, road.geometry as LineString | MultiLineString);
          if (intersection) {
            intersection.properties = { ...road.properties };
            roadsInPolygon.push(intersection as Feature<LineString | MultiLineString>);
          }
        }
      } catch(err) {
          // This can happen with invalid geometries, so we skip the feature.
          console.warn("Error during intersection check, skipping feature:", err);
      }
    });

    const uniqueRoadTypes = Array.from(new Set(roadsInPolygon.map(road => road.properties?.class).filter(Boolean) as string[]));
    
    setRoadTypesInPolygon(uniqueRoadTypes);
    setSelectedRoadTypes(uniqueRoadTypes);
    setRouteLayerData({ type: 'FeatureCollection', features: roadsInPolygon });
    
    if (uniqueRoadTypes.length > 0 && !isFilterDialogOpen) {
        setIsFilterDialogOpen(true);
    }
  }, [drawnPolygon, isFilterDialogOpen]);
  
  React.useEffect(() => {
    if (drawnPolygon) {
      processRoadsInPolygon();
    }
  }, [drawnPolygon, processRoadsInPolygon]);
  
  const onMapLoad = () => {
    const map = mapRef.current?.getMap();
    if (!map || drawRef.current) return;
      
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

    map.on('draw.create', (e: { features: Feature[] }) => {
        const polygon = e.features[0] as Feature<Polygon>;
        setDrawnPolygon(polygon);
    });
    
    map.on('draw.update', (e: { features: Feature[] }) => {
        const polygon = e.features[0] as Feature<Polygon>;
        setDrawnPolygon(polygon);
    });

    map.on('draw.delete', () => {
        clearRoute();
    });
    
    // Ensure processing happens after style is loaded
    if (map.isStyleLoaded()) {
        if (drawnPolygon) {
            processRoadsInPolygon();
        }
    } else {
        map.once('styledata', () => {
            if (drawnPolygon) {
                processRoadsInPolygon();
            }
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
