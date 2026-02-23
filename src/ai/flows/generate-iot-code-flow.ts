'use server';

/**
 * @fileOverview Geoptimaliseerde AI flow voor IoT-code generatie.
 * Specifiek getraind op Heltec CubeCell HTCC-AB01 (Library v1.4.0) en de TOF10120 laser sensor.
 * Verwerkt direct KPN LoRaWAN sleutels in de code.
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
  devEui: z.string().describe('De Device EUI in hex format.'),
  appEui: z.string().describe('De App EUI in hex format.'),
  appKey: z.string().describe('De App Key in hex format.'),
  binDepthCm: z.number().optional().describe('De diepte van de prullenbak in cm.'),
});
export type GenerateIoTCodeInput = z.infer<typeof GenerateIoTCodeInputSchema>;

const GenerateIoTCodeOutputSchema = z.object({
  code: z.string().describe('De volledige, gecorrigeerde C++ code.'),
  explanation: z.string().describe('Korte uitleg van de fix.'),
});
export type GenerateIoTCodeOutput = z.infer<typeof GenerateIoTCodeOutputSchema>;

const prompt = ai.definePrompt({
  name: 'generateIoTCodePrompt',
  input: { schema: GenerateIoTCodeInputSchema },
  output: { schema: GenerateIoTCodeOutputSchema },
  prompt: `Je bent een expert in LoRaWAN ontwikkeling voor de Heltec CubeCell HTCC-AB01 met Board Library v1.4.0.
Hardware: CubeCell HTCC-AB01.
Sensor: TOF10120 (Blauw op SDA, Groen op SCL).

STRIKTE REGELS VOOR CODE GENERATIE (v1.4.0):
1. Gebruik ALTIJD "LoRaWan_APP.h" en <Wire.h>.
2. Gebruik ALTIJD exact deze volgorde: LoRaWAN.init(loraWanClass, loraWanRegion).
3. Gebruik de volgende KPN credentials DIRECT in de arrays (geen BoardGetUniqueId gebruiken):
   - uint8_t devEui[] = { {{{devEui}}} };
   - uint8_t appEui[] = { {{{appEui}}} };
   - uint8_t appKey[] = { {{{appKey}}} };
4. Implementeer de TOF10120 uitlezing:
   - Wire.beginTransmission(0x52); Wire.write(0x00); Wire.endTransmission();
   - delay(30); Wire.requestFrom(0x52, 2);
5. Gebruik de bakdiepte van {{{binDepthCm}}} cm voor de percentageberekening.
6. De code moet EXTREEM COMPACT zijn. Geen lange comments.
7. Gebruik ALTIJD standaard C++ opmaak met NIEUWE REGELS (enters) na elke instructie en puntkomma. 
8. Genereer een VOLLEDIGE nieuwe sketch die direct ge-copy-pasted kan worden.

HISTORIE:
{{#each history}}
- {{role}}: {{{content}}}
{{/each}}

VRAAG/FOUT:
"{{{prompt}}}"

Antwoord in JSON met 'code' (volledige sketch metenters) en 'explanation' (max 2 zinnen).`,
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
 * Wrapper functie voor de IoT code generatie flow.
 */
export async function generateIoTCode(input: GenerateIoTCodeInput): Promise<GenerateIoTCodeOutput> {
  return generateIoTCodeFlow(input);
}
