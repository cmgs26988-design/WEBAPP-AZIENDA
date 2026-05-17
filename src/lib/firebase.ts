import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore,
} from 'firebase/firestore';
import firebaseConfigTest from '../../firebase-applet-config.json';
import firebaseConfigLG from '../../firebase-applet-config-lg.json';

// Gestione Ambienti (Test vs LG Inox)
const getSelectedConfig = () => {
  try {
    // 1. Controllo URL (es. ?env=lg o ?env=test)
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const envParam = params.get('env');
      
      if (envParam === 'lg') {
        localStorage.setItem('optimerdm_env', 'lg');
        return firebaseConfigLG;
      }
      if (envParam === 'test') {
        localStorage.setItem('optimerdm_env', 'test');
        return firebaseConfigTest;
      }
    }

    // 2. Controllo localStorage per persistenza
    const savedEnv = localStorage.getItem('optimerdm_env');
    if (savedEnv === 'lg') return firebaseConfigLG;
  } catch (e) {
    console.error("Error in environment detection:", e);
  }
  
  // 3. Default: Progetto di Test
  return firebaseConfigTest;
};

const firebaseConfig = getSelectedConfig();
let isLgEnv = false;
try {
  isLgEnv = localStorage.getItem('optimerdm_env') === 'lg';
} catch (e) {
  console.error("Error checking environment in localStorage:", e);
}
export const IS_LG_ENV = isLgEnv;
export const currentEnv = IS_LG_ENV ? 'LG INOX' : 'TEST (Sviluppo)';
export const DEFAULT_AZIENDA_ID = IS_LG_ENV ? 'lg_inox' : 'test_azienda';

console.log(`[Firebase] Avvio app in ambiente: ${currentEnv}`);
console.log(`[Firebase] Project ID: ${firebaseConfig.projectId}`);

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const configDatabaseId = (firebaseConfig as any).firestoreDatabaseId;
export const db = configDatabaseId && configDatabaseId !== '(default)' 
  ? getFirestore(app, configDatabaseId) 
  : getFirestore(app);

export const auth = getAuth(app);

// Error handler as per requirements
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const message = err.message || '';
      if (message.includes('the client is offline') || message.includes('failed-precondition') || message.includes('unavailable')) {
        console.warn(`[Firestore] Attempt ${i + 1} failed due to connectivity. Retrying...`, message);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
    },
    operationType,
    path
  };
  
  const jsonError = JSON.stringify(errInfo);
  console.error('Firestore Error: ', jsonError);
  
  // Specific feedback for the user check in requirements
  if (message.includes('the client is offline') || message.includes('failed-precondition')) {
    console.error("Please check your Firebase configuration. The client appears to be offline or the connection was refused.");
  }

  throw new Error(jsonError);
}
