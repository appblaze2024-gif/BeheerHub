import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * Maakt gebruik van de Firebase Admin SDK om beveiligingsregels te omzeilen
 * en validatie via API-sleutel mogelijk te maken voor externe partners.
 */

// Initialiseer de Admin SDK één keer per server instantie
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
  
  // Zoek de API-sleutel in de X-API-KEY header of de Authorization header
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key') || 
                 (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader);

  if (!type || !apiKey) {
    return NextResponse.json({ 
      error: 'Onvolledig verzoek', 
      message: 'Geef een "type" parameter op (bijv. ?type=meldingen) en een "x-api-key" in de header.' 
    }, { status: 400 });
  }

  try {
    // Valideer API Key via de Admin SDK (hiermee omzeilen we de firestore.rules restricties)
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    const settingsData = settingsSnap.data();
    
    if (!settingsSnap.exists || settingsData?.publicKey !== apiKey) {
      return NextResponse.json({ 
        error: 'Niet geautoriseerd', 
        message: 'De opgegeven API Key is ongeldig of niet geconfigureerd.' 
      }, { status: 401 });
    }

    // Definieer toegestane collecties
    const allowedCollections: Record<string, string> = {
      'meldingen': 'meldingen',
      'objects': 'objects',
      'users': 'users',
      'projects': 'projects',
      'voertuigen': 'voertuigen',
      'machines': 'machines'
    };

    const targetCollection = allowedCollections[type];
    if (!targetCollection) {
      return NextResponse.json({ 
        error: 'Verboden', 
        message: `Toegang tot type "${type}" is niet toegestaan of deze bron bestaat niet.` 
      }, { status: 403 });
    }

    // Haal data op
    let queryRef: any = db.collection(targetCollection);
    
    // Sorteer indien van toepassing
    if (type === 'meldingen') {
        queryRef = queryRef.orderBy('createdAt', 'desc');
    }

    const snapshot = await queryRef.limit(500).get();
    
    const data = snapshot.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
      // Verwijder eventuele interne timestamps die niet JSON-compatible zijn
      _path: undefined,
      _firestore: undefined
    }));

    return NextResponse.json({
      success: true,
      source: `BeheerHub ${type}`,
      count: data.length,
      timestamp: new Date().toISOString(),
      data: data
    });

  } catch (error: any) {
    console.error("REST GET Error:", error);
    return NextResponse.json({ 
      error: 'Server fout', 
      message: error.message || 'Interne fout bij het ophalen van data.' 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key') || 
                 (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader);

  if (!type || !apiKey) {
    return NextResponse.json({ error: 'Onvolledig verzoek' }, { status: 400 });
  }

  try {
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    const settingsData = settingsSnap.data();
    
    if (!settingsSnap.exists || settingsData?.publicKey !== apiKey) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    // Voor inkomende webhooks staat momenteel alleen 'meldingen' open
    if (type !== 'meldingen') {
      return NextResponse.json({ error: 'Verboden', message: 'Inkomende data (POST) is momenteel alleen toegestaan voor meldingen.' }, { status: 403 });
    }

    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];

    const results = [];
    const colRef = db.collection('meldingen');

    for (const item of items) {
        const newDoc = {
            ...item,
            status: item.status || 'Nieuw',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            source: 'REST_API_INBOUND'
        };
        const docRef = await colRef.add(newDoc);
        results.push(docRef.id);
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      ids: results,
      message: 'Data succesvol ontvangen en opgeslagen in BeheerHub.'
    });

  } catch (error: any) {
    console.error("REST POST Error:", error);
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}
