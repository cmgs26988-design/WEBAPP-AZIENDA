import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { db, auth, fetchWithRetry } from './lib/firebase';
import { doc, getDoc, query, where, getDocs, collection, getDocFromServer } from 'firebase/firestore';
import { WorkerLogin } from './components/WorkerLogin';
import { WorkerDashboard } from './components/WorkerDashboard';
import { AddEntry } from './components/AddEntry';
import { MonthlyHours } from './components/MonthlyHours';
import { AdminDashboard } from './components/AdminDashboard';
import { motion, AnimatePresence } from 'motion/react';
import { Worker } from './types';

export default function App() {
  const [worker, setWorker] = useState<Worker | null>(() => {
    try {
      const saved = localStorage.getItem('optimerdm_worker');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Error parsing saved worker:", e);
      localStorage.removeItem('optimerdm_worker');
      return null;
    }
  });
  const [adminAziendaId, setAdminAziendaId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('optimerdm_admin_azienda_id');
    } catch (e) {
      console.error("Error reading admin azienda ID:", e);
      return null;
    }
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Track if auth has initialized
    let authInitialized = false;

    // Test connection as per platform guidelines to wake up Firestore
    const testConnection = async () => {
      try {
        // We query the permitted 'workers' collection to test server connectivity and wake up the instance.
        // We use standard getDoc which can fall back to local cache if the connection is establishing or offline.
        await fetchWithRetry(() => getDoc(doc(db, 'workers', 'connection_test_doc')));
        console.log("[Firestore] Connessione al server verificata o cache attiva.");
      } catch (error: any) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn("[Firestore] Database offline o in fase di connessione. Attiva modalità resiliente offline:", errorMsg);
      }
    };
    testConnection();

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUserEmail(user?.email || null);
      if (user && user.email) {
        try {
          const lowerEmail = user.email.trim().toLowerCase();
          let aziendaId = null;
          let found = false;

          // Controllo preliminare per gli admin noti
          if (lowerEmail === 'cmgs26988@gmail.com' || lowerEmail === 'admin@optime-rdm.com' || lowerEmail === 'lginox.piping@gmail.com') {
            aziendaId = 'SUPERADMIN';
            found = true;
          }

          if (!found) {
            // 1. Ricerca diretta per ID con email minuscola
            const docRef = doc(db, 'utenti_autorizzati', lowerEmail);
            const docSnap = await fetchWithRetry(() => getDoc(docRef));
            
            if (docSnap && typeof docSnap.exists === 'function' && docSnap.exists()) {
              found = true;
              const docData = typeof docSnap.data === 'function' ? docSnap.data() : null;
              aziendaId = docData?.azienda_id || 'SUPERADMIN';
            }
          }

          if (!found) {
            // 2. Ricerca diretta per ID con email originale
            const docRefOriginal = doc(db, 'utenti_autorizzati', user.email.trim());
            const docSnapOriginal = await fetchWithRetry(() => getDoc(docRefOriginal));
            
            if (docSnapOriginal && typeof docSnapOriginal.exists === 'function' && docSnapOriginal.exists()) {
              found = true;
              const docData = typeof docSnapOriginal.data === 'function' ? docSnapOriginal.data() : null;
              aziendaId = docData?.azienda_id || 'SUPERADMIN';
            }
          }

          if (!found) {
            // 3. Fallback: query sul campo email (minuscolo)
            const q = query(collection(db, 'utenti_autorizzati'), where('email', '==', lowerEmail));
            const querySnapshot = await fetchWithRetry(() => getDocs(q));
            
            if (querySnapshot && !querySnapshot.empty && querySnapshot.docs && querySnapshot.docs[0]) {
              const firstDoc = querySnapshot.docs[0];
              if (firstDoc && typeof firstDoc.exists === 'function' && firstDoc.exists()) {
                found = true;
                const firstDocData = typeof firstDoc.data === 'function' ? firstDoc.data() : null;
                aziendaId = firstDocData?.azienda_id || 'SUPERADMIN';
              }
            }
          }

          if (!found) {
            // 4. Fallback: query sul campo email originale
            const qOriginal = query(collection(db, 'utenti_autorizzati'), where('email', '==', user.email.trim()));
            const querySnapshotOriginal = await fetchWithRetry(() => getDocs(qOriginal));
            
            if (querySnapshotOriginal && !querySnapshotOriginal.empty && querySnapshotOriginal.docs && querySnapshotOriginal.docs[0]) {
              const firstDoc = querySnapshotOriginal.docs[0];
              if (firstDoc && typeof firstDoc.exists === 'function' && firstDoc.exists()) {
                found = true;
                const firstDocData = typeof firstDoc.data === 'function' ? firstDoc.data() : null;
                aziendaId = firstDocData?.azienda_id || 'SUPERADMIN';
              }
            }
          }

          // Ultimo fallback di controllo mail note
          if (lowerEmail === 'cmgs26988@gmail.com' || lowerEmail === 'admin@optime-rdm.com' || lowerEmail === 'lginox.piping@gmail.com') {
            aziendaId = 'SUPERADMIN';
            found = true;
          }

          if (found) {
            const finalAziendaId = aziendaId || 'SUPERADMIN';
            setAdminAziendaId(finalAziendaId);
            localStorage.setItem('optimerdm_admin_azienda_id', finalAziendaId);
            setIsAdmin(true);
          } else {
            // Not authorized
            await auth.signOut();
            setIsAdmin(false);
          }
        } catch (error) {
          console.error("Error checking authorized user:", error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
        setAdminAziendaId(null);
        localStorage.removeItem('optimerdm_admin_azienda_id');
      }

      if (!authInitialized) {
        authInitialized = true;
        setLoading(false);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  const handleWorkerLogin = (w: Worker) => {
    setWorker(w);
    localStorage.setItem('optimerdm_worker', JSON.stringify(w));
  };

  const handleAdminLogin = (aziendaId: string) => {
    setIsAdmin(true);
    setAdminAziendaId(aziendaId);
    localStorage.setItem('optimerdm_admin_azienda_id', aziendaId);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setWorker(null);
    localStorage.removeItem('optimerdm_worker');
    localStorage.removeItem('optimerdm_admin_azienda_id');
    setIsAdmin(false);
    setAdminAziendaId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <BrowserRouter basename="/">
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <AnimatePresence mode="wait">
          <Routes>
            {/* Main redirects */}
            <Route path="/" element={
              worker ? <Navigate to="/worker" /> : 
              isAdmin ? <Navigate to="/admin" /> : 
              <Navigate to="/login" />
            } />

            {/* Login screens */}
            <Route path="/login" element={<WorkerLogin 
              onLogin={handleWorkerLogin} 
              onAdminLogin={handleAdminLogin}
            />} />

            {/* Worker routes */}
            <Route path="/worker" element={worker ? <WorkerDashboard worker={worker} onLogout={handleLogout} /> : <Navigate to="/login" />} />
            <Route path="/worker/add" element={worker ? <AddEntry worker={worker} onLogout={handleLogout} /> : <Navigate to="/login" />} />
            <Route path="/worker/monthly" element={worker ? <MonthlyHours worker={worker} onLogout={handleLogout} /> : <Navigate to="/login" />} />

            {/* Admin routes */}
            <Route path="/admin/*" element={isAdmin && adminAziendaId ? <AdminDashboard onLogout={handleLogout} adminAziendaId={adminAziendaId} /> : <Navigate to="/login" />} />
          </Routes>
        </AnimatePresence>
      </div>
    </BrowserRouter>
  );
}
