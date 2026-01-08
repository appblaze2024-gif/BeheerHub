'use client';

import * as React from 'react';
import Map, { Marker } from 'react-map-gl';
import { MapPin } from 'lucide-react';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MapboxViewProps {
    longitude?: number;
    latitude?: number;
}

export function MapboxView({ longitude, latitude }: MapboxViewProps) {
  const [viewport, setViewport] = React.useState({
    longitude: longitude || 5.2913,
    latitude: latitude || 52.1326,
    zoom: longitude && latitude ? 15 : 7,
  });

  React.useEffect(() => {
    if (longitude && latitude) {
        setViewport(prev => ({
            ...prev,
            longitude,
            latitude,
            zoom: 15
        }));
    }
  }, [longitude, latitude]);

  return (
    <Map
      {...viewport}
      onMove={(evt) => setViewport(evt.viewState)}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/streets-v11"
      mapboxAccessToken={MAPBOX_TOKEN}
    >
      {longitude && latitude && (
        <Marker longitude={longitude} latitude={latitude} anchor="bottom" >
          <MapPin className="h-6 w-6 text-blue-500 fill-current" />
        </Marker>
      )}
    </Map>
  );
}
