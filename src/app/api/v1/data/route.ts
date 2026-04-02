import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * Ondersteunt volledige CRUD (GET, POST, PATCH, DELETE).
 * Geautoriseerd via X-API-KEY of Bearer token.
 */

if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.error('Fout bij initialiseren Firebase Admin:', error);
  }
}

const db = admin.firestore();

/**
 * Definitie van toegestane collecties en hun permissies.
 */
const ALLOWED_COLLECTIONS: Record<string, { collection: string; allowWrite: boolean }> = {
  'meldingen': { collection: 'meldingen', allowWrite: true },
  'objects': { collection: 'objects', allowWrite: true },
  'projects': { collection: 'projects', allowWrite: true },
  'voertuigen': { collection: 'voertuigen', allowWrite: true },
  'machines': { collection: 'machines', allowWrite: true },
  'users': { collection: 'users', allowWrite: true },
  'settings': { collection: 'settings', allowWrite: true }
};

/**
 * Helper om CORS-headers toe te voegen aan de respons.
 */
function corsResponse(data: any, status: number = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * OPTIONS methode voor CORS preflight verzoeken.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY, Authorization',
    },
  });
}

/**
 * Helper om de API Key te valideren tegen de database-instellingen.
 */
async function validateAuth(request: Request): Promise<{ authorized: boolean; error?: string }> {
  const { searchParams } = new URL(request.url);
  const xApiKey = request.headers.get('x-api-key')?.trim() || searchParams.get('key')?.trim();
  const authHeader = request.headers.get('authorization')?.trim();
  
  const candidateKeys: string[] = [];
  if (xApiKey) candidateKeys.push(xApiKey);
  if (authHeader) {
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      candidateKeys.push(authHeader.substring(7).trim());
    } else {
      candidateKeys.push(authHeader);
    }
  }

  if (candidateKeys.length === 0) {
    return { authorized: false, error: 'Geen API Key gevonden (X-API-KEY header of ?key= parameter).' };
  }

  try {
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    const validKey = settingsSnap.data()?.publicKey?.trim();

    if (!validKey) return { authorized: false, error: 'API Hub niet geconfigureerd in BeheerHub.' };

    const isMatch = candidateKeys.some(key => key.trim() === validKey);
    if (!isMatch) return { authorized: false, error: 'Ongeldige API Key.' };

    return { authorized: true };
  } catch (err: any) {
    return { authorized: false, error: 'Auth validatie fout op de server.' };
  }
}

/**
 * GET - Data ophalen
 */
export async function GET(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Unauthorized', message: auth.error }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type) return corsResponse({ error: 'Bad Request', message: 'Geef een dataset "type" op.' }, 400);

    const config = ALLOWED_COLLECTIONS[type];
    if (!config) return corsResponse({ error: 'Forbidden', message: `Dataset "${type}" is niet toegankelijk via de API.` }, 403);

    const targetCollection = config.collection;

    if (id) {
      const docSnap = await db.collection(targetCollection).doc(id).get();
      if (!docSnap.exists) return corsResponse({ error: 'Not Found' }, 404);
      return corsResponse({ success: true, data: { id: docSnap.id, ...docSnap.data() } });
    }

    let queryRef: admin.firestore.Query = db.collection(targetCollection);
    
    // Dynamische filtering op basis van URL parameters
    searchParams.forEach((value, key) => {
      if (['type', 'id', 'key'].includes(key)) return;
      
      // Ondersteuning voor comma-separated waarden (IN operator)
      const values = value.split(',').map(v => v.trim()).filter(Boolean);
      
      if (values.length > 1) {
          // Gebruik IN operator voor meerdere waarden
          queryRef = queryRef.where(key, 'in', values.map(v => 
              v.toLowerCase() === 'true' ? true : v.toLowerCase() === 'false' ? false : v
          ));
      } else if (values.length === 1) {
          // Standaard '==' operator voor enkele waarde
          const singleVal = values[0];
          const typedVal = singleVal.toLowerCase() === 'true' ? true : singleVal.toLowerCase() === 'false' ? false : singleVal;
          queryRef = queryRef.where(key, '==', typedVal);
      }
    });

    const snapshot = await queryRef.limit(1000).get();
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    return corsResponse({ success: true, count: data.length, data });
  } catch (error: any) {
    return corsResponse({ error: 'Server Error', message: error.message }, 500);
  }
}

