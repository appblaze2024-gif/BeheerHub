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
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Loader2, BoxSelect, Trash2, Maximize, Minimize, X } from 'lucide-react';
import * as turf from '@turf/turf';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, updateDocumentNonBlocking } from '@/firebase';
import { writeBatch, collection, doc } from 'firebase/firestore';
import type { Object as MapObject } from '@/lib/types';
import { useProfile } from '@/firebase/profile-provider';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const polygonFillLayer: FillLayer = {
    id: 'wijk-polygon-fill',
    type: 'fill',
    paint: {
        'fill-color': '#9333ea', // purple-600
        'fill-opacity': 0.2,
    },
};

const polygonOutlineLayer: LineLayer = {
    id: 'wijk-polygon-outline',
    type: 'line',
    paint: {
        'line-color': '#9333ea', // purple-600
        'line-width': 2,
    },
};

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

export function WijkMapDialog({ open, onOpenChange, wijk, onSave, readOnly = false, allAreas = [], showRoadTypes = false }: WijkMapDialogProps) {
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const allObjectsRef = React.useRef<MapObject[] | null>(null);

  const { profile } = useProfile();
  const [currentMapStyle, setCurrentMapStyle] = React.useState(profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12');
  const [isMaximized, setIsMaximized] = React.useState(false);

  const firestore = useFirestore();
  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: allObjects } = useCollection<MapObject>(objectsCollection);

  React.useEffect(() => {
    allObjectsRef.current = allObjects;
  }, [allObjects]);

  const [selectedObjectIds, setSelectedObjectIds] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  const wijkGeoJSONFeatures = React.useMemo(() => {
    if (!wijk?.subGebieden) return null;
    try {
      const features = JSON.parse(wijk.subGebieden);
      if (Array.isArray(features) && features.length > 0) {
        return features;
      }
    } catch (e) {
      console.error('Invalid GeoJSON for wijk', e);
    }
    return null;
  }, [wijk]);

  React.useEffect(() => {
    if (!mapContainerRef.current) return;
    
    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.getMap().resize();
      }
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.getMap().resize();
        }
      }, 350); 

      return () => clearTimeout(timer);
    }
  }, [isMaximized, open]);


  const cleanup = React.useCallback(() => {
    if (drawRef.current) {
        try {
            const map = mapRef.current.getMap();
            if (map && map.isStyleLoaded()) {
                 map.removeControl(drawRef.current);
            }
        } catch (e) {
            // It's safe to ignore this error.
        }
    }
    drawRef.current = null;
    setSelectedObjectIds([]);
    setIsSaving(false);
  }, []);

  const onMapLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (wijkGeoJSONFeatures) {
        try {
            const featureCollection = turf.featureCollection(wijkGeoJSONFeatures);
            const bbox = turf.bbox(featureCollection);
            if (bbox[0] !== Infinity) {
                map.fitBounds(bbox as [number, number, number, number], { padding: 60, duration: 0 });
            }
        } catch (e) {
            console.error("Error fitting bounds:", e);
        }
    }
    
    if (readOnly) {
      return;
    }
    
    if (drawRef.current) {
        try {
            if (map.isStyleLoaded()) {
                 map.removeControl(drawRef.current);
            }
        } catch (e) {
            // Safe to ignore
        }
    }

    const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
    });

    try {
      if (!map._controls.some((ctrl: any) => ctrl instanceof MapboxDraw)) {
        map.addControl(draw);
      }
    } catch(e) {
        // ignore
    }
    
    drawRef.current = draw;
    
    if (wijkGeoJSONFeatures) {
        draw.add({
            type: 'FeatureCollection',
            features: wijkGeoJSONFeatures,
        });
    }
    
    const handleDrawCreate = (e: { features: turf.Feature[] }) => {
        const selectionPolygon = e.features[0];
        if (!selectionPolygon) return;
        
        const currentObjects = allObjectsRef.current;
        if (!currentObjects) return;

        const newlySelectedIds = currentObjects
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
            } catch (e) {
                // ignore
            }
        }
    };
  }, [readOnly, wijkGeoJSONFeatures]);
  
  const handleObjectAssignment = async (assign: boolean) => {
    if (!firestore || selectedObjectIds.length === 0 || !wijk?.naam) return;
    setIsSaving(true);

    const batch = writeBatch(firestore);
    selectedObjectIds.forEach(objId => {
        const fullObject = allObjects?.find(o => o.id === objId);
        if (fullObject) {
            const docRef = doc(firestore, 'objects', objId);
            const currentWerkgebieden = (fullObject.locatieWerkgebieden || []) as string[];
            let newWerkgebieden;
            if (assign) {
                newWerkgebieden = [...new Set([...currentWerkgebieden, wijk.naam])];
            } else {
                newWerkgebieden = currentWerkgebieden.filter(w => w !== wijk.naam);
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

  const selectedObjects = allObjects?.filter(o => selectedObjectIds.includes(o.id)) || [];
  const canAssign = selectedObjects.some(o => !o.locatieWerkgebieden?.includes(wijk?.naam || ''));
  const canUnassign = selectedObjects.some(o => o.locatieWerkgebieden?.includes(wijk?.naam || ''));

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
      <DialogContent className={cn(
          "flex flex-col p-0 gap-0 transition-all duration-300 ease-in-out",
          isMaximized 
            ? "w-screen h-screen max-w-full top-0 left-0 translate-x-0 translate-y-0 rounded-none" 
            : "w-[80vw] max-w-[80vw] h-[80vh] sm:rounded-lg min-w-[600px] min-h-[480px] resize overflow-auto"
      )}>
        <DialogHeader className={cn("p-6 pb-2", isMaximized && "hidden")}>
          <DialogTitle>Teken gebied voor: {wijk?.naam}</DialogTitle>
          <DialogDescription>
            Zoek een gebied, teken handmatig, of selecteer objecten om toe te wijzen.
          </DialogDescription>
        </DialogHeader>
        <div className="absolute top-4 right-16 z-20 flex items-center gap-2">
            <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => setIsMaximized(!isMaximized)}>
                {isMaximized ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                <span className="sr-only">{isMaximized ? 'Minimaliseren' : 'Maximaliseren'}</span>
            </Button>
            <Dialog.Close asChild>
              <Button variant="secondary" size="icon" className="h-9 w-9">
                  <X className="h-5 w-5" />
                  <span className="sr-only">Sluiten</span>
              </Button>
            </Dialog.Close>
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
            {readOnly && wijkGeoJSONFeatures && (
                <Source id="wijk-polygon-readonly" type="geojson" data={{type: 'FeatureCollection', features: wijkGeoJSONFeatures}}>
                    <Layer {...polygonFillLayer} />
                    <Layer {...polygonOutlineLayer} />
                </Source>
            )}
            {allObjects?.map(obj => {
              const isInCurrentArea = Array.isArray(obj.locatieWerkgebieden) && obj.locatieWerkgebieden.includes(wijk?.naam || '');
              const isSelected = selectedObjectIds.includes(obj.id);
              
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
                          isSelected ? 'bg-yellow-400 ring-2 ring-yellow-500 scale-150' 
                                     : (isInCurrentArea ? 'bg-purple-600' : 'bg-gray-400'),
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
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Wijs toe aan ${wijk?.naam}`}
                    </Button>
                )}
                 {canUnassign && (
                    <Button variant="destructive" onClick={() => handleObjectAssignment(false)} disabled={isSaving} size="sm">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Verwijder van ${wijk?.naam}`}
                    </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setSelectedObjectIds([]); drawRef.current?.deleteAll(); }}>Annuleren</Button>
            </div>
          )}
        </div>
        <DialogFooter className={cn("p-6 pt-4 border-t", isMaximized && "hidden")}>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
                Sluiten
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
