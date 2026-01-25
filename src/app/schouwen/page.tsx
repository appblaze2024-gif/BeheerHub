'use client';

import * as React from 'react';
import MapGL, { Marker, Popup } from 'react-map-gl';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import type { Project } from '@/app/projects/page';
import type { Schouwing } from '@/lib/types';
import { SchouwDialog } from '@/components/schouw-dialog';
import { FirestorePermissionError, errorEmitter } from '@/firebase';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function SchouwenPage() {
  const firestore = useFirestore();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(true);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  
  const [schouwingen, setSchouwingen] = React.useState<Schouwing[]>([]);
  const [isLoadingSchouwingen, setIsLoadingSchouwingen] = React.useState(false);
  
  const [selectedSchouwing, setSelectedSchouwing] = React.useState<Schouwing | null>(null);
  const [newSchouwingLocation, setNewSchouwingLocation] = React.useState<{ latitude: number, longitude: number } | null>(null);

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  React.useEffect(() => {
    const fetchProjects = async () => {
      if (!firestore) return;
      setIsLoadingProjects(true);
      const projectsCol = collection(firestore, 'projects');
      const projectSnapshot = await getDocs(projectsCol);
      const projectList = projectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projectList);
      setIsLoadingProjects(false);
    };
    fetchProjects();
  }, [firestore]);

  const fetchSchouwingen = React.useCallback(async () => {
    if (!firestore || !selectedProjectId) {
      setSchouwingen([]);
      return;
    }
    setIsLoadingSchouwingen(true);
    try {
      const q = collection(firestore, 'projects', selectedProjectId, 'schouwingen');
      const querySnapshot = await getDocs(q);
      const schouwingenData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Schouwing));
      setSchouwingen(schouwingenData);
    } catch (error) {
      console.error("Fout bij ophalen inspecties:", error);
      const contextualError = new FirestorePermissionError({
        path: `projects/${selectedProjectId}/schouwingen`,
        operation: 'list',
      });
      errorEmitter.emit('permission-error', contextualError);
    } finally {
      setIsLoadingSchouwingen(false);
    }
  }, [firestore, selectedProjectId]);

  React.useEffect(() => {
    fetchSchouwingen();
  }, [fetchSchouwingen]);

  const handleMapClick = (event: mapboxgl.MapboxEvent & { lngLat: { lng: number, lat: number } }) => {
    // If a marker was clicked, the marker's own click handler will take care of it.
    if (event.defaultPrevented) return;
    setNewSchouwingLocation({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
    setSelectedSchouwing(null);
  };

  const handleMarkerClick = (schouwing: Schouwing, event: mapboxgl.MapboxEvent) => {
    event.preventDefault(); // Prevent map click from firing
    setSelectedSchouwing(schouwing);
    setNewSchouwingLocation(null);
  };
  
  const handleCreateSchouwing = () => {
    if (newSchouwingLocation) {
        setIsDialogOpen(true);
    }
  }

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-96 border-r bg-background p-4 flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Schouwen</h1>
        <Select onValueChange={setSelectedProjectId} disabled={isLoadingProjects}>
          <SelectTrigger>
            <SelectValue placeholder="Selecteer een project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.projectnaam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {newSchouwingLocation ? (
            <Card>
                <CardHeader>
                    <CardTitle>Nieuwe Schouwing</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-4">Wilt u op deze plek een schouwing aanmaken?</p>
                    <div className='flex gap-2'>
                        <Button variant="outline" onClick={() => setNewSchouwingLocation(null)}>Annuleren</Button>
                        <Button onClick={handleCreateSchouwing}>Melding maken</Button>
                    </div>
                </CardContent>
            </Card>
        ) : (
             <div className="flex-1 overflow-y-auto">
                <h3 className="text-lg font-semibold mb-2">Inspecties in dit project</h3>
                {isLoadingSchouwingen ? (
                    <p>Laden...</p>
                ) : schouwingen.length > 0 ? (
                    <div className="space-y-2">
                        {schouwingen.map(s => (
                            <div key={s.id} className="p-2 border rounded-md hover:bg-muted cursor-pointer" onClick={() => setSelectedSchouwing(s)}>
                                <p className="font-semibold">{s.opmerkingen}</p>
                                <p className="text-sm text-muted-foreground">Status: {s.status}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground">Geen inspecties gevonden.</p>
                )}
            </div>
        )}
      </aside>
      <main className="flex-1 relative">
        <MapGL
          initialViewState={initialViewState}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
          onClick={handleMapClick}
        >
          {schouwingen.map((schouwing) => (
            <Marker
              key={schouwing.id}
              longitude={schouwing.longitude}
              latitude={schouwing.latitude}
              onClick={(e) => handleMarkerClick(schouwing, e)}
            >
              <div className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white cursor-pointer" />
            </Marker>
          ))}
          {selectedSchouwing && (
            <Popup
                longitude={selectedSchouwing.longitude}
                latitude={selectedSchouwing.latitude}
                onClose={() => setSelectedSchouwing(null)}
                closeOnClick={false}
                anchor="top"
                className='min-w-64'
            >
                <div>
                    <h3 className="font-bold text-base mb-1">Schouwing {selectedSchouwing.id.slice(0, 6)}</h3>
                    <p>{selectedSchouwing.opmerkingen}</p>
                    <p className="text-sm mt-1">
                        <strong>Status:</strong> {selectedSchouwing.status}
                    </p>
                     <p className="text-xs text-muted-foreground mt-1">
                        Datum: {format(new Date(selectedSchouwing.datum), 'dd-MM-yyyy', { locale: nl })}
                    </p>
                </div>
            </Popup>
          )}
          {newSchouwingLocation && (
              <Marker
                longitude={newSchouwingLocation.longitude}
                latitude={newSchouwingLocation.latitude}
              >
                <div className="w-5 h-5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
              </Marker>
          )}
        </MapGL>
      </main>
      <SchouwDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={selectedProjectId}
        location={newSchouwingLocation}
        onSuccess={fetchSchouwingen}
      />
    </div>
  );
}
