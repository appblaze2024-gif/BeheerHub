'use client';

import * as React from 'react';
import { useFirebaseApp, useFirestore, useCollection, setDocumentNonBlocking } from '@/firebase';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Folder as FolderIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { Progress } from './ui/progress';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import type { Project, Medewerker, Dienst, Folder } from '@/lib/types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';

// Folder tree logic adapted from bestanden/page.tsx
interface FolderWithChildren extends Folder {
    children: FolderWithChildren[];
}

const FolderTreeItem = ({ folder, selectedFolderId, onSelectFolder, level }: { folder: FolderWithChildren, selectedFolderId: string | null, onSelectFolder: (folderId: string) => void, level: number }) => {
    const [isOpen, setIsOpen] = React.useState(true);
    
    return (
        <div className="flex flex-col">
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
            </div>
            {isOpen && folder.children.length > 0 && (
                <div className="flex flex-col">
                    {folder.children.map(child => (
                        <FolderTreeItem key={child.id} folder={child} selectedFolderId={selectedFolderId} onSelectFolder={onSelectFolder} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    )
}

// Main Dialog Component
interface SaveWeekPdfDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    project?: Project | null;
    medewerkers?: Medewerker[] | null;
    diensten?: Dienst[] | null;
    weekDays: Date[];
    weekNumber: number;
    currentYear: number;
}

export function SaveWeekPdfDialog({ open, onOpenChange, project, medewerkers, diensten, weekDays, weekNumber, currentYear }: SaveWeekPdfDialogProps) {
  const app = useFirebaseApp();
  const firestore = useFirestore();
  
  const [fileName, setFileName] = React.useState('');
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>('root');
  const [isSaving, setIsSaving] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (open && project) {
      setFileName(`Weekplanning_WK${weekNumber}_${currentYear}_${project.projectnaam}.pdf`);
    } else {
      setFileName('');
      setSelectedFolderId('root');
      setIsSaving(false);
      setUploadProgress(null);
    }
  }, [open, project, weekNumber, currentYear]);

  const allFoldersQuery = React.useMemo(() => {
    if (!firestore || !project?.id) return null;
    return collection(firestore, 'projects', project.id, 'folders');
  }, [firestore, project?.id]);
  const { data: allFolders, isLoading: isLoadingAllFolders } = useCollection<Folder>(allFoldersQuery);
  
  const folderTree = React.useMemo(() => {
    if (!allFolders) return [];
    const folderMap = new Map<string, FolderWithChildren>(allFolders.map(f => [f.id, { ...f, children: [] }]));
    const tree: FolderWithChildren[] = [];

    allFolders.forEach(f => {
      const node = folderMap.get(f.id);
      if (node) {
        if (f.folderId && folderMap.has(f.folderId)) {
          folderMap.get(f.folderId)!.children.push(node);
        } else {
          tree.push(node);
        }
      }
    });

    const sortFolders = (folders: FolderWithChildren[]) => {
        folders.sort((a, b) => a.name.localeCompare(b.name));
        folders.forEach(f => sortFolders(f.children));
    }
    sortFolders(tree);

    return tree;
  }, [allFolders]);

  const generateWeekPdf = (): Blob => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    
    doc.setFontSize(18);
    doc.text(`Weekplanning: ${project?.projectnaam || ''}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Week ${weekNumber} - ${currentYear}`, 14, 30);

    const head = [['Medewerker', ...weekDays.map(d => format(d, 'eee dd-MM', { locale: nl }))]];

    const body = (medewerkers || [])
      .filter(m => m.status === 'Actief')
      .map(medewerker => {
        const rowData = [`${medewerker.voornaam || ''} ${medewerker.achternaam || ''}`.trim()];
        weekDays.forEach(day => {
            const dienstenForCell = (diensten || []).filter(d => 
                d.medewerkerId === medewerker.id && isSameDay(new Date(d.datum), day)
            );
            const cellText = dienstenForCell.map(d => `${d.starttijd}-${d.eindtijd} ${d.werksoort}`).join('\n');
            rowData.push(cellText);
        });
        return rowData;
    });

    (doc as any).autoTable({
      startY: 36,
      head: head,
      body: body,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 1.5,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [228, 228, 231],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 40 },
      },
    });

    return doc.output('blob');
  };

  const handleSave = async () => {
    if (!project || !fileName || !app || !firestore) return;

    setIsSaving(true);
    setUploadProgress(0);

    const pdfBlob = generateWeekPdf();
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
    
    const storage = getStorage(app);
    const storagePath = `projects/${project.id}/bestanden/${selectedFolderId || 'root'}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, pdfFile);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Upload failed:", error);
        setIsSaving(false);
        setUploadProgress(null);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const bestandenColRef = collection(firestore, 'projects', project.id, 'bestanden');
          const fileDocRef = doc(bestandenColRef);
          
          const fileData = {
            name: fileName,
            type: pdfFile.type,
            size: pdfFile.size,
            url: downloadURL,
            uploadedAt: new Date().toISOString(),
            storagePath: storagePath,
            folderId: selectedFolderId,
          };
          await setDocumentNonBlocking(fileDocRef, fileData, {});
        } catch (error) {
           console.error("Error creating firestore document:", error);
        } finally {
            setIsSaving(false);
            setUploadProgress(null);
            onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
            <DialogHeader>
                <DialogTitle>Weekplanning opslaan als PDF</DialogTitle>
                <DialogDescription>
                    Geef een bestandsnaam op en kies een map om de PDF op te slaan.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="pdf-filename">Bestandsnaam</Label>
                    <Input id="pdf-filename" value={fileName} onChange={(e) => setFileName(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label>Opslaan in map</Label>
                    <div className="border rounded-md p-2 h-48 overflow-y-auto">
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
                        </div>
                        ) : (
                            folderTree.map(folder => (
                            <FolderTreeItem key={folder.id} folder={folder} selectedFolderId={selectedFolderId} onSelectFolder={setSelectedFolderId} level={0} />
                            ))
                        )}
                    </div>
                </div>
                {isSaving && uploadProgress !== null && (
                    <div className="space-y-2">
                        <Label>Uploaden...</Label>
                        <Progress value={uploadProgress} />
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Annuleren</Button>
                <Button onClick={handleSave} disabled={!fileName || isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Opslaan
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
