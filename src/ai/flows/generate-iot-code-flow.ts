'use server';

/**
 * @fileOverview Geoptimaliseerde AI flow voor IoT-code generatie.
 * Specifiek getraind op Heltec CubeCell HTCC-AB01 en de TOF10120 laser sensor.
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
  prompt: `Je bent een expert in LoRaWAN ontwikkeling voor de Heltec CubeCell HTCC-AB01.
Hardware: CubeCell HTCC-AB01 (HTTC-001).
Sensor: TOF10120 (I2C adres 0x52, SDA/SCL pinnen).

STRIKTE REGELS VOOR CODE GENERATIE:
1. Gebruik ALTIJD "LoRaWan_APP.h".
2. Gebruik ALTIJD LoRaWAN.init(loraWanClass, loraWanRegion) - NOOIT andersom!
3. DevEUI is het unieke Chip ID (8 bytes).
4. Implementeer een compacte readTOF10120() functie:
   - Wire.beginTransmission(0x52); Wire.write(0x00); Wire.endTransmission();
   - Wacht 30ms; Wire.requestFrom(0x52, 2);
5. Zorg dat de code COMPACT is. Verwijder uitgebreide comments.
6. Gebruik de volgende credentials als placeholders indien niet aanwezig in de context:
   - Project ID: {{{projectId}}}
   - API Key: {{{apiKey}}}

HISTORIE:
{{#each history}}
- {{role}}: {{{content}}}
{{/each}}

VRAAG/FOUT:
"{{{prompt}}}"

Antwoord in JSON met 'code' (volledige sketch) en 'explanation' (max 2 zinnen).`,
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
