'use server';

/**
 * @fileOverview AI flow voor het genereren van ESP32 IoT-code.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const GenerateIoTCodeInputSchema = z.object({
  prompt: z.string().describe('De specifieke wens of vraag van de gebruiker voor de ESP32 code.'),
  projectId: z.string().describe('Het Firebase Project ID.'),
  apiKey: z.string().describe('De Firebase API Key.'),
});
export type GenerateIoTCodeInput = z.infer<typeof GenerateIoTCodeInputSchema>;

const GenerateIoTCodeOutputSchema = z.object({
  code: z.string().describe('De gegenereerde C++ code voor de Arduino/ESP32 IDE.'),
  explanation: z.string().describe('Een korte uitleg over hoe de code werkt.'),
});
export type GenerateIoTCodeOutput = z.infer<typeof GenerateIoTCodeOutputSchema>;

export async function generateIoTCode(input: GenerateIoTCodeInput): Promise<GenerateIoTCodeOutput> {
  return generateIoTCodeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateIoTCodePrompt',
  input: { schema: GenerateIoTCodeInputSchema },
  output: { schema: GenerateIoTCodeOutputSchema },
  prompt: `Je bent een expert in IoT en ESP32 ontwikkeling, gespecialiseerd in de integratie met Google Firebase via de REST API.

Genereer volledige, compileerbare Arduino C++ code voor een ESP32 op basis van de volgende vraag:
"{{{prompt}}}"

Gebruik de volgende configuratiegegevens in de code:
- Project ID: {{{projectId}}}
- API Key: {{{apiKey}}}
- Firestore Base URL: https://firestore.googleapis.com/v1/projects/{{{projectId}}}/databases/(default)/documents/

Richtlijnen:
1. Gebruik altijd <WiFi.h> en <HTTPClient.h>.
2. Zorg voor duidelijke variabelen voor SSID en Wachtwoord (placeholder tekst).
3. Implementeer JSON payload opbouw.
4. Voeg seriële logging toe voor debugging.
5. Gebruik de PATCH methode voor Firestore updates.
6. Geef ook een korte uitleg over de benodigde bibliotheken of hardware-aansluitingen.

Antwoord in JSON formaat met de velden 'code' en 'explanation'.`,
});

export const generateIoTCodeFlow = ai.defineFlow(
  {
    name: 'generateIoTCodeFlow',
    inputSchema: GenerateIoTCodeInputSchema,
    outputSchema: GenerateIoTCodeOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) throw new Error('Geen code kunnen genereren.');
    return output;
  }
);
