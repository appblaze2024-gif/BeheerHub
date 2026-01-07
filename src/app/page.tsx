"use client";

import * as React from "react";
import {
  ClipboardList,
  ListTodo,
  Newspaper,
  Activity,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
};

function StatCard({ title, value, description, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const overviewData = [
    {
      title: "Actieve Projecten",
      value: "3",
      description: "1 project is nieuw",
      icon: ClipboardList,
    },
    {
      title: "Openstaande Taken",
      value: "12",
      description: "3 taken zijn over tijd",
      icon: ListTodo,
    },
    {
      title: "Recente Weekstaten",
      value: "5",
      description: "Ingevuld voor week 34",
      icon: Newspaper,
    },
    {
      title: "Recente Activiteit",
      value: "+57",
      description: "Nieuwe acties sinds gisteren",
      icon: Activity,
    },
  ];

  return (
    <div className="flex flex-1 flex-col bg-gray-50 dark:bg-gray-900">
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {overviewData.map((data) => (
            <StatCard key={data.title} {...data} />
          ))}
        </div>
      </main>
    </div>
  );
}
