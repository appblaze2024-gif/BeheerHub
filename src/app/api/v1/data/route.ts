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
  
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key') || 
                 (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader);

  if (!type || !apiKey) {
    return NextResponse.json({ 
      error: 'Onvolledig verzoek', 
      message: 'Geef een "type" parameter op en een validatie-sleutel in de header.' 
    }, { status: 400 });
  }

  try {
    // Valideer API Key via Admin SDK
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    const settingsData = settingsSnap.data();
    
    if (!settingsSnap.exists || settingsData?.publicKey !== apiKey) {
      return NextResponse.json({ 
        error: 'Niet geautoriseerd', 
        message: 'De opgegeven API Key is ongeldig.' 
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
      return NextResponse.json({ error: 'Verboden', message: 'Bron niet gevonden.' }, { status: 403 });
    }

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
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const apiKey = request.headers.get('x-api-key');

  if (type !== 'meldingen' || !apiKey) {
    return NextResponse.json({ error: 'Niet toegestaan' }, { status: 400 });
  }

  try {
    const settingsSnap = await db.collection('settings').doc('api_settings').get();
    if (settingsSnap.data()?.publicKey !== apiKey) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];
    const colRef = db.collection('meldingen');

    for (const item of items) {
        await colRef.add({
            ...item,
            status: item.status || 'Nieuw',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: 'REST_INBOUND'
        });
    }

    return NextResponse.json({ success: true, message: 'Data opgeslagen.' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server fout' }, { status: 500 });
  }
}
