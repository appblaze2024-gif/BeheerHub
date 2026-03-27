
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
 * Deze versie is extra flexibel met veldnamen (case-insensitive) en stopt niet bij één fout.
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
      const items = Array.isArray(payload) ? payload : [payload];
      
      if (items.length === 0) {
        return res.status(400).json({ error: "Geen data ontvangen." });
      }

      const db = admin.firestore();
      const batch = db.batch();
      const processedIds = [];
      const errors = [];

      for (const item of items) {
        // Helper om velden op te zoeken ongeacht hoofdletters (LAT, lat, Latitude, etc.)
        const getVal = (prefixes) => {
            const key = Object.keys(item).find(k => prefixes.some(p => k.toLowerCase() === p.trim().toLowerCase()));
            return key ? item[key] : undefined;
        };

        const intakenummer = getVal(['INT', 'Innamenummer', 'id', 'ticket_id', 'intakenummer', 'nummer']);
        const hoofdcategorie = getVal(['HFDCAT', 'Hoofdcategorie', 'category', 'hoofdcategorie', 'type']) || "Overig";
        const subcategorie = getVal(['SUBCAT', 'Subcategorie', 'type', 'subcategorie', 'fractie']) || "N.v.t.";
        const straat = getVal(['STR', 'Straat', 'street', 'straatnaam']) || "";
        const huisnummer = getVal(['HNR', 'Huisnummer', 'number', 'nr']) || "";
        const plaats = getVal(['PLA', 'Plaats', 'city', 'plaatsnaam']) || "";
        const datum = getVal(['DTM', 'Datum', 'date', 'tijdstip']) || new Date().toISOString();
        
        // Flexibele locatie lookup
        const lat = getVal(['LAT', 'Latitude', 'y', 'lat']);
        const lon = getVal(['LON', 'Longitude', 'x', 'lon', 'lng']);

        const latNum = parseFloat(String(lat).replace(',', '.'));
        const lonNum = parseFloat(String(lon).replace(',', '.'));

        // Validatie: Sla over indien geen coördinaten, maar breek de rest niet af
        if (isNaN(latNum) || isNaN(lonNum)) {
          errors.push({ 
            id: intakenummer || 'onbekend', 
            error: "Missing Location Data (LAT/LON)", 
            received: { lat, lon },
            keys_received: Object.keys(item)
          });
          continue;
        }

        const mappedData = {
          Innamenummer: intakenummer ? String(intakenummer) : "N.B.",
          Hoofdcategorie: String(hoofdcategorie),
          Subcategorie: String(subcategorie),
          Latitude: latNum,
          Longitude: lonNum,
          Straat: String(straat),
          Huisnummer: String(huisnummer),
          Plaats: String(plaats),
          "Datum/Tijd": String(datum),
          server_timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const newDocRef = db.collection('api_meldingen').doc();
        batch.set(newDocRef, mappedData);
        processedIds.push(newDocRef.id);
      }

      if (processedIds.length > 0) {
        await batch.commit();
      }

      const statusCode = processedIds.length > 0 ? 200 : 400;
      return res.status(statusCode).json({
        status: processedIds.length > 0 ? "success" : "error",
        message: processedIds.length > 0 ? `${processedIds.length} melding(en) succesvol opgeslagen.` : "Geen meldingen konden worden opgeslagen wegens ontbrekende data.",
        ids: processedIds,
        failed: errors.length > 0 ? errors : undefined
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
