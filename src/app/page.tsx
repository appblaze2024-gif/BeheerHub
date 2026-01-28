"use client";

import { Card, CardContent } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1 p-6">
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardContent className="p-10 text-center">
            <h1 className="text-2xl font-bold mb-4">Welkom bij BeheerHub</h1>
            <p className="text-muted-foreground">
              Gebruik het menu om te navigeren.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
