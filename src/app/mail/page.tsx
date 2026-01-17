'use client';

import * as React from 'react';
import {
  Archive,
  Inbox,
  Send,
  Trash2,
  Search,
  PenSquare,
  File,
  MailWarning,
  Reply,
  ReplyAll,
  Forward,
  Settings,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ComposeMailDialog } from '@/components/compose-mail-dialog';
import { fetchEmailsFlow } from '@/ai/flows/fetch-emails-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// --- UPDATED TYPE ---
type Mail = {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  date: string; // ISO string
  read: boolean;
};

const folders = [
  { name: 'inbox', label: 'Postvak IN', icon: Inbox, boxName: 'INBOX' },
  { name: 'sent', label: 'Verzonden', icon: Send, boxName: 'Sent' },
  // { name: 'drafts', label: 'Concepten', icon: File }, // Future feature
  // { name: 'junk', label: 'Ongewenst', icon: MailWarning }, // Future feature
  // { name: 'trash', label: 'Prullenbak', icon: Trash2 }, // Future feature
  // { name: 'archive', label: 'Archief', icon: Archive }, // Future feature
];


export default function MailPage() {
  const [selectedFolder, setSelectedFolder] = React.useState('inbox');
  const [selectedMail, setSelectedMail] = React.useState<Mail | null>(null);
  const [mails, setMails] = React.useState<Mail[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAndSetEmails = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const folder = folders.find(f => f.name === selectedFolder);
      if (!folder) {
          throw new Error('Geselecteerde map niet gevonden.');
      }
      const fetchedMails = await fetchEmailsFlow(folder.boxName);
      setMails(fetchedMails);
    } catch (error: any) {
      console.error("Failed to fetch emails:", error);
      setError(error.message || 'Kon e-mails niet ophalen.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedFolder]);

  React.useEffect(() => {
    fetchAndSetEmails();
  }, [fetchAndSetEmails]);


  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex-1 overflow-hidden p-6 h-full">
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
                  {!isLoading && !error && selectedFolder === folder.name && (
                    <span className="ml-auto text-xs text-muted-foreground">
                        {mails.length}
                    </span>
                  )}
                </Button>
              ))}
            </nav>
          </div>

          {/* Panel 2: Mail list */}
          <div className="border-r flex flex-col min-h-0">
            <div className="p-3 border-b flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Zoeken..." className="pl-9" />
              </div>
              <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={fetchAndSetEmails} disabled={isLoading}>
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>E-mails vernieuwen</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                    <p>E-mails ophalen...</p>
                </div>
              ) : error ? (
                <div className="p-4">
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Fout bij ophalen van e-mail</AlertTitle>
                      <AlertDescription>
                        {error}
                      </AlertDescription>
                    </Alert>
                </div>
              ) : mails.length > 0 ? (
                mails.map(mail => (
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
                        {formatDistanceToNow(new Date(mail.date), { addSuffix: true, locale: nl })}
                      </div>
                    </div>
                    <div className="text-xs font-medium">{mail.subject}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {mail.body.replace(/<[^>]*>?/gm, '')}
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                  <Inbox className="mx-auto h-12 w-12 mb-4" />
                  <p>Geen berichten in {folders.find(f => f.name === selectedFolder)?.label || 'deze map'}</p>
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
                        Aan: Mij
                      </p>
                    </div>
                     <div className="ml-auto text-xs text-muted-foreground">
                        {format(new Date(selectedMail.date), 'PPpp', { locale: nl })}
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
