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
import { FilePenLine, Plus, Trash2, Upload, Download, MapPin } from 'lucide-react';
import {
  useFirestore,
  useCollection,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
  useFirebaseApp,
} from '@/firebase';
import { collection, doc, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { AfspraakDialog } from '@/components/afspraak-dialog';
import { OrganisatieContactDialog } from '@/components/organisatie-contact-dialog';
import { ProjectBestandenDialog } from '@/components/project-bestanden-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { WijkMapDialog } from '@/components/wijk-map-dialog';

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
};

function WerksoortenTab({
  werksoorten,
  setWerksoorten,
}: {
  werksoorten: Werksoort[];
  setWerksoorten: React.Dispatch<React.SetStateAction<Werksoort[]>>;
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
          <Input
            value={werksoort.postnummer}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'postnummer', e.target.value)
            }
          />
          <Input
            value={werksoort.werksoort}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'werksoort', e.target.value)
            }
          />
          <Input
            value={werksoort.eenheid}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'eenheid', e.target.value)
            }
          />
          <Input
            value={werksoort.fictieveH}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'fictieveH', e.target.value)
            }
          />
          <Input
            value={werksoort.uurprijs}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'uurprijs', e.target.value)
            }
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeRow(werksoort.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={addRow}>
        Regel toevoegen
      </Button>
    </div>
  );
}

function BoekingregelsTab({ projectId }: { projectId: string | undefined }) {
  const firestore = useFirestore();
  const [newRegelNaam, setNewRegelNaam] = React.useState('');

  const boekingregelsCollection = React.useMemo(() => {
    if (!firestore || !projectId) return null;
    return collection(firestore, 'projects', projectId, 'boekingregels');
  }, [firestore, projectId]);

  const { data: boekingregels, isLoading } = useCollection<Boekingregel>(boekingregelsCollection);

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
        <div className="flex gap-2">
            <Input 
                placeholder="Nieuwe boekingregel naam"
                value={newRegelNaam}
                onChange={(e) => setNewRegelNaam(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRegel()}
            />
            <Button onClick={handleAddRegel}>Toevoegen</Button>
        </div>
        <div className="border rounded-md">
            {isLoading ? (
                <div className='p-4 text-center text-muted-foreground'>Boekingregels laden...</div>
            ) : boekingregels && boekingregels.length > 0 ? (
                boekingregels.map(regel => (
                    <div key={regel.id} className="flex items-center gap-2 p-2 border-b last:border-b-0">
                       <Input 
                            defaultValue={regel.naam} 
                            onBlur={(e) => handleUpdateRegel(regel.id, e.target.value)}
                            className="flex-1"
                       />
                       <Button variant='ghost' size='icon' onClick={() => handleDeleteRegel(regel.id)}>
                            <Trash2 className='h-4 w-4 text-destructive' />
                       </Button>
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

function AfsprakenTab({ projectId }: { projectId: string | undefined }) {
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
    await deleteDoc(afspraakRef);
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
        <Button size="sm" onClick={handleNewAfspraak}><Plus className='mr-2 h-4 w-4' /> Nieuwe afspraak</Button>
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
                  <Button variant='ghost' size='icon' onClick={() => handleEditAfspraak(afspraak)}>
                    <FilePenLine className='h-4 w-4' />
                  </Button>
                   <Button variant='ghost' size='icon' onClick={() => handleDeleteAfspraak(afspraak.id!)}>
                    <Trash2 className='h-4 w-4 text-destructive' />
                  </Button>
                </div>
              </div>
            ))
          ) : (
             <div className='p-4 text-center text-muted-foreground'>Nog geen afspraken voor dit project.</div>
          )}
        </div>
      </CardContent>
      <AfspraakDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        afspraak={selectedAfspraak}
      />
    </Card>
  );
}

function OrganisatieTab({ projectId }: { projectId: string | undefined }) {
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
    await deleteDoc(contactRef);
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
        <Button size="sm" onClick={handleNewContact}><Plus className='mr-2 h-4 w-4' /> Nieuw Contact</Button>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <div className="grid grid-cols-[2fr_2fr_2fr_1fr_1fr_auto] gap-x-4 p-4 font-semibold bg-muted">
            <div>Naam</div>
            <div>Rol</div>
            <div>Bedrijf</div>
            <div>Telefoon</div>
            <div>Email</div>
            <div />
          </div>
          {isLoading ? (
            <div className='p-4 text-center text-muted-foreground'>Contacten laden...</div>
          ) : contacten && contacten.length > 0 ? (
            contacten.map(contact => (
              <div key={contact.id} className="grid grid-cols-[2fr_2fr_2fr_1fr_1fr_auto] items-center gap-x-4 p-4 border-t">
                <div className='truncate'>{contact.naam}</div>
                <div className='truncate'>{contact.rol}</div>
                <div className='truncate'>{contact.bedrijf}</div>
                <div className='truncate'>{contact.telefoon}</div>
                <div className='truncate'>{contact.email}</div>
                <div className='flex items-center gap-2'>
                  <Button variant='ghost' size='icon' onClick={() => handleEditContact(contact)}>
                    <FilePenLine className='h-4 w-4' />
                  </Button>
                   <Button variant='ghost' size='icon' onClick={() => handleDeleteContact(contact.id!)}>
                    <Trash2 className='h-4 w-4 text-destructive' />
                  </Button>
                </div>
              </div>
            ))
          ) : (
             <div className='p-4 text-center text-muted-foreground'>Nog geen contacten voor dit project.</div>
          )}
        </div>
      </CardContent>
      <OrganisatieContactDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        contact={selectedContact}
      />
    </Card>
  );
}

