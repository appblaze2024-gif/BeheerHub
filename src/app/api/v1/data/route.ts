import { NextResponse } from 'next/server';
import { getFirestore, collection, getDocs, doc, getDoc, query, limit, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';

/**
 * Universeel REST API Eindpunt voor BeheerHub.
 * GET: Externe systemen halen data UIT BeheerHub (Pull)
 * POST: Externe systemen schieten data IN BeheerHub (Push/Webhook)
 */

async function getDb() {
  let app;
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  return getFirestore(app);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const apiKey = request.headers.get('x-api-key');

  if (!type || !apiKey) {
    return NextResponse.json({ 
      error: 'Onvolledig verzoek', 
      message: 'Geef een "type" parameter op (bijv. ?type=meldingen) en een "x-api-key" in de header.' 
    }, { status: 400 });
  }

  const db = await getDb();

  try {
    // Valideer API Key
    const settingsRef = doc(db, 'settings', 'api_settings');
    const settingsSnap = await getDoc(settingsRef);
    
    if (!settingsSnap.exists() || settingsSnap.data().publicKey !== apiKey) {
      return NextResponse.json({ error: 'Niet geautoriseerd', message: 'De opgegeven API Key is ongeldig.' }, { status: 401 });
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

    const colRef = collection(db, targetCollection);
    
    // Voor meldingen sorteren we standaard op meest recent
    let q;
    if (type === 'meldingen') {
        q = query(colRef, orderBy('createdAt', 'desc'), limit(500));
    } else {
        q = query(colRef, limit(500));
    }

    const snapshot = await getDocs(q);
    
    const data = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      // Verwijder gevoelige metadata indien nodig
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
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const apiKey = request.headers.get('x-api-key');

  if (!type || !apiKey) {
    return NextResponse.json({ error: 'Onvolledig verzoek' }, { status: 400 });
  }

  const db = await getDb();

  try {
    const settingsRef = doc(db, 'settings', 'api_settings');
    const settingsSnap = await getDoc(settingsRef);
    
    if (!settingsSnap.exists() || settingsSnap.data().publicKey !== apiKey) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    // Voor inkomende webhooks staat momenteel alleen 'meldingen' open
    if (type !== 'meldingen') {
      return NextResponse.json({ error: 'Verboden', message: 'Inkomende data (POST) is momenteel alleen toegestaan voor meldingen.' }, { status: 403 });
    }

    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];

    const results = [];
    for (const item of items) {
        const newDoc = {
            ...item,
            status: item.status || 'Nieuw',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            source: 'REST_API_INBOUND'
        };
        const docRef = await addDoc(collection(db, 'meldingen'), newDoc);
        results.push(docRef.id);
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      ids: results,
      message: 'Data succesvol ontvangen en opgeslagen in BeheerHub.'
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}
