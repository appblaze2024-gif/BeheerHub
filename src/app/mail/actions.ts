'use server';

import { z } from 'zod';
import nodemailer from 'nodemailer';

const attachmentSchema = z.object({
  content: z.string(), // base64 encoded content
  filename: z.string(),
  type: z.string(),
});

const mailSchema = z.object({
  to: z.string().email(),
  cc: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  fromName: z.string().min(1, "Afzendernaam is verplicht."),
  attachments: z.array(attachmentSchema).optional(),
});

export async function sendEmail(data: z.infer<typeof mailSchema>) {
  const parsedData = mailSchema.parse(data);
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    const errorMessage = 'SMTP-instellingen zijn niet volledig geconfigureerd in het .env-bestand.';
    console.error(errorMessage);
    return { success: false, message: errorMessage };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_PORT === '465',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const fromAddress = `"${parsedData.fromName}" <${SMTP_USER}>`;

  const mailOptions: nodemailer.SendMailOptions = {
    from: fromAddress,
    to: parsedData.to,
    cc: parsedData.cc,
    subject: parsedData.subject,
    text: parsedData.body,
    html: `<p>${parsedData.body.replace(/\n/g, '<br>')}</p>`,
  };

  if (parsedData.attachments && parsedData.attachments.length > 0) {
    mailOptions.attachments = parsedData.attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        encoding: 'base64',
        contentType: att.type,
      }));
  }

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: `E-mail succesvol verzonden` };
  } catch (error: any) {
    console.error('Fout bij verzenden e-mail:', error);
    if (error.code === 'EENVELOPE') {
        if (error.responseCode === 553) {
            return { success: false, message: `Verzenden mislukt: U bent niet geautoriseerd om namens dit e-mailadres te verzenden.` };
        }
    }
    return { success: false, message: `Verzenden van e-mail mislukt: ${error.message || 'Onbekende fout'}` };
  }
}
