import { PageHeader } from "@/components/page-header";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { BudgetOptimizer } from "@/components/ai/budget-optimizer";
import { ExpenseSummarizer } from "@/components/ai/expense-summarizer";
import { BusinessPlanGenerator } from "@/components/ai/business-plan-generator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AiToolsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <PageHeader
        title="AI-Powered Smart Recommendations"
        description="Leverage AI to get intelligent suggestions and automate tasks."
      />
      <main className="flex flex-1 flex-col gap-4 md:gap-8">
        <Tabs defaultValue="budget" className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
            <TabsTrigger value="budget">Budget Optimizer</TabsTrigger>
            <TabsTrigger value="expenses">Expense Summarizer</TabsTrigger>
            <TabsTrigger value="plan">Business Plan Generator</TabsTrigger>
          </TabsList>
          <TabsContent value="budget" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Budget Optimizer</CardTitle>
                <CardDescription>
                  Analyze your finances and get AI-powered recommendations to improve profitability.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BudgetOptimizer />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="expenses" className="mt-4">
             <Card>
              <CardHeader>
                <CardTitle>Expense Report Summarizer</CardTitle>
                <CardDescription>
                  Upload an expense report to get a quick summary of spending patterns.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExpenseSummarizer />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="plan" className="mt-4">
             <Card>
              <CardHeader>
                <CardTitle>Business Plan Generator</CardTitle>
                <CardDescription>
                  Describe your business idea, and let our AI generate a comprehensive business plan for you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BusinessPlanGenerator />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