/**
 * POST - Nieuw record aanmaken
 */
export async function POST(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Unauthorized', message: auth.error }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const direct = searchParams.get('direct') === 'true';

    if (!type) return corsResponse({ error: 'Bad Request', message: 'Geef "type" op.' }, 400);

    const config = ALLOWED_COLLECTIONS[type];
    if (!config || !config.allowWrite) {
        return corsResponse({ error: 'Forbidden', message: `Schrijven naar dataset "${type}" is niet toegestaan via de API.` }, 403);
    }

    const body = await request.json();
    const targetCollection = config.collection;
    
    // Verrijking voor meldingen
    if (targetCollection === 'meldingen') {
      // Status logica
      if (!direct) {
        body.status = 'Nieuw'; 
      } else if (!body.status || body.status === 'Nieuw') {
        body.status = 'In behandeling';
      }

      // 1:1 Verrijking op basis van containernummer indien coords ontbreken
      if (body.containernummer && (!body.latitude || !body.longitude)) {
          const q = await db.collection('objects')
            .where('idNummer', '==', String(body.containernummer).toUpperCase())
            .limit(1)
            .get();
          
          if (!q.empty) {
              const obj = q.docs[0].data();
              if (!body.latitude) body.latitude = obj.latitude || 0;
              if (!body.longitude) body.longitude = obj.longitude || 0;
              if (!body.straatnaam) body.straatnaam = obj.straatnaam || '';
              if (!body.huisnummer) body.huisnummer = obj.huisnummer || '';
              if (!body.plaats) body.plaats = obj.plaats || '';
              if (!body.postcode) body.postcode = obj.postcode || '';
              if (!body.werkgebied) body.werkgebied = obj.wijk || (obj.locatieWerkgebieden?.[0] || '');
          }
      }
    }

    const docRef = await db.collection(targetCollection).add({
      ...body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'REST_API_EXTERNAL'
    });

    return corsResponse({ 
      success: true, 
      id: docRef.id, 
      message: 'Record succesvol aangemaakt via REST API.' 
    }, 201);
  } catch (error: any) {
    return corsResponse({ error: 'Server Error', message: error.message }, 500);
  }
}

/**
 * PATCH - Bestaand record bijwerken
 */
export async function PATCH(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Unauthorized' }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) return corsResponse({ error: 'Bad Request' }, 400);

    const config = ALLOWED_COLLECTIONS[type];
    if (!config || !config.allowWrite) {
        return corsResponse({ error: 'Forbidden', message: `Bewerken van dataset "${type}" is niet toegestaan via de API.` }, 403);
    }

    const body = await request.json();
    await db.collection(config.collection).doc(id).update({
      ...body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return corsResponse({ success: true, message: 'Record bijgewerkt.' });
  } catch (error: any) {
    return corsResponse({ error: 'Server Error', message: error.message }, 500);
  }
}

/**
 * DELETE - Record verwijderen
 */
export async function DELETE(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Unauthorized' }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) return corsResponse({ error: 'Bad Request' }, 400);

    const config = ALLOWED_COLLECTIONS[type];
    if (!config || !config.allowWrite) {
        return corsResponse({ error: 'Forbidden', message: `Verwijderen uit dataset "${type}" is niet toegestaan via de API.` }, 403);
    }

    await db.collection(config.collection).doc(id).delete();
    return corsResponse({ success: true, message: 'Record verwijderd.' });
  } catch (error: any) {
    return corsResponse({ error: 'Server Error', message: error.message }, 500);
  }
}
