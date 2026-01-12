'use client';

import * as React from 'react';
import Map, { Layer, Marker, Source, Popup } from 'react-map-gl';
import {
  Search,
  Wind,
  Navigation,
  X,
  Loader2,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface Suggestion {
  id: string;
  place_name: string;
  center: [number, number];
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
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  });

  const [searchQuery, setSearchQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const [origin, setOrigin] = React.useState<[number, number]>([5.4697, 51.4416]); // Default to Eindhoven
  const [destination, setDestination] = React.useState<Suggestion | null>(null);
  const [route, setRoute] = React.useState<any>(null);
  const [isCalculating, setIsCalculating] = React.useState(false);

  // Debounced search for address suggestions
  React.useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            searchQuery
          )}.json?access_token=${MAPBOX_TOKEN}&country=NL&autocomplete=true`
        );
        const data = await response.json();
        setSuggestions(data.features || []);
      } catch (error) {
        console.error('Error fetching address suggestions:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setDestination(suggestion);
    setSearchQuery(suggestion.place_name);
    setSuggestions([]);
  };

  const calculateRoute = async () => {
    if (!destination) return;
    setIsCalculating(true);
    setRoute(null);
    try {
      const coords = `${origin[0]},${origin[1]};${destination.center[0]},${destination.center[1]}`;
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
          padding: { top: 100, bottom: 150, left: 50, right: 50 },
          duration: 1000
        });

      }
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setIsCalculating(false);
    }
  };
  
  const handleClearDestination = () => {
      setDestination(null);
      setSearchQuery('');
      setSuggestions([]);
      setRoute(null);
       mapRef.current?.getMap().flyTo({
            center: [5.2913, 52.1326],
            zoom: 7,
            duration: 1000
        });
  };

  return (
    <div className="flex flex-1 flex-col bg-stone-900 text-white overflow-hidden">
      <div className="flex-1 relative">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
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
             <Marker longitude={destination.center[0]} latitude={destination.center[1]}>
                <MapPin className="text-red-500 w-8 h-8 drop-shadow-lg" fill="currentColor" />
             </Marker>
          )}

          {route && (
            <Source id="route" type="geojson" data={route}>
              <Layer {...routeLayer} />
            </Source>
          )}
        </Map>

        {/* Overlay UI */}
        <div className="absolute top-0 left-0 right-0 p-4 flex flex-col gap-4">
           {/* Top Bar */}
           <Card className="bg-black/70 border-stone-700 backdrop-blur-sm">
                <CardContent className="p-3 flex items-center justify-between">
                     <span className="font-medium text-lg">16:05</span>
                     <div className="flex items-center gap-2">
                        <Wind size={18} className="text-stone-400" />
                        <span className="font-medium">15°C</span>
                     </div>
                </CardContent>
           </Card>

          {/* Search Bar */}
          <Card className="bg-black/70 border-stone-700 backdrop-blur-sm">
            <CardContent className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
                <Input
                  placeholder="Waar wilt u naartoe?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-lg bg-stone-800 border-stone-700 focus-visible:ring-blue-500 text-white"
                />
                {searchQuery && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={handleClearDestination}
                  >
                    <X className="h-5 w-5 text-stone-400" />
                  </Button>
                )}
              </div>
              {isSearching ? (
                  <div className="text-stone-400 text-sm p-3">Zoeken...</div>
              ) : (
                suggestions.length > 0 && (
                  <div className="mt-2 rounded-lg border border-stone-700 bg-stone-800/80 max-h-60 overflow-y-auto">
                    {suggestions.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleSuggestionClick(s)}
                        className="p-3 cursor-pointer hover:bg-stone-700 border-b border-stone-700/50 last:border-b-0"
                      >
                        {s.place_name}
                      </div>
                    ))}
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Action Bar */}
        {destination && !route && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
                <Button 
                    className="w-full h-14 text-xl font-bold bg-blue-600 hover:bg-blue-700" 
                    onClick={calculateRoute}
                    disabled={isCalculating}
                >
                    {isCalculating ? (
                        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                    ) : (
                        "Start Navigatie"
                    )}
                </Button>
            </div>
        )}
      </div>
    </div>
  );
}
