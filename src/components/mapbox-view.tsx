'use client';

import * as React from 'react';
import Map, { Marker, Popup, Source, Layer } from 'react-map-gl';
import { MapPin } from 'lucide-react';
import type { FillLayer, LineLayer } from 'react-map-gl';
import * as turf from '@turf/turf';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MapObject {
  id: string;
  latitude: number;
  longitude: number;
  [key: string]: any;
}

interface MapboxViewProps {
  longitude?: number;
  latitude?: number;
  objects?: MapObject[];
  wijkPolygons?: turf.Feature<turf.Polygon | turf.MultiPolygon>[];
}

const polygonFillLayer: FillLayer = {
    id: 'wijk-polygon-fill',
    type: 'fill',
    paint: {
        'fill-color': '#088',
        'fill-opacity': 0.4,
    },
};

const polygonOutlineLayer: LineLayer = {
    id: 'wijk-polygon-outline',
    type: 'line',
    paint: {
        'line-color': '#088',
        'line-width': 2,
    },
};

export function MapboxView({ longitude, latitude, objects, wijkPolygons = [] }: MapboxViewProps) {
  const [selectedPin, setSelectedPin] = React.useState<MapObject | null>(null);
  
  const geojson: turf.FeatureCollection<turf.Geometry> = React.useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: wijkPolygons,
    };
  }, [wijkPolygons]);

  const mapRef = React.useRef<any>(null);

  const initialLongitude = objects && objects.length > 0 ? objects[0].longitude : (longitude || 5.2913);
  const initialLatitude = objects && objects.length > 0 ? objects[0].latitude : (latitude || 52.1326);
  const initialZoom = objects && objects.length > 0 ? 10 : (longitude && latitude ? 15 : 7);

  const [viewport, setViewport] = React.useState({
    longitude: initialLongitude,
    latitude: initialLatitude,
    zoom: initialZoom,
  });
  
  React.useEffect(() => {
    if (mapRef.current && wijkPolygons.length > 0) {
      const allCoordinates = wijkPolygons.flatMap(f => turf.coordAll(f));
      if (allCoordinates.length > 0) {
          const bbox = turf.bbox({ type: 'FeatureCollection', features: wijkPolygons });
          mapRef.current.fitBounds(bbox, { padding: 40, duration: 1000 });
      }
    } else if (!longitude && !latitude) {
        // Reset to default view if no polygons and no specific coords
         mapRef.current?.flyTo({
            center: [initialLongitude, initialLatitude],
            zoom: initialZoom,
            duration: 1000
        });
    }
  }, [wijkPolygons, longitude, latitude, initialLatitude, initialLongitude, initialZoom]);


  React.useEffect(() => {
    if (longitude && latitude && !objects) {
      setViewport(prev => ({
        ...prev,
        longitude,
        latitude,
        zoom: 15,
      }));
    }
  }, [longitude, latitude, objects]);

  const markers = React.useMemo(() => {
    if (objects) {
      return objects.map(obj => (
        <Marker
          key={obj.id}
          longitude={obj.longitude}
          latitude={obj.latitude}
          anchor="bottom"
          onClick={e => {
            e.originalEvent.stopPropagation();
            setSelectedPin(obj);
          }}
        >
          <MapPin className="h-6 w-6 text-blue-500 fill-current cursor-pointer" />
        </Marker>
      ));
    } else if (longitude && latitude) {
      return (
        <Marker longitude={longitude} latitude={latitude} anchor="bottom">
          <MapPin className="h-6 w-6 text-blue-500 fill-current" />
        </Marker>
      );
    }
    return null;
  }, [objects, longitude, latitude]);

  return (
    <Map
      ref={mapRef}
      {...viewport}
      onMove={evt => setViewport(evt.viewState)}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/streets-v11"
      mapboxAccessToken={MAPBOX_TOKEN}
    >
      {wijkPolygons.length > 0 && (
          <Source id="wijk-polygons" type="geojson" data={geojson}>
              <Layer {...polygonFillLayer} />
              <Layer {...polygonOutlineLayer} />
          </Source>
      )}

      {markers}

      {selectedPin && (
        <Popup
          anchor="top"
          longitude={Number(selectedPin.longitude)}
          latitude={Number(selectedPin.latitude)}
          onClose={() => setSelectedPin(null)}
          closeOnClick={false}
        >
          <div>
            <h3 className="font-bold">{selectedPin.id}</h3>
            <p>{selectedPin.locatieSubType}</p>
            <p>{selectedPin.straatnaam} {selectedPin.huisnummer}</p>
          </div>
        </Popup>
      )}
    </Map>
  );
}
