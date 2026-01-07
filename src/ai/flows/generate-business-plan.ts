'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a business plan from a user prompt.
 *
 * It includes:
 * - `generateBusinessPlan`: An async function that takes a user prompt and returns a generated business plan.
 * - `BusinessPlanInput`: The input type for the `generateBusinessPlan` function, which is a simple string prompt.
 * - `BusinessPlanOutput`: The output type for the `generateBusinessPlan` function, which is the generated business plan as a string.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Define the input schema for the business plan prompt.
const BusinessPlanInputSchema = z.object({
  prompt: z.string().describe('A detailed prompt describing the business plan requirements.'),
});

export type BusinessPlanInput = z.infer<typeof BusinessPlanInputSchema>;

// Define the output schema for the generated business plan.
const BusinessPlanOutputSchema = z.object({
  businessPlan: z.string().describe('The generated business plan.'),
});

export type BusinessPlanOutput = z.infer<typeof BusinessPlanOutputSchema>;

// Exported function to generate the business plan.
export async function generateBusinessPlan(input: BusinessPlanInput): Promise<BusinessPlanOutput> {
  return generateBusinessPlanFlow(input);
}

// Define the prompt for generating the business plan.
const businessPlanPrompt = ai.definePrompt({
  name: 'businessPlanPrompt',
  input: {schema: BusinessPlanInputSchema},
  output: {schema: BusinessPlanOutputSchema},
  prompt: `You are an expert business consultant. Generate a comprehensive business plan based on the following user prompt:\n\n{{{prompt}}}`,
});

// Define the Genkit flow for generating the business plan.
const generateBusinessPlanFlow = ai.defineFlow(
  {
    name: 'generateBusinessPlanFlow',
    inputSchema: BusinessPlanInputSchema,
    outputSchema: BusinessPlanOutputSchema,
  },
  async input => {
    const {output} = await businessPlanPrompt(input);
    return output!;
  }
);
