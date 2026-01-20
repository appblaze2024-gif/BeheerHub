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
  FolderPlus,
  Folder,
  Paperclip,
  Bookmark,
  MoreVertical,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';

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
import { fetchEmailsFlow, type EmailAttachment } from '@/ai/flows/fetch-emails-flow';
import { deleteEmailFlow } from '@/ai/flows/delete-email-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createMailboxFlow } from '@/ai/flows/create-mailbox-flow';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LabelManagerDialog } from '@/components/label-manager-dialog';


// --- UPDATED TYPE ---
type Mail = {
  id: string;
  uid: number;
  from: string;
  fromName: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  date: string; // ISO string
  read: boolean;
  attachments?: EmailAttachment[];
};

function CreateFolderDialog({ onFolderCreated }: { onFolderCreated: (folderName: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [folderName, setFolderName] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!folderName.trim()) {
        toast({
            variant: "destructive",
            title: "Ongeldige mapnaam",
            description: "De mapnaam mag niet leeg zijn.",
        });
        return;
    }
    setIsCreating(true);
    try {
        await createMailboxFlow({ mailboxName: folderName });
        toast({
            title: 'Map aangemaakt',
            description: `De map '${folderName}' is succesvol aangemaakt.`,
        });
        onFolderCreated(folderName);
        setOpen(false);
        setFolderName('');
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: 'Fout bij aanmaken map',
            description: error.message || 'Kon de map niet aanmaken.',
        });
    } finally {
        setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isCreating) setOpen(o)}}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2">
            <FolderPlus className="h-4 w-4" />
            Nieuwe map
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe map aanmaken</DialogTitle>
          <DialogDescription>
            Voer een naam in voor de nieuwe map in uw mailbox.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
            <Label htmlFor="folder-name">Mapnaam</Label>
            <Input 
                id="folder-name" 
                value={folderName} 
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Naam van de nieuwe map"
            />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isCreating}>Annuleren</Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Aanmaken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


const initialFolders = [
  { name: 'inbox', label: 'Postvak IN', icon: Inbox, boxName: 'INBOX' },
  { name: 'sent', label: 'Verzonden items', icon: Send, boxName: 'INBOX/Verzonden items' },
  { name: 'drafts', label: 'Concepten', icon: File, boxName: 'INBOX/Concepten' },
  { name: 'spam', label: 'Spam', icon: MailWarning, boxName: 'INBOX/Spam' },
  { name: 'trash', label: 'Prullenbak', icon: Trash2, boxName: 'INBOX/Prullenbak' },
  // { name: 'archive', label: 'Archief', icon: Archive }, // Future feature
];

const initialLabels = [
    { name: 'Geen', color: 'transparent' },
    { name: 'Rood', color: '#dc2626' },
    { name: 'Blauw', color: '#2563eb' },
    { name: 'Groen', color: '#84cc16' },
    { name: 'Grijs', color: '#71717a' },
    { name: 'Paars', color: '#7e22ce' },
    { name: 'Lichtgroen', color: '#bef264' },
    { name: 'Oranje', color: '#f97316' },
    { name: 'Roze', color: '#db2777' },
    { name: 'Lichtblauw', color: '#bae6fd' },
    { name: 'Geel', color: '#facc15' },
];


