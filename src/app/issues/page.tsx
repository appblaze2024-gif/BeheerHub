'use client';

import * as React from 'react';
import Map, { Marker, Popup, Source, Layer, FillLayer, LineLayer } from 'react-map-gl';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Calendar as CalendarIcon, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MeldingDialog } from '@/components/melding-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as turf from '@turf/turf';
import type { Wijk } from '@/app/projects/page';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type Melding = {
  id: string;
  intakenummer: string;
  latitude: number;
  longitude: number;
  subcategorie: string;
  extra_informatie: string;
  status:
    | 'Nieuw'
    | 'Intern doorgezet'
    | 'In behandeling'
    | 'Gepland op korte termijn'
    | 'Gepland op langere termijn'
    | 'Dubbel gemeld'
    | 'Afgerond'
    | 'Niet in beheer';
  datum: string; // Creation date yyyy-MM-dd
  afhandeling_datum?: string; // Completion date yyyy-MM-dd
  straatnaam?: string;
  postcode?: string;
  plaats?: string;
};

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
};

const statusConfig = {
  Nieuw: { color: '#ef4444' }, // red-500
  'Intern doorgezet': { color: '#ef4444' }, // red-500
  'In behandeling': { color: '#ef4444' }, // red-500
  'Gepland op korte termijn': { color: '#ef4444' }, // red-500
  'Gepland op langere termijn': { color: '#ef4444' }, // red-500
  'Dubbel gemeld': { color: '#ef4444' }, // red-500
  Afgerond: { color: '#22c55e' }, // green-500
  'Niet in beheer': { color: '#737373' }, // neutral-500
};

const polygonFillLayer: FillLayer = {
    id: 'wijk-polygon-fill',
    type: 'fill',
    paint: {
        'fill-color': '#000000',
        'fill-opacity': 0.3,
    },
};

const polygonOutlineLayer: LineLayer = {
    id: 'wijk-polygon-outline',
    type: 'line',
    paint: {
        'line-color': '#000000',
        'line-width': 2,
    },
};


