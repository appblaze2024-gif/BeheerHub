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

MAPPING REGELS OP BASIS VAN LAYOUT (Sjabloon focus):
1. HEADER GEGEVENS (Bovenste blok):
   - "Datum" (linksboven) -> datum (omzetten naar YYYY-MM-DD).
   - "Tijdstip" (linksboven) -> tijdstip (HH:mm:ss).
   - "Intakenummer" (rechtsboven) -> intakenummer.
   - "Aangenomen door" (rechtsboven) -> behandelaar.
   - "Melder" (linksboven) -> melder.
   - "Extern meldingsnummer" (rechtsboven) -> extern_meldingsnummer.

2. CATEGORIE SECTIE (Midden):
   - De waarde linksboven in het witte vlak (bv. "Zwerfvuil") is label_1 (Hoofdindeling).
   - De waarde direct daaronder (bv. "Beplanting") is label_2 (Indeling).
   - Negeer waarden aan de rechterkant (zoals "Straatreiniging") tenzij ze specifiek als sub-categorie worden genoemd.

3. LOCATIE BLOK:
   - "Adres" -> extract de straat en het huisnummer.
   - "Postcode/Plaats" -> extract de postcode (bv. 2134 AZ) en de plaats (bv. Hoofddorp).

4. INHOUD:
   - "Extra informatie melding" -> extra_informatie. Extraheer alle tekst die onder dit label staat tot aan de volgende horizontale lijn.

PDF Bron: {{media url=pdfDataUri}}

STRIKTE INSTRUCTIE:
- De waarde van "Soort melder" op het fysieke formulier moet naar Hoofdindeling (label_1).
- De waarde van "Hoofdindeling" op het fysieke formulier moet naar Indeling (label_2).
- Zet datums altijd om naar YYYY-MM-DD.`,
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