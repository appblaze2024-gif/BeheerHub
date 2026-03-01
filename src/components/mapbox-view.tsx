'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer } from 'react-map-gl';
import type { FillLayer, LineLayer, SymbolLayer, MapLayerMouseEvent } from 'react-map-gl';
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
  [key: string]: any;
}

interface MapboxViewProps {
  longitude?: number;
  latitude?: number;
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
      return 'hsl(221, 83%, 53%)'; // Blauw als er geen data is
    }
    
    if (vulgraad < 25) return '#22c55e'; // Groen (0% - 24%)
    if (vulgraad < 50) return '#eab308'; // Geel (25% - 49%)
    if (vulgraad < 75) return '#f97316'; // Oranje (50% - 74%)
    return '#ef4444'; // Rood (75% - 100%)
};

export function MapboxView({ longitude, latitude, objects, selectedObjects = [], onObjectSelect, wijkPolygons = [], showHeatmap = true, interactive = true, highlightedObject = null }: MapboxViewProps) {
  const [selectedPin, setSelectedPin] = React.useState<MapObject | null>(null);
  const [hoveredPin, setHoveredPin] = React.useState<MapObject | null>(null);
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';

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
    zoom: longitude && latitude ? 18 : 7,
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
        }
      } catch (e) {
        console.error("Error fitting bounds:", e);
      }
    } else if (longitude && latitude) {
      map.flyTo({ center: [longitude, latitude], zoom: 18});
    } else if (!longitude && !latitude) {
        // Reset to default view if no polygons and no specific coords
         map.flyTo({
            center: [5.2913, 52.1326],
            zoom: 7,
            duration: 1000
        });
    }
  }, [wijkPolygons, longitude, latitude, highlightedObject]);

  const markers = React.useMemo(() => {
    const markerElements: React.ReactNode[] = [];

    if (objects) {
      markerElements.push(...objects.map(obj => {
        const isSelected = selectedObjects.some(so => so.id === obj.id);
        const isHighlighted = highlightedObject?.id === obj.id;
        const color = showHeatmap ? getHeatmapColor(obj.vulgraad) : 'hsl(221, 83%, 53%)';
        return (
            <Marker
              key={`obj-${obj.id}`}
              longitude={obj.longitude}
              latitude={obj.latitude}
              anchor="bottom"
              onClick={e => {
                e.originalEvent.stopPropagation();
                if (onObjectSelect) {
                    onObjectSelect(obj, !isSelected);
                } else {
                    setSelectedPin(obj);
                }
              }}
              onMouseEnter={() => setHoveredPin(obj)}
              onMouseLeave={() => setHoveredPin(null)}
            >
              <div className="relative flex items-center justify-center w-8 h-8">
                {isHighlighted && (
                  <div className="absolute w-6 h-6 rounded-full bg-black/70 animate-pulse" />
                )}
                <Trash2 
                  className={cn(
                      "relative h-5 w-5 cursor-pointer stroke-white stroke-[1.5] transition-transform",
                      isSelected && "scale-125"
                  )} 
                  style={{
                      fill: isSelected ? 'hsl(48, 96%, 56%)' : color,
                      filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.4))'
                  }}
                />
              </div>
            </Marker>
        )
      }));
    }

    if (longitude && latitude) {
        markerElements.push(
            <Marker key="main-location" longitude={longitude} latitude={latitude} anchor="center">
                <div className="relative flex h-5 w-5 items-center justify-center">
                    <div className="absolute h-full w-full rounded-full bg-red-500/50 animate-pulse-scale" />
                    <div className="relative h-3 w-3 rounded-full bg-red-600 border-2 border-white" />
                </div>
            </Marker>
        );
    }
    
    return markerElements;
  }, [objects, longitude, latitude, selectedObjects, onObjectSelect, showHeatmap, highlightedObject]);

  const pinToShow = hoveredPin || selectedPin;

  return (
    <div ref={containerRef} className="w-full h-full">
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

        {pinToShow && !highlightedObject && (
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
