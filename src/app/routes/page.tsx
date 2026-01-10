'use client';

import * as React from 'react';
import Map from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Filter, Trash2, Loader2 } from 'lucide-react';
import { RoadTypeFilterDialog } from '@/components/road-type-filter-dialog';
import type { Feature, FeatureCollection, Polygon, LineString } from 'geojson';
import { Layer, Source } from 'react-map-gl';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const processingRef = React.useRef(false);

  const [isLoading, setIsLoading] = React.useState(false);
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
  
  const processRoadsInPolygon = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !drawnPolygon || !map.isSourceLoaded('composite') || processingRef.current) {
      return;
    }
    
    processingRef.current = true;
    setIsLoading(true);

    // Stop listening to render events once we start processing
    map.off('render', processRoadsInPolygon);
    
    try {
      const allRoads = map.querySourceFeatures('composite', {
        sourceLayer: 'road',
      });
      
      const roadsInPolygon: Feature<LineString>[] = [];
      const uniqueRoadTypes = new Set<string>();
      
      const intersectingFeatures = allRoads.filter(feature => 
        (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') &&
        turf.booleanIntersects(feature as Feature, drawnPolygon)
      );

      for (const feature of intersectingFeatures) {
        try {
          const intersection = turf.intersect(drawnPolygon, feature as Feature<LineString | Polygon>);
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
    } finally {
      setIsLoading(false);
      processingRef.current = false;
    }
  }, [drawnPolygon]);

  const handleDraw = (e: { features: Feature[] }) => {
    const map = mapRef.current?.getMap();
    if (e.features.length > 0 && map) {
      const polygon = e.features[0] as Feature<Polygon>;
      setDrawnPolygon(polygon);

      // Reset previous results
      setRouteLayerData(null);
      setRoadTypesInPolygon([]);
      setSelectedRoadTypes([]);
      
      // Zoom to the drawn polygon
      const bbox = turf.bbox(polygon) as [number, number, number, number];
      map.fitBounds(bbox, { padding: 40, duration: 1000 });
      
      // After zooming, listen for render events to check when the source is loaded
      map.on('render', processRoadsInPolygon);
    }
  };
  
  const clearRoute = () => {
    const map = mapRef.current?.getMap();
    if (map) {
      map.off('render', processRoadsInPolygon);
    }
    if (drawRef.current) {
      drawRef.current.deleteAll();
    }
    setDrawnPolygon(null);
    setRouteLayerData(null);
    setRoadTypesInPolygon([]);
    setSelectedRoadTypes([]);
    setIsLoading(false);
    processingRef.current = false;
  };

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

    map.on('draw.create', handleDraw);
    map.on('draw.update', handleDraw);
    map.on('draw.delete', clearRoute);
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
        {isLoading && (
            <Button variant="default" size="lg" disabled>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Wegen laden...
            </Button>
        )}
        {drawnPolygon && !isLoading && (
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
