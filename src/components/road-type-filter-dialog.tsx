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

export const allRoadTypes: Record<string, string> = {
  motorway: 'Snelweg',
  motorway_link: 'Verbindingsweg snelweg',
  trunk: 'Hoofdweg',
  trunk_link: 'Verbindingsweg hoofdweg',
  primary: 'Provinciale weg',
  primary_link: 'Verbindingsweg provinciale weg',
  secondary: 'Secundaire weg',
  secondary_link: 'Verbindingsweg secundaire weg',
  tertiary: 'Tertiaire weg',
  tertiary_link: 'Verbindingsweg tertiaire weg',
  street: 'Straat',
  street_limited: 'Straat (beperkt verkeer)',
  pedestrian: 'Voetgangersgebied',
  path: 'Pad',
  track: 'Veldweg/Bospad',
  service: 'Dienstweg',
  ferry: 'Veerboot',
  living_street: 'Woonerf',
  residential: 'Woonstraat',
  road: 'Ongeclassificeerde weg',
  unclassified: 'Ongeclassificeerde weg',
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
          <div className="max-h-[60vh] overflow-y-auto grid grid-cols-2 gap-x-6 gap-y-3 p-1">
            {sortedAvailableTypes.map((type) => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={`type-${type}`}
                  checked={selectedTypes.includes(type)}
                  onCheckedChange={(checked) => handleCheckedChange(type, !!checked)}
                />
                <Label htmlFor={`type-${type}`} className="font-normal capitalize">
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
