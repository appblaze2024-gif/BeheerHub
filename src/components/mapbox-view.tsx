'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer } from 'react-map-gl';
import type { FillLayer, LineLayer, SymbolLayer, MapLayerMouseEvent } from 'react-map-gl';
import * as turf from '@turf/turf';


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
    if (vulgraad === undefined || vulgraad === null || vulgraad <= 0) {
      return 'bg-blue-600'; // Default to blue if no vulgraad
    }
    // Hue: 120 is green, 0 is red.
    // We want green (120) at 0% and red (0) at 100%.
    const hue = 120 * (1 - vulgraad / 100);
    return `hsl(${hue}, 80%, 50%)`;
};

export function MapboxView({ longitude, latitude, objects, selectedObjects = [], onObjectSelect, wijkPolygons = [], showHeatmap = true }: MapboxViewProps) {
  const [selectedPin, setSelectedPin] = React.useState<MapObject | null>(null);
  const [hoveredPin, setHoveredPin] = React.useState<MapObject | null>(null);

  const geojson: turf.FeatureCollection<turf.Geometry> = React.useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: wijkPolygons,
    };
  }, [wijkPolygons]);

  const mapRef = React.useRef<any>(null);

  const initialViewState = {
    longitude: longitude || 5.2913,
    latitude: latitude || 52.1326,
    zoom: longitude && latitude ? 17 : 7,
  };
  
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    
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
    } else if (!longitude && !latitude) {
        // Reset to default view if no polygons and no specific coords
         map.flyTo({
            center: [5.2913, 52.1326],
            zoom: 7,
            duration: 1000
        });
    }
  }, [wijkPolygons, longitude, latitude]);


  React.useEffect(() => {
    if (longitude && latitude && !objects) {
      mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 17});
    }
  }, [longitude, latitude, objects]);

  const markers = React.useMemo(() => {
    if (objects) {
      return objects.map(obj => {
        const isSelected = selectedObjects.some(so => so.id === obj.id);
        const color = showHeatmap ? getHeatmapColor(obj.vulgraad) : 'bg-blue-600';
        return (
            <Marker
              key={obj.id}
              longitude={obj.longitude}
              latitude={obj.latitude}
              anchor="center"
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
              <div 
                className={`h-3 w-3 rounded-full border-2 border-white cursor-pointer ${color}`} 
                style={{backgroundColor: color.startsWith('hsl') ? color : undefined}}
              />
            </Marker>
        )
      });
    } else if (longitude && latitude) {
      return (
        <Marker longitude={longitude} latitude={latitude} anchor="center">
          <div className="h-3 w-3 bg-blue-500 rounded-full border-2 border-white" />
        </Marker>
      );
    }
    return null;
  }, [objects, longitude, latitude, selectedObjects, onObjectSelect, showHeatmap]);

  const pinToShow = hoveredPin || selectedPin;

  return (
    <MapGL
      ref={mapRef}
      initialViewState={initialViewState}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      mapboxAccessToken={MAPBOX_TOKEN}
    >
      {wijkPolygons.length > 0 && (
          <Source id="wijk-polygons" type="geojson" data={geojson}>
              <Layer {...polygonFillLayer} />
              <Layer {...polygonOutlineLayer} />
          </Source>
      )}

      {markers}

      {pinToShow && (
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
  );
}
