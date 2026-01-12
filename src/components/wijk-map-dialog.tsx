'use client';

import * as React from 'react';
import Map, { Popup } from 'react-map-gl';
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
import { Loader2, BoxSelect } from 'lucide-react';
import * as turf from '@turf/turf';
import type { FillLayer, LineLayer, SymbolLayer, MapLayerMouseEvent } from 'react-map-gl';
import { Layer, Source } from 'react-map-gl';
import { cn } from '@/lib/utils';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface WijkMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wijk: Wijk | null;
  onSave: (wijkId: string, coordinates: string) => void;
  readOnly?: boolean;
}

interface Suggestion {
  place_id: number;
  display_name: string;
  geojson: any;
  lon: string;
  lat: string;
}

interface ClickPopupInfo {
  longitude: number;
  latitude: number;
  name: string;
  isLoading: boolean;
  canDraw: boolean;
}

const polygonFillLayer: FillLayer = {
    id: 'wijk-polygon-fill',
    type: 'fill',
    paint: {
        'fill-color': '#000000',
        'fill-opacity': 0.3
    },
};

const polygonOutlineLayer: LineLayer = {
    id: 'wijk-polygon-outline',
    type: 'line',
    paint: {
        'line-color': '#000000',
        'line-width': 2
    },
};

const polygonLabelLayer: SymbolLayer = {
  id: 'wijk-polygon-labels',
  type: 'symbol',
  source: 'wijk-polygons',
  layout: {
    'text-field': ['get', 'wijkNaam'],
    'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
    'text-radial-offset': 0.5,
    'text-justify': 'auto',
    'text-size': 14,
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
  },
  paint: {
    'text-color': '#FFFFFF',
    'text-halo-color': 'hsl(0, 0%, 0%)',
    'text-halo-width': 2,
    'text-halo-blur': 1,
  }
};

