'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Activity,
  Share2,
  LayoutGrid,
  Users,
  RefreshCw,
  Settings,
  Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProfile } from '@/firebase/profile-provider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';

const topMenuItems = [
  { href: '/', label: 'Monitor', icon: Activity },
  { href: '/projects', label: 'Koppelingen', icon: Share2 },
  { href: '/annual-planning', label: 'Mijn Store', icon: LayoutGrid },
  { href: '/objects', label: 'Store', icon: Store },
];

const bottomMenuItems = [
  { href: '/employees', label: 'Gebruikers', icon: Users },
  { href: '/projects', label: 'Organisatie', icon: RefreshCw },
  { href: '/settings', label: 'Instellingen', icon: Settings },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full sidebar-blue text-white items-center py-6">
      <div className="shrink-0 flex items-center justify-center mb-8">
        <div className="h-12 w-12 relative flex items-center justify-center bg-white rounded-full p-2">
          <Image 
            src="https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png" 
            alt="Logo" 
            width={32}
            height={32}
            className="object-contain" 
          />
        </div>
      </div>

      <ScrollArea className="flex-1 w-full">
        <TooltipProvider delayDuration={0}>
          <div className="flex flex-col gap-6 items-center">
            {topMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className="flex flex-col items-center gap-1 group"
                    >
                      <div className={cn(
                        "flex items-center justify-center h-12 w-12 rounded-full transition-all duration-300",
                        isActive 
                          ? "bg-white text-[#4a5ab5] shadow-lg" 
                          : "text-blue-100 hover:bg-white/10 hover:text-white"
                      )}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="text-[9px] font-bold text-blue-100 group-hover:text-white transition-colors">{item.label}</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={15} className="font-bold text-[10px] bg-slate-900 text-white border-none">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </ScrollArea>

      <div className="mt-auto flex flex-col gap-6 items-center pt-6 border-t border-white/10 w-full">
        <TooltipProvider delayDuration={0}>
          {bottomMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <div className={cn(
                      "flex items-center justify-center h-12 w-12 rounded-full transition-all duration-300",
                      isActive 
                        ? "bg-white text-[#4a5ab5] shadow-lg" 
                        : "text-blue-100 hover:bg-white/10 hover:text-white"
                    )}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-[9px] font-bold text-blue-100 group-hover:text-white transition-colors">{item.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={15} className="font-bold text-[10px] bg-slate-900 text-white border-none">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}