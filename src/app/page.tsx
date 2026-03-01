'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ChevronRight,
  GitFork,
  LayoutGrid,
  Zap,
  Activity,
  ChevronDown,
  Monitor,
  Share2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const filters = [
  { label: 'Discipline', options: ['Bomen', 'Wegen', 'Verlichting'] },
  { label: 'Entiteit', options: ['Object', 'Sensormeting'] },
  { label: 'Standaard', options: ['IMBOR (2022.01.01)', 'IMBOR (2021.04.04)'] },
  { label: 'Versie', options: ['1.0', '2.0'] },
  { label: 'Applicatie', options: ['GeoVisia', 'MOON', 'GRIB'] },
];

const cards = [
  {
    title: 'GeoVisia',
    subtitle: 'DataQuint',
    tags: [{ label: 'Bomen', color: 'bg-green-100 text-green-700' }, { label: 'Object', color: 'bg-slate-100 text-slate-700' }],
    footer: 'IMBOR (2022.01.01)',
    logo: 'https://picsum.photos/seed/gv/100/100',
  },
  {
    title: 'MOON',
    subtitle: 'Montad',
    tags: [{ label: 'Verlichting', color: 'bg-yellow-100 text-yellow-700' }, { label: 'Object', color: 'bg-slate-100 text-slate-700' }],
    footer: 'IMBOR (2022.01.01)',
    logo: 'https://picsum.photos/seed/moon/100/100',
  },
  {
    title: 'GRIB',
    subtitle: 'Bomenwacht',
    tags: [{ label: 'Bomen', color: 'bg-green-100 text-green-700' }, { label: 'Object', color: 'bg-slate-100 text-slate-700' }],
    footer: 'IMBOR (2022.01.01)',
    logo: 'https://picsum.photos/seed/grib/100/100',
  },
  {
    title: 'ConnectedGreen',
    subtitle: 'ConnectedGreen',
    tags: [{ label: 'Sensoren', color: 'bg-slate-100 text-slate-700' }, { label: 'Sensormeting', color: 'bg-slate-100 text-slate-700' }],
    footer: 'IMBOR (2022.01.01)',
    logo: 'https://picsum.photos/seed/cg/100/100',
  },
  {
    title: 'MOON',
    subtitle: 'Montad',
    tags: [{ label: 'Verlichting', color: 'bg-yellow-100 text-yellow-700' }, { label: 'Object', color: 'bg-slate-100 text-slate-700' }],
    footer: 'IMBOR (2021.04.04)',
    logo: 'https://picsum.photos/seed/moon2/100/100',
  },
  {
    title: 'ConnectedGreen',
    subtitle: 'ConnectedGreen',
    tags: [{ label: 'Sensoren', color: 'bg-slate-100 text-slate-700' }, { label: 'Object', color: 'bg-slate-100 text-slate-700' }],
    footer: 'IMBOR (2021.04.04)',
    logo: 'https://picsum.photos/seed/cg2/100/100',
  },
];

export default function DashboardPage() {
  const [activeToggle, setActiveToggle] = React.useState<'bron' | 'afnemer'>('bron');

  return (
    <div className="p-10 space-y-8 flex flex-col h-full bg-[#f8fafc] relative">
      {/* Background Graphic Illustration */}
      <div className="absolute top-0 right-0 w-[600px] h-[400px] opacity-20 pointer-events-none grayscale">
        <Image 
          src="https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&q=80&w=1000" 
          alt="Illustration" 
          fill
          className="object-contain object-right-top"
        />
      </div>

      <header className="space-y-6 relative z-10">
        <h1 className="text-3xl font-black uppercase tracking-tight text-[#4a5ab5]">Bronnen en afnemers</h1>
        
        <div className="flex items-center p-1.5 bg-slate-200/50 rounded-lg w-fit">
          <button 
            onClick={() => setActiveToggle('bron')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-md text-xs font-bold transition-all",
              activeToggle === 'bron' ? "bg-white text-[#4a5ab5] shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Activity className="h-4 w-4" /> Bron
          </button>
          <button 
            onClick={() => setActiveToggle('afnemer')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-md text-xs font-bold transition-all",
              activeToggle === 'afnemer' ? "bg-white text-[#4a5ab5] shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Share2 className="h-4 w-4" /> Afnemer
          </button>
        </div>
      </header>

      <Card className="rounded-none border-none shadow-sm relative z-10 overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="flex items-center h-14 bg-slate-50/50 border-b border-slate-100">
            <div className="px-6 border-r border-slate-100 h-full flex items-center">
              <span className="text-xs font-bold text-[#4a5ab5]">Filters</span>
            </div>
            <div className="flex flex-1 divide-x divide-slate-100">
              {filters.map((filter) => (
                <button key={filter.label} className="flex-1 px-6 h-14 flex items-center justify-between group hover:bg-slate-100/50 transition-colors">
                  <span className="text-xs font-medium text-slate-400 group-hover:text-slate-600">{filter.label}</span>
                  <ChevronDown className="h-3 w-3 text-slate-300" />
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {cards.map((card, idx) => (
                <Card key={idx} className="group rounded-xl border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden bg-white">
                  <CardContent className="p-8 space-y-6">
                    <div className="h-32 flex items-center justify-center">
                      <div className="relative h-20 w-20">
                        <Image src={card.logo} alt={card.title} fill className="object-contain filter grayscale group-hover:grayscale-0 transition-all duration-500" />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-center">
                      {card.tags.map((tag, tIdx) => (
                        <Badge key={tIdx} className={cn("rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-tight border-none shadow-none", tag.color)}>
                          {tag.label}
                        </Badge>
                      ))}
                    </div>

                    <div className="text-center space-y-1">
                      <h3 className="text-sm font-black text-[#4a5ab5] uppercase tracking-tight">{card.title}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{card.subtitle}</p>
                    </div>

                    <div className="pt-4 border-t border-slate-50 text-center">
                      <span className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">{card.footer}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}