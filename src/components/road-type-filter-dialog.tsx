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

export const allRoadTypes = [
    'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
    'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'street',
    'street_limited', 'pedestrian', 'path', 'track', 'service', 'ferry',
];


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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Filter Wegtypes</DialogTitle>
          <DialogDescription>
            Selecteer de wegtypes die u binnen de polygoon wilt zien.
          </DialogDescription>
        </DialogHeader>
        {availableTypes.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto grid grid-cols-2 gap-4 p-1">
            {availableTypes.map((type) => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={`type-${type}`}
                  checked={selectedTypes.includes(type)}
                  onCheckedChange={(checked) => handleCheckedChange(type, !!checked)}
                />
                <Label htmlFor={`type-${type}`} className="font-normal capitalize">
                  {type.replace(/_/g, ' ')}
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