export default function IssuesPage() {
  const firestore = useFirestore();
  const [selectedMelding, setSelectedMelding] = React.useState<Melding | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());

  const meldingenCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'meldingen');
  }, [firestore]);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: meldingen, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenCollection);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const sortedWijken = React.useMemo(() => {
    if (!selectedProject?.wijken) return [];
    return [...selectedProject.wijken].sort((a, b) => 
      a.naam.localeCompare(b.naam, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [selectedProject?.wijken]);

  const selectedWijk = React.useMemo(() => {
      if (!selectedProject || !selectedWijkId || selectedWijkId === 'all') return null;
      return selectedProject.wijken?.find(w => w.id === selectedWijkId) ?? null;
  }, [selectedProject, selectedWijkId]);
  
 const wijkGeoJSON = React.useMemo(() => {
    if (!selectedWijk) return null;
    try {
        const features = JSON.parse(selectedWijk.subGebieden);
        if (Array.isArray(features) && features.length > 0) {
            return {
                type: 'FeatureCollection',
                features: features.map(feature => ({
                    type: 'Feature',
                    properties: {},
                    geometry: feature.geometry,
                })),
            };
        }
    } catch(e) {
        console.error("Invalid GeoJSON for wijk", selectedWijk.naam, e);
    }
    return null;
  }, [selectedWijk]);


  const filteredMeldingen = React.useMemo(() => {
    if (!meldingen) return [];

    // 1. Filter by project and wijk
    let wijkFiltered: Melding[] = [];
    if (!selectedProjectId) {
      wijkFiltered = []; // No project selected, show no issues
    } else {
      const project = projects?.find(p => p.id === selectedProjectId);
      if (!project?.wijken) {
        wijkFiltered = []; // No districts in project
      } else if (!selectedWijkId || selectedWijkId === 'all') {
        // "All districts" selected, filter by all districts in the project
        const allWijkPolygons = project.wijken.flatMap(w => {
          try {
            const features = JSON.parse(w.subGebieden);
            return Array.isArray(features) ? features : [];
          } catch { return []; }
        });
        
        if(allWijkPolygons.length === 0) {
          // If no polygons are defined for any district in the project, maybe show all issues for the project?
          // For now, we assume if districts are used, they have polygons. If not, this part needs a product decision.
          // Let's assume we show no issues if no polygons are defined.
          wijkFiltered = [];
        } else {
          wijkFiltered = meldingen.filter(melding => {
            if (typeof melding.latitude !== 'number' || typeof melding.longitude !== 'number') return false;
            const point = turf.point([melding.longitude, melding.latitude]);
            for (const polygonFeature of allWijkPolygons) {
              if (turf.booleanPointInPolygon(point, polygonFeature)) return true;
            }
            return false;
          });
        }
      } else if (wijkGeoJSON) {
        // Specific district selected
        wijkFiltered = meldingen.filter(melding => {
          if (typeof melding.latitude !== 'number' || typeof melding.longitude !== 'number') return false;
          try {
            const point = turf.point([melding.longitude, melding.latitude]);
            // Check against all features in the selected wijk's FeatureCollection
            for (const feature of wijkGeoJSON.features) {
              if (turf.booleanPointInPolygon(point, feature)) return true;
            }
            return false;
          } catch(e) {
            console.error("Error during point in polygon check", e);
            return false;
          }
        });
      }
    }

    // 2. Filter by date
    const dayStart = startOfDay(selectedDate);

    return wijkFiltered.filter(melding => {
        const creationDate = startOfDay(new Date(melding.datum));

        if (melding.status === 'Afgerond') {
            if (!melding.afhandeling_datum) return false;
            const completionDate = startOfDay(new Date(melding.afhandeling_datum));
            return isSameDay(completionDate, dayStart);
        } else {
            return creationDate <= dayStart;
        }
    });

  }, [meldingen, selectedProjectId, selectedWijkId, wijkGeoJSON, projects, selectedDate]);

  const openMeldingenCountPerWijk = React.useMemo(() => {
    if (!meldingen || !selectedProject?.wijken) return {};
    
    const counts: { [wijkId: string]: number } = {};
  
    for (const wijk of selectedProject.wijken) {
      let openCount = 0;
      try {
        const features = JSON.parse(wijk.subGebieden);
        if (Array.isArray(features) && features.length > 0) {
          for (const melding of meldingen) {
            if (melding.status !== 'Afgerond' && typeof melding.latitude === 'number' && typeof melding.longitude === 'number') {
              const point = turf.point([melding.longitude, melding.latitude]);
              for (const polygon of features) {
                if (turf.booleanPointInPolygon(point, polygon)) {
                  openCount++;
                  break; // Count melding only once per wijk
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore parsing errors for this calculation
      }
      counts[wijk.id] = openCount;
    }
    return counts;
  }, [meldingen, selectedProject?.wijken]);

  const mapRef = React.useRef<any>(null);

  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !wijkGeoJSON) return;

    try {
        const bbox = turf.bbox(wijkGeoJSON);
        map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
    } catch (e) {
        console.error("Error fitting bounds:", e);
    }
  }, [wijkGeoJSON]);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };
  
  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
     if (!open) {
      setSelectedMelding(null);
    }
  }

  const handleNewMelding = () => {
    setSelectedMelding(null);
    setIsDialogOpen(true);
  }
  
  const handleMarkerClick = (e: mapboxgl.MapboxEvent<MouseEvent>, melding: Melding) => {
    e.originalEvent.stopPropagation();
    setSelectedMelding(melding);
  }

  const handlePopupClose = () => {
      setSelectedMelding(null);
  }

  React.useEffect(() => {
    if (selectedMelding && !isDialogOpen) {
      setIsDialogOpen(true);
    }
  }, [selectedMelding, isDialogOpen]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <header className="absolute top-0 left-0 z-10 p-4 flex flex-col gap-2 items-start w-full">
        <div className="flex items-start justify-between w-full">
            <div className="flex flex-col gap-2 items-start pointer-events-auto">
                <div className="bg-card p-2 rounded-lg shadow-md">
                    <h1 className="text-xl font-bold">Meldingen Portaal</h1>
                </div>
                <div className='flex gap-4'>
                    <div>
                        <Label htmlFor='project-select' className='text-sm font-medium sr-only'>Project</Label>
                         <Select
                          value={selectedProjectId || ''}
                          onValueChange={(value) => {
                            setSelectedProjectId(value);
                            setSelectedWijkId('all');
                          }}
                          disabled={isLoadingProjects}
                        >
                          <SelectTrigger id="project-select" className="w-[200px] bg-card">
                            <SelectValue placeholder="Selecteer een project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>)}
                          </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor='wijk-select' className='text-sm font-medium sr-only'>Wijk</Label>
                        <Select
                            value={selectedWijkId || 'all'}
                            onValueChange={setSelectedWijkId}
                            disabled={!selectedProject}
                        >
                             <SelectTrigger id="wijk-select" className="w-[200px] bg-card">
                                <SelectValue placeholder="Selecteer een wijk" />
                             </SelectTrigger>
                             <SelectContent>
                                <SelectItem value="all">Alle wijken</SelectItem>
                                {sortedWijken.map(w => (
                                  <SelectItem key={w.id} value={w.id}>
                                    <div className='flex justify-between items-center w-full'>
                                      <span>{w.naam}</span>
                                       {(openMeldingenCountPerWijk[w.id] || 0) > 0 && (
                                        <Badge variant="destructive" className="ml-2 px-2 py-0.5 h-5">{openMeldingenCountPerWijk[w.id]}</Badge>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                             </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Popover>
                            <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                "w-[200px] justify-start text-left font-normal bg-card",
                                !selectedDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {selectedDate ? format(selectedDate, "PPP", { locale: nl }) : <span>Kies een datum</span>}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={(date) => date && setSelectedDate(date)}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                <Button onClick={handleNewMelding} disabled={!selectedProjectId}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nieuwe Melding
                </Button>
            </div>
            <div className="w-full max-w-sm pointer-events-auto">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Zoek op meldingen of adres" className="pl-9 bg-card" />
                </div>
            </div>
        </div>
      </header>

        <Map
            ref={mapRef}
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/light-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            cursor="default"
        >
            {filteredMeldingen?.map(melding => (
                <Marker
                    key={melding.id}
                    longitude={melding.longitude}
                    latitude={melding.latitude}
                    onClick={(e) => handleMarkerClick(e, melding)}
                >
                    <div
                        aria-label="Map marker"
                        className="w-4 h-4 rounded-full cursor-pointer border-2 border-white"
                        style={{ backgroundColor: statusConfig[melding.status]?.color || '#ccc' }}
                    />
                </Marker>
            ))}

            {wijkGeoJSON && (
                 <Source id="wijk-polygon" type="geojson" data={wijkGeoJSON}>
                    <Layer {...polygonFillLayer} />
                    <Layer {...polygonOutlineLayer} />
                </Source>
            )}

            {selectedMelding && (
                <Popup
                    longitude={selectedMelding.longitude}
                    latitude={selectedMelding.latitude}
                    onClose={handlePopupClose}
                    closeOnClick={false}
                    anchor="bottom"
                >
                    <div className="p-1 max-w-xs">
                        <h3 className="font-bold text-base mb-2">Melding: {selectedMelding.intakenummer}</h3>
                        <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-sm">
                            <span className="font-semibold">Locatie:</span>
                            <span>{selectedMelding.straatnaam}, {selectedMelding.plaats}</span>
                            <span className="font-semibold">Subcategorie:</span>
                            <span>{selectedMelding.subcategorie}</span>
                            <span className="font-semibold">Omschrijving:</span>
                            <span>{selectedMelding.extra_informatie}</span>
                            <span className="font-semibold">Status:</span>
                            <span>{selectedMelding.status}</span>
                            <span className="font-semibold">Aangemaakt:</span>
                            <span>{selectedMelding.datum}</span>
                        </div>
                         <Button size="sm" className="w-full mt-2" onClick={() => setIsDialogOpen(true)}>
                          Details bekijken
                        </Button>
                    </div>
                </Popup>
            )}
        </Map>
         <MeldingDialog 
            open={isDialogOpen}
            onOpenChange={handleDialogClose}
            melding={selectedMelding}
        />
    </div>
  );
}

    