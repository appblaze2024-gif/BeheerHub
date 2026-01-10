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
  motorway: '#e60000', // Felrood
  motorway_link: '#ff4d4d',
  trunk: '#ff8c1a', // Oranje
  trunk_link: '#ffad66',
  primary: '#fed800', // Geel
  primary_link: '#ffeb80',
  secondary: '#339933', // Groen
  secondary_link: '#80c080',
  tertiary: '#0066cc', // Blauw
  tertiary_link: '#66a3e0',
  street: '#a6a6a6', // Grijs
  street_limited: '#c0c0c0',
  residential: '#cccccc', // Lichtgrijs
  living_street: '#e0e0e0', // Zeer lichtgrijs
  pedestrian: '#9933ff', // Paars
  path: '#cc9900', // Bruin
  track: '#8B4513', // Zadelbruin
  service: '#999999', // Donkergrijs
  ferry: '#00ccff', // Cyaan
  road: '#b3b3b3',
  unclassified: '#b3b3b3',
  roundabout: '#a6a6a6',
};


interface RoadTypeFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTypes: string[];
  selectedTypes: string[];
  onSelectedTypesChange: (types: string[]) => void;
}

export function RoadTypeFilterDialog({
  open,
  onOpenChange,
  availableTypes,
  selectedTypes,
  onSelectedTypesChange,
}: RoadTypeFilterDialogProps) {
  
  const handleCheckedChange = (type: string, checked: boolean) => {
    const newSelectedTypes = checked
      ? [...selectedTypes, type]
      : selectedTypes.filter((t) => t !== type);
    onSelectedTypesChange(newSelectedTypes);
  };

  const handleSelectAll = () => {
    onSelectedTypesChange(availableTypes);
  };

  const handleDeselectAll = () => {
    onSelectedTypesChange([]);
  };
  
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
            Selecteer de wegtypes die u binnen de polygoon wilt zien.
          </DialogDescription>
        </DialogHeader>
        {sortedAvailableTypes.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 p-1">
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
        ) : (
          <div className="text-center text-muted-foreground p-8">
            Geen wegen gevonden in het geselecteerde gebied.
          </div>
        )}
        <DialogFooter className="justify-between w-full">
            <div className='flex gap-2'>
                <Button variant="outline" onClick={handleSelectAll} disabled={availableTypes.length === 0}>
                    Alles Selecteren
                </Button>
                <Button variant="outline" onClick={handleDeselectAll} disabled={availableTypes.length === 0}>
                    Alles Deselecteren
                </Button>
            </div>
            <Button onClick={() => onOpenChange(false)}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
