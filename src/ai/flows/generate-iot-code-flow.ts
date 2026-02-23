'use server';

/**
 * @fileOverview Geoptimaliseerde AI flow voor IoT-code generatie.
 * Specifiek getraind op Heltec CubeCell HTCC-AB01 (Library v1.4.0) en de TOF10120 laser sensor.
 * Verwerkt direct KPN LoRaWAN sleutels in de code en volgt het verplichte state-machine patroon.
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
  devEui: z.string().describe('De Device EUI in hex format (0x00, 0x01...).'),
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

STRIKTE REGELS VOOR CODE GENERATIE (v1.4.0 Framework):
1. Gebruik ALTIJD "LoRaWan_APP.h" en <Wire.h>.
2. Gebruik EXACT deze volgorde: LoRaWAN.init(loraWanClass, loraWanRegion); (Eerst Class, dan Region).
3. Gebruik de volgende KPN credentials DIRECT in de arrays:
   - uint8_t devEui[] = { {{{devEui}}} };
   - uint8_t appEui[] = { {{{appEui}}} };
   - uint8_t appKey[] = { {{{appKey}}} };
4. Definieer ALTIJD deze globale variabelen (verplicht in v1.4.0 framework):
   - uint32_t appTxDutyCycle = 15000;
   - bool overTheAirActivation = true;
   - LoRaMacRegion_t loraWanRegion = ACTIVE_REGION;
   - DeviceClass_t loraWanClass = CLASS_A;
   - bool loraWanAdr = true;
   - bool keepNet = false;
   - bool isTxConfirmed = true;
   - uint8_t appPort = 2;
   - uint8_t confirmedNbTrials = 4;
5. Implementeer de TOF10120 uitlezing in een aparte functie readTOF().
6. De loop() MOET het switch(deviceState) patroon gebruiken.
7. Gebruik NOOIT BoardGetUniqueId voor de devEui, gebruik de hardcoded array met de waarde hierboven.
8. Genereer een VOLLEDIGE sketch met witregels en inspringingen die direct ge-copy-pasted kan worden.

HISTORIE:
{{#each history}}
- {{role}}: {{{content}}}
{{/each}}

VRAAG/FOUT:
"{{{prompt}}}"

Antwoord in JSON met 'code' (volledige sketch met enters) en 'explanation' (max 2 zinnen).`,
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
