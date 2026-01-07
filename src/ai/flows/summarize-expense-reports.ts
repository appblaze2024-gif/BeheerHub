'use server';

/**
 * @fileOverview Summarizes expense reports to quickly understand spending patterns.
 *
 * - summarizeExpenseReport - A function that summarizes an expense report.
 * - SummarizeExpenseReportInput - The input type for the summarizeExpenseReport function.
 * - SummarizeExpenseReportOutput - The return type for the summarizeExpenseReport function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeExpenseReportInputSchema = z.object({
  expenseReportDataUri: z
    .string()
    .describe(
      'An expense report as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.'
    ),
});
export type SummarizeExpenseReportInput = z.infer<
  typeof SummarizeExpenseReportInputSchema
>;

const SummarizeExpenseReportOutputSchema = z.object({
  summary: z.string().describe('A summary of the expense report.'),
});
export type SummarizeExpenseReportOutput = z.infer<
  typeof SummarizeExpenseReportOutputSchema
>;

export async function summarizeExpenseReport(
  input: SummarizeExpenseReportInput
): Promise<SummarizeExpenseReportOutput> {
  return summarizeExpenseReportFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeExpenseReportPrompt',
  input: {schema: SummarizeExpenseReportInputSchema},
  output: {schema: SummarizeExpenseReportOutputSchema},
  prompt: `You are an expert financial analyst tasked with summarizing expense reports. Analyze the provided expense report and provide a concise summary highlighting key spending patterns, major expense categories, and any anomalies or areas of concern.

Expense Report:
{{expenseReportDataUri}}`,
});

const summarizeExpenseReportFlow = ai.defineFlow(
  {
    name: 'summarizeExpenseReportFlow',
    inputSchema: SummarizeExpenseReportInputSchema,
    outputSchema: SummarizeExpenseReportOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
