'use client';

import * as React from 'react';
import MapGL, { Layer, Source, type FillLayer, type LineLayer } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Maximize, Minimize, X, BoxSelect, Trash2, Plus, Loader2 } from 'lucide-react';
import * as turf from '@turf/turf';
import { cn } from '@/lib/utils';
import { useProfile } from '@/firebase/profile-provider';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const roadTypesAvailable = [
    'Autosnelweg', 'Provinciale weg', 'Hoofdweg', 'Lokale weg', 
    'Fietspad', 'Voetpad', 'Woonerf', 'Industrieterrein'
];

interface AreaLike {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
  roadTypes?: string[];
}

interface VeegrouteMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: AreaLike | null;
  onSave: (routeId: string, coordinates: string, roadTypes: string[]) => Promise<void>;
  readOnly?: boolean;
}

export function VeegrouteMapDialog({ open, onOpenChange, route, onSave, readOnly = false }: VeegrouteMapDialogProps) {
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const { profile } = useProfile();
  const [currentMapStyle, setCurrentMapStyle] = React.useState(profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12');
  const [isMaximized, setIsMaximized] = React.useState(false);
  
  const [selectedFeatureId, setSelectedFeatureId] = React.useState<string | null>(null);
  const [activeRoadTypes, setActiveRoadTypes] = React.useState<string[]>([]);

  const routeGeoJSONFeatures = React.useMemo(() => {
    if (!route?.subGebieden) return null;
    try {
      const features = JSON.parse(route.subGebieden);
      if (Array.isArray(features) && features.length > 0) {
        return features;
      }
    } catch (e) {
      console.error('Invalid GeoJSON for route', e);
    }
    return null;
  }, [route]);

  React.useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => { if (mapRef.current) mapRef.current.getMap().resize(); });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);
  
  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => { if (mapRef.current) mapRef.current.getMap().resize(); }, 350); 
      return () => clearTimeout(timer);
    }
  }, [isMaximized, open]);

  const cleanup = React.useCallback(() => {
    if (drawRef.current) {
      try {
        const map = mapRef.current.getMap();
        if (map && map.isStyleLoaded() && map._controls.some((ctrl: any) => ctrl === drawRef.current)) {
          map.removeControl(drawRef.current);
        }
      } catch (e) { /* ignore */ }
    }
    drawRef.current = null;
    setSelectedFeatureId(null);
    setActiveRoadTypes([]);
  }, []);

  const onMapLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (routeGeoJSONFeatures) {
      try {
        const featureCollection = turf.featureCollection(routeGeoJSONFeatures);
        const bbox = turf.bbox(featureCollection);
        if (bbox[0] !== Infinity) {
          map.fitBounds(bbox as [number, number, number, number], { padding: 60, duration: 0 });
        }
      } catch (e) { /* ignore */ }
    }
    
    if (readOnly) return;
    
    if (drawRef.current) {
        try {
            if (map.isStyleLoaded() && map._controls.some((ctrl: any) => ctrl === drawRef.current)) {
                 map.removeControl(drawRef.current);
            }
        } catch (e) { /* ignore */ }
    }

    const draw = new MapboxDraw({ 
        displayControlsDefault: false, 
        controls: { 
            polygon: true, 
            trash: true 
        },
        styles: [
            {
                'id': 'gl-draw-polygon-fill-inactive',
                'type': 'fill',
                'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static'], ['!has', 'user_roadTypes']],
                'paint': {
                    'fill-color': '#3bb2d0',
                    'fill-outline-color': '#3bb2d0',
                    'fill-opacity': 0.1
                }
            },
            {
                'id': 'gl-draw-polygon-fill-active',
                'type': 'fill',
                'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                'paint': {
                    'fill-color': '#fbb03b',
                    'fill-outline-color': '#fbb03b',
                    'fill-opacity': 0.1
                }
            },
            {
                'id': 'gl-draw-polygon-stroke-inactive',
                'type': 'line',
                'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static'], ['!has', 'user_roadTypes']],
                'layout': { 'line-cap': 'round', 'line-join': 'round' },
                'paint': { 'line-color': '#3bb2d0', 'line-width': 2 }
            },
            {
                'id': 'gl-draw-polygon-stroke-active',
                'type': 'line',
                'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                'layout': { 'line-cap': 'round', 'line-join': 'round' },
                'paint': { 'line-color': '#fbb03b', 'line-width': 3 }
            },
            {
                'id': 'gl-draw-polygon-fill-has-types',
                'type': 'fill',
                'filter': ['all', ['==', 'active', 'false'], ['has', 'user_roadTypes']],
                'paint': {
                    'fill-color': '#9333ea',
                    'fill-opacity': 0.4
                }
            },
            {
                'id': 'gl-draw-polygon-stroke-has-types',
                'type': 'line',
                'filter': ['all', ['==', 'active', 'false'], ['has', 'user_roadTypes']],
                'paint': {
                    'line-color': '#9333ea',
                    'line-width': 3
                }
            },
            {
                'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
                'type': 'circle',
                'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
                'paint': { 'circle-radius': 5, 'circle-color': '#fff' }
            },
            {
                'id': 'gl-draw-polygon-and-line-vertex-inactive',
                'type': 'circle',
                'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
                'paint': { 'circle-radius': 3, 'circle-color': '#fbb03b' }
            }
        ]
    });
    
    try {
      if (!map._controls.some((ctrl: any) => ctrl instanceof MapboxDraw)) {
        map.addControl(draw);
      }
    } catch(e) { /* ignore */ }
    
    drawRef.current = draw;
    
    if (routeGeoJSONFeatures) {
      draw.add({ type: 'FeatureCollection', features: routeGeoJSONFeatures });
    }

    const updateSelection = (e: any) => {
        if (e.features.length > 0) {
            const feature = e.features[0];
            setSelectedFeatureId(feature.id);
            setActiveRoadTypes(feature.properties?.roadTypes || []);
        } else {
            setSelectedFeatureId(null);
            setActiveRoadTypes([]);
        }
    };

    map.on('draw.selectionchange', updateSelection);
    map.on('draw.update', updateSelection);

    return () => {
        if (map.isStyleLoaded()) {
            try {
                map.off('draw.selectionchange', updateSelection);
                map.off('draw.update', updateSelection);
            } catch (e) { /* ignore */ }
        }
    };
  }, [readOnly, routeGeoJSONFeatures]);
  
  const handleRoadTypeToggle = (roadType: string) => {
    if (!selectedFeatureId || !drawRef.current || readOnly) return;
    
    const newTypes = activeRoadTypes.includes(roadType)
        ? activeRoadTypes.filter(t => t !== roadType)
        : [...activeRoadTypes, roadType];
        
    setActiveRoadTypes(newTypes);
    if (newTypes.length > 0) {
        drawRef.current.setFeatureProperty(selectedFeatureId, 'roadTypes', newTypes);
    } else {
        drawRef.current.setFeatureProperty(selectedFeatureId, 'roadTypes', undefined);
    }
  };

  const handleSaveArea = async () => {
    if (readOnly || !route || !drawRef.current) return;
    const data = drawRef.current.getAll();
    
    const allUsedTypes = new Set<string>();
    data.features.forEach((f: any) => {
        if (f.properties?.roadTypes) {
            f.properties.roadTypes.forEach((t: string) => allUsedTypes.add(t));
        }
    });
    
    await onSave(route.id, JSON.stringify(data.features), Array.from(allUsedTypes));
    onOpenChange(false);
  };

  React.useEffect(() => {
    if (!open) cleanup();
  }, [open, cleanup]);

  const initialViewState = { longitude: 5.2913, latitude: 52.1326, zoom: 7 };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
          "flex flex-col p-0 gap-0 transition-all duration-300 ease-in-out",
          isMaximized 
            ? "w-screen h-screen max-w-full top-0 left-0 translate-x-0 translate-y-0 rounded-none" 
            : "w-[85vw] max-w-[85vw] h-[85vh] sm:rounded-3xl min-w-[600px] min-h-[480px] resize overflow-auto border-none shadow-2xl"
      )}>
        <DialogHeader className={cn("p-8 pb-4 shrink-0 bg-slate-900 text-white", isMaximized && "hidden")}>
          <div className="flex items-center gap-4">
            <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
                <BoxSelect className="h-6 w-6 text-white" />
            </div>
            <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight text-white">Vlakken & Wegtypes: {route?.naam}</DialogTitle>
                <DialogDescription className="text-slate-400 font-bold">Teken een vlak en wijs vervolgens per vlak de wegtypes toe.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white border-white/10 backdrop-blur-md" onClick={() => setIsMaximized(!isMaximized)}>
                {isMaximized ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white border-white/10 backdrop-blur-md"><X className="h-5 w-5" /></Button>
            </DialogClose>
        </div>

        <div ref={mapContainerRef} className="flex-1 min-h-0 relative w-full bg-slate-100">
          <MapGL 
            ref={mapRef} 
            initialViewState={initialViewState} 
            mapStyle={currentMapStyle} 
            mapboxAccessToken={MAPBOX_TOKEN} 
            onLoad={onMapLoad} 
            preserveDrawingBuffer 
            cursor={readOnly ? 'default' : 'grab'} 
          />
          
          <div className="absolute top-6 left-6 z-10 w-64 flex flex-col gap-4">
              <div className="bg-white/95 backdrop-blur-md p-5 rounded-3xl shadow-2xl border-2 border-slate-100 space-y-4 animate-in slide-in-from-left-4 duration-500">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <div className="bg-primary/10 p-2 rounded-xl"><BoxSelect className="h-4 w-4 text-primary" /></div>
                    <h3 className="font-black uppercase tracking-tighter text-xs text-slate-900">Wegtypes per vlak</h3>
                </div>
                
                {!selectedFeatureId ? (
                    <div className="py-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed italic">
                            Selecteer een vlak op de kaart om de eigenschappen te bewerken.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase text-primary tracking-widest bg-primary/5 px-2 py-0.5 rounded-full">Vlak actief</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-600" onClick={() => { if(drawRef.current && selectedFeatureId) { drawRef.current.delete(selectedFeatureId); setSelectedFeatureId(null); } }}>
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <div className="grid gap-1.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {roadTypesAvailable.map(roadType => {
                                const isChecked = activeRoadTypes.includes(roadType);
                                return (
                                    <div 
                                        key={roadType} 
                                        className={cn(
                                            "flex items-center space-x-3 p-2.5 rounded-xl transition-all cursor-pointer border-2",
                                            isChecked ? "bg-primary/5 border-primary/20" : "hover:bg-slate-50 border-transparent"
                                        )} 
                                        onClick={() => handleRoadTypeToggle(roadType)}
                                    >
                                        <Checkbox
                                            id={`road-type-${roadType}`}
                                            checked={isChecked}
                                            onCheckedChange={() => handleRoadTypeToggle(roadType)}
                                            disabled={readOnly}
                                            className="rounded-md border-slate-300"
                                        />
                                        <Label htmlFor={`road-type-${roadType}`} className="font-black text-[11px] text-slate-700 cursor-pointer uppercase tracking-tight">{roadType}</Label>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
              </div>

              {!readOnly && (
                  <div className="bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl shadow-xl flex items-center justify-center gap-2 border border-white/10">
                      <Button variant="ghost" size="sm" className="h-9 px-4 font-black uppercase text-[10px] tracking-widest text-white hover:bg-white/10 gap-2" onClick={() => drawRef.current?.changeMode('draw_polygon')}>
                          <Plus className="h-3.5 w-3.5" /> Teken Nieuw Vlak
                      </Button>
                  </div>
              )}
          </div>

          <div className="absolute bottom-6 right-6 z-10 bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-xl border border-slate-100 space-y-3">
              <h3 className="font-black uppercase text-[9px] tracking-widest text-slate-400 mb-1">Legenda</h3>
              <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-primary/30 border-2 border-primary" />
                  <span className="text-[10px] font-bold uppercase text-slate-600">Nieuw Vlak</span>
              </div>
              <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-purple-600/30 border-2 border-purple-600" />
                  <span className="text-[10px] font-bold uppercase text-slate-600">Vlak met wegtypes</span>
              </div>
              <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-orange-400/30 border-2 border-orange-400 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase text-slate-600">Geselecteerd</span>
              </div>
          </div>
        </div>

        <DialogFooter className={cn("p-8 shrink-0 border-t bg-slate-50", isMaximized && "hidden")}>
            <div className="flex justify-between w-full items-center">
                <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-slate-500">Sluiten</Button>
                {!readOnly && (
                    <Button onClick={handleSaveArea} className="font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20 rounded-xl">
                        Configuratie Opslaan
                    </Button>
                )}
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
