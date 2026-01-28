'use client';

import * as React from 'react';
import MapGL, { Marker } from 'react-map-gl';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useProject } from '@/context/project-context';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { useRouter } from 'next/navigation';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type Project = {
  id: string;
  projectnaam: string;
  projectnummer: string;
  wijken?: any[]; // Simplified for this component
};

export default function StartNavigationPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { setIsHeaderVisible } = useNavigationUI();
  
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  React.useEffect(() => {
    setIsHeaderVisible(false);
    
    // Check for Geolocation support
    if (!navigator.geolocation) {
      setLocationError("Geolocatie wordt niet ondersteund door uw browser.");
      return;
    }

    // Try to get current position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationError(null);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Kon uw locatie niet ophalen. Zorg ervoor dat u locatietoestemming heeft gegeven.");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Locatie-informatie is niet beschikbaar.");
            break;
          case error.TIMEOUT:
            setLocationError("Het verzoek om de gebruikerslocatie is verlopen.");
            break;
          default:
            setLocationError("Er is een onbekende fout opgetreden bij het ophalen van uw locatie.");
            break;
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );

    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  const handleStartRoute = () => {
    // Placeholder for navigation logic
    if (selectedProjectId) {
      console.log('Starting route for project:', selectedProjectId);
    }
  };

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };
  
  if (userLocation) {
    initialViewState.longitude = userLocation.longitude;
    initialViewState.latitude = userLocation.latitude;
    initialViewState.zoom = 12;
  }

  return (
    <div className="w-full h-full relative">
      <MapGL
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactive={false}
      >
        {userLocation && (
          <Marker
            longitude={userLocation.longitude}
            latitude={userLocation.latitude}
            anchor="center"
          >
            <div className="relative flex h-5 w-5 items-center justify-center">
              <div className="absolute h-6 w-6 rounded-full bg-blue-500/50 animate-pulse" />
              <div className="relative h-4 w-4 rounded-full bg-blue-600 border-2 border-white" />
            </div>
          </Marker>
        )}
      </MapGL>

      <div className="absolute top-4 left-4 z-10">
        {locationError && (
            <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Locatie Fout</AlertTitle>
                <AlertDescription>
                    {locationError}
                </AlertDescription>
            </Alert>
        )}

        <Card className="mt-4 w-full max-w-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <CardTitle>Start een nieuwe route</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <Select
                value={selectedProjectId || ''}
                onValueChange={(value) => setSelectedProjectId(value || null)}
                disabled={isLoadingProjects}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer een project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id!}>
                      {project.projectnaam} [{project.projectnummer}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleStartRoute} disabled={!selectedProjectId}>
              Start Route
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}