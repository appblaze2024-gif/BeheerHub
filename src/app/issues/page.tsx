'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer, FillLayer, LineLayer } from 'react-map-gl';
import { useCollection, useFirestore, useFirebaseApp, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Calendar as CalendarIcon, Plus, Search, List, Map as MapIcon, Bell, Filter, Navigation, Pencil, FileText, ChevronLeft, Camera, Package, Clock, User, Paperclip, PlusCircle, AlertCircle, Info, UploadCloud, ChevronDown, MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as turf from '@turf/turf';
import type { Wijk, Melding, UploadedFile, MeldingTask, Hoeveelheid, Object as MapObject } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, isSameDay, startOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useProfile } from '@/firebase/profile-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProject } from '@/context/project-context';
import Link from 'next/link';
import { useIsMobile } from '@/hooks/use-mobile';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Upload } from 'lucide-react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import Image from 'next/image';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { MapboxView } from '@/components/mapbox-view';
import { useUser } from '@/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


type Project = {
  id: string;
  projectnaam: string;
  wijken?: Wijk[];
};


const werkbonNavItems = [
    { label: 'Werkzaamheden', icon: Pencil },
    { label: 'Locatiegegevens', icon: MapPin },
    { label: 'Documenten', icon: FileText },
    { label: "Foto's", icon: Camera },
    { label: 'Hoeveelheid', icon: Package },
    { label: 'Uren', icon: Clock },
]

interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
  address: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    suburb?: string;
  };
}

const meldingFormSchema = z.object({
  hoofdcategorie: z.string().min(1, 'Hoofdcategorie is verplicht'),
  subcategorie: z.string().min(1, 'Subcategorie is verplicht'),
  extra_informatie: z.string().min(1, 'Omschrijving is verplicht'),
  status: z.string().min(1, 'Status is verplicht'),
  straatnaam: z.string().optional(),
  plaats: z.string().optional(),
  postcode: z.string().optional(),
  afhandeling_bijzonderheden: z.string().optional(),
});

type MeldingFormValues = z.infer<typeof meldingFormSchema>;

const statusOptions = [
    "Nieuw",
    "Intern doorgezet",
    "In behandeling",
    "Gepland op korte termijn",
    "Gepland op langere termijn",
    "Dubbel gemeld",
    "Afgerond",
    "Niet in beheer"
];
const hoofdcategorieOptions = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig"];
const subcategorieOptions: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Verstopte put", "Wateroverlast"],
    "Overig": ["Overige meldingen"]
};