function BestandenTab({ projectId }: { projectId: string | undefined }) {
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
      await deleteDoc(bestandDocRef);
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
        <Button size="sm" onClick={() => setIsDialogOpen(true)}><Upload className='mr-2 h-4 w-4' /> Bestanden uploaden</Button>
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
                   <Button variant='ghost' size='icon' onClick={(e) => handleDeleteBestand(e, bestand)}>
                    <Trash2 className='h-4 w-4 text-destructive' />
                  </Button>
                </div>
              </div>
            ))
          ) : (
             <div className='p-4 text-center text-muted-foreground'>Nog geen bestanden geüpload voor dit project.</div>
          )}
        </div>
      </CardContent>
      <ProjectBestandenDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
      />
    </Card>
  );
}

function WijkenTab({
  wijken,
  setWijken,
}: {
  wijken: Wijk[];
  setWijken: React.Dispatch<React.SetStateAction<Wijk[]>>;
}) {
  const [mapWijk, setMapWijk] = React.useState<Wijk | null>(null);

  const addRow = () => {
    setWijken([
      ...wijken,
      {
        id: new Date().toISOString(),
        naam: '',
        locatie: '',
        subGebieden: '',
      },
    ]);
  };

  const removeRow = (id: string) => {
    setWijken(wijken.filter((w) => w.id !== id));
  };

  const handleInputChange = (
    id: string,
    field: keyof Wijk,
    value: string
  ) => {
    setWijken(
      wijken.map((w) => (w.id === id ? { ...w, [field]: value } : w))
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_1fr_2fr_auto] gap-x-4 px-1 text-sm font-semibold">
        <Label>Wijk</Label>
        <Label>Locatie</Label>
        <Label>Sub-gebieden</Label>
        <span />
      </div>
      {wijken.map((wijk) => (
        <div
          key={wijk.id}
          className="grid grid-cols-[1fr_1fr_2fr_auto] items-center gap-x-4"
        >
          <Input
            value={wijk.naam}
            onChange={(e) => handleInputChange(wijk.id, 'naam', e.target.value)}
          />
          <Input
            value={wijk.locatie}
            onChange={(e) => handleInputChange(wijk.id, 'locatie', e.target.value)}
          />
          <Input
            value={wijk.subGebieden}
            onChange={(e) =>
              handleInputChange(wijk.id, 'subGebieden', e.target.value)
            }
          />
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => setMapWijk(wijk)}>
                <MapPin className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => removeRow(wijk.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={addRow}>
        Wijk toevoegen
      </Button>
      
      {mapWijk && (
        <WijkMapDialog
          open={!!mapWijk}
          onOpenChange={(open) => !open && setMapWijk(null)}
          wijk={mapWijk}
        />
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const firestore = useFirestore();
  const [selectedProjectId, setSelectedProjectId] = React.useState<
    string | undefined
  >();
  const [currentProject, setCurrentProject] = React.useState<Project>(EMPTY_PROJECT);
  const [isEndDateHeden, setIsEndDateHeden] = React.useState(false);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading } = useCollection<Project>(
    projectsCollection
  );

  React.useEffect(() => {
    if (selectedProjectId) {
      const project = projects?.find((p) => p.id === selectedProjectId);
      if (project) {
        setCurrentProject({
            ...EMPTY_PROJECT,
            ...project,
            wijken: project.wijken || [], // Ensure wijken is an array
        });
        if (project.einddatum === format(new Date(), 'yyyy-MM-dd')) {
            setIsEndDateHeden(true);
        } else {
            setIsEndDateHeden(false);
        }
      } else {
        setCurrentProject(EMPTY_PROJECT);
        setSelectedProjectId(undefined);
        setIsEndDateHeden(false);
      }
    } else {
        setCurrentProject(EMPTY_PROJECT);
        setIsEndDateHeden(false);
    }
  }, [selectedProjectId, projects]);

  const generateProjectNumber = () => {
    const year = new Date().getFullYear();
    const randomNumber = Math.floor(10000 + Math.random() * 90000);
    return `${year}-${randomNumber}`;
  };

  const handleNew = () => {
    setSelectedProjectId(undefined);
    setCurrentProject({
      ...EMPTY_PROJECT,
      projectnummer: generateProjectNumber(),
    });
    setIsEndDateHeden(false);
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
    if (!firestore) return;
    const projectsColRef = collection(firestore, 'projects');
    const projectToSave = {...currentProject};

    if (currentProject.id) {
      const projectRef = doc(firestore, 'projects', currentProject.id);
      updateDocumentNonBlocking(projectRef, projectToSave);
    } else {
      const newDocRef = await addDocumentNonBlocking(projectsColRef, projectToSave);
      setSelectedProjectId(newDocRef.id);
    }
  };
  

  const handleDelete = async () => {
    if (!firestore || !currentProject.id) return;
    const projectRef = doc(firestore, 'projects', currentProject.id);
    await deleteDocumentNonBlocking(projectRef);
    handleNew();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Tabs defaultValue="project" className="flex-1 flex flex-col min-h-0">
        <div className="px-6 pt-6">
          <TabsList>
            <TabsTrigger value="project">Project</TabsTrigger>
            <TabsTrigger value="werksoorten">Werksoorten</TabsTrigger>
            <TabsTrigger value="boekingregels">Boekingregels</TabsTrigger>
            <TabsTrigger value="afspraken">Afspraken</TabsTrigger>
            <TabsTrigger value="organisatie">Organisatie</TabsTrigger>
            <TabsTrigger value="bestanden">Bestanden</TabsTrigger>
            <TabsTrigger value="wijken">Wijken</TabsTrigger>
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
            value={selectedProjectId}
            onValueChange={handleProjectSelect}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full max-w-lg">
              <SelectValue placeholder="Selecteer een project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">-- Nieuw Project --</SelectItem>
              {projects?.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.projectnaam} [{project.projectnummer}]
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent
          value="project"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div>
                        <Label htmlFor="projectnummer" className="text-xs font-semibold">Projectnummer</Label>
                        <Input id="projectnummer" value={currentProject.projectnummer} onChange={(e) => handleInputChange('projectnummer', e.target.value)} disabled />
                    </div>
                     <div>
                        <Label htmlFor="projectnaam" className="text-xs font-semibold">Projectnaam</Label>
                        <Input id="projectnaam" value={currentProject.projectnaam} onChange={(e) => handleInputChange('projectnaam', e.target.value)} />
                    </div>
                     <div>
                        <Label htmlFor="locatie" className="text-xs font-semibold">Locatie</Label>
                        <Input id="locatie" value={currentProject.locatie} onChange={(e) => handleInputChange('locatie', e.target.value)} />
                    </div>
                     <div>
                        <Label htmlFor="opdrachtgever" className="text-xs font-semibold">Opdrachtgever</Label>
                        <Input id="opdrachtgever" value={currentProject.opdrachtgever} onChange={(e) => handleInputChange('opdrachtgever', e.target.value)} />
                    </div>
                     <div>
                        <Label htmlFor="startdatum" className="text-xs font-semibold">Startdatum</Label>
                        <Input id="startdatum" type="date" value={currentProject.startdatum} onChange={(e) => handleInputChange('startdatum', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="einddatum" className="text-xs font-semibold">Einddatum</Label>
                        <Input id="einddatum" type="date" value={currentProject.einddatum} onChange={(e) => handleInputChange('einddatum', e.target.value)} disabled={isEndDateHeden} />
                        <div className="flex items-center space-x-2">
                            <Checkbox id="heden" checked={isEndDateHeden} onCheckedChange={(checked) => handleHedenCheckboxChange(!!checked)} />
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                   <div>
                        <Label htmlFor="bestek" className="text-xs font-semibold">Bestek</Label>
                        <Input id="bestek" value={currentProject.bestek} onChange={(e) => handleInputChange('bestek', e.target.value)} />
                    </div>
                     <div>
                        <Label htmlFor="besteknummer" className="text-xs font-semibold">Besteknummer</Label>
                        <Input id="besteknummer" value={currentProject.besteknummer} onChange={(e) => handleInputChange('besteknummer', e.target.value)} />
                    </div>
                     <div>
                        <Label htmlFor="versie" className="text-xs font-semibold">Versie</Label>
                        <Input id="versie" value={currentProject.versie} onChange={(e) => handleInputChange('versie', e.target.value)} />
                    </div>
                     <div>
                        <Label htmlFor="datum" className="text-xs font-semibold">Datum</Label>
                        <Input id="datum" type="date" value={currentProject.datum} onChange={(e) => handleInputChange('datum', e.target.value)} />
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
                <Textarea rows={4} value={currentProject.omschrijving} onChange={(e) => handleInputChange('omschrijving', e.target.value)} />
              </CardContent>
            </Card>

            <div className="flex justify-start gap-2">
              <Button onClick={handleSave}>Opslaan</Button>
              <Button variant="outline" onClick={handleNew}>Nieuw</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={!currentProject.id}>Verwijder</Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent
          value="werksoorten"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <WerksoortenTab werksoorten={currentProject.werksoorten} setWerksoorten={(newWerksoorten) => setCurrentProject(prev => ({...prev, werksoorten: typeof newWerksoorten === 'function' ? newWerksoorten(prev.werksoorten) : newWerksoorten}))}/>
        </TabsContent>
        <TabsContent
          value="boekingregels"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <BoekingregelsTab projectId={selectedProjectId} />
        </TabsContent>
        <TabsContent
          value="afspraken"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <AfsprakenTab projectId={selectedProjectId} />
        </TabsContent>
        <TabsContent
          value="organisatie"
          className="flex-1 overflow-y-a_tool_code
print(default_api.run_code(code='a = 1'))
uto pt-6 pb-2 px-6"
        >
          <OrganisatieTab projectId={selectedProjectId} />
        </TabsContent>
         <TabsContent
          value="bestanden"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <BestandenTab projectId={selectedProjectId} />
        </TabsContent>
        <TabsContent
          value="wijken"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <WijkenTab
            wijken={currentProject.wijken || []}
            setWijken={(newWijken) =>
              setCurrentProject((prev) => ({
                ...prev,
                wijken: typeof newWijken === 'function' ? newWijken(prev.wijken || []) : newWijken,
              }))
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
