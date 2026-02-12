'use client';

import * as React from 'react';
import MapGL, { Marker, Popup } from 'react-map-gl';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Plus, Search, List, Map as MapIcon, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BestekmeldingDialog } from '@/components/bestekmelding-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Besteksmelding } from '@/lib/types';
import type { Project } from '@/app/projects/page';
import { useProfile } from '@/firebase/profile-provider';
import { useProject } from '@/context/project-context';
import { LoadingScreen } from '@/components/loading-screen';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const statusConfig: Record<string, { color: string; textColor: string; borderColor: string }> = {
  Nieuw: { color: '#ef4444', textColor: 'white', borderColor: '#ef4444' }, // red-500
  'In behandeling': { color: '#f97316', textColor: 'white', borderColor: '#f97316' }, // orange-500
  Afgerond: { color: '#22c55e', textColor: 'white', borderColor: '#22c55e' }, // green-500
};

function BestekmeldingenList({ meldingen, onMeldingClick }: { meldingen: Besteksmelding[], onMeldingClick: (melding: Besteksmelding) => void }) {
  if (meldingen.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-8">
        <Bell className="h-12 w-12 mb-4" />
        <p className="text-lg">Geen besteksmeldingen gevonden</p>
        <p className="text-sm">Pas de filters aan of maak een nieuwe melding.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      <div className="grid grid-cols-[1fr_2fr_1fr_120px_auto] items-center gap-x-4 px-4 py-2 font-semibold bg-muted text-muted-foreground text-xs uppercase sticky top-0 z-10">
        <span>Datum</span>
        <span>Werksoort</span>
        <span>Omschrijving</span>
        <span>Status</span>
        <span />
      </div>
      {meldingen.map((melding) => (
        <div
          key={melding.id}
          onClick={() => onMeldingClick(melding)}
          className="grid grid-cols-[1fr_2fr_1fr_120px_auto] items-center gap-x-4 px-4 py-3 border-b cursor-pointer hover:bg-muted/50"
        >
          <span className="truncate">{melding.datum ? format(new Date(melding.datum), 'dd-MM-yyyy') : '-'}</span>
          <span className="font-medium truncate">{melding.werksoort || 'Onbekend'}</span>
          <span className="truncate">{melding.omschrijving}</span>
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
          <div className="flex justify-end">
            {/* Action buttons if needed */}
          </div>
        </div>
      ))}
    </div>
  );
}


export default function SpecReportsPage() {
  const firestore = useFirestore();
  const [selectedMelding, setSelectedMelding] = React.useState<Besteksmelding | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [viewMode, setViewMode] = React.useState<'map' | 'list'>('list');
  const [searchQuery, setSearchQuery] = React.useState('');
  const { profile } = useProfile();
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';

  const isSuperUser = profile?.role === 'Super admin';
  const canCreate = isSuperUser || !!profile?.permissions?.specReports?.create;
  const canEdit = isSuperUser || !!profile?.permissions?.specReports?.edit;
  const canDelete = isSuperUser || !!profile?.permissions?.specReports?.delete;

  const projectsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const bestekmeldingenCollection = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return collection(firestore, 'projects', selectedProjectId, 'besteksmeldingen');
  }, [firestore, selectedProjectId]);

  const { data: meldingen, isLoading: isLoadingMeldingen } = useCollection<Besteksmelding>(bestekmeldingenCollection);

  const filteredMeldingen = React.useMemo(() => {
    if (!meldingen) return [];
    if (!searchQuery) return meldingen;

    return meldingen.filter(m => 
        (m.omschrijving && m.omschrijving.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.werksoort && m.werksoort.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  }, [meldingen, searchQuery]);

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
    return () => resizeObserver.disconnect();
  }, []);

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
  
  const handleMarkerClick = (e: mapboxgl.MapboxEvent<MouseEvent>, melding: Besteksmelding) => {
    e.originalEvent.stopPropagation();
    setSelectedMelding(melding);
  }

  const handlePopupClose = () => setSelectedMelding(null);

  const handleMeldingClickFromList = (melding: Besteksmelding) => {
    setSelectedMelding(melding);
    setIsDialogOpen(true);
  };
  
  React.useEffect(() => {
    if (selectedMelding && !isDialogOpen) {
      setIsDialogOpen(true);
    }
  }, [selectedMelding, isDialogOpen]);

  if (isLoadingProjects || (isLoadingMeldingen && selectedProjectId)) {
    return <LoadingScreen message="Besteksmeldingen laden..." />;
  }

  return (
    <div ref={mapContainerRef} className="flex-1 flex flex-col min-h-0 relative">
      <header className="absolute top-0 left-0 z-10 p-4 flex flex-col gap-2 w-full pointer-events-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between w-full gap-4 pointer-events-auto">
            <div className="w-full md:max-w-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Zoek op omschrijving of werksoort" 
                      className="pl-9 bg-card"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>
             <div className='space-y-2'>
                <Label htmlFor='project-select' className='text-sm font-medium sr-only'>Project</Label>
                <Select
                  value={selectedProjectId || ''}
                  onValueChange={(value) => setSelectedProjectId(value || null)}
                  disabled={isLoadingProjects}
                >
                  <SelectTrigger id="project-select" className="w-full md:w-72 bg-card">
                    <SelectValue placeholder="Selecteer een project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map(p => <SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>)}
                  </SelectContent>
                </Select>
            </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pointer-events-auto w-full md:w-auto">
            <div className='flex gap-2 items-center'>
                    {canCreate && <Button onClick={handleNewMelding} disabled={!selectedProjectId}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nieuwe Besteksmelding
                    </Button>}
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

            {selectedMelding && (
                <Popup
                    longitude={selectedMelding.longitude}
                    latitude={selectedMelding.latitude}
                    onClose={handlePopupClose}
                    closeOnClick={false}
                    anchor="bottom"
                >
                    <div className="p-1 max-w-xs">
                        <h3 className="font-bold text-base mb-2">{selectedMelding.werksoort || 'Onbekend'}</h3>
                        <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-sm">
                            <span className="font-semibold">Omschrijving:</span>
                            <span>{selectedMelding.omschrijving}</span>
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
        <div className="pt-36 px-4 pb-4 h-full flex flex-col">
            <h1 className="text-xl font-bold mb-4">Overzicht Besteksmeldingen ({filteredMeldingen?.length || 0})</h1>
            <Card className='flex-1 flex flex-col min-h-0'>
                <CardContent className='p-0 flex-1 min-h-0'>
                    <BestekmeldingenList meldingen={filteredMeldingen || []} onMeldingClick={handleMeldingClickFromList} />
                </CardContent>
            </Card>
        </div>
      )}
         <BestekmeldingDialog 
            open={isDialogOpen}
            onOpenChange={handleDialogClose}
            melding={selectedMelding}
            projectId={selectedProjectId}
            canEdit={canEdit}
            canDelete={canDelete}
        />
    </div>
  );
}
