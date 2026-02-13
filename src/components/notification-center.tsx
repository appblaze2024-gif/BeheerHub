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
  Search,
  MoreVertical,
  AlertCircle,
} from 'lucide-react';
import {
  useCollection,
  useFirestore,
  useUser,
  useMemoFirebase,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
} from '@/firebase';
import { collection, query, orderBy, limit, doc, writeBatch, where } from 'firebase/firestore';
import { formatDistanceToNow, format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useRouter } from 'next/navigation';

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
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfile } from '@/firebase/profile-provider';
import type { Message, UserProfile, Melding } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function NotificationCenter() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
  const { toast } = useToast();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = React.useState('received');
  const [selectedChatUser, setSelectedChatUser] = React.useState<UserProfile | null>(null);
  const [userSearchQuery, setUserSearchQuery] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [chatReply, setChatReply] = React.useState('');

  const isPrivileged = profile?.role === 'Super admin' || profile?.role === 'toezichthouder';

  // Messages Query
  const messagesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'users', user.uid, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
  }, [firestore, user?.uid]);

  const { data: allMessages, isLoading: isLoadingMessages } = useCollection<Message>(messagesQuery);

  // Active Issues Query for the "Meldingen" tab
  const meldingenQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'meldingen');
  }, [firestore]);

  const { data: meldingenFromDb, isLoading: isLoadingMeldingen } = useCollection<Melding>(meldingenQuery);

  const activeMeldingen = React.useMemo(() => {
    if (!meldingenFromDb) return [];
    // Only show 'Nieuw' status (portal issues) as requested
    return meldingenFromDb
      .filter(m => m.status === 'Nieuw')
      .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
      .slice(0, 20);
  }, [meldingenFromDb]);

  // Users Query for starting new chats
  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: users } = useCollection<UserProfile>(usersQuery);

  const unreadCount = React.useMemo(() => {
    const unreadMessagesCount = allMessages?.filter((m) => !m.read && m.toUserId === user?.uid).length || 0;
    // Meldingen count only for privileged users
    const newMeldingenCount = isPrivileged ? activeMeldingen.length : 0;
    return unreadMessagesCount + newMeldingenCount;
  }, [allMessages, activeMeldingen, user?.uid, isPrivileged]);

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    const q = userSearchQuery.toLowerCase();
    return users
      .filter(u => u.id !== user?.uid)
      .filter(u => 
        (u.displayName || u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
  }, [users, userSearchQuery, user?.uid]);

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
      
      const unreadFromThisUser = allMessages?.filter(m => m.fromUserId === contactId && !m.read && m.toUserId === user?.uid);
      if (unreadFromThisUser && unreadFromThisUser.length > 0 && firestore && user) {
        unreadFromThisUser.forEach(msg => {
          const msgRef = doc(firestore, 'users', user.uid, 'messages', msg.id);
          updateDocumentNonBlocking(msgRef, { read: true });
        });
      }
    }
  };

  const handleDeleteChat = async () => {
    if (!firestore || !user?.uid || !selectedChatUser || !chatMessages.length) return;
    
    setIsDeleting(true);
    const batch = writeBatch(firestore);
    
    chatMessages.forEach(msg => {
      const msgRef = doc(firestore, 'users', user.uid, 'messages', msg.id);
      batch.delete(msgRef);
    });

    try {
      await batch.commit();
      setSelectedChatUser(null);
      toast({
        title: 'Chat verwijderd',
        description: `De conversatie met ${selectedChatUser.displayName || selectedChatUser.email} is gewist.`,
      });
    } catch (error) {
      console.error("Error deleting chat:", error);
      toast({
        variant: 'destructive',
        title: 'Fout bij verwijderen',
        description: 'Kon de chat niet verwijderen.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSendMessage = async (recipientId: string, content: string) => {
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

      // Message to recipient
      const recipientMsgRef = collection(firestore, 'users', recipientId, 'messages');
      await addDocumentNonBlocking(recipientMsgRef, messageData);
      
      // Copy to own messages for history
      const senderMsgRef = collection(firestore, 'users', user.uid, 'messages');
      await addDocumentNonBlocking(senderMsgRef, { ...messageData, read: true });

      setChatReply('');
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

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  return (
    <Popover onOpenChange={(open) => { if(!open) { setSelectedChatUser(null); setUserSearchQuery(''); } }}>
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
            <div className="p-4 border-b bg-black text-white flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-white hover:bg-white/10 rounded-full"
                  onClick={() => setSelectedChatUser(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight truncate">{selectedChatUser.displayName || selectedChatUser.email}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-0.5">{selectedChatUser.role}</p>
                </div>
              </div>
              
              {chatMessages.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-full">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Chat verwijderen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Weet u zeker dat u alle berichten in deze conversatie wilt wissen voor uzelf? Dit kan niet ongedaan worden gemaakt.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuleren</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteChat} className="bg-red-600 hover:bg-red-700">Verwijderen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
                    <div className="bg-white p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-sm">
                        <Plus className="h-8 w-8 text-slate-200" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest">Start een gesprek met {selectedChatUser.firstName || 'deze collega'}</p>
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
                      handleSendMessage(selectedChatUser.id, chatReply);
                    }
                  }}
                />
                <Button 
                  size="icon" 
                  className="absolute right-2 bottom-2 h-8 w-8 rounded-full shadow-lg"
                  disabled={!chatReply.trim() || isSending}
                  onClick={() => handleSendMessage(selectedChatUser.id, chatReply)}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col gap-4">
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Communicatie</h3>
              <TabsList className="bg-black h-10 p-1 rounded-xl gap-1 border-none shadow-lg flex w-full">
                <TabsTrigger 
                  value="received" 
                  className="flex-1 text-[10px] h-8 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white transition-all font-black uppercase tracking-widest border-none"
                >
                  Inbox
                </TabsTrigger>
                <TabsTrigger 
                  value="new" 
                  className="flex-1 text-[10px] h-8 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white transition-all font-black uppercase tracking-widest border-none"
                >
                  Collega's
                </TabsTrigger>
                {isPrivileged && (
                  <TabsTrigger 
                    value="alerts" 
                    className="flex-1 text-[10px] h-8 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white transition-all font-black uppercase tracking-widest border-none"
                  >
                    Meldingen
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="received" className="m-0">
              <ScrollArea className="h-[400px]">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : allMessages && allMessages.length > 0 ? (
                  <div className="divide-y divide-slate-50">
                    {allMessages
                      .filter(m => m.toUserId === user?.uid)
                      .reduce((acc, current) => {
                        const existing = acc.find(m => m.fromUserId === current.fromUserId);
                        if (!existing) acc.push(current);
                        return acc;
                      }, [] as Message[])
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

            <TabsContent value="new" className="m-0">
              <div className="p-3 border-b bg-white">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Zoek collega..." 
                    className="pl-9 h-9 rounded-xl border-slate-200 text-xs font-bold"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <ScrollArea className="h-[350px]">
                <div className="p-2 space-y-1">
                  {filteredUsers?.length > 0 ? (
                    filteredUsers.map(u => (
                      <button
                        key={u.id}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-left group"
                        onClick={() => handleOpenChat(u.id)}
                      >
                        <Avatar className="h-9 w-9 border-2 border-white shadow-sm ring-1 ring-slate-100 shrink-0">
                          <AvatarImage src={u.id === user?.uid ? user?.photoURL || undefined : undefined} />
                          <AvatarFallback className="bg-primary text-white text-[10px] font-black uppercase">
                            {getInitials(u.firstName, u.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black uppercase tracking-tight text-slate-900 truncate group-hover:text-primary transition-colors">
                            {u.displayName || u.email}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                            {u.role}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                      </button>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-300">
                      <p className="text-[10px] font-black uppercase tracking-widest">Geen collega's gevonden</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {isPrivileged && (
              <TabsContent value="alerts" className="m-0">
                <ScrollArea className="h-[400px]">
                  {isLoadingMeldingen ? (
                    <div className="flex items-center justify-center h-40">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : activeMeldingen && activeMeldingen.length > 0 ? (
                    <div className="divide-y divide-slate-50">
                      {activeMeldingen.map((melding) => (
                        <div 
                          key={melding.id} 
                          className="p-4 hover:bg-slate-50 transition-all cursor-pointer group flex items-start gap-3"
                          onClick={() => {
                            router.push('/issues/portal');
                          }}
                        >
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            melding.status === 'Nieuw' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                          )}>
                            <AlertCircle className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="font-black text-[10px] uppercase tracking-tighter text-slate-900">{melding.intakenummer}</span>
                              <span className="text-[8px] font-black uppercase text-slate-400">
                                {melding.datum ? format(new Date(melding.datum), 'dd MMM') : '-'}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-700 truncate">{melding.subcategorie}</p>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5 italic">{melding.extra_informatie}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-primary transition-all mt-1" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-center p-8">
                      <div className="bg-slate-100 p-4 rounded-full mb-4">
                        <Clock className="h-8 w-8 text-slate-300" />
                      </div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Geen nieuwe meldingen</p>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}
