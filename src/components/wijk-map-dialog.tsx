'use client';

import * as React from 'react';
import Map from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Wijk } from '@/app/projects/page';
import { center } from '@turf/turf';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface WijkMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wijk: Wijk | null;
  onSave: (wijkId: string, coordinates: any) => void;
}

export function WijkMapDialog({ open, onOpenChange, wijk, onSave }: WijkMapDialogProps) {
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);

  const [initialViewState, setInitialViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7
  });

  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
      });
      map.addControl(draw);
      drawRef.current = draw;

      if (wijk?.subGebieden) {
        try {
          const coordinates = JSON.parse(wijk.subGebieden);
          if (Array.isArray(coordinates) && coordinates.length > 0) {
            const feature = {
              id: 'initial-polygon',
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [coordinates],
              },
            };
            draw.add(feature as any);
            
            // Calculate center of polygon to set initial view
            const centerPoint = center(feature as any);
            const [longitude, latitude] = centerPoint.geometry.coordinates;
            setInitialViewState({ longitude, latitude, zoom: 14 });
            map.flyTo({ center: [longitude, latitude], zoom: 14 });

          }
        } catch (e) {
          console.error("Failed to parse or add existing polygon:", e);
        }
      }
    }
  }, [wijk]);

  const handleSave = () => {
    if (drawRef.current && wijk) {
      const data = drawRef.current.getAll();
      if (data.features.length > 0) {
        const coords = data.features[0].geometry.coordinates[0];
        onSave(wijk.id, JSON.stringify(coords));
      } else {
        // No polygon drawn, save empty array
        onSave(wijk.id, "[]");
      }
      onOpenChange(false);
    }
  };
  
  React.useEffect(() => {
    // Clean up draw instance when dialog closes
    return () => {
      if (drawRef.current && mapRef.current) {
        try {
          mapRef.current.getMap().removeControl(drawRef.current);
        } catch (e) {
            // may fail if map is already gone
        }
      }
      drawRef.current = null;
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) {
             if (drawRef.current && mapRef.current && mapRef.current.getMap()) {
                try {
                    mapRef.current.getMap().removeControl(drawRef.current);
                } catch(e) {}
                drawRef.current = null;
            }
        }
        onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[80vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Teken gebied voor wijk: {wijk?.naam}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <Map
            ref={mapRef}
            initialViewState={initialViewState}
            mapStyle="mapbox://styles/mapbox/streets-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            onLoad={onMapLoad}
          />
        </div>
        <DialogFooter className="p-6 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button onClick={handleSave}>Gebied opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
