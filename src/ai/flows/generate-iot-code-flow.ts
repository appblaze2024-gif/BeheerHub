'use server';

/**
 * @fileOverview AI flow voor het genereren van IoT-code met chat-historie en board-selectie.
 * Ondersteunt nu specifiek de Heltec CubeCell HTCC-AB01 (HTTC-001) en de TOF10120 sensor.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const GenerateIoTCodeInputSchema = z.object({
  prompt: z.string().describe('De nieuwe vraag of aanpassing van de gebruiker.'),
  board: z.string().describe('Het geselecteerde hardware board (bijv. ESP32 of Heltec CubeCell HTCC-AB01).'),
  history: z.array(MessageSchema).optional().describe('De eerdere berichten in het gesprek voor context.'),
  projectId: z.string().describe('Het Firebase Project ID.'),
  apiKey: z.string().describe('De Firebase API Key.'),
});
export type GenerateIoTCodeInput = z.infer<typeof GenerateIoTCodeInputSchema>;

const GenerateIoTCodeOutputSchema = z.object({
  code: z.string().describe('De volledige, aangepaste C++ code.'),
  explanation: z.string().describe('Uitleg over de gemaakte wijzigingen en setup-instructies.'),
});
export type GenerateIoTCodeOutput = z.infer<typeof GenerateIoTCodeOutputSchema>;

export async function generateIoTCode(input: GenerateIoTCodeInput): Promise<GenerateIoTCodeOutput> {
  return generateIoTCodeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateIoTCodePrompt',
  input: { schema: GenerateIoTCodeInputSchema },
  output: { schema: GenerateIoTCodeOutputSchema },
  prompt: `Je bent een expert in IoT-ontwikkeling voor de boards: ESP32, ESP8266 en specifiek de Heltec CubeCell HTCC-AB01 (HTTC-001). 
Je bent gespecialiseerd in integratie met Google Firebase via de REST API en transport via LoRaWAN (KPN Things).

Huidig geselecteerd board/setup: {{{board}}}
Standaard sensor: TOF10120 (I2C adres 0x52).

BELANGRIJK: De Heltec CubeCell HTCC-AB01 heeft GEEN MAC-adres. Het gebruikt een uniek Chip ID voor de DevEUI.
I2C PINS: Voor de HTCC-AB01, gebruik de fysiek gemarkeerde SDA en SCL pinnen op het board. Initialiseer met Wire.begin() zonder parameters.

CONTEXT VAN HET GESPREK:
{{#each history}}
- {{role}}: {{{content}}}
{{/each}}

NIEUWE VRAAG/AANPASSING:
"{{{prompt}}}"

INSTRUCTIES VOOR GENERATIE:
1. Genereer volledige, compileerbare Arduino C++ code voor de geselecteerde setup ({{{board}}}).
2. Voor Heltec CubeCell HTCC-AB01 (LoRaWAN):
   - Gebruik de officiële "LoRaWan_APP.h" bibliotheek.
   - Implementeer I2C communicatie voor de TOF10120 sensor (lezen van 2 bytes vanaf register 0x00 op adres 0x52).
   - Gebruik Wire.begin() voor de gemarkeerde SDA/SCL pinnen.
   - Zorg voor placeholders voor DevEUI (Chip ID), AppEUI en AppKey (OTAA).
   - Implementeer deep-sleep logica om de batterij te sparen tussen metingen door.
   - Leg uit dat de data via KPN Things moet worden doorgestuurd naar de Firebase REST API via een Webhook.
3. Voor WiFi setups:
   - Gebruik HTTPClient.
   - Gebruik de PATCH methode met 'X-HTTP-Method-Override: PATCH' header voor Firestore updates.
4. Firebase Integratie Details:
   - Project ID: {{{projectId}}}
   - API Key: {{{apiKey}}}

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
