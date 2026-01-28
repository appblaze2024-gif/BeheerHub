'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer } from 'react-map-gl';
import {
  Search,
  LocateFixed,
  Plus,
  Minus,
  Layers,
  ArrowUp,
  Filter,
  Zap,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigationUI } from '@/context/navigation-ui-context';

const MAPBOX_TOKEN =
  'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const routeLayerStyle: any = {
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#f43f5e', // rose-500, a pinkish-red
    'line-width': 4,
    'line-dasharray': [0, 2.5],
    'line-cap': 'round',
  },
};

// Dummy data to match the visual style of the image
const dummyRoute = {
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'LineString' as const,
    coordinates: [
      [5.289, 52.131],
      [5.290, 52.132],
      [5.2915, 52.1325],
      [5.293, 52.132],
      [5.294, 52.131],
    ],
  },
};

const dummyMarkers = [
  { id: '1', longitude: 5.289, latitude: 52.131, color: 'bg-rose-500' },
  { id: '2', longitude: 5.294, latitude: 52.131, color: 'bg-orange-500' },
  { id: '3', longitude: 5.292, latitude: 52.1315, color: 'bg-blue-500' },
];

export default function Page() {
  const mapRef = React.useRef<any>();
  const { setIsHeaderVisible } = useNavigationUI();

  const [viewState, setViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 15,
  });

  // Hide the main app header when this component mounts
  React.useEffect(() => {
    setIsHeaderVisible(false);
    // Show it again when the component unmounts
    return () => {
      setIsHeaderVisible(true);
    };
  }, [setIsHeaderVisible]);

  const handleZoom = (level: number) => {
    mapRef.current
      ?.getMap()
      .zoomTo(mapRef.current.getMap().getZoom() + level, { duration: 300 });
  };

  const centerOnLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { longitude, latitude } = position.coords;
        mapRef.current
          ?.getMap()
          .flyTo({ center: [longitude, latitude], zoom: 15 });
      });
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden h-full relative">
      {/* Map View */}
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        <Source id="route" type="geojson" data={dummyRoute}>
          <Layer {...routeLayerStyle} />
        </Source>
        {dummyMarkers.map((marker) => (
          <Marker
            key={marker.id}
            longitude={marker.longitude}
            latitude={marker.latitude}
            anchor="center"
          >
            <div className={`w-5 h-5 rounded-full shadow-md ${marker.color}`} />
          </Marker>
        ))}
      </MapGL>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 pt-4 px-4 bg-gradient-to-b from-white/90 via-white/70 to-transparent">
        <div className="bg-white p-3 rounded-xl shadow-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Gemeente Leddam</p>
              <h1 className="text-base font-bold">Sensorregister</h1>
            </div>
          </div>
          <Button variant="ghost" size="icon">
            <Menu className="h-6 w-6" />
          </Button>
        </div>
      </header>

      {/* Search Bar */}
      <div className="absolute top-28 left-4 right-4 z-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Zoek adres of sensor"
            className="w-full pl-11 pr-4 py-2 h-14 shadow-lg rounded-lg border-none text-base"
          />
        </div>
      </div>

      {/* Map Controls */}
      <div className="absolute top-1/2 -translate-y-1/2 right-4 z-10 flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="bg-white text-black shadow-lg hover:bg-gray-100 h-12 w-12 rounded-lg"
          onClick={() => handleZoom(1)}
        >
          <Plus className="h-6 w-6" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-white text-black shadow-lg hover:bg-gray-100 h-12 w-12 rounded-lg"
          onClick={() => handleZoom(-1)}
        >
          <Minus className="h-6 w-6" />
        </Button>
        <div className="h-2" />
        <Button
          variant="secondary"
          size="icon"
          className="bg-white text-black shadow-lg hover:bg-gray-100 h-12 w-12 rounded-lg"
          onClick={centerOnLocation}
        >
          <LocateFixed className="h-6 w-6" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-white text-black shadow-lg hover:bg-gray-100 h-12 w-12 rounded-lg"
        >
          <Layers className="h-6 w-6" />
        </Button>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-6 left-4 right-4 z-10 flex justify-between items-center gap-4">
        <Button
          variant="secondary"
          className="bg-white shadow-lg h-12 rounded-lg flex-1"
        >
          <ArrowUp className="mr-2 h-5 w-5" />
          <span className="font-semibold">Legenda</span>
        </Button>
        <Button
          variant="secondary"
          className="bg-white shadow-lg h-12 rounded-lg flex-1"
        >
          <Filter className="mr-2 h-5 w-5" />
          <span className="font-semibold">Filteren</span>
        </Button>
      </div>
    </div>
  );
}
