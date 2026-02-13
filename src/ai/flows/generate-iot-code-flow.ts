'use server';

/**
 * @fileOverview AI flow voor het genereren van IoT-code met chat-historie en board-selectie.
 * Ondersteunt nu ook Heltec CubeCell v2 (LoRaWAN) en KPN Things integratie.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const GenerateIoTCodeInputSchema = z.object({
  prompt: z.string().describe('De nieuwe vraag of aanpassing van de gebruiker.'),
  board: z.string().describe('Het geselecteerde hardware board (bijv. ESP32 of Heltec CubeCell).'),
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
  prompt: `Je bent een expert in IoT-ontwikkeling voor de boards: ESP32, ESP8266 en specifiek de Heltec CubeCell v2 (LoRaWAN). 
Je bent gespecialiseerd in integratie met Google Firebase via de REST API en transport via LoRaWAN netwerken zoals KPN Things.

Huidig geselecteerd board/setup: {{{board}}}

CONTEXT VAN HET GESPREK:
{{#each history}}
- {{role}}: {{{content}}}
{{/each}}

NIEUWE VRAAG/AANPASSING:
"{{{prompt}}}"

INSTRUCTIES VOOR GENERATIE:
1. Genereer volledige, compileerbare Arduino C++ code voor de geselecteerde setup ({{{board}}}).
2. Voor Heltec CubeCell v2 (LoRaWAN):
   - Gebruik de officiële "LoRaWan_APP.h" bibliotheek.
   - Zorg voor placeholders voor DevEUI, AppEUI en AppKey (OTAA).
   - Implementeer deep-sleep logica om de batterij te sparen.
   - Leg uit dat de data via KPN Things moet worden doorgestuurd naar de Firebase REST API via een Webhook destination.
3. Voor WiFi/GSM setups:
   - Gebruik HTTPClient of TinyGSM.
   - Gebruik de PATCH methode met 'X-HTTP-Method-Override: PATCH' header voor Firestore updates.
4. Firebase Integratie Details:
   - Project ID: {{{projectId}}}
   - API Key: {{{apiKey}}}
   - Base URL: https://firestore.googleapis.com/v1/projects/{{{projectId}}}/databases/(default)/documents/sensors/[SENSOR_ID]?key={{{apiKey}}}

Antwoord in JSON formaat met de velden 'code' en 'explanation'. Zorg dat de explanation ook uitlegt hoe KPN Things moet worden ingesteld als er LoRaWAN wordt gebruikt.`,
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
