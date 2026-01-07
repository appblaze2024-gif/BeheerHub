'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';

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
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from './ui/separator';

const damageFormSchema = z.object({
  date: z.date({ required_error: 'Een datum is verplicht.' }),
  description: z.string().min(1, { message: 'Omschrijving is verplicht.' }),
});

type DamageFormValues = z.infer<typeof damageFormSchema>;

interface AddDamageDialogProps {
  children: React.ReactNode;
  vehicleId: string;
}

export function AddDamageDialog({
  children,
  vehicleId,
}: AddDamageDialogProps) {
  const firestore = useFirestore();
  const [open, setOpen] = React.useState(false);
  const [damageId, setDamageId] = React.useState<string | null>(null);

  const form = useForm<DamageFormValues>({
    resolver: zodResolver(damageFormSchema),
    defaultValues: {
      description: '',
    },
  });

  const onSubmit = async (data: DamageFormValues) => {
    if (!firestore || !vehicleId) {
      toast({
        variant: 'destructive',
        title: 'Fout',
        description: 'Kan geen verbinding maken met de database.',
      });
      return;
    }

    try {
      const damagesColRef = collection(
        firestore,
        'voertuigen',
        vehicleId,
        'damages'
      );
      
      const damageData = {
        ...data,
        date: data.date.toISOString(),
        status: 'Open',
        files: []
      };

      const docRef = await addDocumentNonBlocking(damagesColRef, damageData);
      
      if(docRef) {
        setDamageId(docRef.id);
        toast({
            title: 'Schade gemeld!',
            description: 'Je kunt nu bestanden uploaden.',
        });
        // Don't close the dialog, allow file upload.
      } else {
         throw new Error("Could not get document reference after creation.")
      }

    } catch (error) {
      console.error('Error adding damage: ', error);
      toast({
        variant: 'destructive',
        title: 'Oh nee! Er is iets misgegaan.',
        description:
          'Kon de schade niet melden. Controleer de console voor details.',
      });
    }
  };

  const handleClose = () => {
    form.reset();
    setDamageId(null);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nieuwe Schademelding</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                           disabled={!!damageId}
                        >
                          {field.value ? (
                            format(field.value, 'dd-MM-yyyy')
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
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Omschrijving</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Omschrijf de schade..." {...field}  disabled={!!damageId}/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
                <FormLabel>Bestanden</FormLabel>
                <Button type="button" variant="outline" disabled={!damageId}>
                    <Upload className="mr-2 h-4 w-4" />
                    Bestanden uploaden
                </Button>
                {!damageId && <p className="text-xs text-muted-foreground">Sla het item eerst op om bestanden te kunnen uploaden.</p>}
            </div>

            <div className="border rounded-md">
                <div className="text-sm">
                    <div className="flex justify-between px-4 py-2 font-medium bg-muted rounded-t-md">
                        <span className="w-1/4">Bestandsnaam</span>
                        <span className="w-1/4">Type</span>
                        <span className="w-1/4">Grootte</span>
                         <span className="w-1/4">Datum</span>
                        <span className="w-1/5 text-right">Acties</span>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center text-muted-foreground h-24">
                  Nog geen bestanden geüpload.
                </div>
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={handleClose}>Sluiten</Button>
                 {!damageId ? (
                   <Button type="submit">Meld schade en ga verder</Button>
                 ) : (
                    <Button onClick={handleClose}>Klaar</Button>
                 )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
