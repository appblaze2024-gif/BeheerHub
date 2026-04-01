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
  const xApiKey = request.headers.get('x-api-key')?.trim();
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
    return { authorized: false, error: 'Geen API Key gevonden in headers (X-API-KEY of Authorization).' };
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
 * GET - Data ophalen (Lijsten, specifieke records of systeeminstellingen)
 */
export async function GET(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Unauthorized', message: auth.error }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type) return corsResponse({ error: 'Bad Request', message: 'Geef een dataset "type" op (bijv. meldingen, objects, settings).' }, 400);

    const allowedCollections: Record<string, string> = {
      'meldingen': 'meldingen',
      'objects': 'objects',
      'projects': 'projects',
      'voertuigen': 'voertuigen',
      'machines': 'machines',
      'users': 'users',
      'settings': 'settings'
    };

    const targetCollection = allowedCollections[type];
    if (!targetCollection) return corsResponse({ error: 'Forbidden', message: `Dataset "${type}" is niet toegankelijk via de API.` }, 403);

    if (id) {
      const docSnap = await db.collection(targetCollection).doc(id).get();
      if (!docSnap.exists) return corsResponse({ error: 'Not Found', message: `Record met ID ${id} niet gevonden in ${type}.` }, 404);
      return corsResponse({ success: true, data: { id: docSnap.id, ...docSnap.data() } });
    }

    // Voor settings dwingen we een ID af (bijv. issue_options)
    if (type === 'settings') {
        return corsResponse({ error: 'Bad Request', message: 'Voor systeeminstellingen moet een specifieke "id" worden opgegeven.' }, 400);
    }

    let queryRef: admin.firestore.Query = db.collection(targetCollection);
    
    // Voeg filters toe op basis van query parameters
    searchParams.forEach((value, key) => {
      if (['type', 'id'].includes(key)) return;
      if (value.includes(',')) {
        queryRef = queryRef.where(key, 'in', value.split(',').map(s => s.trim()).slice(0, 30));
      } else {
        const val = value.toLowerCase() === 'true' ? true : value.toLowerCase() === 'false' ? false : value;
        queryRef = queryRef.where(key, '==', val);
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
    if (!auth.authorized) return corsResponse({ error: 'Unauthorized' }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const direct = searchParams.get('direct') === 'true';

    if (!type) return corsResponse({ error: 'Bad Request', message: 'Geef "type" op.' }, 400);

    const body = await request.json();
    
    // Specifieke logica voor meldingen om Portaal vs Direct te ondersteunen
    if (type === 'meldingen') {
      if (!direct) {
        body.status = 'Nieuw'; // Dwing portaal status af
      } else if (!body.status || body.status === 'Nieuw') {
        body.status = 'In behandeling'; // Direct geaccepteerd als werkbon
      }
    }

    const docRef = await db.collection(type).add({
      ...body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'REST_API'
    });

    return corsResponse({ 
      success: true, 
      id: docRef.id, 
      message: type === 'meldingen' && !direct ? 'Melding geplaatst in portaal.' : 'Record direct aangemaakt.' 
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

    if (!type || !id) return corsResponse({ error: 'Bad Request', message: 'Geef "type" en "id" op.' }, 400);

    const body = await request.json();
    await db.collection(type).doc(id).update({
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

    if (!type || !id) return corsResponse({ error: 'Bad Request', message: 'Geef "type" en "id" op.' }, 400);

    await db.collection(type).doc(id).delete();
    return corsResponse({ success: true, message: 'Record verwijderd.' });
  } catch (error: any) {
    return corsResponse({ error: 'Server Error', message: error.message }, 500);
  }
}
