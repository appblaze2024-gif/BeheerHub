'use server';
/**
 * @fileOverview AI flow voor het uitlezen van "Formulier melding / Klacht" PDF's.
 * Geoptimaliseerd op basis van de specifieke layout en aangepaste instructies.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseIssuePdfInputSchema = z.object({
  pdfDataUri: z
    .string()
    .describe(
      "De PDF van de melding als data URI. Verwacht formaat: 'data:application/pdf;base64,<encoded_data>'."
    ),
  instructions: z.string().optional().describe("Aanvullende veld-specifieke instructies van de gebruiker."),
});
export type ParseIssuePdfInput = z.infer<typeof ParseIssuePdfInputSchema>;

const ParseIssuePdfOutputSchema = z.object({
  intakenummer: z.string().optional(),
  datum: z.string().optional().describe('Datum in YYYY-MM-DD formaat'),
  tijdstip: z.string().optional().describe('Tijd in HH:mm formaat'),
  melder: z.string().optional(),
  extern_meldingsnummer: z.string().optional(),
  behandelaar: z.string().optional().describe('Gekoppeld aan "Aangenomen door"'),
  label_1: z.string().optional().describe('Eerste categoriewaarde (bv. Zwerfvuil) -> Hoofdindeling.'),
  label_2: z.string().optional().describe('Tweede categoriewaarde (bv. Beplanting) -> Indeling.'),
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
  prompt: `Je bent een expert in het verwerken van het "Formulier melding / Klacht" document.
Gebruik de visuele layout van de bijgevoegde PDF om de gegevens exact te extraheren.

{{#if instructions}}
STRIKTE VELD-SPECIFIEKE INSTRUCTIES VOOR DEZE LAYOUT:
{{{instructions}}}
{{/if}}

MAPPING BASISREGELS (indien niet overschreven door instructies):
1. HEADER:
   - "Datum" (linksboven) -> datum (YYYY-MM-DD).
   - "Tijdstip" -> tijdstip (HH:mm).
   - "Intakenummer" -> intakenummer.
   - "Aangenomen door" -> behandelaar.

2. CATEGORIE (Midden):
   - De waarde linksboven in het witte categorievlak is label_1 (Hoofdindeling).
   - De waarde direct daaronder is label_2 (Indeling).

3. LOCATIE:
   - "Adres" -> extract de straat en het huisnummer.
   - "Postcode/Plaats" -> extract postcode en plaats.

4. INHOUD:
   - "Extra informatie melding" -> extra_informatie.

PDF Bron: {{media url=pdfDataUri}}`,
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