export function WijkMapDialog({ open, onOpenChange, wijk, onSave, readOnly = false }: WijkMapDialogProps) {
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isDrawReady, setIsDrawReady] = React.useState(false);
  const [clickPopupInfo, setClickPopupInfo] = React.useState<ClickPopupInfo | null>(null);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [isFillMode, setIsFillMode] = React.useState(false);
  
  const initialFeaturesRef = React.useRef<any[]>([]);

  const geojson = React.useMemo(() => {
    if (!wijk?.subGebieden) return null;
    try {
      const features = JSON.parse(wijk.subGebieden);
      return {
        type: 'FeatureCollection',
        features: Array.isArray(features) ? features : [],
      };
    } catch {
      return null;
    }
  }, [wijk?.subGebieden]);

  const cleanup = React.useCallback(() => {
    if (drawRef.current && mapRef.current?.getMap()?.isStyleLoaded()) {
      try {
         if (mapRef.current.getMap().getControl('mapbox-gl-draw')) {
            mapRef.current.getMap().removeControl(drawRef.current);
         }
      } catch (e) {
        console.warn("Could not remove draw control during cleanup", e);
      }
    }
    drawRef.current = null;
    setIsDrawReady(false);
    setSearchQuery('');
    setSuggestions([]);
    setClickPopupInfo(null);
    initialFeaturesRef.current = [];
    setIsFillMode(false);
  }, []);

   const onDrawCreate = React.useCallback((e: { features: turf.Feature[] }) => {
    if (!isFillMode) return;

    const newBoundary = e.features[0] as turf.Feature<turf.Polygon | turf.MultiPolygon>;
    if (!newBoundary) return;
    
    if (drawRef.current) {
        drawRef.current.delete(newBoundary.id as string);
    }
    
    const existingFeatures = drawRef.current?.getAll().features || [];
    const existingPolygons = existingFeatures.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') as turf.Feature<turf.Polygon | turf.MultiPolygon>[];

    let filledArea: turf.Feature<turf.Polygon | turf.MultiPolygon> | null = newBoundary;

    for (const existing of existingPolygons) {
        if (filledArea) {
            filledArea = turf.difference(filledArea, existing);
        }
    }

    if (filledArea) {
        if (filledArea.geometry) {
            drawRef.current?.add(filledArea as any);
        }
    }
    
    // Deactivate fill mode and switch back to simple select after drawing
    setIsFillMode(false);
    if(drawRef.current){
        drawRef.current.changeMode('simple_select');
    }
  }, [isFillMode]);

  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current && !readOnly) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: readOnly ? {} : {
          polygon: true,
          trash: true,
        },
        styles: [
            // STYLE FOR ACTIVE POLYGONS (being drawn)
            {
              'id': 'gl-draw-polygon-fill-active',
              'type': 'fill',
              'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
              'paint': {
                'fill-color': '#000000',
                'fill-outline-color': '#000000',
                'fill-opacity': 0.3
              }
            },
            {
              'id': 'gl-draw-polygon-stroke-active',
              'type': 'line',
              'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
              'layout': {
                'line-cap': 'round',
                'line-join': 'round'
              },
              'paint': {
                'line-color': '#000000',
                'line-dasharray': [0.2, 2],
                'line-width': 2
              }
            },
            // STYLE FOR INACTIVE POLYGONS
            {
              'id': 'gl-draw-polygon-fill-inactive',
              'type': 'fill',
              'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
              'paint': {
                'fill-color': '#000000',
                'fill-outline-color': '#000000',
                'fill-opacity': 0.3
              }
            },
            {
              'id': 'gl-draw-polygon-stroke-inactive',
              'type': 'line',
              'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
              'layout': {
                'line-cap': 'round',
                'line-join': 'round'
              },
              'paint': {
                'line-color': '#000000',
                'line-width': 2
              }
            }
        ]
      });

      map.addControl(draw);
      drawRef.current = draw;
      setIsDrawReady(true);
      
      map.on('draw.create', onDrawCreate);

      if (geojson && geojson.features.length > 0) {
        initialFeaturesRef.current = geojson.features; // Store initial features
        draw.add(geojson as any);

        const bbox = turf.bbox(geojson);
        if (bbox[0] !== Infinity) {
          map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
        }
      }
    } else if (mapRef.current && readOnly) {
       const map = mapRef.current.getMap();
       if (geojson && geojson.features.length > 0) {
           const bbox = turf.bbox(geojson);
           if (bbox[0] !== Infinity) {
               map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
           }
       }
    }
  }, [geojson, readOnly, onDrawCreate]);
  
  const handleMapClick = React.useCallback(async (event: MapLayerMouseEvent) => {
    // In edit mode, don't trigger reverse geocode if user is drawing or clicking a drawn feature.
    if (!readOnly) {
      const drawMode = drawRef.current?.getMode();
      if (drawMode !== 'simple_select' || event.features?.some(f => f.layer.id.startsWith('gl-draw'))) {
        return;
      }
    }
     // In read-only mode, prioritize showing wijk name from existing polygons.
    if (readOnly && event.features?.some(f => f.layer.id === 'wijk-polygon-fill')) {
        const wijkFeature = event.features.find(f => f.layer.id === 'wijk-polygon-fill');
        if (wijkFeature?.properties?.wijkNaam) {
            setClickPopupInfo({
                longitude: event.lngLat.lng,
                latitude: event.lngLat.lat,
                name: wijkFeature.properties.wijkNaam,
                isLoading: false,
                canDraw: false,
            });
        }
        return;
    }

    const { lng, lat } = event.lngLat;
    setClickPopupInfo({ longitude: lng, latitude: lat, name: 'Laden...', isLoading: true, canDraw: false });

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16` // Zoom 16 for neighborhood level
      );
      const data = await response.json();
      
      let displayName: string;
      let canDraw = false;
      
      const areaName = data.address?.neighbourhood || data.address?.suburb || data.address?.city_district || data.name;

      if (areaName) {
        displayName = areaName;
        canDraw = true;
      } else if (data.display_name) {
        displayName = data.display_name.split(',')[0];
      } else {
        displayName = "Onbekend gebied";
      }

      setClickPopupInfo({ longitude: lng, latitude: lat, name: displayName, isLoading: false, canDraw });
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      setClickPopupInfo({ longitude: lng, latitude: lat, name: "Fout bij ophalen", isLoading: false, canDraw: false });
    }

  }, [readOnly]);


  const handleSave = () => {
    if (drawRef.current && wijk) {
      const data = drawRef.current.getAll();
      onSave(wijk.id, JSON.stringify(data.features));
      onOpenChange(false);
    }
  };

  const handleSearchQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            query
          )}&format=json&polygon_geojson=1&countrycodes=nl&limit=5`
        );
        const data: Suggestion[] = await response.json();
        setSuggestions(data.filter(s => s.geojson && (s.geojson.type === 'Polygon' || s.geojson.type === 'MultiPolygon')));
      } catch (error) {
        console.error("Fout bij zoeken:", error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setSearchQuery(suggestion.display_name);
    setSuggestions([]);

    if (drawRef.current && (suggestion.geojson.type === 'Polygon' || suggestion.geojson.type === 'MultiPolygon')) {
        const feature = {
            type: 'Feature',
            properties: { name: suggestion.display_name },
            geometry: suggestion.geojson,
        };
        drawRef.current.add(feature as any);
        const [lon, lat] = [parseFloat(suggestion.lon), parseFloat(suggestion.lat)];
        mapRef.current?.getMap().flyTo({ center: [lon, lat], zoom: 13 });
    }
  };

  const toggleFillMode = () => {
    const nextFillMode = !isFillMode;
    setIsFillMode(nextFillMode);
    if (drawRef.current) {
        if (nextFillMode) {
            drawRef.current.changeMode('draw_polygon');
        } else {
            drawRef.current.changeMode('simple_select');
        }
    }
  };
  
  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

   React.useEffect(() => {
    if (!open) {
      cleanup();
    }
  }, [open, cleanup]);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{readOnly ? wijk?.naam : `Teken gebied voor wijk: ${wijk?.naam}`}</DialogTitle>
          {!readOnly && (
            <DialogDescription>
              Zoek een gebied op naam, teken handmatig, of klik op de kaart om een gebied te identificeren en de grenzen te tekenen.
            </DialogDescription>
          )}
        </DialogHeader>

        {!readOnly && (
          <div className="px-6 pb-4 flex justify-between items-center">
              <div className="flex w-full max-w-md items-center space-x-2 relative">
                  <div className='relative w-full'>
                      <Input
                          type="text"
                          placeholder="Zoek een plaatsnaam, wijk of buurt..."
                          value={searchQuery}
                          onChange={handleSearchQueryChange}
                          disabled={!isDrawReady}
                      />
                      {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                      {suggestions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                              {suggestions.map((suggestion) => (
                              <div
                                  key={suggestion.place_id}
                                  onClick={() => handleSuggestionClick(suggestion)}
                                  className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-100"
                              >
                                  {suggestion.display_name}
                              </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
              <Button 
                variant={isFillMode ? 'secondary' : 'outline'}
                onClick={toggleFillMode}
                disabled={!isDrawReady}
                title="Vul de vrije ruimte binnen een getekend gebied"
              >
                  <BoxSelect className="mr-2 h-4 w-4"/>
                  Vul vrije ruimte
              </Button>
              {!isDrawReady && <p className='text-xs text-muted-foreground mt-1'>Kaart laden...</p>}
          </div>
        )}

        <div className="flex-1 min-h-0">
          <Map
            ref={mapRef}
            initialViewState={initialViewState}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            mapboxAccessToken={MAPBOX_TOKEN}
            onLoad={onMapLoad}
            preserveDrawingBuffer
            interactiveLayerIds={readOnly ? ['wijk-polygon-fill'] : []}
            onClick={handleMapClick}
            cursor={readOnly ? 'pointer' : 'grab'}
          >
            {readOnly && geojson && (
              <Source id="wijk-polygons" type="geojson" data={geojson}>
                <Layer {...polygonFillLayer} />
                <Layer {...polygonOutlineLayer} />
                <Layer {...polygonLabelLayer} />
              </Source>
            )}
             {clickPopupInfo && (
                <Popup
                    longitude={clickPopupInfo.longitude}
                    latitude={clickPopupInfo.latitude}
                    onClose={() => setClickPopupInfo(null)}
                    closeOnClick={false}
                    anchor="bottom"
                >
                    <div className='p-1 font-semibold max-w-xs'>
                      {clickPopupInfo.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                          <p>{clickPopupInfo.name}</p>
                           {!readOnly && clickPopupInfo.canDraw && (
                            <Button 
                              size="sm" 
                              className='mt-2 w-full'
                              onClick={() => {
                                handleSuggestionClick({ 
                                  display_name: clickPopupInfo.name, 
                                  lat: clickPopupInfo.latitude.toString(),
                                  lon: clickPopupInfo.longitude.toString(),
                                  geojson: { type: 'Polygon', coordinates: [] } // Dummy geojson
                                } as Suggestion)
                                setClickPopupInfo(null);
                              }}
                            >
                              Teken grenzen
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                </Popup>
            )}
          </Map>
        </div>
        <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
                {readOnly ? 'Sluiten' : 'Annuleren'}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave}>Gebieden opslaan</Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
