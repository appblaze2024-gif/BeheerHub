'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { format, isBefore, addMonths, parseISO, isValid } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CalendarCheck } from 'lucide-react';
import type { Voertuig } from '@/lib/types';

interface ApkOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApkOverviewDialog({ open, onOpenChange }: ApkOverviewDialogProps) {
  const firestore = useFirestore();
  
  const voertuigenCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'voertuigen');
  }, [firestore]);

  const { data: voertuigen, isLoading } = useCollection<Voertuig>(voertuigenCollection);

  const sortedVoertuigen = React.useMemo(() => {
    if (!voertuigen) return [];
    return [...voertuigen].sort((a, b) => {
      const dateA = a.apk_vervaldatum ? new Date(a.apk_vervaldatum).getTime() : Infinity;
      const dateB = b.apk_vervaldatum ? new Date(b.apk_vervaldatum).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [voertuigen]);

  const getApkStatus = (dateStr?: string) => {
    if (!dateStr) return { label: 'Onbekend', variant: 'secondary' as const, className: '' };
    
    const date = parseISO(dateStr);
    if (!isValid(date)) return { label: 'Ongeldig', variant: 'secondary' as const, className: '' };

    const today = new Date();
    const soon = addMonths(today, 1);

    if (isBefore(date, today)) {
      return { label: 'Verlopen', variant: 'destructive' as const, className: '' };
    }
    if (isBefore(date, soon)) {
      return { label: 'Binnenkort', variant: 'default' as const, className: 'bg-orange-500 hover:bg-orange-600' };
    }
    return { label: 'Geldig', variant: 'outline' as const, className: 'text-green-600 border-green-600' };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            APK Vervaldata Overzicht
          </DialogTitle>
          <DialogDescription>
            Overzicht van alle geregistreerde voertuigen gesorteerd op APK datum.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold">Kenteken</TableHead>
                    <TableHead className="font-bold">Nr.</TableHead>
                    <TableHead className="font-bold">Merk & Model</TableHead>
                    <TableHead className="font-bold">APK Vervalstuk</TableHead>
                    <TableHead className="font-bold text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedVoertuigen.map((v) => {
                    const status = getApkStatus(v.apk_vervaldatum);
                    return (
                      <TableRow key={v.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono font-bold">{v.id}</TableCell>
                        <TableCell>{v.voertuignummer || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {v.merk} {v.model}
                        </TableCell>
                        <TableCell>
                          {v.apk_vervaldatum ? format(parseISO(v.apk_vervaldatum), 'dd-MM-yyyy') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            variant={status.variant} 
                            className={status.className}
                          >
                            {status.label === 'Verlopen' && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {status.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sortedVoertuigen.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        Geen voertuigen gevonden.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
