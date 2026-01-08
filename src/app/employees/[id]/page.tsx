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
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle,
  Clock,
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

function AfwezigheidTab() {
  const weekDays = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  const dayNumbers = [5, 6, 7, 8, 9, 10, 11];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-8">Vandaag</Button>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-sm font-semibold flex items-center gap-2">
                <span>5 Jan. - 11 Jan. 2026</span>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">Week 2</span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-xs font-semibold text-muted-foreground">{day}</div>
              ))}
              {dayNumbers.map((day) => (
                <div key={day} className={`p-2 border rounded-md h-16 ${day === 8 ? 'bg-primary/10 border-primary' : ''}`}>
                  <span className="text-sm">{day}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-4 mt-4 text-xs">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>Goedgekeurd</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-yellow-500" />
                <span>Onbeslist</span>
              </div>
              <Button variant="link" size="sm" className="text-xs">
                <CalendarDays className="h-3 w-3 mr-1" />
                Toevoegen aan kalender
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Afwezigheid</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="aanvragen">
              <div className="flex justify-between items-start">
                <TabsList>
                  <TabsTrigger value="aanvragen">Aanvragen</TabsTrigger>
                  <TabsTrigger value="nagekeken">Nagekeken</TabsTrigger>
                  <TabsTrigger value="verleden">Verleden</TabsTrigger>
                </TabsList>
                <Button><Plus className="h-4 w-4 mr-2" />Afwezigheid toevoegen</Button>
              </div>
              <TabsContent value="aanvragen" className="mt-6">
                <div className="text-center text-muted-foreground py-12">
                  <CalendarDays className="h-12 w-12 mx-auto mb-2" />
                  <p>Geen verzoeken</p>
                  <Button variant="link" size="sm">Nagekeken afwezigheden bekijken</Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saldo's</CardTitle>
            <p className="text-xs text-muted-foreground">1 januari - 31 december</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg p-3">
              <p className="text-sm font-medium">Verlof</p>
              <p className="text-xl font-bold text-primary">0u 0m</p>
              <p className="text-xs text-muted-foreground">Resterend</p>
            </div>
             <div className="border rounded-lg p-3">
              <p className="text-sm font-medium">ADV</p>
              <p className="text-xl font-bold text-primary">0u 0m</p>
              <p className="text-xs text-muted-foreground">Resterend</p>
            </div>
             <div className="border rounded-lg p-3">
              <p className="text-sm font-medium">TVT</p>
              <p className="text-xl font-bold text-primary">0u 0m</p>
              <p className="text-xs text-muted-foreground">Resterend</p>
            </div>
          </CardContent>
        </Card>
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
        <TabsContent value="afwezigheid" className="mt-6 flex-1">
          <AfwezigheidTab />
        </TabsContent>
        <TabsContent value="rooster" className="mt-6 flex-1">
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Rooster is nog niet geïmplementeerd.
          </div>
        </TabsContent>
        <TabsContent value="contracten" className="mt-6 flex-1">
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Contracten zijn nog niet geïmplementeerd.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
