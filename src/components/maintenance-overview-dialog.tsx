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
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { format, isAfter, startOfDay, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wrench, AlertCircle } from 'lucide-react';
import type { Voertuig, Machine } from '@/lib/types';

interface MaintenanceOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UpcomingMaintenance = {
  id: string;
  materieelId: string;
  materieelName: string;
  type: 'voertuig' | 'machine';
  description: string;
  date: string;
  maintenanceType: string;
};

export function MaintenanceOverviewDialog({ open, onOpenChange }: MaintenanceOverviewDialogProps) {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(false);
  const [upcomingItems, setUpcomingItems] = React.useState<UpcomingMaintenance[]>([]);

  const fetchUpcomingMaintenance = React.useCallback(async () => {
    if (!firestore) return;
    setIsLoading(true);
    
    try {
      const today = startOfDay(new Date());
      const allUpcoming: UpcomingMaintenance[] = [];

      // Fetch from both collections
      const collections = [
        { name: 'voertuigen', type: 'voertuig' as const },
        { name: 'machines', type: 'machine' as const }
      ];

      for (const col of collections) {
        const snapshot = await getDocs(collection(firestore, col.name));
        
        for (const docItem of snapshot.docs) {
          const materieelData = docItem.data();
          const materieelName = materieelData.voertuignummer || materieelData.machinenummer || docItem.id;
          
          // Get maintenance subcollection
          const maintenanceSnapshot = await getDocs(collection(firestore, col.name, docItem.id, 'maintenance'));
          
          maintenanceSnapshot.forEach(mDoc => {
            const mData = mDoc.data();
            const mDate = new Date(mData.date);
            
            if (isAfter(mDate, today) || format(mDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
              allUpcoming.push({
                id: mDoc.id,
                materieelId: docItem.id,
                materieelName: materieelName,
                type: col.type,
                description: mData.description,
                date: mData.date,
                maintenanceType: mData.type
              });
            }
          });
        }
      }

      // Sort by date ascending
      allUpcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setUpcomingItems(allUpcoming);
    } catch (error) {
      console.error("Fout bij ophalen onderhoudsplanning:", error);
    } finally {
      setIsLoading(false);
    }
  }, [firestore]);

  React.useEffect(() => {
    if (open) {
      fetchUpcomingMaintenance();
    }
  }, [open, fetchUpcomingMaintenance]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Onderhoudsplanning
          </DialogTitle>
          <DialogDescription>
            Overzicht van al het geplande onderhoud voor voertuigen en machines.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Planning laden...</p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold">Datum</TableHead>
                    <TableHead className="font-bold">Materieel</TableHead>
                    <TableHead className="font-bold">Omschrijving</TableHead>
                    <TableHead className="font-bold">Type</TableHead>
                    <TableHead className="text-right font-bold">Bron</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingItems.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">
                        {format(new Date(item.date), 'dd-MM-yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold">{item.materieelName}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{item.materieelId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate" title={item.description}>
                        {item.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.maintenanceType}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="capitalize">
                          {item.type}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {upcomingItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <AlertCircle className="h-8 w-8 opacity-20" />
                          <p>Geen toekomstig onderhoud ingepland.</p>
                        </div>
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
