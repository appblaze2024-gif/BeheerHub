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

// These are common 'class' values found in the Mapbox Streets v8 vector tiles for road layers.
export const roadLayerIds = [
    'road',
];

export const allRoadTypes = [
    'motorway',
    'motorway_link',
    'trunk',
    'trunk_link',
    'primary',
    'primary_link',
    'secondary',
    'secondary_link',
    'tertiary',
    'tertiary_link',
    'street',
    'street_limited',
    'pedestrian',
    'path',
    'track',
    'service',
    'ferry',
];


interface RoadTypeFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTypes: string[];
  onSelectedTypesChange: (types: string[]) => void;
}

export function RoadTypeFilterDialog({
  open,
  onOpenChange,
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
    onSelectedTypesChange(allRoadTypes);
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
            Selecteer de wegtypes die u op de kaart wilt zien.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto grid grid-cols-2 gap-4 p-1">
          {allRoadTypes.map((type) => (
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
        <DialogFooter className="justify-between w-full">
            <div className='flex gap-2'>
                <Button variant="outline" onClick={handleSelectAll}>
                    Alles Selecteren
                </Button>
                <Button variant="outline" onClick={handleDeselectAll}>
                    Alles Deselecteren
                </Button>
            </div>
            <Button onClick={() => onOpenChange(false)}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
