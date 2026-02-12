'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FilePenLine, Plus, Trash2, Upload, Download, MapPin, Map as MapIcon, MoreHorizontal, Copy, Home, Truck, Search, ChevronRight, CornerDownRight, PlusCircle } from 'lucide-react';
import {
  useFirestore,
  useCollection,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
  useFirebaseApp,
  useMemoFirebase,
} from '@/firebase';
import { collection, doc, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { AfspraakDialog } from '@/components/afspraak-dialog';
import { OrganisatieContactDialog } from '@/components/organisatie-contact-dialog';
import { ProjectBestandenDialog } from '@/components/project-bestanden-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { Wijk } from '@/lib/types';
import { WijkMapDialog } from '@/components/wijk-map-dialog';
import { VeegrouteMapDialog } from '@/components/veegroute-map-dialog';
import { PrullenbakkenrouteMapDialog } from '@/components/prullenbakkenroute-map-dialog';
import { RouteStartLocationDialog } from '@/components/route-start-location-dialog';
import { useProfile } from '@/firebase/profile-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useProject } from '@/context/project-context';
import * as turf from '@turf/turf';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Object as MapObject, Project, Werksoort, Veegroute, Prullenbakkenroute, Boekingregel, Bestand, Voertuig, Machine } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingScreen } from '@/components/loading-screen';

const EMPTY_PROJECT: Project = {
  projectnummer: '',
  projectnaam: '',
  locatie: '',
  opdrachtgever: '',
  startdatum: '',
  einddatum: '',
  bestek: '',
  besteknummer: '',
  versie: '',
  datum: '',
  omschrijving: '',
  materieelIds: [],
  werksoorten: [],
  boekingregels: [],
  wijken: [],
  veegroutes: [],
  prullenbakkenroutes: [],
};

export type Afspraak = {
  id?: string;
  onderwerp: string;
  datum: string;
  tijd: string;
  notities: string;
}

export type OrganisatieContact = {
  id?: string;
  naam: string;
  rol: string;
  bedrijf: string;
  telefoon: string;
  email: string;
  wijk?: string;
}

