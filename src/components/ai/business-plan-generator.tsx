"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  generateBusinessPlan,
  type BusinessPlanOutput,
} from "@/ai/flows/generate-business-plan";
import { Loader2, Book } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function BusinessPlanGenerator() {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<BusinessPlanOutput | null>(null);
  const [prompt, setPrompt] = React.useState(
    "A subscription box service for eco-friendly dog toys."
  );
  const { toast } = useToast();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt) {
      toast({
        title: "Prompt is empty",
        description: "Please describe your business idea.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const output = await generateBusinessPlan({ prompt });
      setResult(output);
    } catch (error) {
      console.error("Error generating business plan:", error);
      toast({
        title: "Generation Failed",
        description: "There was an error generating your business plan.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="business-prompt" className="text-sm font-medium">
            Your Business Idea
          </label>
          <Textarea
            id="business-prompt"
            placeholder="Describe your business idea in detail..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate Plan
        </Button>
      </form>

      <div>
        {loading && (
          <div className="flex flex-col items-center justify-center h-full space-y-4 text-center p-8 border rounded-lg">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">
              Generating your business plan...
            </p>
          </div>
        )}
        {!loading && !result && (
            <div className="flex flex-col items-center justify-center h-full space-y-4 text-center p-8 border-2 border-dashed rounded-lg">
                <Book className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">Your generated business plan will appear here.</p>
            </div>
        )}
        {result && (
          <Card className="bg-background/50 max-h-[60vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Book className="h-5 w-5" /> Generated Business Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-sans">
                {result.businessPlan}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
