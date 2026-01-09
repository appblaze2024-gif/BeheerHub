'use client';

import * as React from 'react';
import Map from 'react-map-gl';
import { PageHeader } from "@/components/page-header";

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="Routes" />
      <div className="flex-1 relative">
        <Map
          initialViewState={initialViewState}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {/* Map content such as markers, popups, and layers for routes will be added here. */}
        </Map>
      </div>
    </div>
  );
}
