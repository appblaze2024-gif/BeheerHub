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

  const handleExport = () => {
    if (selectedWijken.length === 0 || !objects) return;

    let objectsToExport: MapObject[] = [];
    
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
    
    if (objectsToExport.length === 0) {
        alert('Geen objecten gevonden in de geselecteerde wijken.');
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
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Objecten Exporteren (XLSX)</DialogTitle>
          <DialogDescription>
            Selecteer de wijken waarvan u de objecten wilt exporteren.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
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
                    checked={selectedWijken.some(w => w.id === wijk.id)}
                    onCheckedChange={(checked) => handleWijkSelection(wijk, !!checked)}
                  />
                  <Label htmlFor={`wijk-${wijk.id}`} className="font-normal">
                    {wijk.naam}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={handleExport} disabled={selectedWijken.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exporteren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
