'use client';

import * as React from 'react';
import Map, { Marker, Popup } from 'react-map-gl';
import { MapPin } from 'lucide-react';

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
}

export function MapboxView({ longitude, latitude, objects }: MapboxViewProps) {
  const [selectedPin, setSelectedPin] = React.useState<MapObject | null>(null);

  const initialLongitude = objects && objects.length > 0 ? objects[0].longitude : (longitude || 5.2913);
  const initialLatitude = objects && objects.length > 0 ? objects[0].latitude : (latitude || 52.1326);
  const initialZoom = objects && objects.length > 0 ? 10 : (longitude && latitude ? 15 : 7);

  const [viewport, setViewport] = React.useState({
    longitude: initialLongitude,
    latitude: initialLatitude,
    zoom: initialZoom,
  });

  React.useEffect(() => {
    if (longitude && latitude && !objects) {
      setViewport(prev => ({
        ...prev,
        longitude,
        latitude,
        zoom: 15,
      }));
    } else if (objects && objects.length > 0) {
        // Optional: fit map to bounds of all objects
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
      {...viewport}
      onMove={evt => setViewport(evt.viewState)}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/streets-v11"
      mapboxAccessToken={MAPBOX_TOKEN}
    >
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
