
'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import MapGL, { NavigationControl, ScaleControl, Source, Layer, type MapRef } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { kml } from '@tmcw/togeojson';
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
  Trash2,
  Map as MapIcon,
  FolderPlus,
  Folder,
  ChevronRight,
  MoreVertical,
  Plus,
  Edit2,
  Palette,
  Check,
  Map as MapTypeIcon,
  Settings2,
  Minus,
  Circle,
  Square,
  Save,
  Cloud,
  Sun,
  Moon,
  Trees,
  FileCode,
  BoxSelect,
  Share2,
  Copy,
  ExternalLink,
  Car,
  Bike,
  Footprints,
  Link as LinkIcon,
  History
} from 'lucide-react';
import * as Icons from 'lucide-react';
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
  DialogClose
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { useFirestore, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, writeBatch, query, where } from 'firebase/firestore';
import * as shapefile from 'shapefile';
import * as XLSX from 'xlsx';
import * as turf from '@turf/turf';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const MAP_STYLES = [
  { id: 'streets', name: 'Straten', url: 'mapbox://styles/mapbox/streets-v12', icon: Icons.Map },
  { id: 'satellite', name: 'Satelliet', url: 'mapbox://styles/mapbox/satellite-streets-v12', icon: Icons.Cloud },
  { id: 'light', name: 'Licht', url: 'mapbox://styles/mapbox/light-v11', icon: Icons.Sun },
  { id: 'dark', name: 'Donker', url: 'mapbox://styles/mapbox/dark-v11', icon: Icons.Moon },
  { id: 'outdoors', name: 'Buiten', url: 'mapbox://styles/mapbox/outdoors-v12', icon: Icons.Trees },
];

interface GISLayer {
  id: string;
  name: string;
  data: string; 
  visible: boolean;
  color: string;
  type: 'fill' | 'line' | 'circle';
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  folderId?: string | null;
  icon?: string;
}

interface GISFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

interface SharedMap {
  id: string;
  name: string;
  viewState: any;
  visibleLayerIds: string[];
  creatorId: string;
  createdAt: string;
}

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#000000', '#64748b'
];

