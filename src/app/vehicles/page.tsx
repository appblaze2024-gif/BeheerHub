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
  ChevronRight,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  AlertCircle,
  Wrench,
  Truck,
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
import { LoadingScreen } from '@/components/loading-screen';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    if (!selectedItem && filteredMaterieel && filteredMaterieel.length > 0 && !isTablet) {
      setSelectedItem(filteredMaterieel[0]);
    } else if (selectedItem && filteredMaterieel) {
      if (!filteredMaterieel.find((v) => v.id === selectedItem.id)) {
        setSelectedItem(null);
      }
    }
  }, [filteredMaterieel, selectedItem, isTablet]);
  
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

  if (isLoading) {
    return <LoadingScreen message="Materieel laden..." />;
  }

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-6 min-h-0 h-full relative">
        <Card className={cn(
            "flex-col h-full min-h-0", 
            isTablet && selectedItem ? "hidden" : "flex"
        )}>
          <CardHeader className="p-4 border-b">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder={`Zoek ${materieelType}...`}
                    className="pl-9 h-9" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col space-y-1 p-2">
                {filteredMaterieel && filteredMaterieel.length > 0 ? (
                  filteredMaterieel.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={cn(
                          "flex items-start justify-between p-3 rounded-xl text-left cursor-pointer transition-all",
                          selectedItem?.id === item.id && !isTablet
                              ? "bg-primary text-white shadow-lg scale-[1.02]"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                            "inline-flex items-center rounded-sm border-[1.5px] overflow-hidden font-mono font-bold text-[10px]",
                            selectedItem?.id === item.id && !isTablet ? "bg-yellow-400 border-black text-black" : "bg-yellow-400 border-black text-black"
                        )}>
                          <div className="bg-blue-600 px-1 py-0.5 text-white">
                            <span className='font-sans text-[8px]'>NL</span>
                          </div>
                          <span className="px-1.5 py-0.5 tracking-wider">{item.id}</span>
                        </div>
                        <p className={cn("text-xs font-black mt-1.5 truncate uppercase tracking-tight", selectedItem?.id === item.id && !isTablet ? "text-white" : "text-slate-900")}>
                          {item.merk} {item.model}
                        </p>
                        {(item.type || item.bouwjaar) && (
                          <p className={cn("text-[10px] font-bold uppercase tracking-tighter mt-0.5", selectedItem?.id === item.id && !isTablet ? "text-white/70" : "text-slate-400")}>
                            {item.type} {item.bouwjaar && `(${item.bouwjaar})`}
                          </p>
                        )}
                      </div>
                      {selectedItem?.id !== item.id && (
                          <ChevronRight className="h-4 w-4 text-slate-300 mt-1" />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center p-12 text-muted-foreground bg-slate-50/50 rounded-2xl m-2">
                    <Truck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold uppercase text-[10px] tracking-widest">Geen {materieelType}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className={cn(
            "flex-col gap-6 min-h-0", 
            selectedItem ? "flex" : "hidden lg:flex"
        )}>
          {selectedItem ? (
            <div key={selectedItem.id} className="flex flex-col gap-6 flex-1 min-h-0">
              <Card className="rounded-2xl shadow-sm border-slate-100 overflow-hidden shrink-0">
                <CardHeader className="bg-slate-50/50 border-b p-4 md:p-6">
                  <div className="flex items-start justify-between">
                    <div className='flex items-center gap-3'>
                       {isTablet && (
                          <Button variant="ghost" size="icon" onClick={() => setSelectedItem(null)} className="h-9 w-9 rounded-full bg-white shadow-sm border border-slate-200">
                            <ArrowLeft className="h-4 w-4" />
                          </Button>
                        )}
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 leading-none mb-1">
                            {selectedItem?.id}
                            </h2>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedItem?.merk} {selectedItem?.model}</p>
                        </div>
                    </div>
                    <Badge
                      variant={
                        selectedItem?.status === 'Actief'
                          ? 'outline'
                          : 'destructive'
                      }
                      className={cn(
                        "font-black uppercase text-[10px] tracking-widest px-3 h-6",
                        selectedItem?.status === 'Actief'
                          ? 'text-green-600 border-green-200 bg-green-50'
                          : 'bg-red-600 text-white'
                      )}
                    >
                      {selectedItem?.status ?? 'Onbekend'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex flex-col xl:flex-row gap-8">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">
                          Specificaties
                        </h3>
                        {canEdit && <AddVehicleDialog
                          vehicle={selectedItem}
                          open={isVehicleDialogOpen}
                          onOpenChange={setIsVehicleDialogOpen}
                          materieelType={materieelType}
                        >
                          <Button variant="outline" size="sm" className="h-8 font-bold" onClick={handleEditVehicle}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Bewerken
                          </Button>
                        </AddVehicleDialog>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4">
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">
                            {idLabel}
                          </span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.id}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">
                            {numberLabel}
                          </span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.[numberField] ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">Merk</span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.merk}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">Model</span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.model}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">Type</span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.type ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">
                            Bouwjaar
                          </span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.bouwjaar ?? '-'}
                          </span>
                        </div>

                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">
                            Brandstof
                          </span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.brandstof ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">
                            APK vervaldatum
                          </span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.apk_vervaldatum
                              ? format(
                                  new Date(selectedItem.apk_vervaldatum),
                                  'dd-MM-yyyy'
                                )
                              : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">
                            Opbouw keuring
                          </span>
                          <span className="text-slate-900 font-black">
                            {selectedItem?.opbouw_keuring
                              ? format(
                                  new Date(selectedItem.opbouw_keuring),
                                  'dd-MM-yyyy'
                                )
                              : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-tighter">
                            Bandenwissel
                          </span>
                          <span className="text-slate-900 font-black">
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

              <Tabs key={selectedItem.id} defaultValue="maintenance" className="flex-1 flex flex-col min-h-0">
                <div className="overflow-x-auto no-scrollbar pb-1 shrink-0">
                    <TabsList className="w-max inline-flex">
                        {canViewTab('maintenance') && <TabsTrigger value="maintenance">Onderhoud</TabsTrigger>}
                        {canViewTab('damages') && <TabsTrigger value="damages">Schade</TabsTrigger>}
                        {canViewTab('documents') && <TabsTrigger value="documents">Documenten</TabsTrigger>}
                    </TabsList>
                </div>
                
                {canViewTab('maintenance') && <TabsContent value="maintenance" className="flex-1 mt-4 min-h-0">
                   <Card className="h-full flex flex-col rounded-2xl shadow-sm border-slate-100 overflow-hidden">
                    <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Onderhoudshistorie</CardTitle>
                      {canEdit && <AddMaintenanceDialog materieelId={selectedItem.id} materieelType={materieelType}>
                        <Button size="sm" className="w-full sm:w-auto h-8 font-black uppercase tracking-tight">
                          <Plus className="mr-2 h-4 w-4" />
                          Toevoegen
                        </Button>
                      </AddMaintenanceDialog>}
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0">
                      <div className="overflow-x-auto">
                        <Table className="min-w-[700px]">
                            <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Datum</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Omschrijving</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Type</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Details</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 text-right">Kosten</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {maintenanceLoading ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                            ) : maintenance && maintenance.length > 0 ? (
                                maintenance.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item: any) => (
                                <TableRow key={item.id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                                    <TableCell className="text-xs font-bold text-slate-600">{format(new Date(item.date), 'dd-MM-yyyy')}</TableCell>
                                    <TableCell className="font-black text-xs text-slate-900">{item.description}</TableCell>
                                    <TableCell><Badge variant="secondary" className="text-[9px] font-black uppercase px-2 h-5 bg-slate-100 border-none">{item.type}</Badge></TableCell>
                                    <TableCell className="text-[11px] text-slate-400 max-w-[200px] truncate italic" title={item.details}>{item.details || '-'}</TableCell>
                                    <TableCell className="text-right font-black text-xs">€ {Number(item.cost || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>
                                    {canDelete && (
                                        <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="h-4 w-4" /></Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                            <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                                            <AlertDialogDescription>Dit onderhoudsrecord wordt permanent verwijderd.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                            <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteMaintenance(item.id)} className="bg-red-600">Verwijderen</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                    </TableCell>
                                </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={6} className="text-center py-16 text-muted-foreground bg-slate-50/30">
                                    <Wrench className="h-10 w-10 mx-auto mb-3 opacity-10" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Geen onderhoudshistorie</p>
                                </TableCell></TableRow>
                            )}
                            </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>}

                {canViewTab('damages') && <TabsContent value="damages" className="flex-1 mt-4 min-h-0">
                  <Card className="h-full flex flex-col rounded-2xl shadow-sm border-slate-100 overflow-hidden">
                    <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Schademeldingen</CardTitle>
                      {canEdit && <Button size="sm" onClick={handleAddNewDamage} className="w-full sm:w-auto h-8 font-black uppercase tracking-tight">
                        <Plus className="mr-2 h-4 w-4" />
                        Schade melden
                      </Button>}
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0">
                      <div className="overflow-x-auto">
                        <Table className="min-w-[600px]">
                            <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Datum</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Omschrijving</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Status</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 text-center">Bestanden</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {damagesLoading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                            ) : damages && damages.length > 0 ? (
                                damages.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item: any) => (
                                <TableRow key={item.id} className="group cursor-pointer hover:bg-slate-50/50 transition-colors border-b border-slate-100" onClick={() => handleEditDamage(item)}>
                                    <TableCell className="text-xs font-bold text-slate-600">{format(new Date(item.date), 'dd-MM-yyyy')}</TableCell>
                                    <TableCell className="font-black text-xs text-slate-900 truncate max-w-xs">{item.description}</TableCell>
                                    <TableCell>
                                    <Badge variant={item.status === 'Afgehandeld' ? 'outline' : 'secondary'} className={cn(
                                        "text-[9px] font-black uppercase px-2 h-5",
                                        item.status === 'Afgehandeld' ? "text-green-600 border-green-200" : "bg-orange-100 text-orange-600 border-none"
                                    )}>
                                        {item.status || 'Open'}
                                    </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                    {item.files?.length > 0 ? (
                                        <div className="flex items-center justify-center gap-1.5 text-slate-400">
                                        <FileIcon className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-black">{item.files.length}</span>
                                        </div>
                                    ) : '-'}
                                    </TableCell>
                                    <TableCell>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="h-4 w-4" /></Button>
                                    </TableCell>
                                </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={5} className="text-center py-16 text-muted-foreground bg-slate-50/30">
                                    <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-10" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Geen schademeldingen</p>
                                </TableCell></TableRow>
                            )}
                            </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>}

                {canViewTab('documents') && <TabsContent value="documents" className="flex-1 mt-4 min-h-0">
                  <Card className="h-full flex flex-col rounded-2xl shadow-sm border-slate-100 overflow-hidden">
                    <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b">
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Projectbestanden</CardTitle>
                      {canEdit && <Button size="sm" onClick={handleAddNewDocument} className="w-full sm:w-auto h-8 font-black uppercase tracking-tight">
                        <Plus className="mr-2 h-4 w-4" />
                        Toevoegen
                      </Button>}
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0">
                      <div className="overflow-x-auto">
                        <Table className="min-w-[600px]">
                            <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Titel</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Omschrijving</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3">Datum</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 text-center">Bijlagen</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {documentsLoading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                            ) : documents && documents.length > 0 ? (
                                documents.sort((a: any, b: any) => new Date(b.updatedAt?.seconds * 1000 || 0).getTime() - new Date(a.updatedAt?.seconds * 1000 || 0).getTime()).map((item: any) => (
                                <TableRow key={item.id} className="group cursor-pointer hover:bg-slate-50/50 transition-colors border-b border-slate-100" onClick={() => handleEditDocument(item)}>
                                    <TableCell className="font-black text-xs text-slate-900">{item.title}</TableCell>
                                    <TableCell className="text-[11px] text-slate-400 truncate max-w-xs italic">{item.description || '-'}</TableCell>
                                    <TableCell className="text-xs font-bold text-slate-600">{item.updatedAt ? format(new Date(item.updatedAt.seconds * 1000), 'dd-MM-yyyy') : '-'}</TableCell>
                                    <TableCell className="text-center">
                                    {item.files?.length > 0 ? (
                                        <div className="flex items-center justify-center gap-1.5 text-slate-400">
                                        <FileIcon className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-black">{item.files.length}</span>
                                        </div>
                                    ) : '-'}
                                    </TableCell>
                                    <TableCell>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="h-4 w-4" /></Button>
                                    </TableCell>
                                </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={5} className="text-center py-16 text-muted-foreground bg-slate-50/30">
                                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-10" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Geen documenten</p>
                                </TableCell></TableRow>
                            )}
                            </TableBody>
                        </Table>
                      </div>
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
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <Truck className="h-12 w-12 text-slate-300 mb-4 opacity-20" />
                <p className="font-bold uppercase text-[10px] tracking-widest text-slate-400">Selecteer een item uit de lijst om de details te bekijken.</p>
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
    <div className="grid grid-rows-[auto_1fr] flex-1 min-h-0 bg-white">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MaterieelType)} className="flex-1 flex flex-col min-h-0">
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 md:p-6 border-b bg-slate-50/30">
            <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="voertuigen" className="flex-1 sm:flex-none">Voertuigen</TabsTrigger>
                <TabsTrigger value="machines" className="flex-1 sm:flex-none">Machines</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar pb-1">
            <Button variant="outline" size="sm" onClick={() => setIsApkDialogOpen(true)} className="shrink-0 font-bold h-9">
                <CalendarCheck className="mr-2 h-4 w-4 text-primary" /> APK
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsMaintenanceDialogOpen(true)} className="shrink-0 font-bold h-9">
                <Wrench className="mr-2 h-4 w-4 text-primary" /> Onderhoud
            </Button>
            {canCreate && <AddVehicleDialog materieelType={activeTab}>
                <Button size="sm" className="shrink-0 font-black h-9 uppercase tracking-tight">
                <Plus className="mr-2 h-4 w-4" /> Nieuw
                </Button>
            </AddVehicleDialog>}
            <VehicleImportDialog
                open={isImporting}
                onOpenChange={setIsImporting}
                onSuccess={handleImportSuccess}
            >
                <Button variant="outline" size="sm" disabled={activeTab === 'machines'} className="shrink-0 font-bold h-9">
                <Upload className="mr-2 h-4 w-4" />
                Import
                </Button>
            </VehicleImportDialog>
            <Button variant="outline" size="sm" className="shrink-0 font-bold h-9">
                <Download className="mr-2 h-4 w-4" />
                Export
            </Button>
            </div>
        </header>
        <TabsContent value="voertuigen" className="p-4 md:p-6 flex-1 min-h-0">
          <MaterielView materieelType="voertuigen" canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
        <TabsContent value="machines" className="p-4 md:p-6 flex-1 min-h-0">
          <MaterielView materieelType="machines" canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
      </Tabs>
      <ApkOverviewDialog open={isApkDialogOpen} onOpenChange={setIsApkDialogOpen} />
      <MaintenanceOverviewDialog open={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen} />
    </div>
  );
}
