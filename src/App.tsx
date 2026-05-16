import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { db, auth } from './lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { WorkerLogin } from './components/WorkerLogin';
import { WorkerDashboard } from './components/WorkerDashboard';
import { AddEntry } from './components/AddEntry';
import { MonthlyHours } from './components/MonthlyHours';
import { AdminDashboard } from './components/AdminDashboard';
import { motion, AnimatePresence } from 'motion/react';
import { Worker } from './types';

export default function App() {
  const [worker, setWorker] = useState<Worker | null>(() => {
    const saved = localStorage.getItem('lg_inox_worker');
    return saved ? JSON.parse(saved) : null;
  });
  const [adminCompanyId, setAdminCompanyId] = useState<string | null>(() => {
    return localStorage.getItem('lg_inox_admin_company_id');
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Track if auth has initialized
    let authInitialized = false;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // If user is logged in, try to fetch their company profile
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        if (adminDoc.exists()) {
          const cid = adminDoc.data().companyId;
          setAdminCompanyId(cid);
          localStorage.setItem('lg_inox_admin_company_id', cid);
          setIsAdmin(true);
        } else if (user.email === 'cmgs26988@gmail.com') {
          setAdminCompanyId('SUPERADMIN');
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
        setAdminCompanyId(null);
        localStorage.removeItem('lg_inox_admin_company_id');
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
    localStorage.setItem('lg_inox_worker', JSON.stringify(w));
  };

  const handleAdminLogin = (companyId: string) => {
    setIsAdmin(true);
    setAdminCompanyId(companyId);
    localStorage.setItem('lg_inox_admin_company_id', companyId);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setWorker(null);
    localStorage.removeItem('lg_inox_worker');
    localStorage.removeItem('lg_inox_admin_company_id');
    setIsAdmin(false);
    setAdminCompanyId(null);
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
            <Route path="/admin/*" element={isAdmin && adminCompanyId ? <AdminDashboard onLogout={handleLogout} adminCompanyId={adminCompanyId} /> : <Navigate to="/login" />} />
          </Routes>
        </AnimatePresence>
      </div>
    </BrowserRouter>
  );
}
