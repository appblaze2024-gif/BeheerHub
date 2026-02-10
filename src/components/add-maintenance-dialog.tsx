'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { cn } from '@/lib/utils';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

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
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl className="col-span-3">
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
                            <span>Kies een datum</span>
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
                        disabled={(date) =>
                          date > new Date() || date < new Date('1900-01-01')
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
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