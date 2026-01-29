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
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FilePenLine, Plus, Trash2, Upload, Download, MapPin, Map as MapIcon, MoreHorizontal, Copy } from 'lucide-react';
import {
  useFirestore,
  useCollection,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
  useFirebaseApp,
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { AfspraakDialog } from '@/components/afspraak-dialog';
import { OrganisatieContactDialog } from '@/components/organisatie-contact-dialog';
import { ProjectBestandenDialog } from '@/components/project-bestanden-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { WijkMapDialog } from '@/components/wijk-map-dialog';
import { VeegrouteMapDialog } from '@/components/veegroute-map-dialog';
import { PrullenbakkenrouteMapDialog } from '@/components/prullenbakkenroute-map-dialog';
import { useProfile } from '@/firebase/profile-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProject } from '@/context/project-context';
import * as turf from '@turf/turf';

type Werksoort = {
  id: string;
  postnummer: string;
  werksoort: string;
  eenheid: string;
  fictieveH: string;
  uurprijs: string;
};

export type Wijk = {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
};

type Veegroute = {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
  roadTypes?: string[];
};

type Prullenbakkenroute = {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
};

type Boekingregel = {
    id: string;
    naam: string;
};

type Project = {
  id?: string;
  projectnummer: string;
  projectnaam: string;
  locatie: string;
  opdrachtgever: string;
  startdatum: string;
  einddatum: string;
  bestek: string;
  besteknummer: string;
  versie: string;
  datum: string;
  omschrijving: string;
  werksoorten: Werksoort[];
  boekingregels?: Boekingregel[];
  wijken?: Wijk[];
  veegroutes?: Veegroute[];
  prullenbakkenroutes?: Prullenbakkenroute[];
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

export type Bestand = {
    id: string;
    name: string;
    type: string;
    size: number;
    url: string;
    uploadedAt: string;
    storagePath: string;
};

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
  werksoorten: [],
  boekingregels: [],
  wijken: [],
  veegroutes: [],
  prullenbakkenroutes: [],
};

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
      <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] gap-x-4 px-1 text-sm font-semibold">
        <Label>Postnummer</Label>
        <Label>Werksoort</Label>
        <Label>Eenheid</Label>
        <Label>Fictieve H.</Label>
        <Label>Uurprijs</Label>
        <span />
      </div>
      {werksoorten.map((werksoort) => (
        <div
          key={werksoort.id}
          className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] items-center gap-x-4"
        >
          <Input value={werksoort.postnummer} onChange={(e) => handleInputChange(werksoort.id, 'postnummer', e.target.value)} disabled={!canEdit}/>
          <Input value={werksoort.werksoort} onChange={(e) => handleInputChange(werksoort.id, 'werksoort', e.target.value)} disabled={!canEdit}/>
          <Input value={werksoort.eenheid} onChange={(e) => handleInputChange(werksoort.id, 'eenheid', e.target.value)} disabled={!canEdit}/>
          <Input value={werksoort.fictieveH} onChange={(e) => handleInputChange(werksoort.id, 'fictieveH', e.target.value)} disabled={!canEdit}/>
          <Input value={werksoort.uurprijs} onChange={(e) => handleInputChange(werksoort.id, 'uurprijs', e.target.value)} disabled={!canEdit}/>
          {canEdit && <Button variant="ghost" size="icon" onClick={() => removeRow(werksoort.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>}
        </div>
      ))}
      {canEdit && <Button variant="outline" onClick={addRow}>Regel toevoegen</Button>}
    </div>
  );
}

