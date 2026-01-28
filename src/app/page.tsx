"use client";

import * as React from 'react';
import MapGL from 'react-map-gl';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function DashboardPage() {
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  });

  return (
    <div className="flex-1 w-full h-full">
       <MapGL
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
      />
    </div>
  );
}
