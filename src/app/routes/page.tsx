'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { allRoadTypes, roadColorMapping } from '@/components/road-type-filter-dialog';
import { List } from 'lucide-react';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const mapRef = React.useRef<any>(null);
  const [selectedRoadTypes, setSelectedRoadTypes] = React.useState<string[]>(Object.keys(roadColorMapping));
  const [isFilterPanelOpen, setIsFilterPanelOpen] = React.useState(true);
  
  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const handleCheckedChange = (type: string, checked: boolean) => {
    const newSelectedTypes = checked
      ? [...selectedRoadTypes, type]
      : selectedRoadTypes.filter((t) => t !== type);
    setSelectedRoadTypes(newSelectedTypes);
  };

  const handleSelectAll = () => {
    setSelectedRoadTypes(Object.keys(roadColorMapping));
  };

  const handleDeselectAll = () => {
    setSelectedRoadTypes([]);
  };

  const sortedRoadTypes = React.useMemo(() => {
    return Object.keys(roadColorMapping).sort((a, b) => {
      const nameA = allRoadTypes[a] || a;
      const nameB = allRoadTypes[b] || b;
      return nameA.localeCompare(nameB);
    });
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
        <div className="absolute top-4 left-4 z-10">
          {!isFilterPanelOpen && (
             <Button size="icon" onClick={() => setIsFilterPanelOpen(true)}>
                <List className="h-5 w-5" />
             </Button>
          )}
          <Card className={isFilterPanelOpen ? 'w-80 shadow-lg' : 'hidden'}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Wegtypes</CardTitle>
                 <Button variant="ghost" size="sm" onClick={() => setIsFilterPanelOpen(false)}>
                    Sluiten
                </Button>
            </CardHeader>
            <CardContent>
                <div className="flex gap-2 mb-4">
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleSelectAll}>Alles</Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleDeselectAll}>Niets</Button>
                </div>
                 <ScrollArea className="h-96">
                    <div className="space-y-3 pr-4">
                        {sortedRoadTypes.map((type) => (
                        <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                                id={`type-${type}`}
                                checked={selectedRoadTypes.includes(type)}
                                onCheckedChange={(checked) => handleCheckedChange(type, !!checked)}
                                style={{ color: roadColorMapping[type] }}
                            />
                            <Label htmlFor={`type-${type}`} className="font-normal capitalize flex items-center gap-2">
                               <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: roadColorMapping[type]}} />
                               {allRoadTypes[type] || type.replace(/_/g, ' ')}
                            </Label>
                        </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
          </Card>
        </div>
        
        <Map
            ref={mapRef}
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/light-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
        >
        {Object.entries(roadColorMapping).map(([roadClass, color]) => (
            <Layer
                key={roadClass}
                id={`road-layer-${roadClass}`}
                type="line"
                source="composite"
                source-layer="road"
                filter={['==', 'class', roadClass]}
                layout={{
                    'line-join': 'round',
                    'line-cap': 'round',
                    'visibility': selectedRoadTypes.includes(roadClass) ? 'visible' : 'none',
                }}
                paint={{
                    'line-color': color,
                    'line-width': 3,
                    'line-opacity': 0.8,
                }}
            />
        ))}
        </Map>
    </div>
  );
}
