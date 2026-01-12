'use client';

import * as React from 'react';
import Map, { Marker, Popup, Source, Layer, FillLayer, LineLayer } from 'react-map-gl';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Calendar as CalendarIcon, Plus, Search, List, Map as MapIcon, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MeldingDialog } from '@/components/melding-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as turf from '@turf/turf';
import type { Wijk } from '@/app/projects/page';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, isSameDay, startOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type Melding = {
  id: string;
  intakenummer: string;
  latitude: number;
  longitude: number;
  subcategorie: string;
  hoofdcategorie: string;
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
  tijdstip: string;
  melder: string;
  aangenomen_door?: string;
  afgehandeld_door?: string;
  afhandeling_datum?: string; // Completion date yyyy-MM-dd
  straatnaam?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
  wijk?: string;
};

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
};

const statusConfig: Record<string, { color: string; textColor: string; borderColor: string }> = {
  Nieuw: { color: '#ef4444', textColor: 'white', borderColor: '#ef4444' }, // red-500
  'Intern doorgezet': { color: '#ef4444', textColor: 'white', borderColor: '#ef4444' },
  'In behandeling': { color: '#ef4444', textColor: 'white', borderColor: '#ef4444' },
  'Gepland op korte termijn': { color: '#ef4444', textColor: 'white', borderColor: '#ef4444' },
  'Gepland op langere termijn': { color: '#ef4444', textColor: 'white', borderColor: '#ef4444' },
  'Dubbel gemeld': { color: '#ef4444', textColor: 'white', borderColor: '#ef4444' },
  Afgerond: { color: '#22c55e', textColor: 'white', borderColor: '#22c55e' }, // green-500
  'Niet in beheer': { color: '#737373', textColor: 'white', borderColor: '#737373' }, // neutral-500
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

function MeldingenList({ meldingen, onMeldingClick }: { meldingen: Melding[], onMeldingClick: (melding: Melding) => void }) {
  if (meldingen.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-8">
        <Bell className="h-12 w-12 mb-4" />
        <p className="text-lg">Geen meldingen gevonden</p>
        <p className="text-sm">Pas de filters aan of maak een nieuwe melding.</p>
      </div>
    );
  }

  const formatAdres = (melding: Melding) => {
    const streetAndNumber = [melding.straatnaam, melding.huisnummer].filter(Boolean).join(' ');
    const cityAndZip = [melding.postcode, melding.plaats].filter(Boolean).join(' ');
    return [streetAndNumber, cityAndZip].filter(Boolean).join(', ');
  }

  return (
    <div className="overflow-y-auto">
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_2fr_2fr_1fr_120px] items-center gap-x-4 px-4 py-2 font-semibold bg-muted text-muted-foreground text-xs uppercase sticky top-0 z-10">
        <span>Tijd</span>
        <span>Intakenummer</span>
        <span>Wijk</span>
        <span>Subcategorie</span>
        <span>Omschrijving</span>
        <span>Adres</span>
        <span>Melder</span>
        <span>Status</span>
      </div>
      {meldingen.map((melding) => (
        <div
          key={melding.id}
          onClick={() => onMeldingClick(melding)}
          className="grid grid-cols-[1fr_1fr_1fr_1fr_2fr_2fr_1fr_120px] items-center gap-x-4 px-4 py-3 border-b cursor-pointer hover:bg-muted/50"
        >
          <span className="truncate">{melding.tijdstip || '-'}</span>
          <span className="font-medium truncate">{melding.intakenummer}</span>
          <span className="truncate">{melding.wijk || '-'}</span>
          <span className="truncate">{melding.subcategorie}</span>
          <span className="truncate">{melding.extra_informatie}</span>
          <span className="truncate">{formatAdres(melding)}</span>
          <span className="truncate">{melding.melder || '-'}</span>
          <Badge
            style={{
              backgroundColor: statusConfig[melding.status]?.color || '#ccc',
              color: statusConfig[melding.status]?.textColor || 'black',
              borderColor: statusConfig[melding.status]?.borderColor || '#ccc'
            }}
            variant={melding.status === 'Afgerond' ? 'default' : 'destructive'}
            className="justify-center"
          >
            {melding.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}


export default function IssuesPage() {
  const firestore = useFirestore();
  const [selectedMelding, setSelectedMelding] = React.useState<Melding | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
  const [viewMode, setViewMode] = React.useState<'map' | 'list'>('map');
  const [searchQuery, setSearchQuery] = React.useState('');

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

    let timeFilteredMeldingen = meldingen;

    if (selectedDate) {
      const dayStart = startOfDay(selectedDate);
      timeFilteredMeldingen = meldingen.filter(melding => {
        try {
          const creationDate = startOfDay(new Date(melding.datum));
          
          const isCompletedToday =
            melding.status === 'Afgerond' &&
            melding.afhandeling_datum &&
            isSameDay(startOfDay(new Date(melding.afhandeling_datum)), dayStart);
          
          const isOpenAndRelevant =
            melding.status !== 'Afgerond' && creationDate <= dayStart;

          return isCompletedToday || isOpenAndRelevant;
        } catch (e) {
          console.error("Invalid date for melding:", melding.id, melding.datum);
          return false;
        }
      });
    }

    const searchedMeldingen = searchQuery
      ? timeFilteredMeldingen.filter(
          (m) => {
            const query = searchQuery.toLowerCase();
            return (
                m.intakenummer?.toLowerCase().includes(query) ||
                m.straatnaam?.toLowerCase().includes(query) ||
                m.plaats?.toLowerCase().includes(query) ||
                m.postcode?.toLowerCase().includes(query) ||
                m.subcategorie?.toLowerCase().includes(query) ||
                m.hoofdcategorie?.toLowerCase().includes(query) ||
                m.melder?.toLowerCase().includes(query) ||
                m.extra_informatie?.toLowerCase().includes(query) ||
                m.wijk?.toLowerCase().includes(query) ||
                m.status?.toLowerCase().includes(query) ||
                m.aangenomen_door?.toLowerCase().includes(query) ||
                m.afgehandeld_door?.toLowerCase().includes(query)
            );
          }
        )
      : timeFilteredMeldingen;

    if (!selectedProjectId) {
      return [];
    }
    
    const project = projects?.find(p => p.id === selectedProjectId);
    if (!project?.wijken) return [];

    if (!selectedWijkId || selectedWijkId === 'all') {
      const allProjectWijkNames = project.wijken.map(w => w.naam);
      return searchedMeldingen.filter(m => {
        if (m.wijk && allProjectWijkNames.includes(m.wijk)) {
            return true;
        }

        if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return false;
        const point = turf.point([m.longitude, m.latitude]);
        
        for (const wijk of project.wijken || []) {
            try {
                const wijkFeatures = JSON.parse(wijk.subGebieden);
                 if (Array.isArray(wijkFeatures)) {
                    for (const polygon of wijkFeatures) {
                        if (turf.booleanPointInPolygon(point, polygon.geometry)) return true;
                    }
                 }
            } catch {
                continue;
            }
        }
        return false;
      });
    }

    const wijk = project.wijken.find(w => w.id === selectedWijkId);
    if (!wijk) return [];
    
    return searchedMeldingen.filter(melding => {
        if (melding.wijk === wijk.naam) {
          return true;
        }
    
        try {
            const wijkFeatures = JSON.parse(wijk.subGebieden);
            if (Array.isArray(wijkFeatures) && wijkFeatures.length > 0) {
              if (typeof melding.latitude !== 'number' || typeof melding.longitude !== 'number') return false;
              const point = turf.point([melding.longitude, melding.latitude]);
              for (const polygon of wijkFeatures) {
                if (turf.booleanPointInPolygon(point, polygon)) return true;
              }
            }
        } catch {
            return false;
        }
        return false;
    });

  }, [meldingen, selectedProjectId, selectedWijkId, projects, selectedDate, searchQuery]);

  const openMeldingenCountPerWijk = React.useMemo(() => {
    if (!meldingen || !selectedProject?.wijken) return {};
    
    const counts: { [wijkId: string]: number } = {};
  
    for (const wijk of selectedProject.wijken) {
      counts[wijk.id] = meldingen.filter(m => m.wijk === wijk.naam && m.status !== 'Afgerond').length;
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

  const handleMeldingClickFromList = (melding: Melding) => {
    setSelectedMelding(melding);
    setIsDialogOpen(true);
  };


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
                                onSelect={setSelectedDate}
                                initialFocus
                                locale={nl}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                <div className='flex gap-2 items-center'>
                    <Button onClick={handleNewMelding} disabled={!selectedProjectId}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nieuwe Melding
                    </Button>
                    <Button variant="outline" onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')} className="bg-card">
                      {viewMode === 'map' ? <List className="mr-2 h-4 w-4" /> : <MapIcon className="mr-2 h-4 w-4" />}
                      {viewMode === 'map' ? 'Lijst' : 'Kaart'}
                    </Button>
                </div>
            </div>
            <div className="w-full max-w-sm pointer-events-auto">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Zoek op meldingen of adres" 
                      className="pl-9 bg-card"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>
        </div>
      </header>

      {viewMode === 'map' ? (
        <Map
            ref={mapRef}
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
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
      ) : (
        <div className="pt-48 px-4 pb-4 h-full">
            <Card className='h-full flex flex-col'>
                <CardHeader>
                    <CardTitle>Overzicht Meldingen ({filteredMeldingen.length})</CardTitle>
                </CardHeader>
                <CardContent className='p-0 flex-1 min-h-0'>
                    <MeldingenList meldingen={filteredMeldingen} onMeldingClick={handleMeldingClickFromList} />
                </CardContent>
            </Card>
        </div>
      )}
         <MeldingDialog 
            open={isDialogOpen}
            onOpenChange={handleDialogClose}
            melding={selectedMelding}
        />
    </div>
  );
}
