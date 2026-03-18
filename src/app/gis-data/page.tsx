'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Layers } from 'lucide-react';

export default function GISDataPage() {
  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-slate-50">
      <PageHeader 
        title="GIS-data" 
        description="Beheer geografische lagen en spatial data."
      />
      <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-12 text-center">
        <div className="bg-white p-12 rounded-none shadow-2xl mb-8 border-4 border-slate-100">
            <Layers className="h-24 w-24 text-primary opacity-20" />
        </div>
        <h3 className="text-2xl font-black uppercase tracking-tight text-slate-400 mb-2">GIS Module</h3>
        <p className="text-sm font-medium text-slate-400 max-w-[300px] mx-auto leading-relaxed">
          Deze module is momenteel in ontwikkeling. Hier kunt u binnenkort geografische lagen en Shapefiles beheren en visualiseren.
        </p>
      </div>
    </div>
  );
}
