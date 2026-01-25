'use client';

import * as React from 'react';
import MapGL, { Marker, Popup, Source, Layer, MapLayerMouseEvent } from 'react-map-gl';
import { useFirestore, useUser } from '@/firebase';
import { collection, getDocs, query, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Layers as MapLayersIcon, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import * as turf from '@turf/turf';

import type { Project } from '@/app/projects/page';
import type { Schouwing } from '@/lib/types';
import { SchouwDialog } from '@/components/schouw-dialog';
import { useProfile } from '@/firebase/profile-provider';
import { updateDocumentNonBlocking } from '@/firebase';
import { cn } from '@/lib/utils';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

const selectedAreasFillLayer: FillLayer = {
  id: 'selected-areas-fill',
  type: 'fill',
  paint: {
    'fill-color': '#3b82f6', // blue-500
    'fill-opacity': 0.5,
  },
};

const selectedAreasOutlineLayer: LineLayer = {
  id: 'selected-areas-outline',
  type: 'line',
  paint: {
    'line-color': '#1d4ed8', // blue-700
    'line-width': 2,
  },
};


export default function SchouwenPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(true);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  
  const [schouwingen, setSchouwingen] = React.useState<Schouwing[]>([]);
  const [isLoadingSchouwingen, setIsLoadingSchouwingen] = React.useState(false);
  
  const [selectedSchouwing, setSelectedSchouwing] = React.useState<Schouwing | null>(null);

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [mapStyle, setMapStyle] = React.useState('mapbox://styles/mapbox/streets-v12');
  
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedFeatures, setSelectedFeatures] = React.useState<any[]>([]);

  const mapRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (profile?.schouwenMapStyle) {
      setMapStyle(profile.schouwenMapStyle);
    }
  }, [profile]);

  const handleMapStyleChange = (newStyle: string) => {
    if (!user || !firestore) return;
    setMapStyle(newStyle);
    const userProfileRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userProfileRef, { schouwenMapStyle: newStyle });
  };

  React.useEffect(() => {
    const fetchProjects = async () => {
      if (!firestore) return;
      setIsLoadingProjects(true);
      const projectsCol = collection(firestore, 'projects');
      const projectSnapshot = await getDocs(projectsCol);
      const projectList = projectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projectList);
      setIsLoadingProjects(false);
    };
    fetchProjects();
  }, [firestore]);

  const fetchSchouwingen = React.useCallback(async () => {
    if (!firestore || !selectedProjectId) {
      setSchouwingen([]);
      return;
    }
    setIsLoadingSchouwingen(true);
    try {
      const q = query(collection(firestore, 'projects', selectedProjectId, 'schouwingen'));
      const querySnapshot = await getDocs(q);
      const schouwingenData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Schouwing));
      setSchouwingen(schouwingenData);
    } catch (error) {
      console.error("Fout bij ophalen inspecties:", error);
    } finally {
      setIsLoadingSchouwingen(false);
    }
  }, [firestore, selectedProjectId]);

  React.useEffect(() => {
    fetchSchouwingen();
  }, [fetchSchouwingen]);
  
  const handleToggleSelectionMode = () => {
    setIsSelectionMode(prev => {
      if (prev) { // if turning off
        setSelectedFeatures([]);
      }
      return !prev;
    });
  };

  const handleSaveSelection = () => {
    if (selectedFeatures.length === 0) {
      return;
    }
    const featureCollection = turf.featureCollection(selectedFeatures);
    const center = turf.centerOfMass(featureCollection);
    const [longitude, latitude] = center.geometry.coordinates;

    const newSchouwingData: Partial<Schouwing> = {
        latitude,
        longitude,
        gebieden: JSON.stringify(selectedFeatures)
    };

    setSelectedSchouwing(newSchouwingData as Schouwing);
    setIsDialogOpen(true);
    setIsSelectionMode(false);
  };

  const handleMapClick = (event: MapLayerMouseEvent) => {
    if (!isSelectionMode) {
      if (event.defaultPrevented) return;
      setSelectedSchouwing(null);
      return;
    }

    const map = mapRef.current?.getMap();
    if (!map) return;
    
    // Use a slightly larger bounding box to query features, increasing click tolerance
    const bbox: [[number, number], [number, number]] = [
      [event.point.x - 10, event.point.y - 10],
      [event.point.x + 10, event.point.y + 10]
    ];
    const features = map.queryRenderedFeatures(bbox);

    let selectableFeature: any | null = null;
    
    const polygons = features.filter(f => 
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    ) as turf.Feature<turf.Polygon | turf.MultiPolygon>[];

    const lines = features.filter(f => 
        f.geometry.type === 'LineString'
    ) as turf.Feature<turf.LineString>[];

    if (polygons.length > 0) {
        // Sort by area to pick the smallest (most specific) one
        polygons.sort((a, b) => turf.area(a) - turf.area(b));
        const smallestPolygonFeature = polygons[0];

        if (smallestPolygonFeature.geometry.type === 'MultiPolygon') {
            const clickPoint = turf.point([event.lngLat.lng, event.lngLat.lat]);
            for (const polyCoords of smallestPolygonFeature.geometry.coordinates) {
                const singlePolygon = turf.polygon(polyCoords);
                if (turf.booleanPointInPolygon(clickPoint, singlePolygon)) {
                    selectableFeature = {
                        type: 'Feature',
                        geometry: singlePolygon.geometry,
                        properties: smallestPolygonFeature.properties
                    };
                    break;
                }
            }
        } else {
            selectableFeature = smallestPolygonFeature;
        }
    } 
    else if (lines.length > 0) {
        const lineFeature = lines[0];
        try {
            // Buffer the line to make it a selectable area
            const buffered = turf.buffer(lineFeature, 2, { units: 'meters' });
            selectableFeature = {
                ...buffered,
                properties: { ...lineFeature.properties, original_geometry_type: 'LineString' },
            };
        } catch(e) {
            console.error("Error buffering line:", e);
            selectableFeature = null;
        }
    }

    // If a feature is found, add it to the selection. If not, do nothing.
    if (selectableFeature) {
      const featureId = JSON.stringify(selectableFeature.geometry);
      
      if (!selectableFeature.properties) selectableFeature.properties = {};
      selectableFeature.properties.customId = featureId;

      setSelectedFeatures(prev => {
        const isAlreadySelected = prev.some(f => f.properties.customId === featureId);
        if (isAlreadySelected) {
          return prev.filter(f => f.properties.customId !== featureId);
        } else {
          return [...prev, selectableFeature];
        }
      });
    }
  };

  const handleMarkerClick = (schouwing: Schouwing, event: mapboxgl.MapboxEvent) => {
    event.preventDefault();
    setSelectedSchouwing(schouwing);
  };
  
  const handleEditSchouwing = (schouwing: Schouwing) => {
    setSelectedSchouwing(schouwing);
    setIsDialogOpen(true);
  }

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const handleSuccess = () => {
      fetchSchouwingen();
      setSelectedSchouwing(null);
      setSelectedFeatures([]);
  }
  
  const selectedFeaturesGeoJSON = React.useMemo(() => ({
    type: 'FeatureCollection',
    features: selectedFeatures,
  }), [selectedFeatures]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <header className="absolute top-0 left-0 z-10 p-4 flex flex-col sm:flex-row gap-4 w-full items-start sm:items-center">
        <div className="flex gap-4 w-full sm:w-auto pointer-events-auto bg-card p-2 rounded-lg shadow-md">
            <Select onValueChange={setSelectedProjectId} disabled={isLoadingProjects}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Selecteer een project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.projectnaam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={handleMapStyleChange} value={mapStyle}>
              <SelectTrigger className="w-full sm:w-auto">
                <MapLayersIcon className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Kaartlaag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mapbox://styles/mapbox/streets-v12">Standaard</SelectItem>
                <SelectItem value="mapbox://styles/mapbox/satellite-streets-v12">Satelliet</SelectItem>
                <SelectItem value="mapbox://styles/mapbox/outdoors-v12">Terrein</SelectItem>
                <SelectItem value="mapbox://styles/mapbox/light-v11">Licht</SelectItem>
                <SelectItem value="mapbox://styles/mapbox/dark-v11">Donker</SelectItem>
              </SelectContent>
            </Select>
             {isSelectionMode ? (
              <div className='flex gap-2'>
                <Button onClick={handleSaveSelection} disabled={selectedFeatures.length === 0}>
                  <Check className="mr-2 h-4 w-4" />
                  Opslaan
                </Button>
                <Button variant="destructive" onClick={handleToggleSelectionMode}>
                  <X className="mr-2 h-4 w-4" />
                  Annuleren
                </Button>
              </div>
            ) : (
              <Button onClick={handleToggleSelectionMode} disabled={!selectedProjectId}>
                <Plus className="mr-2 h-4 w-4" />
                Nieuwe Schouwing
              </Button>
            )}
        </div>
      </header>

      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleMapClick}
        cursor={isSelectionMode ? 'pointer' : 'grab'}
      >
        {schouwingen.map((schouwing) => (
          <Marker
            key={schouwing.id}
            longitude={schouwing.longitude}
            latitude={schouwing.latitude}
            onClick={(e) => handleMarkerClick(schouwing, e)}
          >
            <div className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white cursor-pointer" />
          </Marker>
        ))}
        {selectedSchouwing && !isDialogOpen && (
          <Popup
              longitude={selectedSchouwing.longitude}
              latitude={selectedSchouwing.latitude}
              onClose={() => setSelectedSchouwing(null)}
              closeOnClick={false}
              anchor="top"
              className='min-w-64'
          >
              <div>
                  <h3 className="font-bold text-base mb-1">Schouwing {selectedSchouwing.id.slice(0, 6)}</h3>
                  <p>{selectedSchouwing.opmerkingen}</p>
                  <p className="text-sm mt-1">
                      <strong>Status:</strong> {selectedSchouwing.status}
                  </p>
                   <p className="text-xs text-muted-foreground mt-1">
                      Datum: {format(new Date(schouwingen.find(s => s.id === selectedSchouwing.id)?.datum || Date.now()), 'dd-MM-yyyy', { locale: nl })}
                  </p>
                  <Button size="sm" className="w-full mt-2" onClick={() => handleEditSchouwing(selectedSchouwing)}>Details</Button>
              </div>
          </Popup>
        )}
        
        {isSelectionMode && (
          <Source id="selected-areas" type="geojson" data={selectedFeaturesGeoJSON}>
            <Layer {...selectedAreasFillLayer} />
            <Layer {...selectedAreasOutlineLayer} />
          </Source>
        )}

      </MapGL>
      <SchouwDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={selectedProjectId}
        schouwing={selectedSchouwing}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