function WerksoortenTab({
  werksoorten,
  setWerksoorten,
  canEdit
}: {
  werksoorten: Werksoort[];
  setWerksoorten: React.Dispatch<React.SetStateAction<Werksoort[]>>;
  canEdit: boolean;
}) {
  const addRow = () => {
    setWerksoorten([
      ...werksoorten,
      {
        id: new Date().toISOString(),
        postnummer: '',
        werksoort: '',
        eenheid: '',
        fictieveH: '',
        uurprijs: '',
      },
    ]);
  };

  const removeRow = (id: string) => {
    setWerksoorten(werksoorten.filter((w) => w.id !== id));
  };

  const handleInputChange = (
    id: string,
    field: keyof Werksoort,
    value: string
  ) => {
    setWerksoorten(
      werksoorten.map((w) => (w.id === id ? { ...w, [field]: value } : w))
    );
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-bold">Postnummer</TableHead>
              <TableHead className="font-bold">Werksoort</TableHead>
              <TableHead className="font-bold">Eenheid</TableHead>
              <TableHead className="font-bold">Calculatie uren</TableHead>
              <TableHead className="font-bold">Uurprijs</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {werksoorten.map((ws) => (
              <TableRow key={ws.id} className="hover:bg-muted/30">
                <TableCell>
                  <Input value={ws.postnummer} onChange={(e) => handleInputChange(ws.id, 'postnummer', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell>
                  <Input value={ws.werksoort} onChange={(e) => handleInputChange(ws.id, 'werksoort', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell>
                  <Input value={ws.eenheid} onChange={(e) => handleInputChange(ws.id, 'eenheid', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell>
                  <Input value={ws.fictieveH} onChange={(e) => handleInputChange(ws.id, 'fictieveH', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell>
                  <Input value={ws.uurprijs} onChange={(e) => handleInputChange(ws.id, 'uurprijs', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell>
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => removeRow(ws.id)} className="h-8 w-8 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {canEdit && <Button variant="outline" size="sm" onClick={addRow}><Plus className="mr-2 h-4 w-4" /> Regel toevoegen</Button>}
    </div>
  );
}

function BoekingregelsTab({ projectId, canEdit }: { projectId: string | undefined; canEdit: boolean; }) {
  const firestore = useFirestore();
  const [newRegelNaam, setNewRegelNaam] = React.useState('');

  const boekingregelsCollection = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return collection(firestore, 'projects', projectId, 'boekingregels');
  }, [firestore, projectId]);

  const { data: boekingregels, isLoading } = useCollection<Boekingregel>(boekingregelsCollection);

  const sortedBoekingregels = React.useMemo(() => {
    if (!boekingregels) return [];
    return [...boekingregels].sort((a, b) => 
      a.naam.localeCompare(b.naam, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [boekingregels]);

  const handleAddRegel = async () => {
    if (!firestore || !projectId || !newRegelNaam.trim()) return;
    const regelData = { naam: newRegelNaam.trim() };
    await addDocumentNonBlocking(collection(firestore, 'projects', projectId, 'boekingregels'), regelData);
    setNewRegelNaam('');
  };

  const handleUpdateRegel = (id: string, newName: string) => {
    if (!firestore || !projectId) return;
    const regelRef = doc(firestore, 'projects', projectId, 'boekingregels', id);
    updateDocumentNonBlocking(regelRef, { naam: newName });
  };
  
  const handleDeleteRegel = (id: string) => {
    if (!firestore || !projectId) return;
    const regelRef = doc(firestore, 'projects', projectId, 'boekingregels', id);
    deleteDocumentNonBlocking(regelRef);
  };
  
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p className="font-bold uppercase text-xs tracking-widest">Selecteer eerst een project om boekingregels te beheren.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Interne Boekingregels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && <div className="flex gap-2">
            <Input 
                placeholder="Nieuwe boekingregel naam"
                value={newRegelNaam}
                onChange={(e) => setNewRegelNaam(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRegel()}
            />
            <Button onClick={handleAddRegel}>Toevoegen</Button>
        </div>}
        <div className="border rounded-md">
            {isLoading ? (
                <div className='p-4 text-center text-muted-foreground'>Boekingregels laden...</div>
            ) : sortedBoekingregels && sortedBoekingregels.length > 0 ? (
                sortedBoekingregels.map(regel => (
                    <div key={regel.id} className="flex items-center gap-2 p-2 border-b last:border-b-0">
                       <Input 
                            defaultValue={regel.naam} 
                            onBlur={(e) => handleUpdateRegel(regel.id, e.target.value)}
                            className="flex-1"
                            disabled={!canEdit}
                       />
                       {canEdit && <Button variant='ghost' size='icon' onClick={() => handleDeleteRegel(regel.id)}>
                            <Trash2 className='h-4 w-4 text-destructive' />
                       </Button>}
                    </div>
                ))
            ) : (
                <div className='p-4 text-center text-muted-foreground'>Nog geen boekingregels voor dit project.</div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}

function AfsprakenTab({ projectId, canEdit, canDelete }: { projectId: string | undefined, canEdit: boolean, canDelete: boolean }) {
  const firestore = useFirestore();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedAfspraak, setSelectedAfspraak] = React.useState<Afspraak | undefined>();

  const afsprakenCollection = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return collection(firestore, 'projects', projectId, 'afspraken');
  }, [firestore, projectId]);

  const { data: afspraken, isLoading } = useCollection<Afspraak>(afsprakenCollection);

  const handleNewAfspraak = () => {
    setSelectedAfspraak(undefined);
    setIsDialogOpen(true);
  };

  const handleEditAfspraak = (afspraak: Afspraak) => {
    setSelectedAfspraak(afspraak);
    setIsDialogOpen(true);
  };
  
  const handleDeleteAfspraak = async (afspraakId: string) => {
    if (!firestore || !projectId) return;
    const afspraakRef = doc(firestore, 'projects', projectId, 'afspraken', afspraakId);
    await deleteDocumentNonBlocking(afspraakRef);
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p className="font-bold uppercase text-xs tracking-widest">Selecteer eerst een project om afspraken te beheren.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className='flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <CardTitle className="text-lg">Afspraken</CardTitle>
        {canEdit && <Button size="sm" onClick={handleNewAfspraak} className="w-full sm:w-auto"><Plus className='mr-2 h-4 w-4' /> Nieuwe afspraak</Button>}
      </CardHeader>
      <CardContent className="p-0 sm:p-6">
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-x-4 p-4 font-semibold bg-muted">
                <div>Onderwerp</div>
                <div>Datum</div>
                <div>Tijd</div>
                <div>Notities</div>
                <div />
            </div>
            {isLoading ? (
                <div className='p-12 text-center text-muted-foreground'><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
            ) : afspraken && afspraken.length > 0 ? (
                afspraken.map(afspraak => (
                <div key={afspraak.id} className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] items-center gap-x-4 p-4 border-t hover:bg-slate-50 transition-colors">
                    <div className='truncate font-bold text-slate-900'>{afspraak.onderwerp}</div>
                    <div className="text-xs">{afspraak.datum}</div>
                    <div className="text-xs">{afspraak.tijd}</div>
                    <div className='truncate text-xs text-slate-500 italic'>{afspraak.notities}</div>
                    <div className='flex items-center gap-1 justify-end'>
                    {canEdit && <Button variant='ghost' size='icon' className="h-8 w-8" onClick={() => handleEditAfspraak(afspraak)}><FilePenLine className='h-4 w-4' /></Button>}
                    {canDelete && <Button variant='ghost' size='icon' className="h-8 w-8 text-red-600" onClick={() => handleDeleteAfspraak(afspraak.id!)}><Trash2 className='h-4 w-4' /></Button>}
                    </div>
                </div>
                ))
            ) : (
                <div className='p-8 text-center text-muted-foreground'>Nog geen afspraken voor dit project.</div>
            )}
          </div>
        </div>
      </CardContent>
      {canEdit && <AfspraakDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        afspraak={selectedAfspraak}
      />}
    </Card>
  );
}

function OrganisatieTab({ projectId, wijken, canEdit, canDelete }: { projectId: string | undefined, wijken?: Wijk[], canEdit: boolean, canDelete: boolean }) {
  const firestore = useFirestore();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedContact, setSelectedContact] = React.useState<OrganisatieContact | undefined>();

  const organisatieCollection = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return collection(firestore, 'projects', projectId, 'organisatie');
  }, [firestore, projectId]);

  const { data: contacten, isLoading } = useCollection<OrganisatieContact>(organisatieCollection);

  const handleNewContact = () => {
    setSelectedContact(undefined);
    setIsDialogOpen(true);
  };

  const handleEditContact = (contact: OrganisatieContact) => {
    setSelectedContact(contact);
    setIsDialogOpen(true);
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!firestore || !projectId) return;
    const contactRef = doc(firestore, 'projects', projectId, 'organisatie', contactId);
    await deleteDocumentNonBlocking(contactRef);
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p className="font-bold uppercase text-xs tracking-widest">Selecteer eerst een project om de organisatie te beheren.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className='flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <CardTitle className="text-lg">Organisatie</CardTitle>
        {canEdit && <Button size="sm" onClick={handleNewContact} className="w-full sm:w-auto"><Plus className='mr-2 h-4 w-4' /> Nieuw Contact</Button>}
      </CardHeader>
      <CardContent className="p-0 sm:p-6">
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[2fr_2fr_2fr_2fr_1fr_1.5fr_auto] gap-x-4 p-4 font-black uppercase tracking-widest text-[10px] text-slate-400 bg-slate-50">
                <div>Naam</div>
                <div>Rol</div>
                <div>Bedrijf</div>
                <div>Wijk</div>
                <div>Telefoon</div>
                <div>Email</div>
                <div />
            </div>
            {isLoading ? (
                <div className='p-12 text-center text-muted-foreground'><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
            ) : contacten && contacten.length > 0 ? (
                contacten.map(contact => (
                <div key={contact.id} className="grid grid-cols-[2fr_2fr_2fr_2fr_1fr_1.5fr_auto] items-center gap-x-4 p-4 border-t hover:bg-slate-50 transition-colors">
                    <div className='truncate font-bold text-slate-900'>{contact.naam}</div>
                    <div className='truncate text-xs text-slate-600'>{contact.rol}</div>
                    <div className='truncate text-xs text-slate-500 font-medium'>{contact.bedrijf || '-'}</div>
                    <div className='truncate text-xs font-bold'>{contact.wijk || '-'}</div>
                    <div className='truncate text-[11px]'>{contact.telefoon}</div>
                    <div className='truncate text-[11px] text-blue-600'>{contact.email}</div>
                    <div className='flex items-center gap-1 justify-end'>
                    {canEdit && <Button variant='ghost' size='icon' className="h-8 w-8" onClick={() => handleEditContact(contact)}><FilePenLine className='h-4 w-4' /></Button>}
                    {canDelete && <Button variant='ghost' size='icon' className="h-8 w-8 text-red-600" onClick={() => handleDeleteContact(contact.id!)}><Trash2 className='h-4 w-4' /></Button>}
                    </div>
                </div>
                ))
            ) : (
                <div className='p-8 text-center text-muted-foreground'>Nog geen contacten voor dit project.</div>
            )}
          </div>
        </div>
      </CardContent>
      {canEdit && <OrganisatieContactDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        contact={selectedContact}
        wijken={wijken}
      />}
    </Card>
  );
}

function BestandenTab({ projectId, canEdit, canDelete }: { projectId: string | undefined, canEdit: boolean, canDelete: boolean }) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const bestandenCollection = useMemoFirebase(() => {
    if (!firestore || !projectId) return null;
    return collection(firestore, 'projects', projectId, 'bestanden');
  }, [firestore, projectId]);

  const { data: bestanden, isLoading } = useCollection<Bestand>(bestandenCollection);
  
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  const handleDeleteBestand = async (e: React.MouseEvent, bestand: Bestand) => {
    e.stopPropagation();
    e.preventDefault();
    if (!firestore || !app || !projectId) return;

    const bestandDocRef = doc(firestore, 'projects', projectId, 'bestanden', bestand.id);
    const storageRef = ref(getStorage(app), bestand.storagePath);
    
    try {
      await deleteObject(storageRef);
      await deleteDocumentNonBlocking(bestandDocRef);
    } catch (error) {
      console.error("Fout bij het verwijderen van het bestand:", error);
    }
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p className="font-bold uppercase text-xs tracking-widest">Selecteer eerst een project om bestanden te beheren.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className='flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <CardTitle className="text-lg">Bestanden</CardTitle>
        {canEdit && <Button size="sm" onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto"><Upload className='mr-2 h-4 w-4' /> Bestanden uploaden</Button>}
      </CardHeader>
      <CardContent className="p-0 sm:p-6">
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[3fr_1fr_1fr_1fr_auto] gap-x-4 p-4 font-black uppercase tracking-widest text-[10px] text-slate-400 bg-slate-50">
                <div>Bestandsnaam</div>
                <div>Type</div>
                <div>Grootte</div>
                <div>Datum</div>
                <div />
            </div>
            {isLoading ? (
                <div className='p-12 text-center text-muted-foreground'><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
            ) : bestanden && bestanden.length > 0 ? (
                bestanden.map(bestand => (
                <div
                    key={bestand.id} 
                    className="grid grid-cols-[3fr_1fr_1fr_1fr_auto] items-center gap-x-4 p-4 border-t hover:bg-slate-50 transition-colors"
                >
                    <a 
                    href={bestand.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className='truncate font-bold text-blue-600 hover:underline text-sm'
                    >
                    {bestand.name}
                    </a>
                    <div className="truncate text-xs text-slate-500 uppercase">{bestand.type.split('/')[1] || bestand.type}</div>
                    <div className="text-xs">{formatBytes(bestand.size)}</div>
                    <div className="text-xs">{new Date(bestand.uploadedAt).toLocaleDateString('nl-NL')}</div>
                    <div className='flex items-center gap-1 justify-end'>
                        <a href={bestand.url} download={bestand.name}>
                            <Button variant='ghost' size='icon' className="h-8 w-8">
                                <Download className='h-4 w-4' />
                            </Button>
                        </a>
                    {canDelete && <Button variant='ghost' size='icon' className="h-8 w-8 text-red-600" onClick={(e) => handleDeleteBestand(e, bestand)}>
                        <Trash2 className='h-4 w-4' />
                    </Button>}
                    </div>
                </div>
                ))
            ) : (
                <div className='p-8 text-center text-muted-foreground'>Nog geen bestanden geüpload.</div>
            )}
          </div>
        </div>
      </CardContent>
      {canEdit && <ProjectBestandenDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        folderId={null} 
      />}
    </Card>
  );
}

function WijkenTab({
  wijken,
  setCurrentProject,
  canEdit,
  projectId,
  firestore,
}: {
  wijken: Wijk[];
  setCurrentProject: React.Dispatch<React.SetStateAction<Project>>;
  canEdit: boolean;
  projectId?: string;
  firestore: any;
}) {
  const [mapWijk, setMapWijk] = React.useState<Wijk | null>(null);

  const sortedWijken = React.useMemo(() => {
    if (!wijken) return [];
    return [...wijken].sort((a, b) =>
      a.naam.localeCompare(b.naam, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [wijken]);

  const setWijken = (updater: Wijk[] | ((prev: Wijk[]) => Wijk[])) => {
    setCurrentProject(prevProject => ({
      ...prevProject,
      wijken: typeof updater === 'function' ? updater(prevProject.wijken || []) : updater,
    }));
  };

  const addRow = () => {
    setWijken(prev => [
      ...(prev || []),
      {
        id: new Date().toISOString(),
        naam: '',
        locatie: '',
        subGebieden: '[]',
      },
    ]);
  };

  const removeRow = (id: string) => {
    setWijken(prev => (prev || []).filter((w) => w.id !== id));
  };

  const handleInputChange = (
    id: string,
    field: keyof Wijk,
    value: string
  ) => {
    setWijken(prev => (prev || []).map((w) => (w.id === id ? { ...w, [field]: value } : w)));
  };
  
  const handleSaveCoordinates = async (wijkId: string, coordinates: string) => {
    if (!firestore || !projectId) return;
    const updatedWijken = (wijken || []).map(w => 
      w.id === wijkId ? { ...w, subGebieden: coordinates } : w
    );
    const projectRef = doc(firestore, 'projects', projectId);
    await updateDocumentNonBlocking(projectRef, { wijken: updatedWijken });
    setCurrentProject(prev => ({ ...prev, wijken: updatedWijken }));
  };

  const handleCopyToVeegroutes = (wijkToCopy: Wijk) => {
    setCurrentProject(prevProject => ({
      ...prevProject,
      veegroutes: [
        ...(prevProject.veegroutes || []),
        {
          ...wijkToCopy,
          id: new Date().toISOString() + Math.random(),
          roadTypes: []
        }
      ],
    }));
  };

  const handleCopyToPrullenbakkenroutes = (wijkToCopy: Wijk) => {
    setCurrentProject(prevProject => ({
      ...prevProject,
      prullenbakkenroutes: [
        ...(prevProject.prullenbakkenroutes || []),
        {
          ...wijkToCopy,
          id: new Date().toISOString() + Math.random(),
        }
      ],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-bold">Wijknaam</TableHead>
              <TableHead className="font-bold">Locatie</TableHead>
              <TableHead className="font-bold text-center">Kaart</TableHead>
              <TableHead className="w-[100px] text-right">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedWijken.map((wijk) => (
              <TableRow key={wijk.id} className="hover:bg-muted/30">
                <TableCell>
                  <Input value={wijk.naam} onChange={(e) => handleInputChange(wijk.id, 'naam', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell>
                  <Input value={wijk.locatie} onChange={(e) => handleInputChange(wijk.id, 'locatie', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell className="text-center">
                  <Button variant="outline" size="sm" onClick={() => setMapWijk(wijk)}>
                    <MapPin className="mr-2 h-4 w-4" />
                    {canEdit ? 'Bewerken' : 'Bekijken'}
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleCopyToVeegroutes(wijk)}>
                          <Copy className="mr-2 h-4 w-4" /> Kopieer naar Veegroutes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopyToPrullenbakkenroutes(wijk)}>
                          <Copy className="mr-2 h-4 w-4" /> Kopieer naar Prullenbakken
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => removeRow(wijk.id)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {canEdit && <Button variant="outline" size="sm" onClick={addRow}><Plus className="mr-2 h-4 w-4" /> Wijk toevoegen</Button>}
      
      {mapWijk && (
        <WijkMapDialog
          open={!!mapWijk}
          onOpenChange={(open) => !open && setMapWijk(null)}
          wijk={mapWijk}
          onSave={handleSaveCoordinates}
          readOnly={!canEdit}
        />
      )}
    </div>
  );
}

function VeegroutesTab({
  veegroutes,
  setCurrentProject,
  canEdit,
  projectId,
  firestore
}: {
  veegroutes: Veegroute[];
  setCurrentProject: React.Dispatch<React.SetStateAction<Project>>;
  canEdit: boolean;
  projectId?: string;
  firestore: any;
}) {
  const [mapRoute, setMapRoute] = React.useState<Veegroute | null>(null);

  const sortedRoutes = React.useMemo(() => {
    if (!veegroutes) return [];
    return [...veegroutes].sort((a, b) =>
      a.naam.localeCompare(b.naam, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [veegroutes]);

  const setVeegroutes = (updater: Veegroute[] | ((prev: Veegroute[]) => Veegroute[])) => {
    setCurrentProject(prevProject => ({
      ...prevProject,
      veegroutes: typeof updater === 'function' ? updater(prevProject.veegroutes || []) : updater,
    }));
  };

  const addRow = () => {
    setVeegroutes(prev => [
      ...(prev || []),
      {
        id: new Date().toISOString(),
        naam: '',
        locatie: '',
        subGebieden: '[]',
        roadTypes: [],
      },
    ]);
  };

  const removeRow = (id: string) => {
    setVeegroutes(prev => (prev || []).filter((r) => r.id !== id));
  };

  const handleInputChange = (
    id: string,
    field: keyof Veegroute,
    value: string
  ) => {
    setVeegroutes(prev => (prev || []).map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  
  const handleSaveCoordinates = async (routeId: string, coordinates: string, roadTypes: string[]) => {
    if (!firestore || !projectId) return;
    const updatedVeegroutes = (veegroutes || []).map(r =>
      r.id === routeId ? { ...r, subGebieden: coordinates, roadTypes: roadTypes } : r
    );
    const projectRef = doc(firestore, 'projects', projectId);
    await updateDocumentNonBlocking(projectRef, { veegroutes: updatedVeegroutes });
    setCurrentProject(prev => ({ ...prev, veegroutes: updatedVeegroutes }));
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-bold">Veegroute</TableHead>
              <TableHead className="font-bold">Locatie</TableHead>
              <TableHead className="font-bold text-center">Kaart</TableHead>
              <TableHead className="w-[100px] text-right">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRoutes.map((route) => (
              <TableRow key={route.id} className="hover:bg-muted/30">
                <TableCell>
                  <Input value={route.naam} onChange={(e) => handleInputChange(route.id, 'naam', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell>
                  <Input value={route.locatie} onChange={(e) => handleInputChange(route.id, 'locatie', e.target.value)} disabled={!canEdit} className="h-8" />
                </TableCell>
                <TableCell className="text-center">
                  <Button variant="outline" size="sm" onClick={() => setMapRoute(route)}>
                    <MapPin className="mr-2 h-4 w-4" />
                    {canEdit ? 'Bewerken' : 'Bekijken'}
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => removeRow(route.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {canEdit && <Button variant="outline" size="sm" onClick={addRow}><Plus className="mr-2 h-4 w-4" /> Veegroute toevoegen</Button>}
      
      {mapRoute && (
        <VeegrouteMapDialog
          open={!!mapRoute}
          onOpenChange={(open) => !open && setMapRoute(null)}
          route={mapRoute}
          onSave={handleSaveCoordinates}
          readOnly={!canEdit}
        />
      )}
    </div>
  );
}

function PrullenbakkenroutesTab({
  prullenbakkenroutes,
  setCurrentProject,
  canEdit,
  projectId,
  firestore,
  objectCounts,
  totalObjects,
  allObjects,
}: {
  prullenbakkenroutes: Prullenbakkenroute[];
  setCurrentProject: React.Dispatch<React.SetStateAction<Project>>;
  canEdit: boolean;
  projectId?: string;
  firestore: any;
  objectCounts: { [routeId: string]: number };
  totalObjects: number;
  allObjects: MapObject[] | null;
}) {
  const [mapRoute, setMapRoute] = React.useState<Prullenbakkenroute | null>(null);
  const [startLocRoute, setStartLocRoute] = React.useState<Prullenbakkenroute | null>(null);

  const sortedRoutes = React.useMemo(() => {
    if (!prullenbakkenroutes) return [];
    
    // Primarily group by parentId
    const roots = prullenbakkenroutes.filter(r => !r.parentId).sort((a, b) => a.naam.localeCompare(b.naam, undefined, { numeric: true }));
    const result: Prullenbakkenroute[] = [];

    roots.forEach(root => {
      result.push(root);
      const children = prullenbakkenroutes.filter(c => c.parentId === root.id).sort((a, b) => a.naam.localeCompare(b.naam, undefined, { numeric: true }));
      result.push(...children);
    });
    
    // Add any that might be orphaned
    const processedIds = new Set(result.map(r => r.id));
    const orphans = prullenbakkenroutes.filter(r => !processedIds.has(r.id));
    result.push(...orphans);

    return result;
  }, [prullenbakkenroutes]);

  const totalObjectsInRoutes = React.useMemo(() => {
    if (!prullenbakkenroutes || !allObjects) return 0;
    const routeNames = new Set(prullenbakkenroutes.map(r => r.naam));
    const uniqueObjectsInRoutes = allObjects.filter(obj => 
      Array.isArray(obj.locatieWerkgebieden) && 
      obj.locatieWerkgebieden.some(gebied => routeNames.has(gebied))
    );
    return uniqueObjectsInRoutes.length;
  }, [allObjects, prullenbakkenroutes]);

  const setPrullenbakkenroutes = (updater: Prullenbakkenroute[] | ((prev: Prullenbakkenroute[]) => Prullenbakkenroute[])) => {
    setCurrentProject(prevProject => ({
      ...prevProject,
      prullenbakkenroutes: typeof updater === 'function' ? updater(prevProject.prullenbakkenroutes || []) : updater,
    }));
  };

  const addRow = () => {
    setPrullenbakkenroutes(prev => [
      ...(prev || []),
      {
        id: new Date().toISOString() + Math.random(),
        naam: '',
        locatie: '',
        subGebieden: '[]',
        parentId: null,
      },
    ]);
  };

  const addSubRoute = (parent: Prullenbakkenroute) => {
    setPrullenbakkenroutes(prev => [
      ...(prev || []),
      {
        id: new Date().toISOString() + Math.random(),
        naam: `${parent.naam} - `,
        locatie: parent.locatie,
        subGebieden: '[]',
        parentId: parent.id,
        startAdres: parent.startAdres,
        startLatitude: parent.startLatitude,
        startLongitude: parent.startLongitude,
      },
    ]);
  };

  const removeRow = (id: string) => {
    setPrullenbakkenroutes(prev => (prev || []).filter((r) => r.id !== id));
  };

  const handleInputChange = (
    id: string,
    field: keyof Prullenbakkenroute,
    value: any
  ) => {
    setPrullenbakkenroutes(prev => (prev || []).map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  
  const handleSaveCoordinates = async (routeId: string, coordinates: string) => {
    if (!firestore || !projectId) return;
    const updatedRoutes = (prullenbakkenroutes || []).map(r =>
      r.id === routeId ? { ...r, subGebieden: coordinates } : r
    );
    const projectRef = doc(firestore, 'projects', projectId);
    await updateDocumentNonBlocking(projectRef, { prullenbakkenroutes: updatedRoutes });
    setCurrentProject(prev => ({ ...prev, prullenbakkenroutes: updatedRoutes }));
  };

  const handleSaveStartLocation = async (routeId: string, address: string, lat: number, lng: number) => {
    if (!firestore || !projectId) return;
    const updatedRoutes = (prullenbakkenroutes || []).map(r =>
      r.id === routeId ? { ...r, startAdres: address, startLatitude: lat, startLongitude: lng } : r
    );
    const projectRef = doc(firestore, 'projects', projectId);
    await updateDocumentNonBlocking(projectRef, { prullenbakkenroutes: updatedRoutes });
    setCurrentProject(prev => ({ ...prev, prullenbakkenroutes: updatedRoutes }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">
          Totaal objecten project: <span className="text-slate-900">{totalObjects}</span>
        </h3>
      </div>
      
      <div className="border-2 border-black rounded-lg overflow-hidden bg-white shadow-sm overflow-x-auto">
        <Table className="border-collapse table-fixed w-full border-black min-w-[1000px]">
          <TableHeader className="bg-slate-100 border-b-2 border-black">
            <TableRow className="hover:bg-transparent h-12">
              <TableHead className="font-black text-black uppercase tracking-tighter text-[11px] w-[300px] border-r border-black">Prullenbakkenroute (↳ Sub)</TableHead>
              <TableHead className="font-black text-black uppercase tracking-tighter text-[11px] w-[180px] border-r border-black">Hoofdroute</TableHead>
              <TableHead className="font-black text-black uppercase tracking-tighter text-[11px] w-[200px] border-r border-black">Locatie</TableHead>
              <TableHead className="font-black text-black uppercase tracking-tighter text-[11px] w-[80px] text-center border-r border-black">Units</TableHead>
              <TableHead className="font-black text-black uppercase tracking-tighter text-[11px] w-[120px] text-center border-r border-black">Kaart</TableHead>
              <TableHead className="font-black text-black uppercase tracking-tighter text-[11px] w-[120px] text-center border-r border-black">Startpunt</TableHead>
              <TableHead className="w-[80px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRoutes.map((route) => {
              const isSub = !!route.parentId;
              return (
                <TableRow key={route.id} className={cn(
                    "hover:bg-slate-50/50 transition-colors h-14",
                    isSub ? "bg-slate-50/40" : "bg-white"
                )}>
                  <TableCell className="p-2 align-middle border-r border-black">
                    <div className={cn("flex items-center gap-2", isSub && "pl-6")}>
                      {isSub && <CornerDownRight className="h-4 w-4 text-slate-400 shrink-0" />}
                      <Input 
                          value={route.naam} 
                          placeholder={isSub ? "Naam sub-route..." : "Naam hoofdroute..."}
                          onChange={(e) => handleInputChange(route.id, 'naam', e.target.value)} 
                          disabled={!canEdit}
                          className={cn(
                              "h-9 text-sm border-slate-300 focus:ring-2 focus:ring-primary/20", 
                              isSub ? "font-medium italic text-slate-600" : "font-black text-black"
                          )}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="p-2 align-middle border-r border-black">
                      <Select 
                          value={route.parentId || 'none'} 
                          onValueChange={(val) => handleInputChange(route.id, 'parentId', val === 'none' ? null : val)}
                          disabled={!canEdit}
                      >
                          <SelectTrigger className="h-9 border-slate-300 text-xs font-bold text-slate-700">
                              <SelectValue placeholder="Kies hoofdroute" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="none">-- Geen (Hoofd) --</SelectItem>
                              {prullenbakkenroutes
                                  .filter(r => r.id !== route.id && !r.parentId)
                                  .map(r => (
                                      <SelectItem key={r.id} value={r.id}>{r.naam}</SelectItem>
                                  ))
                              }
                          </SelectContent>
                      </Select>
                  </TableCell>
                  <TableCell className="p-2 align-middle border-r border-black">
                    <Input 
                      value={route.locatie} 
                      placeholder="Stad / Wijk..."
                      onChange={(e) => handleInputChange(route.id, 'locatie', e.target.value)} 
                      disabled={!canEdit}
                      className="h-9 text-sm border-slate-300 font-medium"
                    />
                  </TableCell>
                  <TableCell className="p-2 align-middle text-center border-r border-black">
                    <Badge variant="secondary" className="font-mono text-[11px] font-black h-6 px-2 min-w-[35px] justify-center bg-slate-100 text-slate-700 border border-slate-300">
                        {objectCounts[route.id] ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-2 align-middle text-center border-r border-black">
                    <Button variant="outline" size="sm" onClick={() => setMapRoute(route)} className="h-9 w-full border-slate-300 hover:bg-slate-100 text-[11px] font-black uppercase tracking-tighter gap-2 shadow-sm">
                      <MapIcon className="h-3.5 w-3.5" />
                      Gebied
                    </Button>
                  </TableCell>
                  <TableCell className="p-2 align-middle text-center border-r border-black">
                    <Button variant={route.startAdres ? "secondary" : "outline"} size="sm" onClick={() => setStartLocRoute(route)} className={cn("h-9 w-full border-slate-300 text-[11px] font-black uppercase tracking-tighter gap-2 shadow-sm", route.startAdres && "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200")}>
                      <Home className="h-3.5 w-3.5" />
                      {route.startAdres ? 'Info' : 'Instellen'}
                    </Button>
                  </TableCell>
                  <TableCell className="p-2 align-middle text-right">
                    <div className="flex justify-end gap-1">
                        {!isSub && canEdit && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={() => addSubRoute(route)} className="h-9 w-9 text-blue-600 hover:bg-blue-50">
                                            <PlusCircle className="h-4.5 w-4.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Sub-route +</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => removeRow(route.id)} className="h-9 w-9 text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="h-4.5 w-4.5" />
                        </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter className="bg-slate-200 border-t-2 border-black">
            <TableRow className="hover:bg-transparent h-14">
              <TableCell colSpan={3} className="font-black uppercase tracking-widest text-[10px] text-slate-600 pl-4 border-r border-black">Totaal unieke objecten in alle routes</TableCell>
              <TableCell className="text-center border-r border-black">
                  <Badge className="bg-black text-white font-mono text-xs px-2.5 py-1">{totalObjectsInRoutes}</Badge>
              </TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {canEdit && (
        <div className="flex justify-start pt-2">
            <Button variant="outline" onClick={addRow} className="border-2 border-dashed border-black hover:bg-slate-50 font-black uppercase tracking-widest text-xs py-6 px-8 rounded-xl transition-all w-full sm:w-auto">
                <Plus className="mr-2 h-5 w-5" /> Nieuwe Hoofdroute Toevoegen
            </Button>
        </div>
      )}
      
      {mapRoute && (
        <PrullenbakkenrouteMapDialog
          open={!!mapRoute}
          onOpenChange={(open) => !open && setMapRoute(null)}
          route={mapRoute}
          allPrullenbakkenroutes={prullenbakkenroutes}
          onSave={handleSaveCoordinates}
          readOnly={!canEdit}
        />
      )}
      {startLocRoute && (
        <RouteStartLocationDialog
          open={!!startLocRoute}
          onOpenChange={(open) => !open && setStartLocRoute(null)}
          routeName={startLocRoute.naam}
          initialAddress={startLocRoute.startAdres}
          initialLat={startLocRoute.startLatitude}
          initialLng={startLocRoute.startLongitude}
          onSave={(address, lat, lng) => handleSaveStartLocation(startLocRoute.id, address, lat, lng)}
        />
      )}
    </div>
  );
}

function VoertuigenTab({
  assignedIds,
  onToggle,
  canEdit
}: {
  assignedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
  canEdit: boolean;
}) {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = React.useState('');

  const voertuigenCol = useMemoFirebase(() => firestore ? collection(firestore, 'voertuigen') : null, [firestore]);
  const machinesCol = useMemoFirebase(() => firestore ? collection(firestore, 'machines') : null, [firestore]);

  const { data: voertuigen } = useCollection<Voertuig>(voertuigenCol);
  const { data: machines } = useCollection<Machine>(machinesCol);

  const allMaterieel = React.useMemo(() => {
    const list: any[] = [];
    if (voertuigen) list.push(...voertuigen.map(v => ({ ...v, type: 'Voertuig' })));
    if (machines) list.push(...machines.map(m => ({ ...m, type: 'Machine' })));
    return list.sort((a, b) => {
      const numA = a.voertuignummer || a.machinenummer || a.id;
      const numB = b.voertuignummer || b.machinenummer || b.id;
      return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [voertuigen, machines]);

  const filtered = allMaterieel.filter(m => {
    const query = searchTerm.toLowerCase();
    return (
      m.id.toLowerCase().includes(query) ||
      (m.voertuignummer || '').toLowerCase().includes(query) ||
      (m.machinenummer || '').toLowerCase().includes(query) ||
      (m.merk || '').toLowerCase().includes(query) ||
      (m.model || '').toLowerCase().includes(query)
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Project Materieel</CardTitle>
        <p className="text-sm text-muted-foreground">Koppel voertuigen en machines aan dit project om ze beschikbaar te maken in de werkplanning.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoek materieel..." 
            className="pl-9 h-10" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="border rounded-md">
          <ScrollArea className="h-[400px]">
            <div className="divide-y">
              {filtered.map((item) => {
                const isAssigned = assignedIds.includes(item.id);
                const number = item.voertuignummer || item.machinenummer || '-';
                return (
                  <div key={item.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <Checkbox 
                        id={`mat-${item.id}`} 
                        checked={isAssigned} 
                        onCheckedChange={(checked) => onToggle(item.id, !!checked)}
                        disabled={!canEdit}
                      />
                      <div className="flex flex-col">
                        <Label htmlFor={`mat-${item.id}`} className="font-bold text-sm cursor-pointer">{number} - {item.merk} {item.model}</Label>
                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{item.type} | {item.id}</span>
                      </div>
                    </div>
                    {isAssigned && <Badge className="bg-green-100 text-green-700 border-green-200 h-5 text-[9px] font-black uppercase px-2">Gekoppeld</Badge>}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                    <Truck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold uppercase text-xs tracking-widest">Geen materieel gevonden.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}


export default function ProjectsPage() {
  const firestore = useFirestore();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [currentProject, setCurrentProject] = React.useState<Project>(EMPTY_PROJECT);
  const [isEndDateHeden, setIsEndDateHeden] = React.useState(false);
  const [isGlobalWijkMapOpen, setIsGlobalWijkMapOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('project');

  const isSuperUser = profile?.role === 'Super admin';
  const canCreate = isSuperUser || !!profile?.permissions?.projects?.create;
  const canEdit = isSuperUser || !!profile?.permissions?.projects?.edit;
  const canDelete = isSuperUser || !!profile?.permissions?.projects?.delete;

  const projectsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading } = useCollection<Project>(
    projectsCollection
  );
  
  const objectsCollection = useMemoFirebase(() => {
    if (!firestore || activeTab !== 'prullenbakkenroutes') return null;
    return collection(firestore, 'objects');
  }, [firestore, activeTab]);

  const { data: allObjects } = useCollection<MapObject>(objectsCollection);

  const objectCountsPerPrullenbakkenroute = React.useMemo(() => {
    if (!allObjects || !currentProject.prullenbakkenroutes) return {};
    const counts: { [routeId: string]: number } = {};
    for (const route of currentProject.prullenbakkenroutes) {
        const objectsInRoute = allObjects.filter(obj => 
            Array.isArray(obj.locatieWerkgebieden) && obj.locatieWerkgebieden.includes(route.naam)
        );
        counts[route.id] = objectsInRoute.length;
    }
    return counts;
  }, [allObjects, currentProject.prullenbakkenroutes]);

  const allWijkenFeatures = React.useMemo(() => {
    if (!projects) return [];
    const projectsToUse = selectedProjectId ? projects.filter(p => p.id === selectedProjectId) : projects;

    return projectsToUse.flatMap(p => 
      (p.wijken || []).flatMap(wijk => {
        try {
          const features = JSON.parse(wijk.subGebieden);
          return features.map((feature: any) => ({
            ...feature,
            properties: { ...feature.properties, wijkNaam: wijk.naam },
          }));
        } catch {
          return [];
        }
      })
    );
  }, [projects, selectedProjectId]);

  const generateProjectNumber = () => {
    const year = new Date().getFullYear();
    const randomNumber = Math.floor(10000 + Math.random() * 90000);
    return `${year}-${randomNumber}`;
  };

  React.useEffect(() => {
    if (selectedProjectId) {
      const project = projects?.find((p) => p.id === selectedProjectId);
      if (project) {
        setCurrentProject({
            ...EMPTY_PROJECT,
            ...project,
            materieelIds: project.materieelIds || [],
            wijken: project.wijken || [],
            veegroutes: project.veegroutes || [],
            prullenbakkenroutes: project.prullenbakkenroutes || [],
        });
        if (project.einddatum === format(new Date(), 'yyyy-MM-dd')) {
            setIsEndDateHeden(true);
        } else {
            setIsEndDateHeden(false);
        }
      } else {
        if (projects) { 
             setSelectedProjectId(null);
        }
      }
    } else {
        setCurrentProject({
            ...EMPTY_PROJECT,
            projectnummer: generateProjectNumber(),
        });
        setIsEndDateHeden(false);
    }
  }, [selectedProjectId, projects, setSelectedProjectId]);

  const handleNew = () => {
    setSelectedProjectId(null);
  };
  
  const handleProjectSelect = (projectId: string) => {
    if (projectId === 'new') {
      handleNew();
    } else {
      setSelectedProjectId(projectId);
    }
  };
  
  const handleInputChange = (field: keyof Project, value: string) => {
      setCurrentProject(prev => ({...prev, [field]: value}));
  }

  const handleHedenCheckboxChange = (checked: boolean) => {
      setIsEndDateHeden(checked);
      if (checked) {
          handleInputChange('einddatum', format(new Date(), 'yyyy-MM-dd'));
      }
  }

  const handleSave = async () => {
    if (!firestore || !canEdit) return;
    const projectToSave = JSON.parse(JSON.stringify(currentProject));

    if (projectToSave.id) {
      const projectRef = doc(firestore, 'projects', projectToSave.id);
      updateDocumentNonBlocking(projectRef, projectToSave);
    } else {
      const projectsColRef = collection(firestore, 'projects');
      const newDocRef = await addDocumentNonBlocking(projectsColRef, projectToSave);
      setSelectedProjectId(newDocRef.id);
    }
  };
  

  const handleDelete = async () => {
    if (!firestore || !currentProject.id || !canDelete) return;
    const projectRef = doc(firestore, 'projects', currentProject.id);
    await deleteDocumentNonBlocking(projectRef);
    handleNew();
  };
  
  const canViewTab = (tabId: string) => {
    if (isSuperUser) return true;
    return profile?.permissions?.projects?.tabs?.[tabId] ?? true;
  };

  const handleToggleMaterieel = (id: string, checked: boolean) => {
    setCurrentProject(prev => {
      const currentIds = prev.materieelIds || [];
      const newIds = checked ? [...currentIds, id] : currentIds.filter(i => i !== id);
      return { ...prev, materieelIds: newIds };
    });
  };

  if (isLoading || isProfileLoading) {
    return <LoadingScreen message="Projecten laden..." />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 md:px-6 pt-4 md:pt-6 overflow-x-auto no-scrollbar">
          <TabsList className="w-max inline-flex">
            {canViewTab('project') && <TabsTrigger value="project">Project</TabsTrigger>}
            {canViewTab('voertuigen') && <TabsTrigger value="voertuigen">Voertuigen</TabsTrigger>}
            {canViewTab('werksoorten') && <TabsTrigger value="werksoorten">Werksoorten</TabsTrigger>}
            {canViewTab('boekingregels') && <TabsTrigger value="boekingregels">Boekingregels</TabsTrigger>}
            {canViewTab('afspraken') && <TabsTrigger value="afspraken">Afspraken</TabsTrigger>}
            {canViewTab('organisatie') && <TabsTrigger value="organisatie">Organisatie</TabsTrigger>}
            {canViewTab('wijken') && <TabsTrigger value="wijken">Wijken</TabsTrigger>}
            {canViewTab('veegroutes') && <TabsTrigger value="veegroutes">Veegroutes</TabsTrigger>}
            {canViewTab('prullenbakkenroutes') && <TabsTrigger value="prullenbakkenroutes">Prullenbakkenroutes</TabsTrigger>}
          </TabsList>
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mt-6 px-4 md:px-6">
          <div className="flex items-center gap-3 w-full md:flex-1">
            <Label
                htmlFor="select-project"
                className="font-bold uppercase text-[10px] tracking-widest text-slate-400 whitespace-nowrap"
            >
                Project:
            </Label>
            <Select
                value={selectedProjectId || 'new'}
                onValueChange={handleProjectSelect}
                disabled={isLoading}
            >
                <SelectTrigger className="w-full md:max-w-lg h-10 font-bold">
                <SelectValue placeholder="Selecteer een project" />
                </SelectTrigger>
                <SelectContent>
                {canCreate && <SelectItem value="new">-- Nieuw Project --</SelectItem>}
                {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id!}>
                    {project.projectnaam} [{project.projectnummer}]
                    </SelectItem>
                ))}
                </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="w-full md:w-auto h-10 font-bold" onClick={() => setIsGlobalWijkMapOpen(true)}>
            <MapIcon className="mr-2 h-4 w-4" />
            {selectedProjectId ? 'Toon Project Wijken' : 'Toon Alle Wijken'}
          </Button>
        </div>

        {canViewTab('project') && <TabsContent
          value="project"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-4 md:px-6"
        >
          <div className="space-y-6">
            <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b p-4">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Project Basisgegevens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <div className="space-y-1.5">
                        <Label htmlFor="projectnummer" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Projectnummer</Label>
                        <Input id="projectnummer" value={currentProject.projectnummer} className="h-10 font-bold bg-slate-50" disabled />
                    </div>
                     <div className="space-y-1.5">
                        <Label htmlFor="projectnaam" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Projectnaam</Label>
                        <Input id="projectnaam" value={currentProject.projectnaam} onChange={(e) => handleInputChange('projectnaam', e.target.value)} disabled={!canEdit} className="h-10 font-bold" />
                    </div>
                     <div className="space-y-1.5">
                        <Label htmlFor="locatie" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Locatie</Label>
                        <Input id="locatie" value={currentProject.locatie} onChange={(e) => handleInputChange('locatie', e.target.value)} disabled={!canEdit} className="h-10 font-bold" />
                    </div>
                     <div className="space-y-1.5">
                        <Label htmlFor="opdrachtgever" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Opdrachtgever</Label>
                        <Input id="opdrachtgever" value={currentProject.opdrachtgever} onChange={(e) => handleInputChange('opdrachtgever', e.target.value)} disabled={!canEdit} className="h-10 font-bold" />
                    </div>
                     <div className="space-y-1.5">
                        <Label htmlFor="startdatum" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Startdatum</Label>
                        <Input id="startdatum" type="date" value={currentProject.startdatum} onChange={(e) => handleInputChange('startdatum', e.target.value)} disabled={!canEdit} className="h-10 font-bold" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="einddatum" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Einddatum</Label>
                        <Input id="einddatum" type="date" value={currentProject.einddatum} onChange={(e) => handleInputChange('einddatum', e.target.value)} disabled={isEndDateHeden || !canEdit} className="h-10 font-bold" />
                        <div className="flex items-center space-x-2 pl-1">
                            <Checkbox id="heden" checked={isEndDateHeden} onCheckedChange={(checked) => handleHedenCheckboxChange(!!checked)} disabled={!canEdit} />
                            <label htmlFor="heden" className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none cursor-pointer">Lopend (Heden)</label>
                        </div>
                    </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b p-4">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Bestek & Versiebeheer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                   <div className="space-y-1.5">
                        <Label htmlFor="bestek" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bestek</Label>
                        <Input id="bestek" value={currentProject.bestek} onChange={(e) => handleInputChange('bestek', e.target.value)} disabled={!canEdit} className="h-10 font-bold" />
                    </div>
                     <div className="space-y-1.5">
                        <Label htmlFor="besteknummer" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Besteknummer</Label>
                        <Input id="besteknummer" value={currentProject.besteknummer} onChange={(e) => handleInputChange('besteknummer', e.target.value)} disabled={!canEdit} className="h-10 font-bold" />
                    </div>
                     <div className="space-y-1.5">
                        <Label htmlFor="versie" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Versie</Label>
                        <Input id="versie" value={currentProject.versie} onChange={(e) => handleInputChange('versie', e.target.value)} disabled={!canEdit} className="h-10 font-bold" />
                    </div>
                     <div className="space-y-1.5">
                        <Label htmlFor="datum" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Publicatiedatum</Label>
                        <Input id="datum" type="date" value={currentProject.datum} onChange={(e) => handleInputChange('datum', e.target.value)} disabled={!canEdit} className="h-10 font-bold" />
                    </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b p-4">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">
                  Projectomschrijving
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <Textarea rows={6} value={currentProject.omschrijving} onChange={(e) => handleInputChange('omschrijving', e.target.value)} disabled={!canEdit} className="resize-none font-medium leading-relaxed" placeholder="Geef hier een gedetailleerde omschrijving van het project en de specifieke werkzaamheden..." />
              </CardContent>

              <div className="flex flex-col sm:flex-row justify-start gap-3 p-6 pt-0">
                {canEdit && <Button onClick={handleSave} className="h-11 px-8 font-black uppercase tracking-tight">Project Opslaan</Button>}
                {canCreate && <Button variant="outline" onClick={handleNew} className="h-11 px-8 font-black uppercase tracking-tight">Nieuw Project</Button>}
                {canDelete && <Button variant="destructive" onClick={handleDelete} disabled={!currentProject.id} className="h-11 px-8 font-black uppercase tracking-tight sm:ml-auto">Verwijderen</Button>}
              </div>
            </Card>
          </div>
        </TabsContent>}
        {canViewTab('voertuigen') && <TabsContent value="voertuigen" className="flex-1 overflow-y-auto pt-6 pb-2 px-4 md:px-6">
          <VoertuigenTab 
            assignedIds={currentProject.materieelIds || []} 
            onToggle={handleToggleMaterieel}
            canEdit={canEdit}
          />
        </TabsContent>}
        {canViewTab('werksoorten') && <TabsContent value="werksoorten" className="flex-1 overflow-y-auto pt-6 pb-2 px-4 md:px-6">
          <WerksoortenTab werksoorten={currentProject.werksoorten} setWerksoorten={(newWerksoorten) => setCurrentProject(prev => ({...prev, werksoorten: typeof newWerksoorten === 'function' ? newWerksoorten(prev.werksoorten) : newWerksoorten}))} canEdit={canEdit} />
        </TabsContent>}
        {canViewTab('boekingregels') && <TabsContent value="boekingregels" className="flex-1 overflow-y-auto pt-6 pb-2 px-4 md:px-6">
          <BoekingregelsTab projectId={selectedProjectId} canEdit={canEdit} />
        </TabsContent>}
        {canViewTab('afspraken') && <TabsContent value="afspraken" className="flex-1 overflow-y-auto pt-6 pb-2 px-4 md:px-6">
          <AfsprakenTab projectId={selectedProjectId} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>}
        {canViewTab('organisatie') && <TabsContent value="organisatie" className="flex-1 overflow-y-auto pt-6 pb-2 px-4 md:px-6">
          <OrganisatieTab projectId={selectedProjectId} wijken={currentProject.wijken} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>}
        {canViewTab('wijken') && <TabsContent value="wijken" className="flex-1 overflow-y-auto pt-6 pb-2 px-4 md:px-6">
          <WijkenTab 
            wijken={currentProject.wijken || []} 
            setCurrentProject={setCurrentProject} 
            canEdit={canEdit} 
            projectId={currentProject.id} 
            firestore={firestore}
          />
        </TabsContent>}
        {canViewTab('veegroutes') && <TabsContent value="veegroutes" className="flex-1 overflow-y-auto p-4 md:p-6">
          <VeegroutesTab veegroutes={currentProject.veegroutes || []} setCurrentProject={setCurrentProject} canEdit={canEdit} projectId={currentProject.id} firestore={firestore}/>
        </TabsContent>}
        {canViewTab('prullenbakkenroutes') && <TabsContent value="prullenbakkenroutes" className="flex-1 overflow-y-auto p-4 md:p-6">
          <PrullenbakkenroutesTab 
            prullenbakkenroutes={currentProject.prullenbakkenroutes || []} 
            setCurrentProject={setCurrentProject} 
            canEdit={canEdit} 
            projectId={currentProject.id} 
            firestore={firestore}
            objectCounts={objectCountsPerPrullenbakkenroute}
            totalObjects={allObjects?.length || 0}
            allObjects={allObjects}
          />
        </TabsContent>}
      </Tabs>
      
      {isGlobalWijkMapOpen && (
        <WijkMapDialog
          open={isGlobalWijkMapOpen}
          onOpenChange={setIsGlobalWijkMapOpen}
          wijk={{ id: 'global', naam: 'Alle Wijken', locatie: '', subGebieden: JSON.stringify(allWijkenFeatures)}}
          onSave={async () => {}}
          readOnly={true}
        />
      )}
    </div>
  );
}
