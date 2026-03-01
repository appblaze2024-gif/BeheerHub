'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home,
  Share2,
  Users,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const topMenuItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/projects', label: 'Koppelingen', icon: Share2 },
];

const bottomMenuItems = [
  { href: '/employees', label: 'Gebruikers', icon: Users },
  { href: '/projects', label: 'Organisatie', icon: RefreshCw },
  { href: '/settings', label: 'Instellingen', icon: Settings },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full sidebar-blue text-white items-center py-4">
      <ScrollArea className="flex-1 w-full">
        <TooltipProvider delayDuration={0}>
          <div className="flex flex-col gap-4 items-center">
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
                        "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-300",
                        isActive 
                          ? "bg-white text-[#3498db] shadow-lg" 
                          : "text-blue-50 hover:bg-white/10 hover:text-white"
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-[8px] font-bold text-blue-50 group-hover:text-white transition-colors text-center px-1 leading-tight">{item.label}</span>
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

      <div className="mt-auto flex flex-col gap-4 items-center pt-4 border-t border-white/10 w-full">
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
                      "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-300",
                      isActive 
                        ? "bg-white text-[#3498db] shadow-lg" 
                        : "text-blue-50 hover:bg-white/10 hover:text-white"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[8px] font-bold text-blue-50 group-hover:text-white transition-colors text-center px-1 leading-tight">{item.label}</span>
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
