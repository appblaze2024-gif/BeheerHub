
'use client';

import * as React from 'react';
import {
  List,
  Plus,
  Search,
  FileText,
  Calendar,
} from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import {
  useCollection,
  useFirestore,
} from '@/firebase';
import type { Schouw, Project, UserProfile } from '@/lib/types';
import { useProfile } from '@/firebase/profile-provider';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SchouwDialog } from '@/components/schouw-dialog';

export default function SchouwenPage() {
  const firestore = useFirestore();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>('');
  const [selectedSchouw, setSelectedSchouw] = React.useState<Schouw | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const schouwingenCollection = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    return collection(
      firestore,
      'projects',
      selectedProjectId,
      'schouwingen'
    );
  }, [firestore, selectedProjectId]);

  const { data: schouwingen, isLoading: isLoadingSchouwingen } = useCollection<Schouw>(schouwingenCollection);
  
  const canCreate = profile?.role === 'Super admin' || !!profile?.permissions?.schouwen?.create;

  React.useEffect(() => {
    if (projects && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id!);
    }
  }, [projects, selectedProjectId]);
  
  React.useEffect(() => {
    if (schouwingen && schouwingen.length > 0 && !selectedSchouw) {
        setSelectedSchouw(schouwingen[0]);
    } else if (schouwingen && selectedSchouw) {
        if (!schouwingen.find(s => s.id === selectedSchouw.id)) {
            setSelectedSchouw(schouwingen.length > 0 ? schouwingen[0] : null);
        }
    }
  }, [schouwingen, selectedSchouw]);

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      <header className="flex items-center justify-between p-6">
        <h1 className="text-2xl font-bold">Schouwen</h1>
        <div className="flex items-center gap-2">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId} disabled={isLoadingProjects}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecteer een project" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map(p => <SelectItem key={p.id} value={p.id!}>{p.projectnaam}</SelectItem>)}
              </SelectContent>
            </Select>
            {canCreate && (
                <Button onClick={() => setIsDialogOpen(true)} disabled={!selectedProjectId}>
                  <Plus className="mr-2 h-4 w-4" /> Nieuwe Schouw
                </Button>
            )}
        </div>
      </header>
      <div className="flex flex-1 min-h-0 px-6 pb-6 gap-6">
        <aside className="w-1/3 bg-card border rounded-lg flex flex-col">
           <div className="p-3 border-b">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Zoek inspecties..." className="pl-9" />
             </div>
           </div>
           <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col p-2">
               {isLoadingSchouwingen ? (
                  <div className="text-center text-muted-foreground p-4">
                   Laden...
                 </div>
               ) : schouwingen && schouwingen.length > 0 ? (
                 schouwingen.map((schouw) => (
                   <button
                     key={schouw.id}
                     onClick={() => setSelectedSchouw(schouw)}
                     className={`flex items-start justify-between p-3 rounded-md text-left cursor-pointer ${
                       selectedSchouw?.id === schouw.id
                         ? 'bg-secondary'
                         : 'hover:bg-muted/50'
                     }`}
                   >
                     <div className="flex flex-col gap-1">
                       <p className="font-semibold">{schouw.title}</p>
                       <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                         <Calendar className='h-4 w-4'/>
                         {format(new Date(schouw.date), 'd MMMM yyyy', { locale: nl })}
                       </p>
                     </div>
                     <Badge variant="outline">{schouw.status}</Badge>
                   </button>
                 ))
               ) : (
                  <div className="text-center text-muted-foreground p-8 flex flex-col items-center gap-4">
                   <List className='h-12 w-12'/>
                   <p>Geen inspecties gevonden voor dit project.</p>
                 </div>
               )}
             </div>
           </div>
        </aside>
        <main className="flex-1">
            {selectedSchouw ? (
                <Card className="h-full flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-xl">{selectedSchouw.title}</CardTitle>
                        <div className='text-sm text-muted-foreground flex items-center gap-4 pt-1'>
                            <span>Status: {selectedSchouw.status}</span>
                            <span>|</span>
                            <span>Door: {selectedSchouw.inspectorName}</span>
                            <span>|</span>
                            <span>Op: {format(new Date(selectedSchouw.date), 'd MMM yyyy', { locale: nl })}</span>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-6 pt-0">
                         <div className="flex flex-col items-center justify-center h-full text-muted-foreground border-2 border-dashed rounded-lg">
                           <FileText className="h-16 w-16 mb-4"/>
                           <h3 className="text-lg font-semibold">Inspectiepunten</h3>
                           <p className="text-sm">Beheer van inspectiepunten wordt binnenkort toegevoegd.</p>
                       </div>
                    </CardContent>
                </Card>
            ) : (
                 <Card className="h-full flex flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-24 w-24 mb-4"/>
                    <h2 className="text-xl font-semibold">Selecteer een inspectie</h2>
                    <p>Of maak een nieuwe aan om te beginnen.</p>
                </Card>
            )}
        </main>
      </div>
      <SchouwDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={selectedProjectId}
        onSuccess={() => {}}
      />
    </div>
  );
}
