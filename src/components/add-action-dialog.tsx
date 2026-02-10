'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'z';
import { format } from 'date-fns';

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
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                      onChange={(e) => field.onChange(e.target.valueAsDate)}
                    />
                  </FormControl>
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
