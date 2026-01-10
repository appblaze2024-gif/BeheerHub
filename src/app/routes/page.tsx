'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Button } from '@/components/ui/button';
import { Filter, Loader2, Trash2 } from 'lucide-react';
import * as turf from '@turf/turf';
import { RoadTypeFilterDialog, allRoadTypes } from '@/components/road-type-filter-dialog';
import type { Feature, FeatureCollection, LineString } from 'geojson';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const drawRef = React.useRef<MapboxDraw | null>(null);
  
  const [isLoading, setIsLoading] = React.useState(false);
  const [polygon, setPolygon] = React.useState<Feature | null>(null);
  const [allRoadsInPolygon, setAllRoadsInPolygon] = React.useState<Feature<LineString>[]>([]);
  const [availableRoadTypes, setAvailableRoadTypes] = React.useState<string[]>([]);
  const [selectedRoadTypes, setSelectedRoadTypes] = React.useState<string[]>([]);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = React.useState(false);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const processRoadsInPolygon = React.useCallback((polygonFeature: Feature) => {
    const map = mapRef.current?.getMap();
    if (!map || !polygonFeature) return;

    setIsLoading(true);

    // Fit map to the polygon bounds
    const bbox = turf.bbox(polygonFeature);
    map.fitBounds(bbox as [number, number, number, number], {
      padding: 40,
      duration: 1000,
    });

    // Wait for the map to be fully loaded and idle after moving
    const onIdle = () => {
      const allFeatures = map.querySourceFeatures('composite', {
        sourceLayer: 'road',
      });
      
      const intersectingRoads: Feature<LineString>[] = [];
      const roadTypes = new Set<string>();
      
      for (const roadFeature of allFeatures) {
        if (roadFeature.geometry.type !== 'LineString' && roadFeature.geometry.type !== 'MultiLineString') continue;

        try {
          // Check if any part of the road intersects with the polygon
          if (turf.booleanIntersects(roadFeature, polygonFeature)) {
            const clippedRoads = turf.intersect(polygonFeature, roadFeature);
            if (clippedRoads) {
              
              if (clippedRoads.geometry.type === 'LineString') {
                 intersectingRoads.push(clippedRoads as Feature<LineString>);
              } else if (clippedRoads.geometry.type === 'MultiLineString') {
                  clippedRoads.geometry.coordinates.forEach(coords => {
                      intersectingRoads.push(turf.lineString(coords, clippedRoads.properties));
                  });
              }
              
              if (roadFeature.properties?.class) {
                roadTypes.add(roadFeature.properties.class);
              }
            }
          }
        } catch (e) {
          console.warn('Error processing road feature:', e);
        }
      }
      
      setAllRoadsInPolygon(intersectingRoads);
      const typesArray = Array.from(roadTypes);
      setAvailableRoadTypes(typesArray);
      setSelectedRoadTypes(typesArray); // Select all by default
      setIsLoading(false);
      
      if (typesArray.length > 0) {
        setIsFilterDialogOpen(true);
      }
      
      // Clean up listener
      map.off('idle', onIdle);
    };

    map.on('idle', onIdle);

  }, []);
  
  const onMapLoad = () => {
    const map = mapRef.current?.getMap();
    if (!map || drawRef.current) return;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
    });

    drawRef.current = draw;
    map.addControl(draw, 'top-left');

    const handleDrawUpdate = (e: { features: any[] }) => {
      if (e.features.length > 0) {
        const newPolygon = e.features[0];
        setPolygon(newPolygon);
        processRoadsInPolygon(newPolygon);
      }
    };
    
    const handleDrawCreate = (e: { features: any[] }) => {
        if (e.features.length > 0) {
          const newPolygon = e.features[0];
          setPolygon(newPolygon);
          // Delete other polygons if they exist
          const all = draw.getAll();
          const otherFeatures = all.features.filter(f => f.id !== newPolygon.id);
          if (otherFeatures.length > 0) {
              draw.delete(otherFeatures.map(f => f.id));
          }
          processRoadsInPolygon(newPolygon);
        }
    }

    const handleDrawDelete = () => {
      setPolygon(null);
      setAllRoadsInPolygon([]);
      setAvailableRoadTypes([]);
      setSelectedRoadTypes([]);
    };
    
    map.on('draw.create', handleDrawCreate);
    map.on('draw.update', handleDrawUpdate);
    map.on('draw.delete', handleDrawDelete);
  };
  
  const filteredRoadsGeoJSON: FeatureCollection<LineString> = React.useMemo(() => {
    const features = allRoadsInPolygon.filter(road => 
        road.properties && selectedRoadTypes.includes(road.properties.class)
    );
    return {
      type: 'FeatureCollection',
      features: features,
    };
  }, [allRoadsInPolygon, selectedRoadTypes]);

  const clearSelection = () => {
    if (drawRef.current) {
        drawRef.current.deleteAll();
        setPolygon(null);
        setAllRoadsInPolygon([]);
        setAvailableRoadTypes([]);
        setSelectedRoadTypes([]);
    }
  }


  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {polygon && (
          <div className="flex gap-2">
            <Button onClick={() => setIsFilterDialogOpen(true)} variant="secondary" size="lg" disabled={isLoading}>
               {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Filter className="mr-2 h-5 w-5" />}
              Filter Wegtypes
            </Button>
            <Button onClick={clearSelection} variant="destructive" size="lg" aria-label="Verwijder selectie">
                <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={onMapLoad}
      >
        <Source id="selected-roads-data" type="geojson" data={filteredRoadsGeoJSON}>
            <Layer
              id="selected-roads-line"
              type="line"
              source="selected-roads-data"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': '#3b82f6', // blue-500
                'line-width': 4,
                'line-opacity': 0.8,
              }}
            />
        </Source>
      </Map>

      <RoadTypeFilterDialog
        open={isFilterDialogOpen}
        onOpenChange={setIsFilterDialogOpen}
        availableTypes={availableRoadTypes}
        selectedTypes={selectedRoadTypes}
        onSelectedTypesChange={setSelectedRoadTypes}
       />
    </div>
  );
}
