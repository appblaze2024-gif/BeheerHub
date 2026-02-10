'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Cpu, Wifi, Database } from 'lucide-react';

export default function IoTPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-background">
      <PageHeader 
        title="IoT Dashboard & AI Integratie" 
        description="Beheer je sensoren en gebruik AI om direct werkende code voor je ESP32 te schrijven."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wifi className="h-4 w-4 text-blue-600" />
              Verbonden Apparaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Geen actieve sensoren gedetecteerd</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/10 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-green-600" />
              Data Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Laatste 24 uur</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 dark:bg-purple-900/10 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-600" />
              Systeem Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Online</p>
            <p className="text-xs text-muted-foreground">AI Gateway is operationeel</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
