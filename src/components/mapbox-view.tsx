'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer } from 'react-map-gl';
import type { FillLayer, LineLayer } from 'react-map-gl';
import * as turf from '@turf/turf';
import { useProfile } from '@/firebase/profile-provider';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MapObject {
  id: string;
  latitude: number;
  longitude: number;
  vulgraad?: number;
  locatieType?: string;
  locatieSubType?: string;
  [key: string]: any;
}

interface MapboxViewProps {
  longitude?: number;
  latitude?: number;
  mainLocationLabel?: string | null;
  objects?: MapObject[];
  selectedObjects?: MapObject[];
  onObjectSelect?: (object: MapObject, selected: boolean) => void;
  wijkPolygons?: turf.Feature<turf.Polygon | turf.MultiPolygon>[];
  showHeatmap?: boolean;
  interactive?: boolean;
  highlightedObject?: MapObject | null;
}

const polygonFillLayer: FillLayer = {
    id: 'wijk-polygon-fill',
    type: 'fill',
    paint: {
        'fill-color': '#000000',
        'fill-opacity': 0.1,
    },
};

const polygonOutlineLayer: LineLayer = {
    id: 'wijk-polygon-outline',
    type: 'line',
    paint: {
        'line-color': '#000000',
        'line-width': 2,
    },
};

const getHeatmapColor = (vulgraad: number | undefined): string => {
    if (vulgraad === undefined || vulgraad === null) {
      return 'hsl(221, 83%, 53%)'; 
    }
    
    if (vulgraad < 25) return '#22c55e'; // Groen (0% - 24%)
    if (vulgraad < 50) return '#eab308'; // Geel (25% - 49%)
    if (vulgraad < 75) return '#f97316'; // Oranje (50% - 74%)
    return '#ef4444'; // Rood (75% - 100%)
};

