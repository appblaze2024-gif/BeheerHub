export type UserPermissions = {
  [module: string]: {
    view?: boolean;
    create?: boolean;
    edit?: boolean;
    delete?: boolean;
    use?: boolean;
    tabs?: {
      [tabId: string]: boolean;
    };
  };
};

export type UserProfile = {
  id: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  sidebarCollapsed?: boolean;
  role?: 'Super admin' | 'toezichthouder' | 'ondersteuner' | 'medewerkers';
  permissions?: UserPermissions;
  status?: 'Actief' | 'Inactief' | 'Niet uitgenodigd' | 'Uitgenodigd';
  wijk?: string;
  veegroute?: string;
  prullenbakkenroute?: string;
  lastUsedDienstColor?: string;
  schouwenMapStyle?: string;
  schouwenGemeente?: string;
};

export interface Medewerker {
  id: string;
  voornaam?: string;
  tussenvoegsel?: string;
  achternaam?: string;
  email?: string;
  telefoonnummer?: string;
  mobiel?: string;
  noodnummer?: string;
  geboortedatum?: string; // date
  geboorteplaats?: string;
  nationaliteit?: string;
  bsn?: string;
  adres?: string;
  postcode?: string;
  plaats?: string;
  paspoortnummer?: string;
  bankrekening?: string;
  personeelsnummer?: string;
  indiensttreding?: any; // should be date or timestamp
  uitdiensttreding?: any; // should be date or timestamp
  taal?: string;
  functie?: string;
  status?: 'Actief' | 'Inactief' | 'Niet uitgenodigd';
  avatarUrl?: string;
  soortMedewerker?: string;
  urenPerDag?: {
    maandag?: { start?: string; eind?: string };
    dinsdag?: { start?: string; eind?: string };
    woensdag?: { start?: string; eind?: string };
    donderdag?: { start?: string; eind?: string };
    vrijdag?: { start?: string; eind?: string };
    zaterdag?: { start?: string; eind?: string };
    zondag?: { start?: string; eind?: string };
  };
}

export interface Dienst {
  id: string;
  medewerkerId: string;
  projectId: string;
  werksoort: string;
  boekingregelId?: string;
  starttijd: string;
  eindtijd: string;
  datum: string; // YYYY-MM-DD
  onbetaaldePauze?: number;
  voertuignummer?: string | null;
  notities?: string;
  celkleur?: string;
  goedkeuringStatus?: 'In behandeling' | 'Goedgekeurd' | 'Afgekeurd';
}

export interface Voertuig {
  id: string; // kenteken
  voertuignummer?: string;
  merk?: string;
  model?: string;
  type?: string;
  status?: 'Actief' | 'Inactief' | 'In onderhoud';
  bouwjaar?: string;
  brandstof?: 'Benzine' | 'Diesel' | 'Elektrisch' | 'Hybride (benzine)' | 'Hybride (diesel)' | 'LPG' | 'CNG (Aardgas)' | 'Waterstof';
  apk_vervaldatum?: string; // YYYY-MM-DD
  imageUrl?: string;
}

export interface Machine {
  id: string;
  machinenummer?: string;
  merk?: string;
  model?: string;
  type?: string;
  status?: 'Actief' | 'Inactief' | 'In onderhoud';
  bouwjaar?: string;
  brandstof?: 'Benzine' | 'Diesel' | 'Elektrisch' | 'Hybride (benzine)' | 'Hybride (diesel)' | 'LPG' | 'CNG (Aardgas)' | 'Waterstof';
  imageUrl?: string;
}

export type UploadedFile = {
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
  storagePath: string;
};

export interface Besteksmelding {
  id: string;
  projectId: string;
  werksoort: string;
  latitude: number;
  longitude: number;
  omschrijving: string;
  fotos?: UploadedFile[];
  datum: string;
  status: 'Nieuw' | 'In behandeling' | 'Afgerond';
}

export type Werksoort = {
  id: string;
  postnummer: string;
  werksoort: string;
  eenheid: string;
  fictieveH: string;
  uurprijs: string;
};

export type Project = {
  id?: string;
  projectnummer: string;
  projectnaam: string;
  locatie: string;
  opdrachtgever: string;
  startdatum: string;
  einddatum: string;
  bestek: string;
  besteknummer: string;
  versie: string;
  datum: string;
  omschrijving: string;
  werksoorten: Werksoort[];
  boekingregels?: any[]; // Replace with specific type if known
  wijken?: any[]; // Replace with specific type if known
  veegroutes?: any[]; // Replace with specific type if known
  prullenbakkenroutes?: any[]; // Replace with specific type if known
};

export type Bestand = {
    id: string;
    name: string;
    type: string;
    size: number;
    url: string;
    uploadedAt: string;
    storagePath: string;
    folderId?: string | null;
};

export interface Folder {
  id: string;
  name: string;
  createdAt: any;
  folderId?: string | null;
}
