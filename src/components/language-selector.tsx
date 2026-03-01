'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
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
import Image from 'next/image';

const languages = [
  { code: 'nl', name: 'Nederlands', flag: 'nl' },
  { code: 'en', name: 'English', flag: 'us' },
  { code: 'pl', name: 'Polski', flag: 'pl' },
  { code: 'uk', name: 'Українська', flag: 'ua' },
  { code: 'de', name: 'Deutsch', flag: 'de' },
  { code: 'hu', name: 'Magyar', flag: 'hu' },
];

export function LanguageSelector() {
  const [currentLang, setCurrentLang] = React.useState('nl');

  React.useEffect(() => {
    // Sync state with cookie on mount
    const match = document.cookie.match(/googtrans=\/nl\/([^;]+)/);
    if (match && match[1]) {
      setCurrentLang(match[1]);
    }
  }, []);

  const handleLanguageChange = (langCode: string) => {
    setCurrentLang(langCode);
    
    // Set the cookie that Google Translate uses for persistence
    const cookieValue = `/nl/${langCode}`;
    const domain = window.location.hostname;
    
    // Set cookie for current domain and root path with broad visibility
    document.cookie = `googtrans=${cookieValue}; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`;
    document.cookie = `googtrans=${cookieValue}; path=/; domain=${domain}; expires=Fri, 31 Dec 9999 23:59:59 GMT`;

    // Trigger the actual translation via the hidden Google combo box if available
    const select = document.querySelector('.goog-te-combo') as HTMLSelectElement;
    if (select) {
      select.value = langCode;
      select.dispatchEvent(new Event('change'));
    }
    
    // Force a reload to ensure the entire DOM (including complex components) is picked up by the translation engine
    window.location.reload();
  };

  const currentLangObj = languages.find(l => l.code === currentLang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 rounded-full text-[#3498db] hover:bg-blue-50 transition-all active:scale-95 px-2">
          <div className="relative h-6 w-6 rounded-full overflow-hidden border border-slate-200 shadow-sm shrink-0 bg-slate-100">
            <img 
              src={`https://flagcdn.com/${currentLangObj.flag}.svg`} 
              alt={currentLangObj.name}
              className="h-full w-full object-cover"
            />
          </div>
          <ChevronDown className="h-3 w-3 opacity-40" />
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
                <div className="relative h-5 w-5 rounded-full overflow-hidden border border-slate-100 shrink-0 shadow-sm bg-slate-50">
                  <img 
                    src={`https://flagcdn.com/${lang.flag}.svg`} 
                    alt={lang.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="text-sm font-black uppercase tracking-tight">{lang.name}</span>
            </div>
            {currentLang === lang.code && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
