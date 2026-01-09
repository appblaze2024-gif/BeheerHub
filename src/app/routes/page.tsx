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

  const onMapLoad = () => {
    if (mapRef.current && !drawRef.current) {
      const map = mapRef.current.getMap();

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
        defaultMode: 'draw_polygon',
      });
      drawRef.current = draw;

      map.on('draw.create', updateRoute);
      map.on('draw.delete', updateRoute);
      map.on('draw.update', updateRoute);
    }
  };

  const toggleDrawing = () => {
    if (!mapRef.current || !drawRef.current) return;
    const map = mapRef.current.getMap();

    if (isDrawing) {
      map.removeControl(drawRef.current);
      setIsDrawing(false);
      setRouteFeatures([]);
      setRoadDetails([]);
      drawRef.current.deleteAll(); // Clear drawn polygons
    } else {
      map.addControl(drawRef.current);
      setIsDrawing(true);
    }
  };
  
  const updateRoute = async () => {
    if (!drawRef.current) return;

    const { features } = drawRef.current.getAll();
    if (features.length === 0) {
      setRouteFeatures([]);
      setRoadDetails([]);
      setIsListOpen(false);
      return;
    }
    
    const polygon = features[0];

    // Use Turf.js to get the bounding box of the polygon
    const bbox = turf.bbox(polygon);

    // Format bbox for Mapbox Tilequery API
    const coordinates = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;

    try {
      // Query the mapbox.mapbox-streets-v8 tileset for features within the bbox.
      const response = await fetch(
        `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${coordinates}.json?radius=0&limit=50&layers=road&access_token=${MAPBOX_TOKEN}`
      );
      
      const data = await response.json();

      if (data && data.features) {
         // Filter the results to include only roads that are actually within the drawn polygon
        const roadsInPolygon = data.features.filter((road: any) => {
            if (road.geometry.type === 'LineString' && road.geometry.coordinates.length > 0) {
                // Check if any point of the linestring is inside the polygon
                for(const coord of road.geometry.coordinates) {
                    if (turf.booleanPointInPolygon(turf.point(coord), polygon)) {
                        return true;
                    }
                }
            }
            return false;
        });

        setRouteFeatures(roadsInPolygon);
        setRoadDetails(roadsInPolygon.map(road => road.properties));
        setIsListOpen(true);
      }

    } catch (err) {
      console.error('Error fetching route data:', err);
      setRouteFeatures([]);
      setRoadDetails([]);
      setIsListOpen(false);
    }
  };


  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
        <div className="absolute top-4 left-4 z-10">
          <Button onClick={toggleDrawing} variant="default" size="lg">
            <Shapes className="mr-2 h-5 w-5" />
            {isDrawing ? 'Annuleer Route' : 'Route Maken'}
          </Button>
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
              <ul className="space-y-4 text-sm">
                {roadDetails.map((details, index) => (
                  <li key={index} className="border rounded-md p-3">
                      <h4 className="font-semibold mb-2">Wegsegment {index + 1}</h4>
                      {Object.entries(details).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-xs border-t py-1">
                              <span className="font-medium capitalize text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                              <span className="text-right">{String(value)}</span>
                          </div>
                      ))}
                  </li>
                ))}
              </ul>
            </div>
          </DialogContent>
        </Dialog>


        <Map
          ref={mapRef}
          initialViewState={initialViewState}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          onLoad={onMapLoad}
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
                        'line-cap': 'round'
                    }}
                    paint={{
                        'line-color': '#3887be',
                        'line-width': 5,
                        'line-opacity': 0.75
                    }}
                />
            </Source>
          )}
        </Map>
    </div>
  );
}
