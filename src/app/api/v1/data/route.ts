
import { NextResponse } from 'next/server';
import { getFirestore, collection, getDocs, doc, getDoc, query, limit } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';

/**
 * Universeel API Eindpunt voor BeheerHub.
 * Hiermee kunnen externe systemen data ophalen (GET) met een geldige API Key.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const colName = searchParams.get('type'); // e.g., 'meldingen', 'objects'
  const apiKey = request.headers.get('x-api-key');

  if (!colName || !apiKey) {
    return NextResponse.json({ 
      error: 'Onvolledig verzoek', 
      message: 'Geef een "type" parameter op in de URL en een "x-api-key" in de header.' 
    }, { status: 400 });
  }

  // Initialiseer Firebase op de server
  let app;
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  const db = getFirestore(app);

  try {
    // 1. Valideer de API Key tegen de instellingen in Firestore
    const settingsRef = doc(db, 'settings', 'api_settings');
    const settingsSnap = await getDoc(settingsRef);
    
    if (!settingsSnap.exists() || settingsSnap.data().publicKey !== apiKey) {
      return NextResponse.json({ error: 'Niet geautoriseerd', message: 'Ongeldige API Key.' }, { status: 401 });
    }

    // 2. Beperk welke collecties opgevraagd mogen worden voor veiligheid
    const allowedCollections = ['meldingen', 'objects', 'users', 'projects', 'voertuigen', 'machines'];
    if (!allowedCollections.includes(colName)) {
      return NextResponse.json({ error: 'Verboden', message: 'Deze data is niet publiekelijk toegankelijk via de API.' }, { status: 403 });
    }

    // 3. Haal de data op
    const colRef = collection(db, colName);
    const q = query(colRef, limit(500)); // Beperk tot 500 records voor performance
    const snapshot = await getDocs(q);
    
    const data = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // 4. Stuur het resultaat terug
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
