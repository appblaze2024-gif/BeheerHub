
'use client';

/**
 * Server Action om webhooks te verzenden.
 * Dit voorkomt CORS-fouten in de browser en is veiliger.
 */
export async function triggerWebhookSync(endpoint: string, method: string, headers: Record<string, string>, payload: any) {
    try {
        // Valideer URL formaat
        if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
            throw new Error('Ongeldige URL: Moet beginnen met http:// of https://');
        }

        const response = await fetch(endpoint, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: method === 'GET' ? undefined : JSON.stringify(payload),
            signal: AbortSignal.timeout(30000) 
        });

        const status = response.status;
        const responseText = await response.text();

        return {
            success: response.ok,
            status,
            responseText: responseText.slice(0, 5000) || '(Geen respons van server)'
        };
    } catch (err: any) {
        console.error("Webhook Dispatch Error:", err);
        return {
            success: false,
            status: 0,
            responseText: `Fout: ${err.message || 'Verbinding mislukt'}`
        };
    }
}

/**
 * Server Action om data van een externe bron (zoals een shared Excel URL) op te halen.
 */
export async function fetchExternalData(url: string, headers: Record<string, string>) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/csv, text/plain',
                ...headers
            },
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
            throw new Error(`Server reageerde met status ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            return { success: true, data: await response.json() };
        } else {
            // Treat as text/csv if not JSON
            return { success: true, text: await response.text() };
        }
    } catch (err: any) {
        return { success: false, message: err.message };
    }
}