export default function GISDataPage() {
  const { profile } = useProfile();
  const { user } = useUser();
  const firestore = useFirestore();
  const { setIsHeaderVisible } = useNavigationUI();
  const { toast } = useToast();
  const mapRef = useRef<MapRef>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [activeDrawMode, setActiveDrawMode] = useState<string | null>(null);
  const [drawingProfile, setDrawingProfile] = useState<'driving' | 'walking' | 'cycling'>('driving');
  const [isSaveDrawingOpen, setIsSaveDrawingOpen] = useState(false);
  const [drawingName, setDrawingName] = useState('Nieuwe Tekening');
  const [drawingColor, setDrawingColor] = useState('#3b82f6');
  const [drawingLineWidth, setDrawingLineWidth] = useState(3);
  const [drawingLineStyle, setDrawingLineStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');

  const [activeMapStyle, setActiveMapStyle] = useState(profile?.schouwenMapStyle || 'mapbox://styles/mapbox/streets-v12');

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const [editingLayer, setEditingLayer] = useState<GISLayer | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editLineWidth, setEditLineWidth] = useState(2);
  const [editLineStyle, setEditLineStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [editIcon, setEditIcon] = useState('');
  const [iconSearch, setIconSearch] = useState('');

  // Share Wizard State
  const [isShareWizardOpen, setIsShareWizardOpen] = useState(false);
  const [editingSharedMapId, setEditingSharedMapId] = useState<string | null>(null);
  const [shareName, setShareName] = useState('');
  const [shareLayerIds, setShareLayerIds] = useState<string[]>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [isShareSuccessOpen, setIsShareSuccessOpen] = useState(false);

  const foldersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, 'users', user.uid, 'gisFolders');
  }, [firestore, user?.uid]);

  const layersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, 'users', user.uid, 'gisLayers');
  }, [firestore, user?.uid]);

  const sharedMapsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'shared_maps'), where('creatorId', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: dbFolders } = useCollection<GISFolder>(foldersQuery);
  const { data: dbLayers } = useCollection<GISLayer>(layersQuery);
  const { data: dbSharedMaps } = useCollection<SharedMap>(sharedMapsQuery);

  useEffect(() => {
    setIsHeaderVisible(false);
    return () => setIsHeaderVisible(true);
  }, [setIsHeaderVisible]);

  // Real-time styling update for active drawing
  useEffect(() => {
    if (!mapRef.current || !isDrawingMode) return;
    const map = mapRef.current.getMap();
    if (!map) return;

    const updateDrawStyles = () => {
      const lineLayers = [
        'gl-draw-line-active.cold',
        'gl-draw-line-active.hot',
        'gl-draw-line-inactive.cold',
        'gl-draw-line-inactive.hot',
        'gl-draw-polygon-stroke-active.cold',
        'gl-draw-polygon-stroke-active.hot',
        'gl-draw-polygon-stroke-inactive.cold',
        'gl-draw-polygon-stroke-inactive.hot'
      ];

      const fillLayers = [
        'gl-draw-polygon-fill-active.cold',
        'gl-draw-polygon-fill-active.hot',
        'gl-draw-polygon-fill-inactive.cold',
        'gl-draw-polygon-fill-inactive.hot'
      ];

      const pointLayers = [
        'gl-draw-point-active.cold',
        'gl-draw-point-active.hot',
        'gl-draw-point-inactive.cold',
        'gl-draw-point-inactive.hot'
      ];

      lineLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'line-color', drawingColor);
          map.setPaintProperty(layerId, 'line-width', drawingLineWidth);
        }
      });

      fillLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'fill-color', drawingColor);
        }
      });

      pointLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'circle-color', drawingColor);
        }
      });
    };

    if (map.isStyleLoaded()) {
      updateDrawStyles();
    } else {
      map.once('style.load', updateDrawStyles);
    }
  }, [drawingColor, drawingLineWidth, isDrawingMode]);

  // Real-time styling update for existing layer being edited
  useEffect(() => {
    if (!mapRef.current || !editingLayer) return;
    const map = mapRef.current.getMap();
    if (!map) return;

    const layerId = editingLayer.id;
    
    const updateProps = () => {
      if (map.getLayer(`${layerId}-line`)) {
        map.setPaintProperty(`${layerId}-line`, 'line-color', editColor);
        map.setPaintProperty(`${layerId}-line`, 'line-width', editLineWidth);
        
        if (editLineStyle === 'dashed') {
          map.setPaintProperty(`${layerId}-line`, 'line-dasharray', [4, 2]);
        } else if (editLineStyle === 'dotted') {
          map.setPaintProperty(`${layerId}-line`, 'line-dasharray', [1, 2]);
        } else {
          map.setPaintProperty(`${layerId}-line`, 'line-dasharray', [1, 0]);
        }
      }
      if (map.getLayer(`${layerId}-fill`)) {
        map.setPaintProperty(`${layerId}-fill`, 'fill-color', editColor);
      }
      if (map.getLayer(`${layerId}-point`)) {
        map.setPaintProperty(`${layerId}-point`, 'circle-color', editColor);
      }
    };

    if (map.isStyleLoaded()) {
      updateProps();
    } else {
      map.once('style.load', updateProps);
    }
  }, [editingLayer, editColor, editLineWidth, editLineStyle]);

  const initialViewState = {
    longitude: 6.083,
    latitude: 52.516,
    zoom: 10,
    pitch: 0,
    bearing: 0
  };

  const snapToRoad = async (coordinates: number[][], profile: 'driving' | 'walking' | 'cycling' = 'driving') => {
    if (coordinates.length < 2) return null;
    const limitedCoords = coordinates.slice(0, 25);
    const coordsStr = limitedCoords.map(c => `${c[0]},${c[1]}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsStr}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        return data.routes[0].geometry.coordinates;
      }
    } catch (e) {
      console.error("Road snapping failed:", e);
    }
    return null;
  };

  const handleMapLoad = () => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        point: true,
        line_string: true,
        polygon: true,
        trash: true
      }
    });
    
    map.addControl(draw, 'top-right');
    drawRef.current = draw;
    
    const handleDrawEvent = async (e: any) => {
      const features = e.features;
      if (!features || features.length === 0) return;

      for (const feature of features) {
        if (feature.geometry.type === 'LineString') {
          const originalCoords = feature.geometry.coordinates;
          if (originalCoords.length < 2) continue;
          
          const profile = (window as any)._drawingProfile || 'driving';
          toast({ title: "Traject optimaliseren...", description: `De lijn wordt aangepast aan het netwerk (${profile}).` });
          
          const snappedCoords = await snapToRoad(originalCoords, profile);
          if (snappedCoords) {
            draw.add({
              ...feature,
              geometry: { ...feature.geometry, coordinates: snappedCoords }
            });
            toast({ title: "Traject voltooid", description: "De lijn volgt nu het geselecteerde type weg." });
          }
        }
      }
    };

    map.on('draw.create', handleDrawEvent);
    map.on('draw.update', handleDrawEvent);
    
    const drawControl = document.querySelector('.mapboxgl-ctrl-top-right .mapboxgl-ctrl-group:last-child');
    if (drawControl) {
      (drawControl as HTMLElement).style.display = 'none';
    }
  };

  const toggleDrawingMode = () => {
    const newState = !isDrawingMode;
    setIsDrawingMode(newState);
    setIsUploadOpen(false);
    setActiveDrawMode(null);
    if (!newState) {
      setEditingLayerId(null);
      if (drawRef.current) drawRef.current.deleteAll();
    }
    if (newState) {
      toast({ title: "Tekenmodus geactiveerd", description: "Gebruik de toolbar bovenin om de stijl en tools te kiezen." });
    }
  };

  const startDrawMode = (mode: 'draw_point' | 'draw_line_string' | 'draw_polygon') => {
    if (!drawRef.current) return;
    drawRef.current.changeMode(mode);
    setActiveDrawMode(mode);
  };

  const updateDrawingProfile = (profile: 'driving' | 'walking' | 'cycling') => {
    setDrawingProfile(profile);
    (window as any)._drawingProfile = profile;
  };

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

  const startEditingGeometry = (layer: GISLayer) => {
    const layerData = parseLayerData(layer.data);
    if (!layerData) {
      toast({ variant: 'destructive', title: "Fout", description: "Kon laagdata niet laden voor bewerking." });
      return;
    }

    setEditingLayerId(layer.id);
    setIsDrawingMode(true);
    setIsLayersPanelOpen(false);
    
    setDrawingColor(layer.color);
    setDrawingLineWidth(layer.lineWidth || 3);
    setDrawingLineStyle(layer.lineStyle || 'solid');
    setDrawingName(layer.name);

    if (drawRef.current) {
      drawRef.current.deleteAll();
      drawRef.current.add(layerData);
      
      const map = mapRef.current?.getMap();
      if (map) {
        try {
          const bbox = turf.bbox(layerData);
          const isValid = 
            bbox[0] >= -180 && bbox[0] <= 180 && 
            bbox[2] >= -180 && bbox[2] <= 180 && 
            bbox[1] >= -90 && bbox[1] <= 90 && 
            bbox[3] >= -90 && bbox[3] <= 90;

          if (bbox[0] !== Infinity && isValid) {
            map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 1000 });
          }
        } catch (e) {}
      }
    }
    
    toast({ title: "Geometrie bewerken", description: `Je bewerkt nu de laag: ${layer.name}` });
  };

  const handleSaveDrawing = async () => {
    if (!drawRef.current || !user || !firestore) return;
    const features = drawRef.current.getAll();
    if (features.features.length === 0) {
      toast({ variant: 'destructive', title: "Geen data", description: "Teken eerst iets op de kaart." });
      return;
    }

    setIsProcessing(true);
    try {
      const cleanDataString = JSON.stringify(features);

      if (editingLayerId) {
        const layerRef = doc(firestore, 'users', user.uid, 'gisLayers', editingLayerId);
        await updateDocumentNonBlocking(layerRef, {
          data: cleanDataString,
          color: drawingColor,
          lineWidth: drawingLineWidth,
          lineStyle: drawingLineStyle,
          name: drawingName
        });
        toast({ title: "Laag bijgewerkt", description: "De geometrie is succesvol opgeslagen." });
      } else {
        const layersCol = collection(firestore, 'users', user.uid, 'gisLayers');
        
        let type: 'fill' | 'line' | 'circle' = 'circle';
        const firstFeature = features.features[0];
        const geomType = firstFeature.geometry?.type;
        
        if (geomType === 'Polygon' || geomType === 'MultiPolygon') type = 'fill';
        else if (geomType === 'LineString' || geomType === 'MultiLineString') type = 'line';

        const defaultIcon = type === 'fill' ? 'Square' : type === 'line' ? 'Minus' : 'Circle';

        const newLayer = {
          name: drawingName,
          data: cleanDataString,
          visible: true,
          color: drawingColor,
          type,
          lineWidth: drawingLineWidth,
          lineStyle: drawingLineStyle,
          folderId: null,
          icon: defaultIcon,
          createdAt: new Date().toISOString()
        };

        await addDocumentNonBlocking(layersCol, newLayer);
        toast({ title: "Laag opgeslagen", description: "De handmatige laag is toegevoegd aan je lijst." });
      }
      
      setIsSaveDrawingOpen(false);
      toggleDrawingMode();
      setDrawingName('Nieuwe Tekening');
    } catch (err) {
      console.error("Save drawing error:", err);
      toast({ variant: 'destructive', title: "Fout", description: "Kon de tekening niet opslaan in de database." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user || !firestore) return;

    setIsProcessing(true);
    const fileList = Array.from(files);
    
    try {
      const layersCol = collection(firestore, 'users', user.uid, 'gisLayers');

      const kmlFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.kml'));
      for (const file of kmlFiles) {
        const text = await file.text();
        const parser = new DOMParser();
        const kmlDom = parser.parseFromString(text, 'text/xml');
        const geojson = kml(kmlDom);
        if (geojson && geojson.features && geojson.features.length > 0) {
            await saveLayerFromFile(file.name, geojson, layersCol);
        }
      }

      const geojsonFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.geojson') || f.name.toLowerCase().endsWith('.json'));
      for (const file of geojsonFiles) {
        const text = await file.text();
        const data = JSON.parse(text);
        await saveLayerFromFile(file.name, data, layersCol);
      }

      const shpFile = fileList.find(f => f.name.toLowerCase().endsWith('.shp'));
      const dbfFile = fileList.find(f => f.name.toLowerCase().endsWith('.dbf'));
      if (shpFile && dbfFile) {
        const shpBuffer = await shpFile.arrayBuffer();
        const dbfBuffer = await dbfFile.arrayBuffer();
        const geojson = await shapefile.read(shpBuffer, dbfBuffer);
        await saveLayerFromFile(shpFile.name, geojson, layersCol);
      }

      const sheetFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.csv'));
      for (const file of sheetFiles) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet) as any[];
        
        const features = json.map(row => {
          const latKey = Object.keys(row).find(k => k.toLowerCase().includes('lat') || k.toLowerCase().includes('breedte') || k.toLowerCase() === 'y');
          const lonKey = Object.keys(row).find(k => k.toLowerCase().includes('lon') || k.toLowerCase().includes('lng') || k.toLowerCase().includes('lengte') || k.toLowerCase() === 'x');
          if (latKey && lonKey) {
            return turf.point([parseFloat(row[lonKey]), parseFloat(row[latKey])], row);
          }
          return null;
        }).filter(Boolean);

        if (features.length > 0) {
          await saveLayerFromFile(file.name, turf.featureCollection(features as any), layersCol);
        }
      }

      setIsUploadOpen(false);
      setIsLayersPanelOpen(true);
      toast({ title: 'Laag toegevoegd', description: 'De GIS-data is succesvol opgeslagen en geladen.' });
    } catch (error) {
      console.error('File parsing error:', error);
      toast({ variant: 'destructive', title: 'Fout bij uploaden', description: 'Zorg ervoor dat het bestandstype ondersteund wordt.' });
    } finally {
      setIsProcessing(false);
      event.target.value = ''; 
    }
  };

  const saveLayerFromFile = async (name: string, data: any, col: any) => {
    let type: 'fill' | 'line' | 'circle' = 'circle';
    const firstFeature = data.features?.[0] || data;
    const geomType = firstFeature.geometry?.type || firstFeature.type;
    
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') type = 'fill';
    else if (geomType === 'LineString' || geomType === 'MultiLineString') type = 'line';

    const defaultIcon = type === 'fill' ? 'Square' : type === 'line' ? 'Minus' : 'Circle';

    const dataString = JSON.stringify(data);

    const newLayer = {
      name,
      data: dataString,
      visible: true,
      color: PRESET_COLORS[(dbLayers?.length || 0) % PRESET_COLORS.length],
      type,
      lineWidth: 2,
      lineStyle: 'solid',
      folderId: null,
      icon: defaultIcon,
      createdAt: new Date().toISOString()
    };

    await addDocumentNonBlocking(col, newLayer);

    try {
      const bbox = turf.bbox(data);
      const isValid = 
        bbox[0] >= -180 && bbox[0] <= 180 && 
        bbox[2] >= -180 && bbox[2] <= 180 && 
        bbox[1] >= -90 && bbox[1] <= 90 && 
        bbox[3] >= -90 && bbox[3] <= 90;

      if (bbox[0] !== Infinity && isValid && mapRef.current) {
        mapRef.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 1000 });
      }
    } catch (e) {}
  };

  const toggleLayerVisibility = (layer: GISLayer) => {
    if (!user || !firestore) return;
    const layerRef = doc(firestore, 'users', user.uid, 'gisLayers', layer.id);
    updateDocumentNonBlocking(layerRef, { visible: !layer.visible });
  };

  const zoomToLayer = (layer: GISLayer) => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    try {
      const layerData = parseLayerData(layer.data);
      if (!layerData) return;
      
      const bbox = turf.bbox(layerData);
      const isGeographic = 
        bbox[0] >= -180 && bbox[0] <= 180 && 
        bbox[2] >= -180 && bbox[2] <= 180 && 
        bbox[1] >= -90 && bbox[1] <= 90 && 
        bbox[3] >= -90 && bbox[3] <= 90;

      if (bbox[0] !== Infinity && isGeographic) {
        map.fitBounds(bbox as [number, number, number, number], { padding: 40, duration: 1000 });
      } else if (!isGeographic) {
        toast({ 
          variant: 'destructive', 
          title: "Inzoomen mislukt", 
          description: "De coördinaten van deze laag zijn ongeldig of niet in GPS-formaat (WGS84)." 
        });
      }
    } catch (e) {
      console.error("Zoom to layer failed:", e);
    }
  };

  const removeLayer = (id: string) => {
    if (!user || !firestore) return;
    const layerRef = doc(firestore, 'users', user.uid, 'gisLayers', id);
    deleteDocumentNonBlocking(layerRef);
  };

  const handleUpdateLayer = async () => {
    if (!editingLayer || !editName.trim() || !user || !firestore) return;
    const layerRef = doc(firestore, 'users', user.uid, 'gisLayers', editingLayer.id);
    updateDocumentNonBlocking(layerRef, { 
      name: editName.trim(),
      color: editColor,
      lineWidth: editLineWidth,
      lineStyle: editLineStyle,
      icon: editIcon
    });
    setEditingLayer(null);
    toast({ title: 'Laag bijgewerkt' });
  };

  const handleCreateFolder = async () => {
    if (!user || !firestore || !newFolderName.trim()) return;
    const foldersCol = collection(firestore, 'users', user.uid, 'gisFolders');
    await addDocumentNonBlocking(foldersCol, {
      name: newFolderName.trim(),
      parentId: parentFolderId,
      createdAt: new Date().toISOString()
    });
    setNewFolderName('');
    setIsNewFolderOpen(false);
    setParentFolderId(null);
    toast({ title: 'Map aangemaakt' });
  };

  const toggleFolderExpansion = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const deleteFolder = async (folderId: string) => {
    if (!user || !firestore || !dbFolders) return;
    const batch = writeBatch(firestore);
    const findChildren = (pid: string) => {
        const children = dbFolders.filter(f => f.parentId === pid);
        children.forEach(c => {
            batch.delete(doc(firestore, 'users', user.uid, 'gisFolders', c.id));
            findChildren(c.id);
        });
    };
    batch.delete(doc(firestore, 'users', user.uid, 'gisFolders', folderId));
    findChildren(folderId);
    dbLayers?.forEach(layer => {
        if (layer.folderId === folderId) {
            batch.update(doc(firestore, 'users', user.uid, 'gisLayers', layer.id), { folderId: null });
        }
    });
    await batch.commit();
    toast({ title: 'Map verwijderd' });
  };

  const moveLayerToFolder = async (layerId: string, folderId: string | null) => {
    if (!user || !firestore) return;
    const layerRef = doc(firestore, 'users', user.uid, 'gisLayers', layerId);
    updateDocumentNonBlocking(layerRef, { folderId });
    toast({ title: 'Laag verplaatst' });
  };

  const handleOpenShareWizard = (existingMap?: SharedMap) => {
    if (!dbLayers) return;
    
    if (existingMap) {
        setEditingSharedMapId(existingMap.id);
        setShareName(existingMap.name);
        setShareLayerIds(existingMap.visibleLayerIds || []);
    } else {
        setEditingSharedMapId(null);
        setShareName(`Gedeelde Kaart ${formatDate(new Date(), 'dd-MM-yyyy')}`);
        setShareLayerIds(dbLayers.filter(l => l.visible).map(l => l.id));
    }
    
    setIsShareWizardOpen(true);
  };

  const handleCreateShareMap = async () => {
    if (!mapRef.current || !user || !firestore || shareLayerIds.length === 0) return;
    
    setIsProcessing(true);
    try {
        const map = mapRef.current.getMap();
        const center = map.getCenter();
        const viewState = {
            center: { lng: center.lng, lat: center.lat },
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing()
        };

        const shareDoc: any = {
            name: shareName.trim(),
            viewState,
            visibleLayerIds: shareLayerIds,
            creatorId: user.uid,
            createdAt: new Date().toISOString()
        };

        if (editingSharedMapId) {
            const docRef = doc(firestore, 'shared_maps', editingSharedMapId);
            await updateDocumentNonBlocking(docRef, {
                name: shareName.trim(),
                visibleLayerIds: shareLayerIds,
                viewState
            });
            toast({ title: "Deellink bijgewerkt" });
            setIsShareWizardOpen(false);
        } else {
            const docRef = await addDocumentNonBlocking(collection(firestore, 'shared_maps'), shareDoc);
            const url = `${window.location.origin}/gis-data/shared/${docRef.id}`;
            setShareUrl(url);
            setIsShareWizardOpen(false);
            setIsShareSuccessOpen(true);
        }
    } catch (err) {
        console.error("Share error:", err);
        toast({ variant: 'destructive', title: "Fout bij delen" });
    } finally {
        setIsProcessing(false);
    }
  };

  const copyShareUrl = (urlOverride?: string) => {
    const targetUrl = urlOverride || shareUrl;
    navigator.clipboard.writeText(targetUrl);
    toast({ title: "Link gekopieerd" });
  };

  const deleteSharedMap = async (id: string) => {
    if (!firestore) return;
    await deleteDocumentNonBlocking(doc(firestore, 'shared_maps', id));
    toast({ title: "Gedeelde link verwijderd" });
  };

  const filteredIcons = React.useMemo(() => {
    const all = Object.keys(Icons).filter(name => typeof (Icons as any)[name] === 'function' || typeof (Icons as any)[name] === 'object');
    if (!iconSearch.trim()) return all.slice(0, 64);
    const q = iconSearch.toLowerCase();
    return all.filter(name => name.toLowerCase().includes(q)).slice(0, 64);
  }, [iconSearch]);

  const openEditDialog = (layer: GISLayer) => {
    setEditingLayer(layer); 
    setEditName(layer.name); 
    setEditColor(layer.color);
    setEditLineWidth(layer.lineWidth || 2);
    setEditLineStyle(layer.lineStyle || 'solid');
    setEditIcon(layer.icon || (layer.type === 'fill' ? 'Square' : layer.type === 'line' ? 'Minus' : 'Circle'));
  };

  const renderFolderContent = (folderId: string | null, level: number = 0) => {
    const folders = dbFolders?.filter(f => f.parentId === folderId) || [];
    const layers = dbLayers?.filter(l => l.folderId === folderId) || [];

    return (
      <div key={folderId || 'root'} className="space-y-1">
        {folders.map(folder => {
          const isExpanded = expandedFolders.has(folder.id);
          return (
            <div key={folder.id} className="space-y-1">
              <div 
                style={{ paddingLeft: `${level * 12}px` }}
                className="flex items-center justify-between p-2 hover:bg-slate-50 group border border-transparent cursor-pointer"
                onClick={() => toggleFolderExpansion(folder.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-tight text-slate-900 truncate">{folder.name}</span>
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none"><MoreVertical className="h-3.5 w-3.5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-none">
                      <DropdownMenuItem onClick={() => { setParentFolderId(folder.id); setIsNewFolderOpen(true); }} className="text-[10px] font-black uppercase"><FolderPlus className="mr-2 h-3.5 w-3.5" /> Submap</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => deleteFolder(folder.id)} className="text-red-600 text-[10px] font-black uppercase"><Trash2 className="mr-2 h-3.5 w-3.5" /> Verwijderen</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {isExpanded && renderFolderContent(folder.id, level + 1)}
            </div>
          );
        })}
        {layers.map(layer => {
          const IconComp = (Icons as any)[layer.icon || (layer.type === 'fill' ? 'Square' : layer.type === 'line' ? 'Minus' : 'Circle')] || Icons.Circle;
          return (
            <div 
              key={layer.id} 
              style={{ paddingLeft: `${(level + (folderId ? 1 : 0)) * 12 + 16}px` }}
              className="flex items-center justify-between p-2 hover:bg-slate-50 group border border-transparent hover:border-slate-100 cursor-pointer"
              onClick={() => zoomToLayer(layer)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer); }}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-none border transition-all",
                    layer.visible ? "bg-white border-slate-200 shadow-sm" : "bg-slate-100 border-slate-100 opacity-50"
                  )}
                >
                  {layer.visible ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                </button>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-tight text-slate-900 truncate">{layer.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <IconComp className="h-2 w-2" style={{ color: layer.color, fill: layer.type === 'fill' ? layer.color : 'none' }} />
                    <span className="text-[8px] font-bold text-slate-400 uppercase">{layer.type}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-slate-400 hover:text-primary" onClick={() => openEditDialog(layer)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none"><ChevronDown className="h-3.5 w-3.5 text-slate-400" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-none shadow-xl">
                    <DropdownMenuItem onClick={() => openEditDialog(layer)} className="text-[10px] font-black uppercase"><Edit2 className="mr-2 h-3.5 w-3.5" /> Laag Aanpassen</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => startEditingGeometry(layer)} className="text-[10px] font-black uppercase text-primary"><MapIcon className="mr-2 h-3.5 w-3.5" /> Geometrie Aanpassen</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => moveLayerToFolder(layer.id, null)} className="text-[10px] font-black uppercase">Naar Home (Root)</DropdownMenuItem>
                    {dbFolders?.filter(f => f.id !== layer.folderId).map(f => (
                      <DropdownMenuItem key={f.id} onClick={() => moveLayerToFolder(layer.id, f.id)} className="text-[10px] font-black uppercase">Naar map: {f.name}</DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => removeLayer(layer.id)} className="text-red-600 text-[10px] font-black uppercase"><Trash2 className="mr-2 h-3.5 w-3.5" /> Verwijderen</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-100 flex flex-col font-sans">
      <header className="h-10 bg-[#009ee3] text-white flex items-center justify-end px-4 shrink-0 z-50 shadow-md">
        <div className="flex items-center gap-1">
          {isDrawingMode && (
            <div className="flex items-center gap-1 mr-4 bg-slate-900/90 px-3 py-1 animate-in slide-in-from-top-2 h-8 rounded-none border border-white/20 shadow-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/80 mr-2 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                {editingLayerId ? 'Bewerken...' : 'Tekenen...'}
              </span>
              
              <div className="flex items-center gap-1 border-r border-white/20 pr-2 mr-2">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className={cn("h-7 w-7 rounded-none text-white hover:bg-white/20", activeDrawMode === 'draw_point' && "bg-primary text-white")}
                  onClick={() => startDrawMode('draw_point')}
                  title="Punt plaatsen"
                >
                  <Circle className="h-3.5 w-3.5" />
                </Button>
                <div className="flex items-center bg-white/10 rounded-none h-7 px-1 mx-1 gap-1">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className={cn("h-6 w-6 rounded-none text-white hover:bg-white/20", activeDrawMode === 'draw_line_string' && "bg-primary text-white")}
                    onClick={() => startDrawMode('draw_line_string')}
                    title="Lijn tekenen"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  {activeDrawMode === 'draw_line_string' && (
                    <div className="flex items-center gap-0.5 border-l border-white/20 pl-1 ml-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className={cn("h-6 w-6 rounded-none text-white hover:bg-white/20", drawingProfile === 'driving' && "bg-primary text-white")}
                        onClick={() => updateDrawingProfile('driving')}
                        title="Auto netwerk"
                      >
                        <Car className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className={cn("h-6 w-6 rounded-none text-white hover:bg-white/20", drawingProfile === 'cycling' && "bg-primary text-white")}
                        onClick={() => updateDrawingProfile('cycling')}
                        title="Fietspaden"
                      >
                        <Bike className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className={cn("h-6 w-6 rounded-none text-white hover:bg-white/20", drawingProfile === 'walking' && "bg-primary text-white")}
                        onClick={() => updateDrawingProfile('walking')}
                        title="Voetpaden"
                      >
                        <Footprints className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className={cn("h-7 w-7 rounded-none text-white hover:bg-white/20", activeDrawMode === 'draw_polygon' && "bg-primary text-white")}
                  onClick={() => startDrawMode('draw_polygon')}
                  title="Vlak tekenen"
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-2 border-r border-white/20 pr-2 mr-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="h-6 w-10 rounded-none border border-white/20 shadow-inner flex items-center justify-center hover:bg-white/10" style={{ backgroundColor: drawingColor }}>
                      <Palette className="h-3 w-3 text-white mix-blend-difference opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" className="w-48 p-3 rounded-none border-none shadow-2xl bg-slate-900 text-white">
                    <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Kleur</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => setDrawingColor(c)} className={cn("h-6 w-full rounded-none border", drawingColor === c ? "border-white" : "border-transparent")} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/10 rounded-none border border-white/10">
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" className="w-56 p-4 rounded-none border-none shadow-2xl bg-slate-900 text-white space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[9px] font-black uppercase text-slate-400">Dikte ({drawingLineWidth}px)</Label>
                      <Slider value={[drawingLineWidth]} onValueChange={([v]) => setDrawingLineWidth(v)} min={1} max={10} step={1} className="py-2" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[9px] font-black uppercase text-slate-400">Lijnstructuur</Label>
                      <Select value={drawingLineStyle} onValueChange={(v: any) => setDrawingLineStyle(v)}>
                        <SelectTrigger className="h-8 text-[10px] font-bold bg-white/10 border-none rounded-none text-white"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-none"><SelectItem value="solid">Solid</SelectItem><SelectItem value="dashed">Dashed</SelectItem><SelectItem value="dotted">Dotted</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-none text-red-200 hover:bg-red-600/40" onClick={() => drawRef.current?.trash()}><Trash2 className="h-3.5 w-3.5" /></Button>
                <Button size="sm" className="h-6 px-3 text-[9px] font-black uppercase bg-green-600 hover:bg-green-700 rounded-none" onClick={() => setIsSaveDrawingOpen(true)}><Save className="mr-1.5 h-3 w-3" /> Opslaan</Button>
                <Button size="sm" variant="ghost" className="h-6 px-3 text-[9px] font-black uppercase text-red-200 hover:bg-red-600/20 rounded-none" onClick={toggleDrawingMode}><X className="mr-1.5 h-3 w-3" /> Stop</Button>
              </div>
            </div>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-white hover:bg-white/10 rounded-none" 
            onClick={() => handleOpenShareWizard()}
          >
            <Share2 className="h-4 w-4" />
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

      <div className="flex-1 relative">
        <MapGL
          ref={mapRef}
          initialViewState={initialViewState}
          style={{ width: '100%', height: '100%' }}
          mapStyle={activeMapStyle}
          mapboxAccessToken={MAPBOX_TOKEN}
          onLoad={handleMapLoad}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <ScaleControl position="bottom-left" />

          {dbLayers?.map(layer => {
            const layerData = parseLayerData(layer.data);
            if (!layerData) return null;

            const isVisible = layer.visible && editingLayerId !== layer.id;

            return (
              <Source key={layer.id} id={layer.id} type="geojson" data={layerData}>
                {layer.type === 'fill' && (
                  <Layer
                    id={`${layer.id}-fill`}
                    type="fill"
                    paint={{ 'fill-color': layer.color, 'fill-opacity': 0.4 }}
                    layout={{ visibility: isVisible ? 'visible' : 'none' }}
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
                    layout={{ 
                      visibility: isVisible ? 'visible' : 'none',
                      'line-join': 'round',
                      'line-cap': 'round'
                    }}
                  />
                )}
                {layer.type === 'circle' && (
                  <Layer
                    id={`${layer.id}-point`}
                    type="circle"
                    paint={{ 'circle-color': layer.color, 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }}
                    layout={{ visibility: isVisible ? 'visible' : 'none' }}
                  />
                )}
              </Source>
            );
          })}
        </MapGL>

        <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
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

          <div className="flex flex-col bg-white shadow-2xl border border-slate-200 w-10">
            <ToolButton icon={Layers} active={isLayersPanelOpen} onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)} />
            
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  className={cn(
                    "h-10 w-10 flex items-center justify-center border-b border-slate-100 transition-all hover:bg-slate-50",
                    MAP_STYLES.some(s => s.url === activeMapStyle) ? "text-primary" : "text-slate-600"
                  )}
                >
                  <MapTypeIcon className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-48 p-2 rounded-none border-none shadow-2xl">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-slate-400 px-2 py-1 mb-1 tracking-widest">Kaartstijl</p>
                  {MAP_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setActiveMapStyle(style.url)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-[11px] font-black uppercase tracking-tight rounded-none transition-colors",
                        activeMapStyle === style.url ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <style.icon className="h-3.5 w-3.5" />
                      {style.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <ToolButton icon={MousePointer2} />
            <ToolButton icon={Pencil} active={isDrawingMode} onClick={toggleDrawingMode} />
            <ToolButton icon={Printer} />
            <ToolButton icon={Download} />
            <ToolButton icon={Library} />
          </div>

          <div className="flex flex-col bg-white shadow-2xl border border-slate-200 w-10">
            <ToolButton icon={Home} onClick={() => mapRef.current?.flyTo({ center: [initialViewState.longitude, initialViewState.latitude], zoom: initialViewState.zoom })} />
            <ToolButton icon={Maximize2} />
          </div>
        </div>

        {isLayersPanelOpen && (
          <div className="absolute top-4 right-4 z-20 w-80 bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] rounded-none animate-in slide-in-from-right-4 duration-300">
            <div className="p-4 border-b flex items-center justify-between bg-slate-50">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Kaartlagen</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsLayersPanelOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="p-4 border-b grid grid-cols-2 gap-2">
              <Button 
                onClick={() => setIsUploadOpen(true)}
                className="h-10 font-black uppercase text-[9px] tracking-widest rounded-none shadow-lg shadow-primary/20 bg-primary"
              >
                <UploadCloud className="mr-2 h-4 w-4" /> Toevoegen
              </Button>
              <Button 
                variant="outline"
                onClick={() => { setParentFolderId(null); setIsNewFolderOpen(true); }}
                className="h-10 font-black uppercase text-[9px] tracking-widest rounded-none border-slate-300"
              >
                <FolderPlus className="mr-2 h-4 w-4" /> Map
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-4">
                <div className="space-y-1">
                  {renderFolderContent(null)}
                </div>

                {(!dbLayers || dbLayers.length === 0) && (!dbFolders || dbFolders.length === 0) && (
                  <div className="py-12 text-center">
                    <Layers className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Geen actieve lagen</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="absolute bottom-0 right-0 z-10 bg-white/60 backdrop-blur-sm px-2 py-0.5 text-[8px] font-bold text-slate-500 uppercase flex items-center gap-2">
          <span>Esri Nederland, Community Map Contributors | BeheerHub GIS v1.4</span>
          <img src="https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png" alt="BeheerHub" className="h-2 opacity-50" />
        </div>
      </div>

      {/* Share Wizard Dialog */}
      <Dialog open={isShareWizardOpen} onOpenChange={(open) => { setIsShareWizardOpen(open); if(!open) setEditingSharedMapId(null); }}>
        <DialogContent className="sm:max-w-2xl h-[90vh] rounded-none border-none shadow-2xl p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-6 bg-slate-900 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2 rounded-none"><Share2 className="h-5 w-5 text-white" /></div>
              <div>
                <DialogTitle className="font-black uppercase tracking-tight text-white">{editingSharedMapId ? 'Deellink Aanpassen' : 'Kaart Delen'}</DialogTitle>
                <DialogDescription className="font-bold text-slate-400 uppercase text-[10px]">Maak of bewerk een publieke link voor aannemers.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col bg-white">
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-8">
                
                {/* Existing Links Section within Wizard */}
                {!editingSharedMapId && dbSharedMaps && dbSharedMaps.length > 0 && (
                  <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1 flex items-center gap-2">
                      <History className="h-3 w-3" /> Bestaande Deellinks
                    </Label>
                    <div className="grid gap-2">
                      {dbSharedMaps.map(share => (
                        <div key={share.id} className="flex items-center justify-between p-3 bg-slate-50 border-2 border-slate-100 rounded-none group hover:border-primary/20 transition-all shadow-sm">
                          <div className="min-w-0" onClick={() => handleOpenShareWizard(share)}>
                            <p className="text-[11px] font-black uppercase tracking-tight text-slate-700 truncate cursor-pointer hover:text-primary">{share.name}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">{share.visibleLayerIds.length} Lagen • {formatDate(new Date(share.createdAt), 'dd-MM-yy')}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-primary" onClick={() => handleOpenShareWizard(share)} title="Bewerken">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-primary" onClick={() => copyShareUrl(`${window.location.origin}/gis-data/shared/${share.id}`)} title="Kopieer URL">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-red-400 hover:text-red-600" onClick={() => deleteSharedMap(share.id)} title="Verwijderen">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Naam van de nieuwe link</Label>
                  <Input 
                    placeholder="Bv. Aannemer X - Project West..." 
                    value={shareName} 
                    onChange={e => setShareName(e.target.value)} 
                    className="h-12 font-bold rounded-none border-2 focus:ring-primary/20"
                    autoFocus
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Zichtbare Lagen</Label>
                    <span className="text-[9px] font-black text-primary uppercase">{shareLayerIds.length} geselecteerd</span>
                  </div>
                  <div className="grid gap-2">
                    {dbLayers?.map(layer => (
                      <div 
                        key={layer.id} 
                        className={cn(
                          "flex items-center space-x-3 p-3 rounded-none transition-all cursor-pointer border-2",
                          shareLayerIds.includes(layer.id) ? "bg-primary/5 border-primary/20 shadow-sm" : "hover:bg-slate-50 border-transparent"
                        )} 
                        onClick={() => setShareLayerIds(prev => prev.includes(layer.id) ? prev.filter(id => id !== layer.id) : [...prev, layer.id])}
                      >
                        <Checkbox
                          checked={shareLayerIds.includes(layer.id)}
                          onCheckedChange={() => {}} // Handled by div onClick
                          className="rounded-none border-slate-300"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black uppercase tracking-tight text-slate-700 truncate">{layer.name}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">{layer.type}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
            <Button variant="ghost" onClick={() => setIsShareWizardOpen(false)} className="font-bold rounded-none">Annuleren</Button>
            <Button onClick={handleCreateShareMap} className="font-black uppercase rounded-none px-8 shadow-xl shadow-primary/20" disabled={!shareName.trim() || shareLayerIds.length === 0 || isProcessing}>
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingSharedMapId ? <Check className="mr-2 h-4 w-4" /> : <LinkIcon className="mr-2 h-4 w-4" />}
              {editingSharedMapId ? 'Wijzigingen Opslaan' : 'Link Genereren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Success Dialog */}
      <Dialog open={isShareSuccessOpen} onOpenChange={setIsShareSuccessOpen}>
        <DialogContent className="sm:max-w-md rounded-none border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-slate-900 text-white shrink-0">
            <div className="flex items-center gap-3">
                <Check className="h-6 w-6 text-green-500" />
                <DialogTitle className="text-lg font-black uppercase tracking-tight text-white">Kaart Gedeeld!</DialogTitle>
            </div>
          </DialogHeader>
          <div className="p-6 space-y-6">
            <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Iedereen met deze link kan de huidige kaartweergave en de geselecteerde lagen bekijken.
            </p>
            <div className="flex items-center gap-2 p-3 bg-slate-50 border-2 border-slate-100 rounded-none">
                <Input value={shareUrl} readOnly className="h-9 border-none bg-transparent shadow-none focus-visible:ring-0 text-xs font-mono" />
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-none text-primary" onClick={() => copyShareUrl()}><Icons.Copy className="h-4 w-4" /></Button>
            </div>
            <div className="flex justify-center pt-2">
                <Button asChild variant="link" className="text-[10px] font-black uppercase tracking-widest text-primary">
                    <a href={shareUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-3.5 w-3.5" /> Bekijk Voorbeeld</a>
                </Button>
            </div>
          </div>
          <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
            <Button onClick={() => setIsShareSuccessOpen(false)} className="w-full font-black uppercase rounded-none">Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveDrawingOpen} onOpenChange={setIsSaveDrawingOpen}>
        <DialogContent className="sm:max-w-lg rounded-none border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-slate-900 text-white shrink-0">
            <DialogTitle className="font-black uppercase tracking-tight text-white">
              {editingLayerId ? 'Bewerkingen Opslaan' : 'Tekening Opslaan'}
            </DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px]">Bevestig de naam en de stijl van de kaartlaag.</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh] bg-white">
            <div className="p-6 space-y-8">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Naam van de laag</Label>
                <Input 
                  placeholder="Bv. Gebiedsafbakening..." 
                  value={drawingName} 
                  onChange={e => setDrawingName(e.target.value)} 
                  className="h-12 font-bold rounded-none border-2 focus:ring-primary/20"
                  autoFocus
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Gekozen Kleur</Label>
                  <div className="h-8 w-8 rounded-none border-2 border-slate-200" style={{ backgroundColor: drawingColor }} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setDrawingColor(c)}
                      className={cn(
                        "h-8 w-8 rounded-none border-2 transition-all",
                        drawingColor === c ? "border-slate-900 scale-110 shadow-md" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-6 bg-slate-50 p-4 rounded-none border-2 border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Lijninstellingen</h4>
                </div>
                
                <div className="space-y-4">
                  <Label className="text-[9px] font-black uppercase text-slate-400">Dikte ({drawingLineWidth}px)</Label>
                  <Slider 
                    value={[drawingLineWidth]} 
                    onValueChange={([val]) => setDrawingLineWidth(val)} 
                    min={1} 
                    max={10} 
                    step={1}
                    className="py-2"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Structuur</Label>
                  <Select value={drawingLineStyle} onValueChange={(val: any) => setDrawingLineStyle(val)}>
                    <SelectTrigger className="rounded-none border-slate-200 bg-white h-10 font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="solid">Ononderbroken (Solid)</SelectItem>
                      <SelectItem value="dashed">Gestreept (Dashed)</SelectItem>
                      <SelectItem value="dotted">Gestippeld (Dotted)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
            <Button variant="ghost" onClick={() => setIsSaveDrawingOpen(false)} className="font-bold rounded-none">Annuleren</Button>
            <Button onClick={handleSaveDrawing} className="font-black uppercase rounded-none px-8 shadow-xl shadow-primary/20" disabled={!drawingName.trim() || isProcessing}>
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {editingLayerId ? 'Bijwerken in Backend' : 'Opslaan in Backend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingLayer} onOpenChange={(open) => !open && setEditingLayer(null)}>
        <DialogContent className="sm:max-w-lg rounded-none border-none shadow-2xl flex flex-col h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-slate-900 text-white shrink-0">
            <DialogTitle className="font-black uppercase tracking-tight text-white">Kaartlaag Aanpassen</DialogTitle>
            <DialogDescription className="font-bold text-slate-400 uppercase text-[10px]">Symbologie en eigenschappen wijzigen.</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 bg-white">
            <div className="p-6 space-y-8">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Naam van de laag</Label>
                <Input 
                  placeholder="Laagnaam..." 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  className="h-12 font-bold rounded-none border-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Kleur (Symbool)</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setEditColor(c)}
                      className={cn(
                        "h-8 w-8 rounded-none border-2 transition-all",
                        editColor === c ? "border-slate-900 scale-110 shadow-md" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <div className="relative h-8 w-8 rounded-none overflow-hidden border-2 border-slate-200">
                    <input 
                      type="color" 
                      value={editColor} 
                      onChange={e => setEditColor(e.target.value)}
                      className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                    />
                    <Palette className="absolute inset-0 m-auto h-3 w-3 pointer-none mix-blend-difference text-white opacity-50" />
                  </div>
                </div>
              </div>

              {(editingLayer?.type === 'line' || editingLayer?.type === 'fill') && (
                <div className="space-y-6 bg-slate-50 p-4 rounded-none border-2 border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings2 className="h-4 w-4 text-primary" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Lijninstellingen</h4>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Dikte ({editLineWidth}px)</Label>
                    </div>
                    <Slider 
                      value={[editLineWidth]} 
                      onValueChange={([val]) => setEditLineWidth(val)} 
                      min={1} 
                      max={10} 
                      step={1}
                      className="py-2"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Structuur</Label>
                    <Select value={editLineStyle} onValueChange={(val: any) => setEditLineStyle(val)}>
                      <SelectTrigger className="rounded-none border-slate-200 bg-white h-10 font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="solid">Ononderbroken (Solid)</SelectItem>
                        <SelectItem value="dashed">Gestreept (Dashed)</SelectItem>
                        <SelectItem value="dotted">Gestippeld (Dotted)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Icoon Selecteren</Label>
                  <div className="h-10 w-10 bg-slate-50 border flex items-center justify-center">
                    {editIcon && React.createElement((Icons as any)[editIcon] || Icons.Circle, { 
                      className: "h-6 w-6",
                      style: { color: editColor, fill: editingLayer?.type === 'fill' ? editColor : 'none' }
                    })}
                  </div>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Zoek icoon..." 
                    className="h-10 pl-9 font-bold rounded-none border-slate-200 bg-slate-50" 
                    value={iconSearch} 
                    onChange={e => setIconSearch(e.target.value)} 
                  />
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 h-48 overflow-y-auto pr-2 custom-scrollbar p-1 border rounded-none">
                  {filteredIcons.map(name => {
                    const Icon = (Icons as any)[name];
                    return (
                      <Button 
                        key={name} 
                        type="button" 
                        variant={editIcon === name ? "default" : "outline"} 
                        size="icon" 
                        className="h-10 w-10 p-0 rounded-none" 
                        onClick={() => setEditIcon(name)}
                      >
                        <Icon className="h-5 w-5" style={{ color: editIcon === name ? undefined : editColor }} />
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
            <Button variant="ghost" onClick={() => setEditingLayer(null)} className="font-bold rounded-none">Annuleren</Button>
            <Button onClick={handleUpdateLayer} className="font-black uppercase rounded-none px-8 shadow-xl shadow-primary/20" disabled={!editName.trim()}>
              <Check className="mr-2 h-4 w-4" /> Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-xl rounded-none border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-8 border-b bg-slate-900 text-white shrink-0">
            <div className="flex items-center gap-4">
              <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20">
                <UploadCloud className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight text-white">GIS Lagen Toevoegen</DialogTitle>
                <DialogDescription className="text-slate-400 font-bold uppercase text-[10px]">Importeer data of teken handmatig.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-8 space-y-8 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UploadMethod icon={Plus} title="Zelf Tekenen" desc="Polygons, punten en routes" onSelect={toggleDrawingMode} />
              <UploadMethod icon={FileJson} title="GeoJSON / JSON" desc=".geojson, .json" onSelect={() => document.getElementById('gis-upload')?.click()} />
              <UploadMethod icon={FileCode} title="KML" desc=".kml (Google Earth)" onSelect={() => document.getElementById('gis-upload')?.click()} />
              <UploadMethod icon={MapIcon} title="Shapefile" desc=".shp + .dbf nodig" onSelect={() => document.getElementById('gis-upload-multi')?.click()} />
              <UploadMethod icon={TableIcon} title="Spreadsheet" desc=".xlsx, .csv (met Lat/Lon)" onSelect={() => document.getElementById('gis-upload')?.click()} />
            </div>

            {isProcessing && (
              <div className="flex flex-col items-center gap-3 animate-in fade-in">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Data verwerken...</p>
              </div>
            )}

            <input type="file" id="gis-upload" className="hidden" accept=".geojson,.json,.xlsx,.csv,.kml" onChange={handleFileUpload} />
            <input type="file" id="gis-upload-multi" className="hidden" multiple accept=".shp,.dbf" onChange={handleFileUpload} />
          </div>

          <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
            <Button variant="ghost" onClick={() => setIsUploadOpen(false)} className="font-bold rounded-none">Annuleren</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="sm:max-w-md rounded-none border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight">{parentFolderId ? 'Nieuwe Submap' : 'Nieuwe Map'}</DialogTitle>
            <DialogDescription className="font-bold text-slate-500">Voer een naam in voor de nieuwe map.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input 
              placeholder="Mapnaam..." 
              value={newFolderName} 
              onChange={e => setNewFolderName(e.target.value)} 
              className="h-12 font-bold rounded-none border-2 focus:ring-primary/20"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsNewFolderOpen(false)} className="font-bold rounded-none">Annuleren</Button>
            <Button onClick={handleCreateFolder} className="font-black uppercase rounded-none px-8" disabled={!newFolderName.trim()}>Aanmaken</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .mapboxgl-ctrl-group.mapbox-draw-control-group button {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: white;
          border-bottom: 1px solid #f1f5f9;
        }
        .mapboxgl-ctrl-group.mapbox-draw-control-group button:last-child {
          border-bottom: none;
        }
        .mapboxgl-ctrl-group.mapbox-draw-control-group button:hover {
          background-color: #f8fafc;
        }
        .mapboxgl-ctrl-group.mapbox-draw-control-group {
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 0 !important;
          margin-top: 10px !important;
          z-index: 100 !important;
        }
      `}</style>
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

function ToolButton({ icon: Icon, active = false, onClick }: { icon: any, active?: boolean, onClick?: () => void }) {
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
