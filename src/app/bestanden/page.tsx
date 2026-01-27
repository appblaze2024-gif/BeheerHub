'use client';

import * as React from 'react';
import {
  Folder as FolderIcon,
  Plus,
  ChevronDown,
  Download,
  File as FileIcon,
  FolderPlus,
  Trash2,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { collection, doc, query, where, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectBestandenDialog } from '@/components/project-bestanden-dialog';
import type { Bestand, Project, Folder } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { FolderCreateDialog } from '@/components/folder-create-dialog';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface FolderWithChildren extends Folder {
    children: FolderWithChildren[];
}

const FolderTreeItem = ({ folder, selectedFolderId, onSelectFolder, level, handleDeleteFolder }: { folder: FolderWithChildren, selectedFolderId: string, onSelectFolder: (folderId: string) => void, level: number, handleDeleteFolder: (e: React.MouseEvent, folder: Folder) => Promise<void> }) => {
    const [isOpen, setIsOpen] = React.useState(true);
    
    return (
        <div className="flex flex-col group/tree-item">
            <div
                className={cn('flex items-center gap-1 rounded-md p-1 cursor-pointer hover:bg-muted', selectedFolderId === folder.id && 'bg-secondary')}
                style={{ paddingLeft: `${level * 16}px` }}
                onClick={() => onSelectFolder(folder.id)}
            >
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
                    {folder.children.length > 0 && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                </Button>
                <FolderIcon className="h-4 w-4 text-primary" />
                <span className="flex-1 truncate text-sm">{folder.name}</span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/tree-item:opacity-100"><MoreHorizontal className="h-4 w-4"/></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent onClick={e => e.stopPropagation()}>
                        <DropdownMenuItem onClick={(e) => handleDeleteFolder(e, folder)} className="text-destructive focus:text-destructive cursor-pointer">
                            <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {isOpen && folder.children.length > 0 && (
                <div className="flex flex-col">
                    {folder.children.map(child => (
                        <FolderTreeItem key={child.id} folder={child} selectedFolderId={selectedFolderId} onSelectFolder={onSelectFolder} level={level + 1} handleDeleteFolder={handleDeleteFolder} />
                    ))}
                </div>
            )}
        </div>
    )
}

export default function BestandenPage() {
  const firestore = useFirestore();
  const app = useFirebaseApp();

  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string>('root');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = React.useState(false);

  const projectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'projects');
  }, [firestore]);
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>(projectsCollection);

  const allFoldersQuery = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    return collection(firestore, 'projects', selectedProjectId, 'folders');
  }, [firestore, selectedProjectId]);
  const { data: allFolders, isLoading: isLoadingAllFolders } = useCollection<Folder>(allFoldersQuery);
  
  const folderTree = React.useMemo(() => {
    if (!allFolders) return [];
    const folderMap = new Map<string, FolderWithChildren>(allFolders.map(f => [f.id, { ...f, children: [] }]));
    const tree: FolderWithChildren[] = [];

    allFolders.forEach(f => {
        if (f.folderId && folderMap.has(f.folderId)) {
            folderMap.get(f.folderId)?.children.push(folderMap.get(f.id)!);
        } else {
            tree.push(folderMap.get(f.id)!);
        }
    });

    const sortFolders = (folders: FolderWithChildren[]) => {
        folders.sort((a, b) => a.name.localeCompare(b.name));
        folders.forEach(f => sortFolders(f.children));
    }
    sortFolders(tree);

    return tree;
  }, [allFolders]);


  const bestandenCollection = React.useMemo(() => {
    if (!firestore || !selectedProjectId) return null;
    const q = collection(firestore, 'projects', selectedProjectId, 'bestanden');
    if (selectedFolderId === 'root') {
        return query(q, where('folderId', 'in', [null, '']));
    }
    return query(q, where('folderId', '==', selectedFolderId));
  }, [firestore, selectedProjectId, selectedFolderId]);

  const { data: bestanden, isLoading: isLoadingBestanden } = useCollection<Bestand>(bestandenCollection);
  
  const items = React.useMemo(() => {
    const filesWithType = (bestanden || []).map(b => ({ ...b, itemType: 'file' as const }));
    filesWithType.sort((a, b) => a.name.localeCompare(b.name));
    return filesWithType;
  }, [bestanden]);
  

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
          }
        }
    }
    await deleteDoc(bestandDocRef);
  };

  const deleteFolderAndContents = async (folderId: string) => {
    if (!firestore || !selectedProjectId || !app) return;
  
    const subfoldersQuery = query(collection(firestore, 'projects', selectedProjectId, 'folders'), where('folderId', '==', folderId));
    const subfoldersSnapshot = await getDocs(subfoldersQuery);
  
    for (const subfolderDoc of subfoldersSnapshot.docs) {
      await deleteFolderAndContents(subfolderDoc.id); // Recursion
    }
  
    const batch = writeBatch(firestore);
    const storage = getStorage(app);
  
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
            <aside className='w-64 bg-card rounded-lg border p-2 flex flex-col'>
                 <div className="p-1">
                    <FolderCreateDialog projectId={selectedProjectId} folderId={selectedFolderId === 'root' ? null : selectedFolderId} onSuccess={() => {}}>
                        <Button variant="outline" className="w-full"><FolderPlus className="mr-2 h-4 w-4" /> Nieuwe Map</Button>
                    </FolderCreateDialog>
                </div>
                <div className='flex-1 overflow-y-auto space-y-0.5 pr-1 pt-2 border-t mt-2'>
                    <div
                        className={cn('flex items-center gap-1 rounded-md p-1 cursor-pointer hover:bg-muted', selectedFolderId === 'root' && 'bg-secondary')}
                        onClick={() => setSelectedFolderId('root')}
                    >
                        <FolderIcon className="h-5 w-5 text-primary" />
                        <span className="flex-1 truncate text-sm font-semibold">Root</span>
                    </div>
                    {isLoadingAllFolders ? (
                       <div className="space-y-2 mt-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                       </div>
                    ) : (
                        folderTree.map(folder => (
                           <FolderTreeItem key={folder.id} folder={folder} selectedFolderId={selectedFolderId} onSelectFolder={setSelectedFolderId} level={0} handleDeleteFolder={handleDeleteFolder} />
                        ))
                    )}
                </div>
            </aside>
            <main className="flex-1 bg-card rounded-lg border flex flex-col min-h-0">
                <div className="p-3 border-b flex flex-wrap gap-2 justify-between items-center">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button onClick={() => setIsUploadDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Toevoegen Bestand</Button>
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
                            ) : items && items.length > 0 ? (
                                items.map(item => {
                                    const bestand = item as Bestand;
                                    return (
                                        <TableRow key={`file-${bestand.id}`}>
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
                                    );
                                })
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
