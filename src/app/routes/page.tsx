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
import { useFirestore, useUser } from '@/firebase';
import { collection, addDoc } from 'firebase/firestore';

const MAPBOX_TOKEN =
  'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const firestore = useFirestore();
  const { user } = useUser();

  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  const [showFilter, setShowFilter] = React.useState(true);
  const [isGemeenteDialogOpen, setIsGemeenteDialogOpen] = React.useState(false);
  const [polygonFeature, setPolygonFeature] = React.useState<Feature<Polygon | MultiPolygon> | null>(null);
  const [highlightedRoads, setHighlightedRoads] = React.useState<FeatureCollection | null>(null);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };
  
  const clearSelection = () => {
    setPolygonFeature(null);
    setSelectedTypes([]);
    setHighlightedRoads(null);
    mapRef.current?.getMap().flyTo({
        center: [5.2913, 52.1326],
        zoom: 7,
        duration: 1000
    });
  };
  
  const handleGemeenteSelect = async (gemeenteFeature: Feature<Polygon | MultiPolygon>) => {
    if (mapRef.current) {
      setPolygonFeature(gemeenteFeature);
      setSelectedTypes([]); // Filters default to off
      
      const map = mapRef.current.getMap();
      const roadsInside = map.querySourceFeatures('composite', {
          sourceLayer: 'road',
      }).filter(road => {
          try {
              // Use a combination of intersects and a point check for accuracy with lines
              if (turf.booleanIntersects(road, gemeenteFeature)) {
                  if (road.geometry.type === 'LineString') {
                      // Check if at least one point of the line is inside the polygon
                      return road.geometry.coordinates.some(coord => turf.booleanPointInPolygon(coord, gemeenteFeature));
                  }
                  return true;
              }
              return false;
          } catch(e) {
              return false;
          }
      });
      setHighlightedRoads(turf.featureCollection(roadsInside));
      
      const bbox = turf.bbox(gemeenteFeature);
      if (bbox[0] !== Infinity) {
        map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
      }

      if (user && firestore) {
        const routesColRef = collection(firestore, 'users', user.uid, 'routes');
        await addDoc(routesColRef, { gemeente: gemeenteFeature.properties?.name || 'Onbekend', createdAt: new Date() });
      }
    }
    setIsGemeenteDialogOpen(false);
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

  const maskGeoJSON = React.useMemo(() => {
    if (!polygonFeature) return null;
    
    const outerPolygon = turf.polygon([[
        [-180, -90],
        [180, -90],
        [180, 90],
        [-180, 90],
        [-180, -90]
    ]]);
    
    return turf.difference(outerPolygon, polygonFeature);
  }, [polygonFeature]);


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
                <Button size="sm" variant="outline" onClick={handleSelectAll}>
                  Alles
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeselectAll}>
                  Niets
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectSweepRoutes}
                >
                  Veegroutes
                </Button>
              </div>
              <Separator className="mb-4" />
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
            </CardContent>
          </Card>
        )}
      </div>

      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button onClick={() => setIsGemeenteDialogOpen(true)}>
          <Search className="mr-2 h-4 w-4" /> Kies Gemeente
        </Button>
        {polygonFeature && (
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
        
        {/* Base road layers, only visible when no gemeente is selected */}
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
              'visibility': polygonFeature ? 'none' : 'visible'
            }}
            paint={{
              'line-color': color,
              'line-width': 4,
              'line-opacity': 0.8,
            }}
          />
        ))}

        {/* Mask layer to dim everything outside the selected polygon */}
        {maskGeoJSON && (
           <Source id="mask-source" type="geojson" data={maskGeoJSON}>
             <Layer
               id="mask-layer"
               type="fill"
               paint={{
                 'fill-color': 'rgba(128, 128, 128, 0.5)',
               }}
             />
           </Source>
        )}

        {/* Highlighted (clipped) road layers, only visible when a gemeente is selected */}
        {highlightedRoads && polygonFeature && (
          <Source id="highlighted-roads" type="geojson" data={highlightedRoads}>
             {Object.entries(roadColorMapping).map(([type, color]) => (
                <Layer
                    key={`highlight-${type}`}
                    id={`highlight-${type}`}
                    type="line"
                    source="highlighted-roads"
                    filter={['==', 'class', type]}
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round',
                      'visibility': selectedTypes.includes(type) ? 'visible' : 'none',
                    }}
                    paint={{
                      'line-color': color,
                      'line-width': 4,
                      'line-opacity': 0.8,
                    }}
                />
            ))}
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
