
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
  ArrowLeft,
  ChevronRight,
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
import { collection, query, orderBy, limit, doc, where, writeBatch } from 'firebase/firestore';
import { formatDistanceToNow, format } from 'date-fns';
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
  const [selectedChatUser, setSelectedChatUser] = React.useState<UserProfile | null>(null);
  
  // Create message state for "New" tab
  const [toUserId, setToUserId] = React.useState('');
  const [messageContent, setMessageContent] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  // Create message state for Chat view
  const [chatReply, setChatReply] = React.useState('');

  // Fetch all messages involving the current user
  const messagesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'users', user.uid, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }, [firestore, user?.uid]);

  const { data: allMessages, isLoading } = useCollection<Message>(messagesQuery);

  // Fetch all users for contact info
  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: users } = useCollection<UserProfile>(usersQuery);

  const unreadCount = React.useMemo(() => {
    return allMessages?.filter((m) => !m.read && m.toUserId === user?.uid).length || 0;
  }, [allMessages, user?.uid]);

  // Messages filtered for the specific selected chat
  const chatMessages = React.useMemo(() => {
    if (!allMessages || !selectedChatUser || !user) return [];
    return allMessages
      .filter(m => 
        (m.fromUserId === selectedChatUser.id && m.toUserId === user.uid) ||
        (m.fromUserId === user.uid && m.toUserId === selectedChatUser.id)
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [allMessages, selectedChatUser, user]);

  const handleOpenChat = (contactId: string) => {
    const contact = users?.find(u => u.id === contactId);
    if (contact) {
      setSelectedChatUser(contact);
      
      // Mark messages from this user as read
      const unreadFromThisUser = allMessages?.filter(m => m.fromUserId === contactId && !m.read && m.toUserId === user?.uid);
      if (unreadFromThisUser && unreadFromThisUser.length > 0 && firestore && user) {
        unreadFromThisUser.forEach(msg => {
          const msgRef = doc(firestore, 'users', user.uid, 'messages', msg.id);
          updateDocumentNonBlocking(msgRef, { read: true });
        });
      }
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!firestore || !user?.uid) return;
    const msgRef = doc(firestore, 'users', user.uid, 'messages', msgId);
    deleteDocumentNonBlocking(msgRef);
  };

  const handleSendMessage = async (recipientId: string, content: string, isReply = false) => {
    if (!firestore || !user?.uid || !recipientId || !content.trim()) return;
    setIsSending(true);

    try {
      const timestamp = new Date().toISOString();
      const messageData = {
        fromUserId: user.uid,
        fromName: profile?.displayName || profile?.email || 'Onbekend',
        toUserId: recipientId,
        content: content.trim(),
        createdAt: timestamp,
        read: false,
      };

      // 1. Write to recipient's inbox
      const recipientMsgRef = collection(firestore, 'users', recipientId, 'messages');
      await addDocumentNonBlocking(recipientMsgRef, messageData);
      
      // 2. Write to sender's "sent" history (own subcollection)
      const senderMsgRef = collection(firestore, 'users', user.uid, 'messages');
      await addDocumentNonBlocking(senderMsgRef, { ...messageData, read: true });

      if (!isReply) {
        toast({
          title: 'Bericht verzonden',
          description: 'Uw bericht is succesvol afgeleverd.',
        });
        setMessageContent('');
        setToUserId('');
        setActiveTab('received');
      } else {
        setChatReply('');
      }
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
    <Popover onOpenChange={(open) => { if(!open) setSelectedChatUser(null); }}>
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
        {selectedChatUser ? (
          <div className="flex flex-col h-[500px]">
            <div className="p-4 border-b bg-black text-white flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-white hover:bg-white/10 rounded-full"
                onClick={() => setSelectedChatUser(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black uppercase tracking-tight truncate">{selectedChatUser.displayName || selectedChatUser.email}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-0.5">{selectedChatUser.role}</p>
              </div>
            </div>
            
            <ScrollArea className="flex-1 p-4 bg-slate-50/50">
              <div className="flex flex-col gap-3">
                {chatMessages.length > 0 ? (
                  chatMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "max-w-[85%] rounded-2xl p-3 text-xs shadow-sm animate-in fade-in slide-in-from-bottom-1",
                        msg.fromUserId === user?.uid 
                          ? "ml-auto bg-primary text-white rounded-tr-none" 
                          : "mr-auto bg-white border border-slate-100 text-slate-900 rounded-tl-none"
                      )}
                    >
                      <p className="leading-relaxed font-medium">{msg.content}</p>
                      <p className={cn(
                        "text-[8px] font-black uppercase tracking-widest mt-1 opacity-60 text-right",
                        msg.fromUserId === user?.uid ? "text-white/80" : "text-slate-400"
                      )}>
                        {format(new Date(msg.createdAt), 'HH:mm')}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-300">
                    <p className="text-[10px] font-black uppercase tracking-widest">Begin een gesprek</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t bg-white">
              <div className="relative">
                <Textarea 
                  placeholder="Typ een antwoord..." 
                  className="min-h-[60px] text-xs font-medium resize-none border-slate-200 pr-12 rounded-xl focus:ring-primary/20"
                  value={chatReply}
                  onChange={(e) => setChatReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(selectedChatUser.id, chatReply, true);
                    }
                  }}
                />
                <Button 
                  size="icon" 
                  className="absolute right-2 bottom-2 h-8 w-8 rounded-full shadow-lg"
                  disabled={!chatReply.trim() || isSending}
                  onClick={() => handleSendMessage(selectedChatUser.id, chatReply, true)}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        ) : (
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
                ) : allMessages && allMessages.length > 0 ? (
                  <div className="divide-y divide-slate-50">
                    {allMessages
                      // Only show incoming messages in the main inbox list, or unique latest conversations
                      .filter(m => m.toUserId === user?.uid)
                      .map((msg) => (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "p-4 group relative transition-all cursor-pointer",
                          !msg.read ? "bg-blue-50/30" : "hover:bg-slate-50"
                        )}
                        onClick={() => handleOpenChat(msg.fromUserId)}
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
                        <p className="text-xs text-slate-600 leading-relaxed pr-8 line-clamp-2">
                          {msg.content}
                        </p>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="h-4 w-4 text-slate-300" />
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
                  <SelectTrigger className="h-10 font-bold border-slate-200 rounded-xl">
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
                  className="min-h-[120px] text-xs font-medium resize-none border-slate-200 rounded-xl"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                />
              </div>
              <Button 
                className="w-full h-11 font-black uppercase tracking-tight gap-2 rounded-xl shadow-lg" 
                disabled={!toUserId || !messageContent.trim() || isSending}
                onClick={() => handleSendMessage(toUserId, messageContent)}
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Bericht Verzenden
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}

    