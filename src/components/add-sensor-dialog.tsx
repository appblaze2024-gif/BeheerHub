
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
import { Loader2, MapPin, Search, Info, Ruler, RefreshCcw } from 'lucide-react';
import { MapboxView } from './mapbox-view';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

const sensorSchema = z.object({
  id: z.string().min(1, 'Serienummer is verplicht (bv. MAC-adres of Chip ID)').toUpperCase(),
  name: z.string().min(1, 'Naam is verplicht'),
  type: z.enum(["TOF200C", "Temperatuur", "Luchtkwaliteit", "GPS Tracker", "Waterpeil"]),
  binDepthCm: z.coerce.number().min(1, 'Voer een diepte in groter dan 0'),
  measurementFrequency: z.coerce.number().min(1, 'Voer een frequentie in (minimaal 1)').max(1440, 'Maximaal elke minuut'),
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
    defaultValues: { 
      id: '', 
      name: '', 
      type: 'TOF200C',
      binDepthCm: 100,
      measurementFrequency: 24 
    },
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
        vulgraad: 0,
        currentDistanceCm: 0,
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
      <DialogContent className="sm:max-w-[800px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe sensor koppelen & kalibreren</DialogTitle>
          <DialogDescription>
            Stel de fysieke parameters in zodat de sensor de juiste percentages berekent.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              <div className="space-y-6">
                <div className="bg-slate-50 dark:bg-zinc-900 p-4 rounded-lg border space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Info className="h-3 w-3" /> Basis Informatie
                  </h3>
                  <FormField
                    control={form.control}
                    name="id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Uniek Serienummer</FormLabel>
                        <FormControl><Input placeholder="Bv. MAC-ADRES" {...field} className="font-mono" /></FormControl>
                        <FormDescription className="text-[10px]">De unieke sleutel die de hardware meestuurt.</FormDescription>
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
                        <FormControl><Input placeholder="Bv. Sensor Bak #42" {...field} /></FormControl>
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
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="TOF200C">Vulgraad (TOF200C)</SelectItem>
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

                <div className="bg-amber-50/50 dark:bg-amber-950/10 p-4 rounded-lg border border-amber-200 dark:border-amber-900/50 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-amber-600 flex items-center gap-2">
                    <Ruler className="h-3 w-3" /> Kalibratie & Frequentie
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="binDepthCm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Diepte Bak (cm)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormDescription className="text-[9px]">Afstand van sensor tot bodem.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="measurementFrequency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Metingen / 24u</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormDescription className="text-[9px]">Hoe vaak moet de ESP32 zenden?</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <FormLabel>Geografische Positie</FormLabel>
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
                  <div className="bg-muted p-2 rounded-md max-h-32 overflow-y-auto border">
                    {suggestions.map(s => (
                      <div 
                        key={s.id} 
                        className="text-[10px] p-2 hover:bg-background rounded cursor-pointer truncate border-b last:border-0"
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
                <div className="aspect-square w-full rounded-lg border overflow-hidden bg-slate-100 shadow-inner">
                  <MapboxView longitude={location?.longitude} latitude={location?.latitude} />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-6 border-t">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
              <Button type="submit" disabled={isSubmitting || !location} className="font-bold">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Hardware Koppelen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
