
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { Loader2, MapPin, Search, Info } from 'lucide-react';
import { MapboxView } from './mapbox-view';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

const sensorSchema = z.object({
  id: z.string().min(1, 'Serienummer is verplicht (bv. MAC-adres of Chip ID)').toUpperCase(),
  name: z.string().min(1, 'Naam is verplicht'),
  type: z.enum(["Vulgraad", "Temperatuur", "Luchtkwaliteit", "GPS Tracker", "Waterpeil"]),
});

type SensorFormValues = z.infer<typeof sensorSchema>;

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export function AddSensorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<any[]>([]);

  const form = useForm<SensorFormValues>({
    resolver: zodResolver(sensorSchema),
    defaultValues: { id: '', name: '', type: 'Vulgraad' },
  });

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

  const onSubmit = async (data: SensorFormValues) => {
    if (!firestore || !location) return;
    setIsSubmitting(true);
    try {
      const sensorRef = doc(firestore, 'sensors', data.id);
      await setDocumentNonBlocking(sensorRef, {
        ...data,
        status: 'Online',
        latitude: location.latitude,
        longitude: location.longitude,
        lastSeen: new Date().toISOString(),
        batteryLevel: 100,
        createdAt: serverTimestamp(),
      }, { merge: true });
      onOpenChange(false);
      form.reset();
      setLocation(null);
    } catch (error) {
      console.error("Error adding sensor:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe sensor koppelen</DialogTitle>
          <DialogDescription>
            Voer het unieke serienummer van je hardware in om deze te registreren in het systeem.
          </DialogDescription>
        </DialogHeader>
        
        <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-xs font-bold">Hoe werkt de koppeling?</AlertTitle>
          <AlertDescription className="text-[10px]">
            Zorg dat je hardware (bv. ESP32) bij elke API-aanroep ditzelfde serienummer gebruikt. Het systeem koppelt de inkomende data automatisch aan de hier ingestelde locatie en naam.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Uniek Serienummer</FormLabel>
                    <FormControl><Input placeholder="Bv. ESP32-A1-99" {...field} /></FormControl>
                    <FormDescription className="text-[10px]">Gebruik het MAC-adres of een uniek ID van de chip.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Naam / Label</FormLabel>
                    <FormControl><Input placeholder="Bv. Sensor Prullenbak Kerkplein" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sensortype</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Kies type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Vulgraad">Vulgraad (Ultrasoon)</SelectItem>
                        <SelectItem value="Temperatuur">Temperatuur</SelectItem>
                        <SelectItem value="Luchtkwaliteit">Luchtkwaliteit</SelectItem>
                        <SelectItem value="GPS Tracker">GPS Tracker</SelectItem>
                        <SelectItem value="Waterpeil">Waterpeil</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormLabel>Locatie van installatie</FormLabel>
              <div className="flex gap-2">
                <Input 
                  placeholder="Zoek adres..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                  className="text-xs"
                />
                <Button type="button" size="icon" variant="outline" className="shrink-0 h-9 w-9" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {suggestions.length > 0 && (
                <div className="bg-muted p-2 rounded-md max-h-32 overflow-y-auto space-y-1">
                  {suggestions.map(s => (
                    <div 
                      key={s.id} 
                      className="text-[10px] p-1.5 hover:bg-background rounded cursor-pointer truncate"
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
              <div className="aspect-square w-full rounded-md border overflow-hidden bg-slate-100">
                <MapboxView longitude={location?.longitude} latitude={location?.latitude} />
              </div>
            </div>

            <DialogFooter className="md:col-span-2 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
              <Button type="submit" disabled={isSubmitting || !location}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sensor Koppelen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
