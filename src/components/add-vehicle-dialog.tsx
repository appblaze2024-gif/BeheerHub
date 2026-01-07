'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

import { cn } from '@/lib/utils';
import { useFirestore } from '@/firebase';
import { carData } from '@/lib/car-data';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const vehicleFormSchema = z.object({
  kenteken: z.string().min(1, { message: 'Kenteken is verplicht.' }),
  voertuignummer: z.string().optional(),
  merk: z.string().min(1, { message: 'Selecteer een merk.' }),
  model: z.string().min(1, { message: 'Selecteer een model.' }),
  type: z.string().optional(),
  status: z.string().default('Actief'),
  bouwjaar: z.string().optional(),
  brandstof: z.string().optional(),
  apk_vervaldatum: z.string().optional(),
  imageUrl: z.string().url().optional().nullable(),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

interface AddVehicleDialogProps {
  children?: React.ReactNode;
  vehicle?: any | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const carBrands = Object.keys(carData);
const fuelTypes = [
    "Benzine",
    "Diesel",
    "Elektrisch",
    "Hybride (benzine)",
    "Hybride (diesel)",
    "LPG",
    "CNG (Aardgas)",
    "Waterstof"
];

export function AddVehicleDialog({ children, vehicle = null, open: controlledOpen, onOpenChange: controlledOnOpenChange }: AddVehicleDialogProps) {
  const firestore = useFirestore();
  const [isLocallyOpen, setLocallyOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : isLocallyOpen;
  const onOpenChange = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setLocallyOpen;

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
  });

  const selectedBrand = form.watch('merk');
  const selectedModel = form.watch('model');
  
  const models = selectedBrand ? Object.keys(carData[selectedBrand] || {}) : [];
  const types = selectedBrand && selectedModel ? (carData[selectedBrand]?.[selectedModel] || []) : [];

  React.useEffect(() => {
    if (open) {
      if (vehicle) {
        form.reset({
          kenteken: vehicle.id || '',
          voertuignummer: vehicle.voertuignummer || '',
          merk: vehicle.merk || '',
          model: vehicle.model || '',
          type: vehicle.type || '',
          status: vehicle.status || 'Actief',
          bouwjaar: vehicle.bouwjaar || '',
          brandstof: vehicle.brandstof || '',
          apk_vervaldatum: vehicle.apk_vervaldatum,
          imageUrl: vehicle.imageUrl ?? null,
        });
      } else {
        form.reset({
          kenteken: '',
          voertuignummer: '',
          merk: '',
          model: '',
          type: '',
          status: 'Actief',
          bouwjaar: '',
          brandstof: '',
          apk_vervaldatum: '',
          imageUrl: null,
        });
      }
    }
  }, [open, vehicle, form]);

  React.useEffect(() => {
    if (!form.formState.isDirty) return;
    if (selectedBrand !== vehicle?.merk) {
      form.setValue('model', '');
      form.setValue('type', '');
    }
  }, [selectedBrand, form, vehicle]);

  React.useEffect(() => {
    if (!form.formState.isDirty) return;
    if (selectedModel !== vehicle?.model) {
      form.setValue('type', '');
    }
  }, [selectedModel, form, vehicle]);


  const onSubmit = async (data: VehicleFormValues) => {
    if (!firestore) {
      console.error('Firestore not available');
      return;
    }
    
    setIsSubmitting(true);

    try {
      const vehicleData = {
        ...data,
        apk_vervaldatum: data.apk_vervaldatum || null,
      };
      
      const vehicleRef = doc(firestore, 'voertuigen', vehicleData.kenteken);
      
      if (vehicle) {
        // Kenteken cannot be changed for existing vehicles
        if (vehicle.id !== data.kenteken) {
            console.error("Changing kenteken is not allowed.");
            setIsSubmitting(false);
            return
        }
        await updateDoc(vehicleRef, vehicleData);
      } else {
        await setDoc(vehicleRef, vehicleData, { merge: false });
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving vehicle: ', error);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const DialogTriggerComponent = children ? <DialogTrigger asChild>{children}</DialogTrigger> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {DialogTriggerComponent}
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{vehicle ? 'Voertuig Bewerken' : 'Voertuig Toevoegen'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="kenteken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kenteken</FormLabel>
                    <FormControl>
                      <Input placeholder="12-ABC-3" {...field} disabled={!!vehicle} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="voertuignummer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voertuignummer</FormLabel>
                    <FormControl>
                      <Input placeholder="V001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="merk"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Merk</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer een merk" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {carBrands.sort().map(brand => (
                            <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value} disabled={!selectedBrand}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer een model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {models.map(model => (
                            <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedModel || types.length === 0}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer een type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {types.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Actief">Actief</SelectItem>
                        <SelectItem value="Inactief">Inactief</SelectItem>
                        <SelectItem value="In onderhoud">In onderhoud</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="bouwjaar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bouwjaar</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="2023" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="brandstof"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brandstof</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer brandstof" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fuelTypes.map(fuel => (
                            <SelectItem key={fuel} value={fuel}>{fuel}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="apk_vervaldatum"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>APK Datum</FormLabel>
                  <FormControl>
                    <Input type='date' {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isSubmitting}>
                  Annuleren
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                    <>
                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     Bezig...
                    </>
                ) : vehicle ? 'Wijzigingen opslaan' : 'Toevoegen'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
