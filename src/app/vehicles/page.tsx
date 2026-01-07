'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Plus,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const vehicles = [
  {
    id: '8-ZFL-67',
    make: 'VOLKSWAGEN',
    model: 'UP',
    status: 'Actief',
    vehicleNumber: '9007',
    year: '2014',
    fuel: 'CNG',
    apkDate: '-',
  },
  { id: '82-PRS-8', make: 'VOLKSWAGEN', model: 'CADDY' },
  { id: 'G-948-ZZ', make: 'VOLKSWAGEN', model: 'CADDY' },
  { id: 'G-950-ZZ', make: 'VOLKSWAGEN', model: 'CADDY' },
  { id: 'V-42-FRH', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'V-51-GKB', make: 'VOLKSWAGEN', model: 'CADDY' },
  { id: 'V-53-DZK', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'V-55-DZK', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'V-66-DZX', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'V-836-XT', make: 'IVECO', model: '35C14N' },
  { id: 'V-92-DZZ', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'VBT-53-H', make: 'IVECO', model: '35C14N' },
  { id: '8-ZFL-67a', make: 'VOLKSWAGEN', model: 'UP' },
  { id: '82-PRS-8a', make: 'VOLKSWAGEN', model: 'CADDY' },
  { id: 'G-948-ZZa', make: 'VOLKSWAGEN', model: 'CADDY' },
  { id: 'G-950-ZZa', make: 'VOLKSWAGEN', model: 'CADDY' },
  { id: 'V-42-FRHa', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'V-51-GKBa', make: 'VOLKSWAGEN', model: 'CADDY' },
  { id: 'V-53-DZKa', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'V-55-DZKa', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'V-66-DZXa', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'V-836-XTa', make: 'IVECO', model: '35C14N' },
  { id: 'V-92-DZza', make: 'MERCEDES', model: 'SPRINTER' },
  { id: 'VBT-53-Ha', make: 'IVECO', model: '35C14N' },
];

export default function VehiclesPage() {
  const [selectedVehicle, setSelectedVehicle] = React.useState(vehicles[0]);

  const vehicleImages = PlaceHolderImages.filter(p => p.id.startsWith('vehicle-'));

  const mainImage = vehicleImages.find(img => img.id === 'vehicle-side');
  const otherImages = [
    vehicleImages.find(img => img.id === 'vehicle-front'),
    vehicleImages.find(img => img.id === 'vehicle-back'),
    vehicleImages.find(img => img.id === 'vehicle-top'),
    vehicleImages.find(img => img.id === 'vehicle-bed'),
  ].filter(Boolean) as typeof PlaceHolderImages;


  return (
    <div className="flex flex-col flex-1 p-6 bg-background min-h-0">
      <PageHeader title="Voertuigen">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Zoek voertuig..." className="pl-9" />
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Voertuig toevoegen
        </Button>
        <Button variant="outline">
          Bulkacties <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </PageHeader>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr] flex-1 min-h-0">
        <Card className="lg:h-full flex flex-col">
          <CardContent className="p-2 flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col space-y-1 pr-2">
                {vehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    onClick={() =>
                      setSelectedVehicle(
                        vehicles.find((v) => v.id === vehicle.id) || vehicles[0]
                      )
                    }
                    className={`flex items-center justify-between p-3 rounded-md text-left cursor-pointer ${
                      selectedVehicle.id === vehicle.id
                        ? 'bg-blue-100 dark:bg-blue-900'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div>
                      <p
                        className={`font-semibold ${
                          selectedVehicle.id === vehicle.id
                            ? 'text-blue-600 dark:text-blue-300'
                            : ''
                        }`}
                      >
                        {vehicle.id}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {vehicle.make} {vehicle.model}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6 min-h-0">
          <Card>
             <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{selectedVehicle.id}</h2>
                  <p className="text-muted-foreground">
                    {selectedVehicle.make} {selectedVehicle.model}
                  </p>
                </div>
                <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50 dark:bg-green-900/10">
                  Actief
                </Badge>
              </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
               <div className="grid grid-cols-2 gap-4">
                  {mainImage && (
                    <div className="col-span-2 row-span-2 relative aspect-video rounded-md overflow-hidden border">
                      <Image
                        src={mainImage.imageUrl}
                        alt={mainImage.description}
                        fill
                        className="object-cover"
                        data-ai-hint={mainImage.imageHint}
                      />
                    </div>
                  )}
                  {otherImages.map(image => (
                     <div key={image.id} className="relative aspect-video rounded-md overflow-hidden border">
                        <Image
                           src={image.imageUrl}
                           alt={image.description}
                           fill
                           className="object-cover"
                           data-ai-hint={image.imageHint}
                        />
                     </div>
                  ))}
               </div>
              <div>
                <h3 className="text-lg font-semibold mb-4">Algemene gegevens</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Kenteken</span>
                        <span className="font-medium">{selectedVehicle.id}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Voertuignummer</span>
                        <span className="font-medium">
                        {selectedVehicle.vehicleNumber}
                        </span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Merk</span>
                        <span className="font-medium">{selectedVehicle.make}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Model</span>
                        <span className="font-medium">{selectedVehicle.model}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">-</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Bouwjaar</span>
                        <span className="font-medium">{selectedVehicle.year}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Brandstof</span>
                        <span className="font-medium">{selectedVehicle.fuel}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">APK vervaldatum</span>
                        <span className="font-medium">
                        {selectedVehicle.apkDate}
                        </span>
                    </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Tabs defaultValue="actions" className="flex flex-col flex-1 min-h-0">
            <TabsList className='flex-shrink-0'>
              <TabsTrigger value="actions">Acties</TabsTrigger>
              <TabsTrigger value="maintenance">Onderhoud</TabsTrigger>
              <TabsTrigger value="damage">Schade</TabsTrigger>
              <TabsTrigger value="documents">Documenten</TabsTrigger>
            </TabsList>
            <TabsContent value="actions" className="flex-1 min-h-0 mt-4">
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
                  <ScrollArea className="h-full">
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
                          <TableCell colSpan={3} className="text-center h-24">
                            Nog geen acties geregistreerd.
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
             <TabsContent value="maintenance"  className="flex-1 min-h-0 mt-4">
              <Card className="h-full">
                <CardHeader><CardTitle>Onderhoud</CardTitle></CardHeader>
                <CardContent><p className="text-center text-muted-foreground">Geen onderhoudsgegevens beschikbaar.</p></CardContent>
              </Card>
            </TabsContent>
             <TabsContent value="damage"  className="flex-1 min-h-0 mt-4">
              <Card className="h-full">
                <CardHeader><CardTitle>Schade</CardTitle></CardHeader>
                <CardContent><p className="text-center text-muted-foreground">Geen schadegevallen geregistreerd.</p></CardContent>
              </Card>
            </TabsContent>
             <TabsContent value="documents"  className="flex-1 min-h-0 mt-4">
              <Card className="h-full">
                <CardHeader><CardTitle>Documenten</CardTitle></CardHeader>
                <CardContent><p className="text-center text-muted-foreground">Geen documenten beschikbaar.</p></CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