export default function MailPage() {
  const [folders, setFolders] = React.useState(initialFolders);
  const [selectedFolder, setSelectedFolder] = React.useState('inbox');
  const [selectedMail, setSelectedMail] = React.useState<Mail | null>(null);
  const [mails, setMails] = React.useState<Mail[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const { toast } = useToast();
  const { user } = useUser();

  const [isComposeOpen, setIsComposeOpen] = React.useState(false);
  const [composeInitialData, setComposeInitialData] = React.useState<any>({});
  
  const [labels, setLabels] = React.useState(initialLabels);
  const [isLabelManagerOpen, setIsLabelManagerOpen] = React.useState(false);
  const [mailLabels, setMailLabels] = React.useState<Record<string, string>>({});

  const selectedMailRef = React.useRef(selectedMail);
  selectedMailRef.current = selectedMail;


  const fetchAndSetEmails = React.useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const folder = folders.find(f => f.name === selectedFolder);
      if (!folder) {
          throw new Error('Geselecteerde map niet gevonden.');
      }
      const fetchedMails = await fetchEmailsFlow(folder.boxName);
      setMails(currentMails => {
        if (JSON.stringify(currentMails) !== JSON.stringify(fetchedMails)) {
            const currentSelectedMail = selectedMailRef.current;
            if (currentSelectedMail && !fetchedMails.find(m => m.id === currentSelectedMail.id)) {
                setSelectedMail(null);
            }
            return fetchedMails;
        }
        return currentMails;
      });
    } catch (error: any) {
      console.error("Failed to fetch emails:", error);
      setError(error.message || 'Kon e-mails niet ophalen.');
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [selectedFolder, folders]);

  React.useEffect(() => {
    fetchAndSetEmails(true);
    const interval = setInterval(() => {
      fetchAndSetEmails(false);
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [fetchAndSetEmails]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedMail) return;

    const folder = folders.find(f => f.name === selectedFolder);
    if (!folder) return;
    
    setIsDeleting(true);

    try {
      await deleteEmailFlow({
        mailbox: folder.boxName,
        uid: selectedMail.uid,
      });

      toast({
        title: 'E-mail verwijderd',
        description: 'De e-mail is succesvol verwijderd.',
      });
      
      // Refresh list
      setMails(currentMails => currentMails.filter(m => m.uid !== selectedMail.uid));
      setSelectedMail(null);

    } catch (error: any) {
      console.error("Failed to delete email:", error);
      toast({
        variant: "destructive",
        title: 'Fout bij verwijderen',
        description: error.message || 'Kon de e-mail niet verwijderen.',
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleFolderCreated = (folderName: string) => {
    const newFolder = {
      name: folderName.toLowerCase().replace(/\s/g, '-'),
      label: folderName,
      icon: Folder,
      boxName: `INBOX/${folderName}`
    };
    setFolders(currentFolders => [...currentFolders, newFolder]);
    setSelectedFolder(newFolder.name);
  };

  const handleReply = () => {
    if (!selectedMail) return;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectedMail.body;
    const originalBodyText = tempDiv.textContent || tempDiv.innerText || "";

    const replyBody = `\n\n\n----- Oorspronkelijk bericht -----\nVan: ${selectedMail.fromName} <${selectedMail.from}>\nDatum: ${format(new Date(selectedMail.date), 'd MMM yyyy, HH:mm', { locale: nl })}\nOnderwerp: ${selectedMail.subject}\n\n${originalBodyText}`;

    setComposeInitialData({
        to: selectedMail.from,
        subject: `Re: ${selectedMail.subject}`,
        body: replyBody
    });
    setIsComposeOpen(true);
  };
  
  const handleReplyAll = () => {
    if (!selectedMail || !user) return;
    
    // Combine To and Cc recipients
    const allRecipients = [
        ...selectedMail.to,
        ...(selectedMail.cc || [])
    ];
    
    // Add the original sender
    const replyToRecipients = [selectedMail.from, ...allRecipients];

    // Filter out the current user's email and remove duplicates
    const uniqueRecipients = [...new Set(replyToRecipients.filter(email => email && email.toLowerCase() !== user.email?.toLowerCase()))];
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectedMail.body;
    const originalBodyText = tempDiv.textContent || tempDiv.innerText || "";

    const replyBody = `\n\n\n----- Oorspronkelijk bericht -----\nVan: ${selectedMail.fromName} <${selectedMail.from}>\nNaar: ${selectedMail.to.join(', ')}\n${selectedMail.cc && selectedMail.cc.length > 0 ? `Cc: ${selectedMail.cc.join(', ')}\n` : ''}Datum: ${format(new Date(selectedMail.date), 'd MMM yyyy, HH:mm', { locale: nl })}\nOnderwerp: ${selectedMail.subject}\n\n${originalBodyText}`;

    setComposeInitialData({
        to: uniqueRecipients.join(', '),
        subject: `Re: ${selectedMail.subject}`,
        body: replyBody
    });
    setIsComposeOpen(true);
  };

  const handleForward = () => {
    if (!selectedMail) return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = selectedMail.body;
    const originalBodyText = tempDiv.textContent || tempDiv.innerText || "";

    const forwardBody = `\n\n\n----- Doorgestuurd bericht -----\nVan: ${selectedMail.fromName} <${selectedMail.from}>\nDatum: ${format(new Date(selectedMail.date), 'd MMM yyyy, HH:mm', { locale: nl })}\nOnderwerp: ${selectedMail.subject}\nAan: ${selectedMail.to.join(', ')}\n${selectedMail.cc && selectedMail.cc.length > 0 ? `Cc: ${selectedMail.cc.join(', ')}\n` : ''}\n\n${originalBodyText}`;

    setComposeInitialData({
        to: '', // Empty as requested
        subject: `Fwd: ${selectedMail.subject}`,
        body: forwardBody,
        attachments: selectedMail.attachments || [],
    });
    setIsComposeOpen(true);
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  const currentLabelName = selectedMail ? mailLabels[selectedMail.id] || 'Geen' : 'Geen';
  const currentLabel = labels.find(l => l.name === currentLabelName);


  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex-1 overflow-hidden p-6 h-full">
        <div className="grid grid-cols-[250px_400px_1fr] h-full border rounded-lg">
          
          {/* Panel 1: Folders */}
          <div className="border-r p-3 flex flex-col">
            <Button className="w-full" onClick={() => { setComposeInitialData({}); setIsComposeOpen(true); }}>
                <PenSquare className="mr-2 h-4 w-4" />
                Nieuw Bericht
            </Button>

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
               <Separator className="my-1" />
               <CreateFolderDialog onFolderCreated={handleFolderCreated} />
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
                        <Button variant="ghost" size="icon" onClick={() => fetchAndSetEmails(true)} disabled={isLoading}>
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
                mails.map(mail => {
                  const mailLabelName = mailLabels[mail.id] || 'Geen';
                  const mailLabel = labels.find(l => l.name === mailLabelName);
                  
                  return (
                    <button
                      key={mail.id}
                      className={cn(
                        "relative flex flex-col items-start gap-2 rounded-lg border-b p-3 text-left text-sm transition-all w-full",
                        selectedMail?.id === mail.id ? "bg-muted" : "hover:bg-accent"
                      )}
                      onClick={() => setSelectedMail(mail)}
                    >
                      <div className="flex w-full items-center">
                        <div className="flex items-center gap-2">
                          <div className={cn("h-2 w-2 rounded-full", !mail.read && "bg-blue-500")} />
                          <div className="font-semibold">{mail.fromName}</div>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          {mail.attachments && mail.attachments.length > 0 && (
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(mail.date), { addSuffix: true, locale: nl })}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-medium">{mail.subject}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {mail.body.replace(/<[^>]*>?/gm, '')}
                      </div>

                      {mailLabel && mailLabel.name !== 'Geen' && (
                          <div
                              className="absolute right-0 top-0 bottom-0 w-1 rounded-r-lg"
                              style={{ backgroundColor: mailLabel.color }}
                          />
                      )}
                    </button>
                  )
                })
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
                <div className="flex items-center p-4 border-b">
                    <h1 className="text-xl font-bold flex-1 truncate">{selectedMail.subject}</h1>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="p-4 border-b">
                        <div className="flex items-start gap-4">
                            <Avatar className="h-10 w-10">
                                <AvatarFallback>{selectedMail.fromName.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="grid gap-1 flex-1">
                                <div className="font-semibold">{selectedMail.fromName} <span className="font-normal text-muted-foreground">&lt;{selectedMail.from}&gt;</span></div>
                                <div className="text-xs text-muted-foreground">Aan: {selectedMail.to.join(', ')}</div>
                                {selectedMail.cc && selectedMail.cc.length > 0 && (
                                    <div className="text-xs text-muted-foreground">Cc: {selectedMail.cc.join(', ')}</div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{format(new Date(selectedMail.date), 'HH:mm')}</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <Bookmark 
                                                className="h-4 w-4" 
                                                fill={currentLabel && currentLabel.name !== 'Geen' ? currentLabel.color : 'none'}
                                                stroke={currentLabel && currentLabel.name !== 'Geen' ? currentLabel.color : 'currentColor'}
                                            />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuLabel>Label instellen</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {labels.map(label => (
                                            <DropdownMenuItem 
                                                key={label.name}
                                                onClick={() => {
                                                    if (selectedMail) {
                                                        setMailLabels(prev => ({...prev, [selectedMail.id]: label.name}));
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div
                                                      className="h-4 w-4 rounded-sm border"
                                                      style={{ backgroundColor: label.color !== 'transparent' ? label.color : undefined }}
                                                    />
                                                    <span>{label.name}</span>
                                                </div>
                                            </DropdownMenuItem>
                                        ))}
                                         <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={() => setIsLabelManagerOpen(true)}>Labels beheren...</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <Avatar className="h-8 w-8 text-sm">
                                    <AvatarFallback>{user?.email?.substring(0,2).toUpperCase() || 'DS'}</AvatarFallback>
                                </Avatar>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-b">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={handleReply}><Reply className="mr-2 h-4 w-4" /> Beantwoorden</Button>
                            <Button variant="outline" size="sm" onClick={handleReplyAll}><ReplyAll className="mr-2 h-4 w-4" /> Allen beantwoorden</Button>
                            <Button variant="outline" size="sm" onClick={handleForward}><Forward className="mr-2 h-4 w-4" /> Doorsturen</Button>
                            <Button variant="outline" size="sm" onClick={handleDelete} disabled={isDeleting}>
                                {isDeleting ? <Loader2 className='h-4 w-4 animate-spin mr-2' /> : <Trash2 className="h-4 w-4 mr-2" />}
                                Verwijderen
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto"><MoreVertical className="h-4 w-4" /></Button>
                        </div>
                    </div>
                    
                    {selectedMail.attachments && selectedMail.attachments.length > 0 && (
                    <div className="p-4 border-b">
                        <Collapsible>
                        <CollapsibleTrigger asChild>
                            <div className="group flex items-center gap-2 text-sm font-medium cursor-pointer">
                            <Paperclip className="h-4 w-4" />
                            <span>{selectedMail.attachments.length} bijlage{selectedMail.attachments.length > 1 ? 'n' : ''}</span>
                            <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                            </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="pt-4 space-y-2">
                            {selectedMail.attachments.map((att, index) => (
                                <div key={index} className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                <File className="h-6 w-6 text-muted-foreground" />
                                <div className="flex-1">
                                    <p className="font-medium truncate">{att.filename}</p>
                                    <p className="text-xs text-muted-foreground">{formatBytes(att.size)}</p>
                                </div>
                                <Button variant="ghost" size="sm" disabled>Weergave</Button>
                                <a href={`data:${att.contentType};base64,${att.content}`} download={att.filename}>
                                    <Button variant="ghost" size="sm">Downloaden</Button>
                                </a>
                                <Button variant="ghost" size="sm" disabled>Opslaan naar Drive</Button>
                                </div>
                            ))}
                            </div>
                        </CollapsibleContent>
                        </Collapsible>
                    </div>
                    )}

                    <div className="p-4 text-sm" dangerouslySetInnerHTML={{ __html: selectedMail.body }} />
                </div>
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
      <ComposeMailDialog
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        initialData={composeInitialData}
      />
       <LabelManagerDialog
        open={isLabelManagerOpen}
        onOpenChange={setIsLabelManagerOpen}
        labels={labels}
        onSave={(newLabels) => setLabels(newLabels)}
      />
    </div>
  );
}
