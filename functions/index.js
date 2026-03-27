
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

// Initialiseer de Admin SDK om toegang te krijgen tot Firestore
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * webhookHandler - Verwerkt inkomende meldingen van externe partners.
 * 
 * Verwacht een POST request met:
 * Header: X-API-KEY = GEO-PRO-2026-BETA
 * Body: JSON object met verkorte velden (INT, HFDCAT, SUBCAT, LAT, LON, STR, HNR, PLA, DTM)
 */
exports.webhookHandler = onRequest({ cors: true }, async (req, res) => {
  // Gebruik de CORS wrapper voor cross-origin requests (handig voor testen)
  cors(req, res, async () => {
    
    // 1. Authenticatie Controle
    const apiKey = req.get('X-API-KEY');
    const VALID_API_KEY = 'GEO-PRO-2026-BETA'; // Dit kan later in config/env worden gezet

    if (apiKey !== VALID_API_KEY) {
      console.warn('Ongeautoriseerde toegangspoging gedetecteerd.');
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Ongeldige API Key. Toegang geweigerd.' 
      });
    }

    // 2. Methode Controle (Alleen POST toegestaan)
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method Not Allowed', 
        message: 'Gebruik de POST methode om meldingen in te schieten.' 
      });
    }

    try {
      const body = req.body;

      // 3. Destructuring van de inkomende data
      const { 
        INT,    // Innamenummer
        HFDCAT, // Hoofdcategorie
        SUBCAT, // Subcategorie
        LAT,    // Latitude
        LON,    // Longitude
        STR,    // Straat
        HNR,    // Huisnummer
        PLA,    // Plaats
        DTM     // Datum/Tijd
      } = body;

      // 4. Validatie van kritieke velden (Coördinaten)
      const latNum = parseFloat(LAT);
      const lonNum = parseFloat(LON);

      if (isNaN(latNum) || isNaN(lonNum)) {
        console.error('Validatiefout: LAT of LON is geen geldig getal.', { LAT, LON });
        return res.status(400).json({
          status: "error",
          message: "Ongeldige of ontbrekende coördinaten (LAT/LON zijn verplicht)."
        });
      }

      // 5. Mapping naar de doelspecificatie (GeoBeheer / BeheerHub formaat)
      const mappedData = {
        Innamenummer: INT ? String(INT) : "N.B.",
        Hoofdcategorie: HFDCAT ? String(HFDCAT) : "Overig",
        Subcategorie: SUBCAT ? String(SUBCAT) : "N.v.t.",
        Latitude: latNum,
        Longitude: lonNum,
        Straat: STR ? String(STR) : "",
        Huisnummer: HNR ? String(HNR) : "",
        Plaats: PLA ? String(PLA) : "",
        "Datum/Tijd": DTM ? String(DTM) : new Date().toISOString(),
        // Voeg server-side timestamp toe
        server_timestamp: admin.firestore.FieldValue.serverTimestamp()
      };

      // 6. Opslaan in de Firestore collectie 'api_meldingen'
      const docRef = await admin.firestore().collection('api_meldingen').add(mappedData);
      
      console.log(`Melding succesvol opgeslagen met ID: ${docRef.id}`);

      // 7. Succes Terugkoppeling
      return res.status(200).json({
        status: "success",
        message: "Melding ontvangen en opgeslagen in GeoBeheer",
        id: docRef.id
      });

    } catch (error) {
      console.error('Kritieke fout in webhookHandler:', error);
      return res.status(400).json({
        status: "error",
        message: error.message || "Er is een fout opgetreden bij het verwerken van de melding."
      });
    }
  });
});
