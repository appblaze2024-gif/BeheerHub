'use client';

import * as React from 'react';
import {
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  Download,
  File as FileIcon,
  CalendarCheck,
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  AlertCircle,
  Wrench,
} from 'lucide-react';
import { collection, doc } from 'firebase/firestore';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { VehicleImportDialog } from '@/components/vehicle-import-dialog';
import { AddMaintenanceDialog } from '@/components/add-maintenance-dialog';
import { AddDamageDialog } from '@/components/add-damage-dialog';
import { AddVehicleDialog } from '@/components/add-vehicle-dialog';
import { VehicleImageUploader } from '@/components/vehicle-image-uploader';
import { AddDocumentDialog } from '@/components/add-document-dialog';
import { ApkOverviewDialog } from '@/components/apk-overview-dialog';
import { MaintenanceOverviewDialog } from '@/components/maintenance-overview-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useProfile } from '@/firebase/profile-provider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

type MaterieelType = 'voertuigen' | 'machines';

function MaterielView({ materieelType, canEdit, canDelete }: { materieelType: MaterieelType, canEdit: boolean, canDelete: boolean }) {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = React.useState('');
  const isTablet = useIsMobile(1024);
  const { profile } = useProfile();

  const collectionName = materieelType;

  const materieelCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, collectionName);
  }, [firestore, collectionName]);

  const { data: materieelItems, isLoading } = useCollection<any>(materieelCollection);

  const filteredMaterieel = React.useMemo(() => {
    if (!materieelItems) return [];
    if (!searchTerm) return materieelItems;

    return materieelItems.filter(item =>
      (item.id && item.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.merk && item.merk.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.model && item.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.type && item.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.voertuignummer && item.voertuignummer.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.machinenummer && item.machinenummer.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [materieelItems, searchTerm]);

  const [selectedItem, setSelectedItem] = React.useState<any | null>(null);

  const maintenanceCollection = useMemoFirebase(() => {
    if (!firestore || !selectedItem) return null;
    return collection(firestore, collectionName, selectedItem.id, 'maintenance');
  }, [firestore, selectedItem, collectionName]);

  const { data: maintenance, isLoading: maintenanceLoading } = useCollection<any>(maintenanceCollection);

  const damagesCollection = useMemoFirebase(() => {
    if (!firestore || !selectedItem) return null;
    return collection(firestore, collectionName, selectedItem.id, 'damages');
  }, [firestore, selectedItem, collectionName]);

  const { data: damages, isLoading: damagesLoading } = useCollection<any>(damagesCollection);
  
  const documentsCollection = useMemoFirebase(() => {
    if (!firestore || !selectedItem) return null;
    return collection(firestore, collectionName, selectedItem.id, 'documents');
  }, [firestore, selectedItem, collectionName]);

  const { data: documents, isLoading: documentsLoading } = useCollection<any>(documentsCollection);

  React.useEffect(() => {
    if (!selectedItem && filteredMaterieel && filteredMaterieel.length > 0) {
      setSelectedItem(filteredMaterieel[0]);
    } else if (selectedItem && filteredMaterieel) {
      if (!filteredMaterieel.find((v) => v.id === selectedItem.id)) {
        setSelectedItem(filteredMaterieel.length > 0 ? filteredMaterieel[0] : null);
      }
    }
  }, [filteredMaterieel, selectedItem]);
  
  React.useEffect(() => {
    if (isTablet) {
        setSelectedItem(null);
    }
  }, [isTablet]);

  const [editingDamage, setEditingDamage] = React.useState<any | null>(null);
  const [isDamageDialogOpen, setIsDamageDialogOpen] = React.useState(false);
  const [editingDocument, setEditingDocument] = React.useState<any | null>(null);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = React.useState(false);
  const [isVehicleDialogOpen, setIsVehicleDialogOpen] = React.useState(false);

  const handleEditDamage = (damage: any) => {
    setEditingDamage(damage);
    setIsDamageDialogOpen(true);
  };

  const handleAddNewDamage = () => {
    setEditingDamage(null);
    setIsDamageDialogOpen(true);
  };

  const handleEditDocument = (doc: any) => {
    setEditingDocument(doc);
    setIsDocumentDialogOpen(true);
  };

  const handleAddNewDocument = () => {
    setEditingDocument(null);
    setIsDocumentDialogOpen(true);
  };

  const handleEditVehicle = () => {
    setIsVehicleDialogOpen(true);
  };
  
  const handleDeleteMaintenance = (id: string) => {
    if (!firestore || !selectedItem) return;
    const ref = doc(firestore, collectionName, selectedItem.id, 'maintenance', id);
    deleteDocumentNonBlocking(ref);
  };

  const idLabel = materieelType === 'voertuigen' ? 'Kenteken' : 'ID';
  const numberLabel = materieelType === 'voertuigen' ? 'Voertuignummer' : 'Machinenummer';
  const numberField = materieelType === 'voertuigen' ? 'voertuignummer' : 'machinenummer';

  const canViewTab = (tabId: string) => {
    if (profile?.role === 'Super admin') return true;
    return profile?.permissions?.vehicles?.tabs?.[tabId] ?? true;
  };

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-6 min-h-0 h-full">
        <Card className={cn("flex-col h-full min-h-0", isTablet && !selectedItem ? "flex" : "hidden lg:flex")}>
          <CardHeader>
            <Input 
                placeholder={`Zoek ${materieelType}...`}
                className="pl-9" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
          </CardHeader>
          <CardContent className="p-2 flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col space-y-1 pr-2">
              {isLoading ? (
                <div className="text-center text-muted-foreground p-4">
                  Laden...
                </div>
              ) : filteredMaterieel && filteredMaterieel.length > 0 ? (
                filteredMaterieel.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`flex items-start justify-between p-3 rounded-md text-left cursor-pointer ${
                      selectedItem?.id === item.id && !isTablet
                        ? 'bg-secondary'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex-1">
                       <div className="inline-flex items-center bg-yellow-400 rounded-sm border-2 border-black overflow-hidden font-mono font-bold text-black text-sm">
                        <div className="bg-blue-600 px-1 py-0.5 text-white text-xs">
                           <span className='font-sans'>NL</span>
                        </div>
                        <span className="px-2 py-0.5 tracking-wider">{item.id}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.merk} {item.model}
                      </p>
                      {(item.type || item.bouwjaar) && (
                        <p className="text-xs text-muted-foreground">
                          {item.type}
                          {item.type && item.bouwjaar && ' ' }
                          {item.bouwjaar && `(${item.bouwjaar})`}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground p-4">
                  Geen {materieelType} gevonden.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className={cn("flex-col gap-6 min-h-0", selectedItem ? "flex" : "hidden lg:flex")}>
          {selectedItem ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className='flex items-center gap-2'>
                       {isTablet && (
                          <Button variant="ghost" size="icon" onClick={() => setSelectedItem(null)}>
                            <ArrowLeft className="h-4 w-4" />
                          </Button>
                        )}
                        <h2 className="text-2xl font-bold">
                          {selectedItem?.id}
                        </h2>
                    </div>
                    <Badge
                      variant={
                        selectedItem?.status === 'Actief'
                          ? 'outline'
                          : 'destructive'
                      }
                      className={
                        selectedItem?.status === 'Actief'
                          ? 'text-green-600 border-green-600 bg-green-50 dark:bg-green-900/10'
                          : ''
                      }
                    >
                      {selectedItem?.status ?? 'Onbekend'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">
                          Algemene gegevens
                        </h3>
                        {canEdit && <AddVehicleDialog
                          vehicle={selectedItem}
                          open={isVehicleDialogOpen}
                          onOpenChange={setIsVehicleDialogOpen}
                          materieelType={materieelType}
                        >
                          <Button variant="ghost" size="icon" onClick={handleEditVehicle}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </AddVehicleDialog>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            {idLabel}
                          </span>
                          <span className="font-medium">
                            {selectedItem?.id}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            {numberLabel}
                          </span>
                          <span className="font-medium">
                            {selectedItem?.[numberField] ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">Merk</span>
                          <span className="font-medium">
                            {selectedItem?.merk}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">Model</span>
                          <span className="font-medium">
                            {selectedItem?.model}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">Type</span>
                          <span className="font-medium">
                            {selectedItem?.type ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            Bouwjaar
                          </span>
                          <span className="font-medium">
                            {selectedItem?.bouwjaar ?? '-'}
                          </span>
                        </div>

                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            Brandstof
                          </span>
                          <span className="font-medium">
                            {selectedItem?.brandstof ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            APK vervaldatum
                          </span>
                          <span className="font-medium">
                            {selectedItem?.apk_vervaldatum
                              ? format(
                                  new Date(selectedItem.apk_vervaldatum),
                                  'dd-MM-yyyy'
                                )
                              : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            Opbouw keuring
                          </span>
                          <span className="font-medium">
                            {selectedItem?.opbouw_keuring
                              ? format(
                                  new Date(selectedItem.opbouw_keuring),
                                  'dd-MM-yyyy'
                                )
                              : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            Bandenwissel
                          </span>
                          <span className="font-medium">
                            {selectedItem?.bandenwissel
                              ? format(
                                  new Date(selectedItem.bandenwissel),
                                  'dd-MM-yyyy'
                                )
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="maintenance" className="flex-1 flex flex-col min-h-0">
                <TabsList>
                  {canViewTab('maintenance') && <TabsTrigger value="maintenance">Onderhoud</TabsTrigger>}
                  {canViewTab('damages') && <TabsTrigger value="damages">Schade</TabsTrigger>}
                  {canViewTab('documents') && <TabsTrigger value="documents">Documenten</TabsTrigger>}
                </TabsList>
                
                {canViewTab('maintenance') && <TabsContent value="maintenance" className="flex-1 mt-4">
                   <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Onderhoud</CardTitle>
                      {canEdit && <AddMaintenanceDialog materieelId={selectedItem.id} materieelType={materieelType}>
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Onderhoud toevoegen
                        </Button>
                      </AddMaintenanceDialog>}
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead>Datum</TableHead>
                            <TableHead>Omschrijving</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead className="text-right">Kosten</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {maintenanceLoading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                          ) : maintenance && maintenance.length > 0 ? (
                            maintenance.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item: any) => (
                              <TableRow key={item.id} className="group">
                                <TableCell>{format(new Date(item.date), 'dd-MM-yyyy')}</TableCell>
                                <TableCell className="font-medium">{item.description}</TableCell>
                                <TableCell>{item.type}</TableCell>
                                <TableCell className="text-muted-foreground max-w-[200px] truncate" title={item.details}>{item.details || '-'}</TableCell>
                                <TableCell className="text-right">€ {Number(item.cost || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell>
                                  {canDelete && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="h-4 w-4" /></Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                                          <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt. Dit zal het onderhoudsrecord permanent verwijderen.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteMaintenance(item.id)}>Doorgaan</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Geen onderhoudshistorie gevonden.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>}

                {canViewTab('damages') && <TabsContent value="damages" className="flex-1 mt-4">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Schade</CardTitle>
                      {canEdit && <Button size="sm" onClick={handleAddNewDamage}>
                        <Plus className="mr-2 h-4 w-4" />
                        Schade melden
                      </Button>}
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead>Datum</TableHead>
                            <TableHead>Omschrijving</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Bestanden</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {damagesLoading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                          ) : damages && damages.length > 0 ? (
                            damages.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item: any) => (
                              <TableRow key={item.id} className="group cursor-pointer hover:bg-muted/30" onClick={() => handleEditDamage(item)}>
                                <TableCell>{format(new Date(item.date), 'dd-MM-yyyy')}</TableCell>
                                <TableCell className="font-medium truncate max-w-xs">{item.description}</TableCell>
                                <TableCell>
                                  <Badge variant={item.status === 'Afgehandeld' ? 'outline' : 'secondary'}>
                                    {item.status || 'Open'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  {item.files?.length > 0 ? (
                                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                                      <FileIcon className="h-4 w-4" />
                                      <span className="text-xs">{item.files.length}</span>
                                    </div>
                                  ) : '-'}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="h-4 w-4" /></Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Geen schademeldingen gevonden.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>}

                {canViewTab('documents') && <TabsContent value="documents" className="flex-1 mt-4">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Documenten</CardTitle>
                      {canEdit && <Button size="sm" onClick={handleAddNewDocument}>
                        <Plus className="mr-2 h-4 w-4" />
                        Document toevoegen
                      </Button>}
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead>Titel</TableHead>
                            <TableHead>Omschrijving</TableHead>
                            <TableHead>Toegevoegd op</TableHead>
                            <TableHead className="text-center">Bestanden</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {documentsLoading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                          ) : documents && documents.length > 0 ? (
                            documents.sort((a: any, b: any) => new Date(b.updatedAt?.seconds * 1000 || 0).getTime() - new Date(a.updatedAt?.seconds * 1000 || 0).getTime()).map((item: any) => (
                              <TableRow key={item.id} className="group cursor-pointer hover:bg-muted/30" onClick={() => handleEditDocument(item)}>
                                <TableCell className="font-medium">{item.title}</TableCell>
                                <TableCell className="text-muted-foreground truncate max-w-xs">{item.description || '-'}</TableCell>
                                <TableCell>{item.updatedAt ? format(new Date(item.updatedAt.seconds * 1000), 'dd-MM-yyyy') : '-'}</TableCell>
                                <TableCell className="text-center">
                                  {item.files?.length > 0 ? (
                                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                                      <FileIcon className="h-4 w-4" />
                                      <span className="text-xs">{item.files.length}</span>
                                    </div>
                                  ) : '-'}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="h-4 w-4" /></Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Geen documenten gevonden.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>}
              </Tabs>
              <AddDamageDialog
                open={isDamageDialogOpen}
                onOpenChange={setIsDamageDialogOpen}
                materieelId={selectedItem.id}
                materieelType={materieelType}
                damage={editingDamage}
                canDelete={canDelete}
              />
              <AddDocumentDialog
                open={isDocumentDialogOpen}
                onOpenChange={setIsDocumentDialogOpen}
                materieelId={selectedItem.id}
                materieelType={materieelType}
                document={editingDocument}
                canDelete={canDelete}
              />
            </>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Materieel laden...
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Selecteer een item om de details te bekijken.
            </div>
          )}
        </div>
      </div>
  )
}


export default function MaterieelBeheerPage() {
  const [isImporting, setIsImporting] = React.useState(false);
  const [isApkDialogOpen, setIsApkDialogOpen] = React.useState(false);
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<MaterieelType>('voertuigen');
  const { profile } = useProfile();

  const isSuperUser = profile?.role === 'Super admin';
  const canCreate = isSuperUser || !!profile?.permissions?.vehicles?.create;
  const canEdit = isSuperUser || !!profile?.permissions?.vehicles?.edit;
  const canDelete = isSuperUser || !!profile?.permissions?.vehicles?.delete;


  const handleImportSuccess = () => {
    setIsImporting(false);
  };
  
  return (
    <div className="grid grid-rows-[auto_1fr] flex-1 min-h-0">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MaterieelType)} className="flex-1 flex flex-col min-h-0">
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6">
            <TabsList>
                <TabsTrigger value="voertuigen">Voertuigen</TabsTrigger>
                <TabsTrigger value="machines">Machines</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsApkDialogOpen(true)}>
                <CalendarCheck className="mr-2 h-4 w-4" /> APK
            </Button>
            <Button variant="outline" onClick={() => setIsMaintenanceDialogOpen(true)}>
                <Wrench className="mr-2 h-4 w-4" /> Onderhoud
            </Button>
            {canCreate && <AddVehicleDialog materieelType={activeTab}>
                <Button>
                <Plus className="mr-2 h-4 w-4" /> Nieuw
                </Button>
            </AddVehicleDialog>}
            <VehicleImportDialog
                open={isImporting}
                onOpenChange={setIsImporting}
                onSuccess={handleImportSuccess}
            >
                <Button variant="outline" disabled={activeTab === 'machines'}>
                <Upload className="mr-2 h-4 w-4" />
                Import
                </Button>
            </VehicleImportDialog>
            <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
            </Button>
            </div>
        </header>
        <TabsContent value="voertuigen" className="px-6 pb-6 flex-1 min-h-0">
          <MaterielView materieelType="voertuigen" canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
        <TabsContent value="machines" className="px-6 pb-6 flex-1 min-h-0">
          <MaterielView materieelType="machines" canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
      </Tabs>
      <ApkOverviewDialog open={isApkDialogOpen} onOpenChange={setIsApkDialogOpen} />
      <MaintenanceOverviewDialog open={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen} />
    </div>
  );
}
