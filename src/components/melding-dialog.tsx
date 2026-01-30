'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2, File as FileIcon, Upload, Pencil, MapPin, Camera, Package, Clock, Car, Plus, X } from 'lucide-react';
import { useFirestore, useUser, useCollection, useFirebaseApp, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardContent } from './ui/card';
import { Separator } from './ui/separator';
import { Checkbox } from './ui/checkbox';
import type { Melding, MeldingTask } from '@/lib/types';


interface MeldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  melding?: Melding | null;
}

const menuItems = [
    { label: 'Werkzaamheden', icon: Pencil },
    { label: 'Locatiegegevens', icon: MapPin },
    { label: 'Documenten', icon: FileText },
    { label: 'Foto\'s', icon: Camera },
    { label: 'Materialen', icon: Package },
    { label: 'Uren', icon: Clock },
    { label: 'Kilometers / parkeerkosten', icon: Car },
];

export function MeldingDialog({
  open,
  onOpenChange,
  melding,
}: MeldingDialogProps) {
  const firestore = useFirestore();
  const [tasks, setTasks] = React.useState<MeldingTask[]>([]);
  const [newTaskDescription, setNewTaskDescription] = React.useState('');
  
  React.useEffect(() => {
    if (melding) {
      setTasks(melding.tasks || []);
    }
  }, [melding]);

  const saveTasks = async (updatedTasks: MeldingTask[]) => {
    if (!firestore || !melding?.id) return;
    const meldingRef = doc(firestore, 'meldingen', melding.id);
    await updateDocumentNonBlocking(meldingRef, { tasks: updatedTasks });
  };
  
  const handleAddTask = () => {
    if (newTaskDescription.trim() === '') return;
    const newTasks = [...tasks, { id: doc(collection(firestore, 'temp')).id, description: newTaskDescription, completed: false }];
    setTasks(newTasks);
    saveTasks(newTasks);
    setNewTaskDescription('');
  };

  const handleToggleTask = (taskId: string, completed: boolean) => {
    const newTasks = tasks.map(task => task.id === taskId ? { ...task, completed } : task);
    setTasks(newTasks);
    saveTasks(newTasks);
  };
  
  const handleDeleteTask = (taskId: string) => {
    const newTasks = tasks.filter(task => task.id !== taskId);
    setTasks(newTasks);
    saveTasks(newTasks);
  };

  const handleSetStatus = async (newStatus: Melding['status']) => {
      if (!firestore || !melding?.id) return;
      const meldingRef = doc(firestore, 'meldingen', melding.id);
      await updateDocumentNonBlocking(meldingRef, { status: newStatus });
      onOpenChange(false);
  }

  if (!melding) {
      return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl p-0 h-[90vh] flex flex-col">
        <div className='flex items-center justify-between p-4 border-b'>
             <h2 className="text-xl font-bold">Werkbon: {melding.intakenummer}</h2>
             <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
        </div>
        <div className="flex-1 flex min-h-0">
          {/* Left Column */}
          <div className="w-1/3 bg-gray-50 dark:bg-gray-900/50 border-r flex flex-col">
            <div className="p-6 border-b">
              <h3 className="font-semibold text-lg">{melding.straatnaam}, {melding.plaats}</h3>
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                  <p>Melder: {melding.melder}</p>
                  <p>Categorie: {melding.hoofdcategorie} &gt; {melding.subcategorie}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                <nav className="flex flex-col gap-1">
                    {menuItems.map(item => (
                        <Button key={item.label} variant="ghost" className="justify-start gap-3 text-base h-12">
                           <item.icon className="h-5 w-5 text-muted-foreground" />
                           <span>{item.label}</span>
                        </Button>
                    ))}
                </nav>
            </div>
            <div className="p-4 border-t mt-auto">
              <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => handleSetStatus('Afgerond')}>
                  Werkbon afronden
              </Button>
            </div>
          </div>
          
          {/* Right Column */}
          <div className="w-2/3 flex flex-col overflow-y-auto">
             <div className="p-6 space-y-6">
                <Card>
                    <CardHeader><CardContent className='p-0 text-sm'>{melding.extra_informatie}</CardContent></CardHeader>
                </Card>
                <Card>
                    <CardHeader><h3 className="font-semibold">Uitgevoerde werkzaamheden</h3></CardHeader>
                    <CardContent>
                       <div className="space-y-4">
                           {tasks.map(task => (
                               <div key={task.id} className="flex items-center gap-4 group">
                                   <Checkbox
                                        checked={task.completed}
                                        onCheckedChange={(checked) => handleToggleTask(task.id, !!checked)}
                                        className="h-6 w-6"
                                   />
                                   <span className={`flex-1 ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.description}</span>
                                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100" onClick={() => handleDeleteTask(task.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                               </div>
                           ))}
                       </div>
                       <Separator className="my-4" />
                       <div className="flex items-center gap-2">
                           <Input
                             placeholder="Voeg een nieuwe taak toe"
                             value={newTaskDescription}
                             onChange={(e) => setNewTaskDescription(e.target.value)}
                             onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                           />
                           <Button onClick={handleAddTask}><Plus className="h-4 w-4 mr-2" /> Voeg taak toe</Button>
                       </div>
                    </CardContent>
                </Card>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
