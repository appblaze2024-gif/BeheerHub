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
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Wijk } from '@/app/projects/page';
import { Input } from './ui/input';
import { Search, Loader2 } from 'lucide-react';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface WijkMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wijk: Wijk | null;
  onSave: (wijkId: string, coordinates: string) => void;
}

export function WijkMapDialog({ open, onOpenChange, wijk, onSave }: WijkMapDialogProps) {
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);

  const [initialViewState, setInitialViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
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
          const features = JSON.parse(wijk.subGebieden);
          if (Array.isArray(features) && features.length > 0) {
             draw.add({
              type: 'FeatureCollection',
              features: features
            });

            if (features[0].geometry.type === 'Polygon') {
                const firstCoord = features[0].geometry.coordinates[0][0];
                map.flyTo({ center: firstCoord, zoom: 12 });
            }
          }
        } catch (e) {
          console.error("Failed to parse or add existing polygons:", e);
        }
      }
    }
  }, [wijk]);

  const handleSave = () => {
    if (drawRef.current && wijk) {
      const data = drawRef.current.getAll();
      onSave(wijk.id, JSON.stringify(data.features));
      onOpenChange(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !drawRef.current) return;
    setIsSearching(true);
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&polygon_geojson=1&limit=1`
        );
        const data = await response.json();

        if (data && data.length > 0 && data[0].geojson) {
            const feature = data[0];
            const geometry = feature.geojson;
            
            if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
                 drawRef.current.add({
                    type: 'Feature',
                    properties: { name: feature.display_name },
                    geometry: geometry
                });
                const [lon, lat] = [parseFloat(feature.lon), parseFloat(feature.lat)];
                mapRef.current?.getMap().flyTo({ center: [lon, lat], zoom: 12 });
            } else {
                 alert('Geen gedetailleerde grenzen gevonden voor deze locatie. Probeer een andere zoekterm.');
            }

        } else {
            alert('Geen resultaten gevonden.');
        }

    } catch (error) {
        console.error("Fout bij zoeken:", error);
    } finally {
        setIsSearching(false);
    }
  };
  
  React.useEffect(() => {
    return () => {
      if (drawRef.current && mapRef.current && mapRef.current.getMap()) {
        try {
          mapRef.current.getMap().removeControl(drawRef.current);
        } catch (e) {}
      }
      drawRef.current = null;
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Teken gebied voor wijk: {wijk?.naam}</DialogTitle>
          <DialogDescription>
            Zoek een gebied op naam en voeg het toe aan de kaart, of teken handmatig een polygoon.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
            <div className="flex w-full max-w-sm items-center space-x-2">
            <Input
                type="text"
                placeholder="Zoek een plaatsnaam, wijk of buurt..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                disabled={isSearching}
            />
            <Button type="button" onClick={handleSearch} disabled={isSearching}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
            </div>
        </div>

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
            <Button onClick={handleSave}>Gebieden opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
