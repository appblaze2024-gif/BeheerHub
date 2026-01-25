'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  useFirestore,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  useUser
} from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';

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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Schouwing } from '@/lib/types';
import { MapboxView } from './mapbox-view';

interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
}

const schouwFormSchema = z.object({
  inspecteur: z.string().min(1, 'Naam inspecteur is verplicht.'),
  opmerkingen: z.string().min(1, 'Opmerkingen zijn verplicht.'),
  status: z.enum(['Open', 'In behandeling', 'Afgerond']),
});

type SchouwFormValues = z.infer<typeof schouwFormSchema>;

interface SchouwDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  schouwing?: Schouwing | null;
  location?: { latitude: number; longitude: number } | null;
  onSuccess: () => void;
}

export function SchouwDialog({
  open,
  onOpenChange,
  projectId,
  schouwing,
  location,
  onSuccess,
}: SchouwDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  const [internalLocation, setInternalLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);

  const form = useForm<SchouwFormValues>({
    resolver: zodResolver(schouwFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      if (schouwing) {
        form.reset({
          inspecteur: schouwing.inspecteur,
          opmerkingen: schouwing.opmerkingen,
          status: schouwing.status,
        });
        const schouwLocation = {latitude: schouwing.latitude, longitude: schouwing.longitude};
        setInternalLocation(schouwLocation);
        setSearchQuery(`${schouwLocation.latitude.toFixed(6)}, ${schouwLocation.longitude.toFixed(6)}`);

      } else {
        form.reset({
          inspecteur: user?.displayName || user?.email || '',
          opmerkingen: '',
          status: 'Open',
        });
        setInternalLocation(location || null);
        setSearchQuery(location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : '');
      }
      setSuggestions([]);
      setIsSearching(false);
    } else {
      setInternalLocation(null);
      setSearchQuery('');
    }
  }, [open, schouwing, location, form, user]);

  React.useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (justSelectedSuggestion.current) {
      justSelectedSuggestion.current = false;
      return;
    }

    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            searchQuery
          )}&format=json&countrycodes=nl&limit=5`
        );
        const data: Suggestion[] = await response.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Fout bij zoeken:", error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSuggestionClick = (suggestion: Suggestion) => {
    justSelectedSuggestion.current = true;
    setSearchQuery(suggestion.display_name);
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);

    if (!isNaN(lat) && !isNaN(lon)) {
        setInternalLocation({ latitude: lat, longitude: lon });
    }
    setSuggestions([]);
  };

  const onSubmit = async (data: SchouwFormValues) => {
    if (!firestore || !projectId) return;
    
    if (!internalLocation) {
        form.setError("inspecteur", { message: "Selecteer een locatie op de kaart of via zoeken.", type: "manual" });
        return;
    }

    setIsSubmitting(true);

    const schouwingenColRef = collection(firestore, 'projects', projectId, 'schouwingen');
    
    let schouwingData: any = {
      ...data,
      projectId,
      updatedAt: serverTimestamp(),
      latitude: internalLocation.latitude,
      longitude: internalLocation.longitude,
    };
    
    if (!schouwing) {
        schouwingData = {
            ...schouwingData,
            datum: new Date().toISOString(),
            createdAt: serverTimestamp(),
        }
    }

    try {
      if (schouwing) {
        const schouwingRef = doc(schouwingenColRef, schouwing.id);
        await updateDocumentNonBlocking(schouwingRef, schouwingData);
      } else {
        await addDocumentNonBlocking(schouwingenColRef, schouwingData);
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan schouwing:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{schouwing ? 'Schouwing Bewerken' : 'Nieuwe Schouwing'}</DialogTitle>
          <DialogDescription>
            Vul de details voor de inspectie in en klik op opslaan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="space-y-4">
                <FormField
                control={form.control}
                name="inspecteur"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Inspecteur</FormLabel>
                    <FormControl>
                        <Input {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="opmerkingen"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Opmerkingen</FormLabel>
                    <FormControl>
                        <Textarea rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecteer een status" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        <SelectItem value="Open">Open</SelectItem>
                        <SelectItem value="In behandeling">In behandeling</SelectItem>
                        <SelectItem value="Afgerond">Afgerond</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <div className='space-y-4'>
                 <FormItem>
                    <FormLabel>Locatie*</FormLabel>
                     <div className="relative w-full">
                        <Input
                            placeholder="Zoek een adres..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoComplete="off"
                        />
                        {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                        {suggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {suggestions.map((suggestion) => (
                                <div
                                    key={suggestion.place_id}
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className="px-4 py-2 text-sm cursor-pointer hover:bg-muted"
                                >
                                    {suggestion.display_name}
                                </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className='aspect-video w-full border rounded-md overflow-hidden mt-2'>
                        <MapboxView
                            longitude={internalLocation?.longitude}
                            latitude={internalLocation?.latitude}
                        />
                    </div>
                </FormItem>
            </div>
            <DialogFooter className='md:col-span-2'>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Opslaan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
