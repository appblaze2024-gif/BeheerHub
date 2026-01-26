'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Trash2, File as FileIcon, Upload } from 'lucide-react';
import {
  useFirestore,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  useUser,
  useFirebaseApp,
  deleteDocumentNonBlocking,
  setDocumentNonBlocking
} from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Schouwing } from '@/lib/types';
import type { UploadedFile } from '@/lib/types';
import { Progress } from './ui/progress';
import { MapboxView } from './mapbox-view';
import Image from 'next/image';
import * as pdfjsLib from 'pdfjs-dist';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import * as turf from '@turf/turf';

if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

const schouwFormSchema = z.object({
  inspecteur: z.string().min(1, 'Naam inspecteur is verplicht.'),
  categorie: z.string().min(1, 'Categorie is verplicht.'),
  opmerkingen: z.string().min(1, 'Opmerkingen zijn verplicht.'),
  status: z.enum(['Open', 'In behandeling', 'Afgerond']),
  gewenstNiveau: z.string().optional(),
  aangetroffenNiveau: z.string().optional(),
});

type SchouwFormValues = z.infer<typeof schouwFormSchema>;

const categorieOptions = ["Onkruidbeheersing", "Zwerfvuil", "Prullenbak", "Vegen", "Grofvuil", "Kadaver", "Storing"];

interface Suggestion {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
}

interface GeocodedAddress {
    house_number?: string;
    road?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
}

type PageData = {
  text: string;
  images: UploadedFile[];
  tempSchouwingId: string;
};

interface SchouwDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  schouwing?: Schouwing | null;
  onSuccess: () => void;
  pdfToImport?: string | null;
}

const parsePdfText = (text: string) => {
    const result: any = {};

    const extractValue = (regex: RegExp) => {
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    };
    
    const gpsMatch = text.match(/GPS locatie foto:\s*([0-9.]+),\s*([0-9.]+)/i);
    if (gpsMatch) {
        result.latitude = parseFloat(gpsMatch[1]);
        result.longitude = parseFloat(gpsMatch[2]);
    }

    result.adres = extractValue(/Nabij adres:\s*([^\r\n]+)/i);
    result.gewenstNiveau = extractValue(/Ambitieniveau:\s*([A-D]\+?)\b/i)?.toUpperCase();
    result.aangetroffenNiveau = extractValue(/Score:\s*([A-D]\+?)\b/i)?.toUpperCase();

    const opmerkingenMatch = text.match(/^(.+?)(?=Ronde:|Type:|Periode:|Meetlocatienummer:)/is);
    let opmerkingenText = '';
    if(opmerkingenMatch && opmerkingenMatch[1]) {
        opmerkingenText = opmerkingenMatch[1].replace(/\s+/g, ' ').trim();
    } else {
        const firstLine = text.split(/[\r\n]+/).find(line => line.trim() !== '');
        if (firstLine) {
            opmerkingenText = firstLine.trim();
        }
    }
    
    if (opmerkingenText) {
        const opmerkingenLower = opmerkingenText.toLowerCase();
        const foundCategory = ["Onkruidbeheersing elementverharding", ...categorieOptions].find(cat => opmerkingenLower.startsWith(cat.toLowerCase()));
        if(foundCategory) {
            result.categorie = "Onkruidbeheersing"; 
            const regex = new RegExp(`^${foundCategory}`, 'i');
            result.opmerkingen = opmerkingenText.replace(regex, '').trim();
        } else {
            result.opmerkingen = opmerkingenText;
        }
    }

    return result;
};


