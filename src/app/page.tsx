'use client';

import * as React from 'react';
import MapGL, { Source, Layer, type MapRef, Marker, Popup } from 'react-map-gl';
import { useProfile } from '@/firebase/profile-provider';
import * as turf from '@turf/turf';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Object as MapObject, Melding, Besteksmelding, Project, Wijk } from '@/lib/types';
import { Layers, LocateFixed, MapPin, Bell, FileWarning, Search, ChevronRight, LayoutGrid, Navigation, TrendingUp } from 'lucide-react';
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
        "flex items-center justify-between p-4 rounded-[1.5rem] transition-premium cursor-pointer group border-2",
        checked ? "bg-white border-primary/10 shadow-premium" : "border-transparent hover:bg-slate-50"
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <div className="flex items-center gap-5">
        <Checkbox id={label} checked={checked} onCheckedChange={onCheckedChange} className="rounded-md border-slate-300 h-6 w-6" />
        <div className="flex items-center gap-4">
          <div className={cn("p-3 rounded-2xl transition-premium", checked ? "bg-primary text-white shadow-lg" : "bg-slate-100 text-slate-400 group-hover:text-primary")}>
            <Icon className="h-5 w-5" />
          </div>
          <Label htmlFor={label} className="cursor-pointer text-[13px] font-black uppercase tracking-tight text-slate-900">
            {label}
          </Label>
        </div>
      </div>
      <Badge variant="secondary" className="font-black text-[11px] h-7 px-4 rounded-full bg-slate-100 text-slate-500 border-none">{count}</Badge>
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
                    padding: 80,
                    duration: 1500,
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
                map.fitBounds(bbox as [number, number, number, number], { padding: 80 });
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
          mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 16, duration: 1000 });
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
    <div className="flex-1 w-full h-full relative overflow-hidden">
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
                <div className="w-4 h-4 rounded-full cursor-pointer border-4 border-white bg-blue-600 shadow-2xl hover:scale-150 transition-premium" />
            </Marker>
        ))}
        {visibleLayers.meldingen && filteredMeldingen?.map(m => (
            <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedPin({...m, type: 'melding'}); }}>
                <div className="w-6 h-6 rounded-full cursor-pointer border-4 border-white bg-red-600 shadow-2xl flex items-center justify-center text-[10px] font-black text-white hover:scale-125 transition-premium">!</div>
            </Marker>
        ))}
        {visibleLayers.besteksmeldingen && filteredBesteksmeldingen?.map(b => (
            <Marker key={b.id} longitude={b.longitude} latitude={b.latitude} onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedPin({...b, type: 'besteksmelding'}); }}>
                <div className="w-4 h-4 rounded-full cursor-pointer border-4 border-white bg-orange-500 shadow-2xl hover:scale-150 transition-premium" />
            </Marker>
        ))}

        {userLocation && (
          <Marker longitude={userLocation.longitude} latitude={userLocation.latitude}>
            <div className="relative flex h-10 w-10 items-center justify-center">
              <div className="absolute h-12 w-12 rounded-full bg-blue-500/30 animate-pulse" />
              <div className="relative h-5 w-5 rounded-full bg-blue-600 border-4 border-white shadow-2xl" />
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
                <div className="p-4 max-w-[280px] space-y-4 rounded-3xl overflow-hidden">
                    <div className="space-y-1.5">
                        <Badge className="text-[9px] font-black uppercase bg-slate-900 tracking-widest">{selectedPin.type}</Badge>
                        <h3 className="font-black text-slate-900 uppercase tracking-tight truncate text-lg">
                            {selectedPin.type === 'object' ? `ID: ${selectedPin.idNummer || selectedPin.id}` : 
                             selectedPin.type === 'melding' ? selectedPin.intakenummer :
                             selectedPin.werksoort || 'Details'}
                        </h3>
                    </div>
                    <div className="space-y-1.5 text-xs font-bold text-slate-500 border-t border-slate-50 pt-3">
                        {selectedPin.type === 'object' && <p>Type: {selectedPin.locatieSubType || '-'}</p>}
                        {selectedPin.type === 'melding' && <p className="text-primary uppercase tracking-tight">{selectedPin.subcategorie}</p>}
                        <p className="truncate text-slate-900">{selectedPin.straatnaam} {selectedPin.huisnummer}</p>
                    </div>
                    <Button size="sm" className="w-full h-11 font-black uppercase text-[11px] tracking-widest rounded-2xl shadow-xl shadow-primary/10">Bekijk Volledige Details</Button>
                </div>
            </Popup>
        )}
      </MapGL>

      {/* Floating UI Elements */}
      <div className="absolute top-8 left-8 z-10 hidden lg:block animate-in slide-in-from-left-8 duration-700">
          <Card className="w-80 bg-white/90 backdrop-blur-2xl border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
              <CardHeader className="p-6 border-b bg-slate-50/50">
                  <div className="flex items-center gap-3">
                      <div className="bg-primary p-2 rounded-xl shadow-lg">
                          <LayoutGrid className="h-5 w-5 text-white" />
                      </div>
                      <CardTitle className="text-sm font-black uppercase tracking-tight text-slate-900">Live Dashboard</CardTitle>
                  </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[1.5rem] shadow-inner-soft">
                      <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Actieve Meldingen</p>
                          <p className="text-2xl font-black text-slate-900 leading-none">{filteredMeldingen?.length || 0}</p>
                      </div>
                      <div className="bg-red-100 p-2 rounded-full"><Bell className="h-5 w-5 text-red-600" /></div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[1.5rem] shadow-inner-soft">
                      <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">GIS Objecten</p>
                          <p className="text-2xl font-black text-slate-900 leading-none">{filteredObjects?.length || 0}</p>
                      </div>
                      <div className="bg-blue-100 p-2 rounded-full"><MapPin className="h-5 w-5 text-blue-600" /></div>
                  </div>
                  <Button className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs gap-3 shadow-xl shadow-primary/20" onClick={() => router.push('/navigation-module')}>
                      <Navigation className="h-5 w-5 fill-current" /> START NAVIGATIE
                  </Button>
              </CardContent>
          </Card>
      </div>

      <div className="absolute top-8 right-8 z-10 flex flex-col items-end gap-4 pointer-events-none">
            <Button
                variant="secondary"
                size="icon"
                className="rounded-[1.5rem] h-14 w-14 shadow-2xl bg-white/95 backdrop-blur-xl border-4 border-white text-slate-600 hover:bg-white active:scale-95 transition-premium pointer-events-auto"
                onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
            >
                <Layers className="h-7 w-7" />
            </Button>
            
            <Button
                variant={isTrackingLocation ? "default" : "secondary"}
                size="icon"
                className={cn(
                    "rounded-[1.5rem] h-14 w-14 shadow-2xl border-4 active:scale-95 transition-premium pointer-events-auto",
                    isTrackingLocation ? "bg-primary border-primary text-white" : "bg-white/95 backdrop-blur-xl border-white text-slate-600 hover:bg-white"
                )}
                onClick={() => setIsTrackingLocation(!isTrackingLocation)}
            >
                <LocateFixed className="h-7 w-7" />
            </Button>

            {isLayersPanelOpen && (
                <Card className="w-80 bg-white/90 backdrop-blur-2xl border-none shadow-2xl rounded-[2.5rem] overflow-hidden pointer-events-auto animate-in slide-in-from-right-8 duration-500">
                    <CardHeader className="flex flex-row items-center justify-between p-6 border-b bg-slate-50/50">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Kaartlagen & Data</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2">
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