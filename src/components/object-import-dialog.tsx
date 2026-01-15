'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore } from '@/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface ObjectImportDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const objectFields = [
    'id', 'latitude', 'longitude', 'locatieType', 'locatieSubType', 
    'kwaliteit', 'isActief', 'straatnaam', 'huisnummer', 
    'waarschuwing', 'vulgraad'
];

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';


// Robust CSV parser
const parseCSV = (csv: string): { headers: string[], data: string[][] } => {
    const lines = csv.split(/[\r\n]+/).filter(line => line.trim() !== '');
    if (lines.length === 0) {
        return { headers: [], data: [] };
    }

    const delimiter = lines[0].includes(';') ? ';' : ',';
    
    const parseLine = (line: string) => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };

    const headers = parseLine(lines[0]).map(h => h.replace(/"/g, ''));
    const data = lines.slice(1).map(parseLine);
    
    return { headers, data };
};


export function ObjectImportDialog({
  children,
  open,
  onOpenChange,
  onSuccess,
}: ObjectImportDialogProps) {
  const firestore = useFirestore();
  const [step, setStep] = React.useState(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [data, setData] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setFile(null);
        setHeaders([]);
        setData([]);
        setMapping({});
        setIsImporting(false);
        setImportProgress(0);
        setError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 300);
    }
  }, [open]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: fileHeaders, data: fileData } = parseCSV(text);
      
      if(fileHeaders.length === 0) {
          setError("Kon geen headers vinden in het CSV-bestand.");
          return;
      }

      setHeaders(fileHeaders);
      setData(fileData);

      // Auto-map based on header name similarity
      const newMapping: Record<string, string> = {};
      objectFields.forEach(field => {
        const lowerField = field.toLowerCase().replace(/ /g, '');
        const foundHeader = fileHeaders.find(header => {
            const lowerHeader = header.toLowerCase().replace(/ /g, '');
            if(lowerHeader === lowerField) return true;
            if(lowerField === 'latitude' && (lowerHeader === 'lat' || lowerHeader === 'latitude')) return true;
            if(lowerField === 'longitude' && (lowerHeader === 'lon' || lowerHeader === 'long' || lowerHeader === 'longitude')) return true;
            return false;
        });
        if (foundHeader) {
          newMapping[field] = foundHeader;
        }
      });
      setMapping(newMapping);
      setStep(2);
    };
    reader.onerror = () => {
        setError("Fout bij het lezen van het bestand.");
    }
    reader.readAsText(selectedFile, 'UTF-8');
  };

  const fetchAddress = async (longitude: number, latitude: number): Promise<{ street: string; houseNumber: string }> => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        return {
          street: feature.text || '',
          houseNumber: feature.address || '',
        };
      }
    } catch (error) {
      console.error('Error fetching address:', error);
    }
    return { street: '', houseNumber: '' };
  };

  const handleImport = async () => {
    if (!firestore || data.length === 0) {
        setError("Geen data om te importeren.");
        return;
    }
    
    if (!mapping['id']) {
        setError("Het veld 'id' moet worden gekoppeld om objecten te kunnen importeren.");
        return;
    }
    
    setIsImporting(true);
    setImportProgress(0);
    setError(null);

    const headerIndexMap: Record<string, number> = {};
    headers.forEach((h, i) => { headerIndexMap[h] = i; });

    const fieldIndexMap: Record<string, number> = {};
    for(const field in mapping) {
        if(mapping[field] && mapping[field] !== '--ignore--') {
            fieldIndexMap[field] = headerIndexMap[mapping[field]];
        }
    }

    const objectsColRef = collection(firestore, 'objects');
    const batchSize = 100; // Smaller batch size due to API calls

    try {
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const chunk = data.slice(i, i + batchSize);

        for (const row of chunk) {
            const objectData: Record<string, any> = {};
            let objectId = row[fieldIndexMap['id']];

            if (!objectId || objectId.trim() === '') {
                objectId = "N.B";
            } else {
                objectId = objectId.trim();
            }

            for(const field in fieldIndexMap) {
                const index = fieldIndexMap[field];
                if (index === undefined || index >= row.length) continue;

                const value = row[index] ? row[index].trim() : undefined;

                if (value !== undefined) {
                    if(['latitude', 'longitude', 'vulgraad'].includes(field)) {
                        objectData[field] = parseFloat(value.replace(',', '.'));
                    } else if (field === 'isActief') {
                        objectData[field] = ['true', '1', 'ja', 'yes'].includes(value.toLowerCase());
                    } else {
                        objectData[field] = value;
                    }
                }
            }

            if (!objectData.straatnaam && objectData.latitude && objectData.longitude) {
              const { street, houseNumber } = await fetchAddress(objectData.longitude, objectData.latitude);
              objectData.straatnaam = street;
              objectData.huisnummer = houseNumber;
            }

            if(objectId) {
                const docRef = doc(objectsColRef, objectId === "N.B" ? doc(collection(firestore, 'temp')).id : objectId);
                batch.set(docRef, { ...objectData, id: objectId }, { merge: true });
            }
        }
        
        await batch.commit();
        setImportProgress(((i + chunk.length) / data.length) * 100);
      }
      
      setStep(3);
      onSuccess();

    } catch (error: any) {
      console.error("Error importing objects: ", error);
      setError(`Fout tijdens importeren: ${error.message}`);
    } finally {
        setIsImporting(false);
    }
  };

  const renderContent = () => {
      if (isImporting) {
        return (
             <div className='flex flex-col items-center justify-center gap-4 py-8'>
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p>Objecten importeren...</p>
                 <p className="text-sm text-muted-foreground">Dit kan even duren, omdat adresgegevens worden opgehaald.</p>
                <Progress value={importProgress} className="w-full" />
                <p className='text-sm text-muted-foreground'>{Math.round(importProgress)}% voltooid</p>
            </div>
        )
      }
      switch(step) {
          case 1:
              return (
                <div className="py-8">
                    <Label htmlFor="csv-file" className="sr-only">CSV Bestand</Label>
                    <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    className="w-full h-12 text-base"
                    />
                     {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                </div>
              );
          case 2:
              return (
                 <div>
                    <p className="text-sm text-muted-foreground mb-4">
                        We hebben {data.length} rijen gevonden. Koppel de kolommen aan de juiste velden.
                    </p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-6 max-h-64 overflow-y-auto pr-2">
                    {objectFields.map((field) => (
                        <div key={field} className="grid grid-cols-2 items-center gap-4">
                        <Label htmlFor={`mapping-${field}`} className="capitalize text-right">
                            {field.replace('_', ' ')}
                        </Label>
                        <Select
                            value={mapping[field]}
                            onValueChange={(value) =>
                            setMapping((prev) => ({ ...prev, [field]: value }))
                            }
                        >
                            <SelectTrigger id={`mapping-${field}`}>
                            <SelectValue placeholder="Selecteer een kolom" />
                            </SelectTrigger>
                            <SelectContent>
                            <SelectItem value="--ignore--">-- Negeer --</SelectItem>
                            {headers.map((header) => (
                                <SelectItem key={header} value={header}>
                                {header}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        </div>
                    ))}
                    </div>
                    <Alert variant={mapping['id'] ? "default" : "destructive"}>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>{mapping['id'] ? "Klaar om te importeren" : "Opgelet!"}</AlertTitle>
                        <AlertDescription>
                          {mapping['id'] ? "Het veld 'id' is gekoppeld. U kunt nu importeren." : "Zorg ervoor dat de kolom voor 'id' is gekoppeld, dit wordt gebruikt als de unieke ID voor elk object."}
                        </AlertDescription>
                    </Alert>
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                </div>
              );
          case 3:
              return (
                 <div className='flex flex-col items-center gap-4 py-8'>
                    <CheckCircle className="h-16 w-16 text-green-500" />
                    <p className='font-medium text-lg'>Importeren voltooid!</p>
                    <p className='text-sm text-muted-foreground text-center'>{data.length} objecten succesvol verwerkt.</p>
                </div>
              )
      }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Objecten Importeren (CSV)</DialogTitle>
          <DialogDescription>
            {step === 1 && 'Selecteer een CSV-bestand om te importeren.'}
            {step === 2 && 'Koppel uw CSV-kolommen aan de databasevelden.'}
            {step === 3 && 'De import is succesvol afgerond.'}
          </DialogDescription>
        </DialogHeader>

        {renderContent()}

        <DialogFooter>
          {step === 1 && <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>}
          {step === 2 && !isImporting && (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>
                Terug
              </Button>
              <Button onClick={handleImport} disabled={!mapping['id']}>
                Importeer {data.length} Objecten
              </Button>
            </>
          )}
          {step === 3 && !isImporting && (
             <Button onClick={() => onOpenChange(false)}>
                Sluiten
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
