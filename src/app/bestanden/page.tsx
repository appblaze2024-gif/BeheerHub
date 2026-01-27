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
  FolderPlus,
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
import { useCollection, useFirestore, useFirebaseApp } from '@/firebase';
import { collection, doc, query, where, getDocs, writeBatch, deleteDoc, getDoc } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectBestandenDialog } from '@/components/project-bestanden-dialog';
import type { Bestand, Project, Folder } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { FolderCreateDialog } from '@/components/folder-create-dialog';
import { cn } from '@/lib/utils';


export default function BestandenPage() {
  const firestore = useFirestore();
  const app = useFirebaseApp();

  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string>('root');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = React.useState(false);
  const [folderPath, setFolderPath] = React.useState<{id: string, name: string}[]>([{id: 'root', name: 'Root'}]);


  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);

  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const subFoldersQuery = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    const q = collection(firestore, 'projects', selectedProjectId, 'folders');
    if (selectedFolderId === 'root') {
        return query(q, where('folderId', 'in', [null, '']));
    }
    return query(q, where('folderId', '==', selectedFolderId));
  }, [firestore, selectedProjectId, selectedFolderId]);

  const { data: subFolders, isLoading: isLoadingFolders } = useCollection<Folder>(subFoldersQuery);
  
  const bestandenCollection = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    const q = collection(firestore, 'projects', selectedProjectId, 'bestanden');
    if (selectedFolderId === 'root') {
        return query(q, where('folderId', 'in', [null, '']));
    }
    return query(q, where('folderId', '==', selectedFolderId));
  }, [firestore, selectedProjectId, selectedFolderId]);

  const { data: bestanden, isLoading: isLoadingBestanden } = useCollection<Bestand>(bestandenCollection);
  
  React.useEffect(() => {
    if (selectedFolderId === 'root') {
        setFolderPath([{id: 'root', name: 'Root'}]);
        return;
    }
    
    if (!firestore || !selectedProjectId) return;

    const buildPath = async (folderId: string) => {
        const path: {id: string, name: string}[] = [];
        let currentId: string | null = folderId;
        while(currentId && currentId !== 'root') {
            const folderRef = doc(firestore, 'projects', selectedProjectId, 'folders', currentId);
            const folderSnap = await getDoc(folderRef);
            if (folderSnap.exists()) {
                const folderData = folderSnap.data() as Folder;
                path.unshift({ id: folderSnap.id, name: folderData.name });
                currentId = folderData.folderId || null;
            } else {
                break;
            }
        }
        setFolderPath([{id: 'root', name: 'Root'}, ...path]);
    }
    
    buildPath(selectedFolderId);
  }, [selectedFolderId, firestore, selectedProjectId]);


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
    if (!firestore || !app || !selectedProjectId || !bestand.id) return;

    const bestandDocRef = doc(firestore, 'projects', selectedProjectId, 'bestanden', bestand.id);
    
    if (bestand.storagePath) {
        const storageRef = ref(getStorage(app), bestand.storagePath);
        try {
          await deleteObject(storageRef);
        } catch (error) {
          console.error("Fout bij het verwijderen van storage object:", error);
          if ((error as any).code !== 'storage/object-not-found') {
            // If the error is other than not found, we might want to stop.
            // But for now, we'll proceed to delete the firestore doc anyway.
          }
        }
    }
    await deleteDoc(bestandDocRef);
  };

  const deleteFolderAndContents = async (folderId: string) => {
    if (!firestore || !selectedProjectId || !app) return;
  
    // Get subfolders first to recurse
    const subfoldersQuery = query(collection(firestore, 'projects', selectedProjectId, 'folders'), where('folderId', '==', folderId));
    const subfoldersSnapshot = await getDocs(subfoldersQuery);
  
    for (const subfolderDoc of subfoldersSnapshot.docs) {
      await deleteFolderAndContents(subfolderDoc.id); // Recursion
    }
  
    // Now delete this folder's files and the folder itself
    const batch = writeBatch(firestore);
    const storage = getStorage(app);
  
    // Delete files in the current folder
    const filesQuery = query(collection(firestore, 'projects', selectedProjectId, 'bestanden'), where('folderId', '==', folderId));
    const filesSnapshot = await getDocs(filesQuery);
  
    const deleteStoragePromises = filesSnapshot.docs.map(docSnapshot => {
      const bestand = docSnapshot.data() as Bestand;
      batch.delete(docSnapshot.ref);
      if (bestand.storagePath) {
        const storageRef = ref(storage, bestand.storagePath);
        return deleteObject(storageRef).catch(error => {
          if ((error as any).code !== 'storage/object-not-found') {
            console.error(`Failed to delete storage object ${bestand.storagePath}:`, error);
          }
        });
      }
      return Promise.resolve();
    });
  
    await Promise.all(deleteStoragePromises);
  
    // Delete the folder document itself
    const folderRef = doc(firestore, 'projects', selectedProjectId, 'folders', folderId);
    batch.delete(folderRef);
  
    await batch.commit();
  };
  
  const handleDeleteFolder = async (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    if (!firestore || !app || !selectedProjectId) return;
  
    if (!window.confirm(`Weet u zeker dat u de map "${folder.name}" en alle inhoud (inclusief submappen) wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`)) {
      return;
    }
  
    try {
      await deleteFolderAndContents(folder.id);
      if (selectedFolderId === folder.id) {
        setSelectedFolderId(folder.folderId || 'root');
      }
    } catch (error) {
      console.error("Fout bij het verwijderen van de map:", error);
      alert("Er is een fout opgetreden bij het verwijderen van de map. Controleer de console voor details.");
    }
  };


  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedFolderId('root');
  }

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
        <div className="flex-1 flex gap-6 min-h-0">
            <aside className="w-72 bg-card rounded-lg border flex flex-col">
                <div className="flex items-center gap-1 text-sm text-muted-foreground p-2 border-b flex-wrap">
                    {folderPath.map((folder, index) => (
                        <React.Fragment key={folder.id}>
                            {index > 0 && <span className="text-xs">/</span>}
                            <button 
                                onClick={() => setSelectedFolderId(folder.id)}
                                className={cn('hover:underline text-xs p-1 rounded', index === folderPath.length - 1 && 'font-semibold text-foreground bg-muted')}
                            >
                                {folder.name}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {isLoadingFolders ? (
                        <p className="p-2 text-sm text-muted-foreground">Mappen laden...</p>
                    ) : subFolders && subFolders.length > 0 ? (
                        subFolders.map(folder => (
                            <div key={folder.id} className="flex items-center group">
                                <Button variant="ghost" className="w-full justify-start" onDoubleClick={() => setSelectedFolderId(folder.id)}>
                                    <div className="flex items-center gap-2 text-primary" onClick={(e) => { e.stopPropagation(); setSelectedFolderId(folder.id)}}>
                                        <FolderIcon className="h-4 w-4" />
                                        <span>{folder.name}</span>
                                    </div>
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onClick={(e) => handleDeleteFolder(e, folder)} className="text-destructive focus:text-destructive cursor-pointer">
                                            <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))
                    ) : (
                        <p className="p-2 text-sm text-muted-foreground">Geen submappen.</p>
                    )}
                </div>
            </aside>

            <main className="flex-1 bg-card rounded-lg border flex flex-col min-h-0">
                <div className="p-3 border-b flex flex-wrap gap-2 justify-between items-center">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button onClick={() => setIsUploadDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Toevoegen Bestand</Button>
                        <FolderCreateDialog projectId={selectedProjectId} folderId={selectedFolderId === 'root' ? null : selectedFolderId} onSuccess={() => {}}>
                           <Button variant="outline"><FolderPlus className="mr-2 h-4 w-4" /> Nieuwe Map</Button>
                        </FolderCreateDialog>
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
                                                    <a href={bestand.url} download={bestand.name} className="flex items-center cursor-pointer">
                                                        <Download className="mr-2 h-4 w-4" /> Downloaden
                                                    </a>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={(e) => handleDeleteBestand(e, bestand)} className="text-destructive focus:text-destructive cursor-pointer">
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
            </main>
            <ProjectBestandenDialog
                open={isUploadDialogOpen}
                onOpenChange={setIsUploadDialogOpen}
                projectId={selectedProjectId}
                folderId={selectedFolderId === 'root' ? null : selectedFolderId}
            />
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
