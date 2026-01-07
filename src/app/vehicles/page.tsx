'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  Download,
} from 'lucide-react';
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
import { useAuth, useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { doc } from 'firebase/firestore';

export default function VehiclesPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const vehiclesCollection = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, 'users', user.uid, 'vehicles');
  }, [firestore, user?.uid]);
  
  const { data: vehicles, isLoading } = useCollection<any>(vehiclesCollection);

  const [selectedVehicle, setSelectedVehicle] = React.useState<any | null>(null);
  const mainImage = PlaceHolderImages.find((p) => p.id === 'vehicle-side');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!selectedVehicle && vehicles && vehicles.length > 0) {
      setSelectedVehicle(vehicles[0]);
    } else if (selectedVehicle && vehicles) {
      // If the selected vehicle is no longer in the list, clear it
      if (!vehicles.find(v => v.id === selectedVehicle.id)) {
        setSelectedVehicle(vehicles.length > 0 ? vehicles[0] : null);
      }
    }
  }, [vehicles, selectedVehicle]);


  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !firestore) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length === 0) return;

      const header = lines[0].split(',').map(h => h.trim());
      const dataLines = lines.slice(1);

      dataLines.forEach((line) => {
        const values = line.split(',').map(v => v.trim());
        const vehicleData: { [key: string]: any } = {};
        
        let kenteken = '';

        header.forEach((key, index) => {
          const lowerKey = key.toLowerCase();
          vehicleData[lowerKey] = values[index];
          if(lowerKey === 'kenteken') {
            kenteken = values[index];
          }
        });

        if (kenteken) {
          const docRef = doc(firestore, 'users', user.uid, 'vehicles', kenteken);
          setDocumentNonBlocking(docRef, vehicleData, { merge: true });
        }
      });
    };
    reader.readAsText(file);
    // Reset file input
    event.target.value = '';
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".csv"
        />
        <Button variant="outline" onClick={handleImportClick}>
          <Upload className="mr-2 h-4 w-4" />
          Import
        </Button>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 mt-6 flex-1 min-h-0">
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
                  <TabsTrigger value="damage">Schade</TabsTrigger>
                  <TabsTrigger value="documents">Documenten</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="actions"
                  className="mt-4 flex-1 flex flex-col min-h-0"
                >
                  <Card className="h-full flex flex-col">
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>Acties</CardTitle>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" /> Actie toevoegen
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Naam</TableHead>
                              <TableHead>Type actie</TableHead>
                              <TableHead>Datum</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell
                                colSpan={3}
                                className="text-center h-24"
                              >
                                Nog geen acties geregistreerd.
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="maintenance" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Onderhoud</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-center text-muted-foreground">
                        Geen onderhoudsgegevens beschikbaar.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="damage" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Schade</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-center text-muted-foreground">
                        Geen schadegevallen geregistreerd.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="documents" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Documenten</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-center text-muted-foreground">
                        Geen documenten beschikbaar.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Selecteer een voertuig om de details te bekijken of importeer voertuigen.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
