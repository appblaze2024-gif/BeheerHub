'use client';

import * as React from 'react';
import Image from 'next/image';
import Map, { Layer, Marker, Source } from 'react-map-gl';
import {
  Maximize,
  Minus,
  Plus,
  Wind,
  Circle,
  Bell,
  Mic,
  Music,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';

const MAPBOX_TOKEN =
  'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const routeGeoJSON = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: [
      [-122.039, 37.387],
      [-122.039, 37.394],
      [-122.031, 37.394],
      [-122.031, 37.401],
      [-122.023, 37.401],
      [-122.023, 37.395],
      [-122.016, 37.395],
    ],
  },
};

const routeLayer: any = {
  id: 'route',
  type: 'line',
  source: 'route',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    'line-color': '#3b82f6',
    'line-width': 8,
    'line-opacity': 0.8,
  },
};

export default function NavigationModulePage() {
  const [viewState, setViewState] = React.useState({
    longitude: -122.025,
    latitude: 37.396,
    zoom: 14.5,
  });

  return (
    <div className="flex flex-1 flex-col bg-stone-900 overflow-hidden">
      <PageHeader title="Navigatiemodule" className="text-white" />
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl aspect-[16/9] bg-black rounded-2xl shadow-2xl shadow-blue-500/10 border border-stone-700 p-2 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-2 pb-1 text-white">
            <span className="font-medium text-lg">4:05</span>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Wind size={18} className="text-stone-400" />
                <span className="font-medium">35°F</span>
              </div>
              <Button
                variant="secondary"
                className="bg-stone-800 hover:bg-stone-700 text-white rounded-full"
              >
                Recenter
              </Button>
            </div>
            <div className="flex items-center gap-2 text-stone-400">
              <Minus size={16} />
              <Maximize size={16} />
              <span className="text-xl">×</span>
            </div>
          </div>

          {/* Map Area */}
          <div className="flex-1 rounded-lg overflow-hidden relative">
            <Map
              {...viewState}
              onMove={(evt) => setViewState(evt.viewState)}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/mapbox/dark-v11"
              mapboxAccessToken={MAPBOX_TOKEN}
            >
              <Source id="my-data" type="geojson" data={routeGeoJSON as any}>
                <Layer {...routeLayer} />
              </Source>
              <Marker longitude={-122.039} latitude={37.387}>
                <div className="bg-blue-500 w-5 h-5 rounded-full border-4 border-white shadow-md" />
              </Marker>
               <Marker longitude={-122.016} latitude={37.395}>
                 <div className='bg-orange-400 rounded-md p-2 text-white font-bold text-sm shadow-lg'>
                   <span>Denny's</span>
                   <p className='text-xs font-normal'>50 min</p>
                 </div>
              </Marker>
            </Map>
            <div className="absolute right-4 bottom-16 flex flex-col gap-2">
              <Button
                size="icon"
                className="bg-stone-800 hover:bg-stone-700 text-white rounded-full h-12 w-12"
              >
                <Plus size={24} />
              </Button>
              <Button
                size="icon"
                className="bg-stone-800 hover:bg-stone-700 text-white rounded-full h-12 w-12"
              >
                <Minus size={24} />
              </Button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-around p-3 text-white">
            <Button variant="ghost" size="icon" className='rounded-full'>
              <Circle size={28} className="text-stone-400" />
            </Button>
            <Button variant="ghost" size="icon" className='rounded-full'>
              <Image
                src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Google_Maps_icon.svg"
                width={32}
                height={32}
                alt="Google Maps"
              />
            </Button>
            <Button variant="ghost" size="icon" className='rounded-full'>
              <Music size={24} className="text-stone-400" />
            </Button>
            <Button variant="ghost" size="icon" className='rounded-full'>
              <Bell size={24} className="text-stone-400" />
            </Button>
            <Button variant="ghost" size="icon" className='rounded-full'>
              <Mic size={24} className="text-stone-400" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
