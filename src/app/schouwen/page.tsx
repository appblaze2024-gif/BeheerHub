'use client';

import * as React from 'react';
import MapGL, { Marker, Popup } from 'react-map-gl';
import { useFirestore, useUser, updateDocumentNonBlocking } from '@/firebase';
import { collection, getDocs, query, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Layers as MapLayersIcon } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import type { Project } from '@/app/projects/page';
import type { Schouwing } from '@/lib/types';
import { SchouwDialog } from '@/components/schouw-dialog';
import { useProfile } from '@/firebase/profile-provider';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function SchouwenPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(true);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  
  const [schouwingen, setSchouwingen] = React.useState<Schouwing[]>([]);
  const [isLoadingSchouwingen, setIsLoadingSchouwingen] = React.useState(false);
  
  const [selectedSchouwing, setSelectedSchouwing] = React.useState<Schouwing | null>(null);

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [mapStyle, setMapStyle] = React.useState('mapbox://styles/mapbox/streets-v12');

  React.useEffect(() => {
    if (profile?.schouwenMapStyle) {
      setMapStyle(profile.schouwenMapStyle);
    }
  }, [profile]);

  const handleMapStyleChange = (newStyle: string) => {
    if (!user || !firestore) return;
    setMapStyle(newStyle);
    const userProfileRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userProfileRef, { schouwenMapStyle: newStyle });
  };

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
      const q = query(collection(firestore, 'projects', selectedProjectId, 'schouwingen'));
      const querySnapshot = await getDocs(q);
      const schouwingenData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Schouwing));
      setSchouwingen(schouwingenData);
    } catch (error) {
      console.error("Fout bij ophalen inspecties:", error);
    } finally {
      setIsLoadingSchouwingen(false);
    }
  }, [firestore, selectedProjectId]);

  React.useEffect(() => {
    fetchSchouwingen();
  }, [fetchSchouwingen]);

  const handleMapClick = (event: mapboxgl.MapboxEvent & { lngLat: { lng: number, lat: number } }) => {
    if (event.defaultPrevented) return;
    // For now, clicking the map does nothing except close popups if any are open
    setSelectedSchouwing(null);
  };

  const handleMarkerClick = (schouwing: Schouwing, event: mapboxgl.MapboxEvent) => {
    event.preventDefault();
    setSelectedSchouwing(schouwing);
  };
  
  const handleNewSchouwingClick = () => {
    if (!selectedProjectId) return;
    setSelectedSchouwing(null);
    setIsDialogOpen(true);
  };
  
  const handleEditSchouwing = (schouwing: Schouwing) => {
    setSelectedSchouwing(schouwing);
    setIsDialogOpen(true);
  }

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const handleSuccess = () => {
      fetchSchouwingen();
      setSelectedSchouwing(null);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <header className="absolute top-0 left-0 z-10 p-4 flex flex-col sm:flex-row gap-4 w-full items-start sm:items-center">
        <div className="flex gap-4 w-full sm:w-auto pointer-events-auto bg-card p-2 rounded-lg shadow-md">
            <Select onValueChange={setSelectedProjectId} disabled={isLoadingProjects}>
              <SelectTrigger className="w-full sm:w-72">
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
            <Select onValueChange={handleMapStyleChange} value={mapStyle}>
              <SelectTrigger className="w-full sm:w-auto">
                <MapLayersIcon className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Kaartlaag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mapbox://styles/mapbox/streets-v12">Standaard</SelectItem>
                <SelectItem value="mapbox://styles/mapbox/satellite-streets-v12">Satelliet</SelectItem>
                <SelectItem value="mapbox://styles/mapbox/outdoors-v12">Terrein</SelectItem>
                <SelectItem value="mapbox://styles/mapbox/light-v11">Licht</SelectItem>
                <SelectItem value="mapbox://styles/mapbox/dark-v11">Donker</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleNewSchouwingClick} disabled={!selectedProjectId}>
              <Plus className="mr-2 h-4 w-4" />
              Nieuwe Schouwing
            </Button>
        </div>
      </header>

      <MapGL
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
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
                      Datum: {format(new Date(schouwing.datum), 'dd-MM-yyyy', { locale: nl })}
                  </p>
                  <Button size="sm" className="w-full mt-2" onClick={() => handleEditSchouwing(selectedSchouwing)}>Details</Button>
              </div>
          </Popup>
        )}
      </MapGL>
      <SchouwDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={selectedProjectId}
        schouwing={selectedSchouwing}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
