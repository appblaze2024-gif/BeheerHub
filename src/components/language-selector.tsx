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
    
    // Standard Google Translate cookie format: /source/target
    const cookieValue = `/nl/${langCode}`;
    const domain = window.location.hostname;
    
    // Set cookie for current path and root to ensure visibility
    document.cookie = `googtrans=${cookieValue}; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`;
    document.cookie = `googtrans=${cookieValue}; path=/; domain=${domain}; expires=Fri, 31 Dec 9999 23:59:59 GMT`;

    // Trigger the hidden Google Translate combo box if it's already in the DOM
    const select = document.querySelector('.goog-te-combo') as HTMLSelectElement;
    if (select) {
      select.value = langCode;
      select.dispatchEvent(new Event('change'));
    }
    
    // Force a full page refresh to guarantee that everything (SSR and CSR) is translated on next load
    window.location.reload();
  };

  const currentLangObj = languages.find(l => l.code === currentLang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 rounded-full text-[#3498db] hover:bg-blue-50 transition-all active:scale-95 px-2">
          <div className="relative h-6 w-6 rounded-full overflow-hidden border border-slate-200 shadow-sm shrink-0 bg-slate-100">
            <img 
              src={`https://flagcdn.com/w40/${currentLangObj.flag}.png`} 
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
                    src={`https://flagcdn.com/w40/${lang.flag}.png`} 
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
