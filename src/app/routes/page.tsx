'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { allRoadTypes, roadColorMapping } from '@/components/road-type-filter-dialog';
import { Download, Edit, Trash2 } from 'lucide-react';
import { RoadTypeFilterDialog } from '@/components/road-type-filter-dialog';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const drawRef = React.useRef<MapboxDraw | null>(null);

  const [isDrawActive, setIsDrawActive] = React.useState(false);
  const [polygon, setPolygon] = React.useState<Feature<Polygon> | null>(null);
  const [roadsInPolygon, setRoadsInPolygon] = React.useState<FeatureCollection | null>(null);
  const [availableRoadTypes, setAvailableRoadTypes] = React.useState<string[]>([]);
  const [filteredRoute, setFilteredRoute] = React.useState<FeatureCollection | null>(null);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = React.useState(false);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  // Function to enter drawing mode
  const startDrawing = () => {
    if (drawRef.current) {
      clearDrawing();
      drawRef.current.changeMode('draw_polygon');
      setIsDrawActive(true);
    }
  };
  
  // Function to clear everything
  const clearDrawing = () => {
    if (drawRef.current) {
      drawRef.current.deleteAll();
    }
    setPolygon(null);
    setRoadsInPolygon(null);
    setAvailableRoadTypes([]);
    setFilteredRoute(null);
    setIsDrawActive(false);
  };


  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {}, // Controls are handled by custom buttons
      });
      map.addControl(draw);
      drawRef.current = draw;

      map.on('draw.create', (e: { features: Feature[] }) => {
        const drawnPolygon = e.features[0] as Feature<Polygon>;
        setPolygon(drawnPolygon);
        
        const allFeatures = map.querySourceFeatures('composite', { sourceLayer: 'road' });
        const roadsInside = turf.featureCollection(allFeatures.filter(f => {
            if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
                 // Use turf.booleanIntersects for better performance on large polygons
                return turf.booleanIntersects(f, drawnPolygon);
            }
            return false;
        }));

        const clippedRoads = turf.featureCollection(
            roadsInside.features.map(road => turf.intersect(road, drawnPolygon)!).filter(Boolean)
        );

        setRoadsInPolygon(clippedRoads);

        const types = new Set(clippedRoads.features.map(f => f.properties?.class));
        setAvailableRoadTypes(Array.from(types) as string[]);
        setIsFilterDialogOpen(true);
        setIsDrawActive(false);
      });
    }
  }, []);

  const handleCreateRoute = (selectedTypes: string[]) => {
    if (!roadsInPolygon) return;
    
    const routeFeatures = roadsInPolygon.features.filter(f => selectedTypes.includes(f.properties?.class));
    
    const combinedLines = routeFeatures.map(f => f.geometry.coordinates);

    setFilteredRoute({
      type: 'FeatureCollection',
      features: routeFeatures,
    });
    setIsFilterDialogOpen(false);
  };


  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 left-4 z-10">
        <Card className="w-80 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Routeplanner</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={startDrawing} disabled={isDrawActive}>
              <Edit className="mr-2 h-4 w-4" /> Polygoon tekenen
            </Button>
            <Button onClick={clearDrawing} variant="destructive" disabled={!polygon}>
                <Trash2 className="mr-2 h-4 w-4" /> Huidige selectie wissen
            </Button>
             <Button variant="secondary" disabled={!filteredRoute}>
                <Download className="mr-2 h-4 w-4" /> Route exporteren
            </Button>
            {isDrawActive && <p className="text-sm text-muted-foreground text-center pt-2">Teken een gebied op de kaart.</p>}
          </CardContent>
        </Card>
      </div>

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={onMapLoad}
      >
        {filteredRoute && (
          <Source id="filtered-route" type="geojson" data={filteredRoute}>
            <Layer
              id="filtered-route-layer"
              type="line"
              paint={{
                'line-color': '#FF0000', // Bright red for visibility
                'line-width': 4,
                'line-opacity': 0.8
              }}
            />
          </Source>
        )}
      </Map>

      <RoadTypeFilterDialog
        open={isFilterDialogOpen}
        onOpenChange={setIsFilterDialogOpen}
        availableTypes={availableRoadTypes}
        onConfirm={handleCreateRoute}
       />
    </div>
  );
}
