'use server';
/**
 * @fileOverview AI flow voor het uitlezen van "Formulier melding / Klacht" PDF's.
 * Ondersteunt nu het extraheren van meerdere bonnen uit één enkel document.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const IssueSchema = z.object({
  intakenummer: z.string().optional(),
  containernummer: z.string().optional().describe('Uniek nummer van de container of afvalbak indien vermeld.'),
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
  meldingen: z.array(IssueSchema).describe('De lijst met alle unieke meldingen/bonnen die in het document zijn gevonden.'),
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
Een enkel document kan MEERDERE afzonderlijke meldingen of bonnen bevatten (vaak één per pagina of gescheiden door koppen).

INSTRUCTIE:
Scan het volledige document en identificeer ELKE unieke melding. Retourneer een lijst van alle gevonden meldingen.

{{#if instructions}}
STRIKTE VELD-SPECIFIEKE INSTRUCTIES VOOR DE LAYOUT:
{{{instructions}}}
{{/if}}

MAPPING BASISREGELS PER BON:
1. HEADER:
   - "Datum" (linksboven) -> datum (YYYY-MM-DD).
   - "Tijdstip" -> tijdstip (HH:mm).
   - "Intakenummer" -> intakenummer.
   - "Aangenomen door" -> behandelaar.
   - Eventueel "Containernummer" of "Baknummer" -> containernummer.

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
