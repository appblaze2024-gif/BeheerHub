'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { MapboxView } from '@/components/mapbox-view';
import * as turf from '@turf/turf';
import type { Wijk } from '@/app/projects/page';
import { PageHeader } from '@/components/page-header';

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
};

type MapObject = {
  id: string;
  latitude: number;
  longitude: number;
  [key: string]: any;
};

export default function TrashBinsPage() {
  const firestore = useFirestore();
  const [selectedProjectId, setSelectedProjectId] = React.useState<
    string | undefined
  >();
  const [selectedWijkIds, setSelectedWijkIds] = React.useState<string[]>([]);
  const [selectedObjects, setSelectedObjects] = React.useState<MapObject[]>([]);
  const [selectAll, setSelectAll] = React.useState(false);


  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } =
    useCollection<Project>(projectsCollection);
  const { data: objects, isLoading: isLoadingObjects } =
    useCollection<MapObject>(objectsCollection);

  const selectedProject = React.useMemo(() => {
    return projects?.find((p) => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  const projectWijken = React.useMemo(() => {
    if (!selectedProject?.wijken) return [];
    // Filter out wijken with "voorvegen"
    return selectedProject.wijken.filter(
      (w) => !w.naam.toLowerCase().includes('voorvegen')
    );
  }, [selectedProject]);

  const wijkPolygons = React.useMemo(() => {
    const selected = projectWijken.filter((w) => selectedWijkIds.includes(w.id));
    return selected.flatMap((wijk) => {
      try {
        const features = JSON.parse(wijk.subGebieden);
        if (Array.isArray(features)) {
          return features.map((feature: any) => ({
            ...feature,
            properties: { ...feature.properties, wijkNaam: wijk.naam },
          }));
        }
        return [];
      } catch (e) {
        console.error(`Invalid GeoJSON for wijk ${wijk.naam}:`, e);
        return [];
      }
    });
  }, [projectWijken, selectedWijkIds]);

  const objectsInSelectedWijken = React.useMemo(() => {
    if (!objects || wijkPolygons.length === 0) return [];
    return objects.filter((obj) => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') {
        return false;
      }
      const point = turf.point([obj.longitude, obj.latitude]);
      for (const polygon of wijkPolygons) {
        if (turf.booleanPointInPolygon(point, polygon)) {
          return true;
        }
      }
      return false;
    });
  }, [objects, wijkPolygons]);

  React.useEffect(() => {
    if (selectAll) {
      setSelectedObjects(objectsInSelectedWijken);
    } else {
      // This part is tricky. If you uncheck 'select all', do you want to clear all selections?
      // For now, let's assume yes.
      setSelectedObjects([]);
    }
  }, [selectAll, objectsInSelectedWijken]);

  const handleObjectSelection = (obj: MapObject, checked: boolean) => {
    if (checked) {
      setSelectedObjects((prev) => [...prev, obj]);
    } else {
      setSelectedObjects((prev) => prev.filter((o) => o.id !== obj.id));
    }
     setSelectAll(false);
  };
  
  React.useEffect(() => {
    // When project changes, reset wijk selection
    setSelectedWijkIds([]);
    setSelectedObjects([]);
    setSelectAll(false);
  }, [selectedProjectId]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="Prullenbakken Routeplanner" />
      <div className="flex-1 grid grid-cols-[350px_1fr] gap-6 p-6 min-h-0">
        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>
                Selecteer een project en de wijken om objecten te tonen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="project-select">Project</Label>
                <Select
                  value={selectedProjectId}
                  onValueChange={setSelectedProjectId}
                  disabled={isLoadingProjects}
                >
                  <SelectTrigger id="project-select">
                    <SelectValue placeholder="Selecteer een project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.projectnaam}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedProject && (
                <div>
                  <Label>Wijken</Label>
                  <div className="mt-2 space-y-2 border rounded-md p-3 max-h-60 overflow-y-auto">
                    {projectWijken.length > 0 ? (
                      projectWijken.map((wijk) => (
                        <div
                          key={wijk.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`wijk-${wijk.id}`}
                            checked={selectedWijkIds.includes(wijk.id)}
                            onCheckedChange={(checked) => {
                              setSelectedWijkIds((prev) =>
                                checked
                                  ? [...prev, wijk.id]
                                  : prev.filter((id) => id !== wijk.id)
                              );
                            }}
                          />
                          <Label
                            htmlFor={`wijk-${wijk.id}`}
                            className="font-normal flex justify-between w-full"
                          >
                            <span>{wijk.naam}</span>
                          </Label>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Geen geschikte wijken voor dit project.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className='flex-1 flex flex-col min-h-0'>
             <CardHeader>
                <CardTitle>Geselecteerde Objecten</CardTitle>
                 <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="select-all" 
                            checked={selectAll}
                            onCheckedChange={(checked) => setSelectAll(!!checked)}
                            disabled={objectsInSelectedWijken.length === 0}
                        />
                        <Label htmlFor="select-all">Selecteer alle ({objectsInSelectedWijken.length})</Label>
                    </div>
                     <Button size="sm" disabled={selectedObjects.length === 0}>
                        Genereer Route
                    </Button>
                </div>
             </CardHeader>
             <CardContent className='flex-1 p-0 overflow-y-auto'>
                <div className='divide-y'>
                    {selectedObjects.map(obj => (
                        <div key={obj.id} className='p-3 flex justify-between items-center text-sm'>
                            <span>{obj.id}</span>
                            <span className='text-muted-foreground'>{obj.locatieSubType}</span>
                        </div>
                    ))}
                </div>
             </CardContent>
          </Card>
        </aside>
        <main className="rounded-lg overflow-hidden border">
            <MapboxView 
                objects={objectsInSelectedWijken} 
                selectedObjects={selectedObjects}
                onObjectSelect={handleObjectSelection}
                wijkPolygons={wijkPolygons} 
            />
        </main>
      </div>
    </div>
  );
}
