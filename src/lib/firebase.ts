import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, waitForPendingWrites } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Configurazione unica, stabile e centralizzata sul nuovo database
export const IS_LG_ENV = false;
export const currentEnv = 'TEST (Database Dedicato)';
export const DEFAULT_AZIENDA_ID = 'test_azienda';

export function switchEnvironment(env: 'lg' | 'test') {
  console.log("[Firebase] Ambiente centralizzato su database unico. Switch disabilitato.");
}

console.log(`[Firebase] Avvio app in ambiente unico: ${currentEnv}`);
console.log(`[Firebase] Project ID: ${firebaseConfig.projectId}`);
console.log(`[Firebase] Target Database: ${firebaseConfig.firestoreDatabaseId || "ai-studio-75a4b4a3-0e93-45fe-b5f7-97997ca8bc58"}`);

export const IS_TEST_PROJECT = true;

// Inizializzazione Firebase App
const app = initializeApp(firebaseConfig);

// INIZIALIZZAZIONE FIRESTORE: Utilizza il database corretto specificato in configurazione con fallback su "ai-studio-75a4b4a3-0e93-45fe-b5f7-97997ca8bc58"
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "ai-studio-75a4b4a3-0e93-45fe-b5f7-97997ca8bc58");

export const auth = getAuth(app);

/**
 * Safe helper to wait for pending writes with a timeout fallback
 * Previene il crash del metodo .toJSON() attendendo che le scritture locali siano sincronizzate
 */
export async function safeWaitForPendingWrites(): Promise<void> {
  try {
    await Promise.race([
      waitForPendingWrites(db),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);
    console.log('[Firebase] safeWaitForPendingWrites checks completed.');
  } catch (err) {
    console.warn('[Firebase] safeWaitForPendingWrites timed out or failed:', err);
  }
}

// Gestione Errori e Strumenti di Connessione (Mantenuti per la stabilità dell'applicazione)
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
        console.warn(`[Firestore] Tentativo ${i + 1} fallito per connettività. Riprovo...`, message);
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
  
  if (message.includes('the client is offline') || message.includes('failed-precondition')) {
    console.error("Verifica la configurazione di Firebase. Il client sembra offline o connessione rifiutata.");
  }

  throw new Error(jsonError);
}