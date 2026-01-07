"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  summarizeExpenseReport,
  type SummarizeExpenseReportOutput,
} from "@/ai/flows/summarize-expense-reports";
import { Loader2, FileText, UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ExpenseSummarizer() {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<SummarizeExpenseReportOutput | null>(
    null
  );
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select an expense report file to summarize.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      try {
        const dataUri = reader.result as string;
        const output = await summarizeExpenseReport({ expenseReportDataUri: dataUri });
        setResult(output);
      } catch (error) {
        console.error("Error summarizing expense report:", error);
        toast({
          title: "Summarization Failed",
          description: "There was an error processing your expense report.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = (error) => {
        console.error("Error reading file:", error);
        toast({
          title: "File Read Error",
          description: "Could not read the selected file.",
          variant: "destructive",
        });
        setLoading(false);
    };
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="space-y-4">
        <div className="space-y-2">
            <p className="text-sm font-medium">Upload Expense Report</p>
            <Input type="file" onChange={handleFileChange} />
            <p className="text-sm text-muted-foreground">
                Upload an image, PDF, or CSV of your expense report.
            </p>
        </div>
        <Button onClick={handleSubmit} disabled={loading || !selectedFile}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Summarize Report
        </Button>
      </div>

      <div>
        {loading && (
          <div className="flex flex-col items-center justify-center h-full space-y-4 text-center p-8 border rounded-lg">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Reading and analyzing your report...</p>
          </div>
        )}
         {!loading && !result && (
          <div className="flex flex-col items-center justify-center h-full space-y-4 text-center p-8 border-2 border-dashed rounded-lg">
            <UploadCloud className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Your summary will appear here.</p>
          </div>
        )}
        {result && (
          <Card className="bg-background/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-wrap font-sans">{result.summary}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
