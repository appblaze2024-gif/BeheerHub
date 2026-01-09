'use client';

import * as React from 'react';
import Map, { Marker, Popup } from 'react-map-gl';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Plus, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MeldingDialog } from '@/components/melding-dialog';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

type Melding = {
  id: string;
  meldingnummer: string;
  latitude: number;
  longitude: number;
  subcategorie: string;
  omschrijving: string;
  status:
    | 'Nieuw'
    | 'Intern doorgezet'
    | 'In behandeling'
    | 'Gepland op korte termijn'
    | 'Gepland op langere termijn'
    | 'Dubbel gemeld'
    | 'Afgerond'
    | 'Niet in beheer';
  aangemaakt: string;
  toelichting: string;
};

const statusConfig = {
  Nieuw: { color: '#facc15' }, // yellow-400
  'Intern doorgezet': { color: '#a855f7' }, // purple-500
  'In behandeling': { color: '#a855f7' }, // purple-500
  'Gepland op korte termijn': { color: '#f97316' }, // orange-500
  'Gepland op langere termijn': { color: '#f97316' }, // orange-500
  'Dubbel gemeld': { color: '#f97316' }, // orange-500
  Afgerond: { color: '#22c55e' }, // green-500
  'Niet in beheer': { color: '#737373' }, // neutral-500
};

export default function IssuesPage() {
  const firestore = useFirestore();
  const [selectedMelding, setSelectedMelding] = React.useState<Melding | null>(null);
  const [newMeldingCoords, setNewMeldingCoords] = React.useState<{lat: number, lng: number} | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  
  const meldingenCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'meldingen');
  }, [firestore]);

  const { data: meldingen, isLoading } = useCollection<Melding>(meldingenCollection);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const handleMapClick = (e: mapboxgl.MapLayerMouseEvent) => {
    // Only open new dialog if not clicking on an existing marker
    if (e.originalEvent.target.ariaLabel !== 'Map marker') {
        setNewMeldingCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        setIsDialogOpen(true);
    }
  };
  
  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
        setNewMeldingCoords(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
        <header className="absolute top-0 left-0 z-10 p-4 w-full flex items-center justify-between pointer-events-none">
            <div className="bg-card p-2 rounded-lg shadow-md pointer-events-auto">
                <h1 className="text-xl font-bold">Meldingen Portaal</h1>
            </div>
             <div className="w-full max-w-sm pointer-events-auto flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Zoek op meldingen of adres" className="pl-9" />
                </div>
                <Button onClick={() => alert("Klik op de kaart om een locatie voor de nieuwe melding te kiezen.")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nieuwe Melding
                </Button>
            </div>
        </header>

        <Map
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            onClick={handleMapClick}
            cursor="crosshair"
        >
            {meldingen?.map(melding => (
                <Marker
                    key={melding.id}
                    longitude={melding.longitude}
                    latitude={melding.latitude}
                    onClick={(e) => {
                        e.originalEvent.stopPropagation();
                        setSelectedMelding(melding);
                        setNewMeldingCoords(null);
                    }}
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
                    onClose={() => setSelectedMelding(null)}
                    closeOnClick={false}
                    anchor="bottom"
                >
                    <div className="p-1 max-w-xs">
                        <h3 className="font-bold text-base mb-2">Meldingnummer: {selectedMelding.meldingnummer}</h3>
                        <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-sm">
                            <span className="font-semibold">Subcategorie:</span>
                            <span>{selectedMelding.subcategorie}</span>
                            <span className="font-semibold">Omschrijving:</span>
                            <span>{selectedMelding.omschrijving}</span>
                            <span className="font-semibold">Status:</span>
                            <span>{selectedMelding.status}</span>
                            <span className="font-semibold">Aangemaakt:</span>
                            <span>{selectedMelding.aangemaakt}</span>
                             <span className="font-semibold">Toelichting:</span>
                            <span>{selectedMelding.toelichting}</span>
                        </div>
                    </div>
                </Popup>
            )}

            {newMeldingCoords && (
                <Marker longitude={newMeldingCoords.lng} latitude={newMeldingCoords.lat}>
                    <MapPin className="h-8 w-8 text-red-500" />
                </Marker>
            )}
        </Map>
         <MeldingDialog 
            open={isDialogOpen}
            onOpenChange={handleDialogClose}
            coordinates={newMeldingCoords}
        />
    </div>
  );
}
