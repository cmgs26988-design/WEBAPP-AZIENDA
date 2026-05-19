export interface Worker {
  id: string; // The unique code
  name: string;
  azienda_id: string;
  photoUrl?: string;
  deviceId?: string;
  createdAt?: string;
  updatedAt?: string;
  
  // PDF & UI Public fields
  codiceDipendente?: string;
  mansione?: string;
  posizioneInail?: string;
  livelloMansione?: string;
  codiceFiscale?: string;
  dataNascita?: string;
  dataAssunzione?: string;
  dataCessazione?: string;
  dataFineTempoDeterminato?: string;
  dataProssimoScatto?: string;
  nScatti?: string;
  retrOM?: string;

  // Admin only fields
  email?: string;
  iban?: string;
  cellulare?: string;
  tagliaVestiario?: string; // Legacy field
  vestiario?: {
    scarpe?: string;
    pantaloni?: string;
    giacca?: string;
    maglia?: string;
    guanti?: string;
    altro?: string;
  };
  residenza?: string;
  qualificheTecniche?: string; // Legacy field
  qualificheNuove?: Array<{
    nome: string;
    conseguita: boolean;
    dataConseguimento?: string;
    dataScadenza?: string;
    enteFormatore?: string;
  }>;
  patentiGuida?: string[];
  numeroCartaIdentita?: string;
  consegnaDpi?: string; // To be removed from UI but kept in type for safety
  idoneitaSanitaria?: string;
  formazioneSicurezza?: string; // Legacy
  sicurezzaNuova?: {
    generale?: string;
    specifica?: string;
  };
}

export interface ClockEvent {
  id?: string;
  workerId: string;
  workerName: string;
  azienda_id: string;
  type: 'ENTRATA' | 'USCITA';
  timestamp: any;
  date: string;
}

export interface TimeEntry {
  id?: string;
  date: string; // YYYY-MM-DD
  workerCode: string;
  workerName: string;
  azienda_id: string;
  cantiere: string;
  intervento: string;
  ordinaria: number;
  straordinaria: number;
  viaggio: number;
  ferie: number;
  notes: {
    ordinaria: string;
    straordinaria: string;
    viaggio: string;
    ferie: string;
  };
  createdAt: any; // Firestore Timestamp
}

export interface MaterialRequestItem {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  quantity: number;
  unit: string;
}

export interface MaterialRequest {
  id?: string;
  date: string;
  workerId: string;
  workerName: string;
  azienda_id: string;
  cantiere: string;
  intervento: string;
  items: MaterialRequestItem[];
  status: 'draft' | 'INVIATA' | 'PRESA IN CARICO' | 'IN VERIFICA' | 'APPROVATA' | 'RIFIUTATA' | 'IN ORDINE' | 'CONSEGNATA';
  pdfGenerated?: boolean;
  createdAt: any;
  updatedAt: any;
}

export type UserRole = 'admin' | 'worker' | null;
