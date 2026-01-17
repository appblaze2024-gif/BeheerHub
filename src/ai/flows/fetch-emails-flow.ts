'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit/zod';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

const EmailSchema = z.object({
  id: z.string(),
  from: z.string(),
  fromName: z.string(),
  subject: z.string(),
  body: z.string(),
  date: z.string(),
  read: z.boolean(),
});

const FetchEmailsOutputSchema = z.array(EmailSchema);
export type FetchEmailsOutput = z.infer<typeof FetchEmailsOutputSchema>;

async function fetchEmails(): Promise<FetchEmailsOutput> {
  const config = {
    imap: {
      user: process.env.IMAP_USER || '',
      password: process.env.IMAP_PASS || '',
      host: process.env.IMAP_HOST || '',
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      tls: process.env.IMAP_TLS === 'true',
      authTimeout: 3000,
    },
  };
  
  if (!config.imap.user || !config.imap.password || !config.imap.host) {
    console.warn('IMAP credentials not configured. Skipping email fetch.');
    return [];
  }

  let connection;
  try {
    connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    // Fetch the last 25 emails
    const searchCriteria = ['ALL'];
    const fetchOptions = {
      bodies: [''],
      markSeen: false,
    };
    
    // get UIDs of all messages
    const results = await connection.search(searchCriteria, fetchOptions);
    const uids = results.map(res => res.attributes.uid);
    const recentUids = uids.slice(-25);

    if (recentUids.length === 0) {
        connection.end();
        return [];
    }
    
    const messages = await connection.fetch(recentUids, {
        bodies: [''],
        markSeen: false,
    });

    const emails = await Promise.all(
      messages.map(async (item) => {
        const all = item.parts.find((part) => part.which === '');
        const id = item.attributes.uid;
        const body = all ? all.body : '';
        const parsed = await simpleParser(body);

        return {
          id: parsed.messageId || id.toString(),
          from: parsed.from?.value[0]?.address || 'Unknown Sender',
          fromName: parsed.from?.value[0]?.name || 'Unknown Sender',
          subject: parsed.subject || '(No Subject)',
          body: parsed.html || parsed.textAsHtml || '',
          date: parsed.date?.toISOString() || new Date().toISOString(),
          read: item.attributes.flags.includes('\\Seen'),
        };
      })
    );

    connection.end();
    return emails.reverse();
  } catch (err) {
    console.error('Failed to fetch emails:', err);
    if (connection) {
      connection.end();
    }
    // In case of error, return an empty array to prevent app crash
    return [];
  }
}

export const fetchEmailsFlow = ai.defineFlow(
  {
    name: 'fetchEmailsFlow',
    inputSchema: z.void(),
    outputSchema: FetchEmailsOutputSchema,
  },
  async () => {
    return await fetchEmails();
  }
);
