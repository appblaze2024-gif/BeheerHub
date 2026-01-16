'use client';

import * as React from 'react';
import {
  Archive,
  ArchiveX,
  Clock,
  Inbox,
  Loader2,
  MailWarning,
  Send,
  Trash2,
  Users2,
  Search,
  MoreVertical,
  Reply,
  ReplyAll,
  Forward,
  PenSquare,
  File,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatDistanceToNow, format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { useCollection, useFirestore, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Medewerker } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';
import { sendEmail } from './actions';

import { PageHeader } from '@/components/page-header';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


// --- MOCK DATA ---
const mockMails = [
  {
    id: '1',
    from: 'no-reply@vercel.com',
    fromName: 'Vercel',
    subject: 'Deployment Succesvol: BeheerHub',
    body: '<p>Beste team,</p><p>Goed nieuws! Uw project <strong>BeheerHub</strong> is succesvol gedeployed. De live-omgeving is nu beschikbaar en alle recente wijzigingen zijn doorgevoerd.</p><p>U kunt de live-versie bekijken via de standaard project URL.</p><p>Met vriendelijke groet,<br>Het Vercel Team</p>',
    date: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    read: true,
    folder: 'inbox',
  },
  {
    id: '2',
    from: 'piet@projectleider.nl',
    fromName: 'Piet Projectleider',
    subject: 'Vraag over project X',
    body: '<p>Hoi, ik had een vraag over de voortgang van project X. Kun je me een update geven? We moeten de deadline van volgende week halen.</p><p>Groet,<br>Piet</p>',
    date: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    read: false,
    folder: 'inbox',
  },
  {
    id: '3',
    fromName: 'U',
    to: 'piet@projectleider.nl',
    subject: 'Re: Vraag over project X',
    body: '<p>Hoi Piet, de voortgang is goed. We lopen op schema. Ik stuur je vanmiddag een uitgebreide update met de laatste testresultaten.</p><p>Mvg,</p>',
    date: new Date(Date.now() - 23 * 60 * 60 * 1000), // 23 hours ago
    read: true,
    folder: 'sent',
  },
  {
    id: '4',
    from: 'facturatie@software.com',
    fromName: 'Software Inc.',
    subject: 'Uw factuur #12345',
    body: '<p>Geachte klant, hierbij ontvangt u de factuur voor uw abonnement.</p>',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    read: true,
    folder: 'inbox',
  },
  {
    id: '5',
    fromName: 'U',
    to: 'team@beheerhub.nl',
    subject: 'Concept: Nieuwe feature',
    body: '<p>Hierbij een concept voor de nieuwe rapportage functionaliteit. Graag jullie feedback.</p>',
    date: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    read: true,
    folder: 'drafts',
  },
  {
    id: '6',
    from: 'spam@example.com',
    fromName: 'Spam King',
    subject: 'WIN EEN GRATIS AUTO!',
    body: '<p>Klik hier en win!</p>',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    read: true,
    folder: 'junk',
  }
];

type Mail = typeof mockMails[0];

const folders = [
  { name: 'inbox', label: 'Postvak IN', icon: Inbox },
  { name: 'sent', label: 'Verzonden', icon: Send },
  { name: 'drafts', label: 'Concepten', icon: File },
  { name: 'junk', label: 'Ongewenst', icon: MailWarning },
  { name: 'trash', label: 'Prullenbak', icon: Trash2 },
  { name: 'archive', label: 'Archief', icon: Archive },
];


// --- COMPOSE DIALOG COMPONENT ---
const mailSchema = z.object({
  to: z.string().email({ message: 'Selecteer een geldige ontvanger.' }),
  subject: z.string().min(1, { message: 'Onderwerp is verplicht.' }),
  body: z.string().min(1, { message: 'Bericht mag niet leeg zijn.' }),
});

type MailFormValues = z.infer<typeof mailSchema>;

function ComposeMailDialog({ children }: { children: React.ReactNode }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();
  const [open, setOpen] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  const medewerkersCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'medewerkers');
  }, [firestore]);

  const { data: medewerkers, isLoading: isLoadingMedewerkers } = useCollection<Medewerker>(medewerkersCollection);

  const form = useForm<MailFormValues>({
    resolver: zodResolver(mailSchema),
    defaultValues: { to: '', subject: '', body: '' },
  });

  async function onSubmit(data: MailFormValues) {
    setIsSending(true);
    try {
      await sendEmail({
        ...data,
        fromName: user?.displayName || user?.email || 'BeheerHub Gebruiker',
      });
      toast({
        title: 'E-mail verzonden!',
        description: `Uw e-mail aan ${data.to} is succesvol in de wachtrij geplaatst.`,
      });
      form.reset();
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Fout bij verzenden',
        description: 'Er is een fout opgetreden bij het verzenden van de e-mail.',
      });
    } finally {
      setIsSending(false);
    }
  }

  const validMedewerkers = React.useMemo(() => {
    return medewerkers?.filter(m => m.email && m.status === 'Actief') || [];
  }, [medewerkers]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nieuw Bericht</DialogTitle>
          <DialogDescription>Stel uw e-mail op en verstuur deze naar een medewerker.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aan</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingMedewerkers}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer een ontvanger" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingMedewerkers ? (
                        <SelectItem value="loading" disabled>Medewerkers laden...</SelectItem>
                      ) : (
                        validMedewerkers.map(m => (
                          <SelectItem key={m.id} value={m.email!}>
                            {m.voornaam} {m.achternaam} ({m.email})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Onderwerp</FormLabel>
                  <FormControl>
                    <Input placeholder="Onderwerp van uw bericht" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bericht</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Typ hier uw bericht..." className="min-h-[200px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSending}>Annuleren</Button>
              <Button type="submit" disabled={isSending}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Verstuur
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function MailPage() {
  const [selectedFolder, setSelectedFolder] = React.useState('inbox');
  const [selectedMail, setSelectedMail] = React.useState<Mail | null>(mockMails.find(m => m.folder === 'inbox') || null);

  const mailsInFolder = React.useMemo(() => {
    return mockMails
      .filter(m => m.folder === selectedFolder)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [selectedFolder]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <PageHeader title="Interne Mail" />
      <div className="flex-1 overflow-hidden px-6 pb-6 h-full">
        <div className="grid grid-cols-[250px_400px_1fr] h-full border rounded-lg">
          
          {/* Panel 1: Folders */}
          <div className="border-r p-3 flex flex-col">
            <ComposeMailDialog>
              <Button className="w-full">
                <PenSquare className="mr-2 h-4 w-4" />
                Nieuw Bericht
              </Button>
            </ComposeMailDialog>

            <nav className="mt-4 space-y-1">
              {folders.map(folder => (
                <Button
                  key={folder.name}
                  variant={selectedFolder === folder.name ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setSelectedFolder(folder.name);
                    setSelectedMail(null);
                  }}
                >
                  <folder.icon className="h-4 w-4" />
                  {folder.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {mockMails.filter(m => m.folder === folder.name).length}
                  </span>
                </Button>
              ))}
            </nav>
          </div>

          {/* Panel 2: Mail list */}
          <div className="border-r flex flex-col min-h-0">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Zoeken..." className="pl-9" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {mailsInFolder.length > 0 ? (
                mailsInFolder.map(mail => (
                  <button
                    key={mail.id}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-lg border-b p-3 text-left text-sm transition-all w-full",
                      selectedMail?.id === mail.id ? "bg-muted" : "hover:bg-accent"
                    )}
                    onClick={() => setSelectedMail(mail)}
                  >
                    <div className="flex w-full items-center">
                      <div className="flex items-center gap-2">
                        <div className={cn("h-2 w-2 rounded-full", !mail.read && "bg-blue-500")} />
                        <div className="font-semibold">{mail.fromName}</div>
                      </div>
                      <div className="ml-auto text-xs text-muted-foreground">
                        {formatDistanceToNow(mail.date, { addSuffix: true, locale: nl })}
                      </div>
                    </div>
                    <div className="text-xs font-medium">{mail.subject}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {mail.body.replace(/<[^>]*>?/gm, '')}
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Inbox className="mx-auto h-12 w-12" />
                  <p className="mt-2">Geen berichten in deze map</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Panel 3: Mail content */}
          <div className="flex flex-col min-h-0">
            {selectedMail ? (
              <>
                <div className="flex items-center p-3 border-b">
                   <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={!selectedMail}><Reply className="h-4 w-4" /></Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Beantwoorden</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                           <Button variant="ghost" size="icon" disabled={!selectedMail}><ReplyAll className="h-4 w-4" /></Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Allen beantwoorden</p></TooltipContent>
                        </Tooltip>
                         <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={!selectedMail}><Forward className="h-4 w-4" /></Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Doorsturen</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                   </div>
                   <Separator orientation="vertical" className="mx-2 h-6" />
                   <Button variant="ghost" size="icon" disabled={!selectedMail}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-start gap-4">
                     <Avatar>
                      <AvatarFallback>{selectedMail.fromName.substring(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="grid gap-1">
                      <p className="font-semibold">{selectedMail.fromName}</p>
                      <p className="text-xs text-muted-foreground">
                        Aan: {selectedMail.to || 'Mij'}
                      </p>
                    </div>
                     <div className="ml-auto text-xs text-muted-foreground">
                        {format(selectedMail.date, 'PPpp', { locale: nl })}
                      </div>
                  </div>
                   <h2 className="text-xl font-bold">{selectedMail.subject}</h2>
                </div>
                <Separator />
                <div className="flex-1 whitespace-pre-wrap p-4 text-sm overflow-y-auto"
                   dangerouslySetInnerHTML={{ __html: selectedMail.body }}
                />
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Inbox className="h-16 w-16" />
                <p className="mt-4 text-lg">Selecteer een bericht</p>
                <p className="text-sm">Geen bericht geselecteerd om weer te geven.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
