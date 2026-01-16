'use server';

import { z } from 'zod';

const mailSchema = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
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
