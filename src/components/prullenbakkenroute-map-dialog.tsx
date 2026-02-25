'use client';

import * as React from 'react';
import MapGL, { Marker, Layer, Source, type FillLayer, type LineLayer } from 'react-map-gl';
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
import { Loader2, BoxSelect, Trash2, Maximize, Minimize, X } from 'lucide-react';
import * as turf from '@turf/turf';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, updateDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { writeBatch, collection, doc } from 'firebase/firestore';
import type { Object as MapObject } from '@/lib/types';
import { useProfile } from '@/firebase/profile-provider';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface AreaLike {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
}

interface PrullenbakkenrouteMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: AreaLike | null;
  allPrullenbakkenroutes: AreaLike[];
  onSave: (routeId: string, coordinates: string) => Promise<void>;
  readOnly?: boolean;
}

export function PrullenbakkenrouteMapDialog({ open, onOpenChange, route, allPrullenbakkenroutes, onSave, readOnly = false }: PrullenbakkenrouteMapDialogProps) {
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  
  const { profile } = useProfile();
  const [currentMapStyle, setCurrentMapStyle] = React.useState(profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12');
  const [isMaximized, setIsMaximized] = React.useState(false);

  const firestore = useFirestore();
  const objectsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: allObjects } = useCollection<MapObject>(objectsCollection);

  const [selectedObjectIds, setSelectedObjectIds] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [initialViewState, setInitialViewState] = React.useState({ longitude: 5.2913, latitude: 52.1326, zoom: 7 });

  const routeGeoJSONFeatures = React.useMemo(() => {
    if (!route?.subGebieden) return [];
    try {
      const features = JSON.parse(route.subGebieden);
      return Array.isArray(features) && features.length > 0 ? features : [];
    } catch (e) {
      console.error('Invalid GeoJSON for route', e);
      return [];
    }
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
    setSelectedObjectIds([]);
    setIsSaving(false);
  }, []);
  
  const fitMapToBounds = React.useCallback((map: any) => {
    if (!map) return;
    
    // Priority 1: Drawn area from subGebieden
    if (routeGeoJSONFeatures && routeGeoJSONFeatures.length > 0) {
      try {
        const featureCollection = turf.featureCollection(routeGeoJSONFeatures);
        const bbox = turf.bbox(featureCollection);
        if (bbox[0] !== Infinity) {
          map.fitBounds(bbox as [number, number, number, number], { padding: 60, duration: 0 });
          return;
        }
      } catch (e) { /* ignore */ }
    }
    
    // Priority 2: Objects already in the route
    if (allObjects && route) {
        const objectsInRoute = allObjects.filter(obj => 
            Array.isArray(obj.locatieWerkgebieden) && obj.locatieWerkgebieden.includes(route.naam)
        );
        if (objectsInRoute.length > 0) {
             const points = objectsInRoute.map(obj => turf.point([obj.longitude, obj.latitude]));
             const featureCollection = turf.featureCollection(points);
             try {
                const bbox = turf.bbox(featureCollection);
                if (bbox[0] !== Infinity) {
                    map.fitBounds(bbox as [number, number, number, number], { padding: 60, duration: 0 });
                    return;
                }
             } catch (e) { /* ignore */ }
        }
    }
    
    // Priority 3: All objects
    if (allObjects && allObjects.length > 0) {
       const points = allObjects.map(obj => turf.point([obj.longitude, obj.latitude]));
       const featureCollection = turf.featureCollection(points);
       try {
           const bbox = turf.bbox(featureCollection);
            if (bbox[0] !== Infinity) {
                map.fitBounds(bbox as [number, number, number, number], { padding: 60, duration: 0 });
                return;
            }
       } catch(e) { /* ignore */ }
    }
    
    // Fallback to default
    map.flyTo({ center: [5.2913, 52.1326], zoom: 7 });

  }, [routeGeoJSONFeatures, allObjects, route]);

  const onMapLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    fitMapToBounds(map);
    
    if (readOnly) return;
    
    if (drawRef.current) {
        try {
            if (map.isStyleLoaded() && map._controls.some((ctrl: any) => ctrl === drawRef.current)) {
                 map.removeControl(drawRef.current);
            }
        } catch (e) { /* ignore */ }
    }

    const draw = new MapboxDraw({ displayControlsDefault: false, controls: {} });
    try {
      if (!map._controls.some((ctrl: any) => ctrl instanceof MapboxDraw)) {
        map.addControl(draw);
      }
    } catch(e) { /* ignore */ }
    
    drawRef.current = draw;
        
    const handleDrawCreate = (e: { features: turf.Feature[] }) => {
        const selectionPolygon = e.features[0];
        if (!selectionPolygon || !allObjects) return;
        
        const newlySelectedIds = allObjects
            .filter(obj => {
                if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
                const pt = turf.point([obj.longitude, obj.latitude]);
                return turf.booleanPointInPolygon(pt, selectionPolygon as any);
            })
            .map(obj => obj.id);

        if (newlySelectedIds.length > 0) {
            setSelectedObjectIds(prev => [...new Set([...prev, ...newlySelectedIds])]);
        }
    };

    map.on('draw.create', handleDrawCreate);

    return () => {
        if (map.isStyleLoaded()) {
            try {
                map.off('draw.create', handleDrawCreate);
            } catch (e) { /* ignore */ }
        }
    };
  }, [readOnly, fitMapToBounds, allObjects]);
  
  const handleObjectAssignment = async (assign: boolean) => {
    if (!firestore || selectedObjectIds.length === 0 || !route?.naam) return;
    setIsSaving(true);

    const batch = writeBatch(firestore);
    selectedObjectIds.forEach(objId => {
        const fullObject = allObjects?.find(o => o.id === objId);
        if (fullObject) {
            const docRef = doc(firestore, 'objects', objId);
            const currentWerkgebieden = (fullObject.locatieWerkgebieden || []) as string[];
            let newWerkgebieden;
            if (assign) {
                newWerkgebieden = [...new Set([...currentWerkgebieden, route.naam])];
            } else {
                newWerkgebieden = currentWerkgebieden.filter(w => w !== route.naam);
            }
            batch.update(docRef, { locatieWerkgebieden: newWerkgebieden });
        }
    });

    try {
        await batch.commit();
        if(drawRef.current) {
            drawRef.current.deleteAll();
        }
    } catch (error) {
        console.error("Error updating objects:", error);
    } finally {
        setSelectedObjectIds([]);
        setIsSaving(false);
    }
  };

  const handleSaveArea = async () => {
    if (readOnly || !route || !drawRef.current) return;
    const data = drawRef.current.getAll();
    await onSave(route.id, JSON.stringify(data.features));
    onOpenChange(false);
  }

  const selectedObjects = allObjects?.filter(o => selectedObjectIds.includes(o.id)) || [];
  const canAssign = selectedObjects.some(o => !o.locatieWerkgebieden?.includes(route?.naam || ''));
  const canUnassign = selectedObjects.some(o => o.locatieWerkgebieden?.includes(route?.naam || ''));

  React.useEffect(() => {
    if (!open) {
      cleanup();
    }
  }, [open, cleanup]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
          "flex flex-col p-0 gap-0 transition-all duration-300 ease-in-out",
          isMaximized 
            ? "w-screen h-screen max-w-full top-0 left-0 translate-x-0 translate-y-0 rounded-none" 
            : "w-[80vw] max-w-[80vw] h-[80vh] sm:rounded-lg min-w-[600px] min-h-[480px] resize overflow-auto"
      )}>
        <DialogHeader className={cn("p-6 pb-2", isMaximized && "hidden")}>
          <DialogTitle>Teken gebied voor: {route?.naam}</DialogTitle>
          <DialogDescription>
            Zoek een gebied, teken handmatig, of selecteer objecten om toe te wijzen.
          </DialogDescription>
        </DialogHeader>
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => setIsMaximized(!isMaximized)}>
                {isMaximized ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                <span className="sr-only">{isMaximized ? 'Minimaliseren' : 'Maximaliseren'}</span>
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" size="icon" className="h-9 w-9">
                  <X className="h-5 w-5" />
                  <span className="sr-only">Sluiten</span>
              </Button>
            </DialogClose>
        </div>

        <div ref={mapContainerRef} className="flex-1 min-h-0 relative w-full">
          <MapGL
            ref={mapRef}
            initialViewState={initialViewState}
            mapStyle={currentMapStyle}
            mapboxAccessToken={MAPBOX_TOKEN}
            onLoad={onMapLoad}
            preserveDrawingBuffer
            cursor={readOnly ? 'default' : 'grab'}
          >
            {allObjects?.map(obj => {
              const isInCurrentRoute = Array.isArray(obj.locatieWerkgebieden) && obj.locatieWerkgebieden.includes(route?.naam || '');
              const isSelected = selectedObjectIds.includes(obj.id);
              
              const otherRouteNames = (allPrullenbakkenroutes || [])
                  .filter(r => r.id !== route?.id)
                  .map(r => r.naam);

              const isInAnotherRoute = Array.isArray(obj.locatieWerkgebieden) &&
                  obj.locatieWerkgebieden.some(gebied => otherRouteNames.includes(gebied));
              
              const colorClass = isSelected 
                ? 'bg-yellow-400 ring-2 ring-yellow-500 scale-150' 
                : isInCurrentRoute 
                ? 'bg-purple-600' 
                : isInAnotherRoute 
                ? 'bg-green-500' 
                : 'bg-black';
              
              return (
                <Marker
                  key={obj.id}
                  longitude={obj.longitude}
                  latitude={obj.latitude}
                  onClick={(e) => {
                    if (!readOnly) {
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
                          colorClass,
                          !readOnly && 'cursor-pointer'
                      )}
                  />
                </Marker>
              );
            })}
          </MapGL>
          {!readOnly && (
            <div className="absolute top-4 left-4 z-10 bg-background p-2 rounded-lg shadow-lg flex items-center gap-2">
              <Button
                  variant="outline"
                  size="sm"
                  onClick={() => drawRef.current?.changeMode('draw_polygon')}
              >
                  <BoxSelect className="h-4 w-4 mr-2" />
                  Selecteer met vlak
              </Button>
              <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                      if (drawRef.current) {
                        drawRef.current.deleteAll();
                        setSelectedObjectIds([]);
                      }
                  }}
              >
                  <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
          {selectedObjectIds.length > 0 && !readOnly && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-background p-2 rounded-lg shadow-lg flex items-center gap-2">
                <p className="text-sm font-medium">{selectedObjectIds.length} objecten geselecteerd.</p>
                {canAssign && (
                    <Button onClick={() => handleObjectAssignment(true)} disabled={isSaving} size="sm">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Wijs toe aan ${route?.naam}`}
                    </Button>
                )}
                 {canUnassign && (
                    <Button variant="destructive" onClick={() => handleObjectAssignment(false)} disabled={isSaving} size="sm">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Verwijder van ${route?.naam}`}
                    </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setSelectedObjectIds([]); drawRef.current?.deleteAll(); }}>Annuleren</Button>
            </div>
          )}
           <div className="absolute bottom-4 left-4 z-10 bg-background/80 p-3 rounded-lg shadow-lg space-y-2 backdrop-blur-sm">
              <h3 className="font-semibold text-sm">Legenda</h3>
              <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-purple-600 border border-black/20" />
                  <span className="text-xs">Huidige route</span>
              </div>
              <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500 border border-black/20" />
                  <span className="text-xs">Andere route</span>
              </div>
              <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-black border border-black/20" />
                  <span className="text-xs">Niet toegewezen</span>
              </div>
              <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-yellow-400 ring-1 ring-yellow-500" />
                  <span className="text-xs">Geselecteerd</span>
              </div>
          </div>
        </div>
        <DialogFooter className={cn("p-6 pt-4 border-t", isMaximized && "hidden")}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Sluiten
            </Button>
             {!readOnly && <Button onClick={handleSaveArea}>Gebied Opslaan</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
