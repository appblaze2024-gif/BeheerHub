'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import imaps from 'imap-simple';

const DeleteEmailInputSchema = z.object({
  mailbox: z.string(),
  uid: z.number(),
});
export type DeleteEmailInput = z.infer<typeof DeleteEmailInputSchema>;

async function deleteEmail(input: DeleteEmailInput): Promise<{ success: boolean; message: string }> {
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
    await connection.openBox(input.mailbox);

    await connection.deleteMessage(input.uid);
    
    // Close the mailbox and expunge deleted messages
    await connection.closeBox(true); 

    connection.end();
    return { success: true, message: 'E-mail verwijderd.' };
  } catch (err: any) {
    console.error('Failed to delete email:', err);
    if (connection) {
      connection.end();
    }
    throw err;
  }
}

export const deleteEmailFlow = ai.defineFlow(
  {
    name: 'deleteEmailFlow',
    inputSchema: DeleteEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (input) => {
    return await deleteEmail(input);
  }
);
