'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  allRoadTypes,
  roadColorMapping,
} from '@/components/road-type-filter-dialog';
import { Layers, X, Search, Trash2 } from 'lucide-react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { GemeenteSelectDialog } from '@/components/gemeente-select-dialog';
import * as turf from '@turf/turf';
import { useFirestore, useUser, useCollection } from '@/firebase';
import { collection, query, orderBy, deleteDoc, doc, addDoc, getDocs, limit } from 'firebase/firestore';

const MAPBOX_TOKEN =
  'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const firestore = useFirestore();
  const { user } = useUser();

  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  const [showFilter, setShowFilter] = React.useState(true);
  const [isGemeenteDialogOpen, setIsGemeenteDialogOpen] = React.useState(false);
  const [maskPolygon, setMaskPolygon] = React.useState<Feature<Polygon | MultiPolygon> | null>(null);
  const [activeRoute, setActiveRoute] = React.useState<any | null>(null);
  
  const routesCollectionRef = React.useMemo(() => {
    if (!user || !firestore) return null;
    return collection(firestore, 'users', user.uid, 'routes');
  }, [user, firestore]);

  const routesQuery = React.useMemo(() => {
    if (!routesCollectionRef) return null;
    return query(routesCollectionRef, orderBy('createdAt', 'desc'), limit(1));
  }, [routesCollectionRef]);
  
  const { data: routes, isLoading: isLoadingRoutes } = useCollection(routesQuery);

  React.useEffect(() => {
    if (routes && routes.length > 0) {
      if(routes[0].id !== activeRoute?.id) {
         setActiveRoute(routes[0]);
         setSelectedTypes([]); // Reset filter when route changes
      }
    } else if (routes && routes.length === 0) {
      setActiveRoute(null);
      setMaskPolygon(null); // Clear mask if there are no routes
    }
  }, [routes, activeRoute?.id]);


  React.useEffect(() => {
    const fetchAndSetPolygon = async () => {
        if (activeRoute && activeRoute.gemeente) {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                    activeRoute.gemeente
                )}&format=json&polygon_geojson=1&countrycodes=nl&limit=1`
            );
            const data = await response.json();
            if (data.length > 0 && (data[0].geojson.type === 'Polygon' || data[0].geojson.type === 'MultiPolygon')) {
                const feature: Feature<Polygon | MultiPolygon> = {
                    type: 'Feature',
                    properties: { name: data[0].display_name },
                    geometry: data[0].geojson,
                };
                
                const outerPolygon = turf.polygon([[
                    [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
                ]]);
                
                try {
                    const mask = turf.difference(outerPolygon, feature);
                    setMaskPolygon(mask);
                    
                    const map = mapRef.current?.getMap();
                    if(map) {
                      const bbox = turf.bbox(feature);
                      map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
                    }
                } catch (e) {
                    console.error("Error creating mask polygon:", e);
                    setMaskPolygon(null);
                }
            } else {
                 setMaskPolygon(null);
            }
        } else {
            setMaskPolygon(null);
        }
    };
    fetchAndSetPolygon();
  }, [activeRoute]);

  const clearSelection = async () => {
    if (routesCollectionRef) {
      const querySnapshot = await getDocs(routesCollectionRef);
      const deletePromises = querySnapshot.docs.map(docSnapshot => 
        deleteDoc(doc(routesCollectionRef, docSnapshot.id))
      );
      await Promise.all(deletePromises);
    }
    setSelectedTypes([]);
    mapRef.current?.getMap().flyTo({
        center: [5.2913, 52.1326],
        zoom: 7,
        duration: 1000
    });
  };
  
  const handleGemeenteSelect = async (gemeenteFeature: Feature<Polygon | MultiPolygon>) => {
    const gemeenteName = gemeenteFeature.properties?.name || 'Onbekend';
    
    if (routesCollectionRef) {
        // Clear old routes before adding a new one to ensure only one active route exists
        const querySnapshot = await getDocs(routesCollectionRef);
        const deletePromises = querySnapshot.docs.map(docSnapshot => deleteDoc(doc(routesCollectionRef, docSnapshot.id)));
        await Promise.all(deletePromises);
        
        await addDoc(routesCollectionRef, { gemeente: gemeenteName, createdAt: new Date() });
    }
    
    setIsGemeenteDialogOpen(false);
    setSelectedTypes([]);
  };

  const handleCheckedChange = (type: string, checked: boolean) => {
    const newSelectedTypes = checked
      ? [...selectedTypes, type]
      : selectedTypes.filter((t) => t !== type);
    setSelectedTypes(newSelectedTypes);
  };

  const handleSelectAll = () => setSelectedTypes(Object.keys(allRoadTypes));
  const handleDeselectAll = () => setSelectedTypes([]);

  const handleSelectSweepRoutes = () => {
    const sweepTypes = [
      'primary',
      'secondary',
      'tertiary',
      'primary_link',
      'secondary_link',
      'tertiary_link',
      'street',
      'street_limited',
      'service',
      'residential',
      'living_street',
      'road',
      'unclassified',
      'roundabout',
    ];
    setSelectedTypes(sweepTypes);
  };
  
  const isFilterDisabled = !activeRoute;

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };


  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button onClick={() => setShowFilter(!showFilter)} className="w-fit">
          <Layers className="mr-2 h-4 w-4" /> Wegtypes
        </Button>

        {showFilter && (
          <Card className="w-80 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Filter Wegtypes</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowFilter(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={handleSelectAll} disabled={isFilterDisabled}>
                  Alles
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeselectAll} disabled={isFilterDisabled}>
                  Niets
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectSweepRoutes}
                  disabled={isFilterDisabled}
                >
                  Veegroutes
                </Button>
              </div>
              <Separator className="mb-4" />
              <fieldset disabled={isFilterDisabled}>
                <ScrollArea className="h-64 pr-4">
                  <div className="grid grid-cols-1 gap-y-2">
                    {Object.entries(allRoadTypes)
                      .sort(([, a], [, b]) =>
                        a.localeCompare(b, undefined, { sensitivity: 'base' })
                      )
                      .map(([type, name]) => (
                        <div key={type} className="flex items-center space-x-2">
                          <Checkbox
                            id={`type-${type}`}
                            checked={selectedTypes.includes(type)}
                            onCheckedChange={(checked) =>
                              handleCheckedChange(type, !!checked)
                            }
                          />
                          <Label
                            htmlFor={`type-${type}`}
                            className="font-normal capitalize flex items-center gap-2"
                          >
                            <div
                              className="h-3 w-3 rounded-sm"
                              style={{ backgroundColor: roadColorMapping[type] }}
                            />
                            {name}
                          </Label>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </fieldset>
               {(isFilterDisabled && !isLoadingRoutes) && (
                <div className="text-xs text-muted-foreground mt-2">Selecteer eerst een gemeente.</div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button onClick={() => setIsGemeenteDialogOpen(true)}>
          <Search className="mr-2 h-4 w-4" /> Kies Gemeente
        </Button>
        {activeRoute && (
          <Button onClick={clearSelection} variant="destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Huidige selectie wissen
          </Button>
        )}
      </div>

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactiveLayerIds={Object.keys(roadColorMapping)}
      >
        {Object.entries(roadColorMapping).map(([type, color]) => (
          <Layer
            key={type}
            id={type}
            type="line"
            source="composite"
            source-layer="road"
            filter={['==', 'class', type]}
            layout={{
              'line-join': 'round',
              'line-cap': 'round',
              visibility: selectedTypes.includes(type) ? 'visible' : 'none',
            }}
            paint={{
              'line-color': color,
              'line-width': 4,
              'line-opacity': 0.8,
            }}
          />
        ))}

        {maskPolygon && (
          <Source id="mask-source" type="geojson" data={maskPolygon}>
            <Layer
              id="mask-layer"
              type="fill"
              paint={{ 'fill-color': '#000000', 'fill-opacity': 0.8 }}
            />
          </Source>
        )}
      </Map>
      <GemeenteSelectDialog 
        open={isGemeenteDialogOpen}
        onOpenChange={setIsGemeenteDialogOpen}
        onGemeenteSelect={handleGemeenteSelect}
      />
    </div>
  );
}
