
'use client';

import * as React from 'react';
import MapGL, { Popup, Marker } from 'react-map-gl';
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
import { useProfile } from '@/firebase/profile-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import type { Object as MapObject } from '@/lib/types';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const mapStyles = [
    { name: 'Standaard', url: 'mapbox://styles/mapbox/streets-v12' },
    { name: 'Buiten', url: 'mapbox://styles/mapbox/outdoors-v12' },
    { name: 'Licht', url: 'mapbox://styles/mapbox/light-v11' },
    { name: 'Donker', url: 'mapbox://styles/mapbox/dark-v11' },
    { name: 'Satelliet', url: 'mapbox://styles/mapbox/satellite-v9' },
    { name: 'Satelliet met straten', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { name: 'Navigatie (dag)', url: 'mapbox://styles/mapbox/navigation-day-v1' },
    { name: 'Navigatie (nacht)', url: 'mapbox://styles/mapbox/navigation-night-v1' },
];

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
  onSave: (wijkId: string, coordinates: string, roadTypes?: string[]) => Promise<void>;
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

const roadTypeTranslations: { [key: string]: string } = {
    busway: 'Busbaan',
    living_street: 'Woonerf',
    motorway: 'Snelweg',
    motorway_link: 'Verbindingsweg (snelweg)',
    primary: 'Primaire weg',
    primary_link: 'Verbindingsweg (primair)',
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
    pedestrian: 'Voetgangersgebied',
    track: 'Veldweg',
    steps: 'Trappen',
    bridleway: 'Ruiterpad',
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
  const [editingFeatureId, setEditingFeatureId] = React.useState<string | null>(null);
  const [referenceAreaIds, setReferenceAreaIds] = React.useState<string[]>([]);
  
  const [isFetchingRoads, setIsFetchingRoads] = React.useState(false);
  const [availableRoads, setAvailableRoads] = React.useState<string[]>([]);
  const [selectedRoads, setSelectedRoads] = React.useState<string[]>([]);
  const [allRoadFeatures, setAllRoadFeatures] = React.useState<turf.Feature<turf.LineString>[]>([]);
  
  const { profile } = useProfile();
  const [currentMapStyle, setCurrentMapStyle] = React.useState(profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12');

  const firestore = useFirestore();
  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: allObjects } = useCollection<MapObject>(objectsCollection);

  const isFillModeRef = React.useRef(isFillMode);
  isFillModeRef.current = isFillMode;
  const editingFeatureIdRef = React.useRef(editingFeatureId);
  editingFeatureIdRef.current = editingFeatureId;
  const referenceAreaIdsRef = React.useRef(referenceAreaIds);
  referenceAreaIdsRef.current = referenceAreaIds;
  
  const initialFeaturesRef = React.useRef<any[]>([]);

  // State for object selection
  const [selectedObjectIds, setSelectedObjectIds] = React.useState<string[]>([]);
  const [isSavingMove, setIsSavingMove] = React.useState(false);
  const [isDrawSelectMode, setIsDrawSelectMode] = React.useState(false);


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
    if (open) {
        setCurrentMapStyle(profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12');
        if (wijk && showRoadTypes) {
            setSelectedRoads(wijk.roadTypes || []);
        } else {
            setSelectedRoads([]);
        }
    }
  }, [open, wijk, showRoadTypes, profile?.schouwenMapStyle]);

  const fetchRoadsForPolygon = React.useCallback(async (polygon: turf.Feature<turf.Polygon | turf.MultiPolygon>): Promise<turf.Feature<turf.LineString>[]> => {
    const roadTypesQuery = (wijk?.roadTypes && wijk.roadTypes.length > 0) 
      ? wijk.roadTypes.join('|')
      : 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|track|road|footway|cycleway|path|steps|bridleway';

    const buildWayQueries = (geometry: turf.Polygon | turf.MultiPolygon, roadTypes: string): string => {
        if (geometry.type === 'Polygon') {
            const polyCoords = geometry.coordinates[0].map(p => `${p[1]} ${p[0]}`).join(' ');
            return `way["highway"~"${roadTypes}"](poly:"${polyCoords}");`;
        }
        if (geometry.type === 'MultiPolygon') {
            return geometry.coordinates.map(polygonCoords => {
                const polyCoords = polygonCoords[0].map(p => `${p[1]} ${p[0]}`).join(' ');
                return `way["highway"~"${roadTypes}"](poly:"${polyCoords}");`;
            }).join('\n');
        }
        return '';
    };

    const wayQueries = buildWayQueries(polygon.geometry, roadTypesQuery);
    if (!wayQueries) {
      console.error("Invalid polygon geometry, cannot build Overpass query.");
      return [];
    }

    const overpassQuery = `
        [out:json][timeout:90];
        (
            ${wayQueries}
        );
        (._;>;);
        out geom;
    `;

    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    
    try {
        const response = await fetch(overpassUrl, {
            method: 'POST',
            body: `data=${encodeURIComponent(overpassQuery)}`,
        });

        const responseText = await response.text();
        
        if (!response.ok || responseText.trim().startsWith('<?xml')) {
            return [];
        }
        
        const data = JSON.parse(responseText);
        
        return turf.featureCollection(data.elements
            .filter((el: any) => el.type === 'way' && el.geometry)
            .map((el: any) => turf.lineString(el.geometry.map((node: any) => [node.lon, node.lat]), { ...el.tags, id: el.id }))
        ).features;

    } catch (error) {
        return [];
    }
  }, [wijk]);

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

    const relevantRoadTypes = [
      'busway', 'living_street', 'motorway', 'motorway_link', 'primary', 'primary_link',
      'residential', 'secondary', 'secondary_link', 'service', 'services', 'tertiary',
      'tertiary_link', 'trunk', 'trunk_link', 'unclassified', 'road', 'footway', 'cycleway', 'path', 'pedestrian',
      'track', 'steps', 'bridleway'
    ];
    
    const filteredRoads = Array.from(allRoadTypes).filter(type => relevantRoadTypes.includes(type));

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
    setEditingFeatureId(null);
    setReferenceAreaIds([]);
    setAvailableRoads([]);
    setSelectedRoads([]);
    setAllRoadFeatures([]);
    setSelectedObjectIds([]);
    setIsSavingMove(false);
    setIsDrawSelectMode(false);
  }, []);

  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current && !readOnly) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: false,
          trash: false,
        },
        styles: [
            { 'id': 'gl-draw-polygon-fill-inactive', 'type': 'fill', 'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], 'paint': { 'fill-color': '#000000', 'fill-outline-color': '#000000', 'fill-opacity': 0.3 } },
            { 'id': 'gl-draw-polygon-stroke-inactive', 'type': 'line', 'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], 'layout': { 'line-cap': 'round', 'line-join': 'round' }, 'paint': { 'line-color': '#000000', 'line-width': 2 } },
            { 'id': 'gl-draw-polygon-fill-active', 'type': 'fill', 'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], 'paint': { 'fill-color': '#ef4444', 'fill-outline-color': '#ef4444', 'fill-opacity': 0.1 } },
            { 'id': 'gl-draw-polygon-stroke-active', 'type': 'line', 'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], 'layout': { 'line-cap': 'round', 'line-join': 'round' }, 'paint': { 'line-color': '#ef4444', 'line-dasharray': [0.2, 2], 'line-width': 2 } },
            { 'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive', 'type': 'circle', 'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']], 'paint': { 'circle-radius': 5, 'circle-color': '#fff' } },
            { 'id': 'gl-draw-polygon-and-line-vertex-inactive', 'type': 'circle', 'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']], 'paint': { 'circle-radius': 3, 'circle-color': '#ef4444' } },
            { 'id': 'gl-draw-point-point-stroke-inactive', 'type': 'circle', 'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']], 'paint': { 'circle-radius': 5, 'circle-opacity': 1, 'circle-color': '#fff' } },
            { 'id': 'gl-draw-point-inactive', 'type': 'circle', 'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']], 'paint': { 'circle-radius': 3, 'circle-color': '#ef4444' } },
            { 'id': 'gl-draw-point-stroke-active', 'type': 'circle', 'filter': ['all', ['==', '$type', 'Point'], ['==', 'active', 'true'], ['!=', 'mode', 'static']], 'paint': { 'circle-radius': 7, 'circle-color': '#fff' } },
            { 'id': 'gl-draw-point-active', 'type': 'circle', 'filter': ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['==', 'active', 'true']], 'paint': { 'circle-radius': 5, 'circle-color': '#ef4444' } },
            { 'id': 'gl-draw-polygon-midpoint', 'type': 'circle', 'filter': ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], 'paint': { 'circle-radius': 3, 'circle-color': '#ef4444' } }
        ]
      });

      map.addControl(draw);
      drawRef.current = draw;
      setIsDrawReady(true);
      
      const onDrawAction = (e: { features: turf.Feature[], type: string }) => {
        const drawInstance = drawRef.current;
        if (!drawInstance) return;

        if (e.type === 'draw.create') {
            if (isDrawSelectMode) {
                 const selectionPolygon = e.features[0];
                 drawInstance.delete(selectionPolygon.id as string); // Remove the drawn polygon
        
                const newlySelectedIds = (allObjects || [])
                    .filter(obj => {
                        if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
                        const pt = turf.point([obj.longitude, obj.latitude]);
                        return turf.booleanPointInPolygon(pt, selectionPolygon as any);
                    })
                    .map(obj => obj.id);

                setSelectedObjectIds(prev => [...new Set([...prev, ...newlySelectedIds])]);
                setIsDrawSelectMode(false); // Exit draw mode after selection
                drawInstance.changeMode('simple_select');
                return;
            }

            if (isFillModeRef.current) {
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
      
      const geojsonFeatures = wijk?.subGebieden ? JSON.parse(wijk.subGebieden) : [];
      if (geojsonFeatures && geojsonFeatures.length > 0) {
        initialFeaturesRef.current = geojsonFeatures;
        draw.add({ type: 'FeatureCollection', features: geojsonFeatures } as any);
        fetchAllRoadsForCurrentDrawState();

        const bbox = turf.bbox({ type: 'FeatureCollection', features: geojsonFeatures });
        if (bbox[0] !== Infinity) {
          map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
        }
      }
    }
  }, [open, readOnly, allAreas, allObjects, fetchAllRoadsForCurrentDrawState, wijk?.subGebieden, isDrawSelectMode]);
  
  const handleMapClick = React.useCallback(async (event: MapLayerMouseEvent) => {
    if (readOnly) return;
    if (event.features?.some(f => f.layer.id.startsWith('gl-draw'))) {
        return;
    }
  }, [readOnly]);
  
  const handleSave = async () => {
    if (drawRef.current && wijk) {
      const data = drawRef.current.getAll();
      await onSave(wijk.id, JSON.stringify(data.features), selectedRoads);
      onOpenChange(false);
    }
  };
  
  const handleDeletePolygon = () => {
    const draw = drawRef.current;
    if (!draw) return;
    const selectedIds = draw.getSelectedIds();
    if (selectedIds.length > 0) {
      draw.delete(selectedIds);
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
  
  const handleSetDefaultRoads = (type: 'veeg' | 'borstel') => {
      if (type === 'veeg') {
          setSelectedRoads(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']);
      } else { // borstel
          setSelectedRoads(['footway', 'cycleway', 'path', 'pedestrian', 'living_street', 'residential', 'service']);
      }
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
  
  const toggleDrawSelectMode = () => {
    const draw = drawRef.current;
    if (!draw) return;

    const newMode = !isDrawSelectMode;
    setIsDrawSelectMode(newMode);
    if (newMode) {
        draw.changeMode('draw_polygon');
    } else {
        draw.changeMode('simple_select');
    }
  };

  const handleAssignObjects = async () => {
    if (!firestore || selectedObjectIds.length === 0 || !wijk?.naam) return;
    setIsSavingMove(true);

    const batch = writeBatch(firestore);
    selectedObjectIds.forEach(objId => {
        const fullObject = allObjects?.find(o => o.id === objId);
        if (fullObject) {
            const docRef = doc(firestore, 'objects', objId);
            const currentWerkgebieden = (fullObject.locatieWerkgebieden || []) as string[];
            const newWerkgebieden = [...new Set([...currentWerkgebieden, wijk.naam])];
            batch.update(docRef, { locatieWerkgebieden: newWerkgebieden });
        }
    });

    try {
        await batch.commit();
    } catch (error) {
        console.error("Error assigning objects:", error);
    } finally {
        setSelectedObjectIds([]);
        setIsSavingMove(false);
    }
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
          <DialogTitle>{readOnly ? `Gebied: ${wijk?.naam}` : `Teken gebied voor: ${wijk?.naam}`}</DialogTitle>
          {!readOnly && (
            <DialogDescription>
              Zoek een gebied, teken handmatig, of selecteer objecten om toe te wijzen.
            </DialogDescription>
          )}
        </DialogHeader>

        {!readOnly && (
            <div className="px-6 pb-4 flex flex-col gap-4">
               <div className='flex items-center gap-2 flex-wrap'>
                  <Button 
                    variant={isDrawSelectMode ? 'secondary' : 'outline'}
                    onClick={toggleDrawSelectMode}
                    disabled={!isDrawReady}
                  >
                      <BoxSelect className="mr-2 h-4 w-4"/>
                      Selecteer met vlak
                  </Button>
               </div>
            </div>
        )}

        <div className="flex-1 min-h-0 relative">
          <MapGL
            ref={mapRef}
            initialViewState={initialViewState}
            mapStyle={currentMapStyle}
            mapboxAccessToken={MAPBOX_TOKEN}
            onLoad={onMapLoad}
            preserveDrawingBuffer
            onClick={handleMapClick}
            cursor={readOnly ? 'default' : (isDrawSelectMode ? 'crosshair' : 'grab')}
          >
            {allObjects?.map(obj => {
              const isInCurrentArea = Array.isArray(obj.locatieWerkgebieden) && obj.locatieWerkgebieden.includes(wijk?.naam || '');
              const isSelected = selectedObjectIds.includes(obj.id);
              
              return (
                <Marker
                  key={obj.id}
                  longitude={obj.longitude}
                  latitude={obj.latitude}
                  onClick={(e) => {
                    if (!readOnly && !isInCurrentArea) {
                        e.originalEvent.stopPropagation();
                        setSelectedObjectIds(prev => 
                            isSelected ? prev.filter(id => id !== obj.id) : [...prev, obj.id]
                        );
                    }
                  }}
                >
                  <div
                      className={cn(
                          "h-2.5 w-2.5 rounded-full border border-white transition-all",
                          isSelected ? 'bg-yellow-400 ring-2 ring-yellow-500 scale-150' 
                                     : (isInCurrentArea ? 'bg-purple-600' : 'bg-gray-400'),
                          !readOnly && !isInCurrentArea ? 'cursor-pointer' : 'cursor-default'
                      )}
                  />
                </Marker>
              );
            })}
          </MapGL>
          {selectedObjectIds.length > 0 && !readOnly && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-background p-2 rounded-lg shadow-lg flex items-center gap-2">
                <p className="text-sm font-medium">{selectedObjectIds.length} objecten geselecteerd.</p>
                <Button onClick={handleAssignObjects} disabled={isSavingMove} size="sm">
                  {isSavingMove ? <Loader2 className="h-4 w-4 animate-spin" /> : `Wijs toe aan ${wijk?.naam}`}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedObjectIds([])}>Annuleren</Button>
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
                Sluiten
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