export default function IssuesPage() {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const [selectedMeldingId, setSelectedMeldingId] = React.useState<string | null>(null);

  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [selectedWijkId, setSelectedWijkId] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const { profile } = useProfile();
  
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const [addressSearchQuery, setAddressSearchQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);
  
  const [tasks, setTasks] = React.useState<MeldingTask[]>([]);
  const [newTaskDescription, setNewTaskDescription] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('Werkzaamheden');
  const afhandelingBijzonderhedenRef = React.useRef<HTMLTextAreaElement>(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = React.useState(false);
  const [isDraggingDocument, setIsDraggingDocument] = React.useState(false);

  const [hoeveelheden, setHoeveelheden] = React.useState<Hoeveelheid[]>([]);
  const [newHoeveelheidType, setNewHoeveelheidType] = React.useState('');
  const [newHoeveelheidAantal, setNewHoeveelheidAantal] = React.useState('');
  const [newHoeveelheidEenheid, setNewHoeveelheidEenheid] = React.useState('zak');
  const [gewerkteMinuten, setGewerkteMinuten] = React.useState<number>(0);

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

  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);
  const { data: allObjects, isLoading: isLoadingObjects } = useCollection<MapObject>(objectsCollection);

  const form = useForm<MeldingFormValues>({
    resolver: zodResolver(meldingFormSchema),
  });

  const hoofdcategorie = form.watch('hoofdcategorie');

  const selectedMelding = React.useMemo(() => {
    return meldingen?.find(m => m.id === selectedMeldingId);
  }, [meldingen, selectedMeldingId]);

  const nearbyObjects = React.useMemo(() => {
    if (!selectedMelding || !allObjects) return [];
    const meldingPoint = turf.point([selectedMelding.longitude, selectedMelding.latitude]);
    return allObjects.filter(obj => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
      const objPoint = turf.point([obj.longitude, obj.latitude]);
      return turf.distance(meldingPoint, objPoint, { units: 'meters' }) <= 100;
    }).sort((a, b) => turf.distance(turf.point([selectedMelding.longitude, selectedMelding.latitude]), turf.point([a.longitude, a.latitude])) - turf.distance(turf.point([selectedMelding.longitude, selectedMelding.latitude]), turf.point([b.longitude, b.latitude])));
  }, [selectedMelding, allObjects]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    const projectIdFromParam = searchParams.get('projectId');
    if (projectIdFromParam && projectIdFromParam !== selectedProjectId) {
      setSelectedProjectId(projectIdFromParam);
    }
  }, [searchParams, selectedProjectId, setSelectedProjectId]);

  const selectedProject = React.useMemo(() => projects?.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
  const sortedWijken = React.useMemo(() => !selectedProject?.wijken ? [] : [...selectedProject.wijken].sort((a, b) => a.naam.localeCompare(b.naam, undefined, { numeric: true, sensitivity: 'base' })), [selectedProject?.wijken]);

  React.useEffect(() => {
    if (profile?.wijk && sortedWijken.length > 0) {
      const userWijk = sortedWijken.find(w => w.naam === profile.wijk);
      setSelectedWijkId(userWijk ? userWijk.id : null);
    }
  }, [profile, sortedWijken]);

  const filteredMeldingen = React.useMemo(() => {
    if (!meldingen) return [];
    let timeFilteredMeldingen = selectedDate ? meldingen.filter(m => {
      try {
        const creationDate = startOfDay(new Date(m.datum));
        const dayStart = startOfDay(selectedDate);
        return (m.status === 'Afgerond' && m.afhandeling_datum && isSameDay(startOfDay(new Date(m.afhandeling_datum)), dayStart)) || (m.status !== 'Afgerond' && creationDate <= dayStart);
      } catch (e) { return false; }
    }) : meldingen;

    const searchedMeldingen = debouncedSearchQuery ? timeFilteredMeldingen.filter(m => {
      const query = debouncedSearchQuery.toLowerCase();
      return ['intakenummer', 'extern_meldingsnummer', 'straatnaam', 'plaats', 'postcode', 'subcategorie', 'hoofdcategorie', 'melder', 'extra_informatie', 'wijk', 'status', 'aangenomen_door', 'afgehandeld_door'].some(field => (m as any)[field]?.toLowerCase().includes(query));
    }) : timeFilteredMeldingen;

    if (!selectedProjectId) return [];
    const project = projects?.find(p => p.id === selectedProjectId);
    if (!project?.wijken) return [];
    if (!selectedWijkId || selectedWijkId === 'all') {
      const allProjectWijkNames = project.wijken.map(w => w.naam);
      return searchedMeldingen.filter(m => {
        if (m.wijk && allProjectWijkNames.includes(m.wijk)) return true;
        if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return false;
        const point = turf.point([m.longitude, m.latitude]);
        for (const wijk of project.wijken || []) {
          try {
            const wijkFeatures = JSON.parse(wijk.subGebieden);
            if (Array.isArray(wijkFeatures)) {
              for (const polygon of wijkFeatures) if (turf.booleanPointInPolygon(point, polygon.geometry)) return true;
            }
          } catch { continue; }
        }
        return false;
      });
    }
    const wijk = project.wijken.find(w => w.id === selectedWijkId);
    if (!wijk) return [];
    return searchedMeldingen.filter(m => {
      if (m.wijk === wijk.naam) return true;
      try {
        const wijkFeatures = JSON.parse(wijk.subGebieden);
        if (Array.isArray(wijkFeatures) && wijkFeatures.length > 0) {
          if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return false;
          const point = turf.point([m.longitude, m.latitude]);
          for (const polygon of wijkFeatures) if (turf.booleanPointInPolygon(point, polygon)) return true;
        }
      } catch { return false; }
      return false;
    });
  }, [meldingen, selectedProjectId, selectedWijkId, projects, selectedDate, debouncedSearchQuery]);

  React.useEffect(() => {
    if (filteredMeldingen.length > 0 && !selectedMeldingId) {
      const idFromUrl = searchParams.get('id');
      if (idFromUrl && filteredMeldingen.find(m => m.id === idFromUrl)) {
        setSelectedMeldingId(idFromUrl);
      } else {
        setSelectedMeldingId(filteredMeldingen[0].id);
      }
    } else if (filteredMeldingen.length === 0) {
      setSelectedMeldingId(null);
    }
  }, [filteredMeldingen, selectedMeldingId, searchParams]);
  
  React.useEffect(() => {
    const melding = meldingen?.find(m => m.id === selectedMeldingId);
    if (melding) {
      setUploadedFiles(melding.files || []);
      setUploadedPhotos(melding.fotos || []);
      setLocation({ latitude: melding.latitude, longitude: melding.longitude });
      setAddressSearchQuery(`${melding.straatnaam || ''}, ${melding.plaats || ''}`);
      setSuggestions([]);
      setIsSearching(false);
      setTasks(melding.tasks || []);
      setHoeveelheden(melding.hoeveelheden || []);
      setGewerkteMinuten(melding.gewerkteMinuten || 0);
      setActiveTab('Werkzaamheden');
      form.reset({
        hoofdcategorie: melding.hoofdcategorie,
        subcategorie: melding.subcategorie,
        extra_informatie: melding.extra_informatie,
        status: melding.status,
        straatnaam: melding.straatnaam,
        plaats: melding.plaats,
        postcode: melding.postcode,
        afhandeling_bijzonderheden: melding.afhandeling_bijzonderheden || '',
      });
    }
  }, [selectedMeldingId, meldingen, form]);
  
  const handleAfronden = async () => {
    if (!firestore || !selectedMelding?.id || !user) return;
    setIsSubmitting(true);
    const meldingRef = doc(firestore, 'meldingen', selectedMelding.id);
    try {
        await updateDocumentNonBlocking(meldingRef, {
            status: 'Afgerond',
            afhandeling_datum: format(new Date(), 'yyyy-MM-dd'),
            afgehandeld_door: user.displayName || user.email || 'Onbekend',
            afhandeling_bijzonderheden: afhandelingBijzonderhedenRef.current?.value,
            files: uploadedFiles,
            fotos: uploadedPhotos,
            tasks: tasks,
            hoeveelheden: hoeveelheden,
            gewerkteMinuten: gewerkteMinuten,
        });
        const nextMelding = filteredMeldingen.find(m => m.id !== selectedMeldingId);
        setSelectedMeldingId(nextMelding ? nextMelding.id : null);
    } catch (error) {
        console.error("Fout bij afronden melding:", error);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (isLoadingMeldingen || isLoadingProjects || isLoadingObjects) {
      return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }
  
  if (!selectedMelding) {
    return (
        <div className="flex flex-col flex-1 p-6">
            <h1 className="text-xl font-bold mb-4">Meldingen</h1>
            <Card className="flex-1 flex items-center justify-center">
                <CardContent className="text-center p-6">
                    <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-lg font-semibold">Geen meldingen gevonden</p>
                    <p className="text-muted-foreground">Er zijn geen meldingen die overeenkomen met de huidige filters.</p>
                </CardContent>
            </Card>
        </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
        <header className="p-4 border-b bg-gray-50 dark:bg-gray-900/50 flex-row items-center justify-between shrink-0 flex">
            <div className="flex items-center gap-4">
                 <Select value={selectedMeldingId || ''} onValueChange={setSelectedMeldingId}>
                    <SelectTrigger className="w-72">
                      <SelectValue>
                        {`Meldingen (${filteredMeldingen.length})`}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {filteredMeldingen.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                                {m.intakenummer}: {m.extra_informatie.substring(0, 40)}...
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center gap-2">
                {selectedProjectId && (
                <Link href={`/navigation-module?projectId=${selectedProjectId}&lat=${selectedMelding.latitude}&lng=${selectedMelding.longitude}&straat=${encodeURIComponent(selectedMelding.straatnaam || '')}`} passHref>
                    <Button variant="outline" size="icon" className="h-9 w-9">
                        <Navigation className="h-4 w-4" />
                    </Button>
                </Link>
                )}
                <Button
                    className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-9"
                    onClick={handleAfronden}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    WERKBON AFRONDEN
                </Button>
            </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-4 overflow-x-auto">
                <TabsList>
                    {werkbonNavItems.map(item => (
                        <TabsTrigger key={item.label} value={item.label} className="gap-2">
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                            {item.label === 'Documenten' && uploadedFiles.length > 0 && <Badge variant="secondary" className="ml-1">{uploadedFiles.length}</Badge>}
                            {item.label === "Foto's" && uploadedPhotos.length > 0 && <Badge variant="secondary" className="ml-1">{uploadedPhotos.length}</Badge>}
                            {item.label === 'Werkzaamheden' && tasks.length > 0 && tasks.filter(t => !t.completed).length > 0 && <Badge variant="secondary" className="ml-1">{tasks.filter(t => !t.completed).length}</Badge>}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
                <TabsContent value="Werkzaamheden" className="mt-0">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                             <Card>
                                <CardHeader><CardTitle>Werkomschrijving / Melding</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <Form {...form}>
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField control={form.control} name="hoofdcategorie" render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>Hoofdcategorie</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                    <SelectContent>{hoofdcategorieOptions.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                                </FormItem>
                                            )} />
                                            <FormField control={form.control} name="subcategorie" render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>Subcategorie</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value} disabled={!hoofdcategorie}>
                                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                    <SelectContent>{(subcategorieOptions[hoofdcategorie] || []).map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                                </FormItem>
                                            )} />
                                        </div>
                                        <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Omschrijving</FormLabel>
                                            <FormControl><Textarea rows={4} {...field} /></FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )} />
                                    </Form>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Uitgevoerde werkzaamheden (taken)</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {tasks.map((task) => (
                                            <div key={task.id} className="flex items-center gap-2">
                                                <Checkbox id={`task-${task.id}`} checked={task.completed} onCheckedChange={(checked) => { setTasks(tasks.map(t => t.id === task.id ? { ...t, completed: !!checked } : t)); }} />
                                                <Label htmlFor={`task-${task.id}`} className={`flex-1 ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.description}</Label>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTasks(tasks.filter(t => t.id !== task.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <Input placeholder="Nieuwe taak toevoegen..." value={newTaskDescription} onChange={(e) => setNewTaskDescription(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newTaskDescription.trim()) { e.preventDefault(); setTasks([...tasks, { id: new Date().toISOString(), description: newTaskDescription.trim(), completed: false }]); setNewTaskDescription(''); } }} />
                                        <Button type="button" onClick={() => { if (newTaskDescription.trim()) { setTasks([...tasks, { id: new Date().toISOString(), description: newTaskDescription.trim(), completed: false }]); setNewTaskDescription(''); } }}><Plus className="h-4 w-4" /></Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-6">
                            <Card>
                                <CardHeader><CardTitle>Locatie</CardTitle></CardHeader>
                                <CardContent className="h-64 p-0"><MapboxView latitude={selectedMelding.latitude} longitude={selectedMelding.longitude} /></CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Foto</CardTitle></CardHeader>
                                <CardContent>
                                    {uploadedPhotos.length > 0 ? (
                                        <div className="relative aspect-video w-full rounded-md overflow-hidden border">
                                            <Image src={uploadedPhotos[0].url} alt="Foto van melding" fill className="object-cover" />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-32 text-muted-foreground bg-muted rounded-md">
                                            <Camera className="h-8 w-8" />
                                            <p className="ml-2">Geen foto beschikbaar</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="Locatiegegevens" className="mt-0">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                         <div className="space-y-6">
                             <Card>
                                 <CardHeader><CardTitle>Locatie Details</CardTitle></CardHeader>
                                 <CardContent className="space-y-2">
                                     <div className="flex justify-between text-sm">
                                         <span className="font-semibold text-muted-foreground">Adres:</span>
                                         <span>{selectedMelding.straatnaam} {selectedMelding.huisnummer}</span>
                                     </div>
                                      <div className="flex justify-between text-sm">
                                         <span className="font-semibold text-muted-foreground">Postcode:</span>
                                         <span>{selectedMelding.postcode}</span>
                                     </div>
                                     <div className="flex justify-between text-sm">
                                         <span className="font-semibold text-muted-foreground">Plaats:</span>
                                         <span>{selectedMelding.plaats}</span>
                                     </div>
                                      <div className="flex justify-between text-sm">
                                         <span className="font-semibold text-muted-foreground">Wijk:</span>
                                         <span>{selectedMelding.wijk}</span>
                                     </div>
                                      <div className="flex justify-between text-sm">
                                         <span className="font-semibold text-muted-foreground">Coördinaten:</span>
                                         <span>{selectedMelding.latitude.toFixed(5)}, {selectedMelding.longitude.toFixed(5)}</span>
                                     </div>
                                 </CardContent>
                             </Card>
                             <Card>
                                 <CardHeader><CardTitle>Objecten in de buurt (100m)</CardTitle></CardHeader>
                                 <CardContent>
                                     {nearbyObjects.length > 0 ? (
                                         <div className="space-y-2">
                                             {nearbyObjects.map(obj => (
                                                 <div key={obj.id} className="text-sm p-2 bg-muted rounded-md">{obj.id} - {obj.locatieSubType}</div>
                                             ))}
                                         </div>
                                     ) : (
                                         <p className="text-sm text-muted-foreground">Geen objecten gevonden.</p>
                                     )}
                                 </CardContent>
                             </Card>
                         </div>
                         <div className="min-h-[400px] lg:min-h-0">
                             <MapboxView latitude={selectedMelding.latitude} longitude={selectedMelding.longitude} objects={nearbyObjects} />
                         </div>
                     </div>
                </TabsContent>
                <TabsContent value="Documenten" className="mt-0">
                    {/* Content will be added in a future step */}
                </TabsContent>
                <TabsContent value="Foto's" className="mt-0">
                    {/* Content will be added in a future step */}
                </TabsContent>
                <TabsContent value="Hoeveelheid" className="mt-0">
                    {/* Content will be added in a future step */}
                </TabsContent>
                <TabsContent value="Uren" className="mt-0">
                    {/* Content will be added in a future step */}
                </TabsContent>
            </div>
        </Tabs>
    </div>
  );
}
