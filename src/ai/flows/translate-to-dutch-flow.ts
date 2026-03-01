'use server';
/**
 * @fileOverview AI flow for translating or improving text to professional Dutch.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const TranslateInputSchema = z.object({
  text: z.string().describe('De tekst die vertaald of verbeterd moet worden.'),
});
export type TranslateInput = z.infer<typeof TranslateInputSchema>;

const TranslateOutputSchema = z.object({
  translatedText: z.string().describe('De tekst vertaald naar helder, zakelijk Nederlands.'),
});
export type TranslateOutput = z.infer<typeof TranslateOutputSchema>;

const translatePrompt = ai.definePrompt({
  name: 'translateToDutchPrompt',
  input: { schema: TranslateInputSchema },
  output: { schema: TranslateOutputSchema },
  prompt: `Je bent een professionele assistent voor beheerders van de openbare ruimte.
  
TAAK:
Vertaal de onderstaande tekst naar helder, zakelijk Nederlands. 
Als de tekst al in het Nederlands is, verbeter dan de spelling, grammatica en zorg voor een professionele toon.

TEKST:
{{{text}}}

Antwoord alleen met de vertaalde/verbeterde tekst in het 'translatedText' veld.`,
});

export const translateToDutchFlow = ai.defineFlow(
  {
    name: 'translateToDutchFlow',
    inputSchema: TranslateInputSchema,
    outputSchema: TranslateOutputSchema,
  },
  async input => {
    const { output } = await translatePrompt(input);
    if (!output) throw new Error('Kon tekst niet vertalen.');
    return output;
  }
);

export async function translateToDutch(text: string): Promise<TranslateOutput> {
  return translateToDutchFlow({ text });
}
