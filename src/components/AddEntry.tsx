import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, fetchWithRetry, safeWaitForPendingWrites } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, getDocs, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { format, differenceInMinutes } from 'date-fns';
import { it } from 'date-fns/locale';
import { motion } from 'motion/react';
import { ChevronLeft, Send, Home, Info, AlertCircle, Users, Save, Clock, Power, CheckCircle2, LogOut } from 'lucide-react';
import { Worker, TimeEntry, ClockEvent } from '../types';
import { formatNumber, capitalizeFirst } from '../lib/format';

interface AddEntryProps {
  worker: Worker;
  onLogout?: () => void;
}

export const AddEntry: React.FC<AddEntryProps> = ({ worker, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const editingEntry = location.state?.entry as TimeEntry | undefined;
  const isClockingWorker = worker.name === 'Maurizio Grollo' || worker.name === 'Giulio Timbro';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([]);
  const [lastAction, setLastAction] = useState<ClockEvent | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    cantiere: '',
    intervento: '',
    ordinaria: '',
    straordinaria: '',
    viaggio: '',
    ferie: '',
    notes: {
      ordinaria: '',
      straordinaria: '',
      viaggio: '',
      ferie: ''
    }
  });

  useEffect(() => {
    if (isClockingWorker) {
      const today = new Date().toISOString().split('T')[0];
      const q = query(
        collection(db, 'clockEvents'),
        where('workerId', '==', worker.id),
        where('azienda_id', '==', worker.azienda_id),
        where('date', '==', today)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot || !snapshot.docs) return;
        const events: ClockEvent[] = [];
        for (const d of snapshot.docs) {
          try {
            if (!d || !d.data || typeof d.data !== 'function') continue;
            const data = d.data();
            if (!data) continue;
            events.push({ id: d.id, ...data } as ClockEvent);
          } catch (e) {
            console.error("Error mapping event in AddEntry:", e);
          }
        }
        // Sort in memory by timestamp to avoid composite index requirement
        const sortedEvents = events.sort((a, b) => {
          const timeA = a.timestamp?.seconds || 0;
          const timeB = b.timestamp?.seconds || 0;
          if (timeA !== timeB) return timeA - timeB;
          return (a.timestamp?.nanoseconds || 0) - (b.timestamp?.nanoseconds || 0);
        });
        
        setClockEvents(sortedEvents);
        if (sortedEvents.length > 0) {
          setLastAction(sortedEvents[sortedEvents.length - 1]);
        } else {
          setLastAction(null);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'clockEvents');
      });

      return () => unsubscribe();
    }
  }, [isClockingWorker, worker.id, worker.azienda_id]);

  useEffect(() => {
    if (editingEntry) {
      setFormData({
        date: editingEntry.date || new Date().toISOString().split('T')[0],
        cantiere: editingEntry.cantiere || '',
        intervento: editingEntry.intervento || '',
        ordinaria: editingEntry.ordinaria?.toString() || '',
        straordinaria: editingEntry.straordinaria?.toString() || '',
        viaggio: editingEntry.viaggio?.toString() || '',
        ferie: editingEntry.ferie?.toString() || '',
        notes: {
          ordinaria: editingEntry.notes?.ordinaria || '',
          straordinaria: editingEntry.notes?.straordinaria || '',
          viaggio: editingEntry.notes?.viaggio || '',
          ferie: editingEntry.notes?.ferie || ''
        }
      });
    }
  }, [editingEntry]);

  const calculateTotalHours = () => {
    let totalMinutes = 0;
    for (let i = 0; i < clockEvents.length; i += 2) {
      const start = clockEvents[i];
      const end = clockEvents[i + 1];
      if (start && end && start.type === 'ENTRATA' && end.type === 'USCITA') {
        const startDate = start.timestamp?.toDate?.();
        const endDate = end.timestamp?.toDate?.();
        if (startDate && endDate) {
          totalMinutes += differenceInMinutes(endDate, startDate);
        }
      }
    }
    return totalMinutes / 60;
  };

  const currentTotalHours = calculateTotalHours();

  const handleClockToggle = async () => {
    setLoading(true);
    try {
      const type = (!lastAction || lastAction.type === 'USCITA') ? 'ENTRATA' : 'USCITA';
      const eventData: any = {
        workerId: worker.id,
        azienda_id: worker.azienda_id,
        workerName: worker.name,
        type,
        timestamp: serverTimestamp(),
        date: new Date().toISOString().split('T')[0]
      };
      await addDoc(collection(db, 'clockEvents'), eventData);
      await safeWaitForPendingWrites();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'clockEvents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let ordinaria = isClockingWorker ? currentTotalHours : (parseFloat(formData.ordinaria) || 0);
      const straordinaria = isClockingWorker ? 0 : (parseFloat(formData.straordinaria) || 0);
      const viaggio = isClockingWorker ? 0 : (parseFloat(formData.viaggio) || 0);
      let ferie = isClockingWorker ? 0 : (parseFloat(formData.ferie) || 0);
      
      if (!isClockingWorker) {
        // 1. Cap ordinary hours at 8
        if (ordinaria > 8) {
          ordinaria = 8;
        }

        // 2. Auto-fill ferie if ordinary < 8 and no overtime/travel is recorded
        if (ordinaria < 8 && straordinaria === 0 && viaggio === 0) {
          ferie = 8 - ordinaria;
        }
      }

      // 3. Prevent duplicate entries for the same day for the same worker
      if (!editingEntry?.id) {
        console.log('Checking for duplicate entry:', { workerId: worker.id, date: formData.date, aziendaId: worker.azienda_id });
        const q = query(
          collection(db, 'timeEntries'),
          where('workerCode', '==', worker.id),
          where('azienda_id', '==', worker.azienda_id),
          where('date', '==', formData.date)
        );
        const querySnapshot = await fetchWithRetry(() => getDocs(q));
        if (querySnapshot && !querySnapshot.empty) {
          setError('Hai già inserito un report per questa data. Se devi fare modifiche, contatta l\'amministratore.');
          setLoading(false);
          return;
        }
      }

      const entryData: any = {
        date: formData.date,
        workerCode: worker.id,
        azienda_id: worker.azienda_id,
        workerName: worker.name || 'Dipendente Senza Nome',
        cantiere: formData.cantiere,
        intervento: formData.intervento,
        ordinaria,
        straordinaria,
        viaggio,
        ferie,
        notes: formData.notes,
        updatedAt: serverTimestamp()
      };

      if (editingEntry?.id) {
        console.log('Updating entry:', editingEntry.id);
        await updateDoc(doc(db, 'timeEntries', editingEntry.id), entryData);
      } else {
        console.log('Creating new entry for worker:', worker.id);
        entryData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'timeEntries'), entryData);
      }
      
      await safeWaitForPendingWrites();
      
      navigate('/worker/monthly');
    } catch (err: any) {
      console.error('Submit error:', err);
      setError(`Errore durante l'invio: ${err.message || 'Riprova più tardi'}`);
      handleFirestoreError(err, OperationType.WRITE, 'timeEntries');
    } finally {
      setLoading(false);
    }
  };

  const HourInput = ({ label, id, value, noteValue, onChange }: any) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
        <input
          type="number"
          step="0.5"
          value={value}
          onChange={(e) => onChange(id, e.target.value)}
          placeholder="Ore"
          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-dark-blue outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Note {label}</label>
        <input
          type="text"
          value={noteValue}
          onChange={(e) => onChange(id, e.target.value, true)}
          placeholder="Note aggiuntive..."
          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-dark-blue outline-none"
        />
      </div>
    </div>
  );

  const handleInputChange = (id: string, value: string, isNote = false) => {
    if (isNote) {
      setFormData(prev => ({
        ...prev,
        notes: { ...prev.notes, [id]: value }
      }));
    } else {
      let finalValue = value;
      // Cap ordinary hours at 8 dynamically
      if (id === 'ordinaria') {
        const num = parseFloat(value);
        if (num > 8) finalValue = '8';
      }
      setFormData(prev => ({ ...prev, [id]: finalValue }));
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between w-full mb-12">
          <div className="flex gap-4">
            <Link 
              to="/worker" 
              state={{ view: 'ore' }}
              className="flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-dark-blue text-white rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all font-black shadow-xl shadow-dark-blue/20 uppercase tracking-widest text-[10px] sm:text-xs min-w-[140px]"
            >
              INDIETRO
            </Link>
            <Link 
              to="/worker" 
              state={{ view: 'hub' }}
              className="flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-dark-blue text-white rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all font-black shadow-xl shadow-dark-blue/20 uppercase tracking-widest text-[10px] sm:text-xs min-w-[140px]"
            >
              INIZIO
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-8 sm:mb-12 gap-6 sm:gap-8">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-100 rounded-2xl sm:rounded-[2rem] flex items-center justify-center text-dark-blue overflow-hidden border-2 border-slate-200 shadow-inner shrink-0 shadow-lg">
              {worker.photoUrl ? (
                <img src={worker.photoUrl} alt={worker.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Users className="w-8 h-8 sm:w-10 sm:h-10" />
              )}
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                {editingEntry ? 'Modifica Ore' : 'Inserimento Ore'}
              </h1>
              <p className="text-slate-500 mt-1 font-medium italic text-xs sm:text-sm">Dipendente: <span className="text-dark-blue font-bold uppercase">{worker.name || 'Senza Nome'}</span></p>
            </div>
          </div>

          <div className="text-left sm:text-right w-full sm:w-auto">
            <div className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              {editingEntry ? 'Ultima Modifica' : 'DATA GIORNO'}
            </div>
            <div className="text-sm sm:text-lg font-bold text-dark-blue bg-slate-100 px-4 sm:px-6 py-2 rounded-xl sm:rounded-2xl border border-slate-200 inline-block shadow-sm">
              {capitalizeFirst(format(new Date(formData.date), 'EEEE, d MMMM yyyy', { locale: it }))}
            </div>
          </div>
        </div>

      <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-10">
        {isClockingWorker ? (
          <div className="space-y-12">
            <div className="flex flex-col items-center justify-center space-y-8 py-12 bg-white border border-slate-200 rounded-[3rem] shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-slate-100" />
              
              <div className="text-center space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">STATO ATTUALE</div>
                <div className={`px-6 py-2 rounded-full font-black text-xs tracking-widest uppercase flex items-center gap-2 ${
                  !lastAction || lastAction.type === 'USCITA' 
                  ? 'bg-slate-100 text-slate-400' 
                  : 'bg-green-100 text-green-600 animate-pulse'
                }`}>
                  <Clock className="w-3 h-3" />
                  {!lastAction || lastAction.type === 'USCITA' ? 'FUORI SERVIZIO' : 'IN SERVIZIO'}
                </div>
              </div>

              <button
                type="button"
                onClick={handleClockToggle}
                disabled={loading}
                className={`w-64 h-64 rounded-full flex flex-col items-center justify-center transition-all shadow-2xl active:scale-95 disabled:opacity-50 border-[12px] ${
                  !lastAction || lastAction.type === 'USCITA'
                  ? 'bg-green-500 border-green-600/20 text-white shadow-green-200 hover:bg-green-600'
                  : 'bg-red-500 border-red-600/20 text-white shadow-red-200 hover:bg-red-600'
                }`}
              >
                <Power className="w-16 h-16 mb-2" />
                <span className="font-black text-4xl tracking-tighter italic">
                  {!lastAction || lastAction.type === 'USCITA' ? 'ENTRATA' : 'USCITA'}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest mt-2 opacity-60">
                  Toccare per timbrare
                </span>
              </button>

              <div className="grid grid-cols-2 gap-12 w-full max-w-md border-t border-slate-100 pt-10">
                <div className="text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">OGGI</div>
                  <div className="text-3xl font-black text-slate-900 tracking-tighter">
                    {formatNumber(currentTotalHours)} <span className="text-sm font-bold text-slate-400 uppercase">ore</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">TIMBRATURE</div>
                  <div className="text-3xl font-black text-slate-900 tracking-tighter">
                    {clockEvents.length} <span className="text-sm font-bold text-slate-400 uppercase">eventi</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-100/50 p-8 rounded-[2.5rem] border border-slate-200/50 space-y-6">
              <div className="flex items-center gap-4 text-slate-400">
                <Info className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Informazioni Obbligatorie</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-2">CANTIERE</label>
                  <input
                    type="text"
                    value={formData.cantiere}
                    onChange={(e) => setFormData(prev => ({ ...prev, cantiere: e.target.value }))}
                    placeholder="es. Scorzè"
                    className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue outline-none font-bold"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-2">INTERVENTO</label>
                  <input
                    type="text"
                    value={formData.intervento}
                    onChange={(e) => setFormData(prev => ({ ...prev, intervento: e.target.value }))}
                    placeholder="Descrizione..."
                    className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue outline-none font-bold"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || currentTotalHours === 0}
                className="w-full py-6 bg-dark-blue text-white rounded-2xl font-black text-xl shadow-xl shadow-dark-blue/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-4 tracking-widest uppercase"
              >
                {loading ? 'INVIO...' : (
                  <>
                    <CheckCircle2 className="w-8 h-8" />
                    INVIA ORE GIORNALIERE
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
          <div className="space-y-1 sm:space-y-2">
            <label className="text-[10px] sm:text-xs font-bold text-slate-900 uppercase tracking-widest ml-2 leading-none">DATA REGISTRAZIONE</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-4 sm:px-6 py-3 sm:py-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl shadow-sm focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-medium text-sm sm:text-base"
              required
            />
          </div>
          <div className="space-y-1 sm:space-y-2">
            <label className="text-[10px] sm:text-xs font-bold text-slate-900 uppercase tracking-widest ml-2 leading-none">NOME CANTIERE</label>
            <div className="relative">
              <Home className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 h-5 text-slate-300" />
              <input
                type="text"
                value={formData.cantiere}
                onChange={(e) => setFormData(prev => ({ ...prev, cantiere: e.target.value }))}
                placeholder="es. San Benedetto, Scorzè"
                className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl shadow-sm focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-medium text-sm sm:text-base"
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-1 sm:space-y-2">
          <label className="text-[10px] sm:text-xs font-bold text-slate-900 uppercase tracking-widest ml-2 leading-none">DESCRIZIONE INTERVENTO</label>
          <div className="relative">
            <Info className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 h-5 text-slate-300" />
            <input
              type="text"
              value={formData.intervento}
              onChange={(e) => setFormData(prev => ({ ...prev, intervento: e.target.value }))}
              placeholder="Cosa hai fatto oggi? (opzionale)"
              className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl shadow-sm focus:ring-2 focus:ring-dark-blue focus:border-dark-blue outline-none transition-all font-medium text-sm sm:text-base"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] shadow-xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-8 py-4">
            <div className="col-span-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">TIPOLOGIA ORE</div>
            <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">QUANTITÀ</div>
            <div className="col-span-7 text-[10px] font-black text-slate-400 uppercase tracking-widest">NOTE E DETTAGLI</div>
          </div>

          <div className="divide-y divide-slate-100">
            {[
              { id: 'ordinaria', label: 'ORDINARIA' },
              { id: 'straordinaria', label: 'STRAORDINARIA' },
              { id: 'viaggio', label: 'VIAGGIO' },
              { id: 'ferie', label: 'FERIE' }
            ].map((type) => (
              <div key={type.id} className="flex flex-col sm:grid sm:grid-cols-12 px-6 sm:px-8 py-5 sm:py-6 items-start sm:items-center gap-3 sm:gap-4">
            <div className="sm:col-span-3 font-bold text-slate-900 text-xs sm:text-base">{type.label}</div>
                <div className="sm:col-span-2 min-w-[100px]">
                  <input
                    type="number"
                    step="0.5"
                    value={(formData as any)[type.id]}
                    onChange={(e) => handleInputChange(type.id, e.target.value)}
                    placeholder="0.0"
                    className="w-full sm:w-24 px-4 py-2 sm:py-3 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-center font-black text-dark-blue focus:bg-white focus:ring-2 focus:ring-dark-blue outline-none transition-all"
                  />
                </div>
                <div className="sm:col-span-7 w-full">
                  <input
                    type="text"
                    value={(formData.notes as any)[type.id]}
                    onChange={(e) => handleInputChange(type.id, e.target.value, true)}
                    placeholder="Aggiungi dettagli..."
                    className="w-full bg-transparent border-b border-slate-100 py-2 sm:py-2 px-1 focus:border-dark-blue outline-none text-slate-600 placeholder:text-slate-300 text-xs sm:text-sm italic"
                  />
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="px-6 sm:px-8 pb-4">
              <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-xl text-xs sm:text-sm border border-red-100 italic font-medium">
                <AlertCircle className="w-4 h-4 sm:w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col items-center sm:items-start">
              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">RIEPILOGO SESSIONE</span>
              <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter">
                {formatNumber(Number(formData.ordinaria) + Number(formData.straordinaria) + Number(formData.viaggio))} <span className="text-xs sm:text-lg font-bold text-slate-400 uppercase">ore totali</span>
              </span>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-5 bg-dark-blue text-white rounded-[1.25rem] sm:rounded-[1.5rem] font-bold shadow-2xl shadow-dark-blue/20 hover:bg-dark-blue-hover hover:shadow-dark-blue/40 transition-all disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-base sm:text-lg"
            >
              {loading ? 'INVIO IN CORSO...' : (
                <>
                  <Send className="w-5 h-5 sm:w-6 h-6" />
                  INVIA REPORT
                </>
              )}
            </button>
          </div>
        </div>
      </>
    )}
  </form>
</div>
);
};
