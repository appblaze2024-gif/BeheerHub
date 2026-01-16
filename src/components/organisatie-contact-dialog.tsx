'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

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
import type { OrganisatieContact } from '@/app/projects/page';

const contactFormSchema = z.object({
  naam: z.string().min(1, 'Naam is verplicht.'),
  rol: z.string().min(1, 'Rol is verplicht.'),
  bedrijf: z.string().optional(),
  telefoon: z.string().optional(),
  email: z.string().email('Voer een geldig e-mailadres in.').optional().or(z.literal('')),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

interface OrganisatieContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  contact?: OrganisatieContact;
}

export function OrganisatieContactDialog({
  open,
  onOpenChange,
  projectId,
  contact,
}: OrganisatieContactDialogProps) {
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
  });

  React.useEffect(() => {
    if (open) {
      form.reset(
        contact
          ? {
              naam: contact.naam,
              rol: contact.rol,
              bedrijf: contact.bedrijf || '',
              telefoon: contact.telefoon || '',
              email: contact.email || '',
            }
          : {
              naam: '',
              rol: '',
              bedrijf: '',
              telefoon: '',
              email: '',
            }
      );
    } else {
      setIsSubmitting(false);
    }
  }, [open, contact, form]);

  const onSubmit = async (data: ContactFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);

    const organisatieColRef = collection(firestore, 'projects', projectId, 'organisatie');
    const contactId = contact?.id || doc(organisatieColRef).id;
    const contactRef = doc(organisatieColRef, contactId);

    const contactData = {
      ...data,
      id: contactId,
      updatedAt: serverTimestamp(),
    };

    try {
      if (contact) {
        await updateDoc(contactRef, contactData);
      } else {
        await setDoc(contactRef, {
          ...contactData,
          createdAt: serverTimestamp(),
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {contact ? 'Contact Bewerken' : 'Nieuw Contact'}
          </DialogTitle>
          <DialogDescription>
            Vul de details voor het contact in en klik op opslaan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="naam"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Naam</FormLabel>
                    <FormControl>
                      <Input placeholder="Jan Janssen" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <FormControl>
                      <Input placeholder="Projectleider" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <FormField
                control={form.control}
                name="bedrijf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bedrijf</FormLabel>
                    <FormControl>
                      <Input placeholder="Gemeente X" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="telefoon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefoon</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="06-12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="j.janssen@gemeente.nl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opslaan...
                  </>
                ) : (
                  'Opslaan'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
