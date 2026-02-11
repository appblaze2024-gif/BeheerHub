'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, MapPin } from 'lucide-react';
import { MapboxView } from './mapbox-view';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface RouteStartLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeName: string;
  initialAddress?: string;
  initialLat?: number;
  initialLng?: number;
  onSave: (address: string, lat: number, lng: number) => void;
}

export function RouteStartLocationDialog({
  open,
  onOpenChange,
  routeName,
  initialAddress,
  initialLat,
  initialLng,
  onSave,
}: RouteStartLocationDialogProps) {
  const [searchQuery, setSearchQuery] = React.useState(initialAddress || '');
  const [suggestions, setSuggestions] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(
    initialLat && initialLng ? { latitude: initialLat, longitude: initialLng } : null
  );

  React.useEffect(() => {
    if (open) {
      setSearchQuery(initialAddress || '');
      setLocation(initialLat && initialLng ? { latitude: initialLat, longitude: initialLng } : null);
      setSuggestions([]);
    }
  }, [open, initialAddress, initialLat, initialLng]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=5`
      );
      const data = await response.json();
      setSuggestions(data.features || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = () => {
    if (location && searchQuery) {
      onSave(searchQuery, location.latitude, location.longitude);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Startlocatie instellen: {routeName}</DialogTitle>
          <DialogDescription>
            Zoek een adres dat als vast startpunt dient voor deze route in de navigatiemodule.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Zoek Adres</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Straat, huisnummer, plaats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
              />
              <Button type="button" variant="outline" onClick={handleSearch} disabled={isSearching}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {suggestions.length > 0 && (
              <div className="bg-muted p-2 rounded-md max-h-40 overflow-y-auto border">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="text-sm p-2 hover:bg-background rounded cursor-pointer truncate border-b last:border-0"
                    onClick={() => {
                      setLocation({ latitude: s.center[1], longitude: s.center[0] });
                      setSearchQuery(s.place_name);
                      setSuggestions([]);
                    }}
                  >
                    {s.place_name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="aspect-video w-full rounded-lg border overflow-hidden bg-slate-100 relative">
            <MapboxView longitude={location?.longitude} latitude={location?.latitude} />
            {!location && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/50">
                <p className="text-sm text-muted-foreground">Zoek een adres om de locatie te tonen</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={!location || !searchQuery}>
            <MapPin className="mr-2 h-4 w-4" />
            Startlocatie Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
