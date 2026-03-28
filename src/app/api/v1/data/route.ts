import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * Geoptimaliseerd voor GeoBeheer en andere externe partners.
 * Inclusief volledige CORS ondersteuning.
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY, Authorization',
    },
  });
}

/**
 * Helper om de API Key te valideren tegen de database.
 * Controleert zowel X-API-KEY als Authorization: Bearer headers.
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

    const isMatch = candidateKeys.some(key => key === validKey);
    if (!isMatch) {
      return { authorized: false, error: 'De opgegeven API Key is ongeldig.' };
    }

    return { authorized: true };
  } catch (err: any) {
    return { authorized: false, error: 'Database validatie fout.' };
  }
}

export async function GET(request: Request) {
  try {
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

    const allowedCollections: Record<string, string> = {
      'meldingen': 'meldingen',
      'objects': 'objects',
      'projects': 'projects',
      'voertuigen': 'voertuigen',
      'machines': 'machines'
    };

    const targetCollection = allowedCollections[type];
    if (!targetCollection) {
      return corsResponse({ error: 'Verboden', message: 'Dataset niet toegankelijk.' }, 403);
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
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) {
      return corsResponse({ 
        error: 'Niet geautoriseerd', 
        message: auth.error 
      }, 401);
    }

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
