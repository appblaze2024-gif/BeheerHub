
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
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, doc } from 'firebase/firestore';
import { Loader2, ScrollText, Plus, X } from 'lucide-react';
import type { MeetingMinute, Contractor } from '@/lib/types';
import { format } from 'date-fns';

const minuteSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  date: z.string().min(1, 'Datum is verplicht'),
  attendees: z.string().optional(),
  content: z.string().min(1, 'Inhoud is verplicht'),
  actionPoints: z.string().optional(),
});

type MinuteFormValues = z.infer<typeof minuteSchema>;

export function MeetingMinuteDialog({
  open,
  onOpenChange,
  contractor,
  minute
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: Contractor;
  minute?: MeetingMinute | null;
}) {
  const firestore = useFirestore();
  const { profile } = useProfile();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<MinuteFormValues>({
    resolver: zodResolver(minuteSchema),
    defaultValues: {
      title: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      attendees: '',
      content: '',
      actionPoints: '',
    },
  });

  React.useEffect(() => {
    if (open) {
      if (minute) {
        form.reset({
          title: minute.title,
          date: minute.date,
          attendees: minute.attendees || '',
          content: minute.content,
          actionPoints: minute.actionPoints || '',
        });
      } else {
        form.reset({
          title: `Bouwvergadering ${contractor.name}`,
          date: format(new Date(), 'yyyy-MM-dd'),
          attendees: '',
          content: '',
          actionPoints: '',
        });
      }
    }
  }, [open, minute, contractor, form]);

  const onSubmit = async (values: MinuteFormValues) => {
    if (!firestore || !contractor) return;
    setIsSubmitting(true);

    try {
      const minutesColRef = collection(firestore, 'contractors', contractor.id, 'minutes');
      
      const data = {
        ...values,
        contractorId: contractor.id,
        projectId: contractor.projectId,
        updatedAt: new Date().toISOString(),
        createdBy: profile?.displayName || profile?.email || 'Systeem',
      };

      if (minute) {
        await updateDocumentNonBlocking(doc(firestore, 'contractors', contractor.id, 'minutes', minute.id), data);
      } else {
        await addDocumentNonBlocking(minutesColRef, {
          ...data,
          createdAt: new Date().toISOString(),
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving meeting minute:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 border-b bg-slate-50/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 h-12 w-12 rounded-2xl flex items-center justify-center">
              <ScrollText className="text-primary h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">
                {minute ? 'Verslag Bewerken' : 'Nieuw Vergaderverslag'}
              </DialogTitle>
              <DialogDescription className="font-bold text-slate-500">
                Aannemer: <span className="text-slate-900">{contractor.name}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto bg-white p-6">
          <Form {...form}>
            <form id="minute-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Onderwerp / Titel</FormLabel>
                      <FormControl><Input placeholder="Bv. Wekelijks overleg" {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Datum Vergadering</FormLabel>
                      <FormControl><Input type="date" {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="attendees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Aanwezigen</FormLabel>
                    <FormControl><Input placeholder="Bv. Jan (BH), Piet (Aannemer)..." {...field} className="h-11 font-bold rounded-xl border-slate-100 bg-slate-50" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Inhoud / Verslag</FormLabel>
                    <FormControl><Textarea placeholder="Beschrijf de besproken punten..." {...field} className="min-h-[250px] font-medium leading-relaxed rounded-2xl border-slate-100 bg-slate-50" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="actionPoints"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Actiepunten</FormLabel>
                    <FormControl><Textarea placeholder="Lijst van acties en verantwoordelijken..." {...field} className="min-h-[120px] font-black text-blue-700 leading-relaxed rounded-2xl border-blue-50 bg-blue-50/30" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold">Annuleren</Button>
          <Button type="submit" form="minute-form" disabled={isSubmitting} className="font-black uppercase tracking-tight h-12 px-12 shadow-xl shadow-primary/20">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verslag Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
