const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/**
 * Cloud Functions voor BeheerHub REST API.
 * Deze functies zijn publiek bereikbaar na deployment.
 */

if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * webhookHandler - Ontvangt meldingen van externe partners.
 * Gebruikt de API-sleutel uit de database voor authenticatie.
 */
exports.webhookHandler = onRequest({ cors: true }, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');
        return res.status(204).send('');
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const db = admin.firestore();
    const apiKey = req.get('X-API-KEY') || req.get('Authorization')?.replace('Bearer ', '');

    try {
        // Valideer API Key tegen de centrale instellingen
        const settingsSnap = await db.collection('settings').doc('api_settings').get();
        const validKey = settingsSnap.data()?.publicKey;

        if (!apiKey || apiKey !== validKey) {
            console.warn('Ongeautoriseerde poging met key:', apiKey);
            return res.status(401).json({ error: 'Unauthorized', message: 'Ongeldige API Key.' });
        }

        const payload = req.body;
        const items = Array.isArray(payload) ? payload : (payload ? [payload] : []);
        
        if (items.length === 0) {
            return res.status(400).json({ error: "Geen data ontvangen." });
        }

        const batch = db.batch();
        const processedIds = [];

        for (const item of items) {
            if (!item || typeof item !== 'object') continue;

            const getVal = (prefixes) => {
                const keys = Object.keys(item);
                const foundKey = keys.find(k => 
                    prefixes.some(p => k.toLowerCase().trim() === p.toLowerCase().trim())
                );
                return foundKey ? item[foundKey] : undefined;
            };

            const intakenummer = getVal(['INT', 'Innamenummer', 'id', 'intakenummer']);
            const lat = getVal(['LAT', 'Latitude', 'y', 'lat']);
            const lon = getVal(['LON', 'Longitude', 'x', 'lon', 'lng']);

            const latNum = parseFloat(String(lat).replace(',', '.'));
            const lonNum = parseFloat(String(lon).replace(',', '.'));

            const mappedData = {
                ...item,
                Innamenummer: intakenummer ? String(intakenummer) : "N.B.",
                Latitude: isNaN(latNum) ? 0 : latNum,
                Longitude: isNaN(lonNum) ? 0 : lonNum,
                server_timestamp: admin.firestore.FieldValue.serverTimestamp(),
                source: 'CLOUD_FUNCTION_INBOUND'
            };

            const newDocRef = db.collection('meldingen').doc();
            batch.set(newDocRef, mappedData);
            processedIds.push(newDocRef.id);
        }

        await batch.commit();
        return res.status(200).json({ status: "success", message: `${processedIds.length} verwerkt.` });

    } catch (error) {
        console.error('Kritieke fout:', error);
        return res.status(500).json({ status: "error", message: error.message });
    }
});