export function MapboxView({ 
  longitude, 
  latitude, 
  mainLocationLabel,
  objects, 
  selectedObjects = [], 
  onObjectSelect, 
  wijkPolygons = [], 
  showHeatmap = true, 
  interactive = true, 
  highlightedObject = null 
}: MapboxViewProps) {
  const [selectedPin, setSelectedPin] = React.useState<MapObject | null>(null);
  const [hoveredPin, setHoveredPin] = React.useState<MapObject | null>(null);
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';

  // De-duplicate objects by location with priority
  const uniqueObjects = React.useMemo(() => {
    if (!objects) return [];
    const locationMap = new Map<string, MapObject>();
    
    const getPriority = (obj: MapObject) => {
        const typeStr = ((obj.locatieType || '') + ' ' + (obj.locatieSubType || '')).toLowerCase();
        
        const isPrullenbakMeerlanden = typeStr.includes('prullenbakken (data meerlanden)');
        const isBrengpark = typeStr.includes('brengparkje hhm') || typeStr.includes('brengpark');
        
        if (isPrullenbakMeerlanden) return 3;
        if (isBrengpark || typeStr.includes('container') || typeStr.includes('ondergrond')) return 2;
        return 1;
    };

    objects.forEach(obj => {
      const key = `${obj.latitude.toFixed(5)}_${obj.longitude.toFixed(5)}`;
      const existing = locationMap.get(key);
      
      if (!existing || getPriority(obj) > getPriority(existing)) {
        locationMap.set(key, obj);
      }
    });
    
    return Array.from(locationMap.values());
  }, [objects]);

  const geojson: turf.FeatureCollection<turf.Geometry> = React.useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: wijkPolygons,
    };
  }, [wijkPolygons]);

  const mapRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.getMap().resize();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const initialViewState = {
    longitude: longitude || 5.2913,
    latitude: latitude || 52.1326,
    zoom: longitude && latitude ? 19 : 7,
  };
  
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    if (highlightedObject) {
      map.flyTo({ center: [highlightedObject.longitude, highlightedObject.latitude], zoom: 17, duration: 1000 });
      return;
    }

    if (wijkPolygons.length > 0) {
      try {
        const featureCollection = { type: 'FeatureCollection', features: wijkPolygons };
        if (featureCollection.features.length === 0) return;
        
        const bbox = turf.bbox(featureCollection);
        if (bbox[0] !== Infinity) {
          map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
          return;
        }
      } catch (e) {
        console.error("Error fitting bounds:", e);
      }
    } else if (longitude && latitude) {
      map.flyTo({ center: [longitude, latitude], zoom: 19});
    } else if (!longitude && !latitude && !uniqueObjects.length) {
         map.flyTo({
            center: [5.2913, 52.1326],
            zoom: 7,
            duration: 1000
        });
    }
  }, [wijkPolygons, longitude, latitude, highlightedObject, uniqueObjects]);

  const markers = React.useMemo(() => {
    const markerElements: React.ReactNode[] = [];

    if (uniqueObjects) {
      markerElements.push(...uniqueObjects.map(obj => {
        const isSelected = selectedObjects.some(so => so.id === obj.id);
        const isHighlighted = highlightedObject?.id === obj.id;
        const color = showHeatmap ? getHeatmapColor(obj.vulgraad) : 'hsl(221, 83%, 53%)';
        
        const typeStr = ((obj.locatieType || '') + ' ' + (obj.locatieSubType || '')).toLowerCase();
        const isBrengpark = typeStr.includes('brengparkje hhm') || typeStr.includes('brengpark');
        const isPrullenbakMeerlanden = typeStr.includes('prullenbakken (data meerlanden)');
        
        const useRecyclingBin = isPrullenbakMeerlanden;
        const useWasteBin = isBrengpark || typeStr.includes('container') || typeStr.includes('ondergrond');
                              
        const Icon = Trash2;

        return (
            <Marker
              key={`obj-${obj.id}`}
              longitude={obj.longitude}
              latitude={obj.latitude}
              anchor="center"
              onClick={e => {
                if (interactive) {
                  e.originalEvent.stopPropagation();
                  if (onObjectSelect) {
                      onObjectSelect(obj, !isSelected);
                  } else {
                      setSelectedPin(obj);
                  }
                }
              }}
              onMouseEnter={() => interactive && setHoveredPin(obj)}
              onMouseLeave={() => interactive && setHoveredPin(null)}
            >
              <div className="relative flex items-center justify-center w-8 h-8">
                {isHighlighted && (
                  <div className="absolute w-6 h-6 rounded-full bg-black/70 animate-pulse" />
                )}
                {useRecyclingBin ? (
                  <img 
                    src="https://i.ibb.co/Xxrq1zP3/recycling-bin.png" 
                    alt="recycling bin"
                    className={cn(
                      "relative h-7 w-7 transition-transform",
                      isSelected && "scale-125",
                      interactive && "cursor-pointer"
                    )}
                    style={{
                      filter: isSelected ? 'drop-shadow(0 0 4px #fbbf24)' : 'drop-shadow(0 2px 2px rgba(0,0,0,0.4))'
                    }}
                  />
                ) : useWasteBin ? (
                  <img 
                    src="https://i.ibb.co/FbgGHW1G/waste-bin.png" 
                    alt="container"
                    className={cn(
                      "relative h-7 w-7 transition-transform",
                      isSelected && "scale-125",
                      interactive && "cursor-pointer"
                    )}
                    style={{
                      filter: isSelected ? 'drop-shadow(0 0 4px #fbbf24)' : 'drop-shadow(0 2px 2px rgba(0,0,0,0.4))'
                    }}
                  />
                ) : (
                  <Icon 
                    className={cn(
                        "relative h-5 w-5 stroke-white stroke-[1.5] transition-transform",
                        isSelected && "scale-125",
                        interactive && "cursor-pointer"
                    )} 
                    style={{
                        fill: isSelected ? 'hsl(48, 96%, 56%)' : color,
                        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.4))'
                    }}
                  />
                )}
              </div>
            </Marker>
        )
      }));
    }

    if (longitude && latitude) {
        markerElements.push(
            <Marker key="main-location" longitude={longitude} latitude={latitude} anchor="center">
                <div className="relative flex items-center justify-center pointer-events-none">
                    {/* Zwarte ronde om de icoon heen */}
                    <div className="absolute h-12 w-12 rounded-full border-[3px] border-black animate-pulse opacity-80" />
                    
                    {/* Wolkje met containernummer */}
                    {mainLocationLabel && (
                        <div className="absolute bottom-full mb-4 bg-black/90 backdrop-blur-sm text-white px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl z-[100] border border-white/20 whitespace-nowrap animate-in zoom-in-95 duration-200">
                            {mainLocationLabel}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-black/90" />
                        </div>
                    )}
                    
                    {/* Kleine stip in het midden */}
                    <div className="h-1.5 w-1.5 rounded-full bg-black border border-white shadow-sm" />
                </div>
            </Marker>
        );
    }
    
    return markerElements;
  }, [uniqueObjects, longitude, latitude, mainLocationLabel, selectedObjects, onObjectSelect, showHeatmap, highlightedObject, interactive]);

  const pinToShow = hoveredPin || selectedPin;

  return (
    <div ref={containerRef} className={cn("w-full h-full", !interactive && "pointer-events-none")}>
      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        dragPan={interactive}
        dragRotate={interactive}
        scrollZoom={interactive}
        touchZoom={interactive}
        touchRotate={interactive}
        doubleClickZoom={interactive}
      >
        {wijkPolygons.length > 0 && (
            <Source id="wijk-polygons" type="geojson" data={geojson}>
                <Layer {...polygonFillLayer} />
                <Layer {...polygonOutlineLayer} />
            </Source>
        )}

        {markers}

        {pinToShow && !highlightedObject && interactive && (
          <Popup
            anchor="top"
            longitude={Number(pinToShow.longitude)}
            latitude={Number(pinToShow.latitude)}
            onClose={() => {
              if (pinToShow === selectedPin) setSelectedPin(null);
              if (pinToShow === hoveredPin) setHoveredPin(null);
            }}
            closeOnClick={false}
            closeButton={!hoveredPin}
          >
            <div>
              <h3 className="font-bold">{pinToShow.id}</h3>
              {hoveredPin ? null : (
                  <>
                      <p>{pinToShow.locatieSubType}</p>
                      <p>{pinToShow.straatnaam} {pinToShow.huisnummer}</p>
                  </>
              )}
            </div>
          </Popup>
        )}
      </MapGL>
    </div>
  );
}
