'use server';

/**
 * @fileOverview AI flow voor het genereren van IoT-code met chat-historie en board-selectie.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const GenerateIoTCodeInputSchema = z.object({
  prompt: z.string().describe('De nieuwe vraag of aanpassing van de gebruiker.'),
  board: z.string().describe('Het geselecteerde hardware board (bijv. ESP32).'),
  history: z.array(MessageSchema).optional().describe('De eerdere berichten in het gesprek voor context.'),
  projectId: z.string().describe('Het Firebase Project ID.'),
  apiKey: z.string().describe('De Firebase API Key.'),
});
export type GenerateIoTCodeInput = z.infer<typeof GenerateIoTCodeInputSchema>;

const GenerateIoTCodeOutputSchema = z.object({
  code: z.string().describe('De volledige, aangepaste C++ code.'),
  explanation: z.string().describe('Uitleg over de gemaakte wijzigingen.'),
});
export type GenerateIoTCodeOutput = z.infer<typeof GenerateIoTCodeOutputSchema>;

export async function generateIoTCode(input: GenerateIoTCodeInput): Promise<GenerateIoTCodeOutput> {
  return generateIoTCodeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateIoTCodePrompt',
  input: { schema: GenerateIoTCodeInputSchema },
  output: { schema: GenerateIoTCodeOutputSchema },
  prompt: `Je bent een expert in IoT-ontwikkeling voor de boards: ESP32, ESP8266 en specifiek combinaties met GSM modules zoals de SIM800L. 
Je bent gespecialiseerd in integratie met Google Firebase via de REST API.

Huidig geselecteerd board/setup: {{{board}}}

CONTEXT VAN HET GESPREK:
{{#each history}}
- {{role}}: {{{content}}}
{{/each}}

NIEUWE VRAAG/AANPASSING:
"{{{prompt}}}"

INSTRUCTIES:
1. Genereer volledige, compileerbare Arduino C++ code voor de geselecteerde setup ({{{board}}}).
2. Als de setup SIM800L bevat, gebruik dan de TinyGSM bibliotheek voor de GPRS verbinding.
3. Gebruik de volgende gegevens voor Firebase integratie:
   - Project ID: {{{projectId}}}
   - API Key: {{{apiKey}}}
   - Firestore Base URL: https://firestore.googleapis.com/v1/projects/{{{projectId}}}/databases/(default)/documents/
4. Voor SIM800L setups: Zorg voor placeholders voor APN, user en password van de provider. Gebruik SoftwareSerial of HardwareSerial (bij voorkeur HardwareSerial op ESP32 pins 16/17).
5. Gebruik de PATCH methode met 'X-HTTP-Method-Override: PATCH' header voor Firestore updates.
6. Zorg voor duidelijke comments over de benodigde bibliotheken.

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
