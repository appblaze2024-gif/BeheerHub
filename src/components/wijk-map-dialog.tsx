'use client';

import * as React from 'react';
import MapGL, { Marker } from 'react-map-gl';
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
import { Loader2, BoxSelect, Trash2 } from 'lucide-react';
import * as turf from '@turf/turf';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import type { Object as MapObject } from '@/lib/types';
import { useProfile } from '@/firebase/profile-provider';

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
  
  const { profile } = useProfile();
  const [currentMapStyle, setCurrentMapStyle] = React.useState(profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12');

  const firestore = useFirestore();
  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: allObjects } = useCollection<MapObject>(objectsCollection);

  const [selectedObjectIds, setSelectedObjectIds] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

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
    setSelectedObjectIds([]);
    setIsSaving(false);
  }, []);

  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current && !readOnly) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {}, // Controls are handled by our custom buttons
        styles: [
            { 'id': 'gl-draw-polygon-fill-inactive', 'type': 'fill', 'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], 'paint': { 'fill-color': '#3b82f6', 'fill-outline-color': '#3b82f6', 'fill-opacity': 0.1 } },
            { 'id': 'gl-draw-polygon-stroke-inactive', 'type': 'line', 'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], 'layout': { 'line-cap': 'round', 'line-join': 'round' }, 'paint': { 'line-color': '#3b82f6', 'line-width': 2 } },
            { 'id': 'gl-draw-polygon-fill-active', 'type': 'fill', 'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], 'paint': { 'fill-color': '#ef4444', 'fill-outline-color': '#ef4444', 'fill-opacity': 0.1 } },
            { 'id': 'gl-draw-polygon-stroke-active', 'type': 'line', 'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], 'layout': { 'line-cap': 'round', 'line-join': 'round' }, 'paint': { 'line-color': '#ef4444', 'line-dasharray': [0.2, 2], 'line-width': 2 } },
        ]
      });

      map.addControl(draw);
      drawRef.current = draw;
    }
  }, [readOnly]);

    // Effect to handle draw interactions
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    const draw = drawRef.current;

    if (!map || !draw || readOnly) {
      return;
    }

    const handleDrawCreate = (e: { features: turf.Feature[] }) => {
      const selectionPolygon = e.features[0];
      if (!selectionPolygon) return;
      
      const objects = allObjects;
      if (!objects) return;

      const newlySelectedIds = objects
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

    // Cleanup
    return () => {
      if (map.isStyleLoaded()) {
        try {
          map.off('draw.create', handleDrawCreate);
        } catch(e) {
          // ignore error on cleanup
        }
      }
    };
  }, [readOnly, allObjects]);


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
    } catch (error) {
        console.error("Error updating objects:", error);
    } finally {
        setSelectedObjectIds([]);
        if (drawRef.current) {
            drawRef.current.deleteAll();
        }
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
      <DialogContent className="sm:max-w-[80vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Teken gebied voor: {wijk?.naam}</DialogTitle>
          <DialogDescription>
            Zoek een gebied, teken handmatig, of selecteer objecten om toe te wijzen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 relative">
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
                      drawRef.current?.deleteAll();
                      setSelectedObjectIds([]);
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
        <DialogFooter className="p-6 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
                Sluiten
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
