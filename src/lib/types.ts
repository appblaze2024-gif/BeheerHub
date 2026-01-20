export type UserPermissions = {
  [module: string]: {
    view?: boolean;
    create?: boolean;
    edit?: boolean;
    delete?: boolean;
    use?: boolean;
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
