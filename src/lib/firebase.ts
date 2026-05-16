import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore,
  getDocFromServer,
  doc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom settings for better connectivity in proxies/iframes
const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  ignoreUndefinedProperties: true,
}, databaseId);

export const auth = getAuth(app);

// Simple log to verify initialization
console.log(`Firebase initialized with project: ${firebaseConfig.projectId}, database: ${databaseId}`);

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
