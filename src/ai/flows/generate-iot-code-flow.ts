'use server';

/**
 * @fileOverview Geoptimaliseerde AI flow voor IoT-code generatie.
 * Specifiek getraind op Heltec CubeCell HTCC-AB01 en de TOF10120 laser sensor.
 * Gebruikt CubeCell Board Library v1.4.0.
 *
 * - generateIoTCode - De hoofdfunctie voor het genereren van gecorrigeerde code.
 * - GenerateIoTCodeInput - Input type definitie.
 * - GenerateIoTCodeOutput - Output type definitie.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const GenerateIoTCodeInputSchema = z.object({
  prompt: z.string().describe('De foutmelding of gewenste aanpassing.'),
  board: z.string().describe('Hardware setup details.'),
  history: z.array(MessageSchema).optional().describe('Gesprekshistorie.'),
  projectId: z.string().describe('Firebase Project ID.'),
  apiKey: z.string().describe('Firebase API Key.'),
});
export type GenerateIoTCodeInput = z.infer<typeof GenerateIoTCodeInputSchema>;

const GenerateIoTCodeOutputSchema = z.object({
  code: z.string().describe('De gecorrigeerde C++ code.'),
  explanation: z.string().describe('Korte uitleg van de fix.'),
});
export type GenerateIoTCodeOutput = z.infer<typeof GenerateIoTCodeOutputSchema>;

const prompt = ai.definePrompt({
  name: 'generateIoTCodePrompt',
  input: { schema: GenerateIoTCodeInputSchema },
  output: { schema: GenerateIoTCodeOutputSchema },
  prompt: `Je bent een expert in LoRaWAN ontwikkeling voor de Heltec CubeCell HTCC-AB01 met Board Library v1.4.0.
Hardware: CubeCell HTCC-AB01 (HTTC-001).
Sensor: TOF10120 (I2C adres 0x52, Blauwe draad op SDA, Groene draad op SCL).

STRIKTE REGELS VOOR CODE GENERATIE (v1.4.0):
1. Gebruik ALTIJD "LoRaWan_APP.h" en <Wire.h>.
2. Gebruik ALTIJD LoRaWAN.init(loraWanClass, loraWanRegion). (Belangrijk: De bibliotheek v1.4.0 vereist deze specifieke volgorde!).
3. DevEUI is het unieke Chip ID (8 bytes).
4. Implementeer een compacte readTOF10120() functie:
   - Wire.beginTransmission(0x52); Wire.write(0x00); Wire.endTransmission();
   - Wacht 30ms; Wire.requestFrom(0x52, 2);
5. Zorg dat de code EXTREEM COMPACT is. Verwijder alle uitgebreide comments en onnodige witregels.
6. Gebruik de volgende credentials als placeholders:
   - Project ID: {{{projectId}}}
   - API Key: {{{apiKey}}}

HISTORIE:
{{#each history}}
- {{role}}: {{{content}}}
{{/each}}

VRAAG/FOUT:
"{{{prompt}}}"

Antwoord in JSON met 'code' (volledige compacte sketch) en 'explanation' (max 2 zinnen).`,
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

/**
 * Genereert gecorrigeerde IoT code op basis van een foutmelding of instructie.
 */
export async function generateIoTCode(input: GenerateIoTCodeInput): Promise<GenerateIoTCodeOutput> {
  return generateIoTCodeFlow(input);
}
