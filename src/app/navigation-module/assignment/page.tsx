'use client';

import * as React from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, orderBy } from 'firebase/firestore';
import { 
  Loader2, 
  Calendar, 
  User as UserIcon, 
  CheckCircle2, 
  Navigation, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Sliders, 
  LayoutGrid, 
  Check, 
  MapPin, 
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useProject } from '@/context/project-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { UserProfile, Project as ProjectType, RouteAssignment, Wijk } from '@/lib/types';

export default function RouteAssignmentPage() {
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const { selectedProjectId, setSelectedProjectId } = useProject();

  const [selectedDate, setSelectedDay] = React.useState<Date>(new Date());
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [selectedRouteType, setSelectedRouteType] = React.useState<'veegroutes' | 'prullenbakken'>('prullenbakken');
  const [selectedRouteId, setSelectedRouteId] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Fetch Projects
  const projectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'projects'), orderBy('projectnaam', 'asc'));
  }, [firestore]);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<ProjectType>(projectsQuery);

  const activeProject = projects?.find(p => p.id === selectedProjectId);

  // Fetch Users
  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);

  // Fetch Active Assignments for the selected day
  const assignmentsQuery = useMemoFirebase(() => {
    if (!firestore || !selectedProjectId) return null;
    return query(
        collection(firestore, 'route_assignments'), 
        where('date', '==', dateStr),
        where('projectId', '==', selectedProjectId)
    );
  }, [firestore, selectedProjectId, dateStr]);
  const { data: assignments, isLoading: isLoadingAssignments } = useCollection<RouteAssignment>(assignmentsQuery);

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    if (!searchTerm.trim()) return users;
    const q = searchTerm.toLowerCase();
    return users.filter(u => 
        (u.displayName || u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  const handleAddAssignment = async () => {
    if (!firestore || !selectedProjectId || !selectedUserId || !selectedRouteId || !activeProject) return;
    
    setIsSubmitting(true);
    try {
        const routeData = selectedRouteType === 'veegroutes' 
            ? activeProject.veegroutes?.find(r => r.id === selectedRouteId)
            : activeProject.prullenbakkenroutes?.find(r => r.id === selectedRouteId);

        const assignmentData: Omit<RouteAssignment, 'id'> = {
            userId: selectedUserId,
            projectId: selectedProjectId,
            routeId: selectedRouteId,
            routeName: routeData?.naam || 'Onbekende Route',
            routeType: selectedRouteType,
            date: dateStr,
            status: 'Pending'
        };

        await addDocumentNonBlocking(collection(firestore, 'route_assignments'), assignmentData);
        toast({ title: 'Route toegewezen', description: `De route is klaargezet voor ${format(selectedDate, 'd MMMM', { locale: nl })}.` });
        setSelectedRouteId(null);
    } catch (error) {
        console.error("Assignment error:", error);
        toast({ variant: 'destructive', title: 'Fout bij toewijzen' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!firestore) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'route_assignments', id));
        toast({ title: 'Toewijzing verwijderd' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Fout bij verwijderen' });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 overflow-hidden">
      <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={() => router.push('/')}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Routetoewijzing</h1>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setSelectedDay(prev => addDays(prev, -1))}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="px-4 text-[10px] font-black uppercase tracking-widest text-slate-600">
                    {format(selectedDate, 'eeee d MMMM', { locale: nl })}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setSelectedDay(prev => addDays(prev, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <Select value={selectedProjectId || ''} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-10 w-64 font-black border-2 rounded-2xl bg-white shadow-sm">
                    <SelectValue placeholder="Kies project..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-2xl">
                    {projects?.map(p => <SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 p-6 overflow-hidden">
        {/* User Selection */}
        <Card className="lg:col-span-4 flex flex-col rounded-[2.5rem] overflow-hidden border-none shadow-xl bg-white">
          <CardHeader className="p-6 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Collega's</CardTitle>
            <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                    placeholder="Zoek collega..." 
                    className="pl-10 h-11 rounded-2xl border-none bg-white shadow-inner font-bold"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
          </CardHeader>
          <ScrollArea className="flex-1 p-2">
            <div className="space-y-1">
                {isLoadingUsers ? (
                    <div className="flex justify-center py-12 opacity-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : filteredUsers.map(u => (
                    <button
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className={cn(
                            "w-full flex items-center gap-4 p-4 rounded-3xl transition-all text-left border-2",
                            selectedUserId === u.id 
                                ? "bg-primary text-white border-primary shadow-lg scale-[1.02]" 
                                : "bg-white border-transparent hover:bg-slate-50"
                        )}
                    >
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm shrink-0">
                            <AvatarFallback className="bg-slate-100 text-primary font-black text-xs uppercase">
                                {u.firstName?.[0]}{u.lastName?.[0]}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="font-black uppercase text-sm tracking-tight truncate leading-none mb-1">{u.displayName || u.email}</p>
                            <p className={cn("text-[9px] font-black uppercase tracking-[0.1em] opacity-60", selectedUserId === u.id ? "text-white" : "text-slate-400")}>{u.role}</p>
                        </div>
                        {selectedUserId === u.id && <Check className="ml-auto h-5 w-5" />}
                    </button>
                ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Assignment Controls */}
        <div className="lg:col-span-8 flex flex-col gap-6 min-h-0 overflow-hidden">
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden shrink-0">
                <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row items-end gap-6">
                        <div className="flex-1 space-y-3 w-full">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Kies Route Type</Label>
                            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl border-2 border-slate-50">
                                <Button 
                                    variant="ghost" 
                                    className={cn(
                                        "h-11 font-black uppercase text-[10px] rounded-xl border-none transition-all",
                                        selectedRouteType === 'prullenbakken' ? "bg-white text-primary shadow-md" : "text-slate-500 hover:bg-white/50"
                                    )}
                                    onClick={() => { setSelectedRouteType('prullenbakken'); setSelectedRouteId(null); }}
                                >
                                    Prullenbakken
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    className={cn(
                                        "h-11 font-black uppercase text-[10px] rounded-xl border-none transition-all",
                                        selectedRouteType === 'veegroutes' ? "bg-white text-primary shadow-md" : "text-slate-500 hover:bg-white/50"
                                    )}
                                    onClick={() => { setSelectedRouteType('veegroutes'); setSelectedRouteId(null); }}
                                >
                                    Veegroutes
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 space-y-3 w-full">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Selecteer Route</Label>
                            <Select value={selectedRouteId || ''} onValueChange={setSelectedRouteId} disabled={!selectedProjectId}>
                                <SelectTrigger className="h-14 font-black rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-900 focus:ring-primary/30 px-6">
                                    <SelectValue placeholder="Kies een route..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl shadow-2xl p-2">
                                    {(selectedRouteType === 'veegroutes' ? activeProject?.veegroutes : activeProject?.prullenbakkenroutes)?.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.naam}</SelectItem>
                                    ))}
                                    {(!(selectedRouteType === 'veegroutes' ? activeProject?.veegroutes : activeProject?.prullenbakkenroutes)?.length) && (
                                        <p className="p-4 text-xs font-bold text-slate-400 italic">Geen routes beschikbaar</p>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button 
                            className="h-14 px-10 font-black uppercase tracking-widest rounded-2xl shadow-2xl shadow-primary/20 bg-primary text-white hover:bg-primary/90 disabled:opacity-30 transition-all active:scale-95" 
                            disabled={!selectedUserId || !selectedRouteId || isSubmitting}
                            onClick={handleAddAssignment}
                        >
                            {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "TOEWIJZEN"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="flex-1 flex flex-col rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">
                <CardHeader className="p-6 border-b bg-slate-50/50 flex flex-row items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-xl"><LayoutGrid className="h-4 w-4 text-primary" /></div>
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Actieve Toewijzingen</CardTitle>
                    </div>
                    <Badge variant="outline" className="bg-white border-slate-200 font-black px-3">{assignments?.length || 0} Totaal</Badge>
                </CardHeader>
                <ScrollArea className="flex-1">
                    {isLoadingAssignments ? (
                        <div className="flex justify-center py-20 opacity-20"><Loader2 className="h-10 w-10 animate-spin" /></div>
                    ) : assignments && assignments.length > 0 ? (
                        <div className="divide-y divide-slate-50">
                            {assignments.map(a => {
                                const user = users?.find(u => u.id === a.userId);
                                return (
                                    <div key={a.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                                        <div className="flex items-center gap-6 flex-1 min-w-0">
                                            <div className="flex items-center gap-3 w-48 shrink-0">
                                                <div className="h-10 w-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-[10px] font-black uppercase">
                                                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-black text-xs uppercase text-slate-900 truncate">{user?.displayName || user?.email}</p>
                                                    <Badge variant="outline" className="h-4 text-[7px] font-black uppercase tracking-tighter opacity-50">{user?.role}</Badge>
                                                </div>
                                            </div>
                                            
                                            <Separator orientation="vertical" className="h-8 bg-slate-100" />

                                            <div className="min-w-0 flex-1">
                                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Gekoppelde Route</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-sm uppercase tracking-tight text-slate-900 truncate">{a.routeName}</span>
                                                    <Badge className={cn(
                                                        "text-[8px] h-4 uppercase font-black tracking-widest border-none px-1.5",
                                                        a.routeType === 'veegroutes' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                                                    )}>
                                                        {a.routeType === 'veegroutes' ? 'Veeg' : 'Bak'}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="w-32 shrink-0">
                                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</p>
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "h-2 w-2 rounded-full",
                                                        a.status === 'Completed' ? "bg-green-500" : a.status === 'Started' ? "bg-blue-500 animate-pulse" : "bg-slate-200"
                                                    )} />
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">{a.status}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-10 w-10 text-slate-200 hover:text-red-600 hover:bg-red-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-all"
                                            onClick={() => handleDeleteAssignment(a.id)}
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-slate-300 text-center gap-4">
                            <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-dashed border-slate-100">
                                <Plus className="h-12 w-12 opacity-10" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-widest max-w-xs mx-auto">Nog geen toewijzingen voor deze dag</p>
                        </div>
                    )}
                </ScrollArea>
            </Card>
        </div>
      </div>
    </div>
  );
}