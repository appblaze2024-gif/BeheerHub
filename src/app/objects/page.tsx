'use client';

import * as React from 'react';
import {
  Filter,
  Save,
  Map,
  Plus,
  Search,
  ChevronDown,
  MapPin,
  MoreVertical,
  ChevronRight,
  ImageIcon,
  Upload,
  List,
  Palette,
  Download,
  ArrowLeft,
  Cpu,
  Clock,
  Activity,
  History,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { MapboxView } from '@/components/mapbox-view';
import { ObjectImportDialog } from '@/components/object-import-dialog';
import { ObjectExportDialog } from '@/components/object-export-dialog';
import { useCollection, useFirestore, updateDocumentNonBlocking, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, query, orderBy, limit, writeBatch } from 'firebase/firestore';
import type { Wijk } from '@/lib/types';
import * as turf from '@turf/turf';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useProject } from '@/context/project-context';
import { LoadingScreen } from '@/components/loading-screen';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Area = {
  id: string;
  naam: string;
  subGebieden: string;
  type: 'wijk' | 'veegroute' | 'prullenbakkenroute';
};

type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
  veegroutes?: Wijk[];
  prullenbakkenroutes?: Wijk[];
};

function PlanningAccordionContent({ selectedObject, handleUpdateField, projects, isLoadingProjects }: { selectedObject: any, handleUpdateField: (field: string, value: any) => void, projects: Project[] | null, isLoadingProjects: boolean }) {
  const [selectedProjectId, setSelectedProjectId] = React.useState('');

  const projectRoutes = React.useMemo(() => {
    if (!selectedProjectId) return [];
    const project = projects?.find(p => p.id === selectedProjectId);
    return project?.prullenbakkenroutes || [];
  }, [selectedProjectId, projects]);

  const handleRouteAssignment = (routeName: string, isChecked: boolean) => {
    const currentAssignments = selectedObject.locatieWerkgebieden || [];
    let newAssignments;
    if (isChecked) {
      newAssignments = [...currentAssignments, routeName];
    } else {
      newAssignments = currentAssignments.filter((name: string) => name !== routeName);
    }
    handleUpdateField('locatieWerkgebieden', newAssignments);
  };
  
  if (!selectedObject) return null;

  return (
    <div className='space-y-4'>
      <Select onValueChange={setSelectedProjectId} value={selectedProjectId} disabled={isLoadingProjects}>
        <SelectTrigger className="h-10 font-bold">
          <SelectValue placeholder="Selecteer een project" />
        </SelectTrigger>
        <SelectContent>
          {projects?.map(p => (
            <SelectItem key={p.id} value={p.id}>{p.projectnaam}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedProjectId && (
        <div className="space-y-2 border rounded-xl p-4 max-h-48 overflow-y-auto no-scrollbar bg-slate-50/50">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Prullenbakkenroutes</h4>
          {projectRoutes.length > 0 ? projectRoutes.map(route => (
            <div key={route.id} className="flex items-center space-x-2 p-1.5 hover:bg-white rounded-lg transition-colors">
              <Checkbox
                id={`route-${route.id}`}
                checked={(selectedObject.locatieWerkgebieden || []).includes(route.naam)}
                onCheckedChange={(checked) => handleRouteAssignment(route.naam, !!checked)}
              />
              <Label htmlFor={`route-${route.id}`} className="font-bold text-xs text-slate-700 cursor-pointer">{route.naam}</Label>
            </div>
          )) : (
            <p className="text-xs font-medium text-slate-400 italic">Geen routes beschikbaar voor dit project.</p>
          )}
        </div>
      )}
    </div>
  );
}

function IoTHistoryColumn({ sensor, history, isLoading }: { sensor: any, history: any[] | null, isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!sensor) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center text-slate-300">
        <div className="bg-slate-50 p-6 rounded-full mb-4">
          <Cpu className="h-10 w-10 opacity-20" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest">Geen IOT Unit Gekoppeld</p>
        <p className="text-[9px] font-medium text-slate-400 mt-2 max-w-[150px]">Koppel een sensor via het IOT dashboard met hetzelfde ID.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50 border-l">
      <div className="p-6 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">IOT Live Status</h3>
          <Badge variant="outline" className={cn(
            "text-[9px] h-5 uppercase font-black px-2",
            sensor.status === 'Online' ? "text-green-600 border-green-200 bg-green-50" : "text-red-600 border-red-200 bg-red-50"
          )}>
            {sensor.status || 'Offline'}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Vulgraad</p>
            <p className="text-xl font-black text-slate-900 leading-none">{sensor.vulgraad || 0}%</p>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Afstand</p>
            <p className="text-xl font-black text-slate-900 leading-none">{sensor.currentDistanceCm || 0} cm</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-4 overflow-y-auto no-scrollbar">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-slate-400" />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Historie (Metingen)</h4>
        </div>
        
        <div className="space-y-2">
          {history && history.length > 0 ? (
            history.map((log, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm transition-all hover:border-primary/20">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-900">
                    {log.timestamp ? format(new Date(log.timestamp), 'dd MMM', { locale: nl }) : '--'}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">
                    {log.timestamp ? format(new Date(log.timestamp), 'HH:mm') : '--:--'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-900 leading-none">{log.vulgraad}%</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">{log.currentDistanceCm} cm</p>
                  </div>
                  <Activity className="h-3 w-3 text-primary opacity-40" />
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-100 bg-white/50">
              <Clock className="h-6 w-6 text-slate-200 mx-auto mb-2" />
              <p className="text-[9px] font-bold text-slate-400 uppercase">Geen historie beschikbaar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ObjectsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [isImporting, setIsImporting] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedObject, setSelectedObject] = React.useState<any | null>(null);
  const [viewMode, setViewMode] = React.useState<'list' | 'map'>('list');
  const [showHeatmap, setShowHeatmap] = React.useState(false);
  const [isBulkLoading, setIsBulkLoading] = React.useState(false);
  const [typeFilter, setTypeFilter] = React.useState<'all' | 'prullenbak' | 'container'>('all');

  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [selectedAreaIds, setSelectedAreaIds] = React.useState<string[]>([]);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);
  
  const projectsCollection = useMemoFirebase(() => {
      if (!firestore) return null;
      return collection(firestore, 'projects');
  }, [firestore]);

  const { data: objects, isLoading: isLoadingObjects } = useCollection<any>(objectsQuery);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const sensorRef = useMemoFirebase(() => {
    if (!firestore || !selectedObject?.id) return null;
    return doc(firestore, 'sensors', selectedObject.id);
  }, [firestore, selectedObject?.id]);
  const { data: sensor, isLoading: sensorLoading } = useDoc<any>(sensorRef);

  const historyQuery = useMemoFirebase(() => {
    if (!firestore || !selectedObject?.id) return null;
    return query(
      collection(firestore, 'sensors', selectedObject.id, 'history'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
  }, [firestore, selectedObject?.id]);
  const { data: history, isLoading: historyLoading } = useCollection<any>(historyQuery);

  const selectedProject = React.useMemo(() => {
    return projects?.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);
  
  const projectAreas = React.useMemo<Area[]>(() => {
    if (!selectedProject) return [];
    return (selectedProject.prullenbakkenroutes || []).map(r => ({ ...r, type: 'prullenbakkenroute' }));
  }, [selectedProject]);


  const filteredObjectsList = React.useMemo(() => {
    if (!objects) return [];
    
    let filtered = objects;

    // Apply Type Filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(obj => {
        const isContainer = (obj.locatieType?.toLowerCase().includes('container') || 
                            obj.locatieSubType?.toLowerCase().includes('container') ||
                            obj.locatieType?.toLowerCase().includes('ondergronds'));
        
        if (typeFilter === 'container') return isContainer;
        return !isContainer; // default to prullenbak for everything else
      });
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (obj) =>
          obj.id.toLowerCase().includes(q) ||
          obj.straatnaam?.toLowerCase().includes(q) ||
          obj.locatieSubType?.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [objects, searchTerm, typeFilter]);

  React.useEffect(() => {
    if (!selectedObject && filteredObjectsList && filteredObjectsList.length > 0 && !isTablet) {
      setSelectedObject(filteredObjectsList[0]);
    } else if (selectedObject && filteredObjectsList) {
        if (!filteredObjectsList.find((v) => v.id === selectedObject.id)) {
            setSelectedObject(null);
        }
    }
  }, [filteredObjectsList, selectedObject, isTablet]);
  
  const handleImportSuccess = () => {
    setIsImporting(false);
  };

  const handleUpdateField = (field: string, value: any) => {
    if (!firestore || !selectedObject) return;
    const objectRef = doc(firestore, 'objects', selectedObject.id);
    updateDocumentNonBlocking(objectRef, { [field]: value });
    setSelectedObject((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSetAllActive = async () => {
    if (!firestore || !objects) return;
    setIsBulkLoading(true);
    const batch = writeBatch(firestore);
    
    objects.forEach((obj: any) => {
      const docRef = doc(firestore, 'objects', obj.id);
      batch.update(docRef, { isActief: true });
    });

    try {
      await batch.commit();
      toast({
        title: "Bulk actie voltooid",
        description: `${objects.length} objecten zijn op actief gezet.`,
      });
    } catch (error) {
      console.error("Fout bij activeren objecten:", error);
      toast({
        variant: "destructive",
        title: "Fout opgetreden",
        description: "Kon de objecten niet in bulk bijwerken.",
      });
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleAreaSelectionChange = (areaId: string, checked: boolean) => {
    setSelectedAreaIds(prev => 
      checked ? [...prev, areaId] : prev.filter(id => id !== areaId)
    );
  };
  
  const selectedAreas = React.useMemo(() => {
      if (!projectAreas) return [];
      return projectAreas.filter(area => selectedAreaIds.includes(area.id));
  }, [projectAreas, selectedAreaIds]);

  const objectsOnMap = React.useMemo(() => {
    if (!objects) return [];
    
    let filtered = objects;

    // Apply Type Filter to map
    if (typeFilter !== 'all') {
      filtered = filtered.filter(obj => {
        const isContainer = (obj.locatieType?.toLowerCase().includes('container') || 
                            obj.locatieSubType?.toLowerCase().includes('container') ||
                            obj.locatieType?.toLowerCase().includes('ondergronds'));
        
        if (typeFilter === 'container') return isContainer;
        return !isContainer;
      });
    }

    if (selectedAreaIds.length === 0) {
      return filtered;
    }

    const selectedAreaNames = selectedAreas.map(area => area.naam);

    return filtered.filter(obj => 
        obj.locatieWerkgebieden && Array.isArray(obj.locatieWerkgebieden) && obj.locatieWerkgebieden.some((gebied: string) => selectedAreaNames.includes(gebied))
    );
  }, [objects, selectedAreaIds, selectedAreas, typeFilter]);

  const areaPolygons = React.useMemo(() => {
    return selectedAreas.flatMap(area => {
      try {
        const features = JSON.parse(area.subGebieden);
        if (Array.isArray(features)) {
          return features.map((feature: any) => ({
            ...feature,
            properties: { ...feature.properties, areaNaam: area.naam },
          }));
        }
        return [];
      } catch (e) {
        console.error(`Invalid GeoJSON for area ${area.naam}:`, e);
        return [];
      }
    });
  }, [selectedAreas]);

  const objectCountsPerArea = React.useMemo(() => {
    if (!objects || !projectAreas) return {};

    const counts: { [areaId: string]: number } = {};

    for (const area of projectAreas) {
      let objectCount = 0;
      try {
        const features = JSON.parse(area.subGebieden);
        if (Array.isArray(features)) {
          for (const obj of objects) {
            if (typeof obj.latitude === 'number' && typeof obj.longitude === 'number') {
              const point = turf.point([obj.longitude, obj.latitude]);
              for (const polygon of features) {
                if (turf.booleanPointInPolygon(point, polygon)) {
                  objectCount++;
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
      }
      counts[area.id] = objectCount;
    }
    return counts;
  }, [objects, projectAreas]);

  if (isLoadingObjects || isLoadingProjects) {
    return <LoadingScreen message="Objecten laden..." />;
  }

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-white">
      <header className="flex flex-col md:flex-row items-center justify-between p-4 md:p-6 bg-white border-b shadow-sm gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 font-bold h-9 gap-2">
                <Filter className="h-4 w-4" /> 
                {typeFilter === 'all' ? 'Filter' : typeFilter === 'prullenbak' ? 'Prullenbakken' : 'Containers'}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => setTypeFilter('all')} className="font-bold flex items-center justify-between">
                Alles tonen {typeFilter === 'all' && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTypeFilter('prullenbak')} className="font-bold flex items-center justify-between">
                Prullenbakken {typeFilter === 'prullenbak' && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTypeFilter('container')} className="font-bold flex items-center justify-between">
                Ondergrondse containers {typeFilter === 'container' && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 font-bold h-9">
                {isBulkLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Bulk Acties <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={handleSetAllActive} className="font-bold cursor-pointer">
                Zet alle op Actief
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="default" size="sm" className="shrink-0 font-black h-9 uppercase tracking-tight" onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}>
            {viewMode === 'list' ? <Map className="mr-2 h-4 w-4" /> : <List className="mr-2 h-4 w-4" />}
            {viewMode === 'list' ? 'Kaart' : 'Lijst'}
          </Button>
          {viewMode === 'map' && (
            <Button variant={showHeatmap ? 'secondary' : 'outline'} size="sm" className="shrink-0 font-bold h-9" onClick={() => setShowHeatmap(!showHeatmap)}>
                <Palette className="mr-2 h-4 w-4" />
                Vulgraden
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Zoek een object..." className="pl-9 h-9 font-bold" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
           <ObjectImportDialog
            open={isImporting}
            onOpenChange={setIsImporting}
            onSuccess={handleImportSuccess}
          >
            <Button variant="outline" size="sm" className="h-9 font-bold">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          </ObjectImportDialog>
          <ObjectExportDialog objects={objects} projects={projects}>
            <Button variant="outline" size="sm" className="h-9 font-bold">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </ObjectExportDialog>
        </div>
      </header>

      {viewMode === 'list' ? (
         <div className="flex flex-1 min-h-0 relative">
         <aside className={cn(
             "w-full lg:w-72 bg-white border-r flex flex-col",
             isTablet && selectedObject ? "hidden" : "flex"
         )}>
           <div className="p-4 border-b bg-slate-50/50">
             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Geregistreerde Objecten</p>
             <Input placeholder="Snel filteren..." className="h-9 font-bold" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>
           <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="flex flex-col space-y-1 p-2">
               {filteredObjectsList && filteredObjectsList.length > 0 ? (
                 filteredObjectsList.map((obj) => (
                   <div
                     key={obj.id}
                     onClick={() => setSelectedObject(obj)}
                     className={cn(
                         "flex items-start justify-between p-3 rounded-xl text-left cursor-pointer transition-all",
                         selectedObject?.id === obj.id && !isTablet
                            ? "bg-primary text-white shadow-lg scale-[1.02]"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800"
                     )}
                   >
                     <div className="flex items-start gap-3">
                       <div className={cn(
                           "p-2 rounded-lg",
                           selectedObject?.id === obj.id && !isTablet ? "bg-white/20" : "bg-slate-100"
                       )}>
                        <MapPin className={cn("h-4 w-4", selectedObject?.id === obj.id && !isTablet ? "text-white" : "text-primary")} />
                       </div>
                       <div>
                         <p className={cn("font-black uppercase tracking-tight text-xs", selectedObject?.id === obj.id && !isTablet ? "text-white" : "text-slate-900")}>{obj.id}</p>
                         <p className={cn("text-[10px] font-bold uppercase tracking-widest truncate", selectedObject?.id === obj.id && !isTablet ? "text-white/70" : "text-slate-400")}>
                           {obj.straatnaam ? `${obj.straatnaam} ${obj.huisnummer || ''}` : 'Adres onbekend'}
                         </p>
                       </div>
                     </div>
                      <ChevronRight className={cn("h-4 w-4 mt-1 transition-all", selectedObject?.id === obj.id && !isTablet ? "text-white" : "text-slate-200")} />
                   </div>
                 ))
               ) : (
                  <div className="p-12 text-center text-muted-foreground bg-slate-50/50 rounded-2xl m-2">
                   <MapPin className="h-12 w-12 mx-auto mb-4 opacity-10" />
                   <p className="font-bold uppercase text-[10px] tracking-widest">Geen objecten</p>
                 </div>
               )}
             </div>
           </div>
         </aside>
 
         <main className={cn(
             "flex-1 p-0 overflow-y-auto no-scrollbar bg-slate-50/30",
             selectedObject ? "flex" : "hidden lg:flex"
         )}>
              {selectedObject ? (
               <Card className="h-full border-none rounded-none shadow-none flex-1 flex flex-col bg-white">
               <CardContent className="p-0 flex-1 flex flex-col xl:grid xl:grid-cols-12 gap-0">
                 <div className="xl:col-span-5 space-y-6 p-6 border-r border-slate-100 overflow-y-auto no-scrollbar">
                     <div className="flex items-center gap-4 mb-6">
                        {isTablet && (
                            <Button variant="ghost" size="icon" onClick={() => setSelectedObject(null)} className="h-10 w-10 rounded-full bg-slate-50 border border-slate-100 shrink-0">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        )}
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 leading-none mb-1">{selectedObject.id}</h2>
                            <p className="text-[10px] font-black uppercase tracking-widest">{selectedObject.locatieSubType || 'Basis Object'}</p>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                       <div className="space-y-4">
                         <div className="space-y-1.5">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Locatie type</Label>
                           <Select value={selectedObject.locatieType} onValueChange={(v) => handleUpdateField('locatieType', v)}>
                             <SelectTrigger className="h-10 font-bold">
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value={selectedObject.locatieType}>
                                 {selectedObject.locatieType}
                               </SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                         <div className="space-y-1.5">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Locatie sub type</Label>
                           <Select value={selectedObject.locatieSubType} onValueChange={(v) => handleUpdateField('locatieSubType', v)}>
                             <SelectTrigger className="h-10 font-bold">
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value={selectedObject.locatieSubType}>
                                 {selectedObject.locatieSubType}
                               </SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                       </div>
                       <div className="space-y-4">
                         <div className="space-y-1.5">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Kwaliteit</Label>
                           <Select value={selectedObject.kwaliteit} onValueChange={(v) => handleUpdateField('kwaliteit', v)}>
                             <SelectTrigger className="h-10 font-bold">
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value="A">A - Hoog</SelectItem>
                               <SelectItem value="B">B - Midden</SelectItem>
                               <SelectItem value="C">C - Laag</SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                         <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                           <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Object Status</span>
                                <span className="text-xs font-bold text-slate-900 mt-0.5">Operationeel</span>
                           </div>
                           <div className="flex items-center gap-3">
                             <Switch
                               checked={selectedObject.isActief}
                               onCheckedChange={(c) => handleUpdateField('isActief', c)}
                             />
                             <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Actief</span>
                           </div>
                         </div>
                       </div>
                     </div>
 
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                         <div className="sm:col-span-2 space-y-1.5">
                             <Label htmlFor="street-name" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Straatnaam</Label>
                             <Input
                             id="street-name"
                             value={selectedObject.straatnaam || ''}
                             onChange={(e) => handleUpdateField('straatnaam', e.target.value)}
                             className="h-10 font-bold"
                             />
                         </div>
                         <div className="space-y-1.5">
                             <Label htmlFor="house-number" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Huisnummer</Label>
                             <Input 
                                 id="house-number" 
                                 value={selectedObject.huisnummer || ''}
                                 onChange={(e) => handleUpdateField('huisnummer', e.target.value)}
                                 className="h-10 font-bold"
                             />
                         </div>
                     </div>

                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="latitude" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Latitude</Label>
                            <Input 
                                id="latitude" 
                                type="number"
                                step="any"
                                value={selectedObject.latitude || ''}
                                onChange={(e) => handleUpdateField('latitude', parseFloat(e.target.value))}
                                className="h-10 font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="longitude" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Longitude</Label>
                            <Input 
                                id="longitude" 
                                type="number"
                                step="any"
                                value={selectedObject.longitude || ''}
                                onChange={(e) => handleUpdateField('longitude', parseFloat(e.target.value))}
                                className="h-10 font-mono"
                            />
                        </div>
                    </div>
 
                     <div>
                       <Accordion type="single" collapsible className="w-full bg-slate-50/50 rounded-xl border border-slate-100 px-4">
                         <AccordionItem value="planning" className="border-none">
                             <AccordionTrigger className="font-black uppercase tracking-widest text-[10px] text-slate-400 hover:no-underline py-4">Routing & Planning</AccordionTrigger>
                             <AccordionContent className="pt-0 pb-6">
                                <PlanningAccordionContent selectedObject={selectedObject} handleUpdateField={handleUpdateField} projects={projects} isLoadingProjects={isLoadingProjects} />
                             </AccordionContent>
                         </AccordionItem>
                       </Accordion>
                     </div>

                     <div className="space-y-4 pt-2">
                         <div className="space-y-1.5">
                             <Label htmlFor="warning" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Waarschuwing / Bijzonderheden</Label>
                             <Textarea id="warning" placeholder="Typ hier eventuele veiligheidsmeldingen..." value={selectedObject.waarschuwing || ''} onChange={(e) => handleUpdateField('waarschuwing', e.target.value)} className="resize-none font-medium italic border-orange-100 focus:ring-orange-500/20 bg-orange-50/30" rows={3} />
                         </div>
                         <Separator className="bg-slate-100" />
                         <div>
                             <div className="flex items-center gap-2 mb-3">
                                 <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actieve Gebieden</h3>
                             </div>
                             <div className="flex flex-wrap gap-2">
                              {selectedObject.locatieWerkgebieden && selectedObject.locatieWerkgebieden.length > 0 ? (
                                selectedObject.locatieWerkgebieden.map((gebied: string) => (
                                    <Badge key={gebied} variant="secondary" className="bg-blue-50 text-blue-600 border-none font-black uppercase text-[9px] tracking-tighter px-3 h-6">
                                        {gebied}
                                    </Badge>
                                ))
                              ) : (
                                <p className="text-xs font-medium text-slate-400 italic">Geen routes gekoppeld.</p>
                              )}
                             </div>
                         </div>
                     </div>
                 </div>
 
                 <div className="xl:col-span-4 space-y-6 p-6 bg-slate-50/30 border-r border-slate-100 overflow-y-auto no-scrollbar">
                     <Card className="h-64 rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-white">
                     <CardContent className="p-0 h-full">
                         <MapboxView 
                         key={selectedObject?.id}
                         longitude={selectedObject?.longitude}
                         latitude={selectedObject?.latitude}
                         interactive={false}
                         />
                     </CardContent>
                     </Card>
                     <Card className="h-64 rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-white">
                     <CardContent className="p-4 h-full flex flex-col items-center justify-center text-slate-300">
                         <div className="bg-slate-50 p-6 rounded-full mb-4">
                            <ImageIcon className="h-10 w-10 opacity-20" />
                         </div>
                         <p className="text-[10px] font-black uppercase tracking-widest">Geen objectfoto</p>
                         <Button variant="ghost" size="sm" className="mt-4 font-bold text-primary">Uploaden</Button>
                     </CardContent>
                     </Card>
                     <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-white">
                     <CardContent className="p-6">
                         <div className="flex justify-between items-end mb-3">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Vulgraad (GIS)</h3>
                            <span className="text-2xl font-black text-slate-900 leading-none">{selectedObject?.vulgraad || 0}%</span>
                         </div>
                         <Progress value={selectedObject?.vulgraad || 0} variant="gauge" className="h-2 bg-slate-100" />
                         <div className="mt-4 flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                             <span>Leeg</span>
                             <span>Vol</span>
                         </div>
                     </CardContent>
                     </Card>
                 </div>
 
                 <div className="xl:col-span-3 h-full overflow-hidden">
                    <IoTHistoryColumn sensor={sensor} history={history} isLoading={sensorLoading || historyLoading} />
                 </div>
               </CardContent>
             </Card>
             ) : (
                 <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 m-6">
                    <MapPin className="h-16 w-16 text-slate-200 mb-4 opacity-20" />
                    <p className="font-black uppercase text-[10px] tracking-widest text-slate-400">Selecteer een object om de details en IOT metingen te bekijken.</p>
                 </div>
             )}
         </main>
       </div>
      ) : (
        <div className="flex flex-1 min-h-0 relative">
          <aside className="absolute top-0 left-0 z-10 m-4 w-full max-w-[320px] bg-white/95 backdrop-blur-md border-2 border-slate-100 rounded-2xl shadow-2xl p-4 hidden sm:block">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Project Selectie</Label>
                <Select
                  value={selectedProjectId || ''}
                  onValueChange={(value) => {
                    setSelectedProjectId(value || null);
                    setSelectedAreaIds([]);
                  }}
                  disabled={isLoadingProjects}
                >
                  <SelectTrigger className="h-11 font-black bg-slate-50 border-none shadow-inner">
                    <SelectValue placeholder="Kies een project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map(p => <SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedProject && (
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Filter op Gebied</Label>
                  <div className="space-y-1 max-h-80 overflow-y-auto no-scrollbar bg-slate-50 rounded-2xl p-2 border border-slate-100 shadow-inner">
                    {(projectAreas && projectAreas.length > 0) ? (
                        projectAreas.map(area => (
                            <div key={area.id} className="flex items-center space-x-3 p-2 hover:bg-white rounded-xl transition-all cursor-pointer group">
                                <Checkbox
                                    id={`area-${area.id}`}
                                    checked={selectedAreaIds.includes(area.id)}
                                    onCheckedChange={(checked) => handleAreaSelectionChange(area.id, !!checked)}
                                    className="border-slate-300"
                                />
                                <Label htmlFor={`area-${area.id}`} className="flex-1 flex justify-between items-center cursor-pointer">
                                  <span className="text-xs font-black uppercase tracking-tight text-slate-700 group-hover:text-primary transition-colors">{area.naam}</span>
                                  <Badge variant="outline" className="text-[9px] font-black border-slate-200 bg-white text-slate-400">{objectCountsPerArea[area.id] || 0}</Badge>
                                </Label>
                            </div>
                        ))
                    ) : (
                        <div className="p-8 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">Geen routes voor dit project</p>
                        </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
          <MapboxView objects={objectsOnMap} wijkPolygons={areaPolygons} showHeatmap={showHeatmap} />
        </div>
      )}
    </div>
  );
}
