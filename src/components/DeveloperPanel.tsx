import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, orderBy, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Headset, 
  AlertCircle, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  ArrowLeft,
  User,
  Building,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface Feedback {
  id: string;
  tipo: 'Bug/Errore' | 'Miglioria';
  titolo: string;
  descrizione: string;
  priorita: 'Alta' | 'Media' | 'Bassa';
  status: 'Aperto' | 'Risolto';
  user: string;
  azienda_id: string;
  createdAt: any;
  updatedAt: any;
}

interface DeveloperPanelProps {
  onBack: () => void;
}

export const DeveloperPanel: React.FC<DeveloperPanelProps> = ({ onBack }) => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'Tutti' | 'Aperto' | 'Risolto'>('Tutti');

  useEffect(() => {
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Feedback[];
      setFeedbacks(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedback');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const toggleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'Aperto' ? 'Risolto' : 'Aperto';
      await updateDoc(doc(db, 'feedback', id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'feedback');
    }
  };

  const filteredFeedbacks = feedbacks.filter(f => {
    const statusMatch = statusFilter === 'Tutti' || f.status === statusFilter;
    return statusMatch;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-6">
            <button 
              onClick={onBack}
              className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-slate-600" />
            </button>
            <div className="flex items-center gap-4">
              <div className="p-4 bg-dark-blue rounded-2xl shadow-lg shadow-dark-blue/20">
                <Headset className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Pannello Feedback</h1>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Gestione Segnalazioni Sviluppo</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
              {(['Tutti', 'Aperto', 'Risolto'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                    statusFilter === s ? 'bg-dark-blue text-white' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-dark-blue border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Caricamento segnalazioni...</p>
          </div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="bg-white rounded-[2rem] p-20 text-center border border-slate-200 shadow-sm">
            <CheckCircle2 className="w-20 h-20 text-slate-100 mx-auto mb-4" />
            <p className="text-slate-400 font-bold uppercase tracking-widest">Nessuna segnalazione trovata</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFeedbacks.map(f => (
              <motion.div
                key={f.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-[1.5rem] overflow-hidden border shadow-sm transition-all ${
                  f.status === 'Risolto' ? 'border-emerald-100 opacity-75' : 'border-slate-200'
                }`}
              >
                <div className="p-6 flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        f.tipo === 'Bug/Errore' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {f.tipo === 'Bug/Errore' ? <AlertCircle className="w-3 h-3 inline mr-1" /> : <Sparkles className="w-3 h-3 inline mr-1" />}
                        {f.tipo}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        f.priorita === 'Alta' ? 'bg-red-500 text-white' :
                        f.priorita === 'Media' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        Priorità {f.priorita}
                      </span>
                      {f.status === 'Risolto' && (
                        <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Risolto
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase leading-tight mb-2">{f.titolo}</h3>
                      <p className="text-slate-600 font-medium leading-relaxed">{f.descrizione}</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-slate-400">
                        <User className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase truncate">{f.user}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Building className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">{f.azienda_id}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Calendar className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">
                          {f.createdAt ? format(f.createdAt.toDate(), 'dd MMM yyyy', { locale: it }) : '...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Clock className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">
                          {f.createdAt ? format(f.createdAt.toDate(), 'HH:mm', { locale: it }) : '...'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-end items-center gap-3">
                    <button
                      onClick={() => toggleStatus(f.id, f.status)}
                      className={`p-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
                        f.status === 'Aperto' 
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {f.status === 'Aperto' ? (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Segna come Risolto
                        </>
                      ) : (
                        <>
                          <Clock className="w-5 h-5" />
                          Riapri Segnalazione
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
