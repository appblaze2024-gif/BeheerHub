
'use client';

import * as React from 'react';
import {
  Bell,
  Send,
  Check,
  User,
  Trash2,
  Clock,
  Mail,
  Loader2,
  Plus,
} from 'lucide-react';
import {
  useCollection,
  useFirestore,
  useUser,
  useMemoFirebase,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { collection, query, orderBy, limit, doc } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProfile } from '@/firebase/profile-provider';
import type { Message, UserProfile } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export function NotificationCenter() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState('received');
  
  // Create message state
  const [toUserId, setToUserId] = React.useState('');
  const [messageContent, setMessageContent] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  // Fetch received messages
  const messagesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'users', user.uid, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
  }, [firestore, user?.uid]);

  const { data: messages, isLoading } = useCollection<Message>(messagesQuery);

  // Fetch users for the dropdown
  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: users } = useCollection<UserProfile>(usersQuery);

  const unreadCount = React.useMemo(() => {
    return messages?.filter((m) => !m.read).length || 0;
  }, [messages]);

  const handleMarkAsRead = (msgId: string) => {
    if (!firestore || !user?.uid) return;
    const msgRef = doc(firestore, 'users', user.uid, 'messages', msgId);
    updateDocumentNonBlocking(msgRef, { read: true });
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!firestore || !user?.uid) return;
    const msgRef = doc(firestore, 'users', user.uid, 'messages', msgId);
    deleteDocumentNonBlocking(msgRef);
  };

  const handleSendMessage = async () => {
    if (!firestore || !user?.uid || !toUserId || !messageContent.trim()) return;
    setIsSending(true);

    try {
      const recipientMsgRef = collection(firestore, 'users', toUserId, 'messages');
      const newMessage = {
        fromUserId: user.uid,
        fromName: profile?.displayName || profile?.email || 'Onbekend',
        toUserId: toUserId,
        content: messageContent.trim(),
        createdAt: new Date().toISOString(),
        read: false,
      };

      await addDocumentNonBlocking(recipientMsgRef, newMessage);
      
      toast({
        title: 'Bericht verzonden',
        description: 'Uw bericht is succesvol afgeleverd.',
      });
      
      setMessageContent('');
      setToUserId('');
      setActiveTab('received');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: 'destructive',
        title: 'Fout bij verzenden',
        description: 'Kon het bericht niet versturen.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-xl relative h-10 w-10 hover:bg-slate-100">
          <Bell className="h-5 w-5 text-slate-600" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center font-black text-[10px] rounded-full border-2 border-white animate-in zoom-in"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 sm:w-96 p-0 mt-2 rounded-2xl shadow-2xl border-slate-100 overflow-hidden" align="end">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-tight">Berichten</h3>
            <TabsList className="bg-black h-10 p-1 rounded-xl gap-1 border-none shadow-lg">
              <TabsTrigger 
                value="received" 
                className="text-[11px] px-6 h-8 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white transition-all font-black uppercase tracking-widest border-none"
              >
                Inbox
              </TabsTrigger>
              <TabsTrigger 
                value="new" 
                className="text-[11px] px-6 h-8 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white transition-all font-black uppercase tracking-widest border-none"
              >
                Nieuw
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="received" className="m-0">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages && messages.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "p-4 group relative transition-colors",
                        !msg.read ? "bg-blue-50/30" : "hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "h-2 w-2 rounded-full",
                            !msg.read ? "bg-primary" : "bg-transparent"
                          )} />
                          <span className="font-black text-xs uppercase tracking-tight text-slate-900">{msg.fromName}</span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true, locale: nl })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed pr-8">
                        {msg.content}
                      </p>
                      <div className="absolute right-2 bottom-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!msg.read && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-green-600 hover:bg-green-50"
                            onClick={() => handleMarkAsRead(msg.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteMessage(msg.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center p-8">
                  <div className="bg-slate-100 p-4 rounded-full mb-4">
                    <Mail className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Geen berichten</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="new" className="m-0 p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ontvanger</Label>
              <Select value={toUserId} onValueChange={setToUserId}>
                <SelectTrigger className="h-10 font-bold border-slate-200">
                  <SelectValue placeholder="Kies een collega..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.filter(u => u.id !== user?.uid).map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bericht</Label>
              <Textarea 
                placeholder="Typ uw bericht hier..." 
                className="min-h-[120px] text-xs font-medium resize-none border-slate-200"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
              />
            </div>
            <Button 
              className="w-full h-11 font-black uppercase tracking-tight gap-2" 
              disabled={!toUserId || !messageContent.trim() || isSending}
              onClick={handleSendMessage}
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Bericht Verzenden
            </Button>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
