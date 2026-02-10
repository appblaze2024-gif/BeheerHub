
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
  DialogDescription,
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

const actionFormSchema = z.object({
  name: z.string().min(1, { message: 'Naam is verplicht.' }),
  type: z.string().min(1, { message: 'Type is verplicht.' }),
  date: z.date({
    required_error: 'Een datum is verplicht.',
  }),
});

type ActionFormValues = z.infer<typeof actionFormSchema>;

interface AddActionDialogProps {
  children: React.ReactNode;
  materieelId: string;
  materieelType: 'voertuigen' | 'machines';
}

export function AddActionDialog({
  children,
  materieelId,
  materieelType,
}: AddActionDialogProps) {
  const firestore = useFirestore();
  const [open, setOpen] = React.useState(false);

  const form = useForm<ActionFormValues>({
    resolver: zodResolver(actionFormSchema),
    defaultValues: {
        name: '',
        type: '',
    }
  });

  const onSubmit = async (data: ActionFormValues) => {
    if (!firestore || !materieelId) {
      console.error('Firestore not available');
      return;
    }

    try {
      const actionsColRef = collection(
        firestore,
        materieelType,
        materieelId,
        'actions'
      );
      
      const actionData = {
        ...data,
        date: data.date.toISOString(),
      };

      await addDocumentNonBlocking(actionsColRef, actionData);

      form.reset();
      setOpen(false);
    } catch (error) {
      console.error('Error adding action: ', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nieuwe Actie Toevoegen</DialogTitle>
          <DialogDescription>
            Voer de details voor de nieuwe actie in en klik op opslaan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actie naam</FormLabel>
                  <FormControl>
                    <Input placeholder="Bijv. Olie verversen" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <FormControl>
                    <Input placeholder="Bijv. Onderhoud" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Datum</FormLabel>
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
                            format(field.value, 'PPP', { locale: nl })
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
                        captionLayout="dropdown-buttons"
                        fromDate={new Date(2000, 0, 1)}
                        toDate={new Date(new Date().getFullYear() + 10, 11, 31)}
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
                    <Button type="button" variant="ghost">Annuleren</Button>
                </DialogClose>
              <Button type="submit">Opslaan</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
