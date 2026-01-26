'use client';

import * as React from 'react';
import { ChevronsUpDown, Search } from 'lucide-react';
import { GEMEENTEN } from '@/lib/gemeenten';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface GemeenteSelectProps {
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
}

export function GemeenteSelect({ value, onValueChange, disabled }: GemeenteSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const filteredGemeenten = React.useMemo(() => {
    if (!search) return GEMEENTEN;
    return GEMEENTEN.filter(g => g.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full sm:w-48 justify-between"
          disabled={disabled}
        >
          {value || 'Kies gemeente'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Selecteer een gemeente</DialogTitle>
        </DialogHeader>
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Zoek gemeente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
            />
        </div>
        <ScrollArea className="h-72">
            <div className="flex flex-col gap-1 pr-4">
                {filteredGemeenten.map(gemeente => (
                    <Button
                        key={gemeente}
                        variant={value === gemeente ? 'secondary' : 'ghost'}
                        className="w-full justify-start"
                        onClick={() => {
                            onValueChange(gemeente);
                            setOpen(false);
                        }}
                    >
                        {gemeente}
                    </Button>
                ))}
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
