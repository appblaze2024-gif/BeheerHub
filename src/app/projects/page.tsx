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
import { Trash2 } from 'lucide-react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';

type Werksoort = {
  id: string;
  postnummer: string;
  werksoort: string;
  eenheid: string;
  fictieveH: string;
  uurprijs: string;
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

export default function ProjectsPage() {
  const firestore = useFirestore();
  const [selectedProjectId, setSelectedProjectId] = React.useState<
    string | undefined
  >();
  const [currentProject, setCurrentProject] = React.useState<Project>(EMPTY_PROJECT);

  const projectsCollection = useMemoFirebase(() => {
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
        setCurrentProject(project);
      } else {
        setCurrentProject(EMPTY_PROJECT);
        setSelectedProjectId(undefined);
      }
    } else {
        setCurrentProject(EMPTY_PROJECT);
    }
  }, [selectedProjectId, projects]);

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
  };
  
  const handleInputChange = (field: keyof Project, value: string) => {
      setCurrentProject(prev => ({...prev, [field]: value}));
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

  const handleNew = () => {
    setSelectedProjectId(undefined);
    setCurrentProject(EMPTY_PROJECT);
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
            <TabsTrigger value="afspraken">Afspraken</TabsTrigger>
            <TabsTrigger value="organisatie">Organisatie</TabsTrigger>
            <TabsTrigger value="bestanden">Bestanden</TabsTrigger>
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
                        <Input id="projectnummer" value={currentProject.projectnummer} onChange={(e) => handleInputChange('projectnummer', e.target.value)} />
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
                     <div>
                        <Label htmlFor="einddatum" className="text-xs font-semibold">Einddatum</Label>
                        <Input id="einddatum" type="date" value={currentProject.einddatum} onChange={(e) => handleInputChange('einddatum', e.target.value)} />
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
      </Tabs>
    </div>
  );
}
