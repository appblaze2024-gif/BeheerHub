'use client';

import * as React from 'react';
import MapGL, { Popup } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Loader2, BoxSelect, Trash2, ChevronDown } from 'lucide-react';
import * as turf from '@turf/turf';
import type { FillLayer, LineLayer, SymbolLayer, MapLayerMouseEvent } from 'react-map-gl';
import { Layer, Source } from 'react-map-gl';
import { cn } from '@/lib/utils';
import { Label } from './ui/label';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Checkbox } from './ui/checkbox';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface AreaLike {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
  roadTypes?: string[];
}

interface WijkMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wijk: AreaLike | null;
  onSave: (wijkId: string, coordinates: string, roadTypes: string[]) => void;
  readOnly?: boolean;
  allAreas?: any[];
  showRoadTypes?: boolean;
}

interface Suggestion {
  place_id: number;
  display_name: string;
  geojson: any;
  lon: string;
  lat: string;
}

interface ClickPopupInfo {
  longitude: number;
  latitude: number;
  name: string;
  isLoading: boolean;
  canDraw: boolean;
}

const polygonFillLayer: FillLayer = {
    id: 'wijk-polygon-fill',
    type: 'fill',
    paint: {
        'fill-color': '#000000',
        'fill-opacity': 0.3
    },
};

const polygonOutlineLayer: LineLayer = {
    id: 'wijk-polygon-outline',
    type: 'line',
    paint: {
        'line-color': '#000000',
        'line-width': 2
    },
};

const referencePolygonFillLayer: FillLayer = {
    id: 'reference-polygon-fill',
    type: 'fill',
    paint: {
        'fill-color': '#fde047', // yellow-300
        'fill-opacity': 0.2,
    },
};

const referencePolygonOutlineLayer: LineLayer = {
    id: 'reference-polygon-outline',
    type: 'line',
    paint: {
        'line-color': '#facc15', // yellow-400
        'line-width': 2,
        'line-dasharray': [2, 2],
    },
};

const selectedRoadsLayerStyle: LineLayer = {
    id: 'selected-roads-layer',
    type: 'line',
    paint: {
        'line-color': '#FF00FF', // Bright magenta
        'line-width': 3,
        'line-opacity': 0.8
    },
  };


const polygonLabelLayer: SymbolLayer = {
  id: 'wijk-polygon-labels',
  type: 'symbol',
  source: 'wijk-polygons',
  layout: {
    'text-field': ['get', 'wijkNaam'],
    'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
    'text-radial-offset': 0.5,
    'text-justify': 'auto',
    'text-size': 14,
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
  },
  paint: {
    'text-color': '#FFFFFF',
    'text-halo-color': 'hsl(0, 0%, 0%)',
    'text-halo-width': 2,
    'text-halo-blur': 1,
  }
};

const roadTypeTranslations: { [key: string]: string } = {
    busway: 'Busbaan',
    living_street: 'Woonerf',
    motorway: 'Snelweg',
    motorway_link: 'Verbindingsweg (snelweg)',
    platform: 'Platform',
    primary: 'Primaire weg',
    primary_link: 'Verbindingsweg (primair)',
    raceway: 'Racebaan',
    residential: 'Woonstraat',
    secondary: 'Secundaire weg',
    secondary_link: 'Verbindingsweg (secundair)',
    service: 'Dienstweg',
    services: 'Dienstwegen',
    tertiary: 'Tertiaire weg',
    tertiary_link: 'Verbindingsweg (tertiair)',
    trunk: 'Hoofdweg',
    trunk_link: 'Verbindingsweg (hoofdweg)',
    unclassified: 'Ongeclassificeerd',
    road: 'Weg',
    footway: 'Voetpad',
    cycleway: 'Fietspad',
    path: 'Pad',
    track: 'Spoor',
    pedestrian: 'Voetgangersgebied',
    steps: 'Trappen',
    corridor: 'Corridor',
    bridleway: 'Ruiterpad',
    proposed: 'Gepland',
    construction: 'In aanbouw'
};

