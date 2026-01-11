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

// Kleurcodering voor elk wegtype.
export const roadColorMapping: Record<string, string> = {
  motorway: '#ff0000',          // Rood
  motorway_link: '#ff6666',      // Lichtrood
  trunk: '#ff9933',             // Oranje
  trunk_link: '#ffcc99',         // Lichtoranje
  primary: '#ffff00',            // Geel
  primary_link: '#ffff99',       // Lichtgeel
  secondary: '#33cc33',          // Groen
  secondary_link: '#99e699',     // Lichtgroen
  tertiary: '#3399ff',            // Blauw
  tertiary_link: '#99ccff',      // Lichtblauw
  street: '#c0c0c0',             // Grijs
  street_limited: '#d9d9d9',     // Lichter grijs
  residential: '#f2f2f2',        // Zeer lichtgrijs (bijna wit)
  living_street: '#e6e6e6',      // Iets donkerder dan residential
  pedestrian: '#cc66ff',         // Paars
  path: '#996633',             // Bruin
  track: '#b3866f',             // Lichtbruin
  service: '#808080',            // Donkergrijs
  ferry: '#00ffff',             // Cyaan
  road: '#a0a0a0',               // Medium grijs
  unclassified: '#a0a0a0',        // Zelfde als road
  roundabout: '#c0c0c0',         // Zelfde als street
};


interface RoadTypeFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTypes: string[];
  onConfirm: (selectedTypes: string[]) => void;
}

export function RoadTypeFilterDialog({
  open,
  onOpenChange,
  availableTypes,
  onConfirm,
}: RoadTypeFilterDialogProps) {
  
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  
  React.useEffect(() => {
    if(open) {
      setSelectedTypes(availableTypes);
    }
  }, [open, availableTypes])

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
    onConfirm(selectedTypes);
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
                <Button variant="outline" onClick={handleSelectAll} disabled={availableTypes.length === 0}>
                    Alles
                </Button>
                <Button variant="outline" onClick={handleDeselectAll} disabled={availableTypes.length === 0}>
                    Niets
                </Button>
                 <Button variant="outline" onClick={handleSelectSweepRoutes} disabled={availableTypes.length === 0}>
                    Veegroutes
                </Button>
            </div>
            <div className='flex gap-2'>
               <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
               <Button onClick={handleConfirm}>Route Genereren</Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
