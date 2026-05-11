import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.pdok.nl/bzk/locatieserver/v3_1/suggest?q=${encodeURIComponent(q)}&fq=type:wijk`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching wijk suggestions:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
