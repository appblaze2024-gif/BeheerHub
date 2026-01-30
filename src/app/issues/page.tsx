'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer, FillLayer, LineLayer } from 'react-map-gl';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Calendar as CalendarIcon, Plus, Search, List, Map as MapIcon, Bell, Filter } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { useProfile } from '@/firebase/profile-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProject } from '@/context/project-context';
import { useIsMobile } from '@/hooks/use-mobile';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type Melding = {
  id: string;
  intakenummer: string;
  extern_meldingsnummer?: string;
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
  const isMobile = useIsMobile(1024);

  if (meldingen.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-8">
        <Bell className="h-12 w-12 mb-4" />
        <p className="text-lg">Geen meldingen gevonden</p>
        <p className="text-sm">Pas de filters aan of maak een nieuwe melding.</p>
      </div>
    );
  }

  if (isMobile) {
    return (
        <div className="overflow-auto p-2 sm:p-4 space-y-2 sm:space-y-3">
            {meldingen.map((melding) => (
                <Card key={melding.id} onClick={() => onMeldingClick(melding)} className="cursor-pointer hover:bg-muted/50">
                    <CardContent className="p-3 sm:p-4">
                        <div className="flex justify-between items-start gap-2">
                            <Badge
                                style={{
                                    backgroundColor: statusConfig[melding.status]?.color || '#ccc',
                                    color: statusConfig[melding.status]?.textColor || 'black',
                                    borderColor: statusConfig[melding.status]?.borderColor || '#ccc'
                                }}
                                variant={melding.status === 'Afgerond' ? 'default' : 'destructive'}
                                className="justify-center text-xs"
                            >
                                {melding.status}
                            </Badge>
                            <div className="text-right text-xs text-muted-foreground">
                                <div>{melding.datum ? format(new Date(melding.datum), 'dd-MM-yyyy') : '-'}</div>
                                <div>{melding.tijdstip || '-'}</div>
                            </div>
                        </div>
                        <h3 className="font-semibold mt-2 text-sm sm:text-base">{melding.subcategorie}</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">{melding.extra_informatie}</p>
                        <div className="flex justify-between items-end mt-2 pt-2 border-t">
                            <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{melding.intakenummer}</span>
                            <span className="text-xs text-muted-foreground">{melding.wijk || '-'}</span>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
  }

  return (
    <div className="overflow-auto">
      <div className="grid grid-cols-[140px_120px_100px_80px_120px_200px_1fr] min-w-[1200px] items-center gap-x-4 px-4 py-2 font-semibold bg-muted text-muted-foreground text-xs uppercase sticky top-0 z-10">
        <span>Status</span>
        <span>Wijk</span>
        <span>Datum</span>
        <span>Tijd</span>
        <span>Intakenummer</span>
        <span>Subcategorie</span>
        <span>Omschrijving</span>
      </div>
      {meldingen.map((melding) => (
        <div
          key={melding.id}
          onClick={() => onMeldingClick(melding)}
          className="grid grid-cols-[140px_120px_100px_80px_120px_200px_1fr] min-w-[1200px] items-center gap-x-4 px-4 py-3 border-b cursor-pointer hover:bg-muted/50"
        >
          <Badge
            style={{
              backgroundColor: statusConfig[melding.status]?.color || '#ccc',
              color: statusConfig[melding.status]?.textColor || 'black',
              borderColor: statusConfig[melding.status]?.borderColor || '#ccc'
            }}
            variant={melding.status === 'Afgerond' ? 'default' : 'destructive'}
            className="justify-center w-fit"
          >
            {melding.status}
          </Badge>
          <span className="truncate">{melding.wijk || '-'}</span>
          <span className="truncate">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yyyy') : '-'}</span>
          <span className="truncate">{melding.tijdstip || '-'}</span>
          <span className="font-medium truncate">{melding.intakenummer}</span>
          <span className="truncate">{melding.subcategorie}</span>
          <span className="truncate">{melding.extra_informatie}</span>
        </div>
      ))}
    </div>
  );
}


export default function IssuesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedMelding, setSelectedMelding] = React.useState<Melding | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);

  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
  const [viewMode, setViewMode] = React.useState<'map' | 'list'>('map');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500); // 500ms delay

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery]);


  React.useEffect(() => {
    const projectIdFromParam = searchParams.get('projectId');
    if (projectIdFromParam && projectIdFromParam !== selectedProjectId) {
      setSelectedProjectId(projectIdFromParam);
    }
    const wijkId = searchParams.get('wijkId');
    if (wijkId) {
      setSelectedWijkId(wijkId);
    }
    const view = searchParams.get('view');
    if (view === 'list' || view === 'map') {
        setViewMode(view);
    }
  }, [searchParams, selectedProjectId, setSelectedProjectId]);

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

  React.useEffect(() => {
    if (profile?.wijk && sortedWijken.length > 0) {
        const userWijk = sortedWijken.find(w => w.naam === profile.wijk);
        if (userWijk) {
            setSelectedWijkId(userWijk.id);
        } else {
            setSelectedWijkId(null);
        }
    }
  }, [profile, sortedWijken]);

  const selectedWijk = React.useMemo(() => {
      if (!selectedProject || !selectedWijkId || selectedWijkId === 'all') return null;
      return selectedProject.wijken?.find(w => w.id === selectedWijkId) ?? null;
  }, [selectedProject, selectedWijkId]);
  
  const wijkGeoJSON = React.useMemo(() => {
    const wijkenToDraw = selectedWijk
      ? [selectedWijk]
      : selectedWijkId === 'all' && selectedProject?.wijken
      ? selectedProject.wijken
      : [];

    if (wijkenToDraw.length === 0) return null;

    try {
      const features = wijkenToDraw.flatMap(wijk => {
        try {
          return JSON.parse(wijk.subGebieden) || [];
        } catch {
          return [];
        }
      });

      if (features.length > 0) {
        return {
          type: 'FeatureCollection',
          features: features.map((feature: any) => ({
            type: 'Feature',
            properties: {},
            geometry: feature.geometry,
          })),
        };
      }
    } catch (e) {
      console.error('Invalid GeoJSON for wijk(en)', e);
    }
    return null;
  }, [selectedWijk, selectedWijkId, selectedProject?.wijken]);


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

    const searchedMeldingen = debouncedSearchQuery
      ? timeFilteredMeldingen.filter(
          (m) => {
            const query = debouncedSearchQuery.toLowerCase();
            return (
                m.intakenummer?.toLowerCase().includes(query) ||
                m.extern_meldingsnummer?.toLowerCase().includes(query) ||
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

  }, [meldingen, selectedProjectId, selectedWijkId, projects, selectedDate, debouncedSearchQuery]);

  const openMeldingenCountPerWijk = React.useMemo(() => {
    if (!meldingen || !selectedProject?.wijken) return {};
    
    const counts: { [wijkId: string]: number } = {};
  
    for (const wijk of selectedProject.wijken) {
      counts[wijk.id] = meldingen.filter(m => m.wijk === wijk.naam && m.status !== 'Afgerond').length;
    }
    return counts;
  }, [meldingen, selectedProject?.wijken]);

  const mapRef = React.useRef<any>(null);
  const mapContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!mapContainerRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.getMap().resize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !wijkGeoJSON) return;

    try {
        const bbox = turf.bbox(wijkGeoJSON);
        if(bbox[0] === Infinity || bbox[1] === Infinity || bbox[2] === -Infinity || bbox[3] === -Infinity) {
          return;
        }
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
    <div ref={mapContainerRef} className="flex-1 flex flex-col min-h-0 relative">
      <header className="absolute top-0 left-0 z-10 p-4 flex flex-col gap-2 w-full pointer-events-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between w-full gap-4 pointer-events-auto">
            <div className="w-full md:max-w-sm">
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
        <div className="flex flex-col sm:flex-row gap-2 pointer-events-auto w-full md:w-auto">
            <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="bg-card"><Filter className="mr-2 h-4 w-4" /> Filters</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Filters</DialogTitle>
                        <DialogDescription>
                            Selecteer een project, wijk en datum om de meldingen te filteren.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className='space-y-2'>
                                <Label htmlFor='project-select' className='text-sm font-medium'>Project</Label>
                                    <Select
                                    value={selectedProjectId || ''}
                                    onValueChange={(value) => {
                                        setSelectedProjectId(value || null);
                                        setSelectedWijkId('all');
                                    }}
                                    disabled={isLoadingProjects}
                                    >
                                    <SelectTrigger id="project-select" className="w-full bg-card">
                                        <SelectValue placeholder="Selecteer een project" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>)}
                                    </SelectContent>
                                    </Select>
                            </div>
                            <div className='space-y-2'>
                                <Label htmlFor='wijk-select' className='text-sm font-medium'>Wijk</Label>
                                <Select
                                    value={selectedWijkId || 'all'}
                                    onValueChange={setSelectedWijkId}
                                    disabled={!selectedProject || !!profile?.wijk}
                                >
                                        <SelectTrigger id="wijk-select" className="w-full bg-card">
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
                        </div>
                        <div className='space-y-2 flex flex-col items-center'>
                            <Label className='text-sm font-medium self-start'>Datum</Label>
                            <div className="flex justify-center">
                                 <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={setSelectedDate}
                                    initialFocus
                                    locale={nl}
                                    className="rounded-md border bg-card w-auto"
                                />
                            </div>
                        </div>
                    </div>
                     <DialogFooter>
                        <Button onClick={() => setIsFilterOpen(false)}>Toepassen</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className='flex gap-2 items-center'>
                    <Button onClick={handleNewMelding}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nieuwe Melding
                    </Button>
                    <Button variant="outline" onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')} className="bg-card">
                      {viewMode === 'map' ? <List className="mr-2 h-4 w-4" /> : <MapIcon className="mr-2 h-4 w-4" />}
                      {viewMode === 'map' ? 'Lijst' : 'Kaart'}
                    </Button>
            </div>
        </div>
      </header>

      {viewMode === 'map' ? (
        <MapGL
            ref={mapRef}
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle={mapStyle}
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
        </MapGL>
      ) : (
        <div className="pt-28 px-4 pb-4 h-full">
            <Card className='h-full flex flex-col'>
                <CardHeader>
                    <CardTitle>Overzicht Meldingen ({filteredMeldingen.length})</CardTitle>
                </CardHeader>
                <CardContent className='p-0 flex-1 min-h-0 overflow-auto'>
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
