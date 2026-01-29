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
import { Maximize, Minimize, X } from 'lucide-react';
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
  const [selectedRoadTypes, setSelectedRoadTypes] = React.useState<string[]>([]);

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
    if (open && route) {
        setSelectedRoadTypes(route.roadTypes || []);
    }
  }, [open, route]);

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

    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
    try {
      if (!map._controls.some((ctrl: any) => ctrl instanceof MapboxDraw)) {
        map.addControl(draw);
      }
    } catch(e) { /* ignore */ }
    
    drawRef.current = draw;
    
    if (routeGeoJSONFeatures) {
      draw.add({ type: 'FeatureCollection', features: routeGeoJSONFeatures });
    }
  }, [readOnly, routeGeoJSONFeatures]);
  
  const handleSaveArea = async () => {
    if (readOnly || !route || !drawRef.current) return;
    const data = drawRef.current.getAll();
    await onSave(route.id, JSON.stringify(data.features), selectedRoadTypes);
    onOpenChange(false);
  };
  
  const handleRoadTypeChange = (roadType: string, checked: boolean) => {
    setSelectedRoadTypes(prev => 
        checked ? [...prev, roadType] : prev.filter(rt => rt !== roadType)
    );
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
            : "w-[80vw] max-w-[80vw] h-[80vh] sm:rounded-lg min-w-[600px] min-h-[480px] resize overflow-auto"
      )}>
        <DialogHeader className={cn("p-6 pb-2", isMaximized && "hidden")}>
          <DialogTitle>Teken gebied voor veegroute: {route?.naam}</DialogTitle>
          <DialogDescription>Teken een polygoon op de kaart om het gebied voor deze veegroute te definiëren.</DialogDescription>
        </DialogHeader>
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => setIsMaximized(!isMaximized)}>
                {isMaximized ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" size="icon" className="h-9 w-9"><X className="h-5 w-5" /></Button>
            </DialogClose>
        </div>

        <div ref={mapContainerRef} className="flex-1 min-h-0 relative w-full">
          <MapGL ref={mapRef} initialViewState={initialViewState} mapStyle={currentMapStyle} mapboxAccessToken={MAPBOX_TOKEN} onLoad={onMapLoad} preserveDrawingBuffer cursor={readOnly ? 'default' : 'grab'} />
          <div className="absolute top-4 left-4 z-10 bg-background p-3 rounded-lg shadow-lg space-y-2">
            <h3 className="font-semibold text-sm">Wegtypes</h3>
            {roadTypesAvailable.map(roadType => (
                <div key={roadType} className="flex items-center space-x-2">
                    <Checkbox
                        id={`road-type-${roadType}`}
                        checked={selectedRoadTypes.includes(roadType)}
                        onCheckedChange={(checked) => handleRoadTypeChange(roadType, !!checked)}
                        disabled={readOnly}
                    />
                    <Label htmlFor={`road-type-${roadType}`} className="font-normal text-sm">{roadType}</Label>
                </div>
            ))}
          </div>
        </div>
        <DialogFooter className={cn("p-6 pt-4 border-t", isMaximized && "hidden")}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Sluiten</Button>
            {!readOnly && <Button onClick={handleSaveArea}>Gebied Opslaan</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
