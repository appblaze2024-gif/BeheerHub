'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  allRoadTypes,
  roadColorMapping,
} from '@/components/road-type-filter-dialog';
import { Layers, X } from 'lucide-react';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import * as turf from '@turf/turf';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Wijk } from '@/app/projects/page';


const MAPBOX_TOKEN =
  'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
};


export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const firestore = useFirestore();
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  const [showFilter, setShowFilter] = React.useState(true);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);
  const [wijkPolygon, setWijkPolygon] = React.useState<Feature<Polygon | MultiPolygon> | null>(null);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const sortedWijken = React.useMemo(() => {
    if (!selectedProject?.wijken) return [];
    return [...selectedProject.wijken].sort((a, b) => 
      a.naam.localeCompare(b.naam, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [selectedProject?.wijken]);

  React.useEffect(() => {
    const selectedWijk = sortedWijken.find(w => w.id === selectedWijkId);
    if (selectedWijk && selectedWijk.subGebieden) {
      try {
        const features = JSON.parse(selectedWijk.subGebieden);
        if (features && Array.isArray(features) && features.length > 0) {
            // Filter for valid features with geometry before attempting to union
            const validFeatures = features.filter(f => f && f.type === 'Feature' && f.geometry);
            
            if (validFeatures.length > 0) {
                const combined = turf.union(...validFeatures);
                if(combined) {
                    setWijkPolygon(combined);
                    const map = mapRef.current?.getMap();
                    if (map) {
                    const bbox = turf.bbox(combined);
                    map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
                    }
                } else if (validFeatures.length === 1) { // Fallback for single valid feature if union fails
                    setWijkPolygon(validFeatures[0]);
                    const map = mapRef.current?.getMap();
                    if (map) {
                        const bbox = turf.bbox(validFeatures[0]);
                        map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
                    }
                }
            } else {
                setWijkPolygon(null);
            }
        } else {
          setWijkPolygon(null);
        }
      } catch (e) {
        console.error("Invalid GeoJSON in wijk.subGebieden", e);
        setWijkPolygon(null);
      }
    } else {
      setWijkPolygon(null);
    }
  }, [selectedWijkId, sortedWijken]);

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

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const wijkGeoJson = React.useMemo(() => {
    if (!wijkPolygon) return null;
    return {
        type: 'FeatureCollection',
        features: [wijkPolygon]
    };
  }, [wijkPolygon]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 right-4 z-10">
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
                  Veegwagen
                </Button>
              </div>
              <Separator className="mb-4" />
              <fieldset>
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
                              style={{ backgroundColor: roadColorMapping[type] || '#ccc' }}
                            />
                            {name}
                          </Label>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </fieldset>
            </CardContent>
          </Card>
        )}
      </div>

       <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className='flex gap-2 p-2 bg-card rounded-lg shadow-md'>
          <div>
            <Label htmlFor='project-select' className='text-xs font-medium sr-only'>Project</Label>
              <Select
                value={selectedProjectId || ''}
                onValueChange={(value) => {
                  setSelectedProjectId(value);
                  setSelectedWijkId(null);
                  setWijkPolygon(null);
                }}
                disabled={isLoadingProjects}
              >
                <SelectTrigger id="project-select" className="w-[200px]">
                  <SelectValue placeholder="Selecteer een project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>)}
                </SelectContent>
              </Select>
          </div>
          <div>
            <Label htmlFor='wijk-select' className='text-xs font-medium sr-only'>Wijk</Label>
            <Select
                value={selectedWijkId || ''}
                onValueChange={setSelectedWijkId}
                disabled={!selectedProject}
            >
                  <SelectTrigger id="wijk-select" className="w-[200px]">
                    <SelectValue placeholder="Selecteer een wijk" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedWijken.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.naam}
                      </SelectItem>
                    ))}
                  </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={() => setShowFilter(!showFilter)}
          className="w-48 justify-start bg-card text-card-foreground shadow-md"
        >
          <Layers className="mr-2 h-4 w-4" /> Wegtypes
        </Button>
      </div>

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
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

        {wijkGeoJson && (
            <Source id="wijk-polygon-source" type="geojson" data={wijkGeoJson}>
                <Layer
                    id="wijk-polygon-fill"
                    type="fill"
                    paint={{
                        'fill-color': '#000000',
                        'fill-opacity': 0.3
                    }}
                />
                <Layer
                    id="wijk-polygon-outline"
                    type="line"
                    paint={{
                        'line-color': '#000000',
                        'line-width': 2
                    }}
                />
            </Source>
        )}
      </Map>
    </div>
  );
}