const getTranslatedRoadType = (type: string) => {
    return roadTypeTranslations[type] || type.replace(/_/g, ' ');
};

export function WijkMapDialog({ open, onOpenChange, wijk, onSave, readOnly = false, allAreas = [], showRoadTypes = false }: WijkMapDialogProps) {
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isDrawReady, setIsDrawReady] = React.useState(false);
  const [clickPopupInfo, setClickPopupInfo] = React.useState<ClickPopupInfo | null>(null);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [isFillMode, setIsFillMode] = React.useState(false);
  const [hasVertexSelection, setHasVertexSelection] = React.useState(false);
  const [hasPolygonSelection, setHasPolygonSelection] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [editingFeatureId, setEditingFeatureId] = React.useState<string | null>(null);
  const [referenceAreaIds, setReferenceAreaIds] = React.useState<string[]>([]);
  
  const [isFetchingRoads, setIsFetchingRoads] = React.useState(false);
  const [availableRoads, setAvailableRoads] = React.useState<string[]>([]);
  const [selectedRoads, setSelectedRoads] = React.useState<string[]>([]);
  const [allRoadFeatures, setAllRoadFeatures] = React.useState<turf.Feature<turf.LineString>[]>([]);

  const isFillModeRef = React.useRef(isFillMode);
  isFillModeRef.current = isFillMode;
  const isBulkDeletingRef = React.useRef(isBulkDeleting);
  isBulkDeletingRef.current = isBulkDeleting;
  const editingFeatureIdRef = React.useRef(editingFeatureId);
  editingFeatureIdRef.current = editingFeatureId;
  const referenceAreaIdsRef = React.useRef(referenceAreaIds);
  referenceAreaIdsRef.current = referenceAreaIds;
  
  const initialFeaturesRef = React.useRef<any[]>([]);

  const geojson = React.useMemo(() => {
    if (!wijk?.subGebieden) return null;
    try {
      const features = JSON.parse(wijk.subGebieden);
      return {
        type: 'FeatureCollection',
        features: Array.isArray(features) ? features : [],
      };
    } catch {
      return null;
    }
  }, [wijk?.subGebieden]);
  
  const referenceAreas = React.useMemo(() => {
    if (referenceAreaIds.length === 0) return [];
    return allAreas.filter(a => referenceAreaIds.includes(a.id) && a.type === 'wijk');
  }, [referenceAreaIds, allAreas]);

  const referenceGeojson = React.useMemo(() => {
      if (referenceAreas.length === 0) return null;
      
      const allFeatures = referenceAreas.flatMap(area => {
        if (!area.subGebieden) return [];
        try {
          const features = JSON.parse(area.subGebieden);
          return Array.isArray(features) ? features : [];
        } catch {
          return [];
        }
      });
      
      return {
          type: 'FeatureCollection',
          features: allFeatures,
      };
  }, [referenceAreas]);

  React.useEffect(() => {
    if (open && wijk) {
        if (showRoadTypes) {
            setSelectedRoads(wijk.roadTypes || []);
        } else {
            setSelectedRoads([]);
        }
    }
  }, [open, wijk, showRoadTypes]);

  const fetchRoadsForPolygon = React.useCallback(async (polygon: turf.Feature<turf.Polygon | turf.MultiPolygon>): Promise<turf.Feature<turf.LineString>[]> => {
    const allRoads = new Map<number, turf.Feature<turf.LineString>>();

    // 1. Get bounding box
    const bbox = turf.bbox(polygon);

    // 2. Create grid of points
    const cellSide = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) / 15; // Denser 15x15 grid
    const grid = turf.pointGrid(bbox, cellSide, { units: 'degrees' });

    // 3. Filter points inside polygon
    const pointsInside = grid.features.filter(pt => turf.booleanPointInPolygon(pt, polygon));
    
    if (pointsInside.length === 0 && polygon.geometry.type.includes('Polygon')) {
        const centroid = turf.centroid(polygon);
        pointsInside.push(centroid);
    }

    if (pointsInside.length === 0) {
        return [];
    }

    // Overpass query for multiple points is more efficient
    const overpassUrl = 'https://overpass.kumi.systems/api/interpreter';
    const radius = 250; // Smaller radius since we have more points
    
    const pointsQueryPart = pointsInside.map(point => {
        const [lon, lat] = point.geometry.coordinates;
        return `way(around:${radius},${lat},${lon})["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street|service|pedestrian|track|busway|footway|bridleway|steps|corridor|path|cycleway|raceway|road|services|proposed|construction"];`;
    }).join('');

    const overpassQuery = `[out:json][timeout:30];(${pointsQueryPart});(._;>;);out;`;

    try {
        const response = await fetch(overpassUrl, {
            method: 'POST',
            body: `data=${encodeURIComponent(overpassQuery)}`
        });

        if (!response.ok) {
            console.error(`Error from Overpass API:`, response.status, response.statusText);
            const errorText = await response.text();
            console.error('Overpass API error response:', errorText);
            return [];
        }
        const data = await response.json();

        if (data && data.elements) {
            const nodes = new Map<number, [number, number]>();
            data.elements.forEach((element: any) => {
                if (element.type === 'node') {
                    nodes.set(element.id, [element.lon, element.lat]);
                }
            });

            data.elements.forEach((element: any) => {
                if (element.type === 'way' && element.nodes && element.tags?.highway) {
                    const coordinates = element.nodes.map((nodeId: number) => nodes.get(nodeId)).filter(Boolean) as [number, number][];
                    if (coordinates.length >= 2) {
                        const feature = turf.lineString(coordinates, { highway: element.tags.highway, id: element.id });
                        if (!allRoads.has(element.id)) {
                            allRoads.set(element.id, feature);
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error(`Fetch failed for Overpass API:`, error);
    }
    
    return Array.from(allRoads.values());
  }, []);

  const fetchAllRoadsForCurrentDrawState = React.useCallback(async () => {
    if (readOnly || !showRoadTypes || !drawRef.current) {
        setAllRoadFeatures([]);
        setAvailableRoads([]);
        return;
    }

    setIsFetchingRoads(true);
    const allFoundRoads = new Map<number, turf.Feature<turf.LineString>>();
    const allRoadTypes = new Set<string>();
    const featuresToProcess = drawRef.current.getAll().features;
    
    if (featuresToProcess.length === 0) {
        setAllRoadFeatures([]);
        setAvailableRoads([]);
        setIsFetchingRoads(false);
        return;
    }

    const roadPromises = featuresToProcess
        .filter(feature => feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
        .map(feature => fetchRoadsForPolygon(feature as turf.Feature<turf.Polygon | turf.MultiPolygon>));

    const results = await Promise.all(roadPromises);

    results.forEach(roadFeatures => {
        roadFeatures.forEach(rf => {
            if (rf.properties?.id && !allFoundRoads.has(rf.properties.id)) {
                allFoundRoads.set(rf.properties.id, rf);
            }
            if (rf.properties?.highway) {
                allRoadTypes.add(rf.properties.highway);
            }
        });
    });
    
    setAllRoadFeatures(Array.from(allFoundRoads.values()));

    const filteredRoads = Array.from(allRoadTypes);

    setAvailableRoads(filteredRoads.sort());
    setIsFetchingRoads(false);
  }, [readOnly, showRoadTypes, fetchRoadsForPolygon]);


  const cleanup = React.useCallback(() => {
    if (drawRef.current && mapRef.current?.getMap()?.isStyleLoaded()) {
      try {
         if (mapRef.current.getMap().getControl('mapbox-gl-draw')) {
            mapRef.current.getMap().removeControl(drawRef.current);
         }
      } catch (e) {
        console.warn("Could not remove draw control during cleanup", e);
      }
    }
    drawRef.current = null;
    setIsDrawReady(false);
    setSearchQuery('');
    setSuggestions([]);
    setClickPopupInfo(null);
    initialFeaturesRef.current = [];
    setIsFillMode(false);
    setHasVertexSelection(false);
    setHasPolygonSelection(false);
    setIsBulkDeleting(false);
    setEditingFeatureId(null);
    setReferenceAreaIds([]);
    setAvailableRoads([]);
    setSelectedRoads([]);
    setAllRoadFeatures([]);
  }, []);

  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current && !readOnly) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: readOnly ? {} : {
          polygon: true,
          trash: false,
        },
        styles: [
            // INACTIVE
            {
              'id': 'gl-draw-polygon-fill-inactive',
              'type': 'fill',
              'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
              'paint': {
                'fill-color': '#000000',
                'fill-outline-color': '#000000',
                'fill-opacity': 0.3
              }
            },
            {
              'id': 'gl-draw-polygon-stroke-inactive',
              'type': 'line',
              'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
              'layout': {
                'line-cap': 'round',
                'line-join': 'round'
              },
              'paint': {
                'line-color': '#000000',
                'line-width': 2
              }
            },
            // ACTIVE
            {
              'id': 'gl-draw-polygon-fill-active',
              'type': 'fill',
              'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
              'paint': {
                'fill-color': '#ef4444',
                'fill-outline-color': '#ef4444',
                'fill-opacity': 0.1
              }
            },
            {
              'id': 'gl-draw-polygon-stroke-active',
              'type': 'line',
              'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
              'layout': {
                'line-cap': 'round',
                'line-join': 'round'
              },
              'paint': {
                'line-color': '#ef4444',
                'line-dasharray': [0.2, 2],
                'line-width': 2
              }
            },
            // VERTEX
            {
              'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
              'type': 'circle',
              'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
              'paint': {
                'circle-radius': 5,
                'circle-color': '#fff'
              }
            },
            {
              'id': 'gl-draw-polygon-and-line-vertex-inactive',
              'type': 'circle',
              'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
              'paint': {
                'circle-radius': 3,
                'circle-color': '#ef4444'
              }
            },
            // Point
            {
              'id': 'gl-draw-point-point-stroke-inactive',
              'type': 'circle',
              'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
              'paint': {
                'circle-radius': 5,
                'circle-opacity': 1,
                'circle-color': '#fff'
              }
            },
            {
              'id': 'gl-draw-point-inactive',
              'type': 'circle',
              'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
              'paint': {
                'circle-radius': 3,
                'circle-color': '#ef4444'
              }
            },
            {
              'id': 'gl-draw-point-stroke-active',
              'type': 'circle',
              'filter': ['all', ['==', '$type', 'Point'], ['==', 'active', 'true'], ['!=', 'mode', 'static']],
              'paint': {
                'circle-radius': 7,
                'circle-color': '#fff'
              }
            },
            {
              'id': 'gl-draw-point-active',
              'type': 'circle',
              'filter': ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['==', 'active', 'true']],
              'paint': {
                'circle-radius': 5,
                'circle-color': '#ef4444'
              }
            },
             {
              'id': 'gl-draw-polygon-midpoint',
              'type': 'circle',
              'filter': ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
              'paint': {
                'circle-radius': 3,
                'circle-color': '#ef4444'
              }
            }
        ]
      });

      map.addControl(draw);
      drawRef.current = draw;
      setIsDrawReady(true);
      
      const onDrawAction = (e: { features: turf.Feature[], type: string }) => {
        const drawInstance = drawRef.current;
        if (!drawInstance) return;

        if (e.type === 'draw.create') {
             if (isBulkDeletingRef.current) {
                const editId = editingFeatureIdRef.current;
                if (!editId) return;

                const deletionArea = e.features[0];
                drawInstance.delete(deletionArea.id as string);

                const targetFeature = drawInstance.get(editId);
                if (targetFeature && targetFeature.geometry.type === 'Polygon') {
                    const newCoordinates = targetFeature.geometry.coordinates.map(ring => {
                        const filteredRing = ring.filter(point => !turf.booleanPointInPolygon(point, deletionArea.geometry as any));
                        if (filteredRing.length < 3) return ring;
                        
                        const firstPointStr = JSON.stringify(filteredRing[0]);
                        const lastPointStr = JSON.stringify(filteredRing[filteredRing.length - 1]);
                        if (firstPointStr !== lastPointStr) {
                            filteredRing.push(filteredRing[0]);
                        }
                        if (filteredRing.length < 4) return ring;
                        return filteredRing;
                    });
                    
                    targetFeature.geometry.coordinates = newCoordinates;
                    drawInstance.add(targetFeature as any);
                }
                
                setIsBulkDeleting(false);
                setEditingFeatureId(null);
                drawInstance.changeMode('direct_select', { featureId: editId });
            } else if (isFillModeRef.current) {
                const newBoundary = e.features[0] as turf.Feature<turf.Polygon | turf.MultiPolygon>;
                if (!newBoundary) return;
                drawInstance.delete(newBoundary.id as string);

                const editingPolygons = drawInstance.getAll().features.filter(f => f.geometry.type.includes('Polygon')) as turf.Feature<turf.Polygon | turf.MultiPolygon>[];

                let referencePolygons: turf.Feature<turf.Polygon | turf.MultiPolygon>[] = [];
                const refAreaIds = referenceAreaIdsRef.current;
                const refAreas = allAreas.filter(a => refAreaIds.includes(a.id) && a.type === 'wijk');

                refAreas.forEach(refArea => {
                  if (refArea?.subGebieden) {
                      try {
                          const refFeatures = JSON.parse(refArea.subGebieden);
                          if (Array.isArray(refFeatures)) {
                              referencePolygons.push(...refFeatures.filter(f => f.geometry.type.includes('Polygon')));
                          }
                      } catch (err) { console.error("Could not parse reference area GeoJSON", err); }
                  }
                });

                const allObstacles = [...editingPolygons, ...referencePolygons];
                let filledArea: turf.Feature<turf.Polygon | turf.MultiPolygon> | null = newBoundary;
                
                for (const obstacle of allObstacles) {
                    if (filledArea) {
                        try {
                            if (obstacle?.geometry && turf.booleanIntersects(filledArea, obstacle)) {
                                filledArea = turf.difference(filledArea, obstacle);
                            }
                        } catch (err) {
                            console.error("Error during turf.difference:", err);
                        }
                    }
                }

                if (filledArea?.geometry) {
                  drawInstance.add(filledArea as any);
                }
                setIsFillMode(false);
                drawInstance.changeMode('simple_select');
            }
        }
        
        fetchAllRoadsForCurrentDrawState();
      };
      
      map.on('draw.create', onDrawAction);
      map.on('draw.update', onDrawAction);
      map.on('draw.delete', onDrawAction);
      
      const onSelectionChange = (e: { features: turf.Feature[] }) => {
        if (readOnly) return;
        const drawInstance = drawRef.current;
        if (!drawInstance) return;
        
        const selectedFeatures = e.features;
        const mode = drawInstance.getMode();

        const verticesSelected = mode === 'direct_select' && selectedFeatures.some(
          (f) => f.geometry.type === 'Point' && f.properties?.meta === 'vertex'
        );
        setHasVertexSelection(verticesSelected);

        const polygonSelected = selectedFeatures.length > 0 && selectedFeatures.every(f => f.geometry.type.includes('Polygon'));
        setHasPolygonSelection(polygonSelected);
        
        if (polygonSelected && selectedFeatures.length === 1 && mode === 'simple_select') {
          drawInstance.changeMode('direct_select', { featureId: selectedFeatures[0].id as string });
        }
      };

      map.on('draw.selectionchange', onSelectionChange);
      
      if (geojson && geojson.features.length > 0) {
        initialFeaturesRef.current = geojson.features; // Store initial features
        draw.add(geojson as any);
        fetchAllRoadsForCurrentDrawState();

        const bbox = turf.bbox(geojson);
        if (bbox[0] !== Infinity) {
          map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
        }
      }
    } else if (mapRef.current && readOnly) {
       const map = mapRef.current.getMap();
       if (geojson && geojson.features.length > 0) {
           const bbox = turf.bbox(geojson);
           if (bbox[0] !== Infinity) {
               map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
           }
       }
    }
  }, [open, geojson, readOnly, allAreas, fetchAllRoadsForCurrentDrawState]);
  
  const handleMapClick = React.useCallback(async (event: MapLayerMouseEvent) => {
    if (!readOnly) {
      const drawMode = drawRef.current?.getMode();
      if (drawMode !== 'simple_select' || event.features?.some(f => f.layer.id.startsWith('gl-draw'))) {
        return;
      }
    }
    if (readOnly && event.features?.some(f => f.layer.id === 'wijk-polygon-fill')) {
        const wijkFeature = event.features.find(f => f.layer.id === 'wijk-polygon-fill');
        if (wijkFeature?.properties?.wijkNaam) {
            setClickPopupInfo({
                longitude: event.lngLat.lng,
                latitude: event.lngLat.lat,
                name: wijkFeature.properties.wijkNaam,
                isLoading: false,
                canDraw: false,
            });
        }
        return;
    }

    const { lng, lat } = event.lngLat;
    setClickPopupInfo({ longitude: lng, latitude: lat, name: 'Laden...', isLoading: true, canDraw: false });

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`
      );
      const data = await response.json();
      
      let displayName: string;
      let canDraw = false;
      
      const areaName = data.address?.neighbourhood || data.address?.suburb || data.address?.city_district || data.name;

      if (areaName) {
        displayName = areaName;
        canDraw = true;
      } else if (data.display_name) {
        displayName = data.display_name.split(',')[0];
      } else {
        displayName = "Onbekend gebied";
      }

      setClickPopupInfo({ longitude: lng, latitude: lat, name: displayName, isLoading: false, canDraw });
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      setClickPopupInfo({ longitude: lng, latitude: lat, name: "Fout bij ophalen", isLoading: false, canDraw: false });
    }

  }, [readOnly]);


  const handleSave = () => {
    if (drawRef.current && wijk) {
      const data = drawRef.current.getAll();
      onSave(wijk.id, JSON.stringify(data.features), selectedRoads);
      onOpenChange(false);
    }
  };
  
  const handleDeleteSelectedPolygons = () => {
    const draw = drawRef.current;
    if (!draw) return;

    const selectedIds = draw.getSelectedIds();
    const polygonIdsToDelete = selectedIds.filter(id => {
        const feature = draw.get(id);
        return feature && feature.geometry.type.includes('Polygon');
    });

    if (polygonIdsToDelete.length > 0) {
        draw.delete(polygonIdsToDelete);
        setHasPolygonSelection(false);
    }
  };

  const handleSearchQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            query
          )}&format=json&polygon_geojson=1&countrycodes=nl&limit=5`
        );
        const data: Suggestion[] = await response.json();
        setSuggestions(data.filter(s => s.geojson && (s.geojson.type === 'Polygon' || s.geojson.type === 'MultiPolygon')));
      } catch (error) {
        console.error("Fout bij zoeken:", error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setSearchQuery(suggestion.display_name);
    setSuggestions([]);

    if (drawRef.current && (suggestion.geojson.type === 'Polygon' || suggestion.geojson.type === 'MultiPolygon')) {
        const feature = {
            type: 'Feature',
            properties: { name: suggestion.display_name },
            geometry: suggestion.geojson,
        };
        drawRef.current.add(feature as any);
        const [lon, lat] = [parseFloat(suggestion.lon), parseFloat(suggestion.lat)];
        mapRef.current?.getMap().flyTo({ center: [lon, lat], zoom: 13 });
        fetchAllRoadsForCurrentDrawState();
    }
  };
  
  const handleRoadTypeChange = (roadType: string, checked: boolean) => {
    setSelectedRoads(prev => 
        checked ? [...prev, roadType] : prev.filter(r => r !== roadType)
    );
  };

  const toggleFillMode = () => {
    const nextFillMode = !isFillMode;
    setIsFillMode(nextFillMode);
    if (drawRef.current) {
        if (nextFillMode) {
            drawRef.current.changeMode('draw_polygon');
        } else {
            drawRef.current.changeMode('simple_select');
        }
    }
  };
  
  const handleBulkDeleteClick = () => {
    if (!drawRef.current) return;
    const selectedIds = drawRef.current.getSelectedIds();
    if (selectedIds.length !== 1) return;

    const feature = drawRef.current.get(selectedIds[0]);
    if (!feature || !feature.geometry.type.includes('Polygon')) return;

    setEditingFeatureId(selectedIds[0]);
    setIsBulkDeleting(true);
    drawRef.current.changeMode('draw_polygon');
  };
  
  const displayedRoadsGeoJSON = React.useMemo(() => {
    if (selectedRoads.length === 0 || allRoadFeatures.length === 0) {
        return null;
    }
    const filteredFeatures = allRoadFeatures.filter(feature => 
        feature.properties?.highway && selectedRoads.includes(feature.properties.highway)
    );
    return turf.featureCollection(filteredFeatures);
  }, [selectedRoads, allRoadFeatures]);

  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

   React.useEffect(() => {
    if (!open) {
      cleanup();
    }
  }, [open, cleanup]);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{readOnly ? wijk?.naam : `Teken gebied voor wijk: ${wijk?.naam}`}</DialogTitle>
          {!readOnly && (
            <DialogDescription>
              Zoek een gebied op naam, teken handmatig, of klik op de kaart om een gebied te identificeren en de grenzen te tekenen.
            </DialogDescription>
          )}
        </DialogHeader>

        {!readOnly && (
            <div className="px-6 pb-4 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4 justify-between md:items-end">
                  <div className="flex flex-col sm:flex-row gap-4 flex-1">
                      <div className="flex-1 min-w-0">
                          <Label htmlFor="search-input" className="text-xs font-semibold">Zoek gebied op naam</Label>
                          <div className='relative mt-1'>
                              <Input
                                  id="search-input"
                                  type="text"
                                  placeholder="Plaatsnaam, wijk of buurt..."
                                  value={searchQuery}
                                  onChange={handleSearchQueryChange}
                                  disabled={!isDrawReady}
                              />
                              {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                              {suggestions.length > 0 && (
                                  <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                      {suggestions.map((suggestion) => (
                                      <div
                                          key={suggestion.place_id}
                                          onClick={() => handleSuggestionClick(suggestion)}
                                          className="px-4 py-2 text-sm cursor-pointer hover:bg-muted"
                                      >
                                          {suggestion.display_name}
                                      </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      </div>
                       <div className="flex-1 min-w-0">
                          <Label className="text-xs font-semibold">Referentiegebied (voor opvullen)</Label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full justify-between mt-1">
                                <span>
                                  {referenceAreaIds.length === 0
                                    ? 'Selecteer gebieden...'
                                    : referenceAreaIds.length === 1
                                    ? '1 gebied geselecteerd'
                                    : `${referenceAreaIds.length} gebieden geselecteerd`}
                                </span>
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                              <DropdownMenuLabel>Selecteer referentiegebieden</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {allAreas.filter(a => a.id !== wijk?.id && a.type === 'wijk').map(a => (
                                <DropdownMenuCheckboxItem
                                  key={a.id}
                                  checked={referenceAreaIds.includes(a.id)}
                                  onCheckedChange={(checked) => {
                                    setReferenceAreaIds(prev => 
                                      checked ? [...prev, a.id] : prev.filter(id => id !== a.id)
                                    );
                                  }}
                                >
                                  {a.projectName} - {a.naam}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                     <Button 
                        variant={isFillMode ? 'secondary' : 'outline'}
                        onClick={toggleFillMode}
                        disabled={!isDrawReady || isBulkDeleting}
                        title="Vul de vrije ruimte binnen een getekend gebied"
                      >
                          <BoxSelect className="mr-2 h-4 w-4"/>
                          Vul vrije ruimte
                      </Button>
                      <Button
                          variant="outline"
                          onClick={handleBulkDeleteClick}
                          disabled={!hasPolygonSelection || hasVertexSelection || isBulkDeleting}
                          title="Verwijder punten binnen een getekend gebied"
                      >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Verwijder met vlak
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleDeleteSelectedPolygons}
                        disabled={!hasPolygonSelection || hasVertexSelection}
                        title="Verwijder de geselecteerde polygoon"
                      >
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                        Verwijder Polygoon
                      </Button>
                      <Button
                          variant="outline"
                          onClick={() => drawRef.current?.trash()}
                          disabled={!hasVertexSelection}
                          title="Verwijder geselecteerde punten"
                      >
                          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                          Verwijder punt(en)
                      </Button>
                  </div>
              </div>
              {showRoadTypes && !readOnly && (
                <div className="space-y-2">
                    <Label className="text-xs font-semibold">Selecteer wegtypes</Label>
                    {isFetchingRoads ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Wegtypes analyseren...</div>
                    ) : availableRoads.length > 0 ? (
                        <div className="border rounded-md p-2 max-h-32 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {availableRoads.map(roadType => (
                                <div key={roadType} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`road-${roadType}`}
                                        checked={selectedRoads.includes(roadType)}
                                        onCheckedChange={(checked) => handleRoadTypeChange(roadType, !!checked)}
                                    />
                                    <Label htmlFor={`road-${roadType}`} className="font-normal capitalize text-sm">
                                        {getTranslatedRoadType(roadType)}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">Geen wegtypes gevonden voor dit gebied. Teken een polygoon om te beginnen.</div>
                    )}
                </div>
              )}
              {!isDrawReady && <p className='text-xs text-muted-foreground'>Kaart laden...</p>}
            </div>
        )}

        <div className="flex-1 min-h-0">
          <MapGL
            ref={mapRef}
            initialViewState={initialViewState}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            mapboxAccessToken={MAPBOX_TOKEN}
            onLoad={onMapLoad}
            preserveDrawingBuffer
            interactiveLayerIds={readOnly ? ['wijk-polygon-fill'] : []}
            onClick={handleMapClick}
            cursor={readOnly ? 'pointer' : 'grab'}
          >
            {readOnly && geojson && (
              <Source id="wijk-polygons" type="geojson" data={geojson}>
                <Layer {...polygonFillLayer} />
                <Layer {...polygonOutlineLayer} />
                <Layer {...polygonLabelLayer} />
              </Source>
            )}
             {referenceGeojson && !readOnly && (
              <Source id="reference-wijk-polygons" type="geojson" data={referenceGeojson}>
                <Layer {...referencePolygonFillLayer} />
                <Layer {...referencePolygonOutlineLayer} />
              </Source>
            )}
            {displayedRoadsGeoJSON && (
                <Source id="selected-roads" type="geojson" data={displayedRoadsGeoJSON}>
                    <Layer {...selectedRoadsLayerStyle} />
                </Source>
            )}
             {clickPopupInfo && (
                <Popup
                    longitude={clickPopupInfo.longitude}
                    latitude={clickPopupInfo.latitude}
                    onClose={() => setClickPopupInfo(null)}
                    closeOnClick={false}
                    anchor="bottom"
                >
                    <div className='p-1 font-semibold max-w-xs'>
                      {clickPopupInfo.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                          <p>{clickPopupInfo.name}</p>
                           {!readOnly && clickPopupInfo.canDraw && (
                            <Button 
                              size="sm" 
                              className='mt-2 w-full'
                              onClick={() => {
                                handleSuggestionClick({ 
                                  display_name: clickPopupInfo.name, 
                                  lat: clickPopupInfo.latitude.toString(),
                                  lon: clickPopupInfo.longitude.toString(),
                                  geojson: { type: 'Polygon', coordinates: [] } // Dummy geojson
                                } as Suggestion)
                                setClickPopupInfo(null);
                              }}
                            >
                              Teken grenzen
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                </Popup>
            )}
          </MapGL>
        </div>
        <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
                {readOnly ? 'Sluiten' : 'Annuleren'}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave}>Gebieden opslaan</Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
