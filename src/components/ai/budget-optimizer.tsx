"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { optimizeBudget, type OptimizeBudgetOutput } from "@/ai/flows/optimize-budget-recommendation";
import { Loader2, Lightbulb } from "lucide-react";

const formSchema = z.object({
  revenue: z.coerce.number().positive(),
  expenses: z.coerce.number().positive(),
  marketing: z.coerce.number().nonnegative(),
  software: z.coerce.number().nonnegative(),
  other: z.coerce.number().nonnegative(),
});

export function BudgetOptimizer() {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<OptimizeBudgetOutput | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      revenue: 5000,
      expenses: 3200,
      marketing: 1200,
      software: 800,
      other: 1200,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setResult(null);
    try {
      const output = await optimizeBudget({
        revenue: values.revenue,
        expenses: values.expenses,
        expenseBreakdown: {
          Marketing: values.marketing,
          Software: values.software,
          Other: values.other,
        },
      });
      setResult(output);
    } catch (error) {
      console.error("Error optimizing budget:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="revenue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Revenue</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="5000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expenses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Expenses</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="3200" {...field} />
                  </FormControl>
                   <FormDescription>
                    Provide a breakdown of your major expenses below.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <div className="space-y-4 rounded-lg border p-4">
                <h4 className="font-medium">Expense Breakdown</h4>
                <FormField
                control={form.control}
                name="marketing"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Marketing</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="1200" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="software"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Software</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="800" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="other"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Other</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="1200" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
             </div>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Get Recommendations
            </Button>
          </form>
        </Form>
      </div>
      <div>
        {loading && (
            <div className="flex flex-col items-center justify-center h-full space-y-4 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Analyzing your budget...</p>
            </div>
        )}
        {result && (
          <Card className="bg-background/50">
            <CardHeader>
              <CardTitle>AI Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm font-medium">{result.summary}</p>
                <ul className="space-y-2">
                    {result.recommendations.map((rec, index) => (
                        <li key={index} className="flex gap-2 text-sm">
                            <Lightbulb className="h-4 w-4 mt-1 flex-shrink-0 text-accent" />
                            <span>{rec}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
