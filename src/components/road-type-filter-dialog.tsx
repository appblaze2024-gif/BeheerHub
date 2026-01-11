'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from './ui/scroll-area';

// Uitgebreide lijst met Engelse Mapbox-classificaties en hun Nederlandse vertalingen.
export const allRoadTypes: Record<string, string> = {
  motorway: 'Snelweg',
  motorway_link: 'Verbindingsweg Snelweg',
  trunk: 'Autoweg',
  trunk_link: 'Verbindingsweg Autoweg',
  primary: 'N-weg / Grote weg',
  primary_link: 'Verbindingsweg N-weg',
  secondary: 'Secundaire weg',
  secondary_link: 'Verbindingsweg Secundaire weg',
  tertiary: 'Tertiaire weg',
  tertiary_link: 'Verbindingsweg Tertiaire weg',
  street: 'Straat',
  street_limited: 'Straat (beperkt verkeer)',
  pedestrian: 'Voetgangersgebied',
  path: 'Pad',
  track: 'Veldweg / Bospad',
  service: 'Dienstweg',
  ferry: 'Veerboot',
  living_street: 'Woonerf',
  residential: 'Woonstraat',
  road: 'Ongeclassificeerde weg',
  unclassified: 'Ongeclassificeerde weg',
  roundabout: 'Rotonde',
};

export const roadColorMapping: Record<string, string> = {
  // Groep 1: Hoofdwegen (Oranje)
  motorway: 'hsl(27, 87%, 67%)',
  motorway_link: 'hsl(27, 87%, 67%)',
  trunk: 'hsl(27, 87%, 67%)',
  trunk_link: 'hsl(27, 87%, 67%)',

  // Groep 2: Primaire/Secundaire wegen (Geel)
  primary: 'hsl(43, 74%, 66%)',
  primary_link: 'hsl(43, 74%, 66%)',
  secondary: 'hsl(43, 74%, 66%)',
  secondary_link: 'hsl(43, 74%, 66%)',
  
  // Groep 3: Lokale wegen (Blauw)
  tertiary: 'hsl(199, 79%, 55%)',
  tertiary_link: 'hsl(199, 79%, 55%)',
  street: 'hsl(199, 79%, 55%)',
  street_limited: 'hsl(199, 79%, 55%)',
  residential: 'hsl(199, 79%, 55%)',
  living_street: 'hsl(199, 79%, 55%)',
  road: 'hsl(199, 79%, 55%)',
  unclassified: 'hsl(199, 79%, 55%)',
  roundabout: 'hsl(199, 79%, 55%)',

  // Groep 4: Speciale wegen (Groen)
  service: 'hsl(174, 63%, 39%)',
  pedestrian: 'hsl(174, 63%, 39%)',
  path: 'hsl(174, 63%, 39%)',
  track: 'hsl(174, 63%, 39%)',
  ferry: 'hsl(174, 63%, 39%)',
};



interface RoadTypeFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTypes: string[];
  selectedTypes: string[];
  setSelectedTypes: (types: string[]) => void;
  onConfirm: () => void;
}

export function RoadTypeFilterDialog({
  open,
  onOpenChange,
  availableTypes,
  selectedTypes,
  setSelectedTypes,
  onConfirm,
}: RoadTypeFilterDialogProps) {
  
  const handleCheckedChange = (type: string, checked: boolean) => {
    const newSelectedTypes = checked
      ? [...selectedTypes, type]
      : selectedTypes.filter((t) => t !== type);
    setSelectedTypes(newSelectedTypes);
  };

  const handleSelectAll = () => {
    setSelectedTypes(availableTypes);
  };

  const handleDeselectAll = () => {
    setSelectedTypes([]);
  };

  const handleSelectSweepRoutes = () => {
    const sweepTypes = [
      'primary', 'secondary', 'tertiary',
      'primary_link', 'secondary_link', 'tertiary_link',
      'street', 'street_limited', 'service', 'residential', 'living_street', 'road',
      'unclassified', 'roundabout'
    ];
    // Filter sweepTypes to only include types that are actually available in the current polygon
    const availableSweepTypes = sweepTypes.filter(type => availableTypes.includes(type));
    setSelectedTypes(availableSweepTypes);
  };
  
  const handleConfirm = () => {
    onConfirm();
  }

  const sortedAvailableTypes = React.useMemo(() => {
    return [...availableTypes].sort((a, b) => {
      const nameA = allRoadTypes[a] || a;
      const nameB = allRoadTypes[b] || b;
      return nameA.localeCompare(nameB);
    });
  }, [availableTypes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Filter Wegtypes</DialogTitle>
          <DialogDescription>
            Selecteer de wegtypes die u wilt opnemen in de route.
          </DialogDescription>
        </DialogHeader>
        {sortedAvailableTypes.length > 0 ? (
          <ScrollArea className="max-h-[60vh] h-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 p-1">
              {sortedAvailableTypes.map((type) => (
                <div key={type} className="flex items-center space-x-2">
                  <Checkbox
                    id={`type-${type}`}
                    checked={selectedTypes.includes(type)}
                    onCheckedChange={(checked) => handleCheckedChange(type, !!checked)}
                    style={{ color: roadColorMapping[type] }}
                  />
                  <Label htmlFor={`type-${type}`} className="font-normal capitalize flex items-center gap-2">
                      <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: roadColorMapping[type]}} />
                      {allRoadTypes[type] || type.replace(/_/g, ' ')}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center text-muted-foreground p-8">
            Geen wegen gevonden in het geselecteerde gebied.
          </div>
        )}
        <DialogFooter className="sm:justify-between w-full">
            <div className='flex gap-2 flex-wrap'>
                <Button size="sm" variant="outline" onClick={handleSelectAll} disabled={availableTypes.length === 0}>
                    Alles
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeselectAll} disabled={availableTypes.length === 0}>
                    Niets
                </Button>
                 <Button size="sm" variant="outline" onClick={handleSelectSweepRoutes} disabled={availableTypes.length === 0}>
                    Veegwagen
                </Button>
            </div>
            <div className='flex gap-2'>
               <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
               <Button onClick={handleConfirm}>Route Opslaan</Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
