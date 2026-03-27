
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

// Initialiseer de Admin SDK om toegang te krijgen tot Firestore
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * webhookHandler - Verwerkt inkomende meldingen van externe partners of interne sync.
 * 
 * Ondersteunt nu zowel een enkel object als een array van objecten (batch sync).
 */
exports.webhookHandler = onRequest({ cors: true }, async (req, res) => {
  cors(req, res, async () => {
    
    // 1. Authenticatie Controle
    const apiKey = req.get('X-API-KEY');
    const VALID_API_KEY = 'GEO-PRO-2026-BETA';

    if (apiKey !== VALID_API_KEY) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Ongeldige API Key.' 
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      const payload = req.body;
      // Zorg dat we altijd met een array werken
      const items = Array.isArray(payload) ? payload : [payload];
      
      if (items.length === 0) {
        return res.status(400).json({ error: "Geen data ontvangen." });
      }

      const db = admin.firestore();
      const batch = db.batch();
      const processedIds = [];

      for (const item of items) {
        const { 
          INT, HFDCAT, SUBCAT, LAT, LON, STR, HNR, PLA, DTM 
        } = item;

        const latNum = parseFloat(LAT);
        const lonNum = parseFloat(LON);

        // Validatie van coördinaten
        if (isNaN(latNum) || isNaN(lonNum)) {
          return res.status(400).json({ 
            error: "Missing Location Data (LAT/LON)",
            message: `Melding ${INT || 'onbekend'} mist geldige coördinaten.`,
            received: { LAT, LON }
          });
        }

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
          server_timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const newDocRef = db.collection('api_meldingen').doc();
        batch.set(newDocRef, mappedData);
        processedIds.push(newDocRef.id);
      }

      await batch.commit();

      return res.status(200).json({
        status: "success",
        message: `${processedIds.length} melding(en) succesvol opgeslagen.`,
        ids: processedIds
      });

    } catch (error) {
      console.error('Fout in webhookHandler:', error);
      return res.status(500).json({
        status: "error",
        message: error.message
      });
    }
  });
});
