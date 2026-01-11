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
  const [isSearching, setIsSearching] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleSearchQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            query
          )}&format=json&polygon_geojson=1&countrycodes=nl&limit=10`
        );
        const data: Suggestion[] = await response.json();
        // Filter for administrative boundaries which are likely municipalities
        const filteredData = data.filter(
          s => s.geojson && (s.geojson.type === 'Polygon' || s.geojson.type === 'MultiPolygon')
        );
        setSuggestions(filteredData);
      } catch (error) {
        console.error('Fout bij zoeken gemeente:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    const feature: Feature = {
      type: 'Feature',
      properties: { name: suggestion.display_name },
      geometry: suggestion.geojson,
    };
    onGemeenteSelect(feature);
    onOpenChange(false);
  };

  React.useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);
  
  React.useEffect(() => {
    // Reset state on open/close
    if (!open) {
        setSearchQuery('');
        setSuggestions([]);
        setIsSearching(false);
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
            onChange={handleSearchQueryChange}
          />
          {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
        </div>

        {suggestions.length > 0 && (
          <div className="mt-2 border rounded-md max-h-60 overflow-y-auto">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.place_id}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-4 py-3 text-sm cursor-pointer hover:bg-muted border-b last:border-b-0"
              >
                {suggestion.display_name}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
