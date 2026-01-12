'use server';
/**
 * @fileOverview A flow to generate an optimal route for a street sweeper.
 *
 * - generateRoute - A function that takes a road network and returns an optimized route.
 * - GenerateRouteInput - The input type for the generateRoute function.
 * - GenerateRouteOutput - The return type for the generateRoute function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import * as turf from '@turf/turf';

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

const prompt = ai.definePrompt({
  name: 'generateSweeperRoutePrompt',
  input: { schema: GenerateRouteInputSchema },
  output: { schema: GenerateRouteOutputSchema },
  prompt: `You are a logistics and route optimization expert for municipal services.
Your task is to create the most efficient route for a street sweeper to cover all the provided road segments.

The input is a GeoJSON FeatureCollection of LineStrings. These LineStrings represent all the roads that must be visited.

Your goal is to generate a single, continuous path that traverses every LineString. The path should minimize turns and redundant travel. The route should start at the first coordinate of the first LineString in the input.

Analyze the road network and determine the optimal order to visit each coordinate. The final output should be a single array of coordinates forming a continuous LineString.

Based on the generated route, also calculate:
1.  'totalDistance': The total length of the route in kilometers.
2.  'totalDuration': The estimated time to complete the route in minutes. Assume an average sweeper speed of 8 km/h.

Return the result in the specified JSON format.

Road Network:
{{{roadNetworkGeoJson}}}
`,
});

const generateRouteFlow = ai.defineFlow(
  {
    name: 'generateRouteFlow',
    inputSchema: GenerateRouteInputSchema,
    outputSchema: GenerateRouteOutputSchema,
  },
  async (input) => {
    // In a real application, you would replace this with a call to a proper routing engine
    // like Mapbox Optimization API, Google OR-Tools, or another TSP/VRP solver.
    // The LLM is used here as a placeholder to simulate the optimization logic.

    const { output } = await prompt(input);
    return output!;
  }
);
