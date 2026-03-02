'use server';
/**
 * @fileOverview AI flow for translating text between specified languages.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const TranslateInputSchema = z.object({
  text: z.string().describe('The text to be translated.'),
  targetLanguage: z.string().describe('The target language (e.g., "Dutch", "English", "Polish", "German", "Hungarian", "Ukrainian").'),
});
export type TranslateInput = z.infer<typeof TranslateInputSchema>;

const TranslateOutputSchema = z.object({
  translatedText: z.string().describe('The translated text.'),
});
export type TranslateOutput = z.infer<typeof TranslateOutputSchema>;

const translatePrompt = ai.definePrompt({
  name: 'translateTextPrompt',
  input: { schema: TranslateInputSchema },
  output: { schema: TranslateOutputSchema },
  prompt: `You are a professional translator for public space management professionals.
  
TASK:
Translate the following text to {{{targetLanguage}}}. 
Ensure the tone is professional, clear, and business-like.
If the text is already in the target language, just improve the grammar, spelling and formal tone.

TEXT:
{{{text}}}

Answer only with the translated/improved text in the 'translatedText' field.`,
});

export const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateInputSchema,
    outputSchema: TranslateOutputSchema,
  },
  async input => {
    const { output } = await translatePrompt(input);
    if (!output) throw new Error('Could not translate text.');
    return output;
  }
);

export async function translateText(text: string, targetLanguage: string): Promise<TranslateOutput> {
  return translateTextFlow({ text, targetLanguage });
}
