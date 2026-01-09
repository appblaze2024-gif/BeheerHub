'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Shapes } from 'lucide-react';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [routeFeatures, setRouteFeatures] = React.useState<any[]>([]);
  const [roadDetails, setRoadDetails] = React.useState<any[]>([]);
  const [isListOpen, setIsListOpen] = React.useState(false);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const setupDraw = React.useCallback(() => {
    if (mapRef.current && !drawRef.current) {
      const map = mapRef.current.getMap();

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
      });
      drawRef.current = draw;
      
      map.on('draw.create', updateRoute);
      map.on('draw.delete', updateRoute);
      map.on('draw.update', updateRoute);

      if (isDrawing) {
         map.addControl(draw);
      }
    }
  }, [isDrawing]); // Dependency on isDrawing to re-evaluate adding the control

  const updateRoute = (e: { features: any[] }) => {
    if (!e.features.length) {
      setRouteFeatures([]);
      setRoadDetails([]);
      return;
    }

    const polygon = e.features[0];
    const map = mapRef.current.getMap();
    
    // Use the polygon to query the rendered road features
    const roads = map.queryRenderedFeatures({ layers: ['road-street', 'road-primary', 'road-secondary-tertiary', 'road-motorway-trunk'] });

    const roadsInPolygon = roads.filter((road: any) => {
      // Check if any coordinate of the road is inside the polygon
      if (road.geometry.type === 'LineString') {
          return turf.booleanIntersects(road.geometry, polygon.geometry) || turf.booleanContains(polygon.geometry, road.geometry);
      }
      return false;
    });

    setRouteFeatures(roadsInPolygon);
    setRoadDetails(roadsInPolygon.map(road => road.properties));
  };


  const toggleDrawing = () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const nextIsDrawing = !isDrawing;
    setIsDrawing(nextIsDrawing);

    if (nextIsDrawing) {
        if(drawRef.current) {
            map.addControl(drawRef.current);
            drawRef.current.changeMode('draw_polygon');
        }
    } else {
        if (drawRef.current) {
            drawRef.current.deleteAll();
            map.removeControl(drawRef.current);
            drawRef.current = null; // Important to nullify for re-initialization
            setRouteFeatures([]);
            setRoadDetails([]);
            setupDraw(); // Re-initialize draw control for next time
        }
    }
  };

  const showDetails = () => {
    if (roadDetails.length > 0) {
      setIsListOpen(true);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button onClick={toggleDrawing} variant="default" size="lg">
          <Shapes className="mr-2 h-5 w-5" />
          {isDrawing ? 'Annuleer Route' : 'Route Tekenen'}
        </Button>
        {roadDetails.length > 0 && (
          <Button onClick={showDetails} variant="secondary" size="lg">
            Toon Route Details ({roadDetails.length} segmenten)
          </Button>
        )}
      </div>

      <Dialog open={isListOpen} onOpenChange={setIsListOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Wegtypes in polygoon</DialogTitle>
            <DialogDescription>
              Dit zijn de eigenschappen van de wegen die binnen het getekende gebied vallen.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-4">
            {roadDetails.length > 0 ? (
                 <ul className="space-y-4 text-sm">
                 {roadDetails.map((details, index) => (
                   <li key={index} className="border rounded-md p-3 bg-muted/50">
                       <h4 className="font-semibold mb-2">Wegsegment {index + 1}</h4>
                       {Object.entries(details).map(([key, value]) => (
                           <div key={key} className="flex justify-between text-xs border-t py-1 first-of-type:border-t-0">
                               <span className="font-medium capitalize text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                               <span className="text-right font-mono">{String(value)}</span>
                           </div>
                       ))}
                   </li>
                 ))}
               </ul>
            ) : (
                <div className="text-center text-muted-foreground p-8">Geen wegen gevonden in de selectie.</div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsListOpen(false)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={setupDraw}
        preserveDrawingBuffer={true}
      >
        {routeFeatures.length > 0 && (
          <Source id="route-source" type="geojson" data={{ type: 'FeatureCollection', features: routeFeatures }}>
            <Layer
              id="route-layer"
              type="line"
              source="route-source"
              layout={{
                'line-join': 'round',
                'line-cap': 'round',
              }}
              paint={{
                'line-color': '#3887be',
                'line-width': 5,
                'line-opacity': 0.75,
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
