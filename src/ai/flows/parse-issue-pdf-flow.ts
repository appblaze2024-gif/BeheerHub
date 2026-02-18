'use server';
/**
 * @fileOverview AI flow voor het uitlezen van "Formulier melding / Klacht" PDF's.
 * Geoptimaliseerd op basis van de specifieke layout: Datum/Intakenummer boven,
 * Categorieën in het midden (Zwerfvuil/Beplanting), en Adres onderaan.
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
BELANGRIJKE GEBRUIKERSINSTRUCTIES VOOR DEZE PDF:
{{{instructions}}}
{{/if}}

MAPPING REGELS OP BASIS VAN LAYOUT:
1. HEADER GEGEVENS (Top):
   - "Datum" (linksboven) -> datum.
   - "Tijdstip" (linksboven) -> tijdstip.
   - "Intakenummer" (rechtsboven) -> intakenummer.
   - "Aangenomen door" (rechtsboven) -> behandelaar.
   - "Melder" (linksboven) -> melder.
   - "Extern meldingsnummer" (rechtsboven) -> extern_meldingsnummer.

2. CATEGORIE SECTIE (Midden):
   - De AI moet zoeken naar de teksten tussen de twee horizontale lijnen.
   - De waarde links (bv. "Zwerfvuil") is label_1 (Hoofdindeling).
   - De waarde direct daaronder (bv. "Beplanting") is label_2 (Indeling).
   - Negeer teksten aan de rechterkant zoals "Straatreiniging" tenzij ze expliciet als sub-categorie worden genoemd.

3. LOCATIE (Onder categorieën):
   - "Adres" -> split op in straatnaam en huisnummer.
   - "Postcode/Plaats" -> split op in postcode en plaats (bv. 2134 AZ | Hoofddorp).

4. INHOUD (Onder Adres):
   - "Extra informatie melding" -> extra_informatie. Extraheer alle tekst die hieronder staat.

PDF Bron: {{media url=pdfDataUri}}

INSTRUCTIES:
- Zet de datum om naar YYYY-MM-DD.
- Zet de tijd naar HH:mm (verwijder seconden).
- Wees zeer nauwkeurig met de teksten bij label_1 en label_2.
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