'use server';

/**
 * @fileOverview Geoptimaliseerde AI flow voor IoT-code generatie.
 * Specifiek getraind op Heltec CubeCell HTCC-AB01 (Library v1.4.0) en de TOF10120 laser sensor.
 * Gebruikt het officiële Heltec Framework patroon voor maximale compabiliteit.
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
Sensor: TOF10120 Laser (Blauw op SDA, Groen op SCL).

STRIKTE REGELS VOOR CODE GENERATIE (V1.4.0 Framework):
1. Gebruik ALTIJD "LoRaWan_APP.h" en <Wire.h>.
2. Gebruik EXACT dit sjabloon voor de credentials:
   - uint8_t devEui[] = { {{{devEui}}} };
   - uint8_t appEui[] = { {{{appEui}}} };
   - uint8_t appKey[] = { {{{appKey}}} };
3. Definieer ALTIJD deze verplichte globale variabelen:
   - uint16_t userChannelsMask[6] = { 0x00FF, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000 };
   - uint32_t appTxDutyCycle = 15000;
   - bool overTheAirActivation = true;
   - LoRaMacRegion_t loraWanRegion = ACTIVE_REGION;
   - DeviceClass_t loraWanClass = CLASS_A;
   - bool loraWanAdr = true;
   - bool keepNet = false;
   - bool isTxConfirmed = true;
   - uint8_t appPort = 2;
   - uint8_t confirmedNbTrials = 4;
4. Implementeer readTOF() voor de TOF10120 (I2C adres 0x52).
5. Gebruik de functie 'prepareTxFrame(uint8_t port)' om appData en appDataSize te vullen.
6. De loop() MOET de verplichte 'switch(deviceState)' state machine gebruiken.
7. setup() MOET 'boardInitMcu()', 'Serial.begin(115200)', 'Wire.begin()' en 'LoRaWAN.init(loraWanClass, loraWanRegion)' bevatten.

VRAAG/FOUT:
"{{{prompt}}}"

HISTORIE:
{{#each history}}
- {{role}}: {{{content}}}
{{/each}}

Antwoord in JSON met 'code' (volledige sketch met enters en inspringingen) en 'explanation' (max 2 zinnen).`,
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

export async function generateIoTCode(input: GenerateIoTCodeInput): Promise<GenerateIoTCodeOutput> {
  return generateIoTCodeFlow(input);
}
