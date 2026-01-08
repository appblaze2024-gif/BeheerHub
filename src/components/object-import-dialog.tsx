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
import { AlertCircle, CheckCircle } from 'lucide-react';

interface ObjectImportDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const objectFields = [
  'id',
  'latitude',
  'longitude',
  'locatieType',
  'locatieSubType',
  'kwaliteit',
  'isActief',
  'straatnaam',
  'huisnummer',
  'waarschuwing',
  'vulgraad',
];

// Simple but more robust CSV parser
const parseCSV = (text: string): string[][] => {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    // Normalize line endings to LF
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < normalizedText.length; i++) {
        const char = normalizedText[i];

        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < normalizedText.length && normalizedText[i + 1] === '"') {
                    // Escaped quote
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (char === '\n') {
                currentRow.push(currentField.trim());
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    // Add the last field and row if they exist
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
    }
    
    return rows.filter(row => row.length > 0 && row.some(field => field.length > 0));
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Reset state when dialog is closed
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setFile(null);
        setHeaders([]);
        setData([]);
        setMapping({});
        setIsImporting(false);
        setImportProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 300); // Delay to allow for animation
    }
  }, [open]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const parsedData = parseCSV(text);
      
      if (parsedData.length < 2) {
        console.error("CSV must have at least a header row and one data row.");
        // Optionally show an error to the user
        return;
      };

      const fileHeaders = parsedData[0];
      const fileData = parsedData.slice(1);

      setHeaders(fileHeaders);
      setData(fileData);

      // Auto-map based on header name similarity (case-insensitive, ignores spaces)
      const newMapping: Record<string, string> = {};
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '');
      
      const specialMappings: Record<string, string[]> = {
        latitude: ['lat', 'latitude'],
        longitude: ['lon', 'long', 'longitude']
      };

      objectFields.forEach(field => {
        const normalizedField = normalize(field);
        const aliases = specialMappings[field] ? specialMappings[field].map(normalize) : [normalizedField];

        for (const alias of aliases) {
            const foundHeader = fileHeaders.find(header => normalize(header) === alias);
            if (foundHeader) {
                newMapping[field] = foundHeader;
                break; // Stop after first match
            }
        }
      });

      setMapping(newMapping);
      setStep(2);
    };
    reader.readAsText(selectedFile, 'ISO-8859-1'); // Or 'UTF-8', depending on file encoding
  };

  const handleImport = async () => {
    if (!firestore || data.length === 0 || !mapping['id']) {
      console.error("Firestore not available, no data, or ID column not mapped.");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    const headerIndexMap: { [key: string]: number } = {};
    headers.forEach((header, index) => {
      headerIndexMap[header] = index;
    });

    const fieldIndexMap: { [key: string]: number | undefined } = {};
    for (const field of objectFields) {
        const csvHeader = mapping[field];
        if (csvHeader) {
            fieldIndexMap[field] = headerIndexMap[csvHeader];
        }
    }

    if (fieldIndexMap['id'] === undefined) {
        console.error("ID column mapping is essential for import.");
        setIsImporting(false);
        return;
    }
    
    const idColumnIndex = fieldIndexMap['id'];

    const objectsColRef = collection(firestore, 'objects');
    const batchSize = 500;

    try {
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const chunk = data.slice(i, i + batchSize);

        chunk.forEach(row => {
          if (idColumnIndex === undefined) return;
          const objectId = row[idColumnIndex];
          if (!objectId) return;

          const objectData: { [key: string]: any } = {};

          for(const field in fieldIndexMap) {
            const index = fieldIndexMap[field];
            if (index === undefined) continue;

            const value = row[index];
            if (value !== undefined && value !== '') {
                if (field === 'latitude' || field === 'longitude' || field === 'vulgraad') {
                    const numValue = parseFloat(value.replace(',', '.'));
                    objectData[field] = isNaN(numValue) ? 0 : numValue;
                } else if (field === 'isActief') {
                    objectData[field] = ['true', '1', 'ja', 'yes'].includes(value.toLowerCase());
                } else {
                    objectData[field] = value;
                }
            }
          }

          if (Object.keys(objectData).length > 0) {
              const docRef = doc(objectsColRef, objectId);
              batch.set(docRef, objectData, { merge: true });
          }
        });

        await batch.commit();
        setImportProgress(((i + chunk.length) / data.length) * 100);
      }

      setStep(3);
      onSuccess();
    } catch (error) {
      console.error("Error importing objects: ", error);
      setStep(2); // Go back to mapping step on error
    } finally {
      setIsImporting(false);
    }
  };
  
  const handleClose = () => {
      onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Objecten Importeren</DialogTitle>
          <DialogDescription>
            {step === 1 && 'Selecteer een CSV-bestand om te importeren.'}
            {step === 2 && 'Koppel uw CSV-kolommen aan de databasevelden.'}
            {step === 3 && 'De objecten zijn succesvol geïmporteerd.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="py-8">
            <Label htmlFor="csv-file" className="sr-only">
              CSV Bestand
            </Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="w-full h-12 text-base"
            />
          </div>
        )}

        {step === 2 && !isImporting && (
          <div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-6 max-h-[50vh] overflow-y-auto pr-4">
              {objectFields.map((field) => (
                <div key={field} className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor={`mapping-${field}`} className="capitalize text-right">
                    {field.replace(/([A-Z])/g, ' $1').trim()}
                  </Label>
                  <Select
                    value={mapping[field] || ''}
                    onValueChange={(value) =>
                      setMapping((prev) => ({ ...prev, [field]: value }))
                    }
                  >
                    <SelectTrigger id={`mapping-${field}`}>
                      <SelectValue placeholder="Selecteer een kolom" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="--ignore--">Negeer</SelectItem>
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
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Belangrijk</AlertTitle>
                <AlertDescription>
                    Zorg ervoor dat de kolom voor 'id' is gekoppeld, dit wordt gebruikt als de unieke ID voor elk object.
                </AlertDescription>
            </Alert>
          </div>
        )}

        {isImporting && (
            <div className='flex flex-col gap-4 py-8'>
                <p>Objecten importeren...</p>
                <Progress value={importProgress} />
                <p className='text-sm text-muted-foreground text-center'>{Math.round(importProgress)}% voltooid</p>
            </div>
        )}
        
        {step === 3 && !isImporting && (
             <div className='flex flex-col items-center gap-4 py-8'>
                <CheckCircle className="h-16 w-16 text-green-500" />
                <p className='font-medium text-lg'>Importeren voltooid!</p>
                <p className='text-sm text-muted-foreground'>{data.length} objecten zijn succesvol verwerkt.</p>
            </div>
        )}

        <DialogFooter>
          {step === 1 && <Button variant="ghost" onClick={handleClose}>Annuleren</Button>}
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
          {step === 3 && (
               <Button onClick={handleClose}>
                Sluiten
            </Button>
          )}
          {isImporting && (
             <Button onClick={handleClose} disabled>
                Sluiten
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
