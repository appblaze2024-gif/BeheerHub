'use client';

import * as React from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import type { LayerProps } from 'react-map-gl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Wijk } from '@/app/projects/page';
import { feature, center } from '@turf/turf';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface WijkMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wijk: Wijk | null;
}

const polygonLayer: LayerProps = {
  id: 'polygon',
  type: 'fill',
  source: 'polygon',
  paint: {
    'fill-color': '#088',
    'fill-opacity': 0.5,
  },
};
const polygonOutlineLayer: LayerProps = {
  id: 'polygon-outline',
  type: 'line',
  source: 'polygon',
  paint: {
    'line-color': '#000',
    'line-width': 2,
  },
};


export function WijkMapDialog({ open, onOpenChange, wijk }: WijkMapDialogProps) {
  const [geoJSON, setGeoJSON] = React.useState<any>(null);
  const [initialViewState, setInitialViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7
  });

  React.useEffect(() => {
    if (wijk && wijk.subGebieden) {
      try {
        const coordinates = JSON.parse(wijk.subGebieden);
        
        if (Array.isArray(coordinates) && coordinates.length > 0 && Array.isArray(coordinates[0])) {
            const polygon = {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [coordinates],
              },
            };
            setGeoJSON(polygon);

            // Calculate center of polygon to set initial view
            const centerPoint = center(polygon as any);
            const [longitude, latitude] = centerPoint.geometry.coordinates;
            setInitialViewState({ longitude, latitude, zoom: 12 });
        } else {
            setGeoJSON(null);
        }
      } catch (e) {
        console.error("Failed to parse subGebieden coordinates:", e);
        setGeoJSON(null);
      }
    } else {
        setGeoJSON(null);
    }
  }, [wijk]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Kaart: {wijk?.naam}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <Map
            initialViewState={initialViewState}
            mapStyle="mapbox://styles/mapbox/streets-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
          >
            {geoJSON && (
              <Source id="polygon" type="geojson" data={geoJSON}>
                <Layer {...polygonLayer} />
                <Layer {...polygonOutlineLayer} />
              </Source>
            )}
          </Map>
        </div>
      </DialogContent>
    </Dialog>
  );
}
