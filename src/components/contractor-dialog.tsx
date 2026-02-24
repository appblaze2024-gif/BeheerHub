
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import type { Contractor } from '@/lib/types';

const contractorSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  contactPerson: z.string().optional(),
  email: z.string().email('Ongeldig e-mailadres').optional().or(z.literal('')),
  phone: z.string().optional(),
});

type ContractorFormValues = z.infer<typeof contractorSchema>;

export function ContractorDialog({
  open,
  onOpenChange,
  projectId,
  contractor
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  contractor?: Contractor | null;
}) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<ContractorFormValues>({
    resolver: zodResolver(contractorSchema),
    defaultValues: {
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
    },
  });

  React.useEffect(() => {
    if (open) {
      if (contractor) {
        form.reset({
          name: contractor.name,
          contactPerson: contractor.contactPerson || '',
          email: contractor.email || '',
          phone: contractor.phone || '',
        });
      } else {
        form.reset({ name: '', contactPerson: '', email: '', phone: '' });
      }
    }
  }, [open, contractor, form]);

  const onSubmit = async (values: ContractorFormValues) => {
    if (!firestore || !projectId) return;
    setIsSubmitting(true);

    try {
      if (contractor) {
        await updateDocumentNonBlocking(doc(firestore, 'contractors', contractor.id), values);
      } else {
        await addDocumentNonBlocking(collection(firestore, 'contractors'), {
          ...values,
          projectId,
          createdAt: new Date().toISOString(),
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving contractor:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">
            {contractor ? 'Aannemer Bewerken' : 'Nieuwe Aannemer'}
          </DialogTitle>
          <DialogDescription className="font-bold text-slate-500">
            Voer de bedrijfs- en contactgegevens in.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bedrijfsnaam</FormLabel>
                  <FormControl><Input placeholder="Bv. Infra Bouw B.V." {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contactpersoon</FormLabel>
                  <FormControl><Input placeholder="Naam van de contactpersoon" {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail</FormLabel>
                    <FormControl><Input type="email" placeholder="mail@aannemer.nl" {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Telefoon</FormLabel>
                    <FormControl><Input type="tel" placeholder="06..." {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold">Annuleren</Button>
              <Button type="submit" disabled={isSubmitting} className="font-black uppercase tracking-tight h-11 px-8 shadow-xl shadow-primary/20">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Opslaan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
