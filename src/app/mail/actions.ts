'use server';

import { z } from 'zod';

const mailSchema = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
});

const mailWithAttachmentSchema = mailSchema.extend({
  attachment: z.object({
    content: z.string(), // base64 encoded content
    filename: z.string(),
    type: z.string(),
  }),
});


export async function sendEmail(data: z.infer<typeof mailSchema>) {
  const parsedData = mailSchema.parse(data);

  // In a real application, you would integrate with an email sending service
  // like SendGrid, Resend, or use Nodemailer with an SMTP server.
  // For this demonstration, we'll just log the email to the console.
  
  console.log('--- Sending Email ---');
  console.log(`To: ${parsedData.to}`);
  console.log(`Subject: ${parsedData.subject}`);
  console.log('--- Body ---');
  console.log(parsedData.body);
  console.log('--- Email "Sent" ---');

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // In a real scenario, you might return data from the email service
  return { success: true, message: 'Email sent successfully' };
}

export async function sendEmailWithAttachment(data: z.infer<typeof mailWithAttachmentSchema>) {
  const parsedData = mailWithAttachmentSchema.parse(data);

  console.log('--- Sending Email with Attachment ---');
  console.log(`To: ${parsedData.to}`);
  console.log(`Subject: ${parsedData.subject}`);
  console.log('--- Body ---');
  console.log(parsedData.body);
  console.log('--- Attachment ---');
  console.log(`Filename: ${parsedData.attachment.filename}`);
  console.log(`Type: ${parsedData.attachment.type}`);
  console.log(`Content size (base64): ${parsedData.attachment.content.length} characters`);
  console.log('--- Email "Sent" ---');

  await new Promise(resolve => setTimeout(resolve, 1000));

  return { success: true, message: 'Email with attachment sent successfully' };
}
