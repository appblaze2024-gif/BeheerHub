'use client';

import * as React from 'react';
import Image from 'next/image';
import { MoreHorizontal, Plus, Search, Upload, Download } from 'lucide-react';
import { collection } from 'firebase/firestore';
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
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { VehicleImportDialog } from '@/components/vehicle-import-dialog';

export default function VehiclesPage() {
  const firestore = useFirestore();
  const [isImporting, setIsImporting] = React.useState(false);

  const vehiclesCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'voertuigen');
  }, [firestore]);

  const { data: vehicles, isLoading } = useCollection<any>(vehiclesCollection);

  const [selectedVehicle, setSelectedVehicle] = React.useState<any | null>(
    null
  );
  const mainImage = PlaceHolderImages.find((p) => p.id === 'vehicle-side');

  React.useEffect(() => {
    if (!selectedVehicle && vehicles && vehicles.length > 0) {
      setSelectedVehicle(vehicles[0]);
    } else if (selectedVehicle && vehicles) {
      if (!vehicles.find((v) => v.id === selectedVehicle.id)) {
        setSelectedVehicle(vehicles.length > 0 ? vehicles[0] : null);
      }
    }
  }, [vehicles, selectedVehicle]);

  const handleImportSuccess = () => {
    setIsImporting(false);
  };

  return (
    <div className="grid grid-rows-[auto_1fr] flex-1 min-h-0">
      <PageHeader title="Voertuigen">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Zoek voertuig..." className="pl-9" />
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Voertuig toevoegen
        </Button>
        <VehicleImportDialog
          open={isImporting}
          onOpenChange={setIsImporting}
          onSuccess={handleImportSuccess}
        >
          <Button variant="outline" onClick={() => setIsImporting(true)}>
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
              ) : vehicles && vehicles.length > 0 ? (
                vehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    onClick={() => setSelectedVehicle(vehicle)}
                    className={`flex items-center justify-between p-3 rounded-md text-left cursor-pointer ${
                      selectedVehicle?.id === vehicle.id
                        ? 'bg-sidebar-accent'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div>
                      <p
                        className={`font-semibold ${
                          selectedVehicle?.id === vehicle.id
                            ? 'text-sidebar-accent-foreground'
                            : ''
                        }`}
                      >
                        {vehicle.id}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {vehicle.merk} {vehicle.model}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
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
                      variant="outline"
                      className="text-green-600 border-green-600 bg-green-50 dark:bg-green-900/10"
                    >
                      Actief
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6">
                    <div className="relative w-full max-w-[250px] aspect-video rounded-md overflow-hidden border">
                      {mainImage && (
                        <Image
                          src={mainImage.imageUrl}
                          alt={mainImage.description}
                          fill
                          className="object-cover"
                          data-ai-hint={mainImage.imageHint}
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-4">
                        Algemene gegevens
                      </h3>
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
                          <span className="font-medium">-</span>
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
                            {selectedVehicle?.apk_vervaldatum ?? '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs
                defaultValue="actions"
                className="flex-1 flex flex-col min-h-0"
              >
                <TabsList>
                  <TabsTrigger value="actions">Acties</TabsTrigger>
                  <TabsTrigger value="maintenance">Onderhoud</TabsTrigger>
                  <TabsTrigger value="damages">Schade</TabsTrigger>
                  <TabsTrigger value="documents">Documenten</TabsTrigger>
                </TabsList>

                <TabsContent
                  value="actions"
                  className="flex-1 flex flex-col min-h-0 mt-2"
                >
                  <Card className="h-full flex flex-col">
                    <CardHeader className='flex-row items-center justify-between'>
                      <CardTitle>Acties</CardTitle>
                      <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Actie toevoegen
                      </Button>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto pt-2">
                      <div className="text-sm text-muted-foreground">
                        <div className="flex justify-between px-4 py-2">
                           <span className="w-1/3">Naam</span>
                           <span className="w-1/3">Type actie</span>
                           <span className="w-1/3">Datum</span>
                        </div>
                        <Separator />
                      </div>
                      <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        Nog geen acties geregistreerd.
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent
                  value="maintenance"
                  className="flex-1 flex flex-col min-h-0 mt-2"
                >
                  <Card className="h-full flex flex-col">
                    <CardHeader className='flex-row items-center justify-between'>
                      <CardTitle>Onderhoud</CardTitle>
                       <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Onderhoud toevoegen
                        </Button>
                    </CardHeader>
                     <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto pt-2">
                       <div className="text-sm text-muted-foreground">
                        <div className="flex justify-between px-4 py-2">
                           <span className="w-1/4">Omschrijving</span>
                           <span className="w-1/4">Type</span>
                           <span className="w-1/4">Datum</span>
                           <span className="w-1/4">Kosten</span>
                        </div>
                        <Separator />
                      </div>
                       <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        Nog geen onderhoud geregistreerd.
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent
                  value="damages"
                  className="flex-1 flex flex-col min-h-0 mt-2"
                >
                  <Card className="h-full flex flex-col">
                     <CardHeader>
                      <CardTitle>Schade</CardTitle>
                    </CardHeader>
                     <CardContent className="flex-1 flex items-center justify-center text-muted-foreground overflow-y-auto">
                       <p>Nog geen schade geregistreerd.</p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent
                  value="documents"
                  className="flex-1 flex flex-col min-h-0 mt-2"
                >
                  <Card className="h-full flex flex-col">
                     <CardHeader>
                      <CardTitle>Documenten</CardTitle>
                    </CardHeader>
                     <CardContent className="flex-1 flex items-center justify-center text-muted-foreground overflow-y-auto">
                       <p>Nog geen documenten gevonden.</p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
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
