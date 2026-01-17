'use server';

import { z } from 'zod';
import nodemailer from 'nodemailer';

const mailSchema = z.object({
  to: z.string().email(),
  cc: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
});

const mailWithAttachmentSchema = mailSchema.extend({
  attachment: z.object({
    content: z.string(), // base64 encoded content
    filename: z.string(),
    type: z.string(),
  }),
});

async function sendMail(isAttachment: boolean, data: any) {
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

  const fromDisplayName = data.fromName || SMTP_USER;

  const mailOptions: nodemailer.SendMailOptions = {
    from: {
      name: fromDisplayName,
      address: SMTP_USER,
    },
    to: data.to,
    cc: data.cc,
    subject: data.subject,
    text: data.body,
    html: `<p>${data.body.replace(/\n/g, '<br>')}</p>`,
    replyTo: data.fromEmail || undefined,
  };

  if (isAttachment) {
    mailOptions.attachments = [
      {
        filename: data.attachment.filename,
        content: data.attachment.content,
        encoding: 'base64',
        contentType: data.attachment.type,
      },
    ];
  }

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: `E-mail ${isAttachment ? 'met bijlage ' : ''}succesvol verzonden` };
  } catch (error: any) {
    console.error('Fout bij verzenden e-mail:', error);
    return { success: false, message: `Verzenden van e-mail mislukt: ${error.message || 'Onbekende fout'}` };
  }
}

export async function sendEmail(data: z.infer<typeof mailSchema>) {
  const parsedData = mailSchema.parse(data);
  return sendMail(false, parsedData);
}

export async function sendEmailWithAttachment(data: z.infer<typeof mailWithAttachmentSchema>) {
  const parsedData = mailWithAttachmentSchema.parse(data);
  return sendMail(true, parsedData);
}
