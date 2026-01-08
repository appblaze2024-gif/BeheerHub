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
import { AlertCircle } from 'lucide-react';

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
];

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
      const lines = text.split('\n').filter((line) => line.trim() !== '');
      if (lines.length === 0) return;

      const fileHeaders = lines[0].split(',').map((h) => h.trim());
      const fileData = lines.slice(1).map((line) => line.split(',').map((v) => v.trim()));

      setHeaders(fileHeaders);
      setData(fileData);

      // Auto-map based on header name similarity
      const newMapping: Record<string, string> = {};
      objectFields.forEach(field => {
        const foundHeader = fileHeaders.find(header => header.toLowerCase() === field.toLowerCase());
        if (foundHeader) {
          newMapping[field] = foundHeader;
        }
      });
      setMapping(newMapping);
      setStep(2);
    };
    reader.readAsText(selectedFile);
  };

  const handleImport = async () => {
    if (!firestore || data.length === 0) return;
    
    const idCsvHeader = mapping['id'];
    if (!idCsvHeader) {
        console.error("Het veld 'id' moet worden gekoppeld aan een CSV-kolom.");
        return;
    }
    
    setIsImporting(true);
    setImportProgress(0);

    const objectsColRef = collection(firestore, 'objects');
    const batchSize = 500; // Firestore batch limit
    const totalBatches = Math.ceil(data.length / batchSize);

    try {
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const chunk = data.slice(i, i + batchSize);

        chunk.forEach(row => {
            const objectData: Record<string, any> = {};
            let objectId = '';

            headers.forEach((header, index) => {
                const objectField = Object.keys(mapping).find(key => mapping[key] === header);
                if (objectField) {
                    const value = row[index];
                     if (objectField === 'latitude' || objectField === 'longitude') {
                        objectData[objectField] = parseFloat(value) || 0;
                    } else if (objectField === 'isActief') {
                        objectData[objectField] = value.toLowerCase() === 'true' || value === '1';
                    }
                    else {
                        objectData[objectField] = value;
                    }
                }
                if (header === idCsvHeader) {
                    objectId = row[index];
                }
            });
            
            if (objectId) {
                const docRef = doc(objectsColRef, objectId);
                batch.set(docRef, objectData, { merge: true });
            }
        });
        
        await batch.commit();
        setImportProgress(((i + chunk.length) / data.length) * 100);
      }
      
      onSuccess();
      setStep(3); // Go to success step
    } catch (error) {
      console.error("Error importing objects: ", error);
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
                    value={mapping[field]}
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

        {(isImporting || step === 3) && (
            <div className='flex flex-col gap-4 py-8'>
                <p>{isImporting ? 'Objecten importeren...' : 'Importeren voltooid!'}</p>
                <Progress value={importProgress} />
                <p className='text-sm text-muted-foreground text-center'>{Math.round(importProgress)}% voltooid</p>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
