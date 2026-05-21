import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Headset, Send, List, AlertCircle, Sparkles, CheckCircle2, 
  Clock, ArrowLeft, User, Building, Calendar, X
} from 'lucide-react';
import { db, handleFirestoreError, OperationType, auth, safeWaitForPendingWrites } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, orderBy, serverTimestamp, addDoc, deleteDoc } from 'firebase/firestore';
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

interface FeedbackModuleProps {
  onBack: () => void;
  userEmail: string;
  aziendaId: string;
}

export const FeedbackModule: React.FC<FeedbackModuleProps> = ({ onBack, userEmail, aziendaId }) => {
  const [subView, setSubView] = useState<'menu' | 'send' | 'view'>('menu');
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // States for sending feedback
  const [tipo, setTipo] = useState<'Bug/Errore' | 'Miglioria'>('Bug/Errore');
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [priorita, setPriorita] = useState<'Alta' | 'Media' | 'Bassa'>('Media');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const currentUserEmail = auth.currentUser?.email;
  const isDev = currentUserEmail === 'cmgs26988@gmail.com';

  useEffect(() => {
    // Check if current user is an admin by looking at the azienda document
    const checkAdminStatus = async () => {
      if (isDev) {
        setIsAdmin(true);
        return;
      }
      // If we are in the AdminDashboard, we already know we are admins
      // But for workers, we need to be sure. 
      // Actually, we can check if the user is in the admins collection or has the right email
      // For simplicity, if they can see "all" in AdminDashboard, passed props would be better.
      // But we'll rely on the rule that only superadmins edit.
      // Let's assume anyone NOT using worker.name as userEmail is likely an admin view.
    };
    checkAdminStatus();
  }, [isDev]);

  const cleanupOldFeedbacks = async (data: Feedback[]) => {
    if (!isDev && !isAdmin) return;
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const toDelete = data.filter(f => {
      if (f.status !== 'Risolto' || !f.updatedAt) return false;
      const updatedDate = f.updatedAt?.toDate?.() || new Date();
      return updatedDate < sixMonthsAgo;
    });

    for (const f of toDelete) {
      try {
        await deleteDoc(doc(db, 'feedback', f.id));
      } catch (err) {
        console.error("Error cleaning up feedback:", f.id, err);
      }
    }
  };

  useEffect(() => {
    if (subView === 'view') {
      setLoading(true);
      // Query everything, we will filter in memory for workers to avoid index issues 
      // or complex RLS if preferred. Since feedback volume is low, memory filter is fine.
      const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot || !snapshot.docs) return;
        let data: Feedback[] = [];
        for (const d of snapshot.docs) {
          try {
            if (!d || !d.data || typeof d.data !== 'function') continue;
            const docData = d.data();
            if (!docData) continue;
            data.push({
              id: d.id,
              ...docData
            } as any);
          } catch (e) {
            console.error("Error mapping feedback in FeedbackModule:", e);
          }
        }

        // Auto cleanup for resolved > 6 months
        cleanupOldFeedbacks(data);

        // Filter: Admin/Dev sees everything, Worker sees only theirs
        // We detect "worker" mode if userEmail (the prop) matches current worker name
        // In AdminDashboard, userEmail is passed as 'admin' or auth.currentUser?.email
        if (!isDev && userEmail !== 'admin') {
          data = data.filter(f => f.user === userEmail);
        }

        setFeedbacks(data);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'feedback');
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [subView, userEmail, isDev, isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titolo || !descrizione) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        tipo,
        titolo,
        descrizione,
        priorita,
        status: 'Aperto',
        user: userEmail,
        azienda_id: aziendaId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await safeWaitForPendingWrites();
      setSuccess(true);
      setTimeout(() => {
        setSubView('menu');
        setSuccess(false);
        setTitolo('');
        setDescrizione('');
      }, 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    if (!isDev) return;
    try {
      const newStatus = currentStatus === 'Aperto' ? 'Risolto' : 'Aperto';
      await updateDoc(doc(db, 'feedback', id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      await safeWaitForPendingWrites();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'feedback');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center gap-6 mb-8">
          <button 
            onClick={subView === 'menu' ? onBack : () => setSubView('menu')}
            className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-slate-600" />
          </button>
          <div className="flex items-center gap-4">
            <div className="p-4 bg-dark-blue rounded-2xl shadow-lg shadow-dark-blue/20">
              <Headset className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Feedback</h1>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">
                {subView === 'menu' ? 'Centro Segnalazioni' : subView === 'send' ? 'Invia Segnalazione' : 'Tutte le Segnalazioni'}
              </p>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {subView === 'menu' && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-6"
            >
              <button
                onClick={() => setSubView('send')}
                className="group p-10 bg-white rounded-[2rem] shadow-xl border-4 border-transparent hover:border-dark-blue transition-all text-center flex flex-col items-center gap-6"
              >
                <div className="p-6 bg-slate-50 group-hover:bg-dark-blue group-hover:text-white transition-all rounded-[2rem]">
                  <Send className="w-16 h-16 text-dark-blue group-hover:text-white transition-colors" />
                </div>
                <div className="space-y-2">
                  <span className="text-2xl font-black text-slate-900 uppercase tracking-widest">Invia Feedback</span>
                  <p className="text-slate-500 font-bold text-xs uppercase">Segnala un bug o suggerisci una miglioria</p>
                </div>
              </button>

              <button
                onClick={() => setSubView('view')}
                className="group p-10 bg-white rounded-[2rem] shadow-xl border-4 border-transparent hover:border-dark-blue transition-all text-center flex flex-col items-center gap-6"
              >
                <div className="p-6 bg-slate-50 group-hover:bg-dark-blue group-hover:text-white transition-all rounded-[2rem]">
                  <List className="w-16 h-16 text-dark-blue group-hover:text-white transition-colors" />
                </div>
                <div className="space-y-2">
                  <span className="text-2xl font-black text-slate-900 uppercase tracking-widest">Storico Feed</span>
                  <p className="text-slate-500 font-bold text-xs uppercase">Guarda lo stato delle segnalazioni attive</p>
                </div>
              </button>
            </motion.div>
          )}

          {subView === 'send' && (
            <motion.div
              key="send"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-200"
            >
              <form onSubmit={handleSubmit} className="space-y-8">
                {success ? (
                  <div className="py-20 text-center">
                    <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="w-12 h-12" />
                    </div>
                    <h4 className="text-3xl font-black text-slate-900 uppercase">Inviato!</h4>
                    <p className="text-slate-500 font-bold uppercase tracking-tight">Grazie per il tuo contributo.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-6">
                      <button
                        type="button"
                        onClick={() => setTipo('Bug/Errore')}
                        className={`p-6 rounded-[2rem] border-4 flex flex-col items-center gap-4 transition-all ${
                          tipo === 'Bug/Errore' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100 bg-slate-50 text-slate-400 opacity-60'
                        }`}
                      >
                        <AlertCircle className="w-10 h-10" />
                        <span className="text-sm font-black uppercase tracking-widest">Bug/Errore</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipo('Miglioria')}
                        className={`p-6 rounded-[2rem] border-4 flex flex-col items-center gap-4 transition-all ${
                          tipo === 'Miglioria' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400 opacity-60'
                        }`}
                      >
                        <Sparkles className="w-10 h-10" />
                        <span className="text-sm font-black uppercase tracking-widest">Miglioria</span>
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] ml-6 mb-3 block">Titolo Segnalazione</label>
                        <input
                          required
                          value={titolo}
                          onChange={(e) => setTitolo(e.target.value)}
                          placeholder="Cosa non funziona?"
                          className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:ring-8 focus:ring-dark-blue/5 focus:border-dark-blue outline-none transition-all font-bold text-lg"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] ml-6 mb-3 block">Descrizione Dettagliata</label>
                        <textarea
                          required
                          value={descrizione}
                          onChange={(e) => setDescrizione(e.target.value)}
                          rows={4}
                          placeholder="Fornisci più dettagli possibili..."
                          className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:ring-8 focus:ring-dark-blue/5 focus:border-dark-blue outline-none transition-all font-bold resize-none"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] ml-6 mb-3 block">Priorità</label>
                        <div className="grid grid-cols-3 gap-3">
                          {(['Alta', 'Media', 'Bassa'] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPriorita(p)}
                              className={`py-4 px-2 rounded-xl border-4 font-black uppercase tracking-widest transition-all ${
                                priorita === p
                                  ? p === 'Alta' ? 'border-red-500 bg-red-500 text-white' :
                                    p === 'Media' ? 'border-amber-500 bg-amber-500 text-white' :
                                    'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-slate-100 bg-slate-50 text-slate-300'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || !titolo || !descrizione}
                      className="w-full py-6 bg-dark-blue text-white rounded-[1.5rem] font-black uppercase tracking-[0.3em] shadow-2xl shadow-dark-blue/30 hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-4"
                    >
                      <Send className="w-6 h-6" />
                      {isSubmitting ? 'Invio...' : 'Invia Segnalazione'}
                    </button>
                  </>
                )}
              </form>
            </motion.div>
          )}

          {subView === 'view' && (
            <motion.div
              key="view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 border-4 border-dark-blue border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-slate-500 font-bold mt-4 uppercase tracking-widest">Caricamento in corso...</p>
                </div>
              ) : feedbacks.length === 0 ? (
                <div className="bg-white rounded-[2.5rem] p-20 text-center border-4 border-dashed border-slate-100 shadow-sm">
                  <CheckCircle2 className="w-20 h-20 text-slate-100 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold uppercase tracking-widest">Nessuna segnalazione attiva</p>
                </div>
              ) : (
                feedbacks.map(f => (
                  <motion.div
                    key={f.id}
                    layout
                    className={`bg-white rounded-[1.5rem] sm:rounded-[2rem] p-6 sm:p-8 border-4 shadow-sm transition-all ${
                      f.status === 'Risolto' ? 'border-emerald-100 opacity-70' : 'border-slate-50'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.1em] flex items-center gap-2 ${
                            f.tipo === 'Bug/Errore' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {f.tipo === 'Bug/Errore' ? <AlertCircle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                            {f.tipo}
                          </span>
                          <span className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.1em] ${
                            f.priorita === 'Alta' ? 'bg-red-500 text-white' :
                            f.priorita === 'Media' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            Priorità {f.priorita}
                          </span>
                          {f.status === 'Risolto' && (
                            <span className="bg-emerald-600 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.1em] flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4" /> Risolto
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-2xl font-black text-slate-900 uppercase leading-tight mb-3">{f.titolo}</h3>
                          <p className="text-slate-600 font-bold leading-relaxed">{f.descrizione}</p>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-6 border-t border-slate-50">
                          <div className="flex items-center gap-3 text-slate-400">
                            <User className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase truncate max-w-[100px]">{f.user}</span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-400">
                            <Building className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase">{f.azienda_id}</span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase">
                              {f.createdAt?.toDate ? format(f.createdAt.toDate(), 'dd MMM yyyy', { locale: it }) : '...'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isDev && (
                        <div className="flex items-center">
                          <button
                            onClick={() => toggleStatus(f.id, f.status)}
                            className={`w-full md:w-auto p-5 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-3 ${
                              f.status === 'Aperto' 
                                ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-xl shadow-emerald-500/20' 
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {f.status === 'Aperto' ? (
                              <>
                                <CheckCircle2 className="w-5 h-5" />
                                Risolto
                              </>
                            ) : (
                              <>
                                <Clock className="w-5 h-5" />
                                Riapri
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
