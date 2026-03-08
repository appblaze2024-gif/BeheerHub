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
  Filter,
  Camera,
} from 'lucide-react';
import { collection, doc } from 'firebase/firestore';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
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
import { AddDocumentDialog } from '@/components/add-document-dialog';
import { ApkOverviewDialog } from '@/components/apk-overview-dialog';
import { MaintenanceOverviewDialog } from '@/components/maintenance-overview-dialog';
import { VehicleImageUploader } from '@/components/vehicle-image-uploader';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

type MaterieelType = 'voertuigen' | 'machines';

function DetailRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-1 sm:pb-2 gap-0.5 sm:gap-1">
      <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">
        {label}
      </span>
      <span className="text-xs sm:text-sm font-black text-slate-900 sm:text-right truncate">
        {value || '-'}
      </span>
    </div>
  );
}

function MaterielView({ materieelType, canEdit, canDelete }: { materieelType: MaterieelType, canEdit: boolean, canDelete: boolean }) {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = React.useState('');
  const isTablet = useIsMobile(1024);
  const isMobile = useIsMobile(640);
  const { profile } = useProfile();

  const collectionName = materieelType;
  const isMachine = materieelType === 'machines';

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
  
  const [isVehicleDialogOpen, setIsVehicleDialogOpen] = React.useState(false);
  const [isDamageDialogOpen, setIsDamageDialogOpen] = React.useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = React.useState(false);
  const [editingDamage, setEditingDamage] = React.useState<any | null>(null);
  const [editingDocument, setEditingDocument] = React.useState<any | null>(null);

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
    <div className="grid lg:grid-cols-[280px_1fr] gap-4 sm:gap-6 min-h-0 h-full relative overflow-hidden">
        <Card className={cn(
            "flex-col h-full min-h-0 overflow-hidden", 
            isTablet && selectedItem ? "hidden" : "flex"
        )}>
          <CardHeader className="p-3 border-b shrink-0">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input 
                    placeholder={`Zoek ${materieelType}...`}
                    className="pl-9 h-9 rounded-xl border-slate-200 bg-slate-50 text-xs" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="flex flex-col space-y-1 p-2 pb-20">
                {filteredMaterieel && filteredMaterieel.length > 0 ? (
                  filteredMaterieel.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={cn(
                          "flex items-start justify-between p-2.5 rounded-xl text-left cursor-pointer transition-all border-2",
                          selectedItem?.id === item.id && !isTablet
                              ? "bg-primary border-primary text-white shadow-lg scale-[1.01]"
                              : "hover:bg-slate-50 border-transparent"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                            "inline-flex items-center rounded-sm border-2 overflow-hidden font-mono font-bold text-[9px]",
                            "bg-yellow-400 border-black text-black"
                        )}>
                          <div className="bg-blue-600 px-1 py-0.5 text-white">
                            <span className='font-sans text-[7px]'>NL</span>
                          </div>
                          <span className="px-1 py-0.5 tracking-wider uppercase">{item.id}</span>
                        </div>
                        <p className={cn("text-xs font-black mt-1.5 truncate uppercase tracking-tight", selectedItem?.id === item.id && !isTablet ? "text-white" : "text-slate-900")}>
                          {item.merk} {item.model}
                        </p>
                        {(item.type || item.bouwjaar) && (
                          <p className={cn("text-[9px] font-bold uppercase tracking-widest mt-0.5 opacity-70", selectedItem?.id === item.id && !isTablet ? "text-white" : "text-slate-400")}>
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
                  <div className="text-center p-8 text-muted-foreground bg-slate-50/50 rounded-xl m-2">
                    <Truck className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="font-bold uppercase text-[9px] tracking-widest">Geen {materieelType}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className={cn(
            "flex-col gap-4 sm:gap-6 min-h-0 h-full overflow-hidden", 
            selectedItem ? "flex" : "hidden lg:flex"
        )}>
          {selectedItem ? (
            <div key={selectedItem.id} className="flex flex-col gap-4 sm:gap-6 flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-4 sm:gap-6 pb-20 p-1">
                  <Card className="rounded-[1.5rem] sm:rounded-[2rem] shadow-xl border-none overflow-hidden shrink-0">
                    <CardHeader className="bg-slate-900 text-white p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className='flex items-center gap-3 min-w-0'>
                          {isTablet && (
                              <Button variant="ghost" size="icon" onClick={() => setSelectedItem(null)} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 shrink-0">
                                <ArrowLeft className="h-4 w-4" />
                              </Button>
                            )}
                            <div className="min-w-0">
                                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-white leading-none mb-0.5 truncate">
                                {selectedItem?.id}
                                </h2>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{selectedItem?.merk} {selectedItem?.model}</p>
                            </div>
                        </div>
                        <Badge
                          className={cn(
                            "font-black uppercase text-[8px] sm:text-[10px] tracking-widest px-2 sm:px-4 h-6 sm:h-7 rounded-lg sm:rounded-xl border-none shadow-lg shrink-0",
                            selectedItem?.status === 'Actief'
                              ? 'bg-green-500 text-white'
                              : 'bg-red-600 text-white'
                          )}
                        >
                          {selectedItem?.status ?? 'N.B.'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col xl:flex-row gap-6 lg:gap-8">
                        <div className="w-full xl:w-[280px] shrink-0">
                          <div className="rounded-2xl overflow-hidden shadow-xl ring-2 ring-slate-50">
                            <VehicleImageUploader 
                              materieelId={selectedItem.id}
                              materieelType={materieelType}
                              imageUrl={selectedItem.imageUrl || null}
                              imageHint={`${selectedItem.merk} ${selectedItem.model}`}
                              className="w-full aspect-video"
                            />
                          </div>
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                              Specificaties
                            </h3>
                            {canEdit && (
                              <AddVehicleDialog
                                vehicle={selectedItem}
                                open={isVehicleDialogOpen}
                                onOpenChange={setIsVehicleDialogOpen}
                                materieelType={materieelType}
                              >
                                <Button variant="outline" size="sm" className="h-7 font-black uppercase text-[9px] rounded-lg border-slate-200" onClick={handleEditVehicle}>
                                  <Pencil className="mr-1.5 h-3 w-3" />
                                  Bewerken
                                </Button>
                              </AddVehicleDialog>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                            <DetailRow label={idLabel} value={selectedItem?.id} />
                            <DetailRow label={numberLabel} value={selectedItem?.[numberField]} />
                            <DetailRow label="Merk" value={selectedItem?.merk} />
                            <DetailRow label="Model" value={selectedItem?.model} />
                            <DetailRow label="Type" value={selectedItem?.type} />
                            <DetailRow label="Bouwjaar" value={selectedItem?.bouwjaar} />
                            <DetailRow label="Brandstof" value={selectedItem?.brandstof} />
                            
                            {!isMachine && (
                              <DetailRow 
                                label="APK Datum" 
                                value={selectedItem?.apk_vervaldatum ? format(new Date(selectedItem.apk_vervaldatum), 'dd MMM yyyy', { locale: nl }) : '-'} 
                              />
                            )}
                            <DetailRow 
                              label="Opbouw" 
                              value={selectedItem?.opbouw_keuring ? format(new Date(selectedItem.opbouw_keuring), 'dd MMM yyyy', { locale: nl }) : '-'} 
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Tabs key={`tabs-${selectedItem.id}`} defaultValue="maintenance" className="flex-1 flex flex-col min-h-[400px]">
                    <div className="overflow-x-auto no-scrollbar pb-1 shrink-0">
                        <TabsList className="w-max inline-flex h-10 bg-white rounded-xl shadow-sm border p-1">
                            {canViewTab('maintenance') && <TabsTrigger value="maintenance" className="rounded-lg px-4 h-full text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white">Onderhoud</TabsTrigger>}
                            {canViewTab('damages') && <TabsTrigger value="damages" className="rounded-lg px-4 h-full text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white">Schade</TabsTrigger>}
                            {canViewTab('documents') && <TabsTrigger value="documents" className="rounded-lg px-4 h-full text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white">Docs</TabsTrigger>}
                        </TabsList>
                    </div>
                    
                    {canViewTab('maintenance') && <TabsContent value="maintenance" className="flex-1 mt-3 min-h-0">
                      <Card className="h-full flex flex-col rounded-[1.5rem] shadow-xl border-none overflow-hidden bg-white">
                        <CardHeader className="flex flex-row items-center justify-between p-4 border-b bg-slate-50/50">
                          <CardTitle className="text-[9px] font-black uppercase tracking-widest text-slate-400">Historie</CardTitle>
                          {canEdit && <AddMaintenanceDialog materieelId={selectedItem.id} materieelType={materieelType}>
                            <Button size="sm" className="h-8 font-black uppercase tracking-tight rounded-lg shadow-lg text-[10px]">
                              <Plus className="mr-1.5 h-3 w-3" />
                              Toevoegen
                            </Button>
                          </AddMaintenanceDialog>}
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto p-0">
                          <Table className="text-xs">
                              <TableHeader className="bg-white sticky top-0 z-10">
                              <TableRow className="hover:bg-transparent border-b">
                                  <TableHead className="text-[9px] font-black uppercase px-4 h-10">Datum</TableHead>
                                  <TableHead className="text-[9px] font-black uppercase px-4 h-10">Beschrijving</TableHead>
                                  <TableHead className="text-[9px] font-black uppercase px-4 h-10 text-right">Prijs</TableHead>
                                  <TableHead className="w-[50px]"></TableHead>
                              </TableRow>
                              </TableHeader>
                              <TableBody>
                              {maintenanceLoading ? (
                                  <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
                              ) : maintenance && maintenance.length > 0 ? (
                                  maintenance.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item: any) => (
                                  <TableRow key={item.id} className="group h-12">
                                      <TableCell className="font-bold text-slate-500 px-4">{format(new Date(item.date), 'dd-MM-yy')}</TableCell>
                                      <TableCell className="font-black text-slate-900 px-4 truncate max-w-[150px]">{item.description}</TableCell>
                                      <TableCell className="text-right font-black px-4">€ {Number(item.cost || 0).toFixed(0)}</TableCell>
                                      <TableCell className="px-4">
                                      {canDelete && (
                                          <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl">
                                              <AlertDialogHeader>
                                              <AlertDialogTitle className="text-base font-black uppercase">Verwijderen?</AlertDialogTitle>
                                              <AlertDialogDescription className="text-xs">Dit onderhoudsrecord wordt permanent gewist.</AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                              <AlertDialogCancel className="h-9 rounded-xl text-xs font-bold">Annuleren</AlertDialogCancel>
                                              <AlertDialogAction onClick={() => handleDeleteMaintenance(item.id)} className="h-9 rounded-xl text-xs font-black uppercase bg-red-600">Wissen</AlertDialogAction>
                                              </AlertDialogFooter>
                                          </AlertDialogContent>
                                          </AlertDialog>
                                      )}
                                      </TableCell>
                                  </TableRow>
                                  ))
                              ) : (
                                  <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                      <p className="text-[9px] font-black uppercase tracking-widest opacity-30">Geen historie</p>
                                  </TableCell></TableRow>
                              )}
                              </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </TabsContent>}

                    {canViewTab('damages') && <TabsContent value="damages" className="flex-1 mt-3 min-h-0">
                      <Card className="h-full flex flex-col rounded-[1.5rem] shadow-xl border-none overflow-hidden bg-white">
                        <CardHeader className="flex flex-row items-center justify-between p-4 border-b bg-slate-50/50">
                          <CardTitle className="text-[9px] font-black uppercase tracking-widest text-slate-400">Schades</CardTitle>
                          {canEdit && <Button size="sm" onClick={handleAddNewDamage} className="h-8 font-black uppercase tracking-tight rounded-lg shadow-lg text-[10px]">
                            <Plus className="mr-1.5 h-3 w-3" />
                            Melden
                          </Button>}
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto p-0">
                          <Table className="text-xs">
                              <TableHeader className="bg-white sticky top-0 z-10">
                              <TableRow className="hover:bg-transparent border-b">
                                  <TableHead className="text-[9px] font-black uppercase px-4 h-10">Datum</TableHead>
                                  <TableHead className="text-[9px] font-black uppercase px-4 h-10">Omschrijving</TableHead>
                                  <TableHead className="text-[9px] font-black uppercase px-4 h-10">Status</TableHead>
                                  <TableHead className="w-[40px]"></TableHead>
                              </TableRow>
                              </TableHeader>
                              <TableBody>
                              {damagesLoading ? (
                                  <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
                              ) : damages && damages.length > 0 ? (
                                  damages.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item: any) => (
                                  <TableRow key={item.id} className="group cursor-pointer hover:bg-slate-50 h-12" onClick={() => handleEditDamage(item)}>
                                      <TableCell className="font-bold text-slate-500 px-4">{format(new Date(item.date), 'dd-MM-yy')}</TableCell>
                                      <TableCell className="font-black text-slate-900 px-4 truncate max-w-[120px]">{item.description}</TableCell>
                                      <TableCell className="px-4">
                                        <Badge className={cn("text-[8px] font-black uppercase px-1.5 h-4 border-none", item.status === 'Afgehandeld' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>
                                            {item.status?.[0] || 'O'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="px-4"><ChevronRight className="h-3 w-3 text-slate-200" /></TableCell>
                                  </TableRow>
                                  ))
                              ) : (
                                  <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                      <p className="text-[9px] font-black uppercase tracking-widest opacity-30">Geen meldingen</p>
                                  </TableCell></TableRow>
                              )}
                              </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </TabsContent>}

                    {canViewTab('documents') && <TabsContent value="documents" className="flex-1 mt-3 min-h-0">
                      <Card className="h-full flex flex-col rounded-[1.5rem] shadow-xl border-none overflow-hidden bg-white">
                        <CardHeader className="flex flex-row items-center justify-between p-4 border-b bg-slate-50/50">
                          <CardTitle className="text-[9px] font-black uppercase tracking-widest text-slate-400">Documenten</CardTitle>
                          {canEdit && <Button size="sm" onClick={handleAddNewDocument} className="h-8 font-black uppercase tracking-tight rounded-lg shadow-lg text-[10px]">
                            <Plus className="mr-1.5 h-3 w-3" />
                            Upload
                          </Button>}
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto p-0">
                          <Table className="text-xs">
                              <TableBody>
                              {documentsLoading ? (
                                  <TableRow><TableCell className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
                              ) : documents && documents.length > 0 ? (
                                  documents.sort((a: any, b: any) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)).map((item: any) => (
                                  <TableRow key={item.id} className="group cursor-pointer hover:bg-slate-50 h-12" onClick={() => handleEditDocument(item)}>
                                      <TableCell className="px-4">
                                          <div className="flex items-center gap-3">
                                              <div className="bg-slate-100 p-1.5 rounded-lg"><FileIcon className="h-3.5 w-3.5 text-blue-500" /></div>
                                              <div className="flex flex-col min-w-0">
                                                  <span className="font-black text-[11px] uppercase tracking-tight truncate">{item.title}</span>
                                                  <span className="text-[8px] font-bold text-slate-400 uppercase">{item.files?.length || 0} files</span>
                                              </div>
                                          </div>
                                      </TableCell>
                                      <TableCell className="w-[40px] px-4"><ChevronRight className="h-3 w-3 text-slate-200" /></TableCell>
                                  </TableRow>
                                  ))
                              ) : (
                                  <TableRow><TableCell className="text-center py-12 text-muted-foreground">
                                      <p className="text-[9px] font-black uppercase tracking-widest opacity-30">Geen docs</p>
                                  </TableCell></TableRow>
                              )}
                              </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </TabsContent>}
                  </Tabs>
                </div>
              </ScrollArea>
              
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
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50/30 rounded-[2rem] border-2 border-dashed border-slate-200">
                <div className="bg-white p-6 rounded-full shadow-lg mb-4">
                    <Truck className="h-10 w-10 text-primary opacity-20" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 mb-1">Geen selectie</h3>
                <p className="font-bold uppercase text-[9px] tracking-widest text-slate-400">Kies een item uit de lijst.</p>
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
  const isMobile = useIsMobile(640);

  const isSuperUser = profile?.role === 'Super admin';
  const canCreate = isSuperUser || !!profile?.permissions?.vehicles?.create;
  const canEdit = isSuperUser || !!profile?.permissions?.vehicles?.edit;
  const canDelete = isSuperUser || !!profile?.permissions?.vehicles?.delete;

  const handleImportSuccess = () => {
    setIsImporting(false);
  };
  
  return (
    <div className="grid grid-rows-[auto_1fr] flex-1 min-h-0 h-full overflow-hidden bg-white">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MaterieelType)} className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
        <header className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 border-b bg-slate-50/30 shrink-0">
            <TabsList className="w-full sm:w-auto h-9 sm:h-11 bg-white rounded-xl shadow-sm border p-1">
                <TabsTrigger value="voertuigen" className="flex-1 sm:flex-none rounded-lg text-[10px] sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-white">Voertuigen</TabsTrigger>
                <TabsTrigger value="machines" className="flex-1 sm:flex-none rounded-lg text-[10px] sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-white">Machines</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setIsApkDialogOpen(true)} className="shrink-0 font-black h-8 text-[9px] uppercase rounded-lg border-slate-200">
                    <CalendarCheck className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    <span>APK</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsMaintenanceDialogOpen(true)} className="shrink-0 font-black h-8 text-[9px] uppercase rounded-lg border-slate-200">
                    <Wrench className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    <span>Plan</span>
                </Button>
              </div>
              
              <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                {canCreate && (
                  <AddVehicleDialog materieelType={activeTab}>
                    <Button size="sm" className="shrink-0 font-black h-8 uppercase tracking-tight rounded-lg shadow-lg text-[9px] px-3">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      <span>Nieuw</span>
                    </Button>
                  </AddVehicleDialog>
                )}
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl p-1.5 border-slate-100">
                    <DropdownMenuLabel className="text-[9px] font-black uppercase text-slate-400 tracking-widest px-2 py-1">Beheer</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={activeTab === 'machines'} onSelect={() => setIsImporting(true)} className="rounded-lg h-9 text-xs font-bold cursor-pointer">
                      <Upload className="mr-2 h-3.5 w-3.5 text-primary" /> CSV Import
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-lg h-9 text-xs font-bold cursor-pointer">
                      <Download className="mr-2 h-3.5 w-3.5 text-primary" /> Excel Export
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
        </header>
        <TabsContent value="voertuigen" className="p-0 sm:p-4 flex-1 min-h-0 h-full overflow-hidden m-0">
          <MaterielView materieelType="voertuigen" canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
        <TabsContent value="machines" className="p-0 sm:p-4 flex-1 min-h-0 h-full overflow-hidden m-0">
          <MaterielView materieelType="machines" canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
      </Tabs>
      
      <VehicleImportDialog
          open={isImporting}
          onOpenChange={setIsImporting}
          onSuccess={handleImportSuccess}
      />
      <ApkOverviewDialog open={isApkDialogOpen} onOpenChange={setIsApkDialogOpen} />
      <MaintenanceOverviewDialog open={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen} />
    </div>
  );
}
