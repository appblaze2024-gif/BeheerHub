'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  Download,
  File as FileIcon,
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
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import {
  useCollection,
  useFirestore,
} from '@/firebase';
import { VehicleImportDialog } from '@/components/vehicle-import-dialog';
import { AddActionDialog } from '@/components/add-action-dialog';
import { AddMaintenanceDialog } from '@/components/add-maintenance-dialog';
import { AddDamageDialog } from '@/components/add-damage-dialog';
import { AddVehicleDialog } from '@/components/add-vehicle-dialog';
import { VehicleImageUploader } from '@/components/vehicle-image-uploader';
import { AddDocumentDialog } from '@/components/add-document-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ArrowLeft, Pencil } from 'lucide-react';

type MaterieelType = 'voertuigen' | 'machines';

function MaterielView({ materieelType }: { materieelType: MaterieelType }) {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = React.useState('');
  const isTablet = useIsMobile(1024);

  const collectionName = materieelType;

  const materieelCollection = React.useMemo(() => {
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

  const actionsCollection = React.useMemo(() => {
    if (!firestore || !selectedItem) return null;
    return collection(firestore, collectionName, selectedItem.id, 'actions');
  }, [firestore, selectedItem, collectionName]);

  const { data: actions, isLoading: actionsLoading } = useCollection<any>(actionsCollection);

  const maintenanceCollection = React.useMemo(() => {
    if (!firestore || !selectedItem) return null;
    return collection(firestore, collectionName, selectedItem.id, 'maintenance');
  }, [firestore, selectedItem, collectionName]);

  const { data: maintenance, isLoading: maintenanceLoading } = useCollection<any>(maintenanceCollection);

  const damagesCollection = React.useMemo(() => {
    if (!firestore || !selectedItem) return null;
    return collection(firestore, collectionName, selectedItem.id, 'damages');
  }, [firestore, selectedItem, collectionName]);

  const { data: damages, isLoading: damagesLoading } = useCollection<any>(damagesCollection);
  
  const documentsCollection = React.useMemo(() => {
    if (!firestore || !selectedItem) return null;
    return collection(firestore, collectionName, selectedItem.id, 'documents');
  }, [firestore, selectedItem, collectionName]);

  const { data: documents, isLoading: documentsLoading } = useCollection<any>(documentsCollection);

  const mainImage = PlaceHolderImages.find((p) => p.id === 'vehicle-side');

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
  
  const idLabel = materieelType === 'voertuigen' ? 'Kenteken' : 'ID';
  const numberLabel = materieelType === 'voertuigen' ? 'Voertuignummer' : 'Machinenummer';
  const numberField = materieelType === 'voertuigen' ? 'voertuignummer' : 'machinenummer';

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
                        {materieelType === 'voertuigen' && 
                          <div className="bg-blue-600 px-1 py-0.5 text-white text-xs">
                             <span className='font-sans'>NL</span>
                          </div>
                        }
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
                    <VehicleImageUploader
                      materieelId={selectedItem.id}
                      materieelType={materieelType}
                      imageUrl={selectedItem.imageUrl ?? mainImage?.imageUrl}
                      imageHint={selectedItem.imageUrl ? `${selectedItem.merk} ${selectedItem.model}` : mainImage?.imageHint}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">
                          Algemene gegevens
                        </h3>
                        <AddVehicleDialog
                          vehicle={selectedItem}
                          open={isVehicleDialogOpen}
                          onOpenChange={setIsVehicleDialogOpen}
                          materieelType={materieelType}
                        >
                          <Button variant="ghost" size="icon" onClick={handleEditVehicle}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </AddVehicleDialog>
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
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="actions" className="flex-1 flex flex-col min-h-0">
                <TabsList>
                  <TabsTrigger value="actions">Acties</TabsTrigger>
                  <TabsTrigger value="maintenance">Onderhoud</TabsTrigger>
                  <TabsTrigger value="damages">Schade</TabsTrigger>
                  <TabsTrigger value="documents">Documenten</TabsTrigger>
                </TabsList>
                
                <TabsContent value="actions" className="h-full mt-4">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Acties</CardTitle>
                      <AddActionDialog materieelId={selectedItem.id} materieelType={materieelType}>
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Actie toevoegen
                        </Button>
                      </AddActionDialog>
                    </CardHeader>
                    {/* Actions content here */}
                  </Card>
                </TabsContent>

                <TabsContent value="maintenance" className="h-full mt-4">
                   <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Onderhoud</CardTitle>
                      <AddMaintenanceDialog materieelId={selectedItem.id} materieelType={materieelType}>
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Onderhoud toevoegen
                        </Button>
                      </AddMaintenanceDialog>
                    </CardHeader>
                    {/* Maintenance content here */}
                  </Card>
                </TabsContent>

                <TabsContent value="damages" className="h-full mt-4">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Schade</CardTitle>
                      <Button size="sm" onClick={handleAddNewDamage}>
                        <Plus className="mr-2 h-4 w-4" />
                        Schade melden
                      </Button>
                    </CardHeader>
                    {/* Damages content here */}
                  </Card>
                </TabsContent>

                <TabsContent value="documents" className="h-full mt-4">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Documenten</CardTitle>
                      <Button size="sm" onClick={handleAddNewDocument}>
                        <Plus className="mr-2 h-4 w-4" />
                        Document toevoegen
                      </Button>
                    </CardHeader>
                    {/* Documents content here */}
                  </Card>
                </TabsContent>
              </Tabs>
              <AddDamageDialog
                open={isDamageDialogOpen}
                onOpenChange={setIsDamageDialogOpen}
                materieelId={selectedItem.id}
                materieelType={materieelType}
                damage={editingDamage}
              />
              <AddDocumentDialog
                open={isDocumentDialogOpen}
                onOpenChange={setIsDocumentDialogOpen}
                materieelId={selectedItem.id}
                materieelType={materieelType}
                document={editingDocument}
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
  const [activeTab, setActiveTab] = React.useState<MaterieelType>('voertuigen');

  const handleImportSuccess = () => {
    setIsImporting(false);
  };
  
  return (
    <div className="grid grid-rows-[auto_1fr] flex-1 min-h-0">
      <PageHeader title="Wagenpark">
        <AddVehicleDialog materieelType={activeTab}>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Nieuw
          </Button>
        </AddVehicleDialog>
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
      </PageHeader>
      
       <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MaterieelType)} className="flex-1 flex flex-col min-h-0">
        <div className="px-6">
          <TabsList>
            <TabsTrigger value="voertuigen">Voertuigen</TabsTrigger>
            <TabsTrigger value="machines">Machines</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="voertuigen" className="px-6 pb-6 mt-4 flex-1 min-h-0">
          <MaterielView materieelType="voertuigen" />
        </TabsContent>
        <TabsContent value="machines" className="px-6 pb-6 mt-4 flex-1 min-h-0">
          <MaterielView materieelType="machines" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
