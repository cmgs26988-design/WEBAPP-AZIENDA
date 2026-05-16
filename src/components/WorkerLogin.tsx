import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, User, Building2, Mail, Lock } from 'lucide-react';
import { Worker } from '../types';

interface WorkerLoginProps {
  onLogin: (worker: Worker) => void;
  onAdminLogin: (companyId: string) => void;
}

const getDeviceId = () => {
  let id = localStorage.getItem('lg_inox_device_id');
  if (!id) {
    id = crypto.randomUUID?.() || (Math.random().toString(36).substring(2) + Date.now().toString(36));
    localStorage.setItem('lg_inox_device_id', id);
  }
  return id;
};

export const WorkerLogin: React.FC<WorkerLoginProps> = ({ onLogin, onAdminLogin }) => {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [useGoogle, setUseGoogle] = useState(false);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    
    setLoading(true);
    setError('');

    const upperCode = code.toUpperCase();
    const currentDeviceId = getDeviceId();
    
    try {
      const workerDoc = await getDoc(doc(db, 'workers', upperCode));

      if (workerDoc.exists()) {
        const data = workerDoc.data();
        
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
          }
        }

        const worker: Worker = {
          id: upperCode,
          name: data?.name || 'Dipendente',
          companyId: data?.companyId,
          photoUrl: data?.photoUrl,
          deviceId: data?.deviceId || currentDeviceId
        };
        
        if (!worker.companyId) {
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
      
      if (err?.message?.includes('offline') || err?.message?.includes('network-error')) {
        message = 'Errore di connessione: il database Firebase non è raggiungibile.';
      } else if (err?.message?.includes('permission-denied')) {
        message = 'Accesso negato: permessi insufficienti.';
      }
      
      setError(message);
      try {
        handleFirestoreError(err, OperationType.GET, `workers/${upperCode}`);
      } catch (logErr) { }
    } finally {
      setLoading(false);
    }
  };

  const handleAdminRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !companyName) return;

    setLoading(true);
    setError('');

    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      
      const companyRef = doc(collection(db, 'companies'));
      const companyId = companyRef.id;

      await setDoc(companyRef, {
        name: companyName,
        adminEmail: email,
        adminUid: user.uid,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'admins', user.uid), {
        email,
        companyId,
        companyName,
        createdAt: serverTimestamp()
      });

      onAdminLogin(companyId);
      navigate('/admin');
    } catch (err: any) {
      console.error('Registration error:', err);
      setError('Errore durante la registrazione: ' + (err.message || 'Riprova più tardi.'));
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLoginEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError('');

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      
      // Fetch companyId from admin profile
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists()) {
        onAdminLogin(adminDoc.data().companyId);
        navigate('/admin');
      } else {
        // Fallback for old superadmin or missing profile
        if (email === 'cmgs26988@gmail.com') {
          onAdminLogin('SUPERADMIN');
          navigate('/admin');
        } else {
          setError('Profilo amministratore non trovato.');
          await auth.signOut();
        }
      }
    } catch (err: any) {
      console.error('Admin email login error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Email o password non corretti.');
      } else {
        setError('Errore durante l\'accesso: ' + (err.message || 'Riprova più tardi.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLoginGoogle = async () => {
    setLoading(true);
    setError('');

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const { user } = await signInWithPopup(auth, provider);
      
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists()) {
        onAdminLogin(adminDoc.data().companyId);
        navigate('/admin');
      } else if (user.email === 'cmgs26988@gmail.com') {
        onAdminLogin('SUPERADMIN');
        navigate('/admin');
      } else {
        setError('Nessuna azienda associata a questo account Google. Registrati prima.');
        await auth.signOut();
      }
    } catch (err: any) {
      console.error('Admin login error:', err);
      setError('Errore durante l\'accesso con Google.');
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
              src="https://i.ibb.co/m5GbpFJy/LOGO-LG-INOX-2025-NS-01.png" 
              alt="LG INOX Logo" 
              className="w-48 h-auto"
            />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {isAdminMode ? (isRegistering ? 'Nuova Azienda' : 'Area Amministratore') : 'LG INOX'}
          </h1>
          <p className="text-slate-500 mt-2 font-medium max-w-sm">
            {isAdminMode ? (isRegistering ? 'Registra la tua ditta per iniziare a gestire le ore' : 'Accedi al pannello di controllo aziendale') : 'Inserisci il tuo codice personale per timbrare'}
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
              {isRegistering ? (
                <form onSubmit={handleAdminRegistration} className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 leading-none">
                        NOME AZIENDA
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="es. LG INOX SRL"
                          className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-bold"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 leading-none">
                          EMAIL AMMINISTRATORE
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-bold"
                            required
                          />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 leading-none">
                          PASSWORD
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-bold"
                            required
                          />
                        </div>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-xl text-sm border border-red-100">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <span className="font-semibold">{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-5 text-lg font-bold text-white bg-emerald-600 rounded-2xl hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-emerald-100 flex items-center justify-center gap-3"
                  >
                    {loading ? 'REGISTRAZIONE...' : 'REGISTRA AZIENDA'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsRegistering(false);
                      setUseGoogle(false);
                      setError('');
                    }}
                    className="w-full text-sm font-bold text-slate-400 hover:text-dark-blue transition-colors uppercase tracking-widest"
                  >
                    Hai già un'azienda? Accedi
                  </button>
                </form>
              ) : (
                <div className="space-y-6">
                  {useGoogle ? (
                    <div className="space-y-6">
                      <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 mb-6">
                        <p className="text-sm text-blue-800 font-medium leading-relaxed">
                          Accedi con l'account Google associato alla tua azienda. 
                          Se non hai ancora registrato la ditta, usa il modulo di registrazione.
                        </p>
                      </div>

                      {error && (
                        <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-xl text-sm border border-red-100">
                          <AlertCircle className="w-5 h-5 flex-shrink-0" />
                          <span className="font-semibold">{error}</span>
                        </div>
                      )}

                      <button
                        onClick={handleAdminLoginGoogle}
                        disabled={loading}
                        className="w-full py-5 text-lg font-bold text-white bg-slate-900 rounded-2xl hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-slate-200 flex items-center justify-center gap-3"
                      >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 bg-white rounded-full p-1" />
                        {loading ? 'ACCESSO...' : 'ACCEDI CON GOOGLE'}
                      </button>

                      <div className="flex flex-col gap-4">
                        <button
                          type="button"
                          onClick={() => setUseGoogle(false)}
                          className="w-full text-xs font-bold text-slate-400 hover:text-dark-blue transition-colors uppercase tracking-widest text-center"
                        >
                          Usa Email e Password
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsRegistering(true)}
                          className="text-sm font-black text-emerald-600 hover:text-emerald-700 transition-colors uppercase tracking-widest"
                        >
                          Registra la tua Azienda
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleAdminLoginEmail} className="space-y-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                            EMAIL
                          </label>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-bold"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                            PASSWORD
                          </label>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-bold"
                            required
                          />
                        </div>
                      </div>

                      {error && (
                        <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-xl text-sm border border-red-100">
                          <AlertCircle className="w-5 h-5 flex-shrink-0" />
                          <span className="font-semibold">{error}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-5 text-lg font-bold text-white bg-dark-blue rounded-2xl hover:bg-dark-blue-hover active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-dark-blue/10 flex items-center justify-center gap-3"
                      >
                        {loading ? 'ACCESSO...' : 'ACCEDI'}
                      </button>

                      <div className="flex flex-col gap-4 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsRegistering(true)}
                          className="text-sm font-black text-emerald-600 hover:text-emerald-700 transition-colors uppercase tracking-widest"
                        >
                          Nessun Account? Registra la tua Azienda
                        </button>
                        <button
                          type="button"
                          onClick={() => setUseGoogle(true)}
                          className="text-xs font-bold text-slate-400 hover:text-dark-blue transition-colors uppercase tracking-widest"
                        >
                          Usa Account Google
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsAdminMode(false);
                  setIsRegistering(false);
                  setUseGoogle(false);
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