function BoekingregelsTab({ projectId, canEdit }: { projectId: string | undefined; canEdit: boolean; }) {
  const firestore = useFirestore();
  const [newRegelNaam, setNewRegelNaam] = React.useState('');

  const boekingregelsCollection = React.useMemo(() => {
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
    await addDocumentNonBlocking(boekingregelsCollection!, regelData);
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
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecteer eerst een project om boekingregels te beheren.
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

  const afsprakenCollection = React.useMemo(() => {
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
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecteer eerst een project om afspraken te bekijken of toe te voegen.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between'>
        <CardTitle className="text-lg">Afspraken</CardTitle>
        {canEdit && <Button size="sm" onClick={handleNewAfspraak}><Plus className='mr-2 h-4 w-4' /> Nieuwe afspraak</Button>}
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <div className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-x-4 p-4 font-semibold bg-muted">
            <div>Onderwerp</div>
            <div>Datum</div>
            <div>Tijd</div>
            <div>Notities</div>
            <div />
          </div>
          {isLoading ? (
            <div className='p-4 text-center text-muted-foreground'>Afspraken laden...</div>
          ) : afspraken && afspraken.length > 0 ? (
            afspraken.map(afspraak => (
              <div key={afspraak.id} className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] items-center gap-x-4 p-4 border-t">
                <div className='truncate'>{afspraak.onderwerp}</div>
                <div>{afspraak.datum}</div>
                <div>{afspraak.tijd}</div>
                <div className='truncate'>{afspraak.notities}</div>
                <div className='flex items-center gap-2'>
                  {canEdit && <Button variant='ghost' size='icon' onClick={() => handleEditAfspraak(afspraak)}><FilePenLine className='h-4 w-4' /></Button>}
                  {canDelete && <Button variant='ghost' size='icon' onClick={() => handleDeleteAfspraak(afspraak.id!)}><Trash2 className='h-4 w-4 text-destructive' /></Button>}
                </div>
              </div>
            ))
          ) : (
             <div className='p-4 text-center text-muted-foreground'>Nog geen afspraken voor dit project.</div>
          )}
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

  const organisatieCollection = React.useMemo(() => {
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
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecteer eerst een project om contacten te bekijken of toe te voegen.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between'>
        <CardTitle className="text-lg">Organisatie</CardTitle>
        {canEdit && <Button size="sm" onClick={handleNewContact}><Plus className='mr-2 h-4 w-4' /> Nieuw Contact</Button>}
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <div className="grid grid-cols-[2fr_2fr_2fr_2fr_1fr_1fr_auto] gap-x-4 p-4 font-semibold bg-muted">
            <div>Naam</div>
            <div>Rol</div>
            <div>Bedrijf</div>
            <div>Wijk</div>
            <div>Telefoon</div>
            <div>Email</div>
            <div />
          </div>
          {isLoading ? (
            <div className='p-4 text-center text-muted-foreground'>Contacten laden...</div>
          ) : contacten && contacten.length > 0 ? (
            contacten.map(contact => (
              <div key={contact.id} className="grid grid-cols-[2fr_2fr_2fr_2fr_1fr_1fr_auto] items-center gap-x-4 p-4 border-t">
                <div className='truncate'>{contact.naam}</div>
                <div className='truncate'>{contact.rol}</div>
                <div className='truncate'>{contact.bedrijf || '-'}</div>
                <div className='truncate'>{contact.wijk || '-'}</div>
                <div className='truncate'>{contact.telefoon}</div>
                <div className='truncate'>{contact.email}</div>
                <div className='flex items-center gap-2'>
                  {canEdit && <Button variant='ghost' size='icon' onClick={() => handleEditContact(contact)}><FilePenLine className='h-4 w-4' /></Button>}
                  {canDelete && <Button variant='ghost' size='icon' onClick={() => handleDeleteContact(contact.id!)}><Trash2 className='h-4 w-4 text-destructive' /></Button>}
                </div>
              </div>
            ))
          ) : (
             <div className='p-4 text-center text-muted-foreground'>Nog geen contacten voor dit project.</div>
          )}
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

  const bestandenCollection = React.useMemo(() => {
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
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecteer eerst een project om bestanden te bekijken of te uploaden.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between'>
        <CardTitle className="text-lg">Bestanden</CardTitle>
        {canEdit && <Button size="sm" onClick={() => setIsDialogOpen(true)}><Upload className='mr-2 h-4 w-4' /> Bestanden uploaden</Button>}
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <div className="grid grid-cols-[3fr_1fr_1fr_1fr_auto] gap-x-4 p-4 font-semibold bg-muted">
            <div>Bestandsnaam</div>
            <div>Type</div>
            <div>Grootte</div>
            <div>Datum</div>
            <div />
          </div>
          {isLoading ? (
            <div className='p-4 text-center text-muted-foreground'>Bestanden laden...</div>
          ) : bestanden && bestanden.length > 0 ? (
            bestanden.map(bestand => (
              <div
                key={bestand.id} 
                className="grid grid-cols-[3fr_1fr_1fr_1fr_auto] items-center gap-x-4 p-4 border-t"
              >
                <a 
                  href={bestand.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className='truncate font-medium text-blue-600 hover:underline'
                >
                  {bestand.name}
                </a>
                <div className="truncate">{bestand.type}</div>
                <div>{formatBytes(bestand.size)}</div>
                <div>{new Date(bestand.uploadedAt).toLocaleDateString('nl-NL')}</div>
                <div className='flex items-center gap-1 justify-end'>
                    <a href={bestand.url} download={bestand.name}>
                        <Button variant='ghost' size='icon'>
                            <Download className='h-4 w-4' />
                        </Button>
                    </a>
                   {canDelete && <Button variant='ghost' size='icon' onClick={(e) => handleDeleteBestand(e, bestand)}>
                    <Trash2 className='h-4 w-4 text-destructive' />
                  </Button>}
                </div>
              </div>
            ))
          ) : (
             <div className='p-4 text-center text-muted-foreground'>Nog geen bestanden geüpload voor dit project.</div>
          )}
        </div>
      </CardContent>
      {canEdit && <ProjectBestandenDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        folderId={null} // Default to root for this simplified tab
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
  objectCounts,
}: {
  wijken: Wijk[];
  setCurrentProject: React.Dispatch<React.SetStateAction<Project>>;
  canEdit: boolean;
  projectId?: string;
  firestore: any;
  objectCounts: { [wijkId: string]: number };
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
      <div className="grid grid-cols-[1fr_1fr_100px_auto_auto] gap-x-4 px-1 text-sm font-semibold">
        <Label>Wijk</Label>
        <Label>Locatie</Label>
        <Label>Objecten</Label>
        <Label>Gebied</Label>
        <span />
      </div>
      {sortedWijken.map((wijk) => (
        <div
          key={wijk.id}
          className="grid grid-cols-[1fr_1fr_100px_auto_auto] items-center gap-x-4"
        >
          <Input value={wijk.naam} onChange={(e) => handleInputChange(wijk.id, 'naam', e.target.value)} disabled={!canEdit}/>
          <Input value={wijk.locatie} onChange={(e) => handleInputChange(wijk.id, 'locatie', e.target.value)} disabled={!canEdit} />
          <div className="text-center text-sm">{objectCounts[wijk.id] ?? 0}</div>
          <Button variant="outline" onClick={() => setMapWijk(wijk)}>
            <MapPin className="mr-2 h-4 w-4" />
            Gebied {canEdit ? 'tekenen/bewerken' : 'bekijken'}
          </Button>
          <div className="flex items-center justify-end">
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleCopyToVeegroutes(wijk)}>
                    <Copy className="mr-2 h-4 w-4" />
                    <span>Kopieer naar Veegroutes</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCopyToPrullenbakkenroutes(wijk)}>
                    <Copy className="mr-2 h-4 w-4" />
                    <span>Kopieer naar Prullenbakkenroutes</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => removeRow(wijk.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Verwijderen</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      ))}
      {canEdit && <Button variant="outline" onClick={addRow}>Wijk toevoegen</Button>}
      
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
      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 px-1 text-sm font-semibold">
        <Label>Veegroute</Label>
        <Label>Locatie</Label>
        <Label>Gebied</Label>
        <span />
      </div>
      {sortedRoutes.map((route) => (
        <div
          key={route.id}
          className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-x-4"
        >
          <Input value={route.naam} onChange={(e) => handleInputChange(route.id, 'naam', e.target.value)} disabled={!canEdit} />
          <Input value={route.locatie} onChange={(e) => handleInputChange(route.id, 'locatie', e.target.value)} disabled={!canEdit}/>
          <Button variant="outline" onClick={() => setMapRoute(route)}>
            <MapPin className="mr-2 h-4 w-4" />
            Gebied {canEdit ? 'tekenen/bewerken' : 'bekijken'}
          </Button>
          <div className="flex items-center">
            {canEdit && <Button variant="ghost" size="icon" onClick={() => removeRow(route.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
            </Button>}
          </div>
        </div>
      ))}
      {canEdit && <Button variant="outline" onClick={addRow}>Veegroute toevoegen</Button>}
      
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
}: {
  prullenbakkenroutes: Prullenbakkenroute[];
  setCurrentProject: React.Dispatch<React.SetStateAction<Project>>;
  canEdit: boolean;
  projectId?: string;
  firestore: any;
  objectCounts: { [routeId: string]: number };
}) {
  const [mapRoute, setMapRoute] = React.useState<Prullenbakkenroute | null>(null);

  const sortedRoutes = React.useMemo(() => {
    if (!prullenbakkenroutes) return [];
    return [...prullenbakkenroutes].sort((a, b) =>
      a.naam.localeCompare(b.naam, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [prullenbakkenroutes]);

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
        id: new Date().toISOString(),
        naam: '',
        locatie: '',
        subGebieden: '[]',
      },
    ]);
  };

  const removeRow = (id: string) => {
    setPrullenbakkenroutes(prev => (prev || []).filter((r) => r.id !== id));
  };

  const handleInputChange = (
    id: string,
    field: keyof Prullenbakkenroute,
    value: string
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_1fr_100px_auto_auto] gap-x-4 px-1 text-sm font-semibold">
        <Label>Prullenbakkenroute</Label>
        <Label>Locatie</Label>
        <Label>Objecten</Label>
        <Label>Gebied</Label>
        <span />
      </div>
      {sortedRoutes.map((route) => (
        <div
          key={route.id}
          className="grid grid-cols-[1fr_1fr_100px_auto_auto] items-center gap-x-4"
        >
          <Input value={route.naam} onChange={(e) => handleInputChange(route.id, 'naam', e.target.value)} disabled={!canEdit}/>
          <Input value={route.locatie} onChange={(e) => handleInputChange(route.id, 'locatie', e.target.value)} disabled={!canEdit}/>
          <div className="text-center text-sm">{objectCounts[route.id] ?? 0}</div>
          <Button variant="outline" onClick={() => setMapRoute(route)}>
            <MapPin className="mr-2 h-4 w-4" />
            Gebied {canEdit ? 'tekenen/bewerken' : 'bekijken'}
          </Button>
          <div className="flex items-center">
            {canEdit && <Button variant="ghost" size="icon" onClick={() => removeRow(route.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
            </Button>}
          </div>
        </div>
      ))}
      {canEdit && <Button variant="outline" onClick={addRow}>Prullenbakkenroute toevoegen</Button>}
      
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
    </div>
  );
}


export default function ProjectsPage() {
  const firestore = useFirestore();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [currentProject, setCurrentProject] = React.useState<Project>(EMPTY_PROJECT);
  const [isEndDateHeden, setIsEndDateHeden] = React.useState(false);
  const [isGlobalWijkMapOpen, setIsGlobalWijkMapOpen] = React.useState(false);

  const isSuperUser = profile?.role === 'Super admin';
  const canCreate = isSuperUser || !!profile?.permissions?.projects?.create;
  const canEdit = isSuperUser || !!profile?.permissions?.projects?.edit;
  const canDelete = isSuperUser || !!profile?.permissions?.projects?.delete;

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading } = useCollection<Project>(
    projectsCollection
  );
  
  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: allObjects } = useCollection<any>(objectsCollection);

  const objectCountsPerWijk = React.useMemo(() => {
    if (!allObjects || !currentProject.wijken) return {};
    const counts: { [wijkId: string]: number } = {};
    for (const wijk of currentProject.wijken) {
      let objectCount = 0;
      try {
        const features = JSON.parse(wijk.subGebieden);
        if (Array.isArray(features)) {
          for (const obj of allObjects) {
            if (typeof obj.latitude === 'number' && typeof obj.longitude === 'number') {
              const point = turf.point([obj.longitude, obj.latitude]);
              for (const polygon of features) {
                if (turf.booleanPointInPolygon(point, polygon)) {
                  objectCount++;
                  break; 
                }
              }
            }
          }
        }
      } catch (e) {
        // ignore
      }
      counts[wijk.id] = objectCount;
    }
    return counts;
  }, [allObjects, currentProject.wijken]);

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
    return projects.flatMap(p => 
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
  }, [projects]);

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
        // This can happen if a project is deleted while it's selected.
        // We should clear the selection.
        if (projects) { // Only clear if projects have loaded
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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Tabs defaultValue="project" className="flex-1 flex flex-col min-h-0">
        <div className="px-6 pt-6 overflow-x-auto">
          <TabsList className="inline-flex">
            {canViewTab('project') && <TabsTrigger value="project">Project</TabsTrigger>}
            {canViewTab('werksoorten') && <TabsTrigger value="werksoorten">Werksoorten</TabsTrigger>}
            {canViewTab('boekingregels') && <TabsTrigger value="boekingregels">Boekingregels</TabsTrigger>}
            {canViewTab('afspraken') && <TabsTrigger value="afspraken">Afspraken</TabsTrigger>}
            {canViewTab('organisatie') && <TabsTrigger value="organisatie">Organisatie</TabsTrigger>}
            {canViewTab('wijken') && <TabsTrigger value="wijken">Wijken</TabsTrigger>}
            {canViewTab('veegroutes') && <TabsTrigger value="veegroutes">Veegroutes</TabsTrigger>}
            {canViewTab('prullenbakkenroutes') && <TabsTrigger value="prullenbakkenroutes">Prullenbakkenroutes</TabsTrigger>}
          </TabsList>
        </div>

        <div className="flex items-center gap-4 mt-6 px-6">
          <Label
            htmlFor="select-project"
            className="font-semibold whitespace-nowrap"
          >
            Selecteer Project:
          </Label>
          <Select
            value={selectedProjectId || 'new'}
            onValueChange={handleProjectSelect}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full max-w-lg">
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
          <Button variant="outline" onClick={() => setIsGlobalWijkMapOpen(true)}>
            <MapIcon className="mr-2 h-4 w-4" />
            Alle Wijken op Kaart
          </Button>
        </div>

        {canViewTab('project') && <TabsContent
          value="project"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    <div>
                        <Label htmlFor="projectnummer" className="text-xs font-semibold">Projectnummer</Label>
                        <Input id="projectnummer" value={currentProject.projectnummer} onChange={(e) => handleInputChange('projectnummer', e.target.value)} disabled />
                    </div>
                     <div>
                        <Label htmlFor="projectnaam" className="text-xs font-semibold">Projectnaam</Label>
                        <Input id="projectnaam" value={currentProject.projectnaam} onChange={(e) => handleInputChange('projectnaam', e.target.value)} disabled={!canEdit} />
                    </div>
                     <div>
                        <Label htmlFor="locatie" className="text-xs font-semibold">Locatie</Label>
                        <Input id="locatie" value={currentProject.locatie} onChange={(e) => handleInputChange('locatie', e.target.value)} disabled={!canEdit}/>
                    </div>
                     <div>
                        <Label htmlFor="opdrachtgever" className="text-xs font-semibold">Opdrachtgever</Label>
                        <Input id="opdrachtgever" value={currentProject.opdrachtgever} onChange={(e) => handleInputChange('opdrachtgever', e.target.value)} disabled={!canEdit}/>
                    </div>
                     <div>
                        <Label htmlFor="startdatum" className="text-xs font-semibold">Startdatum</Label>
                        <Input id="startdatum" type="date" value={currentProject.startdatum} onChange={(e) => handleInputChange('startdatum', e.target.value)} disabled={!canEdit}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="einddatum" className="text-xs font-semibold">Einddatum</Label>
                        <Input id="einddatum" type="date" value={currentProject.einddatum} onChange={(e) => handleInputChange('einddatum', e.target.value)} disabled={isEndDateHeden || !canEdit} />
                        <div className="flex items-center space-x-2">
                            <Checkbox id="heden" checked={isEndDateHeden} onCheckedChange={(checked) => handleHedenCheckboxChange(!!checked)} disabled={!canEdit} />
                            <label htmlFor="heden" className="text-sm font-medium leading-none">Heden</label>
                        </div>
                    </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bestek</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                   <div>
                        <Label htmlFor="bestek" className="text-xs font-semibold">Bestek</Label>
                        <Input id="bestek" value={currentProject.bestek} onChange={(e) => handleInputChange('bestek', e.target.value)} disabled={!canEdit}/>
                    </div>
                     <div>
                        <Label htmlFor="besteknummer" className="text-xs font-semibold">Besteknummer</Label>
                        <Input id="besteknummer" value={currentProject.besteknummer} onChange={(e) => handleInputChange('besteknummer', e.target.value)} disabled={!canEdit}/>
                    </div>
                     <div>
                        <Label htmlFor="versie" className="text-xs font-semibold">Versie</Label>
                        <Input id="versie" value={currentProject.versie} onChange={(e) => handleInputChange('versie', e.target.value)} disabled={!canEdit}/>
                    </div>
                     <div>
                        <Label htmlFor="datum" className="text-xs font-semibold">Datum</Label>
                        <Input id="datum" type="date" value={currentProject.datum} onChange={(e) => handleInputChange('datum', e.target.value)} disabled={!canEdit}/>
                    </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Korte omschrijving werkzaamheden
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={4} value={currentProject.omschrijving} onChange={(e) => handleInputChange('omschrijving', e.target.value)} disabled={!canEdit}/>
              </CardContent>
            </Card>

            <div className="flex justify-start gap-2">
              {canEdit && <Button onClick={handleSave}>Opslaan</Button>}
              {canCreate && <Button variant="outline" onClick={handleNew}>Nieuw</Button>}
              {canDelete && <Button variant="destructive" onClick={handleDelete} disabled={!currentProject.id}>Verwijder</Button>}
            </div>
          </div>
        </TabsContent>}
        {canViewTab('werksoorten') && <TabsContent value="werksoorten" className="flex-1 overflow-y-auto pt-6 pb-2 px-6">
          <WerksoortenTab werksoorten={currentProject.werksoorten} setWerksoorten={(newWerksoorten) => setCurrentProject(prev => ({...prev, werksoorten: typeof newWerksoorten === 'function' ? newWerksoorten(prev.werksoorten) : newWerksoorten}))} canEdit={canEdit} />
        </TabsContent>}
        {canViewTab('boekingregels') && <TabsContent value="boekingregels" className="flex-1 overflow-y-auto pt-6 pb-2 px-6">
          <BoekingregelsTab projectId={selectedProjectId} canEdit={canEdit} />
        </TabsContent>}
        {canViewTab('afspraken') && <TabsContent value="afspraken" className="flex-1 overflow-y-auto pt-6 pb-2 px-6">
          <AfsprakenTab projectId={selectedProjectId} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>}
        {canViewTab('organisatie') && <TabsContent value="organisatie" className="flex-1 overflow-y-auto pt-6 pb-2 px-6">
          <OrganisatieTab projectId={selectedProjectId} wijken={currentProject.wijken} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>}
        {canViewTab('wijken') && <TabsContent value="wijken" className="flex-1 overflow-y-auto pt-6 pb-2 px-6">
          <WijkenTab 
            wijken={currentProject.wijken || []} 
            setCurrentProject={setCurrentProject} 
            canEdit={canEdit} 
            projectId={currentProject.id} 
            firestore={firestore}
            objectCounts={objectCountsPerWijk}
          />
        </TabsContent>}
        {canViewTab('veegroutes') && <TabsContent value="veegroutes" className="flex-1 overflow-y-auto p-6">
          <VeegroutesTab veegroutes={currentProject.veegroutes || []} setCurrentProject={setCurrentProject} canEdit={canEdit} projectId={currentProject.id} firestore={firestore}/>
        </TabsContent>}
        {canViewTab('prullenbakkenroutes') && <TabsContent value="prullenbakkenroutes" className="flex-1 overflow-y-auto p-6">
          <PrullenbakkenroutesTab 
            prullenbakkenroutes={currentProject.prullenbakkenroutes || []} 
            setCurrentProject={setCurrentProject} 
            canEdit={canEdit} 
            projectId={currentProject.id} 
            firestore={firestore}
            objectCounts={objectCountsPerPrullenbakkenroute}
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
