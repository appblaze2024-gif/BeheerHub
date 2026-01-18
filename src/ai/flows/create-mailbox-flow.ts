'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import imaps from 'imap-simple';

const CreateMailboxInputSchema = z.object({
  mailboxName: z.string().min(1, 'Folder name cannot be empty.'),
});
export type CreateMailboxInput = z.infer<typeof CreateMailboxInputSchema>;

async function createMailbox(input: CreateMailboxInput): Promise<{ success: boolean; message: string }> {
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
    // Prefixed with INBOX/ as this seems to be the convention for this user's server
    await connection.addBox(`INBOX/${input.mailboxName}`);
    connection.end();
    return { success: true, message: `Map '${input.mailboxName}' aangemaakt.` };
  } catch (err: any) {
    console.error('Failed to create mailbox:', err);
    if (connection) {
      connection.end();
    }
    // Provide a more user-friendly error
    if (err.message.includes('Mailbox exists')) {
        throw new Error(`Map '${input.mailboxName}' bestaat al.`);
    }
    throw err;
  }
}

export const createMailboxFlow = ai.defineFlow(
  {
    name: 'createMailboxFlow',
    inputSchema: CreateMailboxInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (input) => {
    return await createMailbox(input);
  }
);
