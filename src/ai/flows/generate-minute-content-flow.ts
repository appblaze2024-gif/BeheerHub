
'use server';
/**
 * @fileOverview AI flow voor het professioneel herschrijven van notulen per agenda-onderwerp.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateMinuteContentInputSchema = z.object({
  subjectTitle: z.string().describe('De titel van het agenda-onderwerp.'),
  rawKeywords: z.string().describe('De steekwoorden die de gebruiker heeft ingevoerd.'),
});
export type GenerateMinuteContentInput = z.infer<typeof GenerateMinuteContentInputSchema>;

const GenerateMinuteContentOutputSchema = z.object({
  polishedText: z.string().describe('De verbeterde, professionele tekst voor het verslag.'),
});
export type GenerateMinuteContentOutput = z.infer<typeof GenerateMinuteContentOutputSchema>;

const minutePrompt = ai.definePrompt({
  name: 'generateMinuteContentPrompt',
  input: { schema: GenerateMinuteContentInputSchema },
  output: { schema: GenerateMinuteContentOutputSchema },
  prompt: `Je bent een professionele verslaglegger voor infra- en reinigingsprojecten bij Meerlanden en Heemskerk.

TAAK:
Herschrijf de onderstaande steekwoorden naar een formeel en helder verslagtekstblok voor het specifieke agenda-onderwerp.

ONDERWERP: {{{subjectTitle}}}
STEEKWOORDEN:
{{{rawKeywords}}}

RICHTLIJNEN:
1. Gebruik zakelijk, maar toegankelijk Nederlands.
2. Schrijf in de verleden tijd of tegenwoordige tijd, afhankelijk van wat passend is voor een verslag.
3. Houd het beknopt en resultaatgericht.
4. Als er acties worden genoemd, verwerk deze dan vloeiend in de tekst.
5. Gebruik vaktermen die gebruikelijk zijn bij Meerlanden (bv. beeldbestek, schouwen, prullenbakkenroutes).

Antwoord alleen met de gepolijste tekst.`,
});

export const generateMinuteContentFlow = ai.defineFlow(
  {
    name: 'generateMinuteContentFlow',
    inputSchema: GenerateMinuteContentInputSchema,
    outputSchema: GenerateMinuteContentOutputSchema,
  },
  async input => {
    const { output } = await minutePrompt(input);
    if (!output) throw new Error('Kon geen tekst genereren.');
    return output;
  }
);

export async function generateMinuteContent(input: GenerateMinuteContentInput): Promise<GenerateMinuteContentOutput> {
  return generateMinuteContentFlow(input);
}
