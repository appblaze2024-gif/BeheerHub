'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import {
  useFirestore,
  useCollection,
  useUser,
  addDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import * as turf from '@turf/turf';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  RoadTypeFilterDialog,
  allRoadTypes,
  roadColorMapping,
} from '@/components/road-type-filter-dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Save, Trash2, Settings, Route as RouteIcon } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
};

type Wijk = {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
};

type SavedRoute = {
    id: string;
    naam: string;
    projectId: string;
    wijkId: string;
    selectedTypes: string[];
}

export default function SweeperRoutePlannerPage() {
  const mapRef = React.useRef<any>(null);
  const { user } = useUser();
  const firestore = useFirestore();

  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string | null>(null);
  
  const [wijkPolygon, setWijkPolygon] = React.useState<FeatureCollection | null>(null);
  const [maskPolygon, setMaskPolygon] = React.useState<Feature<Polygon | MultiPolygon> | null>(null);
  
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [selectedRoadTypes, setSelectedRoadTypes] = React.useState<string[]>([]);
  const [newRouteName, setNewRouteName] = React.useState('');


  // --- Data Fetching ---
  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);
  
  const savedRoutesQuery = React.useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, `users/${user.uid}/routes`));
  }, [firestore, user?.uid]);
  const { data: savedRoutes, isLoading: isLoadingRoutes } = useCollection<SavedRoute>(savedRoutesQuery);


  // --- Memoized Derived State ---
  const selectedProject = React.useMemo(() => projects?.find(p => p.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  
  const availableWijken = React.useMemo(() => {
    if (!selectedProject?.wijken) return [];
    return selectedProject.wijken.filter(w => w.locatie?.toLowerCase().includes('veegmachine'));
  }, [selectedProject]);

  const selectedWijk = React.useMemo(() => availableWijken.find(w => w.id === selectedWijkId) ?? null, [availableWijken, selectedWijkId]);
  
  const routesForCurrentWijk = React.useMemo(() => {
    if (!savedRoutes || !selectedWijkId) return [];
    return savedRoutes.filter(r => r.wijkId === selectedWijkId);
  }, [savedRoutes, selectedWijkId]);

  // --- Effects ---
  React.useEffect(() => {
    // Reset wijk and route selection if project changes
    setSelectedWijkId(null);
    setSelectedRouteId(null);
  }, [selectedProjectId]);

  React.useEffect(() => {
    if (selectedWijk?.subGebieden) {
        try {
            const features = JSON.parse(selectedWijk.subGebieden);
            const validFeatures = (Array.isArray(features) ? features : []).filter(
                (f: any) => f && f.type === 'Feature' && f.geometry
            );

            if (validFeatures.length > 0) {
                const featureCollection = turf.featureCollection(validFeatures);
                setWijkPolygon(featureCollection);

                let world = turf.polygon([[
                    [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
                ]]);

                validFeatures.forEach((feature: Feature<Polygon | MultiPolygon>) => {
                    const newWorld = turf.difference(world, feature);
                    if (newWorld) world = newWorld;
                });
                setMaskPolygon(world);

                const map = mapRef.current?.getMap();
                if (map) {
                    const bbox = turf.bbox(featureCollection);
                    map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
                }
            } else {
                setWijkPolygon(null); setMaskPolygon(null);
            }
        } catch (e) {
            console.error("Invalid GeoJSON in wijk.subGebieden", e);
            setWijkPolygon(null); setMaskPolygon(null);
        }
    } else {
        setWijkPolygon(null); setMaskPolygon(null);
    }
    // Reset route when wijk changes
    setSelectedRouteId(null);
    setSelectedRoadTypes([]);
    setNewRouteName('');
  }, [selectedWijk]);
  
  React.useEffect(() => {
      if (selectedRouteId) {
          const route = savedRoutes?.find(r => r.id === selectedRouteId);
          if (route) {
              setSelectedRoadTypes(route.selectedTypes);
              setNewRouteName(route.naam);
          }
      } else {
          // When no route is selected, clear the types
          setSelectedRoadTypes([]);
          setNewRouteName('');
      }
  }, [selectedRouteId, savedRoutes]);

  // --- Handlers ---
  const handleSaveRoute = () => {
    if (!firestore || !user || !newRouteName || !selectedProjectId || !selectedWijkId) return;
    
    const routesColRef = collection(firestore, `users/${user.uid}/routes`);
    
    const routeData = {
        naam: newRouteName,
        projectId: selectedProjectId,
        wijkId: selectedWijkId,
        selectedTypes: selectedRoadTypes,
    };
    
    addDocumentNonBlocking(routesColRef, routeData);
    setNewRouteName('');
    setSelectedRouteId(null);
  };
  
  const handleDeleteRoute = (routeId: string) => {
    if (!firestore || !user) return;
    const routeRef = doc(firestore, `users/${user.uid}/routes`, routeId);
    deleteDocumentNonBlocking(routeRef);
  };

  const initialViewState = { longitude: 5.2913, latitude: 52.1326, zoom: 7 };

  return (
    <div className="flex flex-1 h-full min-h-0">
      <aside className="w-96 bg-card border-r flex flex-col p-4 space-y-4">
        <PageHeader title="Veegwagen Routeplanner" description="Plan uw veegroutes" className="p-0" />
        
        <div className="space-y-2">
          <Label htmlFor="project-select">Project</Label>
          <Select
            value={selectedProjectId || ''}
            onValueChange={setSelectedProjectId}
            disabled={isLoadingProjects}
          >
            <SelectTrigger id="project-select">
              <SelectValue placeholder="Selecteer een project" />
            </SelectTrigger>
            <SelectContent>
              {projects?.map((p) => <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wijk-select">Wijk</Label>
          <Select
            value={selectedWijkId || ''}
            onValueChange={setSelectedWijkId}
            disabled={!selectedProject}
          >
            <SelectTrigger id="wijk-select">
              <SelectValue placeholder="Selecteer een wijk" />
            </SelectTrigger>
            <SelectContent>
              {availableWijken.map((w) => <SelectItem key={w.id} value={w.id}>{w.naam}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        
        <Separator/>

        <div className="space-y-2">
            <Label>Opgeslagen Routes</Label>
            <div className='flex gap-2'>
                 <Select
                    value={selectedRouteId || ''}
                    onValueChange={setSelectedRouteId}
                    disabled={!selectedWijkId || routesForCurrentWijk.length === 0}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Selecteer een route" />
                    </SelectTrigger>
                    <SelectContent>
                        {routesForCurrentWijk.map(r => (
                             <SelectItem key={r.id} value={r.id}>{r.naam}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {selectedRouteId && (
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon"><Trash2 className='h-4 w-4'/></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Weet u zeker dat u deze route wilt verwijderen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Deze actie kan niet ongedaan gemaakt worden.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteRoute(selectedRouteId)}>Verwijderen</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="route-name-input">Route Naam</Label>
          <div className='flex gap-2'>
            <Input 
                id="route-name-input"
                placeholder="Nieuwe route naam..." 
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                disabled={!selectedWijkId}
            />
            <Button onClick={handleSaveRoute} disabled={!newRouteName || selectedRoadTypes.length === 0} title="Sla de huidige configuratie op">
                <Save className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator/>

        <Card className='flex-1'>
            <CardHeader>
                <CardTitle className='flex items-center justify-between'>
                    Wegtypes ({selectedRoadTypes.length})
                    <Button variant="outline" size="icon" onClick={() => setIsFilterOpen(true)} disabled={!selectedWijkId}>
                        <Settings className="h-4 w-4" />
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {selectedRoadTypes.length > 0 ? (
                    <ul className='space-y-1 text-sm text-muted-foreground'>
                        {selectedRoadTypes.map(type => <li key={type}>{allRoadTypes[type] || type}</li>)}
                    </ul>
                ) : (
                    <p className='text-sm text-muted-foreground'>Geen wegtypes geselecteerd.</p>
                )}
            </CardContent>
        </Card>
        
        <Button disabled={selectedRoadTypes.length === 0} className="w-full">
            <RouteIcon className="mr-2 h-4 w-4" />
            Genereer Route
        </Button>
      </aside>

      <main className="flex-1 min-h-0">
        <Map
          ref={mapRef}
          initialViewState={initialViewState}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {Object.entries(roadColorMapping).map(([type, color]) => (
            <Layer
              key={type}
              id={type}
              type="line"
              source="composite"
              source-layer="road"
              filter={['==', 'class', type]}
              layout={{
                'line-join': 'round',
                'line-cap': 'round',
                visibility: selectedRoadTypes.includes(type) ? 'visible' : 'none',
              }}
              paint={{ 'line-color': color, 'line-width': 2, 'line-opacity': 0.8 }}
            />
          ))}

          {wijkPolygon && (
            <Source id="wijk-polygon-source" type="geojson" data={wijkPolygon}>
              <Layer
                id="wijk-polygon-fill"
                type="fill"
                paint={{ 'fill-color': 'hsl(var(--primary))', 'fill-opacity': 0.1 }}
              />
              <Layer
                id="wijk-polygon-outline"
                type="line"
                paint={{ 'line-color': 'hsl(var(--primary))', 'line-width': 2 }}
              />
            </Source>
          )}

          {maskPolygon && (
            <Source id="mask-source" type="geojson" data={maskPolygon}>
              <Layer
                id="mask-layer"
                type="fill"
                paint={{ 'fill-color': 'black', 'fill-opacity': 1 }}
              />
            </Source>
          )}
        </Map>
      </main>

       <RoadTypeFilterDialog
            open={isFilterOpen}
            onOpenChange={setIsFilterOpen}
            selectedTypes={selectedRoadTypes}
            setSelectedTypes={setSelectedRoadTypes}
            onConfirm={() => setIsFilterOpen(false)}
        />
    </div>
  );
}
