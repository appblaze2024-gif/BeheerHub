'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { doc, setDoc } from 'firebase/firestore';

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
  apk_vervaldatum: z.date().optional(),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

interface AddVehicleDialogProps {
  children: React.ReactNode;
}

const carBrands = Object.keys(carData);

export function AddVehicleDialog({ children }: AddVehicleDialogProps) {
  const firestore = useFirestore();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      kenteken: '',
      voertuignummer: '',
      merk: '',
      model: '',
      type: '',
      status: 'Actief',
      bouwjaar: '',
      brandstof: '',
    },
  });

  const selectedBrand = form.watch('merk');
  const selectedModel = form.watch('model');
  
  const models = selectedBrand ? Object.keys(carData[selectedBrand] || {}) : [];
  const types = selectedBrand && selectedModel ? (carData[selectedBrand]?.[selectedModel] || []) : [];

  React.useEffect(() => {
    // Reset model and type when brand changes
    if (selectedBrand) {
      form.setValue('model', '');
      form.setValue('type', '');
    }
  }, [selectedBrand, form]);

  React.useEffect(() => {
    // Reset type when model changes
    if (selectedModel) {
        form.setValue('type', '');
    }
  }, [selectedModel, form]);


  const onSubmit = async (data: VehicleFormValues) => {
    if (!firestore) {
      console.error('Firestore not available');
      return;
    }
    
    setIsSubmitting(true);

    try {
      const vehicleRef = doc(firestore, 'voertuigen', data.kenteken);
      const vehicleData = {
        ...data,
        apk_vervaldatum: data.apk_vervaldatum ? format(data.apk_vervaldatum, 'yyyy-MM-dd') : null,
      };

      await setDoc(vehicleRef, vehicleData, { merge: true });

      form.reset();
      setOpen(false);
    } catch (error) {
      console.error('Error adding vehicle: ', error);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Voertuig Toevoegen</DialogTitle>
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
                      <Input placeholder="12-ABC-3" {...field} />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        </Trigger>
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
                    <FormControl>
                      <Input placeholder="Diesel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="apk_vervaldatum"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>APK Datum</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={'outline'}
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'dd-MM-yyyy', { locale: nl })
                          ) : (
                            <span>dd-mm-jjjj</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
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
                ) : "Toevoegen"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
