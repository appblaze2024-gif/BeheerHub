'use server';
/**
 * @fileOverview A flow to generate an optimal route for a street sweeper using Mapbox Optimization API.
 *
 * - generateRoute - A function that takes a road network and returns an optimized route.
 * - GenerateRouteInput - The input type for the generateRoute function.
 * - GenerateRouteOutput - The return type for the generateRoute function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import * as turf from '@turf/turf';
import { decode } from '@mapbox/polyline';

const GenerateRouteInputSchema = z.object({
  roadNetworkGeoJson: z.string().describe(
    "A GeoJSON FeatureCollection of LineStrings representing the road network to be routed, as a JSON string."
  ),
});
export type GenerateRouteInput = z.infer<typeof GenerateRouteInputSchema>;


const GenerateRouteOutputSchema = z.object({
    route: z.array(z.array(z.number())).describe("An array of [longitude, latitude] coordinates representing the optimized route path."),
    totalDistance: z.number().describe("The total distance of the route in kilometers."),
    totalDuration: z.number().describe("The estimated total duration of the route in minutes, assuming an average speed."),
});
export type GenerateRouteOutput = z.infer<typeof GenerateRouteOutputSchema>;

// Main function to be called from the client
export async function generateRoute(input: GenerateRouteInput): Promise<GenerateRouteOutput> {
  return generateRouteFlow(input);
}


const generateRouteFlow = ai.defineFlow(
  {
    name: 'generateRouteFlow',
    inputSchema: GenerateRouteInputSchema,
    outputSchema: GenerateRouteOutputSchema,
  },
  async (input) => {
    const roadNetwork: turf.FeatureCollection<turf.LineString> = JSON.parse(input.roadNetworkGeoJson);
    
    if (!roadNetwork.features || roadNetwork.features.length === 0) {
      throw new Error("Input road network contains no features.");
    }

    // Mapbox Optimization API has a limit of 100 coordinates per request in this specific use case.
    // We will extract points from the linestrings to act as waypoints.
    // We'll aim for a maximum of 98 waypoints + start and end.
    const maxWaypoints = 98;
    const allCoords = roadNetwork.features.flatMap(feature => feature.geometry.coordinates);

    let waypoints = allCoords;

    // If we have too many coordinates, we need to simplify.
    // A simple strategy is to divide the total number of coords by the max waypoints
    // to get a sampling interval.
    if (allCoords.length > maxWaypoints) {
        waypoints = [];
        const totalLength = turf.length(roadNetwork, { units: 'meters' });
        const distancePerWaypoint = totalLength / maxWaypoints;
        
        roadNetwork.features.forEach(line => {
            const lineLength = turf.length(line, { units: 'meters' });
            const numPointsInLine = Math.max(1, Math.round(lineLength / distancePerWaypoint));
            
            for (let i = 0; i < numPointsInLine; i++) {
                const distance = (i / numPointsInLine) * lineLength;
                const point = turf.along(line, distance, { units: 'meters' });
                waypoints.push(point.geometry.coordinates);
            }
        });
    }

    if (waypoints.length < 2) {
      throw new Error("Not enough coordinates to generate a route.");
    }

    const startPoint = waypoints[0];

    const mapboxBody = {
        waypoints: waypoints.map(coord => ({
            coordinates: coord
        })),
        // Allows the API to decide the best start/end point among the waypoints
        source: 'any',
        destination: 'any',
        // We want the full route geometry
        steps: true,
        geometries: 'polyline6',
        overview: 'full'
    };

    const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
    if (!MAPBOX_ACCESS_TOKEN) {
        throw new Error("Mapbox access token is not configured in environment variables.");
    }
    
    const response = await fetch(`https://api.mapbox.com/optimized-trips/v2?access_token=${MAPBOX_ACCESS_TOKEN}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(mapboxBody)
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Mapbox API Error:", errorBody);
        throw new Error(`Mapbox API failed with status ${response.status}: ${errorBody.message}`);
    }

    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.trips || data.trips.length === 0) {
        throw new Error(`Route optimization failed: ${data.message}`);
    }

    const trip = data.trips[0];
    
    // The geometry is a polyline. We need to decode it.
    // The decoded format is [lat, lon], so we need to swap to [lon, lat]
    const decodedGeometry = decode(trip.geometry).map(coord => [coord[1], coord[0]]);

    return {
        route: decodedGeometry,
        totalDistance: trip.distance / 1000, // meters to km
        totalDuration: trip.duration / 60, // seconds to minutes
    };
  }
);
