"use client";

import * as React from 'react';
import MapGL, { Source, Layer, type MapRef } from 'react-map-gl';
import { useProfile } from '@/firebase/profile-provider';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const boundaryLayer: Layer = {
  id: 'municipality-outline',
  type: 'line',
  paint: {
    'line-color': '#000000',
    'line-width': 2,
  },
};

export default function DashboardPage() {
  const mapRef = React.useRef<MapRef>(null);
  const { profile } = useProfile();
  const [boundary, setBoundary] = React.useState<any>(null);

  const [viewState, setViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  });

  React.useEffect(() => {
    if (profile?.schouwenGemeente) {
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          profile.schouwenGemeente
        )}&format=json&polygon_geojson=1&countrycodes=nl`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.length > 0 && data[0].geojson) {
            const geojsonData = data[0].geojson;
            setBoundary(geojsonData);
            
            // Wait for map to be ready before fitting bounds
            if (mapRef.current?.getMap().isStyleLoaded()) {
                const bbox = turf.bbox(geojsonData);
                mapRef.current?.fitBounds(bbox as [number, number, number, number], {
                    padding: 40,
                    duration: 1000,
                });
            }
          }
        })
        .catch(console.error);
    } else {
        setBoundary(null);
    }
  }, [profile?.schouwenGemeente]);

  const onMapLoad = React.useCallback(() => {
      if (boundary) {
          const bbox = turf.bbox(boundary);
          mapRef.current?.fitBounds(bbox as [number, number, number, number], {
              padding: 40,
          });
      }
  }, [boundary]);


  return (
    <div className="flex-1 w-full h-full">
       <MapGL
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onLoad={onMapLoad}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {boundary && (
          <Source id="municipality-boundary" type="geojson" data={boundary}>
            <Layer {...boundaryLayer} />
          </Source>
        )}
      </MapGL>
    </div>
  );
}
