'use client';

import * as React from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, writeBatch } from 'firebase/firestore';
import { Loader2, User, Search, Check, X, Users } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { Melding, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AcceptAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meldingen: Melding[];
  onSuccess: () => void;
}

export function AcceptAssignDialog({ open, onOpenChange, meldingen = [], onSuccess }: AcceptAssignDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: users, isLoading } = useCollection<UserProfile>(usersQuery);

  React.useEffect(() => {
    if (open && meldingen?.length === 1) {
      const assignedUser = users?.find(u => (u.displayName || u.email) === meldingen[0].behandelaar);
      setSelectedUserId(assignedUser?.id || null);
      setSearchTerm('');
    } else if (!open) {
      setSelectedUserId(null);
      setSearchTerm('');
    }
  }, [open, meldingen, users]);

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    const q = searchTerm.toLowerCase();
    return users
      .filter(u => u.id !== user?.uid)
      .filter(u => 
        (u.displayName || '').toLowerCase().includes(q) || 
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  }, [users, searchTerm, user?.uid]);

  const handleConfirm = async () => {
    if (!firestore || !meldingen || meldingen.length === 0 || !selectedUserId) return;
    
    const selectedUser = users?.find(u => u.id === selectedUserId);
    if (!selectedUser) return;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(firestore);
      const behandelaarName = selectedUser.displayName || selectedUser.email || 'Onbekend';
      
      meldingen.forEach(m => {
        const meldingRef = doc(firestore, 'meldingen', m.id);
        const updateData: any = {
          behandelaar: behandelaarName,
          updatedAt: new Date().toISOString()
        };

        if (m.status === 'Nieuw') {
          updateData.status = 'In behandeling';
        }
        
        batch.update(meldingRef, updateData);
      });

      await batch.commit();

      toast({
        title: meldingen.length === 1 ? 'Toewijzing bijgewerkt' : 'Bulk toewijzing voltooid',
        description: meldingen.length === 1 
          ? `Melding ${meldingen[0].intakenummer} is toegewezen aan ${behandelaarName}.`
          : `${meldingen.length} meldingen zijn toegewezen aan ${behandelaarName}.`,
      });
      
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error assigning meldingen:", error);
      toast({
        variant: 'destructive',
        title: 'Fout bij toewijzen',
        description: 'Kon de melding(en) niet toewijzen aan de geselecteerde gebruiker.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md rounded-none border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">
                {meldingen?.length === 1 ? `Toewijzen: ${meldingen[0].intakenummer}` : `Toewijzen (${meldingen?.length || 0} items)`}
              </DialogTitle>
              <DialogDescription className="text-slate-400 font-bold">
                Selecteer een collega die deze {meldingen?.length === 1 ? 'opdracht' : 'opdrachten'} gaat uitvoeren.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 border-b bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Zoek collega op naam of rol..." 
              className="pl-10 h-11 rounded-none border-slate-100 bg-slate-50 focus:ring-primary/20 font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="h-[300px] bg-white">
          <div className="p-2 space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((u) => (
                <div 
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-none cursor-pointer transition-all border-2",
                    selectedUserId === u.id 
                      ? "bg-primary/5 border-primary shadow-sm" 
                      : "hover:bg-slate-50 border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-slate-100 rounded-none">
                      <AvatarFallback className="bg-slate-100 text-primary font-black text-xs uppercase rounded-none">
                        {getInitials(u.displayName || u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-tight text-slate-900 truncate">
                        {u.displayName || u.email}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                        {u.role}
                      </p>
                    </div>
                  </div>
                  {selectedUserId === u.id && (
                    <div className="bg-primary text-white p-1 rounded-none">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-300">
                <User className="h-12 w-12 mx-auto mb-2 opacity-10" />
                <p className="text-[10px] font-black uppercase tracking-widest">Geen collega's gevonden</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
          <div className="flex gap-2 w-full">
            <DialogClose asChild>
              <Button variant="ghost" className="flex-1 font-bold rounded-none">Annuleren</Button>
            </DialogClose>
            <Button 
              onClick={handleConfirm} 
              disabled={!selectedUserId || isSubmitting}
              className="flex-1 font-black uppercase tracking-tight h-11 shadow-xl shadow-primary/20 rounded-none"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Bevestigen'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
