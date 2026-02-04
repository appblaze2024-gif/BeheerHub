'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Medewerker } from '@/lib/types';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

interface MedewerkerVolgordeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupedMedewerkers: { name: string; items: Medewerker[] }[];
}

export function MedewerkerVolgordeDialog({
  open,
  onOpenChange,
  groupedMedewerkers,
}: MedewerkerVolgordeDialogProps) {
  const firestore = useFirestore();
  const [isSaving, setIsSaving] = React.useState(false);
  const [localGroups, setLocalGroups] = React.useState<{ name: string; items: Medewerker[] }[]>([]);

  React.useEffect(() => {
    if (open) {
      setLocalGroups(JSON.parse(JSON.stringify(groupedMedewerkers)));
    }
  }, [open, groupedMedewerkers]);

  const moveItem = (groupIndex: number, itemIndex: number, direction: 'up' | 'down') => {
    const newGroups = [...localGroups];
    const group = newGroups[groupIndex];
    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;

    if (targetIndex < 0 || targetIndex >= group.items.length) return;

    const [movedItem] = group.items.splice(itemIndex, 1);
    group.items.splice(targetIndex, 0, movedItem);
    setLocalGroups(newGroups);
  };

  const handleSave = async () => {
    if (!firestore) return;
    setIsSaving(true);

    try {
      let order = 0;
      for (const group of localGroups) {
        for (const m of group.items) {
          const medewerkerRef = doc(firestore, 'medewerkers', m.id);
          await updateDocumentNonBlocking(medewerkerRef, { planningOrder: order });
          order++;
        }
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Fout bij opslaan volgorde:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle>Volgorde medewerkers aanpassen</DialogTitle>
          <DialogDescription>
            Gebruik de pijltjes om medewerkers binnen hun groep te sorteren.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900/20">
          <div className="space-y-6">
            {localGroups.map((group, gIndex) => (
              <div key={group.name} className="space-y-2">
                <Badge variant="outline" className="uppercase tracking-wider text-[10px] font-bold bg-background">
                  {group.name} ({group.items.length})
                </Badge>
                <div className="border rounded-md divide-y shadow-sm bg-background">
                  {group.items.map((m, iIndex) => (
                    <div key={m.id} className="flex items-center justify-between p-2 text-sm">
                      <span className="font-medium truncate pr-2">
                        {`${m.voornaam || ''} ${m.tussenvoegsel || ''} ${m.achternaam || ''}`.trim()}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveItem(gIndex, iIndex, 'up')}
                          disabled={iIndex === 0 || isSaving}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveItem(gIndex, iIndex, 'down')}
                          disabled={iIndex === group.items.length - 1 || isSaving}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t bg-muted/10">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Volgorde opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
