'use client';

import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import MapGL, { NavigationControl, ScaleControl, Source, Layer, type MapRef } from 'react-map-gl';
import { 
  Search, 
  Layers, 
  MousePointer2, 
  Pencil, 
  Printer, 
  Download, 
  Library, 
  Home, 
  Maximize2,
  List,
  User,
  BarChart3,
  ChevronDown,
  X,
  UploadCloud,
  FileJson,
  Table as TableIcon,
  Loader2,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProfile } from '@/firebase/profile-provider';
import { useNavigationUI } from '@/context/navigation-ui-context';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import * as shapefile from 'shapefile';
import * as XLSX from 'xlsx';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface GISLayer {
  id: string;
  name: string;
  data: any;
  visible: boolean;
  color: string;
  type: 'fill' | 'line' | 'circle';
}

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'
];

export default function GISDataPage() {
  const { profile } = useProfile();
  const { setIsHeaderVisible } = useNavigationUI();
  const { toast } = useToast();
  const mapRef = useRef<MapRef>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [layers, setLayers] = useState<GISLayer[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const mapStyle = profile?.schouwenMapStyle || 'mapbox://styles/mapbox/light-v11';

  useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  const initialViewState = {
    longitude: 6.083,
    latitude: 52.516,
    zoom: 10,
    pitch: 0,
    bearing: 0
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const fileList = Array.from(files);
    
    try {
      // GeoJSON
      const geojsonFiles = fileList.filter(f => f.name.endsWith('.geojson') || f.name.endsWith('.json'));
      for (const file of geojsonFiles) {
        const text = await file.text();
        const data = JSON.parse(text);
        addLayer(file.name, data);
      }

      // Shapefile (needs .shp and .dbf)
      const shpFile = fileList.find(f => f.name.endsWith('.shp'));
      const dbfFile = fileList.find(f => f.name.endsWith('.dbf'));
      if (shpFile && dbfFile) {
        const shpBuffer = await shpFile.arrayBuffer();
        const dbfBuffer = await dbfFile.arrayBuffer();
        const geojson = await shapefile.read(shpBuffer, dbfBuffer);
        addLayer(shpFile.name, geojson);
      }

      // Excel / CSV
      const sheetFiles = fileList.filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.csv'));
      for (const file of sheetFiles) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet) as any[];
        
        // Try to find lat/lon columns
        const features = json.map(row => {
          const latKey = Object.keys(row).find(k => k.toLowerCase().includes('lat') || k.toLowerCase().includes('breedte'));
          const lonKey = Object.keys(row).find(k => k.toLowerCase().includes('lon') || k.toLowerCase().includes('lng') || k.toLowerCase().includes('lengte'));
          
          if (latKey && lonKey) {
            return turf.point([parseFloat(row[lonKey]), parseFloat(row[latKey])], row);
          }
          return null;
        }).filter(Boolean);

        if (features.length > 0) {
          addLayer(file.name, turf.featureCollection(features as any));
        }
      }

      setIsUploadOpen(false);
      setIsLayersPanelOpen(true);
      toast({ title: 'Laag toegevoegd', description: 'De GIS-data is succesvol op de kaart geladen.' });
    } catch (error) {
      console.error('File parsing error:', error);
      toast({ variant: 'destructive', title: 'Fout bij uploaden', description: 'Zorg ervoor dat het bestandstype ondersteund wordt.' });
    } finally {
      setIsProcessing(false);
      event.target.value = ''; // Reset input
    }
  };

  const addLayer = (name: string, data: any) => {
    const id = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine geometry type for styling
    let type: 'fill' | 'line' | 'circle' = 'circle';
    const firstFeature = data.features?.[0] || data;
    const geomType = firstFeature.geometry?.type || firstFeature.type;
    
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') type = 'fill';
    else if (geomType === 'LineString' || geomType === 'MultiLineString') type = 'line';

    const newLayer: GISLayer = {
      id,
      name,
      data,
      visible: true,
      color: PRESET_COLORS[layers.length % PRESET_COLORS.length],
      type
    };

    setLayers(prev => [...prev, newLayer]);

    // Fly to the new layer bounds
    try {
      const bbox = turf.bbox(data);
      if (bbox[0] !== Infinity && mapRef.current) {
        mapRef.current.fitBounds([bbox[0], bbox[1], bbox[2], bbox[3]], { padding: 40, duration: 1000 });
      }
    } catch (e) {}
  };

  const toggleLayerVisibility = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  const removeLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="h-10 bg-[#009ee3] text-white flex items-center justify-end px-4 shrink-0 z-50 shadow-md">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 rounded-none">
            <List className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("h-8 w-8 text-white hover:bg-white/10 rounded-none", isLayersPanelOpen && "bg-white/20")}
            onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
          >
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

          {/* Render Uploaded Layers */}
          {layers.map(layer => (
            <Source key={layer.id} id={layer.id} type="geojson" data={layer.data}>
              {layer.type === 'fill' && (
                <Layer
                  id={`${layer.id}-fill`}
                  type="fill"
                  paint={{ 'fill-color': layer.color, 'fill-opacity': 0.4 }}
                  layout={{ visibility: layer.visible ? 'visible' : 'none' }}
                />
              )}
              {layer.type === 'line' || layer.type === 'fill' ? (
                <Layer
                  id={`${layer.id}-line`}
                  type="line"
                  paint={{ 'line-color': layer.color, 'line-width': 2 }}
                  layout={{ visibility: layer.visible ? 'visible' : 'none' }}
                />
              ) : null}
              {layer.type === 'circle' && (
                <Layer
                  id={`${layer.id}-point`}
                  type="circle"
                  paint={{ 'circle-color': layer.color, 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }}
                  layout={{ visibility: layer.visible ? 'visible' : 'none' }}
                />
              )}
            </Source>
          ))}
        </MapGL>

        {/* Left Side Controls Overlay */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
          {/* Search Box */}
          <div className="flex items-center bg-white shadow-2xl border border-slate-200 h-10 w-72 group focus-within:border-primary transition-all rounded-none">
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
            <ToolButton 
              icon={Layers} 
              active={isLayersPanelOpen} 
              onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
            />
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

        {/* Layers Sidebar Panel */}
        {isLayersPanelOpen && (
          <div className="absolute top-4 right-4 z-20 w-80 bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[80vh] rounded-none animate-in slide-in-from-right-4">
            <div className="p-4 border-b flex items-center justify-between bg-slate-50">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Kaartlagen</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsLayersPanelOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="p-4 border-b">
              <Button 
                onClick={() => setIsUploadOpen(true)}
                className="w-full h-10 font-black uppercase text-[10px] tracking-widest rounded-none shadow-lg shadow-primary/20"
              >
                <UploadCloud className="mr-2 h-4 w-4" /> Lagen Uploaden
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {layers.length > 0 ? (
                  layers.map(layer => (
                    <div key={layer.id} className="flex items-center justify-between p-2 hover:bg-slate-50 group border border-transparent hover:border-slate-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <button 
                          onClick={() => toggleLayerVisibility(layer.id)}
                          className={cn(
                            "h-8 w-8 flex items-center justify-center rounded-none border transition-all",
                            layer.visible ? "bg-white border-slate-200" : "bg-slate-100 border-slate-100 opacity-50"
                          )}
                        >
                          {layer.visible ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                        </button>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-tight text-slate-900 truncate">{layer.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: layer.color }} />
                            <span className="text-[8px] font-bold text-slate-400 uppercase">{layer.type} layer</span>
                          </div>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-slate-200 hover:text-red-600 opacity-0 group-hover:opacity-100 rounded-none"
                        onClick={() => removeLayer(layer.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center">
                    <Layers className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Geen actieve lagen</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Attribution / Credits Overlay */}
        <div className="absolute bottom-0 right-0 z-10 bg-white/60 backdrop-blur-sm px-2 py-0.5 text-[8px] font-bold text-slate-500 uppercase flex items-center gap-2">
          <span>Esri Nederland, Community Map Contributors | BeheerHub GIS v1.3</span>
          <img src="https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png" alt="BeheerHub" className="h-2 opacity-50" />
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-xl rounded-none border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-8 border-b bg-slate-900 text-white shrink-0">
            <div className="flex items-center gap-4">
              <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20">
                <UploadCloud className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight text-white">GIS Lagen Toevoegen</DialogTitle>
                <DialogDescription className="text-slate-400 font-bold uppercase text-[10px]">Ondersteuning voor GeoJSON, Shapefiles en Spreadsheets.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-8 space-y-8 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UploadMethod 
                icon={FileJson} 
                title="GeoJSON / JSON" 
                desc=".geojson, .json"
                onSelect={() => document.getElementById('gis-upload')?.click()}
              />
              <UploadMethod 
                icon={MapIcon} 
                title="Shapefile" 
                desc=".shp + .dbf nodig"
                onSelect={() => document.getElementById('gis-upload-multi')?.click()}
              />
              <UploadMethod 
                icon={TableIcon} 
                title="Spreadsheet" 
                desc=".xlsx, .csv (met Lat/Lon)"
                onSelect={() => document.getElementById('gis-upload')?.click()}
              />
            </div>

            <div className="bg-slate-50 p-6 rounded-none border-2 border-slate-100 space-y-3">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                <Info className="h-3 w-3" /> Tips voor upload
              </h4>
              <ul className="text-[10px] font-bold text-slate-500 space-y-2 uppercase leading-relaxed">
                <li>• Shapefiles vereisen altijd zowel het .shp als het .dbf bestand.</li>
                <li>• Spreadsheets moeten kolommen hebben genaamd 'latitude' en 'longitude'.</li>
                <li>• GeoJSON is de meest betrouwbare methode voor complexe geometrie.</li>
              </ul>
            </div>

            {isProcessing && (
              <div className="flex flex-col items-center gap-3 animate-in fade-in">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Data verwerken...</p>
              </div>
            )}

            <input 
              type="file" 
              id="gis-upload" 
              className="hidden" 
              accept=".geojson,.json,.xlsx,.csv" 
              onChange={handleFileUpload} 
            />
            <input 
              type="file" 
              id="gis-upload-multi" 
              className="hidden" 
              multiple 
              accept=".shp,.dbf" 
              onChange={handleFileUpload} 
            />
          </div>

          <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
            <Button variant="ghost" onClick={() => setIsUploadOpen(false)} className="font-bold">Annuleren</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UploadMethod({ icon: Icon, title, desc, onSelect }: { icon: any, title: string, desc: string, onSelect: () => void }) {
  return (
    <button 
      onClick={onSelect}
      className="flex flex-col items-center justify-center p-6 border-2 border-slate-100 hover:border-primary hover:bg-primary/5 transition-all group bg-white"
    >
      <Icon className="h-8 w-8 text-slate-300 group-hover:text-primary mb-3" />
      <p className="text-xs font-black uppercase tracking-tight text-slate-900 mb-1">{title}</p>
      <p className="text-[9px] font-bold text-slate-400 uppercase">{desc}</p>
    </button>
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
