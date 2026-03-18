'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import MapGL, { NavigationControl, ScaleControl, type MapRef } from 'react-map-gl';
import { 
  Search, 
  Layers, 
  MousePointer2, 
  Pencil, 
  Printer, 
  Download, 
  Library, 
  Home, 
  Plus, 
  Minus,
  Maximize2,
  List,
  User,
  BarChart3,
  Settings2,
  HelpCircle,
  ChevronDown,
  Info,
  Map as MapIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProfile } from '@/firebase/profile-provider';
import { useNavigationUI } from '@/context/navigation-ui-context';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function GISDataPage() {
  const { profile } = useProfile();
  const { setIsHeaderVisible } = useNavigationUI();
  const mapRef = useRef<MapRef>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/light-v11';

  // Verberg de standaard app-header voor deze full-screen ervaring
  useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  const initialViewState = {
    longitude: 6.083,
    latitude: 52.516,
    zoom: 14,
    pitch: 0,
    bearing: 0
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="h-10 bg-[#009ee3] text-white flex items-center justify-between px-4 shrink-0 z-50 shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <MapIcon className="h-5 w-5 text-white/80" />
            <h1 className="text-sm font-black uppercase tracking-tight">BeheerHub GIS | Stadsdijken Zwolle</h1>
          </div>
          <Separator orientation="vertical" className="h-4 bg-white/20" />
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest hidden sm:block">
            Mogelijk gemaakt door BeheerHub GIS
          </p>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 rounded-none">
            <List className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 rounded-none">
            <Layers className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 rounded-none">
            <User className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 rounded-none">
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-4 bg-white/20 mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 rounded-none" onClick={() => window.history.back()}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Map Container */}
      <div className="flex-1 relative">
        <MapGL
          ref={mapRef}
          initialViewState={initialViewState}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyle}
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <ScaleControl position="bottom-left" />
        </MapGL>

        {/* Left Side Controls Overlay */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
          {/* Search Box */}
          <div className="flex items-center bg-white shadow-2xl border border-slate-200 h-10 w-72 group focus-within:border-primary transition-all">
            <div className="px-3 border-r border-slate-100 h-full flex items-center">
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </div>
            <Input 
              placeholder="Adres of plaats zoeken" 
              className="border-none bg-transparent h-full text-xs font-bold rounded-none shadow-none focus-visible:ring-0 placeholder:text-slate-400 uppercase tracking-tight"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button className="px-3 hover:text-primary transition-colors h-full border-l border-slate-50">
              <Search className="h-4 w-4 text-slate-400 group-focus-within:text-primary" />
            </button>
          </div>

          {/* Toolbar Group */}
          <div className="flex flex-col bg-white shadow-2xl border border-slate-200 w-10">
            <ToolButton icon={Layers} active />
            <ToolButton icon={MousePointer2} />
            <ToolButton icon={Pencil} />
            <ToolButton icon={Printer} />
            <ToolButton icon={Download} />
            <ToolButton icon={Library} />
          </div>

          {/* Zoom/Home Group */}
          <div className="flex flex-col bg-white shadow-2xl border border-slate-200 w-10">
            <ToolButton icon={Home} onClick={() => mapRef.current?.flyTo({ center: [initialViewState.longitude, initialViewState.latitude], zoom: initialViewState.zoom })} />
            <ToolButton icon={Maximize2} />
          </div>
        </div>

        {/* Legend/Info Overlay - Right Bottom */}
        <div className="absolute bottom-10 right-16 z-10 hidden md:block">
          <div className="bg-white/90 backdrop-blur-md p-3 border border-slate-200 shadow-xl min-w-[120px] flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-green-500 rounded-none border border-black/10" />
              <span className="text-[10px] font-black uppercase tracking-tight text-slate-700">Dijkvak Noord</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-blue-500 rounded-none border border-black/10" />
              <span className="text-[10px] font-black uppercase tracking-tight text-slate-700">Dijkvak West</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-orange-500 rounded-none border border-black/10" />
              <span className="text-[10px] font-black uppercase tracking-tight text-slate-700">Areaal Grens</span>
            </div>
          </div>
        </div>

        {/* Attribution / Credits Overlay */}
        <div className="absolute bottom-0 right-0 z-10 bg-white/60 backdrop-blur-sm px-2 py-0.5 text-[8px] font-bold text-slate-500 uppercase flex items-center gap-2">
          <span>Esri Nederland, Community Map Contributors | BeheerHub GIS v1.2</span>
          <img src="https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png" alt="BeheerHub" className="h-2 opacity-50" />
        </div>
      </div>
    </div>
  );
}

function ToolButton({ 
  icon: Icon, 
  active = false, 
  onClick 
}: { 
  icon: any, 
  active?: boolean, 
  onClick?: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "h-10 w-10 flex items-center justify-center border-b border-slate-100 last:border-b-0 transition-all active:bg-slate-100",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-white" : "text-current")} />
    </button>
  );
}

function Separator({ orientation, className }: { orientation: 'vertical' | 'horizontal', className?: string }) {
  return (
    <div className={cn(
      orientation === 'vertical' ? 'w-[1px]' : 'h-[1px]',
      'bg-slate-200',
      className
    )} />
  );
}

function X(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
