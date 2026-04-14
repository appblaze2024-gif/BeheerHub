import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * STRIKT READ-ONLY: Ondersteunt uitsluitend GET voor data-extractie.
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
 * Definitie van toegestane collecties voor extractie.
 */
const ALLOWED_COLLECTIONS: Record<string, { collection: string }> = {
  'meldingen': { collection: 'meldingen' },
  'objects': { collection: 'objects' },
  'projects': { collection: 'projects' },
  'voertuigen': { collection: 'voertuigen' },
  'machines': { collection: 'machines' },
  'users': { collection: 'users' },
  'settings': { collection: 'settings' }
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
 * GET - Data ophalen (Read Only)
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
    
    searchParams.forEach((value, key) => {
      if (['type', 'id', 'key'].includes(key)) return;
      
      const values = value.split(',').map(v => v.trim()).filter(Boolean);
      
      if (values.length > 1) {
          queryRef = queryRef.where(key, 'in', values.map(v => 
              v.toLowerCase() === 'true' ? true : v.toLowerCase() === 'false' ? false : v
          ));
      } else if (values.length === 1) {
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

// Expliciete blokkering van andere methodes voor maximale veiligheid
export async function POST() { return corsResponse({ error: 'Forbidden', message: 'API is strikt Read-Only (GET).' }, 403); }
export async function PATCH() { return corsResponse({ error: 'Forbidden', message: 'API is strikt Read-Only (GET).' }, 403); }
export async function DELETE() { return corsResponse({ error: 'Forbidden', message: 'API is strikt Read-Only (GET).' }, 403); }
