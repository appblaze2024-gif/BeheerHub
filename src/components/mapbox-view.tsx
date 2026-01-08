'use client';

import * as React from 'react';
import Map, { Marker } from 'react-map-gl';
import { MapPin } from 'lucide-react';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export function MapboxView() {
  const [viewport, setViewport] = React.useState({
    longitude: 5.2913, // Center of the Netherlands
    latitude: 52.1326,
    zoom: 7,
  });

  return (
    <Map
      {...viewport}
      onMove={(evt) => setViewport(evt.viewState)}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/streets-v11"
      mapboxAccessToken={MAPBOX_TOKEN}
    >
      {/* You can add markers here if needed */}
      {/* <Marker longitude={5.2913} latitude={52.1326} anchor="bottom" >
        <MapPin className="h-6 w-6 text-blue-500 fill-current" />
      </Marker> */}
    </Map>
  );
}
