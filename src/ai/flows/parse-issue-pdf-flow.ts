'use server';
/**
 * @fileOverview AI flow voor het uitlezen van "Formulier melding / Klacht" PDF's.
 * Geoptimaliseerd op basis van specifieke veldmapping instructies van de gebruiker.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseIssuePdfInputSchema = z.object({
  pdfDataUri: z
    .string()
    .describe(
      "De PDF van de melding als data URI. Verwacht formaat: 'data:application/pdf;base64,<encoded_data>'."
    ),
});
export type ParseIssuePdfInput = z.infer<typeof ParseIssuePdfInputSchema>;

const ParseIssuePdfOutputSchema = z.object({
  intakenummer: z.string().optional(),
  datum: z.string().optional().describe('Datum in YYYY-MM-DD formaat'),
  tijdstip: z.string().optional().describe('Tijd in HH:mm formaat'),
  melder: z.string().optional(),
  extern_meldingsnummer: z.string().optional(),
  behandelaar: z.string().optional().describe('Gekoppeld aan "Aangenomen door"'),
  label_1: z.string().optional().describe('Ingevuld bij "Soort melder" op PDF -> Wordt Hoofdindeling in de app.'),
  label_2: z.string().optional().describe('Ingevuld bij "Hoofdindeling" op PDF -> Wordt Indeling in de app.'),
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
Gebruik de bijgevoegde PDF om alle gegevens te extraheren volgens deze specifieke mapping:

1. "Datum" en "Tijdstip" (linksboven) -> datum en tijdstip.
2. "Intakenummer" (rechtsboven) -> intakenummer.
3. "Aangenomen door" (rechtsboven) -> behandelaar.
4. "Melder" (linksboven) -> melder.
5. "Extern meldingsnummer" (rechtsboven) -> extern_meldingsnummer.

6. Categorie-indeling (CRUCIAAL - KIJK GOED NAAR DE LABELS):
   - Zoek naar de tekst "Soort melder" op het formulier. De waarde hierachter/onder is label_1 (dit wordt de Hoofdindeling in de app).
   - Zoek naar de tekst "Hoofdindeling" op het formulier (deze staat fysiek direct ONDER de soort melder). De waarde hierachter/onder is label_2 (dit wordt de Indeling in de app).
   - Voorbeeld: Als er staat "Soort melder: Zwerfvuil" en daaronder "Hoofdindeling: Beplanting", dan is label_1 "Zwerfvuil" en label_2 "Beplanting".

7. "Adres" -> splits op in straatnaam en huisnummer.
8. "Postcode/Plaats" -> splits op in postcode en plaats.
9. "Extra informatie melding" -> extra_informatie.

PDF Bron: {{media url=pdfDataUri}}

INSTRUCTIES:
- Zet de datum om naar YYYY-MM-DD.
- Zet de tijd naar HH:mm.
- Wees zeer nauwkeurig met de labels (label_1, label_2). Sla geen categorieën over.
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
