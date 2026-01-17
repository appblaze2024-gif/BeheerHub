'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
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

async function fetchEmails(mailbox: string): Promise<FetchEmailsOutput> {
  const config = {
    imap: {
      user: process.env.IMAP_USER || '',
      password: process.env.IMAP_PASS || '',
      host: process.env.IMAP_HOST || '',
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      tls: process.env.IMAP_TLS === 'true',
      authTimeout: 10000,
    },
  };
  
  if (!config.imap.user || !config.imap.password || !config.imap.host) {
    throw new Error('IMAP-inloggegevens zijn niet geconfigureerd in het .env-bestand.');
  }

  let connection;
  try {
    connection = await imaps.connect(config);
    await connection.openBox(mailbox);

    const searchCriteria = ['ALL'];
    const fetchOptions = {
      bodies: [''],
      markSeen: false,
    };
    
    const allMessages = await connection.search(searchCriteria, fetchOptions);
    
    const sortedMessages = allMessages.sort((a, b) => b.attributes.uid - a.attributes.uid);
    
    const recentMessages = sortedMessages.slice(0, 100);

    if (recentMessages.length === 0) {
        connection.end();
        return [];
    }
    
    const emails = await Promise.all(
      recentMessages.map(async (item) => {
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
    // Sort emails by date descending (newest first)
    return emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (err: any) {
    console.error('Failed to fetch emails:', err);
    if (connection) {
      connection.end();
    }
    // Re-throw the error to be caught by the client
    throw err;
  }
}

export const fetchEmailsFlow = ai.defineFlow(
  {
    name: 'fetchEmailsFlow',
    inputSchema: z.string(),
    outputSchema: FetchEmailsOutputSchema,
  },
  async (mailbox) => {
    return await fetchEmails(mailbox);
  }
);
