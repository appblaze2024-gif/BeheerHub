'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { isToday } from 'date-fns';

interface PrintDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekDays: Date[];
  onPrint: (mode: 'day', day: Date) => void;
}

export function PrintDayDialog({
  open,
  onOpenChange,
  weekDays,
  onPrint,
}: PrintDayDialogProps) {

  const handleDaySelect = (day: Date) => {
    onPrint('day', day);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print Dagplanning</DialogTitle>
          <DialogDescription>
            Selecteer de dag die u wilt afdrukken.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 py-4">
          {weekDays.map((day) => (
            <Button
              key={day.toISOString()}
              variant="outline"
              className={cn("w-full justify-start text-base py-6", isToday(day) && "font-bold border-primary")}
              onClick={() => handleDaySelect(day)}
            >
              <span className="capitalize">{format(day, 'eeee dd MMMM', { locale: nl })}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
