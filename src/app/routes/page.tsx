'use client';

import * as React from 'react';
import Map, { Layer, Source } from 'react-map-gl';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';
import { RoadTypeFilterDialog, roadLayerIds, allRoadTypes } from '@/components/road-type-filter-dialog';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export default function RoutesPage() {
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [selectedRoadTypes, setSelectedRoadTypes] = React.useState<string[]>(allRoadTypes);

  const initialViewState = {
    longitude: 5.2913,
    latitude: 52.1326,
    zoom: 7,
  };

  const roadFilter = React.useMemo(() => {
    if (selectedRoadTypes.length === allRoadTypes.length) {
      // If all are selected, no filter is needed. Return null.
      return null;
    }
    if (selectedRoadTypes.length === 0) {
      // If none are selected, create a filter that never matches.
      return ['==', ['get', 'class'], 'none'];
    }
    // 'in' operator checks if the value of 'class' property is in the selectedRoadTypes array.
    return ['in', ['get', 'class'], ['literal', selectedRoadTypes]];
  }, [selectedRoadTypes]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button onClick={() => setIsFilterOpen(true)} variant="default" size="lg">
          <Filter className="mr-2 h-5 w-5" />
          Filter Wegtypes
        </Button>
      </div>

      <RoadTypeFilterDialog
        open={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        selectedTypes={selectedRoadTypes}
        onSelectedTypesChange={setSelectedRoadTypes}
      />

      <Map
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        preserveDrawingBuffer={true}
      >
        {/* The Source component points to the vector tileset that contains road data */}
        <Source
          id="mapbox-streets"
          type="vector"
          url="mapbox://mapbox.mapbox-streets-v8"
        >
          {/* We render a Layer for each of the road types we want to control */}
          {roadLayerIds.map((layerId) => (
            <Layer
              key={layerId}
              id={layerId}
              type="line"
              source="mapbox-streets"
              source-layer={layerId} // This is important, it links the layer to the source's data layer
              paint={{
                'line-color': '#3887be',
                'line-width': 3,
                'line-opacity': 0.8,
              }}
              filter={roadFilter || undefined} // Apply the dynamic filter, ensuring it's not null
            />
          ))}
        </Source>
      </Map>
    </div>
  );
}
