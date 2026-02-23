'use server';

/**
 * @fileOverview Strikte AI flow voor Heltec CubeCell HTCC-AB01 (Library v1.4.0).
 * Ontvangt de huidige code en foutmelding om een compacte, werkende fix te genereren.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const GenerateIoTCodeInputSchema = z.object({
  prompt: z.string().describe('De foutmelding uit de Arduino IDE.'),
  currentCode: z.string().describe('De huidige code die de fout veroorzaakt.'),
  history: z.array(MessageSchema).optional().describe('Gesprekshistorie.'),
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
  prompt: `Je bent een expert in LoRaWAN ontwikkeling voor de Heltec CubeCell HTCC-AB01 (Library v1.4.0).

TAAK:
Herstel de fout in de huidige code op basis van de foutmelding. Houd de code COMPACT en gebruik STRIKT het v1.4.0 Framework.

STRIKTE REGELS:
1. Gebruik de opgegeven KPN credentials direct in de code:
   uint8_t devEui[] = { {{{devEui}}} };
   uint8_t appEui[] = { {{{appEui}}} };
   uint8_t appKey[] = { {{{appKey}}} };
2. De LoRaWAN.init MOET exact deze volgorde hebben: LoRaWAN.init(loraWanClass, loraWanRegion);
3. Gebruik ALTIJD de 'switch(deviceState)' machine in de loop().
4. Implementeer data-verzending in 'void prepareTxFrame(uint8_t port)'. Gebruik de diepte: {{{binDepthCm}}} cm.
5. Verwijder alle overbodige commentaren of herhalingen om de code kort te houden.
6. De TOF10120 sensor zit op I2C adres 0x52 (Blauw=SDA, Groen=SCL).

HUIDIGE CODE DIE DE FOUT GEEFT:
\`\`\`cpp
{{{currentCode}}}
\`\`\`

FOUTMELDING VAN ARDUINO IDE:
"{{{prompt}}}"

Antwoord met de VOLLEDIGE, gecorrigeerde sketch in het 'code' veld.`,
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
