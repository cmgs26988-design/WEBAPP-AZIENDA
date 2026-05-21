import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType, fetchWithRetry, IS_LG_ENV, switchEnvironment, safeWaitForPendingWrites } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, User } from 'lucide-react';
import { Worker } from '../types';

interface WorkerLoginProps {
  onLogin: (worker: Worker) => void;
  onAdminLogin: (aziendaId: string) => void;
}

const getDeviceId = () => {
  let id = localStorage.getItem('optimerdm_device_id');
  if (!id) {
    id = crypto.randomUUID?.() || (Math.random().toString(36).substring(2) + Date.now().toString(36));
    localStorage.setItem('optimerdm_device_id', id);
  }
  return id;
};

export const WorkerLogin: React.FC<WorkerLoginProps> = ({ onLogin, onAdminLogin }) => {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [useGoogle, setUseGoogle] = useState(false);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const prefilled = localStorage.getItem('optimerdm_prefill_email');
        if (prefilled) {
          localStorage.removeItem('optimerdm_prefill_email');
          return prefilled;
        }
      }
    } catch (e) {}
    return '';
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    
    setLoading(true);
    setError('');

    const upperCode = code.trim().toUpperCase();
    const currentDeviceId = getDeviceId();
    
    try {
      const docRef = doc(db, 'workers', upperCode);
      const workerDoc = await fetchWithRetry(() => getDoc(docRef));
      
      if (!workerDoc) {
        throw new Error("Impossibile connettersi al database.");
      }

      console.log('Worker document fetch result exists:', workerDoc && typeof workerDoc.exists === 'function' && workerDoc.exists());

      if (workerDoc && typeof workerDoc.exists === 'function' && workerDoc.exists() && typeof workerDoc.data === 'function') {
        const data = workerDoc.data();
        if (!data) throw new Error("Documento trovato ma senza dati.");
        
        if (upperCode !== 'TEST01') {
          if (data.deviceId && data.deviceId !== currentDeviceId) {
            setError('Accesso negato: questo codice è già associato a un altro dispositivo.');
            setLoading(false);
            return;
          }

          if (!data.deviceId) {
            await updateDoc(doc(db, 'workers', upperCode), {
              deviceId: currentDeviceId
            });
            await safeWaitForPendingWrites();
          }
        }

        const worker: Worker = {
          id: upperCode,
          name: data?.name || 'Dipendente',
          azienda_id: data?.azienda_id || data?.companyId,
          photoUrl: data?.photoUrl,
          deviceId: data?.deviceId || currentDeviceId
        };
        
        if (!worker.azienda_id) {
          setError('Errore: Profilo dipendente non associato a nessuna azienda.');
          setLoading(false);
          return;
        }

        onLogin(worker);
        navigate('/worker');
      } else {
        setError('Codice utente non valido.');
      }
    } catch (err: any) {
      console.error('Login error detail:', err);
      let message = 'Si è verificato un errore durante l\'accesso.';
      
      if (err?.message?.includes('Missing or insufficient permissions') || err?.message?.includes('permission-denied')) {
        message = 'Accesso negato: permessi insufficienti sul database.';
      } else if (err?.message?.includes('offline') || err?.message?.includes('network-error')) {
        message = 'Errore di connessione: il database Firebase non è raggiungibile.';
      }
      
      setError(message);
      try {
        handleFirestoreError(err, OperationType.GET, `workers/${upperCode}`);
      } catch (logErr) { }
    } finally {
      setLoading(false);
    }
  };

  const checkAuthorization = async (email: string) => {
    try {
      const lowerEmail = email.trim().toLowerCase();
      
      // Controllo preliminare per gli admin noti
      if (lowerEmail === 'cmgs26988@gmail.com' || lowerEmail === 'admin@optime-rdm.com' || lowerEmail === 'lginox.piping@gmail.com') {
        return 'SUPERADMIN';
      }

      // 1. Ricerca diretta per ID (email minuscola)
      const docRef1 = doc(db, 'utenti_autorizzati', lowerEmail);
      const docSnap1 = await fetchWithRetry(() => getDoc(docRef1));
      if (docSnap1 && typeof docSnap1.exists === 'function' && docSnap1.exists()) {
        const data = typeof docSnap1.data === 'function' ? docSnap1.data() : null;
        return data?.azienda_id || 'SUPERADMIN';
      }

      // 2. Ricerca diretta per ID con email originale
      const docRef2 = doc(db, 'utenti_autorizzati', email.trim());
      const docSnap2 = await fetchWithRetry(() => getDoc(docRef2));
      if (docSnap2 && typeof docSnap2.exists === 'function' && docSnap2.exists()) {
        const data = typeof docSnap2.data === 'function' ? docSnap2.data() : null;
        return data?.azienda_id || 'SUPERADMIN';
      }

      // 3. Fallback: query sul campo email (minuscolo)
      console.log('Ricerca utente autorizzato per query email:', lowerEmail);
      const q = query(
        collection(db, 'utenti_autorizzati'), 
        where('email', '==', lowerEmail)
      );
      const querySnapshot = await fetchWithRetry(() => getDocs(q));
      
      if (querySnapshot && !querySnapshot.empty && querySnapshot.docs && querySnapshot.docs[0]) {
        const firstDoc = querySnapshot.docs[0];
        if (firstDoc && typeof firstDoc.exists === 'function' && firstDoc.exists()) {
          const data = typeof firstDoc.data === 'function' ? firstDoc.data() : null;
          return data?.azienda_id || 'SUPERADMIN';
        }
      }

      // 4. Fallback: query sul campo email normale
      const q2 = query(
        collection(db, 'utenti_autorizzati'), 
        where('email', '==', email.trim())
      );
      const querySnapshot2 = await fetchWithRetry(() => getDocs(q2));
      
      if (querySnapshot2 && !querySnapshot2.empty && querySnapshot2.docs && querySnapshot2.docs[0]) {
        const firstDoc = querySnapshot2.docs[0];
        if (firstDoc && typeof firstDoc.exists === 'function' && firstDoc.exists()) {
          const data = typeof firstDoc.data === 'function' ? firstDoc.data() : null;
          return data?.azienda_id || 'SUPERADMIN';
        }
      }
    } catch (err) {
      console.error("Authorization check error:", err);
    }
    
    // Ultimo tentativo fallback per email note
    const lowerEmail = email.trim().toLowerCase();
    if (lowerEmail === 'cmgs26988@gmail.com' || lowerEmail === 'admin@optime-rdm.com' || lowerEmail === 'lginox.piping@gmail.com') {
      return 'SUPERADMIN';
    }
    
    return null;
  };

  const handleAdminLoginEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;

    setLoading(true);
    setError('');

    try {
      // 1. Autenticazione email e password
      const { user } = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      
      if (user && user.email) {
        // 2. Controllo autorizzazione
        const azienda_id = await checkAuthorization(user.email);
        
        if (!azienda_id) {
          setError('Accesso negato: email non autorizzata.');
          await auth.signOut();
          setLoading(false);
          return;
        }

        // 3. Successo
        onAdminLogin(azienda_id);
        navigate('/admin');
      }
    } catch (err: any) {
      console.error('Admin email login error:', err);
      let message = 'Credenziali non valide o errore di sistema.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'Email o password errati.';
      } else if (err.code === 'auth/invalid-credential') {
        message = 'Email o password errati.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLoginGoogle = async () => {
    setLoading(true);
    setError('');

    try {
      const provider = new GoogleAuthProvider();
      const { user } = await signInWithPopup(auth, provider);
      
      if (user.email) {
        const azienda_id = await checkAuthorization(user.email);
        if (azienda_id) {
          onAdminLogin(azienda_id);
          navigate('/admin');
        } else {
          setError('Accesso negato: il tuo account Google non è autorizzato.');
          await auth.signOut();
        }
      }
    } catch (err: any) {
      console.error('Google login error (full object):', err);
      
      let message = 'Errore durante l\'accesso con Google.';
      
      if (err.code === 'auth/internal-error') {
        message = 'Errore interno di Firebase (auth/internal-error). Verifica di aver abilitato "Google" come metodo di accesso nel Console Firebase e di aver aggiunto gli URL dell\'app ai "Domini autorizzati".';
      } else if (err.code === 'auth/popup-blocked') {
        message = 'Il popup di accesso è stato bloccato dal browser. Abilita i popup per questo sito.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        message = 'Accesso annullato o popup chiuso troppo presto.';
      } else if (err.code === 'auth/unauthorized-domain') {
        message = 'Questo dominio non è autorizzato nel Console Firebase. Aggiungi gli URL ais-dev e ais-pre ai Domini Autorizzati in Authentication > Settings.';
      }
      
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-50 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl p-10 bg-white shadow-2xl rounded-3xl border border-slate-200"
      >
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="mb-6">
            <img 
              src="https://i.ibb.co/5xkbm2kh/Gemini-Generated-Image-3yyt6f3yyt6f3yyt.png" 
              alt="OPTIME RDM Logo" 
              className="w-48 h-auto"
            />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {isAdminMode ? 'Area Amministratore' : 'OPTIME RDM'}
          </h1>
          <p className="text-slate-500 mt-2 font-medium max-w-sm">
            {isAdminMode ? 'Accedi al pannello di controllo aziendale' : 'Inserisci il tuo codice personale per accedere'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!isAdminMode ? (
            <motion.form 
              key="worker-login"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleLogin} 
              className="space-y-6"
            >
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                  CODICE UTENTE
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="A1B2C3"
                    className="w-full pl-12 pr-4 py-5 text-center text-3xl font-mono tracking-[0.5em] bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all placeholder:text-slate-200"
                    maxLength={6}
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-xl text-sm border border-red-100"
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="font-semibold">{error}</span>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 text-lg font-bold text-white bg-dark-blue rounded-2xl hover:bg-dark-blue-hover active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-dark-blue/10 flex items-center justify-center gap-3"
              >
                {loading ? 'VERIFICA...' : 'ENTRA NELL\'APP'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAdminMode(true);
                  setError('');
                }}
                className="w-full text-sm font-bold text-slate-400 hover:text-dark-blue transition-colors uppercase tracking-widest"
              >
                Area Amministratore
              </button>

            </motion.form>
          ) : (
            <motion.div 
              key="admin-flow"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6"
            >
              <div className="space-y-6">
                {useGoogle ? (
                  <div className="space-y-6">
                    <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 mb-6">
                      <p className="text-sm text-blue-800 font-medium leading-relaxed font-sans">
                        Accedi con l'account Google associato alla tua azienda. 
                        Se non sei ancora autorizzato, contatta l'amministratore.
                      </p>
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-xl text-sm border border-red-100 font-sans">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="font-semibold">{error}</span>
                      </div>
                    )}

                    <button
                      onClick={handleAdminLoginGoogle}
                      disabled={loading}
                      className="w-full py-5 text-lg font-bold text-white bg-slate-900 rounded-2xl hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-slate-200 flex items-center justify-center gap-3 font-sans"
                    >
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 bg-white rounded-full p-1" />
                      {loading ? 'ACCESSO...' : 'ACCEDI CON GOOGLE'}
                    </button>

                    <div className="flex flex-col gap-4">
                      <button
                        type="button"
                        onClick={() => setUseGoogle(false)}
                        className="w-full text-xs font-bold text-slate-400 hover:text-dark-blue transition-colors uppercase tracking-widest text-center font-sans"
                      >
                        Usa Email e Password
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleAdminLoginEmail} className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 font-sans">
                          EMAIL
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-bold font-sans"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 font-sans">
                          PASSWORD
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-bold font-sans"
                          required
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-xl text-sm border border-red-100 font-sans">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="font-semibold">{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-5 text-lg font-bold text-white bg-dark-blue rounded-2xl hover:bg-dark-blue-hover active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-dark-blue/10 flex items-center justify-center gap-3 font-sans"
                    >
                      {loading ? 'ACCESSO...' : 'ACCEDI'}
                    </button>

                    <div className="flex flex-col gap-4 pt-2">
                      <button
                        type="button"
                        onClick={() => setUseGoogle(true)}
                        className="text-xs font-bold text-slate-400 hover:text-dark-blue transition-colors uppercase tracking-widest font-sans"
                      >
                        Usa Account Google
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsAdminMode(false);
                  setError('');
                }}
                className="w-full text-sm font-bold text-slate-400 hover:text-dark-blue transition-colors uppercase tracking-widest"
              >
                Torna al Login Dipendenti
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
