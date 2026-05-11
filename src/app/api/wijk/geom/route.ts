import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Missing wijkcode' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/Wijken/items?filter=wijkcode='${encodeURIComponent(code)}'`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching wijk geom:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
