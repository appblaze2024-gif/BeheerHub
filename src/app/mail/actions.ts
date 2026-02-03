'use server';

import { z } from 'zod';
import nodemailer from 'nodemailer';

const attachmentSchema = z.object({
  content: z.string().optional(), // base64 encoded content
  url: z.string().url().optional(), // remote URL path
  filename: z.string(),
  type: z.string(),
});

const mailSchema = z.object({
  to: z.string().min(1, 'Ontvanger is verplicht'),
  cc: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(attachmentSchema).optional(),
});

export async function sendEmail(data: z.infer<typeof mailSchema>) {
  try {
    const parsedData = mailSchema.parse(data);
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS
    } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      const errorMessage = 'SMTP-instellingen zijn niet volledig geconfigureerd in het .env-bestand op de server.';
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
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    // Verify connection configuration
    try {
      await transporter.verify();
    } catch (verifyError: any) {
      console.error('SMTP Verificatie mislukt:', verifyError);
      return { 
        success: false, 
        message: `Verbinding met mailserver mislukt: ${verifyError.message || 'Controleer host/poort/inloggegevens'}` 
      };
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: {
          name: "BeheerHub Notificatie",
          address: SMTP_USER,
      },
      to: parsedData.to,
      cc: parsedData.cc,
      subject: parsedData.subject,
      text: parsedData.body,
      html: `<p>${parsedData.body.replace(/\n/g, '<br>')}</p>`,
    };

    if (parsedData.attachments && parsedData.attachments.length > 0) {
      mailOptions.attachments = parsedData.attachments.map(att => {
        if (att.url) {
          return {
            filename: att.filename,
            path: att.url,
            contentType: att.type,
          };
        }
        return {
          filename: att.filename,
          content: att.content,
          encoding: 'base64',
          contentType: att.type,
        };
      });
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('E-mail succesvol verzonden:', info.messageId);
    return { success: true, message: `E-mail succesvol verzonden` };
  } catch (error: any) {
    console.error('Fout bij verzenden e-mail:', error);
    return { 
      success: false, 
      message: `Verzenden van e-mail mislukt: ${error.message || 'Onbekende serverfout'}` 
    };
  }
}
