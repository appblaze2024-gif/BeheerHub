'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import type { Wijk } from '@/app/projects/page';
import * as turf from '@turf/turf';
import * as XLSX from 'xlsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MapGL, { Marker } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface MapObject {
    id: string;
    latitude: number;
    longitude: number;
    straatnaam?: string;
    huisnummer?: string;
    postcode?: string;
    [key: string]: any;
}

interface Project {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
}

interface ObjectExportDialogProps {
  children: React.ReactNode;
  objects: MapObject[] | null;
  projects: Project[] | null;
}

export function ObjectExportDialog({
  children,
  objects,
  projects,
}: ObjectExportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedWijken, setSelectedWijken] = React.useState<Wijk[]>([]);
  const [activeTab, setActiveTab] = React.useState('wijken');

  // Map state
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);

  const allWijken = React.useMemo(() => {
    if (!projects) return [];
    return projects.flatMap(p => p.wijken || []).sort((a, b) => a.naam.localeCompare(b.naam));
  }, [projects]);

  const handleWijkSelection = (wijk: Wijk, checked: boolean) => {
    setSelectedWijken(prev => 
      checked ? [...prev, wijk] : prev.filter(w => w.id !== wijk.id)
    );
  };
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedWijken(allWijken);
    } else {
      setSelectedWijken([]);
    }
  };

  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
      });
      map.addControl(draw);
      drawRef.current = draw;
    }
  }, []);

  const handleExport = () => {
    if (!objects) return;

    let objectsToExport: MapObject[] = [];

    if (activeTab === 'wijken') {
      if (selectedWijken.length === 0) {
        alert('Selecteer tenminste één wijk om te exporteren.');
        return;
      }

      if (selectedWijken.length === allWijken.length) {
          objectsToExport = objects;
      } else {
          const selectedWijkPolygons = selectedWijken.flatMap(wijk => {
            try {
              const features = JSON.parse(wijk.subGebieden);
              return Array.isArray(features) ? features : [];
            } catch {
              return [];
            }
          });
          
          if (selectedWijkPolygons.length > 0) {
              objectsToExport = objects.filter(obj => {
                  if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') {
                      return false;
                  }
                  const pt = turf.point([obj.longitude, obj.latitude]);
                  for (const polygon of selectedWijkPolygons) {
                      if (turf.booleanPointInPolygon(pt, polygon)) {
                          return true;
                      }
                  }
                  return false;
              });
          }
      }
    } else if (activeTab === 'kaart') {
      const drawnFeatures = drawRef.current?.getAll().features;
      if (!drawnFeatures || drawnFeatures.length === 0) {
          alert('Teken eerst een gebied op de kaart om te exporteren.');
          return;
      }

      objectsToExport = objects.filter(obj => {
          if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') {
              return false;
          }
          const pt = turf.point([obj.longitude, obj.latitude]);
          for (const feature of drawnFeatures) {
              if (turf.booleanPointInPolygon(pt, feature as any)) {
                  return true;
              }
          }
          return false;
      });
    }
    
    if (objectsToExport.length === 0) {
        alert('Geen objecten gevonden in het geselecteerde gebied.');
        return;
    }

    const dataForSheet = objectsToExport.map(obj => ({
      'ID Nummer': obj.id,
      'Straatnaam': obj.straatnaam || '',
      'Huisnummer': obj.huisnummer || '',
      'Postcode': obj.postcode || '',
      'X-coordinaat': obj.longitude,
      'Y-coordinaat': obj.latitude,
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Objecten");
    
    XLSX.writeFile(workbook, "objecten_export.xlsx");

    setOpen(false);
  };
  
  React.useEffect(() => {
    if (!open) {
      setSelectedWijken([]);
      setActiveTab('wijken');
      if (drawRef.current) {
        try {
          drawRef.current.deleteAll();
        } catch (e) {
          // It's safe to ignore this error.
          // It can happen if the map unmounts before this cleanup effect runs.
        }
      }
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Objecten Exporteren (XLSX)</DialogTitle>
          <DialogDescription>
            Selecteer wijken of teken een gebied op de kaart om objecten te exporteren.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="wijken" className="w-full" onValueChange={(value) => setActiveTab(value)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wijken">Selecteer Wijken</TabsTrigger>
            <TabsTrigger value="kaart">Teken Gebied</TabsTrigger>
          </TabsList>
          <TabsContent value="wijken" className="py-4">
            <div className="flex items-center space-x-2 border-b pb-2 mb-2">
              <Checkbox
                id="select-all"
                onCheckedChange={handleSelectAll}
                checked={allWijken.length > 0 && selectedWijken.length === allWijken.length}
              />
              <Label htmlFor="select-all" className="font-semibold">
                Selecteer alle wijken
              </Label>
            </div>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {allWijken.map(wijk => (
                  <div key={wijk.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`wijk-${wijk.id}`}
                      checked={selectedWijken.some(w => w.id === w.id)}
                      onCheckedChange={(checked) => handleWijkSelection(wijk, !!checked)}
                    />
                    <Label htmlFor={`wijk-${wijk.id}`} className="font-normal">
                      {wijk.naam}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="kaart" className="py-4">
             <div className="h-96 w-full rounded-md border overflow-hidden">
                <MapGL
                    ref={mapRef}
                    initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 7 }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle="mapbox://styles/mapbox/streets-v12"
                    mapboxAccessToken={MAPBOX_TOKEN}
                    onLoad={onMapLoad}
                >
                  {objects?.map(obj => (
                    <Marker
                      key={obj.id}
                      longitude={obj.longitude}
                      latitude={obj.latitude}
                    >
                      <div className="h-2 w-2 rounded-full bg-blue-600" />
                    </Marker>
                  ))}
                </MapGL>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={handleExport} disabled={(activeTab === 'wijken' && selectedWijken.length === 0)}>
            <Download className="mr-2 h-4 w-4" />
            Exporteren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
