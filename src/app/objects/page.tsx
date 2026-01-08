'use client';

import * as React from 'react';
import {
  Filter,
  Save,
  Map,
  QrCode,
  Plus,
  Search,
  ChevronDown,
  MapPin,
  MoreVertical,
  ChevronRight,
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MapboxView } from '@/components/mapbox-view';
import { ObjectImportDialog } from '@/components/object-import-dialog';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';

export default function ObjectsPage() {
  const firestore = useFirestore();
  const [isImporting, setIsImporting] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedObject, setSelectedObject] = React.useState<any | null>(null);

  const objectsCollection = React.useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);

  const { data: objects, isLoading } = useCollection<any>(objectsCollection);

  const filteredObjects = React.useMemo(() => {
    if (!objects) return [];
    if (!searchTerm) return objects;
    return objects.filter(
      (obj) =>
        obj.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obj.straatnaam?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [objects, searchTerm]);

  React.useEffect(() => {
    if (!selectedObject && filteredObjects && filteredObjects.length > 0) {
      setSelectedObject(filteredObjects[0]);
    } else if (selectedObject && filteredObjects) {
        if (!filteredObjects.find((v) => v.id === selectedObject.id)) {
            setSelectedObject(filteredObjects.length > 0 ? filteredObjects[0] : null);
        }
    }
  }, [filteredObjects, selectedObject]);

  const handleImportSuccess = () => {
    setIsImporting(false);
    // Data will refresh automatically due to useCollection hook
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-muted/30">
      {/* Header */}
      <header className="flex items-center justify-between p-3 bg-card border-b shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
          <Button variant="outline">
            <Save className="mr-2 h-4 w-4" /> Opslaan
          </Button>
          <Button variant="default">
            <Map className="mr-2 h-4 w-4" /> Kaartweergave
          </Button>
          <Button variant="outline">
            <QrCode className="mr-2 h-4 w-4" /> QR Scan
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Object toevoegen
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Zoek een object" className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
           <ObjectImportDialog
            open={isImporting}
            onOpenChange={setIsImporting}
            onSuccess={handleImportSuccess}
          >
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          </ObjectImportDialog>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-64 bg-card border-r flex flex-col">
          <div className="p-3">
            <Input placeholder="Filter objecten..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <Separator />
          <div className="flex-1 overflow-y-auto">
             <div className="flex flex-col space-y-1 p-2">
              {isLoading ? (
                 <div className="text-center text-muted-foreground p-4">
                  Laden...
                </div>
              ) : filteredObjects && filteredObjects.length > 0 ? (
                filteredObjects.map((obj) => (
                  <div
                    key={obj.id}
                    onClick={() => setSelectedObject(obj)}
                    className={`flex items-start justify-between p-3 rounded-md text-left cursor-pointer ${
                      selectedObject?.id === obj.id
                        ? 'bg-secondary'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground mt-1" />
                      <div>
                        <p className="font-semibold">{obj.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {obj.locatieSubType || 'Onbekend type'}
                        </p>
                      </div>
                    </div>
                     <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                 <div className="text-center text-muted-foreground p-4">
                  Geen objecten gevonden.
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {selectedObject ? (
              <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">
                        Locatie type
                      </label>
                      <Select value={selectedObject.locatieType} disabled>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={selectedObject.locatieType}>
                            {selectedObject.locatieType}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        Locatie sub type
                      </label>
                       <Select value={selectedObject.locatieSubType} disabled>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={selectedObject.locatieSubType}>
                            {selectedObject.locatieSubType}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Kwaliteit</label>
                      <Select value={selectedObject.kwaliteit} disabled>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="a">A</SelectItem>
                          <SelectItem value="b">B</SelectItem>
                          <SelectItem value="c">C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between pt-6">
                      <span className="text-sm text-muted-foreground">Automatisch aangemaakt</span>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={selectedObject.isActief}
                        />
                        <span className="text-sm font-medium">Is actief</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="md:col-span-2">
                    <label htmlFor="street-name" className="text-sm font-medium">
                      Straatnaam
                    </label>
                    <Input
                      id="street-name"
                      value={selectedObject.straatnaam || ''}
                      readOnly
                    />
                  </div>
                  <div>
                    <label htmlFor="house-number" className="text-sm font-medium">
                      Huisnummer
                    </label>
                    <Input id="house-number" value={selectedObject.huisnummer || ''} readOnly/>
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="object-id" className="text-sm font-medium">
                    Object-ID
                  </label>
                  <div className="flex gap-2">
                    <Input id="object-id" value={selectedObject.id || ''} readOnly />
                    <Button variant="outline" size="icon">
                      <QrCode className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
                 <Accordion type="single" collapsible className="w-full mt-4">
                    <AccordionItem value="logboek">
                        <AccordionTrigger className="px-0 py-3">Logboek</AccordionTrigger>
                        <AccordionContent>
                        Hier komt de inhoud van het logboek.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="planning">
                        <AccordionTrigger className="px-0 py-3">Planning</AccordionTrigger>
                        <AccordionContent>
                        Hier komt de planning.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="bewerk-locatie" className='border-b-0'>
                        <AccordionTrigger className="px-0 py-3">Bewerk locatie</AccordionTrigger>
                        <AccordionContent>
                        Hier komen de opties om de locatie te bewerken.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                <Separator className='my-2'/>
                 <div className="space-y-4 pt-2">
                    <div>
                        <label htmlFor="warning" className="text-sm font-medium">
                            Waarschuwing
                        </label>
                        <Textarea id="warning" placeholder="Voeg een waarschuwing toe..." value={selectedObject.waarschuwing || ''}/>
                    </div>
                    <Separator/>
                    <div className="flex justify-between items-center">
                        <h3 className="font-medium">Eigenschappen</h3>
                        <Button size="sm" variant="secondary">
                            <Plus className="mr-2 h-4 w-4" />
                        </Button>
                    </div>
                     <Separator/>
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-medium">Locatie werkgebieden</h3>
                            <Button size="sm" variant="secondary">
                                <Plus className="mr-2 h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <div className="bg-muted text-muted-foreground px-3 py-1 rounded-full text-sm">Afvalbakken</div>
                        </div>
                    </div>
                </div>
              </CardContent>
            </Card>
            ) : (
                <div className="lg:col-span-2 flex items-center justify-center h-full text-muted-foreground">
                    {isLoading ? 'Objecten laden...' : 'Selecteer een object om de details te zien.'}
                </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="h-64">
              <CardContent className="p-0 h-full">
                <MapboxView 
                   key={selectedObject?.id}
                   longitude={selectedObject?.longitude}
                   latitude={selectedObject?.latitude}
                />
              </CardContent>
            </Card>
            <Card className="h-64">
              <CardContent className="p-4 h-full flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="h-12 w-12 text-gray-400" />
                <p className="mt-2">Neem een foto</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-medium mb-2">Vulgraad</h3>
                <Progress value={selectedObject?.vulgraad || 0} />
                <p className="text-center text-sm font-semibold mt-2">{selectedObject?.vulgraad || 0}%</p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

    </div>
  );
}
