'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

export default function AnnualPlanningPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-slate-50">
      <PageHeader 
        title="Jaarplanning" 
        description="Overzicht van de geplande projecten en werkzaamheden voor het huidige jaar."
      />
      
      <div className="flex-1 mt-6">
        <Card className="h-full border-2 border-dashed border-slate-200 bg-white/50 flex flex-col items-center justify-center text-center p-12">
          <div className="bg-white p-6 rounded-full shadow-sm mb-4">
            <Calendar className="h-12 w-12 text-slate-300" />
          </div>
          <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">Module in ontwikkeling</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2">
            De Jaarplanning module wordt momenteel geconfigureerd om een visueel overzicht te bieden van alle langetermijnprojecten.
          </p>
        </Card>
      </div>
    </div>
  );
}
