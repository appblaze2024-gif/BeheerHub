'use server';

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
            body: JSON.stringify(payload),
            // Voeg een timeout toe om te voorkomen dat de actie te lang blijft hangen
            signal: AbortSignal.timeout(15000) 
        });

        const status = response.status;
        const responseText = await response.text();

        return {
            success: response.ok,
            status,
            responseText: responseText.slice(0, 1000) || '(Geen respons van server)'
        };
    } catch (err: any) {
        console.error("Webhook Dispatch Error:", err);
        
        let message = 'De externe server is onbereikbaar.';
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            message = 'De verbinding is verbroken (Timeout na 15s).';
        } else if (err.message?.includes('ENOTFOUND')) {
            message = 'Het domein van de URL kon niet worden gevonden (DNS fout).';
        } else if (err.message?.includes('ECONNREFUSED')) {
            message = 'De externe server weigert de verbinding op deze poort.';
        }

        return {
            success: false,
            status: 0,
            responseText: `Netwerkfout: ${message} (${err.message || 'fetch failed'})`
        };
    }
}
