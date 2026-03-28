import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
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
 * Helper om de API Key te valideren tegen de database.
 * Controleert zowel X-API-KEY als Authorization headers.
 */
async function validateAuth(request: Request): Promise<{ authorized: boolean; error?: string }> {
  const xApiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  
  // Verzamel alle mogelijke sleutels uit de headers
  const candidateKeys: string[] = [];
  
  if (xApiKey) {
    candidateKeys.push(xApiKey.trim());
  }
  
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
      return { authorized: false, error: 'API instellingen niet gevonden in het systeem.' };
    }

    const validKey = settingsSnap.data()?.publicKey;
    if (!validKey) {
      return { authorized: false, error: 'Er is geen actieve publieke API sleutel geconfigureerd.' };
    }

    // Controleer of één van de opgegeven sleutels exact overeenkomt met de sleutel in de DB
    const isMatch = candidateKeys.some(key => key === String(validKey).trim());

    if (!isMatch) {
      return { authorized: false, error: 'De opgegeven API Key is ongeldig of verlopen.' };
    }

    return { authorized: true };
  } catch (err: any) {
    console.error('[API AUTH ERROR]:', err);
    return { authorized: false, error: 'Interne fout bij validatie van de sleutel.' };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (!type) {
    return NextResponse.json({ 
      error: 'Onvolledig verzoek', 
      message: 'Geef een "type" parameter op (bijv. type=meldingen).' 
    }, { status: 400 });
  }

  const auth = await validateAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ 
      error: 'Niet geautoriseerd', 
      message: auth.error 
    }, { status: 401 });
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
      return NextResponse.json({ error: 'Verboden', message: 'Dataset niet gevonden of niet toegankelijk via de API.' }, { status: 403 });
    }

    // Haal data op met Admin SDK
    const snapshot = await db.collection(targetCollection).limit(1000).get();
    const data = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({
      success: true,
      source: `BeheerHub ${type}`,
      count: data.length,
      timestamp: new Date().toISOString(),
      data: data
    });

  } catch (error: any) {
    console.error(`[API GET ERROR] ${type}:`, error);
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type !== 'meldingen') {
    return NextResponse.json({ 
      error: 'Niet toegestaan', 
      message: 'Alleen POST op "meldingen" is momenteel ondersteund.' 
    }, { status: 400 });
  }

  const auth = await validateAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ 
      error: 'Niet geautoriseerd', 
      message: auth.error 
    }, { status: 401 });
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

    return NextResponse.json({ success: true, message: `${items.length} records succesvol opgeslagen.` });
  } catch (error: any) {
    console.error('[API POST ERROR]:', error);
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}