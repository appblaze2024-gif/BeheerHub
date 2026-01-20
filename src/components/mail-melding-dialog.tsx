'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Mail } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

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
import { useToast } from '@/components/ui/use-toast';
import { sendEmail } from '@/app/mail/actions';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';

// Define Melding type here or import it
type Melding = {
  id: string;
  intakenummer: string;
  extern_meldingsnummer?: string;
  latitude: number;
  longitude: number;
  subcategorie: string;
  hoofdcategorie: string;
  extra_informatie: string;
  status: string;
  datum: string;
  tijdstip: string;
  melder: string;
  aangenomen_door?: string;
  afgehandeld_door?: string;
  afhandeling_datum?: string;
  straatnaam?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
  wijk?: string;
};

const mailFormSchema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in.'),
  cc: z.string().optional(),
});

type MailFormValues = z.infer<typeof mailFormSchema>;

interface MailMeldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  melding: Melding | null;
}

const generateMeldingPDF = (melding: Melding): string => {
  const doc = new jsPDF();
  const title = `Details Melding: ${melding.intakenummer}`;
  const dateStr = format(new Date(), 'd MMMM yyyy', { locale: nl });

  doc.setFontSize(18);
  doc.text(title, 14, 22);
  doc.setFontSize(11);
  doc.text(`Rapport gegenereerd op: ${dateStr}`, 14, 30);

  const tableBody = [
    ['Intakenummer', melding.intakenummer],
    ['Datum', `${format(new Date(melding.datum), 'dd-MM-yyyy')} om ${melding.tijdstip}`],
    ['Adres', `${melding.straatnaam || ''} ${melding.huisnummer || ''}, ${melding.postcode || ''} ${melding.plaats || ''}`.trim()],
    ['Wijk', melding.wijk || '-'],
    ['Categorie', `${melding.hoofdcategorie} > ${melding.subcategorie}`],
    ['Status', melding.status],
    ['Melder', melding.melder],
    ['Aangenomen door', melding.aangenomen_door || '-'],
    ['Omschrijving', melding.extra_informatie],
  ];
  
  if (melding.status === 'Afgerond') {
    tableBody.push(['Afgehandeld door', melding.afgehandeld_door || '-']);
    tableBody.push(['Afhandelingsdatum', melding.afhandeling_datum ? format(new Date(melding.afhandeling_datum), 'dd-MM-yyyy') : '-']);
  }

  (doc as any).autoTable({
    startY: 40,
    head: [['Veld', 'Gegeven']],
    body: tableBody,
    theme: 'grid',
    styles: { valign: 'middle' },
    headStyles: { fillColor: [34, 197, 94] },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
  });

  return doc.output('datauristring');
};

type UserProfileData = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
};

export function MailMeldingDialog({
  open,
  onOpenChange,
  melding,
}: MailMeldingDialogProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const userProfileRef = React.useMemo(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfileData>(userProfileRef);

  const form = useForm<MailFormValues>({
    resolver: zodResolver(mailFormSchema),
    defaultValues: { email: '', cc: '' },
  });

  React.useEffect(() => {
    if (!open) {
      form.reset();
      setIsSubmitting(false);
    }
  }, [open, form]);

  const onSubmit = async (data: MailFormValues) => {
    if (!melding) return;
    if (!user?.email) {
      toast({
        variant: "destructive",
        title: "Fout",
        description: "Kon gebruiker niet verifiëren. Probeer opnieuw in te loggen.",
      });
      return;
    }
    setIsSubmitting(true);

    const pdfDataUri = generateMeldingPDF(melding);
    const pdfBase64 = pdfDataUri.substring(pdfDataUri.indexOf(',') + 1);
    
    let senderName: string;
    let signatureName: string;

    if (userProfile?.firstName && userProfile?.lastName) {
      senderName = `${userProfile.firstName} ${userProfile.lastName}`;
      signatureName = senderName;
    } else if (user?.email) {
      senderName = user.email;
      signatureName = user.email;
    } else {
       toast({
        variant: "destructive",
        title: "Fout",
        description: "Kon afzendernaam niet vinden. Stel uw naam in op de profielpagina.",
      });
      setIsSubmitting(false);
      return;
    }
    
    const emailBody = `Geachte lezer,\n\nIn de bijlage vindt u de details van melding ${melding.intakenummer}.\n\nMet vriendelijke groet,\n${signatureName}`;

    const result = await sendEmail({
      to: data.email,
      cc: data.cc,
      subject: `Melding Details: ${melding.intakenummer}`,
      body: emailBody,
      attachments: [{
        content: pdfBase64,
        filename: `melding_${melding.intakenummer}.pdf`,
        type: 'application/pdf',
      }],
      fromName: senderName,
      fromEmail: user.email,
    });

    if (result.success) {
      toast({
        title: 'E-mail verzonden!',
        description: `De melding is succesvol verstuurd naar ${data.email}.`,
      });
      onOpenChange(false);
    } else {
      toast({
        variant: 'destructive',
        title: 'Fout bij verzenden',
        description: result.message || 'Er is een onverwachte fout opgetreden.',
      });
    }
    
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Meldingsdetails E-mailen</DialogTitle>
          <DialogDescription>
            Voer het e-mailadres in om de melding als PDF te versturen.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mailadres ontvanger</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="cc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CC</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting || isProfileLoading}>
                {isSubmitting || isProfileLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Versturen...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Verstuur
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
