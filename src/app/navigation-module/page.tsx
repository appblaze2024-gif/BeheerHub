'use client';

import * as React from 'react';
import Map, { Layer, Marker, Source } from 'react-map-gl';
import {
  Search,
  Navigation,
  Loader2,
  MapPin,
  List,
  LocateFixed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import * as turf from '@turf/turf';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MapObject {
    id: string;
    latitude: number;
    longitude: number;
    [key: string]: any;
}


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
    'line-opacity': 0.9,
  },
};

export default function NavigationModulePage() {
  const mapRef = React.useRef<any>();
  const firestore = useFirestore();
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913, // Default center of NL
    latitude: 52.1326,
    zoom: 7,
  });
  
  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: objects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);

  const [searchQuery, setSearchQuery] = React.useState('');
  
  const filteredObjects = React.useMemo(() => {
    if (!objects) return [];
    if (!searchQuery.trim()) return objects;
    return objects.filter(obj => 
      obj.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.straatnaam?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.locatieSubType?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [objects, searchQuery]);


  const [origin, setOrigin] = React.useState<[number, number] | null>(null);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [destination, setDestination] = React.useState<MapObject | null>(null);
  const [route, setRoute] = React.useState<any>(null);
  const [isCalculating, setIsCalculating] = React.useState(false);

  React.useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { longitude, latitude } = position.coords;
          setOrigin([longitude, latitude]);
          setViewState(prev => ({...prev, longitude, latitude, zoom: 14}));
          setLocationError(null);
        },
        (error) => {
          setLocationError("Kon uw locatie niet ophalen. Zorg ervoor dat u locatietoestemming heeft gegeven.");
          // Fallback to a default origin if location is denied
          setOrigin([5.4697, 51.4416]); 
        }
      );
    } else {
      setLocationError("Geolocatie wordt niet ondersteund door deze browser.");
      setOrigin([5.4697, 51.4416]); // Fallback for old browsers
    }
  }, []);

  const handleObjectClick = (object: MapObject) => {
    setDestination(object);
    if(origin) {
        calculateRoute(origin, [object.longitude, object.latitude]);
    }
  };

  const calculateRoute = async (start: [number, number], end: [number, number]) => {
    setIsCalculating(true);
    setRoute(null);
    try {
      const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const routeGeoJSON = data.routes[0].geometry;
        setRoute(routeGeoJSON);
        
        const routeFeature = turf.feature(routeGeoJSON);
        const bbox = turf.bbox(routeFeature);

        mapRef.current?.getMap().fitBounds(bbox, {
          padding: { top: 100, bottom: 50, left: 450, right: 50 },
          duration: 1000
        });
      }
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const centerOnLocation = () => {
    if (origin) {
        mapRef.current?.getMap().flyTo({
            center: origin,
            zoom: 15,
        });
    }
  };
  
  return (
    <div className="flex flex-1 flex-col bg-stone-900 text-white overflow-hidden">
      <div className="flex-1 relative">
        <aside className='absolute top-0 left-0 z-10 m-4 w-96 h-[calc(100%-2rem)]'>
           <Card className="bg-white/90 border-stone-200 backdrop-blur-sm h-full flex flex-col text-black">
              <CardHeader>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
                  <Input
                    placeholder="Zoek object op ID, straat..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 text-base bg-stone-50 border-stone-300 focus-visible:ring-blue-500 text-black"
                  />
                </div>
                {locationError && (
                    <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Locatie Fout</AlertTitle>
                        <AlertDescription>{locationError}</AlertDescription>
                    </Alert>
                )}
              </CardHeader>
              <CardContent className="p-2 flex-1 overflow-y-auto">
                {isLoadingObjects ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
                  </div>
                ) : (
                  <div className='flex flex-col gap-1'>
                    {filteredObjects?.map(obj => (
                      <button
                        key={obj.id}
                        onClick={() => handleObjectClick(obj)}
                        className={cn(
                          'flex items-center gap-3 w-full text-left p-3 rounded-md hover:bg-stone-100',
                          destination?.id === obj.id && 'bg-blue-100 hover:bg-blue-200'
                        )}
                        disabled={!origin}
                      >
                        <MapPin className="h-5 w-5 shrink-0 text-stone-500" />
                        <div className="flex-1 overflow-hidden">
                          <p className="font-semibold truncate">{obj.id}</p>
                          <p className="text-sm text-stone-500 truncate">{obj.straatnaam || obj.locatieSubType || 'Geen details'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
           </Card>
        </aside>

        <div className="absolute top-4 right-4 z-10">
          <Button onClick={centerOnLocation} variant="outline" size="icon" className="bg-white border-stone-300 text-black hover:bg-stone-100">
            <LocateFixed className="h-5 w-5" />
          </Button>
        </div>

        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {origin && (
            <Marker longitude={origin[0]} latitude={origin[1]}>
              <div className="bg-blue-500 w-5 h-5 rounded-full border-4 border-white shadow-md flex items-center justify-center">
                <Navigation className="w-3 h-3 text-white transform -rotate-45" />
              </div>
            </Marker>
          )}

          {destination && (
             <Marker longitude={destination.longitude} latitude={destination.latitude}>
                <MapPin className="text-red-500 w-8 h-8 drop-shadow-lg" fill="currentColor" />
             </Marker>
          )}

          {route && (
            <Source id="route" type="geojson" data={route}>
              <Layer {...routeLayer} />
            </Source>
          )}

          {objects?.map(obj => (
             <Marker
                key={obj.id}
                longitude={obj.longitude}
                latitude={obj.latitude}
                onClick={() => handleObjectClick(obj)}
             >
              <div
                className={cn(
                  'w-2.5 h-2.5 rounded-full cursor-pointer transition-all',
                  destination?.id === obj.id ? 'bg-red-500 scale-150 border-2 border-white' : 'bg-gray-700'
                )}
              />
            </Marker>
          ))}
        </Map>

        {(isCalculating) && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
                <div className='bg-white/80 border border-stone-200 backdrop-blur-sm rounded-lg p-4 flex items-center justify-center text-black'>
                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                    <span className='text-lg font-semibold'>Route berekenen...</span>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
