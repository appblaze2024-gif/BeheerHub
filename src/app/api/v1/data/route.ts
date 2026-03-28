import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * Geoptimaliseerd voor GeoBeheer en andere externe partners.
 * Inclusief volledige CORS ondersteuning om 'Failed to fetch' te voorkomen.
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
  return NextResponse.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY, Authorization',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY, Authorization',
    },
  });
}

/**
 * Helper om de API Key te valideren tegen de database.
 */
async function validateAuth(request: Request): Promise<{ authorized: boolean; error?: string }> {
  const xApiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  
  const candidateKeys: string[] = [];
  
  if (xApiKey) candidateKeys.push(xApiKey.trim());
  if (authHeader) {
    const trimmedAuth = authHeader.trim();
    if (trimmedAuth.toLowerCase().startsWith('bearer ')) {
      candidateKeys.push(trimmedAuth.substring(7).trim());
    } else {
      candidateKeys.push(trimmedAuth);
    }
  }

  if (candidateKeys.length === 0) {
    return { authorized: false, error: 'Geen API Key gevonden in de headers (X-API-KEY of Authorization).' };
  }

  try {
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    if (!settingsSnap.exists) {
      return { authorized: false, error: 'API instellingen niet gevonden.' };
    }

    const validKey = settingsSnap.data()?.publicKey;
    if (!validKey) {
      return { authorized: false, error: 'Geen actieve API sleutel geconfigureerd.' };
    }

    const isMatch = candidateKeys.some(key => key === String(validKey).trim());
    if (!isMatch) {
      return { authorized: false, error: 'De opgegeven API Key is ongeldig of verlopen.' };
    }

    return { authorized: true };
  } catch (err: any) {
    return { authorized: false, error: 'Interne fout bij validatie.' };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (!type) {
    return corsResponse({ 
      error: 'Onvolledig verzoek', 
      message: 'Geef een "type" parameter op (bijv. type=meldingen).' 
    }, 400);
  }

  const auth = await validateAuth(request);
  if (!auth.authorized) {
    return corsResponse({ 
      error: 'Niet geautoriseerd', 
      message: auth.error 
    }, 401);
  }

  try {
    const allowedCollections: Record<string, string> = {
      'meldingen': 'meldingen',
      'objects': 'objects',
      'projects': 'projects',
      'voertuigen': 'voertuigen',
      'machines': 'machines'
    };

    const targetCollection = allowedCollections[type];
    if (!targetCollection) {
      return corsResponse({ error: 'Verboden', message: 'Dataset niet toegankelijk via de API.' }, 403);
    }

    const snapshot = await db.collection(targetCollection).limit(1000).get();
    const data = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));

    return corsResponse({
      success: true,
      source: `BeheerHub ${type}`,
      count: data.length,
      timestamp: new Date().toISOString(),
      data: data
    });

  } catch (error: any) {
    return corsResponse({ error: 'Server fout', message: error.message }, 500);
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type !== 'meldingen') {
    return corsResponse({ 
      error: 'Niet toegestaan', 
      message: 'Alleen POST op "meldingen" is momenteel ondersteund.' 
    }, 400);
  }

  const auth = await validateAuth(request);
  if (!auth.authorized) {
    return corsResponse({ 
      error: 'Niet geautoriseerd', 
      message: auth.error 
    }, 401);
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];
    const colRef = db.collection('meldingen');

    const batch = db.batch();
    for (const item of items) {
        const newDocRef = colRef.doc();
        batch.set(newDocRef, {
            ...item,
            status: item.status || 'Nieuw',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            source: 'REST_INBOUND'
        });
    }
    await batch.commit();

    return corsResponse({ success: true, message: `${items.length} records succesvol opgeslagen.` });
  } catch (error: any) {
    return corsResponse({ error: 'Server fout', message: error.message }, 500);
  }
}
