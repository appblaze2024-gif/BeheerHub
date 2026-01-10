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

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

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
  
  const processRoadsInPolygon = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded() || !drawnPolygon) return;
    
    const polygonPoints = drawnPolygon.geometry.coordinates[0];
    if (!polygonPoints || polygonPoints.length === 0) return;

    const bbox: [[number, number], [number, number]] = [
      [
        Math.min(...polygonPoints.map(p => p[0])),
        Math.min(...polygonPoints.map(p => p[1]))
      ],
      [
        Math.max(...polygonPoints.map(p => p[0])),
        Math.max(...polygonPoints.map(p => p[1]))
      ]
    ];
    
    const southWest = map.project(bbox[0]);
    const northEast = map.project(bbox[1]);
    const queryBbox: [[number, number], [number, number]] = [[southWest.x, southWest.y], [northEast.x, northEast.y]];


    const renderedFeatures = map.queryRenderedFeatures(queryBbox, {
      layers: map.getStyle().layers.filter(l => l.type === 'line' && l['source-layer'] === 'road').map(l => l.id)
    });

    const roadsInPolygon: Feature<LineString>[] = [];
    renderedFeatures.forEach(road => {
        if (road.geometry.type === 'LineString') {
            roadsInPolygon.push(road as Feature<LineString>);
        }
    });

    const uniqueRoadTypes = Array.from(new Set(roadsInPolygon.map(road => road.properties?.class).filter(Boolean) as string[]));

    setRoadTypesInPolygon(uniqueRoadTypes);
    setSelectedRoadTypes(uniqueRoadTypes);
    setRouteLayerData({ type: 'FeatureCollection', features: roadsInPolygon });
    
    if (uniqueRoadTypes.length > 0) {
        setIsFilterDialogOpen(true);
    }
  }, [drawnPolygon]);

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

    const handleDraw = (e: { features: Feature[] }) => {
        const polygon = e.features[0] as Feature<Polygon>;
        setDrawnPolygon(polygon);
    };

    map.on('draw.create', handleDraw);
    map.on('draw.update', handleDraw);
    map.on('draw.delete', clearRoute);
  };

  React.useEffect(() => {
    if (drawnPolygon) {
      processRoadsInPolygon();
    }
  }, [drawnPolygon, processRoadsInPolygon]);


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
