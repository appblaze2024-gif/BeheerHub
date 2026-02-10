'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { format } from 'date-fns';

import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';

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
import { Textarea } from '@/components/ui/textarea';

const maintenanceFormSchema = z.object({
  description: z.string().min(1, { message: 'Omschrijving is verplicht.' }),
  type: z.string().min(1, { message: 'Type is verplicht.' }),
  date: z.date({ required_error: 'Een datum is verplicht.' }),
  cost: z.coerce.number().min(0, { message: 'Kosten moeten 0 of meer zijn.'}),
  details: z.string().optional(),
});

type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

interface AddMaintenanceDialogProps {
  children: React.ReactNode;
  materieelId: string;
  materieelType: 'voertuigen' | 'machines';
}

export function AddMaintenanceDialog({
  children,
  materieelId,
  materieelType,
}: AddMaintenanceDialogProps) {
  const firestore = useFirestore();
  const [open, setOpen] = React.useState(false);

  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: {
      description: '',
      type: '',
      cost: 0,
      details: '',
      date: new Date(),
    },
  });

  const onSubmit = async (data: MaintenanceFormValues) => {
    if (!firestore || !materieelId) {
      console.error('Firestore not available');
      return;
    }

    try {
      const maintenanceColRef = collection(
        firestore,
        materieelType,
        materieelId,
        'maintenance'
      );
      
      const maintenanceData = {
        ...data,
        date: data.date.toISOString(),
      };

      await addDocumentNonBlocking(maintenanceColRef, maintenanceData);

      form.reset();
      setOpen(false);
    } catch (error) {
      console.error('Error adding maintenance: ', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Onderhoud Toevoegen</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                  <FormLabel className="text-right">Omschrijving</FormLabel>
                  <FormControl className="col-span-3">
                    <Input placeholder="Bijv. Grote beurt" {...field} />
                  </FormControl>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                  <FormLabel className="text-right">Type</FormLabel>
                  <FormControl className="col-span-3">
                    <Input placeholder="Bijv. Periodiek" {...field} />
                  </FormControl>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                  <FormLabel className="text-right">Datum</FormLabel>
                  <FormControl className="col-span-3">
                    <Input
                      type="date"
                      {...field}
                      value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                      onChange={(e) => field.onChange(e.target.valueAsDate)}
                    />
                  </FormControl>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cost"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                  <FormLabel className="text-right">Kosten (€)</FormLabel>
                  <FormControl className="col-span-3">
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-start gap-4 space-y-0">
                  <FormLabel className="text-right mt-2">Details</FormLabel>
                  <FormControl className="col-span-3">
                    <Textarea 
                      placeholder="Extra details over het onderhoud..." 
                      {...field} 
                      className="min-h-[100px]"
                    />
                  </FormControl>
                  <FormMessage className="col-start-2 col-span-3" />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Annuleren</Button>
              </DialogClose>
              <Button type="submit">Toevoegen</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
