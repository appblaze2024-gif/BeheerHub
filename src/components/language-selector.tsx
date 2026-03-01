'use client';

import * as React from 'react';
import { Languages, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const languages = [
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺' },
];

export function LanguageSelector() {
  const [currentLang, setCurrentLang] = React.useState('nl');

  const handleLanguageChange = (langCode: string) => {
    setCurrentLang(langCode);
    
    // Google Translate integration logic
    const select = document.querySelector('.goog-te-combo') as HTMLSelectElement;
    if (select) {
      select.value = langCode;
      select.dispatchEvent(new Event('change'));
    } else {
      // Fallback if the element isn't ready yet
      console.warn('Vertaalmodule nog niet geladen...');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#3498db] hover:bg-blue-50 transition-all active:scale-95">
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl shadow-2xl p-2 border-slate-100 animate-in fade-in zoom-in duration-200">
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 py-2">
          Systeemtaal Wijzigen
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-100" />
        {languages.map((lang) => (
          <DropdownMenuItem 
            key={lang.code} 
            onClick={() => handleLanguageChange(lang.code)}
            className={cn(
                "flex items-center justify-between font-bold rounded-xl h-11 px-3 cursor-pointer transition-colors",
                currentLang === lang.code ? "bg-primary/5 text-primary" : "hover:bg-slate-50"
            )}
          >
            <div className="flex items-center gap-3">
                <span className="text-lg">{lang.flag}</span>
                <span className="text-sm font-black uppercase tracking-tight">{lang.name}</span>
            </div>
            {currentLang === lang.code && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
