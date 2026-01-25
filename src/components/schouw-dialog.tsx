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
import MapGL from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import * as turf from '@turf/turf';

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
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Info } from 'lucide-react';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';


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
  onSuccess: () => void;
}

export function SchouwDialog({
  open,
  onOpenChange,
  projectId,
  schouwing,
  onSuccess,
}: SchouwDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const drawRef = React.useRef<MapboxDraw | null>(null);
  const mapRef = React.useRef<any>(null);
  
  const form = useForm<SchouwFormValues>({
    resolver: zodResolver(schouwFormSchema),
  });

  const onMapLoad = React.useCallback(() => {
    if (mapRef.current && !drawRef.current) {
      const map = mapRef.current.getMap();
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
      });
      map.addControl(draw);
      drawRef.current = draw;
      
      if (schouwing?.gebieden) {
          try {
              const features = JSON.parse(schouwing.gebieden);
              draw.add({ type: 'FeatureCollection', features });
              
              if (features.length > 0) {
                  const featureCollection = turf.featureCollection(features);
                  const bbox = turf.bbox(featureCollection);
                  if (bbox[0] !== Infinity) {
                    map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
                  }
              }
          } catch (e) {
              console.error("Could not parse schouwing gebieden", e);
          }
      }
    }
  }, [schouwing]);
  
  React.useEffect(() => {
    if (open) {
      form.reset({
        inspecteur: schouwing?.inspecteur || user?.displayName || user?.email || '',
        opmerkingen: schouwing?.opmerkingen || '',
        status: schouwing?.status || 'Open',
      });
    } else {
      // Cleanup mapbox draw when dialog closes
       if (drawRef.current) {
        try {
          drawRef.current.deleteAll();
          if (mapRef.current?.getMap()?.getControl('mapbox-gl-draw')) {
            mapRef.current.getMap().removeControl(drawRef.current);
          }
        } catch(e) {
            console.warn("Could not cleanup Mapbox Draw control.");
        }
        drawRef.current = null;
      }
    }
  }, [open, schouwing, form, user]);

  const onSubmit = async (data: SchouwFormValues) => {
    if (!firestore || !projectId) return;

    const drawnFeatures = drawRef.current?.getAll().features;
    if (!drawnFeatures || drawnFeatures.length === 0) {
        form.setError("inspecteur", { message: "Teken tenminste één gebied op de kaart.", type: "manual" });
        return;
    }
    
    setIsSubmitting(true);
    
    const featureCollection = turf.featureCollection(drawnFeatures);
    const center = turf.centerOfMass(featureCollection);
    const [longitude, latitude] = center.geometry.coordinates;

    const schouwingenColRef = collection(firestore, 'projects', projectId, 'schouwingen');
    
    let schouwingData: any = {
      ...data,
      projectId,
      updatedAt: serverTimestamp(),
      latitude,
      longitude,
      gebieden: JSON.stringify(drawnFeatures),
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
            Teken een of meerdere gebieden op de kaart en vul de inspectiegegevens in.
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
            <div className='space-y-2'>
                 <FormLabel>Gebied(en)</FormLabel>
                 <div className='aspect-square w-full border rounded-md overflow-hidden'>
                    <MapGL
                        ref={mapRef}
                        initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 7 }}
                        style={{ width: '100%', height: '100%' }}
                        mapStyle="mapbox://styles/mapbox/streets-v12"
                        mapboxAccessToken={MAPBOX_TOKEN}
                        onLoad={onMapLoad}
                        preserveDrawingBuffer
                    />
                </div>
                 <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Handleiding</AlertTitle>
                    <AlertDescription>
                        Gebruik de knoppen op de kaart om een polygoon te tekenen. Klik om punten toe te voegen, en klik op het eerste punt om de polygoon te sluiten. U kunt meerdere polygonen tekenen.
                    </AlertDescription>
                </Alert>
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
