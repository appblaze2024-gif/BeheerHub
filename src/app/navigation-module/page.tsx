'use client';

import * as React from 'react';
import MapGL, { Marker } from 'react-map-gl';
import { useCollection, useFirestore, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
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
import type { Project, Route, Veegroute, Prullenbakkenroute } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type ProjectWithRoutes = Project & {
  veegroutes?: Veegroute[];
  prullenbakkenroutes?: Prullenbakkenroute[];
};

export default function StartNavigationPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { setIsHeaderVisible } = useNavigationUI();
  const { user } = useUser();
  
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [userLocation, setUserLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const [routeType, setRouteType] = React.useState<'veeg' | 'prullenbak' | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('--nieuwe-route--');

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<ProjectWithRoutes>(projectsCollection);

  const routeHistoryQuery = React.useMemo(() => {
      if (!firestore || !user || !selectedProjectId) return null;
      return query(
          collection(firestore, 'users', user.uid, 'routes'),
          where('projectId', '==', selectedProjectId)
      );
  }, [firestore, user, selectedProjectId]);

  const { data: routeHistory, isLoading: isLoadingRouteHistory } = useCollection<Route>(routeHistoryQuery);
  
  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const availableRoutes = React.useMemo(() => {
      if (!selectedProject) return [];
      if (routeType === 'veeg') return selectedProject.veegroutes || [];
      if (routeType === 'prullenbak') return selectedProject.prullenbakkenroutes || [];
      return [];
  }, [selectedProject, routeType]);

  React.useEffect(() => {
    setIsHeaderVisible(false);
    
    if (!navigator.geolocation) {
      setLocationError("Geolocatie wordt niet ondersteund door uw browser.");
      return;
    }

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
    console.log({
        projectId: selectedProjectId,
        routeType,
        selectedRouteId
    });
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
        
      {locationError && (
          <div className="absolute top-4 right-4 z-10">
            <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Locatie Fout</AlertTitle>
                <AlertDescription>
                    {locationError}
                </AlertDescription>
            </Alert>
          </div>
      )}

      <Card className="absolute top-4 left-4 z-10 w-full max-w-sm">
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
            <Label>Project</Label>
            <Select
              value={selectedProjectId || ''}
              onValueChange={(value) => {
                setSelectedProjectId(value || null);
                setRouteType(null);
                setSelectedRouteId('--nieuwe-route--');
              }}
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
          
          <div className="space-y-2">
            <Label>Route Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant={routeType === 'veeg' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('veeg'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
              >
                Veegwagenroutes
              </Button>
              <Button 
                variant={routeType === 'prullenbak' ? 'default' : 'outline'} 
                onClick={() => { setRouteType('prullenbak'); setSelectedRouteId('--nieuwe-route--'); }}
                disabled={!selectedProjectId}
              >
                Prullenbakkenroutes
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">OF</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Kies uit routegeschiedenis</Label>
            <Select onValueChange={setSelectedRouteId} value={selectedRouteId} disabled={!routeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="--nieuwe-route--">-- Nieuwe Route --</SelectItem>
                    {availableRoutes.map((route: Veegroute | Prullenbakkenroute) => (
                        <SelectItem key={route.id} value={route.id}>
                            {route.naam}
                        </SelectItem>
                    ))}
                    {routeHistory && routeHistory.length > 0 && (
                        <>
                            <Separator className='my-1' />
                            <Label className="px-2 py-1.5 text-xs text-muted-foreground font-normal">Recent</Label>
                            {routeHistory.map((route: Route) => (
                                <SelectItem key={route.id} value={route.id}>
                                    {route.routeName}
                                </SelectItem>
                            ))}
                        </>
                    )}
                </SelectContent>
            </Select>
          </div>
          
          <Button className="w-full" onClick={handleStartRoute} disabled={!selectedProjectId || !routeType}>
            Start Route
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
