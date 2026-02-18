'use server';
/**
 * @fileOverview AI flow voor het uitlezen van "Formulier melding / Klacht" PDF's.
 * Ondersteunt dynamische instructies van de Super User voor betere mapping.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseIssuePdfInputSchema = z.object({
  pdfDataUri: z
    .string()
    .describe(
      "De PDF van de melding als data URI. Verwacht formaat: 'data:application/pdf;base64,<encoded_data>'."
    ),
  instructions: z.string().optional().describe("Aanvullende instructies van de gebruiker over waar velden te vinden zijn."),
});
export type ParseIssuePdfInput = z.infer<typeof ParseIssuePdfInputSchema>;

const ParseIssuePdfOutputSchema = z.object({
  intakenummer: z.string().optional(),
  datum: z.string().optional().describe('Datum in YYYY-MM-DD formaat'),
  tijdstip: z.string().optional().describe('Tijd in HH:mm formaat'),
  melder: z.string().optional(),
  extern_meldingsnummer: z.string().optional(),
  behandelaar: z.string().optional().describe('Gekoppeld aan "Aangenomen door"'),
  label_1: z.string().optional().describe('Waarde bij "Soort melder" op PDF -> Wordt Hoofdindeling in de app.'),
  label_2: z.string().optional().describe('Waarde bij "Hoofdindeling" op PDF -> Wordt Indeling in de app.'),
  straatnaam: z.string().optional(),
  huisnummer: z.string().optional(),
  postcode: z.string().optional(),
  plaats: z.string().optional(),
  extra_informatie: z.string().optional(),
});
export type ParseIssuePdfOutput = z.infer<typeof ParseIssuePdfOutputSchema>;

export async function parseIssuePdf(input: ParseIssuePdfInput): Promise<ParseIssuePdfOutput> {
  return parseIssuePdfFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseIssuePdfPrompt',
  input: { schema: ParseIssuePdfInputSchema },
  output: { schema: ParseIssuePdfOutputSchema },
  prompt: `Je bent een expert in het verwerken van "Formulier melding / Klacht" documenten.
Gebruik de bijgevoegde PDF om alle gegevens te extraheren.

{{#if instructions}}
BELANGRIJKE GEBRUIKERSINSTRUCTIES VOOR DEZE PDF:
{{{instructions}}}
{{/if}}

STANDAARD MAPPING REGELS:
1. "Datum" en "Tijdstip" (linksboven) -> datum en tijdstip.
2. "Intakenummer" (rechtsboven) -> intakenummer.
3. "Aangenomen door" (rechtsboven) -> behandelaar.
4. "Melder" (linksboven) -> melder.
5. "Extern meldingsnummer" (rechtsboven) -> extern_meldingsnummer.

6. Categorie-indeling (CRUCIAAL):
   - Zoek naar het label "Soort melder". De waarde hierachter is label_1 (Hoofdindeling).
   - Zoek naar het label "Hoofdindeling" op de PDF. De waarde hierachter is label_2 (Indeling).
   - NB: Op veel formulieren staat de waarde voor de 'Indeling' direct onder de 'Hoofdindeling'.

7. "Adres" -> splits op in straatnaam en huisnummer.
8. "Postcode/Plaats" -> splits op in postcode en plaats.
9. "Extra informatie melding" -> extra_informatie.

PDF Bron: {{media url=pdfDataUri}}

INSTRUCTIES:
- Zet de datum om naar YYYY-MM-DD.
- Zet de tijd naar HH:mm.
- Wees zeer nauwkeurig met de labels (label_1, label_2). 
- Als een veld ontbreekt, laat het leeg.`,
});

export const parseIssuePdfFlow = ai.defineFlow(
  {
    name: 'parseIssuePdfFlow',
    inputSchema: ParseIssuePdfInputSchema,
    outputSchema: ParseIssuePdfOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    if (!output) throw new Error('Kon de PDF niet succesvol uitlezen.');
    return output;
  }
);
