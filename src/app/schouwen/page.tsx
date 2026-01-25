'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer, FillLayer, LineLayer, MapLayerMouseEvent } from 'react-map-gl';
import { useFirestore, useUser } from '@/firebase';
import { collection, getDocs, query, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Layers as MapLayersIcon, LocateFixed, X } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import * as turf from '@turf/turf';
import Image from 'next/image';

import type { Project } from '@/app/projects/page';
import type { Schouwing } from '@/lib/types';
import { SchouwDialog } from '@/components/schouw-dialog';
import { useProfile } from '@/firebase/profile-provider';
import { updateDocumentNonBlocking } from '@/firebase';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const gemeenteBoundaryLayer: LineLayer = {
    id: 'gemeente-boundary-outline',
    type: 'line',
    paint: {
      'line-color': '#000000',
      'line-width': 3,
    },
  };

const gemeenten = [
  "Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Eindhoven", 
  "Groningen", "Tilburg", "Almere", "Breda", "Nijmegen", "Haarlemmermeer"
];


export default function SchouwenPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile, isLoading: isProfileLoading } = useProfile();

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(true);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  
  const [schouwingen, setSchouwingen] = React.useState<Schouwing[]>([]);
  const [isLoadingSchouwingen, setIsLoadingSchouwingen] = React.useState(false);
  
  const [selectedSchouwing, setSelectedSchouwing] = React.useState<Schouwing | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [mapStyle, setMapStyle] = React.useState('mapbox://styles/mapbox/streets-v12');
  
  const [selectedGemeente, setSelectedGemeente] = React.useState<string | null>(null);
  const [gemeenteBoundary, setGemeenteBoundary] = React.useState<any | null>(null);
  const [isLoadingGemeente, setIsLoadingGemeente] = React.useState(false);

  const [isFollowing, setIsFollowing] = React.useState(false);
  const [userPosition, setUserPosition] = React.useState<[number, number] | null>(null);
  const [userHeading, setUserHeading] = React.useState<number>(0);
  const watchIdRef = React.useRef<number | null>(null);

  const [isPlacingMode, setIsPlacingMode] = React.useState(false);

  const mapRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (profile?.schouwenMapStyle) {
      setMapStyle(profile.schouwenMapStyle);
    }
    if (!isProfileLoading && profile?.schouwenGemeente) {
      setSelectedGemeente(profile.schouwingenGemeente);
    }
  }, [profile, isProfileLoading]);

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
  
   React.useEffect(() => {
    if (!selectedGemeente) {
      setGemeenteBoundary(null);
      return;
    };

    const fetchBoundary = async () => {
      setIsLoadingGemeente(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(selectedGemeente)}&format=json&polygon_geojson=1&countrycodes=nl&limit=1`
        );
        const data = await response.json();
        if (data && data.length > 0 && data[0].geojson) {
          setGemeenteBoundary(data[0].geojson);
        } else {
          setGemeenteBoundary(null);
        }
      } catch (error) {
        console.error("Fout bij ophalen gemeentegrens:", error);
        setGemeenteBoundary(null);
      } finally {
        setIsLoadingGemeente(false);
      }
    };

    fetchBoundary();

    if (user && firestore && profile?.schouwenGemeente !== selectedGemeente) {
        const userProfileRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userProfileRef, { schouwenGemeente: selectedGemeente });
    }

  }, [selectedGemeente, user, firestore, profile?.schouwenGemeente]);

  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !gemeenteBoundary) return;
    
    try {
        const bbox = turf.bbox(gemeenteBoundary);
        if(bbox[0] === Infinity) return;
        map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
    } catch (e) {
        console.error("Error fitting bounds for gemeente:", e);
    }
  }, [gemeenteBoundary]);

  React.useEffect(() => {
    let isMounted = true;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (isMounted) {
            const { longitude, latitude } = position.coords;
            setUserPosition([longitude, latitude]);
            if (!gemeenteBoundary && mapRef.current) {
              mapRef.current.getMap().flyTo({ center: [longitude, latitude], zoom: 14 });
            }
          }
        },
        (error) => console.error("Error getting current position:", error),
        { enableHighAccuracy: true }
      );
    }
    return () => { isMounted = false; };
  }, [gemeenteBoundary]);

  React.useEffect(() => {
    if (isFollowing) {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { longitude, latitude, heading } = position.coords;
                setUserPosition([longitude, latitude]);
                
                const newHeading = heading ?? userHeading;
                if(heading !== null) {
                    setUserHeading(heading);
                }

                if (mapRef.current) {
                    mapRef.current.getMap().easeTo({
                        center: [longitude, latitude],
                        zoom: 18,
                        bearing: newHeading,
                        pitch: 60,
                        duration: 1000
                    });
                }
            },
            (error) => {
                console.error("Error watching position:", error);
                setIsFollowing(false);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
        watchIdRef.current = watchId;
    } else {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
        if (mapRef.current?.getMap()) {
            mapRef.current.getMap().easeTo({
                pitch: 0,
                bearing: 0,
                duration: 1000
            });
        }
    }

    return () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
    };
  }, [isFollowing, userHeading]);
  
  const handleNewSchouwing = () => {
    setIsPlacingMode(true);
  };

  const handleEditSchouwing = (schouwing: Schouwing) => {
    setSelectedSchouwing(schouwing);
    setIsDialogOpen(true);
  }
  
  const handleMarkerClick = (schouwing: Schouwing, event: mapboxgl.MapboxEvent) => {
    event.originalEvent.stopPropagation();
    setSelectedSchouwing(schouwing);
  };
  

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const handleSuccess = () => {
      fetchSchouwingen();
      setSelectedSchouwing(null);
  }

  const handleMapClick = (event: MapLayerMouseEvent) => {
    // Prevent click logic when clicking on an existing marker
    const clickedFeatures = event.features?.map(f => f.layer.id) || [];
    if (clickedFeatures.some(id => id.startsWith('gl-draw') || id.startsWith('marker'))) {
        return;
    }

    if (isPlacingMode) {
      const { lng, lat } = event.lngLat;
      const newSchouwing: Partial<Schouwing> = {
        latitude: lat,
        longitude: lng,
        status: 'Open',
        datum: new Date().toISOString(),
        inspecteur: user?.displayName || user?.email || '',
      };
      setSelectedSchouwing(newSchouwing as Schouwing);
      setIsDialogOpen(true);
      setIsPlacingMode(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <header className="absolute top-0 left-0 z-10 p-4 flex flex-col sm:flex-row gap-4 w-full items-start sm:items-center">
        <div className="flex gap-4 w-full sm:w-auto pointer-events-auto bg-card p-2 rounded-lg shadow-md">
            <Select value={selectedGemeente || ''} onValueChange={setSelectedGemeente} disabled={isLoadingGemeente}>
                <SelectTrigger className="w-full sm:w-48">
                    <div className="flex items-center gap-2">
                    {isLoadingGemeente && <Loader2 className="h-4 w-4 animate-spin" />}
                    <SelectValue placeholder="Kies gemeente" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {gemeenten.map((gemeente) => (
                    <SelectItem key={gemeente} value={gemeente}>
                        {gemeente}
                    </SelectItem>
                    ))}
                </SelectContent>
            </Select>
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
            <Button onClick={handleNewSchouwing} disabled={!selectedProjectId}>
                <Plus className="mr-2 h-4 w-4" />
                Nieuwe Schouwing
            </Button>
            <Button variant={isFollowing ? 'secondary' : 'outline'} onClick={() => setIsFollowing(prev => !prev)}>
                <LocateFixed className="mr-2 h-4 w-4" />
                Volg
            </Button>
        </div>
      </header>

      {isPlacingMode && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 bg-card p-3 rounded-lg shadow-lg flex items-center gap-4 animate-pulse">
            <p className="text-sm font-medium">Klik op de kaart om de locatie te bepalen.</p>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsPlacingMode(false)}>
              <X className="h-4 w-4"/>
            </Button>
          </div>
      )}

      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        cursor={isPlacingMode ? 'crosshair' : 'grab'}
        onClick={handleMapClick}
      >
        {gemeenteBoundary && (
            <Source id="gemeente-boundary" type="geojson" data={gemeenteBoundary}>
                <Layer {...gemeenteBoundaryLayer} />
            </Source>
        )}
        {schouwingen.map((schouwing) => (
          <Marker
            key={schouwing.id}
            longitude={schouwing.longitude}
            latitude={schouwing.latitude}
            onClick={(e) => {
                e.originalEvent.stopPropagation();
                handleMarkerClick(schouwing, e);
            }}
          >
            <div className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white cursor-pointer" />
          </Marker>
        ))}
        {userPosition && (
          <Marker longitude={userPosition[0]} latitude={userPosition[1]}>
             <div className="flex items-center justify-center">
                 <svg width={isFollowing ? "32" : "16"} height={isFollowing ? "32" : "16"} viewBox="0 0 50 50" className={cn(isFollowing && 'animate-pulse')}>
                    <circle cx="25" cy="25" r="25" fill="#3b82f6" stroke="#ffffff" strokeWidth="4" />
                </svg>
              </div>
          </Marker>
        )}
        {selectedSchouwing && (
            <Popup
                longitude={selectedSchouwing.longitude}
                latitude={selectedSchouwing.latitude}
                onClose={() => setSelectedSchouwing(null)}
                closeButton={true}
                closeOnClick={false}
                anchor="bottom"
                offset={10}
                className="!p-0"
            >
                <div className="w-72 rounded-lg shadow-lg bg-card text-card-foreground overflow-hidden">
                    {selectedSchouwing.fotos && selectedSchouwing.fotos.length > 0 ? (
                        <div className="relative h-40 w-full bg-muted">
                            <Image
                                src={selectedSchouwing.fotos[0].url}
                                alt={`Foto van schouwing ${selectedSchouwing.id || ''}`}
                                fill
                                className="object-cover"
                            />
                        </div>
                    ) : null}
                    <div className="p-4">
                        <h3 className="font-bold text-lg mb-2 leading-tight">
                            Schouwing {selectedSchouwing.id?.slice(0, 6)}
                        </h3>
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                            <span className="font-semibold text-muted-foreground">Status:</span>
                            <span className="font-medium">{selectedSchouwing.status}</span>

                            <span className="font-semibold text-muted-foreground">Datum:</span>
                            <span className="font-medium">{format(new Date(selectedSchouwing.datum), 'dd-MM-yyyy', { locale: nl })}</span>
                            
                            <span className="font-semibold text-muted-foreground self-start">Opmerking:</span>
                            <p className="font-medium break-words">{selectedSchouwing.opmerkingen}</p>
                        </div>
                        <Button size="sm" className="w-full mt-4" onClick={() => handleEditSchouwing(selectedSchouwing)}>
                            Details Bewerken
                        </Button>
                    </div>
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
