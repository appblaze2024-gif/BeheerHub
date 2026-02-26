'use client';

import * as React from 'react';
import MapGL, { Source, Layer, type MapRef, Marker, Popup } from 'react-map-gl';
import { useProfile } from '@/firebase/profile-provider';
import * as turf from '@turf/turf';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Object as MapObject, Melding, Besteksmelding, Project, Wijk } from '@/lib/types';
import { Layers, LocateFixed, MapPin, Bell, FileWarning, Search, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';


const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const boundaryLayer: Layer = {
  id: 'municipality-outline',
  type: 'line',
  paint: {
    'line-color': '#000000',
    'line-width': 2,
  },
};

const LayerToggle = ({ label, count, checked, onCheckedChange, color, icon: Icon }: { label: string, count: number, checked: boolean, onCheckedChange: (checked: boolean) => void, color: string, icon: any }) => (
    <div 
      className={cn(
        "flex items-center justify-between p-3 rounded-2xl transition-premium cursor-pointer group border-2",
        checked ? "bg-white border-primary/10 shadow-sm" : "border-transparent hover:bg-slate-50"
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <div className="flex items-center gap-4">
        <Checkbox id={label} checked={checked} onCheckedChange={onCheckedChange} className="rounded-md border-slate-300 h-5 w-5" />
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-xl transition-premium", checked ? "bg-primary text-white" : "bg-slate-100 text-slate-400 group-hover:text-primary")}>
            <Icon className="h-4 w-4" />
          </div>
          <Label htmlFor={label} className="cursor-pointer text-xs font-black uppercase tracking-tight text-slate-900">
            {label}
          </Label>
        </div>
      </div>
      <Badge variant="secondary" className="font-black text-[10px] h-6 px-3 rounded-full bg-slate-100 text-slate-500 border-none">{count}</Badge>
    </div>
);

export default function DashboardPage() {
  const mapRef = React.useRef<MapRef>(null);
  const { profile } = useProfile();
  const firestore = useFirestore();

  const [boundary, setBoundary] = React.useState<any>(null);
  const [viewState, setViewState] = React.useState({
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  });

  const [visibleLayers, setVisibleLayers] = React.useState({
    objects: false,
    meldingen: true,
    besteksmeldingen: false,
  });

  const [selectedPin, setSelectedPin] = React.useState<any>(null);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = React.useState(true);
  const [isTrackingLocation, setIsTrackingLocation] = React.useState(false);
  const [userLocation, setUserLocation] = React.useState<{ latitude: number, longitude: number } | null>(null);
  const locationWatcherId = React.useRef<number | null>(null);

  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12';

  const allProjectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);
  const { data: allProjects } = useCollection<Project>(allProjectsQuery);
  
  const userWijk = React.useMemo(() => {
    if (!profile?.wijk || !allProjects) return null;
    for (const project of allProjects) {
        const wijk = project.wijken?.find(w => w.naam === profile.wijk);
        if (wijk) return wijk;
    }
    return null;
  }, [profile?.wijk, allProjects]);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore || !visibleLayers.objects) return null;
    const colRef = collection(firestore, 'objects');
    if (profile?.role === 'medewerkers' && profile?.wijk) {
        return query(colRef, where('locatieWerkgebieden', 'array-contains', profile.wijk));
    }
    return colRef;
  }, [firestore, visibleLayers.objects, profile?.role, profile?.wijk]);
  
  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore || !visibleLayers.meldingen) return null;
    const colRef = collection(firestore, 'meldingen');
    const q = query(colRef, where('status', 'not-in', ['Afgerond', 'Niet in beheer']));
    if (profile?.role === 'medewerkers' && profile?.wijk) {
        return query(q, where('wijk', '==', profile.wijk));
    }
    return q;
  }, [firestore, visibleLayers.meldingen, profile?.role, profile?.wijk]);
  
  const projectsQuery = useMemoFirebase(() => {
    if (!firestore || !visibleLayers.besteksmeldingen) return null;
    return collection(firestore, 'projects');
  }, [firestore, visibleLayers.besteksmeldingen]);

  const { data: objects } = useCollection<MapObject>(objectsQuery);
  const { data: meldingen } = useCollection<Melding>(meldingenQuery);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsQuery);
  
  const [allBesteksmeldingen, setAllBesteksmeldingen] = React.useState<Besteksmelding[]>([]);

  React.useEffect(() => {
    if (!visibleLayers.besteksmeldingen || !projects || !firestore) {
      setAllBesteksmeldingen([]);
      return;
    }
    const fetchAll = async () => {
      const promises = projects.map(p => {
        if (!p.id) return Promise.resolve(null);
        let q = collection(firestore, 'projects', p.id, 'besteksmeldingen');
        return getDocs(query(q, where('status', '!=', 'Afgerond')));
      });
      const snapshots = await Promise.all(promises);
      const allMeldingen = snapshots.filter(s => s).flatMap(snap => snap!.docs.map(d => ({ ...d.data(), id: d.id } as Besteksmelding)));
      setAllBesteksmeldingen(allMeldingen);
    }
    fetchAll();
  }, [projects, firestore, visibleLayers.besteksmeldingen]);

  const wijkPolygonFeatures = React.useMemo(() => {
    if (!userWijk?.subGebieden) return null;
    try {
      return JSON.parse(userWijk.subGebieden);
    } catch {
      return null;
    }
  }, [userWijk]);

  const filterByWijk = React.useCallback((items: any[] | null) => {
    if (!items) return null;
    if (!userWijk || !wijkPolygonFeatures) return items;

    return items.filter(item => {
      if (typeof item.latitude !== 'number' || typeof item.longitude !== 'number') return false;
      const point = turf.point([item.longitude, item.latitude]);
      for (const polygon of wijkPolygonFeatures) {
        if (turf.booleanPointInPolygon(point, polygon)) {
          return true;
        }
      }
      return false;
    });
  }, [userWijk, wijkPolygonFeatures]);

  const filteredObjects = React.useMemo(() => filterByWijk(objects), [objects, filterByWijk]);
  const filteredMeldingen = React.useMemo(() => filterByWijk(meldingen), [meldingen, filterByWijk]);
  const filteredBesteksmeldingen = React.useMemo(() => filterByWijk(allBesteksmeldingen), [allBesteksmeldingen, filterByWijk]);

  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    const setBoundaryAndFit = (geojson: any) => {
        setBoundary(geojson);
        if (map && map.isStyleLoaded()) {
            try {
                const bbox = turf.bbox(geojson);
                map.fitBounds(bbox as [number, number, number, number], {
                    padding: 60,
                    duration: 1000,
                });
            } catch (e) {}
        }
    };
    if (userWijk) {
        try {
            const features = JSON.parse(userWijk.subGebieden);
            if (Array.isArray(features) && features.length > 0) {
                setBoundaryAndFit(turf.featureCollection(features));
            }
        } catch (e) {
            setBoundary(null);
        }
    } else if (profile?.schouwenGemeente && profile.role !== 'medewerkers') {
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(profile.schouwenGemeente)}&format=json&polygon_geojson=1&countrycodes=nl`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.length > 0 && data[0].geojson) {
            setBoundaryAndFit(data[0].geojson);
          }
        })
        .catch(console.error);
    } else {
        setBoundary(null);
    }
  }, [userWijk, profile?.schouwenGemeente, profile?.role]);

  const onMapLoad = React.useCallback(() => {
      if (boundary) {
          const map = mapRef.current?.getMap();
          if (map) {
            try {
                const bbox = turf.bbox(boundary);
                map.fitBounds(bbox as [number, number, number, number], { padding: 60 });
            } catch(e) {}
          }
      }
  }, [boundary]);

  React.useEffect(() => {
    if (isTrackingLocation) {
      if (!navigator.geolocation) return;
      locationWatcherId.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
          mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15 });
        },
        () => setIsTrackingLocation(false),
        { enableHighAccuracy: true }
      );
    } else {
      if (locationWatcherId.current !== null) {
        navigator.geolocation.clearWatch(locationWatcherId.current);
        locationWatcherId.current = null;
      }
      setUserLocation(null);
    }
    return () => { if (locationWatcherId.current !== null) navigator.geolocation.clearWatch(locationWatcherId.current); };
  }, [isTrackingLocation]);

  return (
    <div className="flex-1 w-full h-full relative">
       <MapGL
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onLoad={onMapLoad}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        {boundary && (
          <Source id="municipality-boundary" type="geojson" data={boundary}>
            <Layer {...boundaryLayer} />
          </Source>
        )}

        {visibleLayers.objects && filteredObjects?.map(obj => (
            <Marker key={obj.id} longitude={obj.longitude} latitude={obj.latitude} onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedPin({...obj, type: 'object'}); }}>
                <div className="w-3.5 h-3.5 rounded-full cursor-pointer border-2 border-white bg-blue-600 shadow-lg group-hover:scale-125 transition-premium" />
            </Marker>
        ))}
        {visibleLayers.meldingen && filteredMeldingen?.map(m => (
            <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedPin({...m, type: 'melding'}); }}>
                <div className="w-4 h-4 rounded-full cursor-pointer border-2 border-white bg-red-600 shadow-xl flex items-center justify-center text-[8px] font-black text-white">!</div>
            </Marker>
        ))}
        {visibleLayers.besteksmeldingen && filteredBesteksmeldingen?.map(b => (
            <Marker key={b.id} longitude={b.longitude} latitude={b.latitude} onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedPin({...b, type: 'besteksmelding'}); }}>
                <div className="w-3.5 h-3.5 rounded-full cursor-pointer border-2 border-white bg-orange-500 shadow-lg" />
            </Marker>
        ))}

        {userLocation && (
          <Marker longitude={userLocation.longitude} latitude={userLocation.latitude}>
            <div className="relative flex h-6 w-6 items-center justify-center">
              <div className="absolute h-8 w-8 rounded-full bg-blue-500/20 animate-pulse" />
              <div className="relative h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-xl shadow-blue-600/30" />
            </div>
          </Marker>
        )}

        {selectedPin && (
            <Popup
                longitude={selectedPin.longitude}
                latitude={selectedPin.latitude}
                onClose={() => setSelectedPin(null)}
                closeOnClick={false}
                anchor="bottom"
                className="z-[60]"
            >
                <div className="p-3 max-w-[240px] space-y-3">
                    <div className="space-y-1">
                        <Badge className="text-[8px] font-black uppercase bg-slate-900">{selectedPin.type}</Badge>
                        <h3 className="font-black text-slate-900 uppercase tracking-tight truncate">
                            {selectedPin.type === 'object' ? `ID: ${selectedPin.idNummer || selectedPin.id}` : 
                             selectedPin.type === 'melding' ? selectedPin.intakenummer :
                             selectedPin.werksoort || 'Details'}
                        </h3>
                    </div>
                    <div className="space-y-1 text-[11px] font-medium text-slate-500 border-t pt-2">
                        {selectedPin.type === 'object' && <p>Type: {selectedPin.locatieSubType || '-'}</p>}
                        {selectedPin.type === 'melding' && <p>{selectedPin.subcategorie}</p>}
                        <p className="truncate">{selectedPin.straatnaam} {selectedPin.huisnummer}</p>
                    </div>
                    <Button size="sm" className="w-full h-8 font-black uppercase text-[10px] tracking-widest rounded-xl">Bekijk Details</Button>
                </div>
            </Popup>
        )}
      </MapGL>

      <div className="absolute top-6 right-6 z-10 flex flex-col items-end gap-3 pointer-events-none">
            <Button
                variant="secondary"
                size="icon"
                className="rounded-2xl h-12 w-12 shadow-2xl bg-white/95 backdrop-blur-xl border-2 border-slate-100 text-slate-600 hover:bg-white active:scale-95 transition-premium pointer-events-auto"
                onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
            >
                <Layers className="h-6 w-6" />
            </Button>
            
            <Button
                variant={isTrackingLocation ? "default" : "secondary"}
                size="icon"
                className={cn(
                    "rounded-2xl h-12 w-12 shadow-2xl border-2 active:scale-95 transition-premium pointer-events-auto",
                    isTrackingLocation ? "bg-primary border-primary text-white" : "bg-white/95 backdrop-blur-xl border-slate-100 text-slate-600 hover:bg-white"
                )}
                onClick={() => setIsTrackingLocation(!isTrackingLocation)}
            >
                <LocateFixed className="h-6 w-6" />
            </Button>

            {isLayersPanelOpen && (
                <Card className="w-72 bg-white/95 backdrop-blur-xl border-2 border-slate-100 shadow-2xl rounded-[2rem] overflow-hidden pointer-events-auto animate-in slide-in-from-right-4 duration-300">
                    <CardHeader className="flex flex-row items-center justify-between p-5 border-b bg-slate-50/50">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Kaartlagen & Data</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 space-y-1">
                        <LayerToggle 
                            label="Objecten" 
                            count={filteredObjects?.length || 0}
                            checked={visibleLayers.objects} 
                            onCheckedChange={(checked) => setVisibleLayers(v => ({...v, objects: !!checked}))}
                            color="bg-blue-600"
                            icon={MapPin}
                        />
                        <LayerToggle 
                            label="Meldingen" 
                            count={filteredMeldingen?.length || 0}
                            checked={visibleLayers.meldingen} 
                            onCheckedChange={(checked) => setVisibleLayers(v => ({...v, meldingen: !!checked}))}
                            color="bg-red-600"
                            icon={Bell}
                        />
                        <LayerToggle 
                            label="Bestek" 
                            count={filteredBesteksmeldingen?.length || 0}
                            checked={visibleLayers.besteksmeldingen} 
                            onCheckedChange={(checked) => setVisibleLayers(v => ({...v, besteksmeldingen: !!checked}))}
                            color="bg-orange-500"
                            icon={FileWarning}
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    </div>
  );
}