export function SchouwDialog({
  open,
  onOpenChange,
  projectId,
  schouwing,
  onSuccess,
  pdfToImport,
}: SchouwDialogProps) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = React.useState<{ straatnaam: string; huisnummer: string; postcode: string; plaats: string; } | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const justSelectedSuggestion = React.useRef(false);
  const isInitialEditLoadRef = React.useRef(false);


  const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
  const [uploadedFilesVoor, setUploadedFilesVoor] = React.useState<UploadedFile[]>([]);
  const [uploadedFilesNa, setUploadedFilesNa] = React.useState<UploadedFile[]>([]);
  const schouwingIdRef = React.useRef(schouwing?.id);
  const isFetchingAddressRef = React.useRef(false);
  
  const [pdfPagesData, setPdfPagesData] = React.useState<PageData[] | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = React.useState(0);
  const [isParsingPdf, setIsParsingPdf] = React.useState(false);


  const form = useForm<SchouwFormValues>({
    resolver: zodResolver(schouwFormSchema),
  });

  const fetchAddressDetails = React.useCallback(async (lat: number, lon: number): Promise<{ straatnaam: string; huisnummer: string; postcode: string; plaats: string; } | null> => {
    if (isFetchingAddressRef.current) return null;
    isFetchingAddressRef.current = true;
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=18`
        );
        const data = await response.json();
        if (data.address) {
            const addr = data.address as GeocodedAddress;
            const fetchedAddress = {
                straatnaam: addr.road || '',
                huisnummer: addr.house_number || '',
                postcode: addr.postcode || '',
                plaats: addr.city || addr.town || addr.village || '',
            };
            setAddress(fetchedAddress);
            return fetchedAddress;
        }
        setAddress(null);
        return null;
    } catch (error) {
        console.error('Error fetching address details:', error);
        setAddress(null);
        return null;
    } finally {
        isFetchingAddressRef.current = false;
    }
  }, []);
  
  const uploadFile = React.useCallback((file: File, schouwingId: string, projectId: string, type: 'voor' | 'na'): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
        if (!app || !projectId) {
            reject(new Error("Firebase app of project ID niet beschikbaar"));
            return;
        }
        const storage = getStorage(app);
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFileName = `${new Date().getTime()}-${sanitizedFileName}`;
        const storagePath = `projects/${projectId}/schouwingen/${schouwingId}/${type}/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({...prev, [uniqueFileName]: progress}));
            },
            (error) => {
                console.error('Upload mislukt:', error);
                setUploadProgress(prev => { const newProgress = {...prev}; delete newProgress[uniqueFileName]; return newProgress; });
                reject(error);
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    const newFile: UploadedFile = { name: file.name, url: downloadURL, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath: storagePath };
                    resolve(newFile);
                    setUploadProgress(prev => { const newProgress = {...prev}; delete newProgress[uniqueFileName]; return newProgress; });
                });
            }
        );
    });
  }, [app]);
  
  const resetAllState = React.useCallback(() => {
    form.reset();
    setIsSubmitting(false);
    setIsDeleting(false);
    setUploadedFilesVoor([]);
    setUploadedFilesNa([]);
    setUploadProgress({});
    setLocation(null);
    setAddress(null);
    setSearchQuery('');
    setSuggestions([]);
    setIsSearching(false);
    setPdfPagesData(null);
    setCurrentPageIndex(0);
    setIsParsingPdf(false);
  }, [form]);

  // Effect to process a new PDF file
  React.useEffect(() => {
    const processPdfFile = async () => {
      if (!open || !pdfToImport || !projectId || pdfPagesData) return;

      setIsParsingPdf(true);
      
      try {
        const pdfBase64 = pdfToImport.substring(pdfToImport.indexOf(',') + 1);
        const pdfBinary = atob(pdfBase64);
        const len = pdfBinary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = pdfBinary.charCodeAt(i);
        }

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const pagesToProcess = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => (item as any).str).join(' ');
          if (pageText.includes('GPS locatie foto:')) {
            pagesToProcess.push(page);
          }
        }
        
        const allPagesData = await Promise.all(
          pagesToProcess.map(async (page) => {
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => (item as any).str).join(' ');
            const images: UploadedFile[] = [];
            const tempSchouwingId = doc(collection(firestore, 'temp')).id;
            
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            const context = canvas.getContext('2d');

            if (context) {
              await page.render({ canvasContext: context, viewport }).promise;
              const dataUrl = canvas.toDataURL('image/jpeg');
              const blob = await (await fetch(dataUrl)).blob();
              const imageFile = new File([blob], `from-pdf-page-${page.pageNumber}.jpg`, { type: 'image/jpeg' });
              
              try {
                const uploadedImageFile = await uploadFile(imageFile, tempSchouwingId, projectId, 'voor');
                images.push(uploadedImageFile);
              } catch (uploadError) {
                console.error(`Error uploading image for page ${page.pageNumber}:`, uploadError);
              }
            }
            return { text: pageText, images, tempSchouwingId };
          })
        );
        
        if (allPagesData.length > 0) {
          setPdfPagesData(allPagesData);
          setCurrentPageIndex(0);
        } else {
          onOpenChange(false);
        }
      } catch (e) {
        console.error("Error processing PDF", e);
        onOpenChange(false);
      } finally {
        setIsParsingPdf(false);
      }
    };

    if (open && pdfToImport) {
        processPdfFile();
    }
  }, [open, pdfToImport, projectId, uploadFile, firestore, onOpenChange, pdfPagesData]);


  // Effect to populate form when current page changes
  React.useEffect(() => {
    const populateFormForPage = async () => {
      if (!pdfPagesData || currentPageIndex >= pdfPagesData.length) return;
      
      const currentPage = pdfPagesData[currentPageIndex];
      schouwingIdRef.current = currentPage.tempSchouwingId;

      const parsedData = parsePdfText(currentPage.text);

      form.reset({
        inspecteur: user?.displayName || user?.email || '',
        categorie: parsedData.categorie || '',
        opmerkingen: parsedData.opmerkingen || '',
        status: 'Open',
        gewenstNiveau: parsedData.gewenstNiveau || '',
        aangetroffenNiveau: parsedData.aangetroffenNiveau || '',
      });
      
      setUploadedFilesVoor(currentPage.images);
      setUploadedFilesNa([]);
      setAddress(null);
      setSearchQuery(parsedData.adres || '');

      if (parsedData.latitude && parsedData.longitude) {
        const lat = parsedData.latitude;
        const lon = parsedData.longitude;
        if (!isNaN(lat) && !isNaN(lon)) {
          setLocation({ latitude: lat, longitude: lon });
          const fetchedAddress = await fetchAddressDetails(lat, lon);
          if (fetchedAddress) {
            setSearchQuery(`${fetchedAddress.straatnaam || ''} ${fetchedAddress.huisnummer || ''}, ${fetchedAddress.postcode || ''} ${fetchedAddress.plaats || ''}`.trim());
          }
        }
      } else {
        setLocation(null);
      }
    };

    if(pdfPagesData) {
        populateFormForPage();
    }
  }, [pdfPagesData, currentPageIndex, form, user, fetchAddressDetails]);

  
  React.useEffect(() => {
    if (open && !pdfToImport) {
      if (schouwing) {
        isInitialEditLoadRef.current = true;
        setLocation({ latitude: schouwing.latitude, longitude: schouwing.longitude });
        fetchAddressDetails(schouwing.latitude, schouwing.longitude);
        setSearchQuery(`${schouwing.straatnaam || ''} ${schouwing.huisnummer || ''}, ${schouwing.postcode || ''} ${schouwing.plaats || ''}`.trim());
        
        setUploadedFilesVoor(schouwing.fotosVoor || []);
        setUploadedFilesNa(schouwing.fotosNa || []);

        form.reset({
            inspecteur: schouwing.inspecteur || user?.displayName || user?.email || '',
            categorie: schouwing.categorie || '',
            opmerkingen: schouwing.opmerkingen || '',
            status: schouwing.status || 'Open',
            gewenstNiveau: schouwing.gewenstNiveau || '',
            aangetroffenNiveau: schouwing.aangetroffenNiveau || '',
        });
      } else {
         form.reset({
            inspecteur: user?.displayName || user?.email || '',
            categorie: '',
            opmerkingen: '',
            status: 'Open',
            gewenstNiveau: '',
            aangetroffenNiveau: '',
        });
      }
    } else if (!open) {
      resetAllState();
    }
  }, [open, schouwing, pdfToImport, form, user, fetchAddressDetails, resetAllState]);
  
  React.useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (isInitialEditLoadRef.current) {
        isInitialEditLoadRef.current = false;
        return;
    }

    if (justSelectedSuggestion.current) {
      justSelectedSuggestion.current = false;
      return;
    }

    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            searchQuery
          )}&format=json&countrycodes=nl&limit=5`
        );
        const data: Suggestion[] = await response.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Fout bij zoeken:", error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSuggestionClick = (suggestion: Suggestion) => {
    justSelectedSuggestion.current = true;
    setSearchQuery(suggestion.display_name);
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);

    if (!isNaN(lat) && !isNaN(lon)) {
        setLocation({ latitude: lat, longitude: lon });
        fetchAddressDetails(lat, lon);
    }
    setSuggestions([]);
  };

  const handleFileChangeVoor = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !schouwingIdRef.current || !projectId) return;
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, schouwingIdRef.current, projectId, 'voor');
        setUploadedFilesVoor(prev => [...prev, uploadedFile]);
      } catch (error) { 
        console.error(`Kon ${file.name} niet uploaden.`, error); 
      }
    }
  };
  
  const handleFileChangeNa = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!schouwingIdRef.current || !projectId) return;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const uploadedFile = await uploadFile(file, schouwingIdRef.current, projectId, 'na');
        setUploadedFilesNa(prev => [...prev, uploadedFile]);
      } catch (error) { 
        console.error(`Kon ${file.name} niet uploaden.`, error); 
      }
    }
  };

  const handleFileDelete = async (fileToDelete: UploadedFile, setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>) => {
    if (!app) return;
    const storage = getStorage(app);
    try {
      await deleteObject(ref(storage, fileToDelete.storagePath));
      setFiles((prev) => prev.filter((f) => f.storagePath !== fileToDelete.storagePath));
    } catch (error: any) {
      console.error('Kon bestand niet verwijderen:', error);
      if (error.code === 'storage/object-not-found') {
        setFiles((prev) =>
          prev.filter((f) => f.storagePath !== fileToDelete.storagePath)
        );
      }
    }
  };

  const onSubmit = async (data: SchouwFormValues) => {
    if (!firestore || !projectId || !location) {
        return;
    }
    setIsSubmitting(true);
    const isEditing = !!schouwing?.id;
    const schouwingId = isEditing ? schouwing.id : schouwingIdRef.current;
    if (!schouwingId) {
        setIsSubmitting(false);
        return;
    }

    const finalAddress = await fetchAddressDetails(location.latitude, location.longitude);
    if (!finalAddress) {
        form.setError('opmerkingen', { type: 'manual', message: 'Kon geen geldig adres vinden voor de geselecteerde locatie.' });
        setIsSubmitting(false);
        return;
    }

    const schouwingData = {
      ...data,
      projectId,
      latitude: location.latitude,
      longitude: location.longitude,
      straatnaam: finalAddress.straatnaam,
      huisnummer: finalAddress.huisnummer,
      postcode: finalAddress.postcode,
      plaats: finalAddress.plaats,
      datum: schouwing?.datum || new Date().toISOString(),
      fotosVoor: uploadedFilesVoor,
      fotosNa: uploadedFilesNa,
      updatedAt: serverTimestamp(),
    };

    const schouwingRef = doc(firestore, 'projects', projectId, 'schouwingen', schouwingId);
    try {
      if (isEditing) {
        await updateDocumentNonBlocking(schouwingRef, schouwingData);
      } else {
        await setDocumentNonBlocking(schouwingRef, { ...schouwingData, createdAt: serverTimestamp() }, {});
      }
      
      onSuccess();

      if (pdfPagesData && currentPageIndex < pdfPagesData.length - 1) {
        setCurrentPageIndex(prev => prev + 1);
        setIsSubmitting(false);
      } else {
        onOpenChange(false);
      }

    } catch (error) {
      console.error('Fout bij opslaan schouwing:', error);
      setIsSubmitting(false);
    }
  };
  
   const handleDelete = async () => {
    if (!firestore || !projectId || !schouwing?.id) return;
    setIsDeleting(true);
    try {
      const allFiles = [...(schouwing.fotosVoor || []), ...(schouwing.fotosNa || [])];
      if (allFiles.length > 0) {
        const storage = getStorage(app);
        for (const file of allFiles) {
          if (file.storagePath) {
            await deleteObject(ref(storage, file.storagePath)).catch((error) => console.error(`Kon bestand ${file.storagePath} niet verwijderen:`, error));
          }
        }
      }
      await deleteDocumentNonBlocking(doc(firestore, 'projects', projectId, 'schouwingen', schouwing.id));
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Fout bij het verwijderen van de melding:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const isUploading = Object.keys(uploadProgress).length > 0;
  
  const renderFileUploadSection = (type: 'voor' | 'na') => {
    const files = type === 'voor' ? uploadedFilesVoor : uploadedFilesNa;
    const handleChange = type === 'voor' ? handleFileChangeVoor : handleFileChangeNa;
    const setFiles = type === 'voor' ? setUploadedFilesVoor : setUploadedFilesNa;

    return (
      <div className="space-y-2">
        <FormLabel>Foto's {type === 'voor' ? 'Voor' : 'Na'}</FormLabel>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {files.map(file => (
            <div key={file.storagePath} className="relative aspect-square group rounded-md overflow-hidden border">
                <a href={file.url} target="_blank" rel="noopener noreferrer">
                    <Image
                        src={file.url}
                        alt={file.name}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                    />
                </a>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleFileDelete(file, setFiles)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
          ))}
          
          <label htmlFor={`schouwing-file-input-${type}`} className="aspect-square flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="h-6 w-6" />
              <span className="text-xs mt-1">Upload '{type === 'voor' ? 'Voor' : 'Na'}'</span>
          </label>
        </div>
        
        <input
          type="file"
          id={`schouwing-file-input-${type}`}
          onChange={handleChange}
          className="hidden"
          multiple
          accept="image/*"
          disabled={isUploading || isSubmitting}
        />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-screen top-0 left-0 rounded-none translate-x-0 translate-y-0 flex flex-col p-0 gap-0">
        {(isParsingPdf) && (
            <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-50">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="mt-2">PDF verwerken... {pdfPagesData ? `(${currentPageIndex + 1}/${pdfPagesData.length})` : ''}</p>
            </div>
        )}
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{schouwing?.id ? 'Schouwing Bewerken' : 'Nieuwe Schouwing'} {pdfPagesData ? `(${currentPageIndex + 1}/${pdfPagesData.length})` : ''}</DialogTitle>
          <DialogDescription>
            Selecteer een locatie en vul de details in om een schouwing aan te maken.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6">
          <Form {...form}>
            <form id="schouw-form" onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <div className="space-y-4">
                  <FormField
                      control={form.control}
                      name="inspecteur"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel>Inspecteur</FormLabel>
                          <FormControl>
                              <Input {...field} />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="categorie" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Categorie</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecteer een categorie" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categorieOptions.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                              <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                  <SelectTrigger>
                                      <SelectValue placeholder="Selecteer een status" />
                                  </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                  <SelectItem value="Open">Open</SelectItem>
                                  <SelectItem value="In behandeling">In behandeling</SelectItem>
                                  <SelectItem value="Afgerond">Afgerond</SelectItem>
                                  </SelectContent>
                              </Select>
                              <FormMessage />
                              </FormItem>
                          )}
                      />
                  </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="gewenstNiveau" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Gewenst niveau</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Selecteer niveau" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {['A+', 'A', 'B', 'C', 'D'].map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )} />
                        <FormField control={form.control} name="aangetroffenNiveau" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Aangetroffen niveau</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Selecteer niveau" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {['A+', 'A', 'B', 'C', 'D'].map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )} />
                    </div>
                  <FormField
                      control={form.control}
                      name="opmerkingen"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel>Opmerkingen</FormLabel>
                          <FormControl>
                              <Textarea rows={4} {...field} />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                  />
                  <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {renderFileUploadSection('voor')}
                          {renderFileUploadSection('na')}
                    </div>
                      {isUploading && (
                          <div className="space-y-2">
                          {Object.entries(uploadProgress).map(([name, progress]) => (
                              <div key={name} className="space-y-1 mt-2">
                                  <p className="text-sm font-medium truncate">{name}</p>
                                  <Progress value={progress} className="w-full" />
                              </div>
                          ))}
                          </div>
                      )}
                  </div>
              </div>
              <div className="space-y-4">
                  <FormItem>
                      <FormLabel>Locatie*</FormLabel>
                      <div className="relative w-full">
                          <Input
                              placeholder="Zoek een adres..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              autoComplete="off"
                          />
                          {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                          {suggestions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                  {suggestions.map((suggestion) => (
                                  <div
                                      key={suggestion.place_id}
                                      onClick={() => handleSuggestionClick(suggestion)}
                                      className="px-4 py-2 text-sm cursor-pointer hover:bg-muted"
                                  >
                                      {suggestion.display_name}
                                  </div>
                                  ))}
                              </div>
                          )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Input placeholder="Straat" value={address?.straatnaam || ''} readOnly />
                        <Input placeholder="Nr" value={address?.huisnummer || ''} readOnly />
                      </div>
                       <div className="grid grid-cols-2 gap-2 mt-2">
                        <Input placeholder="Postcode" value={address?.postcode || ''} readOnly />
                        <Input placeholder="Plaats" value={address?.plaats || ''} readOnly />
                      </div>
                      <div className='h-64 w-full border rounded-md overflow-hidden mt-2 relative'>
                          <MapboxView
                              longitude={location?.longitude}
                              latitude={location?.latitude}
                              interactive={false}
                          />
                      </div>
                  </FormItem>
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="p-6 pt-4 border-t flex flex-col-reverse sm:flex-row sm:justify-between w-full">
          <div>
            {schouwing && (
                <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" disabled={isDeleting || isSubmitting}>
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Verwijderen
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                    <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt. Dit zal de schouwing en alle bijbehorende bestanden permanent verwijderen.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Doorgaan</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
                </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuleren</Button>
            <Button type="submit" form="schouw-form" disabled={isSubmitting || isUploading || !location}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opslaan...</> : 'Opslaan'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
