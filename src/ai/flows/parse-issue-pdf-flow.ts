
'use server';
/**
 * @fileOverview AI flow voor het uitlezen van "Formulier melding / Klacht" documenten.
 * Geoptimaliseerd voor kosten door ondersteuning van zowel tekst als media (PDF/Beeld).
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
  paginanummer: z.number().optional().describe('Het exacte paginanummer in het brondocument waar deze specifieke bon is gevonden (startend bij 1).'),
});

const ParseIssuePdfInputSchema = z.object({
  pdfDataUri: z
    .string()
    .optional()
    .describe(
      "De PDF van de melding als data URI. Gebruik dit alleen als textContent niet beschikbaar is (voor scans)."
    ),
  textContent: z
    .string()
    .optional()
    .describe("De geëxtraheerde tekst uit de PDF. Dit is veel goedkoper om te verwerken."),
  instructions: z.string().optional().describe("Aanvullende veld-specifieke instructies van de gebruiker."),
});
export type ParseIssuePdfInput = z.infer<typeof ParseIssuePdfInputSchema>;

const ParseIssuePdfOutputSchema = z.object({
  meldingen: z.array(IssueSchema).describe('De lijst met alle unieke meldingen/bonnen die in het document zijn gevonden.'),
});
export type ParseIssuePdfOutput = z.infer<typeof ParseIssuePdfOutputSchema>;

const parsePrompt = ai.definePrompt({
  name: 'parseIssuePdfPrompt',
  input: { schema: ParseIssuePdfInputSchema },
  output: { schema: ParseIssuePdfOutputSchema },
  config: {
    model: 'googleai/gemini-1.5-flash',
  },
  prompt: `Je bent een expert in het verwerken van "Formulier melding / Klacht" documenten.
Een document kan MEERDERE afzonderlijke meldingen of bonnen bevatten.

INSTRUCTIE:
Scan de aangeleverde bron en identificeer ELKE unieke melding. Retourneer een lijst van alle gevonden meldingen.
Geef voor elke melding het paginanummer op indien mogelijk.

{{#if instructions}}
STRIKTE VELD-SPECIFIEKE INSTRUCTIES VOOR DE LAYOUT:
{{{instructions}}}
{{/if}}

MAPPING BASISREGELS PER BON:
1. HEADER: Datum, Tijdstip, Intakenummer, Aangenomen door (behandelaar), Containernummer.
2. CATEGORIE: label_1 (Hoofdindeling), label_2 (Indeling).
3. LOCATIE: Straat, Huisnummer, Postcode, Plaats.
4. INHOUD: Extra informatie melding.

BRON GEGEVENS:
{{#if textContent}}
TEKST INHOUD (GEËXTRAHEERD):
{{{textContent}}}
{{else}}
MULTIMODALE BRON (SCAN):
{{media url=pdfDataUri}}
{{/if}}`,
});

export const parseIssuePdfFlow = ai.defineFlow(
  {
    name: 'parseIssuePdfFlow',
    inputSchema: ParseIssuePdfInputSchema,
    outputSchema: ParseIssuePdfOutputSchema,
  },
  async input => {
    const { output } = await parsePrompt(input);
    if (!output) throw new Error('Kon de bron niet succesvol uitlezen.');
    return output;
  }
);

export async function parseIssuePdf(input: ParseIssuePdfInput): Promise<ParseIssuePdfOutput> {
  return parseIssuePdfFlow(input);
}
