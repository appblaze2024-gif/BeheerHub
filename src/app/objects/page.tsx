'use client';

import * as React from 'react';
import {
  Filter,
  Save,
  Map,
  QrCode,
  Plus,
  Search,
  ChevronDown,
  MapPin,
  MoreVertical,
  ChevronRight,
  Image as ImageIcon,
  Upload,
  RefreshCw,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MapboxView } from '@/components/mapbox-view';
import { ObjectImportDialog } from '@/components/object-import-dialog';
import { useCollection, useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { Wijk } from '@/app/projects/page';
import * as turf from '@turf/turf';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type Area = {
  id: string;
  naam: string;
  subGebieden: string;
  type: 'wijk' | 'veegroute' | 'prullenbakkenroute';
};

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
  veegroutes?: Wijk[]; // Using Wijk type as it's identical
  prullenbakkenroutes?: Wijk[]; // Using Wijk type as it's identical
};

function PlanningAccordionContent({ selectedObject, handleUpdateField, projects, isLoadingProjects }: { selectedObject: any, handleUpdateField: (field: string, value: any) => void, projects: Project[] | null, isLoadingProjects: boolean }) {
  const [selectedProjectId, setSelectedProjectId] = React.useState('');

  const projectRoutes = React.useMemo(() => {
    if (!selectedProjectId) return [];
    const project = projects?.find(p => p.id === selectedProjectId);
    return project?.prullenbakkenroutes || [];
  }, [selectedProjectId, projects]);

  const handleRouteAssignment = (routeName: string, isChecked: boolean) => {
    const currentAssignments = selectedObject.locatieWerkgebieden || [];
    let newAssignments;
    if (isChecked) {
      newAssignments = [...currentAssignments, routeName];
    } else {
      newAssignments = currentAssignments.filter((name: string) => name !== routeName);
    }
    handleUpdateField('locatieWerkgebieden', newAssignments);
  };
  
  if (!selectedObject) return null;

  return (
    <div className='space-y-4'>
      <Select onValueChange={setSelectedProjectId} value={selectedProjectId} disabled={isLoadingProjects}>
        <SelectTrigger>
          <SelectValue placeholder="Selecteer een project" />
        </SelectTrigger>
        <SelectContent>
          {projects?.map(p => (
            <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedProjectId && (
        <div className="space-y-2 border rounded-md p-4 max-h-48 overflow-y-auto">
          <h4 className="font-semibold text-sm">Prullenbakkenroutes</h4>
          {projectRoutes.length > 0 ? projectRoutes.map(route => (
            <div key={route.id} className="flex items-center space-x-2">
              <Checkbox
                id={`route-${route.id}`}
                checked={(selectedObject.locatieWerkgebieden || []).includes(route.naam)}
                onCheckedChange={(checked) => handleRouteAssignment(route.naam, !!checked)}
              />
              <Label htmlFor={`route-${route.id}`} className="font-normal">{route.naam}</Label>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">Geen prullenbakkenroutes voor dit project.</p>
          )}
        </div>
      )}
    </div>
  );
}


export default function ObjectsPage() {
  const firestore = useFirestore();
  const [isImporting, setIsImporting] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedObject, setSelectedObject] = React.useState<any | null>(null);
  const [viewMode, setViewMode] = React.useState<'list' | 'map'>('list');

  // State for map view filtering
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedAreaIds, setSelectedAreaIds] = React.useState<string[]>([]);

  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);
  
  const projectsCollection = React.useMemo(() => {
      if (!firestore) return null;
      return collection(firestore, 'projects');
  }, [firestore]);

  const { data: objects, isLoading: isLoadingObjects } = useCollection<any>(objectsCollection);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);
  
  const projectAreas = React.useMemo<Area[]>(() => {
    if (!selectedProject) return [];
    
    // Alleen prullenbakkenroutes tonen zoals gevraagd.
    const prullenbakkenroutes: Area[] = (selectedProject.prullenbakkenroutes || []).map(r => ({ ...r, type: 'prullenbakkenroute' }));

    return prullenbakkenroutes;
  }, [selectedProject]);


  const filteredObjectsList = React.useMemo(() => {
    if (!objects) return [];
    if (!searchTerm) return objects;
    return objects.filter(
      (obj) =>
        obj.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obj.straatnaam?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [objects, searchTerm]);

  React.useEffect(() => {
    if (!selectedObject && filteredObjectsList && filteredObjectsList.length > 0) {
      setSelectedObject(filteredObjectsList[0]);
    } else if (selectedObject && filteredObjectsList) {
        if (!filteredObjectsList.find((v) => v.id === selectedObject.id)) {
            setSelectedObject(filteredObjectsList.length > 0 ? filteredObjectsList[0] : null);
        }
    }
  }, [filteredObjectsList, selectedObject]);
  
  const handleImportSuccess = () => {
    setIsImporting(false);
    // Data will refresh automatically due to useCollection hook
  };

  const handleUpdateField = (field: string, value: any) => {
    if (!firestore || !selectedObject) return;
    const objectRef = doc(firestore, 'objects', selectedObject.id);
    updateDocumentNonBlocking(objectRef, { [field]: value });
    setSelectedObject((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleAreaSelectionChange = (areaId: string, checked: boolean) => {
    setSelectedAreaIds(prev => 
      checked ? [...prev, areaId] : prev.filter(id => id !== areaId)
    );
  };
  
  const selectedAreas = React.useMemo(() => {
      if (!projectAreas) return [];
      return projectAreas.filter(area => selectedAreaIds.includes(area.id));
  }, [projectAreas, selectedAreaIds]);


 const areaPolygons = React.useMemo(() => {
    return selectedAreas.flatMap(area => {
      try {
        const features = JSON.parse(area.subGebieden);
        if (Array.isArray(features)) {
          return features.map((feature: any) => ({
            ...feature,
            properties: { ...feature.properties, areaNaam: area.naam },
          }));
        }
        return [];
      } catch (e) {
        console.error(`Invalid GeoJSON for area ${area.naam}:`, e);
        return [];
      }
    });
  }, [selectedAreas]);

  const objectsOnMap = React.useMemo(() => {
    if (!objects) return [];
    if (areaPolygons.length === 0) {
      // If no districts are selected, show all objects.
      return objects;
    }

    return objects.filter(obj => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') {
        return false;
      }
      const point = turf.point([obj.longitude, obj.latitude]);
      
      for (const polygon of areaPolygons) {
          if (turf.booleanPointInPolygon(point, polygon)) {
              return true;
          }
      }
      return false;
    });
  }, [objects, areaPolygons]);

  const objectCountsPerArea = React.useMemo(() => {
    if (!objects || !projectAreas) return {};

    const counts: { [areaId: string]: number } = {};

    for (const area of projectAreas) {
      let objectCount = 0;
      try {
        const features = JSON.parse(area.subGebieden);
        if (Array.isArray(features)) {
          for (const obj of objects) {
            if (typeof obj.latitude === 'number' && typeof obj.longitude === 'number') {
              const point = turf.point([obj.longitude, obj.latitude]);
              for (const polygon of features) {
                if (turf.booleanPointInPolygon(point, polygon)) {
                  objectCount++;
                  break; // Count object only once per wijk
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore parsing errors for this calculation
      }
      counts[area.id] = objectCount;
    }
    return counts;
  }, [objects, projectAreas]);


  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-muted/30">
      {/* Header */}
      <header className="flex items-center justify-between p-3 bg-card border-b shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
          <Button variant="outline">
            <Save className="mr-2 h-4 w-4" /> Opslaan
          </Button>
          <Button variant="default" onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}>
            {viewMode === 'list' ? <Map className="mr-2 h-4 w-4" /> : <List className="mr-2 h-4 w-4" />}
            {viewMode === 'list' ? 'Kaartweergave' : 'Lijstweergave'}
          </Button>
          <Button variant="outline">
            <QrCode className="mr-2 h-4 w-4" /> QR Scan
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Object toevoegen
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Zoek een object" className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
           <ObjectImportDialog
            open={isImporting}
            onOpenChange={setIsImporting}
            onSuccess={handleImportSuccess}
          >
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          </ObjectImportDialog>
        </div>
      </header>

      {viewMode === 'list' ? (
         <div className="flex flex-1 min-h-0">
         {/* Sidebar */}
         <aside className="w-64 bg-card border-r flex flex-col">
           <div className="p-3">
             <Input placeholder="Filter objecten..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>
           <Separator />
           <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col space-y-1 p-2">
               {isLoadingObjects ? (
                  <div className="text-center text-muted-foreground p-4">
                   Laden...
                 </div>
               ) : filteredObjectsList && filteredObjectsList.length > 0 ? (
                 filteredObjectsList.map((obj) => (
                   <div
                     key={obj.id}
                     onClick={() => setSelectedObject(obj)}
                     className={`flex items-start justify-between p-3 rounded-md text-left cursor-pointer ${
                       selectedObject?.id === obj.id
                         ? 'bg-secondary'
                         : 'hover:bg-muted/50'
                     }`}
                   >
                     <div className="flex items-start gap-3">
                       <MapPin className="h-5 w-5 text-muted-foreground mt-1" />
                       <div>
                         <p className="font-semibold">{obj.id}</p>
                         <p className="text-sm text-muted-foreground">
                           {obj.locatieSubType || 'Onbekend type'}
                         </p>
                       </div>
                     </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                         <MoreVertical className="h-4 w-4" />
                     </Button>
                   </div>
                 ))
               ) : (
                  <div className="text-center text-muted-foreground p-4">
                   Geen objecten gevonden.
                 </div>
               )}
             </div>
           </div>
         </aside>
 
         {/* Main Content */}
         <main className="flex-1 p-4 overflow-y-auto">
              {selectedObject ? (
               <Card className="h-full">
               <CardContent className="p-4 h-full grid grid-cols-1 xl:grid-cols-3 gap-6">
                 <div className="xl:col-span-2 space-y-6">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-4">
                         <div>
                           <label className="text-sm font-medium">
                             Locatie type
                           </label>
                           <Select value={selectedObject.locatieType} onValueChange={(v) => handleUpdateField('locatieType', v)}>
                             <SelectTrigger>
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value={selectedObject.locatieType}>
                                 {selectedObject.locatieType}
                               </SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                         <div>
                           <label className="text-sm font-medium">
                             Locatie sub type
                           </label>
                           <Select value={selectedObject.locatieSubType} onValueChange={(v) => handleUpdateField('locatieSubType', v)}>
                             <SelectTrigger>
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value={selectedObject.locatieSubType}>
                                 {selectedObject.locatieSubType}
                               </SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                       </div>
                       <div className="space-y-4">
                         <div>
                           <label className="text-sm font-medium">Kwaliteit</label>
                           <Select value={selectedObject.kwaliteit} onValueChange={(v) => handleUpdateField('kwaliteit', v)}>
                             <SelectTrigger>
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value="A">A</SelectItem>
                               <SelectItem value="B">B</SelectItem>
                               <SelectItem value="C">C</SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                         <div className="flex items-center justify-between pt-6">
                           <span className="text-sm text-muted-foreground">Automatisch aangemaakt</span>
                           <div className="flex items-center gap-2">
                             <Switch
                               checked={selectedObject.isActief}
                               onCheckedChange={(c) => handleUpdateField('isActief', c)}
                             />
                             <span className="text-sm font-medium">Is actief</span>
                           </div>
                         </div>
                       </div>
                     </div>
 
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                         <div className="md:col-span-2">
                             <label htmlFor="street-name" className="text-sm font-medium">
                             Straatnaam
                             </label>
                             <Input
                             id="street-name"
                             value={selectedObject.straatnaam || ''}
                             onChange={(e) => handleUpdateField('straatnaam', e.target.value)}
                             />
                         </div>
                         <div>
                             <label htmlFor="house-number" className="text-sm font-medium">
                             Huisnummer
                             </label>
                             <Input 
                                 id="house-number" 
                                 value={selectedObject.huisnummer || ''}
                                 onChange={(e) => handleUpdateField('huisnummer', e.target.value)}
                             />
                         </div>
                     </div>
 
                     <div>
                       <label htmlFor="object-id" className="text-sm font-medium">
                         Object-ID
                       </label>
                       <div className="flex gap-2">
                         <Input id="object-id" value={selectedObject.id || ''} readOnly />
                         <Button variant="outline" size="icon">
                           <QrCode className="h-5 w-5" />
                         </Button>
                       </div>
                     </div>
                     
                     <Accordion type="single" collapsible className="w-full">
                         <AccordionItem value="logboek">
                             <AccordionTrigger className="px-0 py-3">Logboek</AccordionTrigger>
                             <AccordionContent>
                             Hier komt de inhoud van het logboek.
                             </AccordionContent>
                         </AccordionItem>
                         <AccordionItem value="planning">
                             <AccordionTrigger className="px-0 py-3">Planning</AccordionTrigger>
                             <AccordionContent>
                                <PlanningAccordionContent selectedObject={selectedObject} handleUpdateField={handleUpdateField} projects={projects} isLoadingProjects={isLoadingProjects} />
                             </AccordionContent>
                         </AccordionItem>
                         <AccordionItem value="bewerk-locatie" className='border-b-0'>
                             <AccordionTrigger className="px-0 py-3">Bewerk locatie</AccordionTrigger>
                             <AccordionContent>
                             Hier komen de opties om de locatie te bewerken.
                             </AccordionContent>
                         </AccordionItem>
                     </Accordion>
                     <Separator className='my-2'/>
                     <div className="space-y-4 pt-2">
                         <div>
                             <label htmlFor="warning" className="text-sm font-medium">
                                 Waarschuwing
                             </label>
                             <Textarea id="warning" placeholder="Voeg een waarschuwing toe..." value={selectedObject.waarschuwing || ''} onChange={(e) => handleUpdateField('waarschuwing', e.target.value)} />
                         </div>
                         <Separator/>
                         <div className="flex justify-between items-center">
                             <h3 className="font-medium">Eigenschappen</h3>
                             <Button size="sm" variant="secondary">
                                 <Plus className="mr-2 h-4 w-4" />
                             </Button>
                         </div>
                         <Separator/>
                         <div>
                             <div className="flex justify-between items-center mb-2">
                                 <h3 className="font-medium">Locatie werkgebieden</h3>
                             </div>
                             <div className="flex flex-wrap gap-2">
                              {(selectedObject.locatieWerkgebieden || []).map((gebied: string) => (
                                <div key={gebied} className="bg-muted text-muted-foreground px-3 py-1 rounded-full text-sm">{gebied}</div>
                              ))}
                             </div>
                         </div>
                     </div>
                 </div>
 
                 <div className="space-y-6">
                     <Card className="h-64">
                     <CardContent className="p-0 h-full">
                         <MapboxView 
                         key={selectedObject?.id}
                         longitude={selectedObject?.longitude}
                         latitude={selectedObject?.latitude}
                         />
                     </CardContent>
                     </Card>
                     <Card className="h-64">
                     <CardContent className="p-4 h-full flex flex-col items-center justify-center text-muted-foreground">
                         <ImageIcon className="h-12 w-12 text-gray-400" />
                         <p className="mt-2">Neem een foto</p>
                     </CardContent>
                     </Card>
                     <Card>
                     <CardContent className="p-4">
                         <h3 className="text-sm font-medium mb-2">Vulgraad</h3>
                         <Progress value={selectedObject?.vulgraad || 0} />
                         <p className="text-center text-sm font-semibold mt-2">{selectedObject?.vulgraad || 0}%</p>
                     </CardContent>
                     </Card>
                 </div>
               </CardContent>
             </Card>
             ) : (
                 <div className="flex items-center justify-center h-full text-muted-foreground">
                     {isLoadingObjects ? 'Objecten laden...' : 'Selecteer een object om de details te zien.'}
                 </div>
             )}
         </main>
       </div>
      ) : (
        <div className="flex flex-1 min-h-0 relative">
          <aside className="absolute top-0 left-0 z-10 m-4 w-80 bg-card border rounded-lg shadow-lg">
            <div className="p-4 space-y-4">
              <div>
                <Label htmlFor="project-select">Project</Label>
                <Select
                  value={selectedProjectId || ''}
                  onValueChange={(value) => {
                    setSelectedProjectId(value);
                    setSelectedAreaIds([]);
                  }}
                  disabled={isLoadingProjects}
                >
                  <SelectTrigger id="project-select">
                    <SelectValue placeholder="Selecteer een project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedProject && (
                <div>
                  <Label>Gebieden</Label>
                  <div className="mt-2 space-y-2 border rounded-md p-2 max-h-64 overflow-y-auto">
                    {(projectAreas && projectAreas.length > 0) ? (
                        projectAreas.map(area => (
                            <div key={area.id} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`area-${area.id}`}
                                    checked={selectedAreaIds.includes(area.id)}
                                    onCheckedChange={(checked) => handleAreaSelectionChange(area.id, !!checked)}
                                />
                                <Label htmlFor={`area-${area.id}`} className="font-normal flex justify-between w-full">
                                  <span>{area.naam}</span>
                                  <span className="text-muted-foreground">({objectCountsPerArea[area.id] || 0})</span>
                                </Label>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground">Geen prullenbakkenroutes voor dit project.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
          <MapboxView objects={objectsOnMap} wijkPolygons={areaPolygons} />
        </div>
      )}
    </div>
  );
}
