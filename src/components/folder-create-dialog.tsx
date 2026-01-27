'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection, serverTimestamp } from 'firebase/firestore';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
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

const folderFormSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.'),
});

type FolderFormValues = z.infer<typeof folderFormSchema>;

interface FolderCreateDialogProps {
  children: React.ReactNode;
  projectId: string;
  folderId: string | null;
  onSuccess: () => void;
}

export function FolderCreateDialog({
  children,
  projectId,
  folderId,
  onSuccess,
}: FolderCreateDialogProps) {
  const firestore = useFirestore();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<FolderFormValues>({
    resolver: zodResolver(folderFormSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (data: FolderFormValues) => {
    if (!firestore || !projectId) return;

    setIsSubmitting(true);
    const foldersColRef = collection(firestore, 'projects', projectId, 'folders');
    
    try {
      await addDocumentNonBlocking(foldersColRef, {
        ...data,
        folderId: folderId || null,
        createdAt: serverTimestamp(),
      });
      onSuccess();
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error('Error creating folder:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe Map Aanmaken</DialogTitle>
          <DialogDescription>
            Voer een naam in voor de nieuwe map.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mapnaam</FormLabel>
                  <FormControl>
                    <Input placeholder="Bijv. Documenten" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Opslaan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
