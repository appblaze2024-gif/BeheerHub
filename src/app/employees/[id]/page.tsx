'use client';

import * as React from 'react';
import {
  ArrowLeft,
  Pencil,
  Paperclip,
  Plus,
  Search,
  FileText,
  Check,
  X,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  useDoc,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
} from '@/firebase';
import type { Medewerker } from '@/lib/types';
import { MedewerkerDialog } from '@/components/medewerker-dialog';

function DetailField({
  label,
  value,
  fieldName,
  medewerkerId,
}: {
  label: string;
  value: string | undefined | null;
  fieldName: keyof Medewerker;
  medewerkerId: string;
}) {
  const firestore = useFirestore();
  const [isEditing, setIsEditing] = React.useState(false);
  const [currentValue, setCurrentValue] = React.useState(value || '');

  React.useEffect(() => {
    setCurrentValue(value || '');
  }, [value]);

  const handleSave = async () => {
    if (!firestore || !medewerkerId) return;
    const medewerkerRef = doc(firestore, 'medewerkers', medewerkerId);

    try {
      await updateDocumentNonBlocking(medewerkerRef, {
        [fieldName]: currentValue,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Fout bij bijwerken:', error);
    }
  };

  const handleCancel = () => {
    setCurrentValue(value || '');
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between border-b py-2">
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isEditing ? (
          <Input
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="h-8 text-sm"
            autoFocus
          />
        ) : (
          <p className="text-sm font-medium min-h-[2rem] flex items-center">{currentValue || '-'}</p>
        )}
      </div>
      <div className="flex items-center gap-1 ml-2">
        {isEditing ? (
          <>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave}>
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const firestore = useFirestore();
  const id = params.id as string;

  const employeeRef = useMemoFirebase(() => {
    if (!firestore || !id) return null;
    return doc(firestore, 'medewerkers', id);
  }, [firestore, id]);

  const { data: medewerker, isLoading } = useDoc<Medewerker>(employeeRef);

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        Medewerker wordt geladen...
      </div>
    );
  }

  if (!medewerker) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p>Medewerker niet gevonden.</p>
        <Button onClick={() => router.back()} className="mt-4">
          Terug
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="p-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-12 w-12">
            <AvatarImage
              src={medewerker.avatarUrl}
              alt={`${medewerker.voornaam} ${medewerker.achternaam}`}
            />
            <AvatarFallback className="text-xl">
              {getInitials(medewerker.voornaam, medewerker.achternaam)}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-bold">{`${medewerker.voornaam || ''} ${
            medewerker.tussenvoegsel || ''
          } ${medewerker.achternaam || ''}`.trim()}</h1>
        </div>
      </div>

      <Tabs defaultValue="overzicht" className="flex-1 px-6 pb-6 flex flex-col">
        <TabsList>
          <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
          <TabsTrigger value="afwezigheid">Afwezigheid</TabsTrigger>
          <TabsTrigger value="rooster">Rooster</TabsTrigger>
          <TabsTrigger value="contracten">Contracten</TabsTrigger>
        </TabsList>
        <TabsContent value="overzicht" className="mt-6 flex-1 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Persoonsgegevens</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-12 md:grid-cols-3">
              <div>
                <DetailField label="Voornaam" value={medewerker.voornaam} fieldName="voornaam" medewerkerId={id} />
                <DetailField label="Tussenvoegsel" value={medewerker.tussenvoegsel} fieldName="tussenvoegsel" medewerkerId={id} />
                <DetailField label="Achternaam" value={medewerker.achternaam} fieldName="achternaam" medewerkerId={id} />
                <DetailField label="Geboortedatum" value={medewerker.geboortedatum} fieldName="geboortedatum" medewerkerId={id} />
                <DetailField label="Geboorteplaats" value={medewerker.geboorteplaats} fieldName="geboorteplaats" medewerkerId={id} />
              </div>
              <div>
                <DetailField label="Telefoonnr." value={medewerker.telefoonnummer} fieldName="telefoonnummer" medewerkerId={id} />
                <DetailField label="Mobiel nr." value={medewerker.mobiel} fieldName="mobiel" medewerkerId={id} />
                <DetailField label="Nood nr." value={medewerker.noodnummer} fieldName="noodnummer" medewerkerId={id} />
                <DetailField label="Adres" value={medewerker.adres} fieldName="adres" medewerkerId={id} />
                <DetailField label="Postcode" value={medewerker.postcode} fieldName="postcode" medewerkerId={id} />
                <DetailField label="Plaats" value={medewerker.plaats} fieldName="plaats" medewerkerId={id} />
              </div>
              <div>
                <DetailField label="Nationaliteit" value={medewerker.nationaliteit} fieldName="nationaliteit" medewerkerId={id} />
                <DetailField label="BSN" value={medewerker.bsn} fieldName="bsn" medewerkerId={id} />
                <DetailField label="ID/Paspoort nr." value={medewerker.paspoortnummer} fieldName="paspoortnummer" medewerkerId={id} />
                <DetailField label="Bankrekening" value={medewerker.bankrekening} fieldName="bankrekening" medewerkerId={id} />
                <DetailField label="Datum in dienst" value={medewerker.indiensttreding} fieldName="indiensttreding" medewerkerId={id} />
                <DetailField label="Personeels nr." value={medewerker.personeelsnummer} fieldName="personeelsnummer" medewerkerId={id} />
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Persoonlijke bestanden</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-48">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Persoonlijk bestand z..." className="pl-8 h-9" />
                  </div>
                  <Button size="sm"><Plus className="h-4 w-4 mr-2" />Bestand toevoegen</Button>
                </div>
              </CardHeader>
              <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Paperclip className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-sm">Geen bestanden gevonden</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Persoonlijke notities</CardTitle>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />Notitie toevoegen</Button>
              </CardHeader>
              <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-sm">Geen notities gevonden</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
