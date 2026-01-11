'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  allRoadTypes,
  roadColorMapping,
} from '@/components/road-type-filter-dialog';
import { Edit, Trash2, Layers, X, Search } from 'lucide-react';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { GemeenteSelectDialog } from '@/components/gemeente-select-dialog';

const MAPBOX_TOKEN =
  'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const drawRef = React.useRef<MapboxDraw | null>(null);

  const [drawnFeatures, setDrawnFeatures] = React.useState<Feature[]>([]);
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>(
    Object.keys(allRoadTypes)
  );
  const [showFilter, setShowFilter] = React.useState(true);
  const [isDrawMode, setIsDrawMode] = React.useState(false);
  const [isGemeenteDialogOpen, setIsGemeenteDialogOpen] = React.useState(false);
  const [maskPolygon, setMaskPolygon] = React.useState<Feature | null>(null);

  const [highlightedRoads, setHighlightedRoads] = React.useState<FeatureCollection | null>(null);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };
  
  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
      });
      map.addControl(draw);
      drawRef.current = draw;

      const updateFeatures = () => {
        const data = draw.getAll();
        setDrawnFeatures(data.features as Feature[]);
      };
      
      map.on('draw.create', updateFeatures);
      map.on('draw.update', updateFeatures);
      map.on('draw.delete', updateFeatures);
    }
  }, []);

  const startDrawing = () => {
    if (drawRef.current) {
      drawRef.current.deleteAll();
      setDrawnFeatures([]);
      setMaskPolygon(null);
      setHighlightedRoads(null);
      drawRef.current.changeMode('draw_polygon');
      setIsDrawMode(true);
    }
  };

  const clearDrawing = () => {
    if (drawRef.current) {
      drawRef.current.deleteAll();
    }
    setDrawnFeatures([]);
    setMaskPolygon(null);
    setHighlightedRoads(null);
    setIsDrawMode(false);
    mapRef.current?.getMap().flyTo({
        center: [5.2913, 52.1326],
        zoom: 7,
        duration: 1000
    });
  };
  
  const handleGemeenteSelect = (gemeenteFeature: Feature) => {
    if (drawRef.current && mapRef.current) {
      drawRef.current.deleteAll();
      setDrawnFeatures([gemeenteFeature]);
      setSelectedTypes(Object.keys(allRoadTypes));

      const world = turf.polygon([[
        [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
      ]]);
      
      const mask = turf.difference(world, gemeenteFeature as Feature<Polygon | MultiPolygon>);
      setMaskPolygon(mask);
      
      const bbox = turf.bbox(gemeenteFeature);
      if (bbox[0] !== Infinity) {
        mapRef.current.getMap().fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
      }
    }
    setIsGemeenteDialogOpen(false);
  };
  
  const updateHighlightedRoads = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !maskPolygon || drawnFeatures.length === 0) {
      setHighlightedRoads(null);
      return;
    }

    const polygonFeature = drawnFeatures[0];
    if (!polygonFeature || !['Polygon', 'MultiPolygon'].includes(polygonFeature.geometry.type)) {
      setHighlightedRoads(null);
      return;
    }

    const roadsInside = map.querySourceFeatures('composite', {
      sourceLayer: 'road',
    });

    const clippedRoads = turf.featureCollection(
      roadsInside.map(road => {
        try {
          return turf.intersect(road.geometry, polygonFeature.geometry);
        } catch (e) {
          return null; // turf.intersect can throw error on invalid topologies
        }
      }).filter(Boolean) as Feature[]
    );
  
    setHighlightedRoads(clippedRoads);

  }, [drawnFeatures, maskPolygon]);

  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      const handleData = (e: any) => {
        if (e.sourceId === 'composite' && e.isSourceLoaded) {
          updateHighlightedRoads();
        }
      }
      map.on('sourcedata', handleData);

      return () => {
        map.off('sourcedata', handleData);
      }
    }
  }, [updateHighlightedRoads]);

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
        <Button onClick={startDrawing} disabled={isDrawMode}>
          <Edit className="mr-2 h-4 w-4" /> Gebied tekenen
        </Button>
        <Button
          onClick={clearDrawing}
          variant="destructive"
          disabled={drawnFeatures.length === 0 && !isDrawMode && !maskPolygon}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Huidige selectie wissen
        </Button>
      </div>

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={onMapLoad}
      >
        <Layer
          id="gemeente-labels"
          type="symbol"
          source="composite"
          source-layer="place_label"
          filter={['==', 'type', 'city']}
          layout={{
            'text-field': ['get', 'name_nl'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': 12,
          }}
          paint={{
            'text-color': '#333',
            'text-halo-color': '#FFF',
            'text-halo-width': 1,
          }}
        />
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
              'visibility': selectedTypes.includes(type) ? 'visible' : 'none'
            }}
            paint={{
              'line-color': color,
              'line-width': 4,
              'line-opacity': maskPolygon ? 0 : 0.8,
            }}
          />
        ))}
        
        {maskPolygon && (
          <Source id="mask" type="geojson" data={maskPolygon}>
            <Layer
              id="mask-layer"
              type="fill"
              paint={{
                'fill-color': 'rgba(0, 0, 0, 0.5)',
              }}
            />
          </Source>
        )}

        {highlightedRoads && maskPolygon && (
           <Source id="highlighted-roads" type="geojson" data={highlightedRoads}>
              <Layer
                id="highlight-layer"
                type="line"
                filter={['in', ['get', 'class'], ['literal', selectedTypes]]}
                layout={{'line-join': 'round', 'line-cap': 'round'}}
                paint={{
                  'line-color': [
                    'match',
                    ['get', 'class'],
                    ...Object.entries(roadColorMapping).flat(),
                    '#000'
                  ],
                  'line-width': 4,
                  'line-opacity': 0.8
                }}
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
