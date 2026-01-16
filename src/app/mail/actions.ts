'use server';

import { z } from 'zod';
import nodemailer from 'nodemailer';

const mailSchema = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
  fromName: z.string().optional(),
});

const mailWithAttachmentSchema = mailSchema.extend({
  attachment: z.object({
    content: z.string(), // base64 encoded content
    filename: z.string(),
    type: z.string(),
  }),
});

// Create a transporter object using SMTP transport
// The user needs to configure these in their environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


export async function sendEmail(data: z.infer<typeof mailSchema>) {
  const parsedData = mailSchema.parse(data);

  const fromDisplayName = parsedData.fromName
    ? `${parsedData.fromName} namens BeheerHub`
    : 'BeheerHub';

  if (!process.env.SMTP_HOST) {
    console.error('SMTP settings not configured. Email will not be sent.');
    console.log('--- SIMULATING Email ---');
    console.log(`From: "${fromDisplayName}" <${process.env.SMTP_FROM_EMAIL || 'not-configured'}>`);
    console.log(`To: ${parsedData.to}`);
    console.log(`Subject: ${parsedData.subject}`);
    console.log('--- Body ---');
    console.log(parsedData.body);
    console.log('--- Email "Sent" ---');
    // Simulate success for the user
    return { success: true, message: 'Email "sent" (simulation).' };
  }

  const mailOptions = {
    from: `"${fromDisplayName}" <${process.env.SMTP_FROM_EMAIL}>`, // sender address
    to: parsedData.to, // list of receivers
    subject: parsedData.subject, // Subject line
    text: parsedData.body, // plain text body
    html: `<p>${parsedData.body.replace(/\n/g, '<br>')}</p>`, // html body
  };
  
  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    // In a real app, you might want to throw a more specific error
    // or return a more detailed error message.
    throw new Error('Failed to send email.');
  }
}

export async function sendEmailWithAttachment(data: z.infer<typeof mailWithAttachmentSchema>) {
  const parsedData = mailWithAttachmentSchema.parse(data);

  const fromDisplayName = parsedData.fromName
    ? `${parsedData.fromName} namens BeheerHub`
    : 'BeheerHub';

  if (!process.env.SMTP_HOST) {
    console.error('SMTP settings not configured. Email will not be sent.');
    console.log('--- SIMULATING Email with Attachment ---');
    console.log(`From: "${fromDisplayName}" <${process.env.SMTP_FROM_EMAIL || 'not-configured'}>`);
    console.log(`To: ${parsedData.to}`);
    console.log(`Subject: ${parsedData.subject}`);
    console.log('--- Body ---');
    console.log(parsedData.body);
    console.log('--- Attachment ---');
    console.log(`Filename: ${parsedData.attachment.filename}`);
    console.log(`Type: ${parsedData.attachment.type}`);
    console.log('--- Email "Sent" ---');
    // Simulate success for the user
    return { success: true, message: 'Email with attachment "sent" (simulation).' };
  }

  const mailOptions = {
    from: `"${fromDisplayName}" <${process.env.SMTP_FROM_EMAIL}>`,
    to: parsedData.to,
    subject: parsedData.subject,
    text: parsedData.body,
    html: `<p>${parsedData.body.replace(/\n/g, '<br>')}</p>`,
    attachments: [
      {
        filename: parsedData.attachment.filename,
        content: parsedData.attachment.content,
        encoding: 'base64' as const,
        contentType: parsedData.attachment.type,
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Email with attachment sent successfully' };
  } catch (error) {
    console.error('Error sending email with attachment:', error);
    throw new Error('Failed to send email with attachment.');
  }
}
