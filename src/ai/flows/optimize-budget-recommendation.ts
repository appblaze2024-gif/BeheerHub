'use server';

/**
 * @fileOverview Provides budget optimization recommendations based on revenue and expenses.
 *
 * - optimizeBudget - A function that analyzes financial data and provides recommendations.
 * - OptimizeBudgetInput - The input type for the optimizeBudget function, including revenue and expense data.
 * - OptimizeBudgetOutput - The return type for the optimizeBudget function, providing budget optimization recommendations.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeBudgetInputSchema = z.object({
  revenue: z.number().describe('Total revenue.'),
  expenses: z.number().describe('Total expenses.'),
  expenseBreakdown: z
    .record(z.string(), z.number())
    .describe('A breakdown of expenses by category.'),
});
export type OptimizeBudgetInput = z.infer<typeof OptimizeBudgetInputSchema>;

const OptimizeBudgetOutputSchema = z.object({
  recommendations: z
    .array(z.string())
    .describe('A list of budget optimization recommendations.'),
  summary: z.string().describe('A summary of the budget optimization analysis.'),
});
export type OptimizeBudgetOutput = z.infer<typeof OptimizeBudgetOutputSchema>;

export async function optimizeBudget(input: OptimizeBudgetInput): Promise<OptimizeBudgetOutput> {
  return optimizeBudgetFlow(input);
}

const prompt = ai.definePrompt({
  name: 'optimizeBudgetPrompt',
  input: {schema: OptimizeBudgetInputSchema},
  output: {schema: OptimizeBudgetOutputSchema},
  prompt: `You are a financial advisor providing budget optimization recommendations to small businesses.

Analyze the following revenue and expense data to provide actionable recommendations for improving profitability.

Revenue: ${'{{revenue}}'}
Expenses: ${'{{expenses}}'}
Expense Breakdown:
${'{{#each expenseBreakdown}}'}
- ${'{{@key}}'}: ${'{{this}}'}
${'{{/each}}'}

Provide specific recommendations for reducing expenses or increasing revenue, and summarize your analysis.
`,
});

const optimizeBudgetFlow = ai.defineFlow(
  {
    name: 'optimizeBudgetFlow',
    inputSchema: OptimizeBudgetInputSchema,
    outputSchema: OptimizeBudgetOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
