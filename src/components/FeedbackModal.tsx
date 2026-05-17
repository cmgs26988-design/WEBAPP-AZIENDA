import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Headset, AlertCircle, Sparkles, CheckCircle2, Clock } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  aziendaId: string;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, userEmail, aziendaId }) => {
  const [tipo, setTipo] = useState<'Bug/Errore' | 'Miglioria'>('Bug/Errore');
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [priorita, setPriorita] = useState<'Alta' | 'Media' | 'Bassa'>('Media');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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
      setSuccess(true);
      setTimeout(() => {
        onClose();
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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden"
        >
          <div className="bg-dark-blue p-6 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Headset className="w-6 h-6" />
              <h3 className="text-xl font-black uppercase tracking-widest">Invia Feedback</h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {success ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-12 text-center"
              >
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h4 className="text-2xl font-black text-slate-900 uppercase">Inviato!</h4>
                <p className="text-slate-500 font-bold">Grazie per la tua segnalazione.</p>
              </motion.div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setTipo('Bug/Errore')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                      tipo === 'Bug/Errore' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100 bg-slate-50 text-slate-400 opacity-60'
                    }`}
                  >
                    <AlertCircle className="w-6 h-6" />
                    <span className="text-xs font-black uppercase">Bug/Errore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('Miglioria')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                      tipo === 'Miglioria' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400 opacity-60'
                    }`}
                  >
                    <Sparkles className="w-6 h-6" />
                    <span className="text-xs font-black uppercase">Miglioria</span>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-4 mb-2 block">Titolo Segnalazione</label>
                    <input
                      required
                      value={titolo}
                      onChange={(e) => setTitolo(e.target.value)}
                      placeholder="Esempio: Errore salvataggio ore"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-dark-blue/5 focus:border-dark-blue outline-none transition-all font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-4 mb-2 block">Descrizione Dettagliata</label>
                    <textarea
                      required
                      value={descrizione}
                      onChange={(e) => setDescrizione(e.target.value)}
                      rows={4}
                      placeholder="Spiegaci meglio cosa è successo o cosa vorresti migliorare..."
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-dark-blue/5 focus:border-dark-blue outline-none transition-all font-bold resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-4 mb-2 block">Priorità</label>
                    <div className="flex gap-2">
                      {(['Alta', 'Media', 'Bassa'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriorita(p)}
                          className={`flex-1 py-3 px-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${
                            priorita === p
                              ? p === 'Alta' ? 'border-red-500 bg-red-500 text-white' :
                                p === 'Media' ? 'border-amber-500 bg-amber-500 text-white' :
                                'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-slate-100 bg-slate-50 text-slate-400'
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
                  className="w-full py-5 bg-dark-blue text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-lg shadow-dark-blue/20 hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  <Send className="w-5 h-5" />
                  {isSubmitting ? 'Invio in corso...' : 'Invia Segnalazione'}
                </button>
              </>
            )}
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
