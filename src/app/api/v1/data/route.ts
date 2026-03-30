import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * BEPERKT TOT READ-ONLY (GET).
 * Geoptimaliseerd voor GeoBeheer en andere externe partners.
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
 * Essentieel om 'Failed to fetch' in browser-omgevingen te voorkomen.
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
 * Helper om de API Key te valideren tegen de database.
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
    return { authorized: false, error: 'Geen API Key gevonden in de headers.' };
  }

  try {
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    const validKey = settingsSnap.data()?.publicKey?.trim();

    if (!validKey) {
      return { authorized: false, error: 'API Hub is nog niet geconfigureerd in BeheerHub.' };
    }

    const isMatch = candidateKeys.some(key => key.trim() === validKey);
    if (!isMatch) {
      return { authorized: false, error: 'De opgegeven API Key is ongeldig of verlopen.' };
    }

    return { authorized: true };
  } catch (err: any) {
    return { authorized: false, error: 'Database validatie fout.' };
  }
}

/**
 * GET - Data ophalen (Lezen)
 * Ondersteunt dynamische filters op alle velden.
 */
export async function GET(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Niet geautoriseerd', message: auth.error }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type) {
      return corsResponse({ error: 'Onvolledig verzoek', message: 'Geef een "type" parameter op.' }, 400);
    }

    const allowedCollections: Record<string, string> = {
      'meldingen': 'meldingen',
      'objects': 'objects',
      'projects': 'projects',
      'voertuigen': 'voertuigen',
      'machines': 'machines',
      'users': 'users'
    };

    const targetCollection = allowedCollections[type];
    if (!targetCollection) return corsResponse({ error: 'Verboden', message: 'Dataset niet toegankelijk.' }, 403);

    // Specifiek document ophalen
    if (id) {
      const docSnap = await db.collection(targetCollection).doc(id).get();
      if (!docSnap.exists) return corsResponse({ error: 'Niet gevonden', message: 'Record niet gevonden.' }, 404);
      return corsResponse({ success: true, data: { id: docSnap.id, ...docSnap.data() } });
    }

    // Collectie ophalen met dynamische filters
    let queryRef: admin.firestore.Query = db.collection(targetCollection);
    const appliedFilters: Record<string, string> = {};

    searchParams.forEach((value, key) => {
      if (['type', 'id'].includes(key)) return;
      
      appliedFilters[key] = value;

      if (value.includes(',')) {
        const values = value.split(',').map(s => s.trim()).filter(Boolean);
        if (values.length > 0) {
          queryRef = queryRef.where(key, 'in', values.slice(0, 30));
        }
      } else {
        if (value.toLowerCase() === 'true') queryRef = queryRef.where(key, '==', true);
        else if (value.toLowerCase() === 'false') queryRef = queryRef.where(key, '==', false);
        else queryRef = queryRef.where(key, '==', value);
      }
    });

    const snapshot = await queryRef.limit(1000).get();
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    return corsResponse({
      success: true,
      count: data.length,
      total_in_collection: (await db.collection(targetCollection).count().get()).data().count,
      timestamp: new Date().toISOString(),
      filters_applied: Object.keys(appliedFilters).length > 0 ? appliedFilters : 'none',
      data: data
    });
  } catch (error: any) {
    return corsResponse({ error: 'Server fout', message: error.message }, 500);
  }
}
