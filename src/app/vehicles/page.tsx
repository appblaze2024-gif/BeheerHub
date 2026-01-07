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
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { VehicleImportDialog } from '@/components/vehicle-import-dialog';
import { Separator } from '@/components/ui/separator';

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
    // Set initial selected vehicle if not already set
    if (!selectedVehicle && vehicles && vehicles.length > 0) {
      setSelectedVehicle(vehicles[0]);
    } else if (selectedVehicle && vehicles) {
      // If the selected vehicle is no longer in the list (e.g., deleted), update selection
      if (!vehicles.find((v) => v.id === selectedVehicle.id)) {
        setSelectedVehicle(vehicles.length > 0 ? vehicles[0] : null);
      }
    }
  }, [vehicles, selectedVehicle]);

  const handleImportSuccess = () => {
    setIsImporting(false);
    // Optionally refetch data or rely on real-time updates from useCollection
  };

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0">
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

      <div className="flex-1 flex gap-6 mt-6 min-h-0">
        <Card className="w-[300px] flex flex-col h-full min-h-0">
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

        <div className="flex-1 flex flex-col gap-6 min-h-0">
          {selectedVehicle ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between">
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
                    <CardHeader>
                      <CardTitle>Acties</CardTitle>
                      <CardDescription>
                        Overzicht van alle acties voor dit voertuig.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto">
                      <div className="flex justify-end">
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Actie toevoegen
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Naam</TableHead>
                            <TableHead>Type actie</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead className="text-right">Acties</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={4} className="text-center h-24">
                              Nog geen acties geregistreerd.
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent
                  value="maintenance"
                  className="flex-1 flex flex-col min-h-0 mt-2"
                >
                  <Card className="h-full flex flex-col">
                    <CardHeader>
                      <CardTitle>Onderhoud</CardTitle>
                      <CardDescription>
                        Overzicht van al het onderhoud voor dit voertuig.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto">
                       <div className="flex justify-end">
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Onderhoud toevoegen
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Omschrijving</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead>Kosten</TableHead>
                             <TableHead className="text-right">Acties</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={5} className="text-center h-24">
                              Nog geen onderhoud geregistreerd.
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
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
                      <CardDescription>
                        Overzicht van alle schadegevallen voor dit voertuig.
                      </CardDescription>
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
                      <CardDescription>
                        Alle documenten gerelateerd aan dit voertuig.
                      </CardDescription>
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
