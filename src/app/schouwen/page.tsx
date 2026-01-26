'use client';

import * as React from 'react';
import MapGL, { Marker, Source, Layer, FillLayer, LineLayer, MapLayerMouseEvent } from 'react-map-gl';
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
import { Plus, Layers as MapLayersIcon, LocateFixed, X, CircleAlert, Filter, Search, MapPin, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import * as turf from '@turf/turf';

import type { Project } from '@/app/projects/page';
import type { Schouwing } from '@/lib/types';
import { SchouwDialog } from '@/components/schouw-dialog';
import { useProfile } from '@/firebase/profile-provider';
import { updateDocumentNonBlocking } from '@/firebase';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { GemeenteSelect } from '@/components/gemeente-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const gemeenteBoundaryLayer: LineLayer = {
    id: 'gemeente-boundary-outline',
    type: 'line',
    paint: {
      'line-color': '#000000',
      'line-width': 3,
    },
  };

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
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResult, setSearchResult] = React.useState<{lat: number, lon: number} | null>(null);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const mapRef = React.useRef<any>(null);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  
  // State for PDF import queue
  const [pdfQueue, setPdfQueue] = React.useState<string[]>([]);
  const [currentPdf, setCurrentPdf] = React.useState<string | null>(null);


  React.useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResult(null);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            searchQuery
          )}&format=json&countrycodes=nl&limit=1`
        );
        const data = await response.json();
        if (data && data.length > 0) {
          const result = data[0];
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          if (!isNaN(lat) && !isNaN(lon)) {
            setSearchResult({ lat, lon });
            if (mapRef.current) {
              mapRef.current.getMap().flyTo({ center: [lon, lat], zoom: 16 });
            }
          }
        } else {
          setSearchResult(null);
        }
      } catch (error) {
        console.error("Fout bij zoeken:", error);
        setSearchResult(null);
      }
    }, 500); // 500ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  React.useEffect(() => {
    if (profile?.schouwenMapStyle) {
      setMapStyle(profile.schouwenMapStyle);
    }
    if (!isProfileLoading && profile?.schouwenGemeente) {
      setSelectedGemeente(profile.schouwenGemeente);
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
    setCurrentPdf(null);
    setIsPlacingMode(true);
  };
  
  const handlePdfFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedProjectId) return;

    const fileList = Array.from(files);
    const promises = fileList.map(file => {
      return new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises).then(dataUrls => {
      setPdfQueue(dataUrls);
    });

    event.target.value = '';
  };
  
  React.useEffect(() => {
    if (pdfQueue.length > 0 && !isDialogOpen) {
      setCurrentPdf(pdfQueue[0]);
      setSelectedSchouwing(null);
      setIsDialogOpen(true);
    } else if (pdfQueue.length === 0) {
      setCurrentPdf(null);
    }
  }, [pdfQueue, isDialogOpen]);

  const handleEditSchouwing = (schouwing: Schouwing) => {
    setCurrentPdf(null);
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
      setCurrentPdf(null);
      setSelectedSchouwing(newSchouwing as Schouwing);
      setIsDialogOpen(true);
      setIsPlacingMode(false);
    }
  };

  const filteredSchouwingen = React.useMemo(() => {
    if (!schouwingen) return [];
    if (!searchQuery) return schouwingen;

    return schouwingen.filter(s =>
      s.straatnaam?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [schouwingen, searchQuery]);


  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <header className="absolute top-0 left-0 z-10 p-4 w-full">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op straatnaam..."
                  className="pl-9 bg-card shadow-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="bg-card shadow-sm"><Filter className="mr-2 h-4 w-4" /> Filters</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Filters en Weergave</DialogTitle>
                        <DialogDescription>
                            Filter de schouwingen op project, gemeente en pas de kaartstijl aan.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className='space-y-2'>
                            <Label>Gemeente</Label>
                            <GemeenteSelect 
                              value={selectedGemeente}
                              onValueChange={setSelectedGemeente}
                              disabled={isLoadingGemeente}
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label>Project</Label>
                            <Select onValueChange={setSelectedProjectId} disabled={isLoadingProjects} value={selectedProjectId || ''}>
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
                        </div>
                        <div className='space-y-2'>
                            <Label>Kaartstijl</Label>
                            <Select onValueChange={handleMapStyleChange} value={mapStyle}>
                              <SelectTrigger>
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
                        </div>
                    </div>
                     <DialogFooter>
                        <Button onClick={() => setIsFilterOpen(false)}>Toepassen</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Button onClick={handleNewSchouwing} disabled={!selectedProjectId} className="shadow-sm">
                <Plus className="mr-2 h-4 w-4" />
                Nieuwe Schouwing
            </Button>
            <Button variant="outline" className="bg-card shadow-sm" onClick={() => pdfInputRef.current?.click()} disabled={!selectedProjectId}>
                <Upload className="mr-2 h-4 w-4" /> Importeer van PDF
            </Button>
            <input
                ref={pdfInputRef}
                type="file"
                className="hidden"
                accept="application/pdf"
                onChange={handlePdfFileSelect}
                multiple
            />
            <Button variant={isFollowing ? 'secondary' : 'outline'} onClick={() => setIsFollowing(prev => !prev)} className="bg-card shadow-sm">
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
        {filteredSchouwingen.map((schouwing) => (
          <Marker
            key={schouwing.id}
            longitude={schouwing.longitude}
            latitude={schouwing.latitude}
            onClick={(e) => {
                e.originalEvent.stopPropagation();
                handleEditSchouwing(schouwing);
            }}
          >
            <CircleAlert className="h-10 w-10 text-red-600 bg-white rounded-full p-1 border-2 border-red-600 shadow-lg cursor-pointer animate-pulse" />
          </Marker>
        ))}
        {userPosition && (
          <Marker longitude={userPosition[0]} latitude={userPosition[1]}>
             <div className="flex items-center justify-center">
                 <svg width={isFollowing ? "32" : "24"} height={isFollowing ? "32" : "24"} viewBox="0 0 50 50" className={cn(isFollowing && 'animate-pulse')}>
                    <circle cx="25" cy="25" r="25" fill="#3b82f6" stroke="#ffffff" strokeWidth="4" />
                </svg>
              </div>
          </Marker>
        )}
        {searchResult && (
            <Marker longitude={searchResult.lon} latitude={searchResult.lat}>
                <MapPin className="h-8 w-8 text-blue-600" />
            </Marker>
        )}
      </MapGL>
      <SchouwDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
                if (currentPdf) {
                    setPdfQueue(prev => prev.slice(1));
                }
                setCurrentPdf(null);
                setSelectedSchouwing(null);
            }
        }}
        projectId={selectedProjectId}
        schouwing={selectedSchouwing}
        onSuccess={handleSuccess}
        pdfToImport={currentPdf}
      />
    </div>
  );
}
