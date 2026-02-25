
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
  schouwenGemeente?: string;
  schouwenMapStyle?: string;
  lastSelectedProjectId?: string | null;
  nfcTagId?: string;
};

export interface Message {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  content: string;
  createdAt: string;
  read: boolean;
}

export interface Sensor {
  id: string;
  name: string;
  type: 'TOF200C' | 'Temperatuur' | 'Luchtkwaliteit' | 'GPS Tracker' | 'Waterpeil';
  status: 'Online' | 'Offline' | 'Batterij laag' | 'Onderhoud';
  latitude: number;
  longitude: number;
  lastSeen?: string;
  batteryLevel?: number;
  vulgraad?: number;
  currentDistanceCm?: number;
  binDepthCm?: number;
  measurementFrequency?: number;
  devEui?: string;
  appEui?: string;
  appKey?: string;
  iotCode?: string;
  iotExplanation?: string;
  iotHistory?: { role: 'user' | 'model'; content: string }[];
}

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
  planningOrder?: number;
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
  opbouw_keuring?: string; // YYYY-MM-DD
  bandenwissel?: string; // YYYY-MM-DD
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
  opbouw_keuring?: string; // YYYY-MM-DD
  bandenwissel?: string; // YYYY-MM-DD
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

export interface Boekingregel {
  id: string;
  naam: string;
}

export type Wijk = {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
};

export interface Veegroute {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
  roadTypes?: string[];
}

export interface Prullenbakkenroute {
  id: string;
  naam: string;
  locatie: string;
  subGebieden: string;
  startLatitude?: number;
  startLongitude?: number;
  startAdres?: string;
  parentId?: string | null;
}

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
  materieelIds?: string[];
  werksoorten: Werksoort[];
  boekingregels?: Boekingregel[];
  wijken?: Wijk[];
  veegroutes?: Veegroute[];
  prullenbakkenroutes?: Prullenbakkenroute[];
  vehicleAvailability?: {
    unavailable: Record<string, string[]>;
    available: Record<string, string[]>;
  };
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

export interface Object {
  id: string;
  idNummer?: string;
  latitude: number;
  longitude: number;
  locatieType?: string;
  locatieSubType?: string;
  kwaliteit?: string;
  isActief?: boolean;
  straatnaam?: string;
  huisnummer?: string;
  waarschuwing?: string;
  vulgraad?: number;
  locatieWerkgebieden?: string[];
}

export type MeldingTask = {
  id: string;
  description: string;
  completed: boolean;
};

export interface Hoeveelheid {
  id: string;
  type: string;
  aantal: number;
  eenheid: string;
}

export type Melding = {
  id: string;
  intakenummer: string;
  containernummer?: string;
  extern_meldingsnummer?: string;
  latitude: number;
  longitude: number;
  subcategorie: string;
  hoofdcategorie: string;
  extra_informatie: string;
  status:
    | 'Nieuw'
    | 'Intern doorgezet'
    | 'In behandeling'
    | 'Gepland op korte termijn'
    | 'Gepland op langere termijn'
    | 'Dubbel gemeld'
    | 'Afgerond'
    | 'Niet in beheer'
    | 'Extern doorgezet';
  datum: string; // Creation date yyyy-MM-dd
  tijdstip: string;
  melder: string;
  aangenomen_door?: string;
  afgehandeld_door?: string;
  afhandeling_datum?: string; // Completion date yyyy-MM-dd
  afhandeling_tijdstip?: string;
  straatnaam?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
  wijk?: string;
  werkgebied?: string;
  files?: UploadedFile[];
  fotos?: UploadedFile[];
  afhandeling_fotos?: UploadedFile[];
  tasks?: MeldingTask[];
  hoeveelheden?: Hoeveelheid[];
  gewerkteMinuten?: number;
  workStartedAt?: string;
  afhandeling_bijzonderheden?: string;
};

export interface Route {
  id: string;
  userId: string;
  projectId: string;
  originalRouteId: string;
  routeName: string;
  date: string;
  startTime: string;
  endTime?: string;
  allObjectIds?: string[];
  completedObjects?: string[];
  skippedObjects?: string[];
  totalObjects?: number;
}

export interface Contractor {
  id: string;
  projectId: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface AgendaItem {
  id: string;
  title: string;
  content: string;
}

export interface MeetingMinute {
  id: string;
  contractorId: string;
  projectId: string;
  title: string;
  documentTitle?: string;
  documentSubtitle?: string;
  logoLeftUrl?: string;
  logoRightUrl?: string;
  date: string;
  location?: string;
  attendees?: string;
  agendaItems: AgendaItem[];
  actionPoints?: string;
  createdAt: string;
  createdBy: string;
}

export interface MinuteTemplate {
  id: string;
  projectId: string;
  documentTitle?: string;
  documentSubtitle?: string;
  logoLeftUrl?: string;
  logoRightUrl?: string;
  location?: string;
  agendaItems: { id: string; title: string; content: string }[];
  updatedAt: string;
}
