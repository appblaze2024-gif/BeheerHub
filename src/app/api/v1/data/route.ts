import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * Maakt gebruik van de Firebase Admin SDK om permissie-fouten te voorkomen
 * bij server-naar-server communicatie.
 */

if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.error('Fout bij initialiseren Firebase Admin:', error);
  }
}

const db = admin.firestore();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  
  // Flexibele extractie van de API-sleutel uit verschillende mogelijke headers
  const xApiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  
  let apiKey = '';
  if (xApiKey) {
    apiKey = xApiKey.trim();
  } else if (authHeader) {
    // Ondersteuning voor 'Bearer <key>' formaat
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      apiKey = authHeader.substring(7).trim();
    } else {
      apiKey = authHeader.trim();
    }
  }

  if (!type || !apiKey) {
    return NextResponse.json({ 
      error: 'Onvolledig verzoek', 
      message: 'Geef een "type" parameter op en een validatie-sleutel (X-API-KEY of Authorization header).' 
    }, { status: 400 });
  }

  try {
    // Valideer API Key via Admin SDK
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    const settingsData = settingsSnap.data();
    
    const validKey = settingsData?.publicKey;
    
    // Controleer of de sleutel exact overeenkomt
    if (!settingsSnap.exists || !validKey || validKey !== apiKey) {
      console.warn(`[API AUTH] Ongeldige poging voor type ${type}. Sleutel begint met: ${apiKey.substring(0, 8)}...`);
      return NextResponse.json({ 
        error: 'Niet geautoriseerd', 
        message: 'De opgegeven API Key is ongeldig of verlopen.' 
      }, { status: 401 });
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
      return NextResponse.json({ error: 'Verboden', message: 'Dataset niet gevonden of niet toegankelijk via deze API.' }, { status: 403 });
    }

    // Haal data op met Admin SDK (omzeilt security rules voor deze server-to-server actie)
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
    console.error(`[API ERROR] Fout bij verwerken request voor ${type}:`, error);
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  
  const xApiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  
  let apiKey = '';
  if (xApiKey) {
    apiKey = xApiKey.trim();
  } else if (authHeader) {
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      apiKey = authHeader.substring(7).trim();
    } else {
      apiKey = authHeader.trim();
    }
  }

  if (type !== 'meldingen' || !apiKey) {
    return NextResponse.json({ error: 'Niet toegestaan', message: 'Alleen POST op "meldingen" is momenteel ondersteund met een geldige sleutel.' }, { status: 400 });
  }

  try {
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    const validKey = settingsSnap.data()?.publicKey;

    if (!settingsSnap.exists || !validKey || validKey !== apiKey) {
      return NextResponse.json({ error: 'Niet geautoriseerd', message: 'Ongeldige API Key.' }, { status: 401 });
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
            source: 'REST_INBOUND'
        });
    }
    await batch.commit();

    return NextResponse.json({ success: true, message: 'Data succesvol opgeslagen.' });
  } catch (error: any) {
    console.error('[API POST ERROR]:', error);
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}
