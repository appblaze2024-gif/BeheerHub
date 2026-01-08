'use server';
/**
 * @fileOverview Een Genkit flow voor het verwerken van CSV-bestanden met objectdata.
 *
 * - processCsv - Een functie die de inhoud van een CSV-bestand analyseert,
 *   omzet naar Object-entiteiten en opslaat in Firestore.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

// Input schema voor de flow: een string met de CSV-data.
const ProcessCsvInputSchema = z.string().describe('De volledige inhoud van het CSV-bestand als een enkele string.');

// Output schema voor de flow: een string met een samenvatting van de import.
const ProcessCsvOutputSchema = z.string().describe('Een samenvatting van het importproces, bijv. "X objecten succesvol verwerkt."');

// Definitie van een enkel object, gebaseerd op backend.json.
// De AI gebruikt dit schema om de data correct te structureren.
const ObjectSchema = z.object({
    id: z.string().describe("Unieke identifier voor het object. Als dit veld ontbreekt in een rij, gebruik de waarde 'N.B'."),
    latitude: z.number().optional().describe('De breedtegraad.'),
    longitude: z.number().optional().describe('De lengtegraad.'),
    locatieType: z.string().optional(),
    locatieSubType: z.string().optional(),
    kwaliteit: z.string().optional(),
    isActief: z.boolean().optional(),
    straatnaam: z.string().optional(),
    huisnummer: z.string().optional(),
    waarschuwing: z.string().optional(),
    vulgraad: z.number().optional(),
}).describe("Vertegenwoordigt een fysiek object in de wereld. Zorg ervoor dat velden zoals 'lat' of 'lon' worden gemapt naar 'latitude' en 'longitude'.");

// Schema voor de output van de LLM: een array van Objecten.
const LlmOutputSchema = z.array(ObjectSchema);

/**
 * Public-facing functie die de Genkit flow aanroept.
 * @param csvContent De inhoud van het CSV-bestand.
 * @returns Een belofte die wordt opgelost met een samenvattingsstring.
 */
export async function processCsv(csvContent: string): Promise<string> {
  return processCsvFlow(csvContent);
}

// Definitie van de Genkit prompt.
const csvProcessingPrompt = ai.definePrompt({
  name: 'csvProcessingPrompt',
  input: { schema: ProcessCsvInputSchema },
  output: { schema: LlmOutputSchema },
  prompt: `Je bent een expert in dataverwerking. Analyseer de volgende CSV-data. Converteer elke rij naar een JSON-object dat voldoet aan het 'Object' schema.
  
  Belangrijke instructies:
  1. Identificeer de header-rij om de kolommen te bepalen.
  2. Koppel de kolommen aan de velden van het Object-schema. Let op veelvoorkomende afkortingen zoals 'lat' voor 'latitude' en 'lon' voor 'longitude'.
  3. Als de waarde voor 'id' in een rij ontbreekt of leeg is, stel de 'id' in op de string "N.B".
  4. Converteer numerieke velden ('latitude', 'longitude', 'vulgraad') naar getallen. Als een waarde niet kan worden omgezet, laat het veld dan weg.
  5. Converteer booleaanse velden ('isActief') naar true/false.
  
  Hier is de CSV-data:
  
  {{{input}}}
  `,
  config: {
    // Verhoog de temperatuur een beetje voor flexibiliteit bij het parsen.
    temperature: 0.3,
  },
});


/**
 * De Genkit flow die de CSV-verwerking orkestreert.
 */
const processCsvFlow = ai.defineFlow(
  {
    name: 'processCsvFlow',
    inputSchema: ProcessCsvInputSchema,
    outputSchema: ProcessCsvOutputSchema,
  },
  async (csvContent) => {
    // Stap 1: Roep de LLM aan om de CSV te parsen naar een lijst van objecten.
    const { output } = await csvProcessingPrompt(csvContent);
    
    if (!output || output.length === 0) {
      throw new Error('De AI kon geen objecten uit het CSV-bestand extraheren.');
    }

    // Stap 2: Sla de objecten op in Firestore.
    // Omdat dit een server-side flow is, moeten we Firebase hier initialiseren.
    const { firestore } = initializeFirebase();
    const objectsCollectionRef = collection(firestore, 'objects');
    
    const batchSize = 500; // Firestore batch limit
    let processedCount = 0;

    for (let i = 0; i < output.length; i += batchSize) {
      const batch = writeBatch(firestore);
      const chunk = output.slice(i, i + batchSize);

      chunk.forEach(obj => {
        if (obj.id) {
          const docRef = doc(objectsCollectionRef, obj.id);
          // Gebruik set met merge: true om bestaande documenten bij te werken
          // en nieuwe documenten aan te maken.
          batch.set(docRef, obj, { merge: true });
          processedCount++;
        }
      });
      
      await batch.commit();
    }
    
    // Stap 3: Retourneer een succesbericht.
    return `${processedCount} objecten succesvol verwerkt en opgeslagen.`;
  }
);
