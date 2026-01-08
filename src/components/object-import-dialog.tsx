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
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { processCsv } from '@/ai/flows/process-csv-flow';

interface ObjectImportDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ObjectImportDialog({
  children,
  open,
  onOpenChange,
  onSuccess,
}: ObjectImportDialogProps) {
  const [step, setStep] = React.useState(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setFile(null);
        setIsImporting(false);
        setImportResult(null);
        setError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 300);
    }
  }, [open]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      setStep(1);
      return;
    }
    setFile(selectedFile);
    setStep(2);
  };

  const handleImport = async () => {
    if (!file) {
      setError('Selecteer alstublieft een bestand.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;
      if (!csvContent) {
        setError('Kon het bestand niet lezen.');
        setIsImporting(false);
        return;
      }
      
      try {
        const result = await processCsv(csvContent);
        setImportResult(result);
        setStep(3);
        onSuccess();
      } catch (err: any) {
        console.error("Fout bij importeren:", err);
        setError(err.message || 'Er is een onbekende fout opgetreden tijdens de import.');
        setStep(2); // Stay on step 2 to allow retry
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
        setError('Fout bij het lezen van het bestand.');
        setIsImporting(false);
    };
    reader.readAsText(file, 'ISO-8859-1');
  };
  
  const handleClose = () => {
      onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Objecten Importeren met AI</DialogTitle>
          <DialogDescription>
            {step === 1 && 'Selecteer een CSV-bestand om te importeren. De AI analyseert de inhoud.'}
            {step === 2 && 'Het geselecteerde bestand wordt geanalyseerd en verwerkt. Dit kan even duren.'}
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

        {step === 2 && (
          <div className='py-8'>
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Bestand geselecteerd: {file?.name}</AlertTitle>
                <AlertDescription>
                    Klik op 'Importeer' om de AI de data te laten verwerken en uploaden. De AI zal automatisch proberen de kolommen te koppelen aan de juiste velden zoals 'latitude' en 'longitude'.
                </AlertDescription>
            </Alert>
            {error && (
                <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Importfout</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
          </div>
        )}

        {isImporting && (
            <div className='flex flex-col items-center justify-center gap-4 py-8'>
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p>AI is de CSV aan het verwerken...</p>
                <p className='text-sm text-muted-foreground'>Dit kan enkele ogenblikken duren, afhankelijk van de grootte van het bestand.</p>
            </div>
        )}
        
        {step === 3 && !isImporting && (
             <div className='flex flex-col items-center gap-4 py-8'>
                <CheckCircle className="h-16 w-16 text-green-500" />
                <p className='font-medium text-lg'>Importeren voltooid!</p>
                <p className='text-sm text-muted-foreground text-center'>{importResult}</p>
            </div>
        )}

        <DialogFooter>
          {step === 1 && <Button variant="ghost" onClick={handleClose}>Annuleren</Button>}
          {step === 2 && !isImporting && (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>
                Terug
              </Button>
              <Button onClick={handleImport}>
                Importeer
              </Button>
            </>
          )}
          {(step === 3 || isImporting) && (
               <Button onClick={handleClose} disabled={isImporting}>
                Sluiten
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
