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
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

// The label type from mail/page.tsx but with an ID
export interface EditableLabel {
  id: string; // Add an ID for stable keys
  name: string;
  color: string;
}

interface LabelManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: { name: string; color: string; tailwind?: string }[];
  onSave: (newLabels: { name: string; color: string }[]) => void;
}

export function LabelManagerDialog({
  open,
  onOpenChange,
  labels,
  onSave,
}: LabelManagerDialogProps) {
  const [editableLabels, setEditableLabels] = React.useState<EditableLabel[]>([]);

  React.useEffect(() => {
    if (open) {
      // Give each label a temporary unique ID for editing
      setEditableLabels(labels.map(l => ({ ...l, id: l.name + Math.random().toString() })));
    }
  }, [open, labels]);

  const handleSave = () => {
    // Strip IDs and tailwind before saving
    const newLabels = editableLabels.map(({ id, tailwind, ...rest }) => rest);
    onSave(newLabels);
    onOpenChange(false);
  };

  const handleAddLabel = () => {
    setEditableLabels([
      ...editableLabels,
      { id: Date.now().toString(), name: 'Nieuw Label', color: '#808080' },
    ]);
  };

  const handleRemoveLabel = (id: string) => {
    const labelToRemove = editableLabels.find(l => l.id === id);
    if (labelToRemove?.name === 'Geen') return;
    setEditableLabels(editableLabels.filter(l => l.id !== id));
  };

  const handleLabelChange = (id: string, field: 'name' | 'color', value: string) => {
    setEditableLabels(
      editableLabels.map(l => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Labels beheren</DialogTitle>
          <DialogDescription>
            Voeg nieuwe labels toe, wijzig namen, kleuren of verwijder ze.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80 pr-4">
          <div className="space-y-4 py-4">
            {editableLabels.map(label => (
              <div key={label.id} className="flex items-center gap-2">
                <Input
                  type="color"
                  value={label.color === 'transparent' ? '#ffffff' : label.color}
                  className="w-12 p-1"
                  onChange={e => handleLabelChange(label.id, 'color', e.target.value)}
                  disabled={label.name === 'Geen'}
                />
                <Input
                  value={label.name}
                  className="flex-1"
                  onChange={e => handleLabelChange(label.id, 'name', e.target.value)}
                  disabled={label.name === 'Geen'}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveLabel(label.id)}
                  disabled={label.name === 'Geen'}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
        <Button variant="outline" onClick={handleAddLabel} className="mt-2">
            <Plus className="mr-2 h-4 w-4" /> Label toevoegen
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={handleSave}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
