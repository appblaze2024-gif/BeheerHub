'use client';

import * as React from 'react';
import {
  Folder as FolderIcon,
  Plus,
  Copy,
  Move,
  Archive,
  MoreHorizontal,
  Trash2,
  Search,
  ChevronDown,
  Download,
  File as FileIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useCollection, useFirestore, useFirebaseApp, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectBestandenDialog } from '@/components/project-bestanden-dialog';
import type { Bestand, Project, Folder } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { FolderCreateDialog } from '@/components/folder-create-dialog';


export default function BestandenPage() {
  const firestore = useFirestore();
  const app = useFirebaseApp();

  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string>('root'); // 'root' for the base directory
  const [isUploadDialogOpen, setIsUploadDialogOpen] = React.useState(false);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const foldersCollection = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    return collection(firestore, 'projects', selectedProjectId, 'folders');
  }, [firestore, selectedProjectId]);

  const { data: folders, isLoading: isLoadingFolders } = useCollection<Folder>(foldersCollection);
  
  const bestandenCollection = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    const q = collection(firestore, 'projects', selectedProjectId, 'bestanden');
    if (selectedFolderId === 'root') {
        return query(q, where('folderId', 'in', [null, '']));
    }
    return query(q, where('folderId', '==', selectedFolderId));
  }, [firestore, selectedProjectId, selectedFolderId]);

  const { data: bestanden, isLoading: isLoadingBestanden } = useCollection<Bestand>(bestandenCollection);
  
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleDeleteBestand = async (e: React.MouseEvent, bestand: Bestand) => {
    e.stopPropagation();
    e.preventDefault();
    if (!firestore || !app || !selectedProjectId) return;

    const bestandDocRef = doc(firestore, 'projects', selectedProjectId, 'bestanden', bestand.id);
    
    if (bestand.storagePath) {
        const storageRef = ref(getStorage(app), bestand.storagePath);
        try {
          await deleteObject(storageRef);
        } catch (error) {
          console.error("Fout bij het verwijderen van storage object:", error);
          if ((error as any).code !== 'storage/object-not-found') {
            return;
          }
        }
    }
    await deleteDocumentNonBlocking(bestandDocRef);
  };
  
  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedFolderId('root');
  }

  const sortedFolders = React.useMemo(() => {
    if (!folders) return [];
    return [...folders].sort((a,b) => a.name.localeCompare(b.name));
  }, [folders])

  return (
    <div className="p-6 flex-1 flex flex-col gap-6">
      <div className="flex items-center gap-4">
          <Label
            htmlFor="select-project"
            className="font-semibold whitespace-nowrap"
          >
            Selecteer Project:
          </Label>
          <Select
            value={selectedProjectId || ''}
            onValueChange={handleProjectChange}
            disabled={isLoadingProjects}
          >
            <SelectTrigger className="w-full max-w-lg">
              <SelectValue placeholder="Selecteer een project" />
            </SelectTrigger>
            <SelectContent>
              {projects?.map((project) => (
                <SelectItem key={project.id} value={project.id!}>
                  {project.projectnaam} [{project.projectnummer}]
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
      </div>
      
      {selectedProjectId ? (
        <div className="flex-1 grid grid-cols-[250px_1fr] gap-6 min-h-0">
            {/* Folder Sidebar */}
            <Card className="flex flex-col">
              <CardContent className="p-2 flex-1 flex flex-col">
                 <div className="p-2">
                  <FolderCreateDialog projectId={selectedProjectId} onSuccess={() => {}}>
                    <Button className="w-full"><Plus className="mr-2 h-4 w-4" /> Nieuwe map</Button>
                  </FolderCreateDialog>
                </div>
                 <div className="flex-1 overflow-y-auto space-y-1 p-2">
                    <Button 
                      variant={selectedFolderId === 'root' ? 'secondary' : 'ghost'} 
                      className="w-full justify-start gap-2"
                      onClick={() => setSelectedFolderId('root')}
                    >
                      <FolderIcon className="h-4 w-4" /> Root
                    </Button>
                    {isLoadingFolders ? (
                      <p className="p-2 text-sm text-muted-foreground">Mappen laden...</p>
                    ) : (
                      sortedFolders.map(folder => (
                        <Button 
                          key={folder.id} 
                          variant={selectedFolderId === folder.id ? 'secondary' : 'ghost'} 
                          className="w-full justify-start gap-2"
                          onClick={() => setSelectedFolderId(folder.id)}
                        >
                          <FolderIcon className="h-4 w-4" /> 
                          <span className="truncate">{folder.name}</span>
                        </Button>
                      ))
                    )}
                 </div>
              </CardContent>
            </Card>

            {/* File List */}
            <div className="flex-1 bg-card rounded-lg border flex flex-col min-h-0">
                <div className="p-3 border-b flex flex-wrap gap-2 justify-between items-center">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button onClick={() => setIsUploadDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Toevoegen</Button>
                        <Button variant="outline" disabled>Kopiëren</Button>
                        <Button variant="outline" disabled>Verplaatsen</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" disabled>Archiveren <ChevronDown className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem>Toevoegen aan archief</DropdownMenuItem>
                                <DropdownMenuItem>Archief uitpakken</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="destructive" disabled>Verwijderen</Button>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Bestandsnaam zoeken" className="pl-9" />
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-card">
                            <TableRow>
                                <TableHead className="w-[50px]"><Checkbox /></TableHead>
                                <TableHead>Naam</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Grootte</TableHead>
                                <TableHead>Datum</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoadingBestanden ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">Bestanden laden...</TableCell>
                                </TableRow>
                            ) : bestanden && bestanden.length > 0 ? (
                                bestanden.map(bestand => (
                                    <TableRow key={bestand.id}>
                                        <TableCell><Checkbox /></TableCell>
                                        <TableCell className="font-medium">
                                            <a href={bestand.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                                                <FileIcon className="h-4 w-4" />
                                                {bestand.name}
                                            </a>
                                        </TableCell>
                                        <TableCell className="truncate">{bestand.type}</TableCell>
                                        <TableCell>{formatBytes(bestand.size)}</TableCell>
                                        <TableCell>{new Date(bestand.uploadedAt).toLocaleDateString('nl-NL')}</TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuItem asChild>
                                                      <a href={bestand.url} download={bestand.name} className="flex items-center">
                                                        <Download className="mr-2 h-4 w-4" /> Downloaden
                                                      </a>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={(e) => handleDeleteBestand(e, bestand)} className="text-destructive focus:text-destructive">
                                                      <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">Geen bestanden gevonden in deze map.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <ProjectBestandenDialog
                    open={isUploadDialogOpen}
                    onOpenChange={setIsUploadDialogOpen}
                    projectId={selectedProjectId}
                    folderId={selectedFolderId === 'root' ? null : selectedFolderId}
                />
            </div>
        </div>
      ) : (
        <Card className="flex-1 flex items-center justify-center">
            <CardContent className="text-center text-muted-foreground p-6">
                <FolderIcon className="mx-auto h-12 w-12" />
                <p className="mt-4 text-lg font-semibold">Selecteer een project</p>
                <p>Kies een project om de bijbehorende bestanden te bekijken en te beheren.</p>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
