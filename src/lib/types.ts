export type Medewerker = {
  id: string;
  voornaam: string;
  tussenvoegsel?: string;
  achternaam: string;
  email?: string;
  telefoonnummer?: string;
  mobiel?: string;
  taal?: string;
  functie?: string;
  status: 'Actief' | 'Inactief' | 'Niet uitgenodigd';
  avatarUrl?: string;
  soortMedewerker?: string;
  kostprijs?: number;
  verkoopprijs?: number;
  indiensttreding?: any; // Can be string, Date, or Firestore Timestamp
  uitdiensttreding?: any; // Can be string, Date, or Firestore Timestamp
  contractType?: string;
  urenPerDag?: {
    maandag?: number;
    dinsdag?: number;
    woensdag?: number;
    donderdag?: number;
    vrijdag?: number;
    zaterdag?: number;
    zondag?: number;
  };
  notities?: string;
  // New fields for detail page
  noodnummer?: string;
  geboortedatum?: string;
  geboorteplaats?: string;
  nationaliteit?: string;
  bsn?: string;
  adres?: string;
  postcode?: string;
  plaats?: string;
  paspoortnummer?: string;
  bankrekening?: string;
  personeelsnummer?: string;
};

export type Dienst = {
    id: string;
    medewerkerId: string;
    projectId: string;
    werksoort: string; 
    starttijd: string;
    eindtijd: string;
    datum: string; 
    voertuignummer?: string | null;
    // Deprecated fields
    boekingregelId?: string;
    onbetaaldePauze?: number;
    verbergEindtijd?: boolean;
    herhaalDienst?: boolean;
    goedkeuringVereist?: boolean;
    informeerMedewerkers?: boolean;
    voertuigId?: string | null;
}

export type Voertuig = {
  id: string; // kenteken
  merk?: string;
  model?: string;
  voertuignummer?: string;
  [key: string]: any;
}
