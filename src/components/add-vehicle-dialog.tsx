'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { doc } from 'firebase/firestore';

import { cn } from '@/lib/utils';
import { useFirestore, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { useGlobalLoading } from '@/context/global-loading-context';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const materieelFormSchema = z.object({
  id: z.string().min(1, { message: 'ID/Kenteken is verplicht.' }),
  nummer: z.string().optional(),
  merk: z.string().min(1, { message: 'Merk is verplicht.' }),
  model: z.string().min(1, { message: 'Model is verplicht.' }),
  type: z.string().optional(),
  status: z.string().default('Actief'),
  bouwjaar: z.string().optional(),
  brandstof: z.string().optional(),
  apk_vervaldatum: z.string().optional(),
  opbouw_keuring: z.string().optional(),
  bandenwissel: z.string().optional(),
  imageUrl: z.string().url().optional().nullable(),
});

type MaterieelFormValues = z.infer<typeof materieelFormSchema>;


interface AddVehicleDialogProps {
  children?: React.ReactNode;
  vehicle?: any | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  materieelType: 'voertuigen' | 'machines';
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

export function AddVehicleDialog({ children, vehicle = null, open: controlledOpen, onOpenChange: controlledOnOpenChange, materieelType }: AddVehicleDialogProps) {
  const firestore = useFirestore();
  const { startProcessing } = useGlobalLoading();
  const [isLocallyOpen, setLocallyOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : isLocallyOpen;
  const onOpenChange = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setLocallyOpen;
  
  const isMachine = materieelType === 'machines';

  const form = useForm<MaterieelFormValues>({
    resolver: zodResolver(materieelFormSchema),
  });

  const selectedBrand = form.watch('merk');
  const selectedModel = form.watch('model');
  
  const models = selectedBrand && !isMachine ? Object.keys(carData[selectedBrand] || {}) : [];
  const types = selectedBrand && selectedModel && !isMachine ? (carData[selectedBrand]?.[selectedModel] || []) : [];

  React.useEffect(() => {
    if (open) {
      if (vehicle) {
        form.reset({
          id: vehicle.id || '',
          nummer: vehicle.voertuignummer || vehicle.machinenummer || '',
          merk: vehicle.merk || '',
          model: vehicle.model || '',
          type: vehicle.type || '',
          status: vehicle.status || 'Actief',
          bouwjaar: vehicle.bouwjaar || '',
          brandstof: vehicle.brandstof || '',
          apk_vervaldatum: vehicle.apk_vervaldatum || '',
          opbouw_keuring: vehicle.opbouw_keuring || '',
          bandenwissel: vehicle.bandenwissel || '',
          imageUrl: vehicle.imageUrl ?? null,
        });
      } else {
        form.reset({
          id: '',
          nummer: '',
          merk: '',
          model: '',
          type: '',
          status: 'Actief',
          bouwjaar: '',
          brandstof: '',
          apk_vervaldatum: '',
          opbouw_keuring: '',
          bandenwissel: '',
          imageUrl: null,
        });
      }
    }
  }, [open, vehicle, form, isMachine]);

  const onSubmit = async (data: MaterieelFormValues) => {
    if (!firestore) return;
    
    setIsSubmitting(true);

    try {
      const { nummer, ...restOfData } = data;
      const materieelData: any = { ...restOfData };

      if (isMachine) {
        materieelData.machinenummer = nummer || null;
        delete materieelData.apk_vervaldatum;
      } else {
        materieelData.voertuignummer = nummer || null;
        materieelData.apk_vervaldatum = data.apk_vervaldatum || null;
      }
      
      const materieelRef = doc(firestore, materieelType, materieelData.id);
      
      if (vehicle) {
        updateDocumentNonBlocking(materieelRef, materieelData);
      } else {
        setDocumentNonBlocking(materieelRef, materieelData, { merge: false });
      }

      onOpenChange(false);
      startProcessing(1000);
    } catch (error) {
      console.error(`Error saving ${materieelType}: `, error);
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
          <DialogTitle>{vehicle ? (isMachine ? 'Machine Bewerken' : 'Voertuig Bewerken') : (isMachine ? 'Machine Toevoegen' : 'Voertuig Toevoegen')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isMachine ? 'ID' : 'Kenteken'}</FormLabel>
                    <FormControl>
                      <Input placeholder={isMachine ? 'Unieke ID' : '12-ABC-3'} {...field} disabled={!!vehicle} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nummer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isMachine ? 'Machinenummer' : 'Voertuignummer'}</FormLabel>
                    <FormControl>
                      <Input placeholder={isMachine ? 'M001' : 'V001'} {...field} />
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
                    {isMachine ? (
                      <FormControl>
                        <Input placeholder="Merk van de machine" {...field} />
                      </FormControl>
                    ) : (
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
                    )}
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
                     {isMachine ? (
                       <FormControl>
                        <Input placeholder="Model van de machine" {...field} />
                      </FormControl>
                    ) : (
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
                    )}
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
                    {isMachine ? (
                       <FormControl>
                        <Input placeholder="Type machine" {...field} />
                      </FormControl>
                    ) : (
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
                    )}
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
            <div className="grid grid-cols-2 gap-4">
              {!isMachine && (
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
              )}
              <FormField
                control={form.control}
                name="opbouw_keuring"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opbouw keuring</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bandenwissel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bandenwissel</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
