
import { NextResponse } from 'next/server';
import { getFirestore, collection, getDocs, doc, getDoc, query, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';

/**
 * Universeel API Eindpunt voor BeheerHub.
 * GET: Data ophalen (meldingen, objecten, etc.)
 * POST: Data ontvangen (nieuwe meldingen inschieten via webhook)
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
  const colName = searchParams.get('type');
  const apiKey = request.headers.get('x-api-key');

  if (!colName || !apiKey) {
    return NextResponse.json({ 
      error: 'Onvolledig verzoek', 
      message: 'Geef een "type" parameter op in de URL en een "x-api-key" in de header.' 
    }, { status: 400 });
  }

  const db = await getDb();

  try {
    const settingsRef = doc(db, 'settings', 'api_settings');
    const settingsSnap = await getDoc(settingsRef);
    
    if (!settingsSnap.exists() || settingsSnap.data().publicKey !== apiKey) {
      return NextResponse.json({ error: 'Niet geautoriseerd', message: 'Ongeldige API Key.' }, { status: 401 });
    }

    const allowedCollections = ['meldingen', 'objects', 'users', 'projects', 'voertuigen', 'machines'];
    if (!allowedCollections.includes(colName)) {
      return NextResponse.json({ error: 'Verboden', message: 'Deze data is niet publiekelijk toegankelijk.' }, { status: 403 });
    }

    const colRef = collection(db, colName);
    const q = query(colRef, limit(500));
    const snapshot = await getDocs(q);
    
    const data = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    return NextResponse.json({
      success: true,
      count: data.length,
      timestamp: new Date().toISOString(),
      data: data
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const colName = searchParams.get('type');
  const apiKey = request.headers.get('x-api-key');

  if (!colName || !apiKey) {
    return NextResponse.json({ error: 'Onvolledig verzoek' }, { status: 400 });
  }

  const db = await getDb();

  try {
    const settingsRef = doc(db, 'settings', 'api_settings');
    const settingsSnap = await getDoc(settingsRef);
    
    if (!settingsSnap.exists() || settingsSnap.data().publicKey !== apiKey) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    // Alleen meldingen toevoegen via POST toestaan voor nu
    if (colName !== 'meldingen') {
      return NextResponse.json({ error: 'Verboden', message: 'POST is alleen toegestaan voor meldingen.' }, { status: 403 });
    }

    const body = await request.json();
    
    // Basis validatie voor een melding
    if (!body.intakenummer || !body.subcategorie) {
        return NextResponse.json({ error: 'Ongeldige data', message: 'Velden "intakenummer" en "subcategorie" zijn verplicht.' }, { status: 400 });
    }

    const newDoc = {
        ...body,
        status: body.status || 'Nieuw',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: 'API_INCOMING'
    };

    const docRef = await addDoc(collection(db, 'meldingen'), newDoc);

    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: 'Data succesvol ontvangen en opgeslagen.'
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'Server fout', message: error.message }, { status: 500 });
  }
}
