
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialiseer de Admin SDK één keer
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * webhookHandler - Ontvangt meldingen van externe partners.
 * Geoptimaliseerd voor stabiliteit en verwerking van volledige datasets.
 */
exports.webhookHandler = onRequest({ cors: true }, async (req, res) => {
    // 1. Alleen POST toestaan
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Authenticatie Controle
    const apiKey = req.get('X-API-KEY');
    const VALID_API_KEY = 'GEO-PRO-2026-BETA';

    if (apiKey !== VALID_API_KEY) {
        console.warn('Ongeautoriseerde toegangspoging met API key:', apiKey);
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Ongeldige API Key.' 
        });
    }

    try {
        const payload = req.body;
        
        // Zorg dat we altijd met een array werken
        const items = Array.isArray(payload) ? payload : (payload ? [payload] : []);
        
        if (items.length === 0) {
            return res.status(400).json({ error: "Geen data ontvangen in de body." });
        }

        const db = admin.firestore();
        const batch = db.batch();
        const processedIds = [];
        const errors = [];

        for (const item of items) {
            // Beveiliging: check of item een object is
            if (!item || typeof item !== 'object') {
                errors.push({ error: "Item is geen geldig JSON object", received: item });
                continue;
            }

            // Helper om velden op te zoeken (case-insensitive)
            const getVal = (prefixes) => {
                const keys = Object.keys(item);
                const foundKey = keys.find(k => 
                    prefixes.some(p => k.toLowerCase().trim() === p.toLowerCase().trim())
                );
                return foundKey ? item[foundKey] : undefined;
            };

            // Mapping van standaardvelden voor compatibiliteit met interne BeheerHub overzichten
            const intakenummer = getVal(['INT', 'Innamenummer', 'id', 'ticket_id', 'intakenummer', 'nummer']);
            const hoofdcategorie = getVal(['HFDCAT', 'Hoofdcategorie', 'category', 'hoofdcategorie', 'type']) || "Overig";
            const subcategorie = getVal(['SUBCAT', 'Subcategorie', 'type', 'subcategorie', 'fractie']) || "N.v.t.";
            const straat = getVal(['STR', 'Straat', 'street', 'straatnaam']) || "";
            const huisnummer = getVal(['HNR', 'Huisnummer', 'number', 'nr']) || "";
            const plaats = getVal(['PLA', 'Plaats', 'city', 'plaatsnaam']) || "";
            const datum = getVal(['DTM', 'Datum', 'date', 'tijdstip']) || new Date().toISOString();
            
            // Locatie lookup
            const lat = getVal(['LAT', 'Latitude', 'y', 'lat']);
            const lon = getVal(['LON', 'Longitude', 'x', 'lon', 'lng', 'long']);

            const latNum = parseFloat(String(lat).replace(',', '.'));
            const lonNum = parseFloat(String(lon).replace(',', '.'));

            // Validatie: Sla over indien geen coördinaten
            if (isNaN(latNum) || isNaN(lonNum)) {
                errors.push({ 
                    id: intakenummer || 'onbekend', 
                    error: "Missing Location Data (LAT/LON)", 
                    received: { lat, lon }
                });
                continue;
            }

            // Bouw de melding op: We behouden ALLE inkomende data (...item)
            // en voegen de gestandaardiseerde velden toe voor BeheerHub overzichten.
            const mappedData = {
                ...item, // BEHOUD ALLE DATA
                Innamenummer: intakenummer ? String(intakenummer) : (item.Innamenummer || "N.B."),
                Hoofdcategorie: String(hoofdcategorie),
                Subcategorie: String(subcategorie),
                Latitude: latNum,
                Longitude: lonNum,
                Straat: String(straat),
                Huisnummer: String(huisnummer),
                Plaats: String(plaats),
                "Datum/Tijd": String(datum),
                server_timestamp: admin.firestore.FieldValue.serverTimestamp(),
                source: 'REST_INBOUND'
            };

            const newDocRef = db.collection('api_meldingen').doc();
            batch.set(newDocRef, mappedData);
            processedIds.push(newDocRef.id);
        }

        if (processedIds.length > 0) {
            await batch.commit();
        }

        return res.status(200).json({
            status: "success",
            message: `${processedIds.length} melding(en) verwerkt.`,
            processedCount: processedIds.length,
            failedCount: errors.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Kritieke fout in webhookHandler:', error);
        return res.status(500).json({
            status: "error",
            message: "Interne server fout in Cloud Function.",
            details: error.message
        });
    }
});
