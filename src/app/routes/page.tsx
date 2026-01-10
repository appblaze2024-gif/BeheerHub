'use client';

import * as React from 'react';
import Map from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Filter, Trash2 } from 'lucide-react';
import { RoadTypeFilterDialog } from '@/components/road-type-filter-dialog';
import type { Feature, FeatureCollection, Polygon, LineString } from 'geojson';
import { Layer, Source } from 'react-map-gl';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

/**
 * Waits for a specific source layer to be available on the map.
 * @param map The Mapbox GL JS map instance.
 * @param sourceLayer The ID of the source layer to wait for (e.g., 'road').
 * @param timeout The maximum time to wait in milliseconds.
 * @returns A promise that resolves when the layer is ready, or rejects on timeout.
 */
function waitForSourceLayer(map: mapboxgl.Map, sourceLayer: string, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (map.isSourceLoaded('composite') && map.getStyle().layers.some(l => l['source-layer'] === sourceLayer)) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Timed out waiting for source layer "${sourceLayer}"`));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}


export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const drawRef = React.useRef<MapboxDraw | null>(null);

  const [isFilterDialogOpen, setIsFilterDialogOpen] = React.useState(false);
  const [roadTypesInPolygon, setRoadTypesInPolygon] = React.useState<string[]>([]);
  const [selectedRoadTypes, setSelectedRoadTypes] = React.useState<string[]>([]);
  const [routeLayerData, setRouteLayerData] = React.useState<FeatureCollection<LineString> | null>(null);
  const [drawnPolygon, setDrawnPolygon] = React.useState<Feature<Polygon> | null>(null);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const processRoadsInPolygon = React.useCallback(async (polygonFeature: Feature<Polygon> | null) => {
    const map = mapRef.current?.getMap();
    if (!map || !polygonFeature) {
      setRouteLayerData(null);
      setRoadTypesInPolygon([]);
      setSelectedRoadTypes([]);
      return;
    }
  
    try {
      // Wait until the 'road' layer is actually available in the composite source.
      await waitForSourceLayer(map, 'road');
      
      const allRoads = map.querySourceFeatures('composite', {
        sourceLayer: 'road',
      });
      
      const roadsInPolygon: Feature<LineString>[] = [];
      const uniqueRoadTypes = new Set<string>();
  
      for (const feature of allRoads) {
        if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') {
          continue;
        }
  
        // Use a simple bounding box check first for performance
        if (!turf.booleanIntersects(feature as Feature, polygonFeature)) {
          continue;
        }
  
        try {
          const intersection = turf.intersect(polygonFeature, feature as Feature<LineString | Polygon>);
          if (intersection) {
            const intersectionFeature = intersection as Feature<LineString>;
            intersectionFeature.properties = feature.properties;
            
            roadsInPolygon.push(intersectionFeature);
            if (feature.properties?.class) {
              uniqueRoadTypes.add(feature.properties.class);
            }
          }
        } catch (err) {
           console.warn('Skipping a road feature due to an intersection error:', err);
        }
      }
      
      const roadTypes = Array.from(uniqueRoadTypes);
      setRoadTypesInPolygon(roadTypes);
      setSelectedRoadTypes(roadTypes);
      setRouteLayerData({ type: 'FeatureCollection', features: roadsInPolygon });
      
      if (roadTypes.length > 0) {
        setIsFilterDialogOpen(true);
      }
  
    } catch (err) {
      console.error('Error querying or processing road features:', err);
    }
  }, []);

  const onMapLoad = () => {
    const map = mapRef.current?.getMap();
    if (!map || drawRef.current) return;
      
    const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true
        },
        defaultMode: 'draw_polygon'
    });
    drawRef.current = draw;
    map.addControl(draw, 'top-left');

    const handleDraw = (e: { features: Feature[] }) => {
        if (e.features.length > 0) {
          const polygon = e.features[0] as Feature<Polygon>;
          setDrawnPolygon(polygon);
          processRoadsInPolygon(polygon);
        }
    };

    map.on('draw.create', handleDraw);
    map.on('draw.update', handleDraw);
    map.on('draw.delete', clearRoute);
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
      return ['==', ['get', 'class'], 'this-will-never-be-true'];
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
        preserveDrawingBuffer={true}
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
