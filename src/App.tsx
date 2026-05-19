import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { db, auth, fetchWithRetry } from './lib/firebase';
import { doc, getDoc, query, where, getDocs, collection } from 'firebase/firestore';
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
        await fetchWithRetry(() => getDoc(doc(db, 'test', 'connection')));
        console.log("Firestore connection verified.");
      } catch (error: any) {
        // If it's just "not found", it's actually a success in terms of connectivity
        if (error.message && !error.message.includes('the client is offline')) {
          console.log("Connectivity reached Firestore (but document not found or other non-offline error).");
          return;
        }
        console.error("Firestore connection could not be established after retries.");
      }
    };
    testConnection();

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUserEmail(user?.email || null);
      if (user && user.email) {
        try {
          // Try direct ID lookup first
          const docRef = doc(db, 'utenti_autorizzati', user.email);
          const docSnap = await fetchWithRetry(() => getDoc(docRef));
          
          let aziendaId = null;
          
          if (docSnap && typeof docSnap.exists === 'function' && docSnap.exists() && typeof docSnap.data === 'function') {
            const docData = docSnap.data();
            if (docData) {
              aziendaId = docData.azienda_id;
            }
          } else {
            // Fallback: check authorized users collection by email query
            const q = query(collection(db, 'utenti_autorizzati'), where('email', '==', user.email));
            const querySnapshot = await fetchWithRetry(() => getDocs(q));
            
            if (querySnapshot && !querySnapshot.empty && querySnapshot.docs && querySnapshot.docs[0]) {
              const firstDoc = querySnapshot.docs[0];
              if (firstDoc && typeof firstDoc.exists === 'function' && firstDoc.exists() && typeof firstDoc.data === 'function') {
                const firstDocData = firstDoc.data();
                if (firstDocData) {
                  aziendaId = firstDocData.azienda_id;
                }
              }
            }
          }

          // Fallback per i Super Admin hardcoded (es. cmgs26988@gmail.com)
          if (!aziendaId && (user.email === 'cmgs26988@gmail.com' || user.email === 'admin@optime-rdm.com')) {
            aziendaId = 'SUPERADMIN';
          }

          if (aziendaId) {
            setAdminAziendaId(aziendaId);
            localStorage.setItem('optimerdm_admin_azienda_id', aziendaId);
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
