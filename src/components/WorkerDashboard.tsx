import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Calendar, LogOut, User, Hammer, ChevronLeft, Cylinder, Wrench } from 'lucide-react';
import { Worker } from '../types';
import { MaterialRequest } from './MaterialRequest';

interface WorkerDashboardProps {
  worker: Worker;
  onLogout: () => void;
}

type ViewType = 'hub' | 'ore' | 'materiale';

export const WorkerDashboard: React.FC<WorkerDashboardProps> = ({ worker, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<ViewType>((location.state as any)?.view || 'hub');

  if (view === 'materiale') {
    return <MaterialRequest worker={worker} onBack={() => setView('hub')} onLogout={onLogout} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {view !== 'hub' && (
        <div className="flex items-center justify-between mb-8 sm:mb-12">
          <button 
            onClick={() => setView('hub')}
            className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            INDIETRO
          </button>
          <button 
            onClick={() => setView('hub')}
            className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            INIZIO
          </button>
        </div>
      )}

      <header className="flex flex-row items-center justify-between mb-8 sm:mb-16 bg-white p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[3rem] border border-slate-200 shadow-sm gap-4">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 sm:w-24 sm:h-24 bg-dark-blue rounded-2xl sm:rounded-3xl flex items-center justify-center text-white shadow-xl shadow-dark-blue/20 shrink-0">
            <User className="w-8 h-8 sm:w-12 sm:h-12" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">{worker.name}</h2>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === 'hub' ? (
          <motion.div 
            key="hub"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            <motion.button
              whileHover={{ y: -10, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView('ore')}
              className="group flex flex-col items-center justify-center p-12 bg-white rounded-[2.5rem] shadow-2xl border-4 border-transparent hover:border-dark-blue transition-all text-center relative overflow-hidden h-[300px] sm:h-[400px]"
            >
              <div className="p-8 bg-slate-100 group-hover:bg-dark-blue group-hover:text-white transition-all mb-8 rounded-[2rem] shadow-sm">
                <Clock className="w-20 h-20 sm:w-32 sm:h-32 text-dark-blue group-hover:text-white transition-colors" />
              </div>
              <span className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-widest">ORE</span>
              <p className="text-slate-500 mt-4 font-bold uppercase tracking-tight text-sm">Registrazione e Riepiloghi</p>
            </motion.button>

            <motion.button
              whileHover={{ y: -10, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView('materiale')}
              className="group flex flex-col items-center justify-center p-12 bg-white rounded-[2.5rem] shadow-2xl border-4 border-transparent hover:border-dark-blue transition-all text-center relative overflow-hidden h-[300px] sm:h-[400px]"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity rotate-12">
                <Wrench className="w-32 h-32 sm:w-48 sm:h-48" />
              </div>
              <div className="p-8 bg-slate-100 group-hover:bg-dark-blue group-hover:text-white transition-all mb-8 rounded-[2rem] shadow-sm relative z-10">
                <Cylinder className="w-20 h-20 sm:w-32 sm:h-32 text-dark-blue group-hover:text-white transition-colors" />
              </div>
              <span className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-widest relative z-10">MATERIALE</span>
              <p className="text-slate-500 mt-4 font-bold uppercase tracking-tight text-sm relative z-10">Richiesta articoli ufficio</p>
            </motion.button>

            <motion.button
              whileHover={{ y: -5, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={onLogout}
              className="md:col-span-2 group flex items-center justify-center gap-6 p-8 bg-red-600 text-white rounded-[2rem] shadow-2xl hover:bg-red-700 transition-all text-center relative overflow-hidden mt-4"
            >
              <LogOut className="w-8 h-8 relative z-10" />
              <span className="text-2xl font-black uppercase tracking-[0.2em] relative z-10">ESCI DAL SISTEMA</span>
            </motion.button>
          </motion.div>

        ) : (
          <motion.div 
            key="ore"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-8 sm:mb-12"
          >
            <motion.button
              whileHover={{ y: -8, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/worker/add')}
              className="group flex flex-col items-center justify-center p-8 sm:p-12 bg-white rounded-[1.5rem] sm:rounded-[2rem] shadow-xl border border-slate-100 hover:border-dark-blue transition-all text-center relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Hammer className="w-24 h-24 sm:w-32 sm:h-32" />
              </div>
              <div className="p-6 sm:p-8 bg-slate-100 group-hover:bg-dark-blue group-hover:text-white transition-all mb-4 sm:mb-8 rounded-2xl sm:rounded-[1.5rem] shadow-sm">
                <Clock className="w-12 h-12 sm:w-20 sm:h-20 text-dark-blue group-hover:text-white transition-colors" />
              </div>
              <span className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-[0.2em]">INSERISCI</span>
              <p className="text-slate-500 mt-2 sm:mt-3 font-medium text-sm sm:text-base">Registra le ore quotidiane</p>
            </motion.button>

            <motion.button
              whileHover={{ y: -8, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/worker/monthly')}
              className="group flex flex-col items-center justify-center p-8 sm:p-12 bg-white rounded-[1.5rem] sm:rounded-[2rem] shadow-xl border border-slate-100 hover:border-dark-blue transition-all text-center relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Calendar className="w-24 h-24 sm:w-32 sm:h-32" />
              </div>
              <div className="p-6 sm:p-8 bg-slate-50 group-hover:bg-dark-blue group-hover:text-white transition-all mb-4 sm:mb-8 rounded-2xl sm:rounded-[1.5rem] shadow-sm">
                <Calendar className="w-12 h-12 sm:w-20 sm:h-20 text-slate-600 group-hover:text-white transition-colors" />
              </div>
              <span className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-[0.2em]">ORE MENSILI</span>
              <p className="text-slate-500 mt-2 sm:mt-3 font-medium text-sm sm:text-base">Controlla il tuo riepilogo</p>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
