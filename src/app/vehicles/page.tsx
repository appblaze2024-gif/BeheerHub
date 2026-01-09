'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  Download,
  Trash2,
  Pencil,
  Wrench,
  File as FileIcon,
} from 'lucide-react';
import { collection, doc, deleteDoc } from 'firebase/firestore';
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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import {
  useCollection,
  useFirestore,
  useFirebaseApp,
} from '@/firebase';
import { VehicleImportDialog } from '@/components/vehicle-import-dialog';
import { AddActionDialog } from '@/components/add-action-dialog';
import { AddMaintenanceDialog } from '@/components/add-maintenance-dialog';
import { AddDamageDialog } from '@/components/add-damage-dialog';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { AddVehicleDialog } from '@/components/add-vehicle-dialog';
import { VehicleImageUploader } from '@/components/vehicle-image-uploader';
import { AddDocumentDialog } from '@/components/add-document-dialog';

export default function VehiclesPage() {
  const firestore = useFirestore();
  const [isImporting, setIsImporting] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  const vehiclesCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'voertuigen');
  }, [firestore]);

  const { data: vehicles, isLoading } = useCollection<any>(vehiclesCollection);

  const filteredVehicles = React.useMemo(() => {
    if (!vehicles) return [];
    if (!searchTerm) return vehicles;

    return vehicles.filter(vehicle =>
        (vehicle.id && vehicle.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (vehicle.merk && vehicle.merk.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (vehicle.model && vehicle.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (vehicle.type && vehicle.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (vehicle.voertuignummer && vehicle.voertuignummer.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [vehicles, searchTerm]);

  const [selectedVehicle, setSelectedVehicle] = React.useState<any | null>(
    null
  );

  const actionsCollection = React.useMemo(() => {
    if (!firestore || !selectedVehicle) return null;
    return collection(firestore, 'voertuigen', selectedVehicle.id, 'actions');
  }, [firestore, selectedVehicle]);

  const { data: actions, isLoading: actionsLoading } =
    useCollection<any>(actionsCollection);

  const maintenanceCollection = React.useMemo(() => {
    if (!firestore || !selectedVehicle) return null;
    return collection(
      firestore,
      'voertuigen',
      selectedVehicle.id,
      'maintenance'
    );
  }, [firestore, selectedVehicle]);

  const { data: maintenance, isLoading: maintenanceLoading } =
    useCollection<any>(maintenanceCollection);

  const damagesCollection = React.useMemo(() => {
    if (!firestore || !selectedVehicle) return null;
    return collection(firestore, 'voertuigen', selectedVehicle.id, 'damages');
  }, [firestore, selectedVehicle]);

  const { data: damages, isLoading: damagesLoading } =
    useCollection<any>(damagesCollection);
  
  const documentsCollection = React.useMemo(() => {
    if (!firestore || !selectedVehicle) return null;
    return collection(firestore, 'voertuigen', selectedVehicle.id, 'documents');
  }, [firestore, selectedVehicle]);

  const { data: documents, isLoading: documentsLoading } =
    useCollection<any>(documentsCollection);

  const mainImage = PlaceHolderImages.find((p) => p.id === 'vehicle-side');

  React.useEffect(() => {
    if (!selectedVehicle && filteredVehicles && filteredVehicles.length > 0) {
      setSelectedVehicle(filteredVehicles[0]);
    } else if (selectedVehicle && filteredVehicles) {
      // If the selected vehicle is no longer in the list (e.g., deleted or filtered out),
      // select the first one in the filtered list, or null if the list is empty.
      if (!filteredVehicles.find((v) => v.id === selectedVehicle.id)) {
        setSelectedVehicle(filteredVehicles.length > 0 ? filteredVehicles[0] : null);
      }
    }
  }, [filteredVehicles, selectedVehicle]);

  const handleImportSuccess = () => {
    setIsImporting(false);
    // Data will refresh automatically due to useCollection hook
  };
  
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

  return (
    <div className="grid grid-rows-[auto_1fr] flex-1 min-h-0">
      <PageHeader title="Voertuigen">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoek voertuig..." 
            className="pl-9" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <AddVehicleDialog>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Voertuig toevoegen
          </Button>
        </AddVehicleDialog>
        <VehicleImportDialog
          open={isImporting}
          onOpenChange={setIsImporting}
          onSuccess={handleImportSuccess}
        >
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
        </VehicleImportDialog>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </PageHeader>

      <div className="grid grid-cols-[300px_1fr] gap-6 px-6 pb-6 min-h-0">
        <Card className="flex flex-col h-full min-h-0">
          <CardContent className="p-2 flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col space-y-1 pr-2">
              {isLoading ? (
                <div className="text-center text-muted-foreground p-4">
                  Laden...
                </div>
              ) : filteredVehicles && filteredVehicles.length > 0 ? (
                filteredVehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    onClick={() => setSelectedVehicle(vehicle)}
                    className={`flex items-start justify-between p-3 rounded-md text-left cursor-pointer ${
                      selectedVehicle?.id === vehicle.id
                        ? 'bg-secondary'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex-1">
                       <div className="inline-flex items-center bg-yellow-400 rounded-sm border-2 border-black overflow-hidden font-mono font-bold text-black text-sm">
                        <div className="bg-blue-600 px-1 py-0.5 text-white text-xs">
                           <span className='font-sans'>NL</span>
                        </div>
                        <span className="px-2 py-0.5 tracking-wider">{vehicle.id}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {vehicle.merk} {vehicle.model}
                      </p>
                      {(vehicle.type || vehicle.bouwjaar) && (
                        <p className="text-xs text-muted-foreground">
                          {vehicle.type}
                          {vehicle.type && vehicle.bouwjaar && ' ' }
                          {vehicle.bouwjaar && `(${vehicle.bouwjaar})`}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground p-4">
                  Geen voertuigen gevonden.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 min-h-0">
          {selectedVehicle ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">
                        {selectedVehicle?.id}
                      </h2>
                      <p className="text-muted-foreground">
                        {selectedVehicle?.merk} {selectedVehicle?.model}
                      </p>
                    </div>
                    <Badge
                      variant={
                        selectedVehicle?.status === 'Actief'
                          ? 'outline'
                          : 'destructive'
                      }
                      className={
                        selectedVehicle?.status === 'Actief'
                          ? 'text-green-600 border-green-600 bg-green-50 dark:bg-green-900/10'
                          : ''
                      }
                    >
                      {selectedVehicle?.status ?? 'Onbekend'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6">
                    <VehicleImageUploader
                      vehicleId={selectedVehicle.id}
                      imageUrl={selectedVehicle.imageUrl ?? mainImage?.imageUrl}
                      imageHint={selectedVehicle.imageUrl ? `${selectedVehicle.merk} ${selectedVehicle.model}` : mainImage?.imageHint}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">
                          Algemene gegevens
                        </h3>
                        <AddVehicleDialog
                          vehicle={selectedVehicle}
                          open={isVehicleDialogOpen}
                          onOpenChange={setIsVehicleDialogOpen}
                        >
                          <Button variant="ghost" size="icon" onClick={handleEditVehicle}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </AddVehicleDialog>
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            Kenteken
                          </span>
                          <span className="font-medium">
                            {selectedVehicle?.id}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            Voertuignummer
                          </span>
                          <span className="font-medium">
                            {selectedVehicle?.voertuignummer ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">Merk</span>
                          <span className="font-medium">
                            {selectedVehicle?.merk}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">Model</span>
                          <span className="font-medium">
                            {selectedVehicle?.model}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">Type</span>
                          <span className="font-medium">
                            {selectedVehicle?.type ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            Bouwjaar
                          </span>
                          <span className="font-medium">
                            {selectedVehicle?.bouwjaar ?? '-'}
                          </span>
                        </div>

                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            Brandstof
                          </span>
                          <span className="font-medium">
                            {selectedVehicle?.brandstof ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-muted-foreground">
                            APK vervaldatum
                          </span>
                          <span className="font-medium">
                            {selectedVehicle?.apk_vervaldatum
                              ? format(
                                  new Date(selectedVehicle.apk_vervaldatum),
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

                <TabsContent value="actions" className="h-full">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Acties</CardTitle>
                      <AddActionDialog vehicleId={selectedVehicle.id}>
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Actie toevoegen
                        </Button>
                      </AddActionDialog>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto pt-2">
                      <div className="text-sm text-muted-foreground">
                        <div className="flex justify-between px-4 py-2">
                          <span className="w-1/3">Naam</span>
                          <span className="w-1/3">Type actie</span>
                          <span className="w-1/3 text-right">Datum</span>
                        </div>
                        <Separator />
                      </div>
                      {actionsLoading ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          Acties laden...
                        </div>
                      ) : actions && actions.length > 0 ? (
                        <div className="flex-1 overflow-y-auto">
                          {actions.map((action) => (
                            <div
                              key={action.id}
                              className="flex justify-between items-center px-4 py-3 border-b"
                            >
                              <span className="w-1/3">{action.name}</span>
                              <span className="w-1/3">{action.type}</span>
                              <span className="w-1/3 text-right">
                                {new Date(action.date).toLocaleDateString(
                                  'nl-NL'
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          Nog geen acties geregistreerd.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="maintenance" className="h-full">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Onderhoud</CardTitle>
                      <AddMaintenanceDialog vehicleId={selectedVehicle.id}>
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Onderhoud toevoegen
                        </Button>
                      </AddMaintenanceDialog>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto pt-2">
                      <div className="text-sm text-muted-foreground">
                        <div className="flex justify-between px-4 py-2 font-medium">
                          <span className="w-1/4">Omschrijving</span>
                          <span className="w-1/4">Type</span>
                          <span className="w-1/4">Datum</span>
                          <span className="w-1/4 text-right">Kosten</span>
                        </div>
                        <Separator />
                      </div>
                      {maintenanceLoading ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          Onderhoudsgegevens laden...
                        </div>
                      ) : maintenance && maintenance.length > 0 ? (
                        <div className="flex-1 overflow-y-auto">
                          {maintenance.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between items-center px-4 py-3 border-b"
                            >
                              <span className="w-1/4">{item.description}</span>
                              <span className="w-1/4">{item.type}</span>
                              <span className="w-1/4">
                                {new Date(item.date).toLocaleDateString(
                                  'nl-NL'
                                )}
                              </span>
                              <span className="w-1/4 text-right">
                                € {item.cost.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          Nog geen onderhoud geregistreerd.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="damages" className="h-full">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Schade</CardTitle>
                      <Button size="sm" onClick={handleAddNewDamage}>
                        <Plus className="mr-2 h-4 w-4" />
                        Schade melden
                      </Button>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto pt-2">
                       <div className="text-sm text-muted-foreground">
                        <div className="grid grid-cols-[2fr_1fr] gap-4 px-4 py-2 font-medium">
                          <span>Omschrijving</span>
                          <span>Datum</span>
                        </div>
                        <Separator />
                      </div>
                      {damagesLoading ? (
                         <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          Schadegegevens laden...
                        </div>
                      ) : damages && damages.length > 0 ? (
                         <div className="flex-1 overflow-y-auto">
                          {damages.map((item) => (
                            <div
                              key={item.id}
                              onClick={() => handleEditDamage(item)}
                              className="grid grid-cols-[2fr_1fr] gap-4 items-center px-4 py-3 border-b hover:bg-muted/50 cursor-pointer rounded-md"
                            >
                              <span className="truncate">{item.description}</span>
                              <span>{new Date(item.date).toLocaleDateString('nl-NL')}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          Nog geen schade geregistreerd.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="documents" className="h-full">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Documenten</CardTitle>
                      <Button size="sm" onClick={handleAddNewDocument}>
                        <Plus className="mr-2 h-4 w-4" />
                        Document toevoegen
                      </Button>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto pt-2">
                      <div className="text-sm text-muted-foreground">
                        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 px-4 py-2 font-medium">
                          <span>Bestandsnaam</span>
                          <span>Type</span>
                          <span>Grootte</span>
                        </div>
                        <Separator />
                      </div>
                      {documentsLoading ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          Documenten laden...
                        </div>
                      ) : documents && documents.length > 0 ? (
                        <div className="flex-1 overflow-y-auto">
                          {documents.map((doc) => (
                            <div
                              key={doc.id}
                              onClick={() => handleEditDocument(doc)}
                              className="grid grid-cols-1 gap-4 items-center px-4 py-3 border-b hover:bg-muted/50 cursor-pointer rounded-md"
                            >
                               <div>
                                <div className="font-medium truncate">{doc.title}</div>
                                {doc.description && <div className="text-sm text-muted-foreground truncate">{doc.description}</div>}
                               </div>
                              {doc.files?.map((file: any) => (
                                <div key={file.url} className='flex items-center justify-between pl-4'>
                                    <a
                                    href={file.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <FileIcon className="h-4 w-4" />
                                    <span className="truncate">{file.name}</span>
                                  </a>
                                  <span className='text-sm text-muted-foreground'>{(file.size / 1024).toFixed(2)} KB</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          Nog geen documenten gevonden.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
              <AddDamageDialog
                open={isDamageDialogOpen}
                onOpenChange={setIsDamageDialogOpen}
                vehicleId={selectedVehicle.id}
                damage={editingDamage}
              />
              <AddDocumentDialog
                open={isDocumentDialogOpen}
                onOpenChange={setIsDocumentDialogOpen}
                vehicleId={selectedVehicle.id}
                document={editingDocument}
              />
            </>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Voertuigen laden...
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Selecteer een voertuig om de details te bekijken of importeer
              voertuigen.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
