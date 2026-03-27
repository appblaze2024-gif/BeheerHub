'use server';

/**
 * Server Action om webhooks te verzenden.
 * Dit voorkomt CORS-fouten in de browser en is veiliger.
 */
export async function triggerWebhookSync(endpoint: string, method: string, headers: Record<string, string>, payload: any) {
    try {
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
            responseText: responseText.slice(0, 1000)
        };
    } catch (err: any) {
        console.error("Webhook Dispatch Error:", err);
        return {
            success: false,
            status: 0,
            responseText: `Netwerkfout: ${err.message || 'De externe server is onbereikbaar of weigert de verbinding.'}`
        };
    }
}
