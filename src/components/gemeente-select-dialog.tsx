'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from './ui/input';
import { Loader2, Search } from 'lucide-react';
import type { Feature } from 'geojson';
import { gemeenten } from '@/lib/gemeenten';

interface GemeenteSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGemeenteSelect: (gemeente: Feature) => void;
}

interface Suggestion {
  place_id: number;
  display_name: string;
  geojson: any;
  boundingbox: [string, string, string, string];
}

export function GemeenteSelectDialog({
  open,
  onOpenChange,
  onGemeenteSelect,
}: GemeenteSelectDialogProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  
  const filteredGemeenten = React.useMemo(() => {
    if (!searchQuery) {
      return gemeenten;
    }
    return gemeenten.filter(g => g.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);


  const handleSuggestionClick = async (gemeenteNaam: string) => {
    setIsLoading(true);
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                gemeenteNaam
            )}&format=json&polygon_geojson=1&countrycodes=nl&limit=1`
        );
        const data: Suggestion[] = await response.json();
        
        if (data.length > 0 && (data[0].geojson.type === 'Polygon' || data[0].geojson.type === 'MultiPolygon')) {
            const suggestion = data[0];
            const feature: Feature = {
                type: 'Feature',
                properties: { name: suggestion.display_name },
                geometry: suggestion.geojson,
            };
            onGemeenteSelect(feature);
            onOpenChange(false);
        } else {
            console.error("Geen polygoon gevonden voor:", gemeenteNaam);
        }

    } catch (error) {
        console.error('Fout bij ophalen gemeente grenzen:', error);
    } finally {
        setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (!open) {
        setSearchQuery('');
        setIsLoading(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kies een Gemeente</DialogTitle>
          <DialogDescription>
            Zoek en selecteer een gemeente om op de kaart te tonen.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek gemeente..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {isLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
        </div>

        <div className="mt-2 border rounded-md max-h-60 overflow-y-auto">
            {filteredGemeenten.map((gemeente) => (
              <div
                key={gemeente}
                onClick={() => handleSuggestionClick(gemeente)}
                className="px-4 py-3 text-sm cursor-pointer hover:bg-muted border-b last:border-b-0"
              >
                {gemeente}
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
