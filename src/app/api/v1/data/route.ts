import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * Ondersteunt volledige CRUD (Create, Read, Update, Delete).
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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
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

    const isMatch = candidateKeys.some(key => key === validKey);
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
      'machines': 'machines'
    };

    const targetCollection = allowedCollections[type];
    if (!targetCollection) return corsResponse({ error: 'Verboden', message: 'Dataset niet toegankelijk.' }, 403);

    if (id) {
      const docSnap = await db.collection(targetCollection).doc(id).get();
      if (!docSnap.exists) return corsResponse({ error: 'Niet gevonden', message: 'Record niet gevonden.' }, 404);
      return corsResponse({ success: true, data: { id: docSnap.id, ...docSnap.data() } });
    }

    const snapshot = await db.collection(targetCollection).limit(1000).get();
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    return corsResponse({
      success: true,
      count: data.length,
      timestamp: new Date().toISOString(),
      data: data
    });
  } catch (error: any) {
    return corsResponse({ error: 'Server fout', message: error.message }, 500);
  }
}

/**
 * POST - Nieuwe data aanmaken
 */
export async function POST(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Niet geautoriseerd', message: auth.error }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'meldingen';
    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];
    const colRef = db.collection(type);

    const batch = db.batch();
    for (const item of items) {
        const newDocRef = colRef.doc();
        batch.set(newDocRef, {
            ...item,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            source: 'REST_API_IMPORT'
        });
    }
    await batch.commit();

    return corsResponse({ success: true, message: `${items.length} records succesvol aangemaakt.` });
  } catch (error: any) {
    return corsResponse({ error: 'Server fout', message: error.message }, 500);
  }
}

/**
 * PATCH - Data bijwerken (Update)
 */
export async function PATCH(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Niet geautoriseerd', message: auth.error }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    
    if (!type || !id) {
      return corsResponse({ error: 'Onvolledig verzoek', message: 'Geef "type" en "id" op.' }, 400);
    }

    const body = await request.json();
    const docRef = db.collection(type).doc(id);
    
    await docRef.update({
      ...body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return corsResponse({ success: true, message: 'Record succesvol bijgewerkt.' });
  } catch (error: any) {
    return corsResponse({ error: 'Server fout', message: error.message }, 500);
  }
}

/**
 * DELETE - Data verwijderen
 */
export async function DELETE(request: Request) {
  try {
    const auth = await validateAuth(request);
    if (!auth.authorized) return corsResponse({ error: 'Niet geautoriseerd', message: auth.error }, 401);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) {
      return corsResponse({ error: 'Onvolledig verzoek', message: 'Geef "type" en "id" op.' }, 400);
    }

    await db.collection(type).doc(id).delete();
    return corsResponse({ success: true, message: 'Record succesvol verwijderd.' });
  } catch (error: any) {
    return corsResponse({ error: 'Server fout', message: error.message }, 500);
  }
}
