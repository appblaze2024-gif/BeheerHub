
'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import MapGL, { NavigationControl, ScaleControl, Source, Layer, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useParams } from 'next/navigation';
import { useDoc, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { Layers, Loader2, Info, Map as MapIcon, Calendar, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface SharedMap {
  id: string;
  name: string;
  viewState: any;
  visibleLayerIds: string[];
  creatorId: string;
  createdAt: string;
}

interface GISLayer {
  id: string;
  name: string;
  data: string;
  color: string;
  type: 'fill' | 'line' | 'circle';
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  icon?: string;
}

export default function PublicSharedMapPage() {
  const params = useParams();
  const id = params.id as string;
  const firestore = useFirestore();
  const mapRef = useRef<MapRef>(null);

  const sharedMapRef = useMemoFirebase(() => (firestore && id) ? doc(firestore, 'shared_maps', id) : null, [firestore, id]);
  const { data: sharedMap, isLoading: isLoadingMap } = useDoc<SharedMap>(sharedMapRef);

  const creatorLayersQuery = useMemoFirebase(() => {
    if (!firestore || !sharedMap) return null;
    return collection(firestore, 'users', sharedMap.creatorId, 'gisLayers');
  }, [firestore, sharedMap]);

  const { data: allCreatorLayers } = useCollection<GISLayer>(creatorLayersQuery);

  const visibleLayers = React.useMemo(() => {
    if (!allCreatorLayers || !sharedMap) return [];
    return allCreatorLayers.filter(l => sharedMap.visibleLayerIds.includes(l.id));
  }, [allCreatorLayers, sharedMap]);

  const parseLayerData = (data: any) => {
    if (!data) return null;
    if (typeof data === 'object') return data;
    if (data === "[object Object]") return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to parse GIS layer data:", e);
      return null;
    }
  };

  if (isLoadingMap) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Kaart laden...</p>
      </div>
    );
  }

  if (!sharedMap) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl mb-6">
            <Info className="h-12 w-12 text-slate-200" />
        </div>
        <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Link niet geldig</h1>
        <p className="text-sm text-slate-500 mt-2 font-bold uppercase tracking-widest text-[10px]">De gedeelde kaart kon niet worden gevonden.</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 z-50 shadow-2xl">
        <div className="flex items-center gap-4 min-w-0">
            <div className="bg-primary p-2 rounded-xl shrink-0"><MapIcon className="h-5 w-5 text-white" /></div>
            <div className="min-w-0">
                <h1 className="text-lg font-black uppercase tracking-tight truncate">{sharedMap.name}</h1>
                <div className="flex items-center gap-3 text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none mt-0.5">
                    <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {format(new Date(sharedMap.createdAt), 'd MMM yyyy', { locale: nl })}</span>
                    <span>•</span>
                    <span className="text-primary flex items-center gap-1.5"><Layers className="h-3 w-3" /> {visibleLayers.length} Lagen</span>
                </div>
            </div>
        </div>
        <img src="https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png" alt="BeheerHub" className="h-6 opacity-50 brightness-0 invert" />
      </header>

      <div className="flex-1 relative">
        <MapGL
          ref={mapRef}
          initialViewState={{
            longitude: sharedMap.viewState.center.lng,
            latitude: sharedMap.viewState.center.lat,
            zoom: sharedMap.viewState.zoom,
            pitch: sharedMap.viewState.pitch,
            bearing: sharedMap.viewState.bearing
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <ScaleControl position="bottom-left" />

          {visibleLayers.map(layer => {
            const layerData = parseLayerData(layer.data);
            if (!layerData) return null;

            return (
              <Source key={layer.id} id={layer.id} type="geojson" data={layerData}>
                {layer.type === 'fill' && (
                  <Layer
                    id={`${layer.id}-fill`}
                    type="fill"
                    paint={{ 'fill-color': layer.color, 'fill-opacity': 0.4 }}
                  />
                )}
                {(layer.type === 'line' || layer.type === 'fill') && (
                  <Layer
                    id={`${layer.id}-line`}
                    type="line"
                    paint={{ 
                      'line-color': layer.color, 
                      'line-width': layer.lineWidth || 2,
                      ...(layer.lineStyle === 'dashed' ? { 'line-dasharray': [4, 2] } : {}),
                      ...(layer.lineStyle === 'dotted' ? { 'line-dasharray': [1, 2] } : {}),
                    }}
                    layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                  />
                )}
                {layer.type === 'circle' && (
                  <Layer
                    id={`${layer.id}-point`}
                    type="circle"
                    paint={{ 'circle-color': layer.color, 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }}
                  />
                )}
              </Source>
            );
          })}
        </MapGL>

        <div className="absolute top-6 left-6 z-10 w-64 max-h-[70vh] flex flex-col bg-white/95 backdrop-blur-md shadow-2xl rounded-3xl border border-white overflow-hidden animate-in slide-in-from-left-4 duration-500">
            <div className="p-4 bg-slate-50 border-b flex items-center gap-3">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Legenda</h3>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                    {visibleLayers.map(layer => {
                        const IconComp = (Icons as any)[layer.icon || (layer.type === 'fill' ? 'Square' : layer.type === 'line' ? 'Minus' : 'Circle')] || Icons.Circle;
                        return (
                            <div key={layer.id} className="flex items-center gap-3 group">
                                <div className="h-8 w-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm shrink-0">
                                    <IconComp className="h-4 w-4" style={{ color: layer.color, fill: layer.type === 'fill' ? layer.color : 'none' }} />
                                </div>
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight truncate">{layer.name}</span>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
            <div className="p-4 bg-slate-900 text-white text-[8px] font-black uppercase tracking-[0.2em] text-center italic">
                BEKEKEN VIA BEHEERHUB GIS
            </div>
        </div>

        <div className="absolute bottom-4 right-16 z-10 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-[8px] font-black text-slate-500 uppercase flex items-center gap-2 border border-slate-200">
          <span>Gedeeld door BeheerHub Gebruiker</span>
        </div>
      </div>
    </div>
  );
}
