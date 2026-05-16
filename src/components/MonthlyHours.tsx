import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, isBefore, addDays, differenceInMinutes } from 'date-fns';
import { it } from 'date-fns/locale';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, FileDown, Calendar, AlertCircle, Download, Edit2, Plus, X, Clock, Users, Trash2, Power, LogOut } from 'lucide-react';
import { Worker, TimeEntry, ClockEvent } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNumber, capitalizeFirst } from '../lib/format';

interface MonthlyHoursProps {
  worker: Worker;
  onLogout?: () => void;
}

export const MonthlyHours: React.FC<MonthlyHoursProps> = ({ worker, onLogout }) => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const isMaurizio = worker.name === 'Maurizio Grollo';
  const [canGeneratePDF, setCanGeneratePDF] = useState(false);
  const [selectedEntryDetail, setSelectedEntryDetail] = useState<TimeEntry | null>(null);
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const now = new Date();
  const currentMonthIdx = now.getMonth().toString();
  const currentYearStr = now.getFullYear().toString();
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState(currentYearStr);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2026, i, 1);
    return { value: i.toString(), label: format(d, 'MMMM', { locale: it }) };
  });

  const availableYears = [currentYearStr];
  // If it's January, we still allow seeing previous year
  if (now.getMonth() === 0) {
    availableYears.push((now.getFullYear() - 1).toString());
  }

  useEffect(() => {
    setLoading(true);
    
    // Calculate filter range based on selected month/year
    const start = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth)));
    const end = endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth)));

    // Visibility logic: Data of year 2026 is visible until Jan 31 2027.
    // On Feb 1st 2027, 2026 data is "gone".
    const currentYear = now.getFullYear();
    const visibilityStartYear = (now.getMonth() === 0) ? currentYear - 1 : currentYear;

    const q = query(
      collection(db, 'timeEntries'),
      where('workerCode', '==', worker.id),
      where('companyId', '==', worker.companyId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeEntry));
      setAllEntries(data);
      
      // Filter by selected month/year
      const filtered = data.filter(e => e.date >= format(start, 'yyyy-MM-dd') && e.date <= format(end, 'yyyy-MM-dd'));
      
      // Sort in memory by date ascending
      const sortedData = filtered.sort((a, b) => a.date.localeCompare(b.date));
      setEntries(sortedData);
      setLoading(false);
    }, async (err) => {
      setLoading(false);
      const isOffline = err.message?.includes('offline') || err.code === 'unavailable';
      if (isOffline) {
        console.warn('MonthlyHours: Firestore reports offline. Toggling network...');
        const { enableNetwork, disableNetwork } = await import('firebase/firestore');
        await disableNetwork(db).catch(() => {});
        await enableNetwork(db).catch(() => {});
      }
      handleFirestoreError(err, OperationType.GET, 'timeEntries');
    });

    let unsubscribeClock: () => void = () => {};
    if (isMaurizio) {
      const qClock = query(
        collection(db, 'clockEvents'),
        where('workerId', '==', worker.id),
        where('companyId', '==', worker.companyId)
      );
      unsubscribeClock = onSnapshot(qClock, (snapshot) => {
        const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClockEvent));
        const startDateStr = format(start, 'yyyy-MM-dd');
        const endDateStr = format(end, 'yyyy-MM-dd');
        
        // Filter and sort in memory to avoid composite index requirement
        const filteredAndSorted = events
          .filter(ev => ev.date >= startDateStr && ev.date <= endDateStr)
          .sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            if (timeA !== timeB) return timeA - timeB;
            return (a.timestamp?.nanoseconds || 0) - (b.timestamp?.nanoseconds || 0);
          });
          
        setClockEvents(filteredAndSorted);
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'clockEvents');
      });
    }

    // Check if can generate PDF: até o dia 5 do mese seguente (limit to current month only)
    const limitDate = addDays(startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)), 5);
    setCanGeneratePDF(isBefore(now, limitDate));

    return () => {
      unsubscribe();
      unsubscribeClock();
    };
  }, [worker.id, selectedMonth, selectedYear]);

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'timeEntries', id));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting entry:', err);
      handleFirestoreError(err, OperationType.DELETE, `timeEntries/${id}`);
    } finally {
      setDeleting(false);
    }
  };

  const generatePDF = async (mode: 'month' | 'year') => {
    const doc = new jsPDF();
    const creationDate = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it });

    const targetEntries = mode === 'month' 
      ? entries 
      : allEntries
          .filter(e => e.date.startsWith(selectedYear))
          .sort((a, b) => a.date.localeCompare(b.date));

    // Logo handling with aspect ratio preservation
    try {
      const logoUrl = 'https://i.ibb.co/m5GbpFJy/LOGO-LG-INOX-2025-NS-01.png';
      await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          const maxWidth = 55;
          const ratio = img.width / img.height;
          const height = maxWidth / ratio;
          doc.addImage(img, 'PNG', 14, 10, maxWidth, height);
          resolve(null);
        };
        img.onerror = () => resolve(null);
        img.src = logoUrl;
      });
    } catch (e) {
      console.warn('Could not load logo for PDF', e);
    }

    // Company Header
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.setFont('helvetica', 'bold');
    doc.text('LG INOX di Lauricella Giuseppe', 72, 18);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('Via Degli Alpini, 2/1 – 31050 Povegliano (TV)', 72, 24);
    doc.text('PI: 04733180261 | CF: LRCGPP70M06B302J | T. 0422 770758 | Mail: cmgs26988@gmail.com', 72, 28);
    
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(14, 40, 196, 40);

    const title = mode === 'month' 
      ? `Riepilogo Ore ${format(new Date(parseInt(selectedYear), parseInt(selectedMonth)), 'MMMM yyyy', { locale: it })}`
      : `Riepilogo Ore Anno ${selectedYear}`;
    
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(title, 14, 55);
    
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Dipendente: ${worker.name}`, 14, 65);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Data Creazione: ${creationDate}`, 196, 65, { align: 'right' });

    const totalOrd = targetEntries.reduce((acc, curr) => acc + (curr.ordinaria || 0), 0);
    const totalStr = targetEntries.reduce((acc, curr) => acc + (curr.straordinaria || 0), 0);
    const totalVia = targetEntries.reduce((acc, curr) => acc + (curr.viaggio || 0), 0);
    const totalFer = targetEntries.reduce((acc, curr) => acc + (curr.ferie || 0), 0);

    const tableData = isMaurizio 
      ? targetEntries.map(e => [
          format(new Date(e.date), 'dd/MM/yyyy'),
          clockEvents
            .filter(ce => ce.date === e.date)
            .sort((a, b) => {
              const timeA = a.timestamp?.toDate?.()?.getTime() || 0;
              const timeB = b.timestamp?.toDate?.()?.getTime() || 0;
              return timeA - timeB;
            })
            .map(ev => {
              const date = ev.timestamp?.toDate?.() || new Date();
              return `${ev.type}: ${format(date, 'HH:mm')}`;
            })
            .join('\n'),
          formatNumber(e.ordinaria || 0)
        ])
      : targetEntries.map(e => [
          format(new Date(e.date), 'dd/MM/yyyy'),
          e.cantiere,
          e.intervento,
          e.ordinaria ? formatNumber(e.ordinaria) : '-',
          e.straordinaria ? formatNumber(e.straordinaria) : '-',
          e.viaggio ? formatNumber(e.viaggio) : '-',
          e.ferie ? formatNumber(e.ferie) : '-'
        ]);

    autoTable(doc, {
      startY: 72,
      head: isMaurizio 
        ? [['Data', 'Dettaglio Timbrature', 'Totale Ore']]
        : [['Data', 'Cantiere', 'Intervento', 'ORD', 'STR', 'VIA', 'FER']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: isMaurizio ? {
        0: { cellWidth: 30 },
        1: { cellWidth: 100 },
        2: { cellWidth: 30, halign: 'center' }
      } : {
        0: { cellWidth: 20 },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 18;
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('Sommario Ore:', 14, finalY);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    if (isMaurizio) {
      doc.text(`Totale Ore Lavorate: ${formatNumber(totalOrd)}`, 14, finalY + 10);
    } else {
      doc.text(`Ore Ordinarie: ${formatNumber(totalOrd)}`, 14, finalY + 10);
      doc.text(`Ore Straordinarie: ${formatNumber(totalStr)}`, 14, finalY + 18);
      doc.text(`Ore Viaggio: ${formatNumber(totalVia)}`, 14, finalY + 26);
      doc.text(`Ore Ferie: ${formatNumber(totalFer)}`, 14, finalY + 34);
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    if (isMaurizio) {
      doc.text(`TOTALE GENERALE: ${formatNumber(totalOrd)}`, 14, finalY + 22);
    } else {
      doc.text(`TOTALE ORE LAVORATE (Excl. Ferie): ${formatNumber(totalOrd + totalStr + totalVia)}`, 14, finalY + 46);
    }

    const filename = mode === 'month' 
      ? `ore_${worker.name}_${selectedMonth}_${selectedYear}.pdf`
      : `ore_${worker.name}_anno_${selectedYear}.pdf`;
    
    doc.save(filename);
    setShowPdfOptions(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between w-full mb-12">
        <div className="flex gap-4">
          <Link 
            to="/worker" 
            state={{ view: 'ore' }}
            className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            INDIETRO
          </Link>
          <Link 
            to="/worker" 
            state={{ view: 'hub' }}
            className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            INIZIO
          </Link>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
        <div className="flex items-center gap-5">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Le Tue Ore</h1>
            <p className="text-slate-500 font-medium">Cronologia delle attività registrate.</p>
          </div>
        </div>
        
        {canGeneratePDF && (
          <div className="relative">
            <button
              onClick={() => setShowPdfOptions(!showPdfOptions)}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-white border border-slate-200 text-slate-800 font-bold rounded-2xl hover:shadow-xl hover:border-dark-blue/20 transition-all shadow-md group"
            >
              <Download className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
              SCARICA PDF
            </button>

            <AnimatePresence>
              {showPdfOptions && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowPdfOptions(false)}
                  />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full mt-3 right-0 w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 p-3 z-50 overflow-hidden"
                  >
                  <button 
                    onClick={() => generatePDF('month')}
                    className="w-full text-left px-6 py-4 hover:bg-slate-100 rounded-2xl transition-all group flex items-center justify-between"
                  >
                    <span className="font-extrabold text-slate-800 text-xs uppercase tracking-widest">Mese Corrente</span>
                    <FileDown className="w-4 h-4 text-dark-blue group-hover:text-dark-blue-hover" />
                  </button>
                  <div className="h-px bg-slate-100 my-1 mx-4" />
                  <button 
                    onClick={() => generatePDF('year')}
                    className="w-full text-left px-6 py-4 hover:bg-slate-100 rounded-2xl transition-all group flex items-center justify-between"
                  >
                    <span className="font-extrabold text-slate-800 text-xs uppercase tracking-widest">Anno {selectedYear}</span>
                    <FileDown className="w-4 h-4 text-dark-blue group-hover:text-dark-blue-hover" />
                  </button>
                </motion.div>
              </>
            )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200">
        <div className="p-8 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-dark-blue shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="flex gap-2">
              <select 
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-transparent font-extrabold text-slate-900 uppercase tracking-widest text-lg outline-none cursor-pointer hover:text-dark-blue transition-colors appearance-none pr-6"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '1rem' }}
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select 
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="bg-transparent font-extrabold text-slate-900 uppercase tracking-widest text-lg outline-none cursor-pointer hover:text-dark-blue transition-colors appearance-none pr-6"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '1rem' }}
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white px-4 py-2 rounded-xl border border-slate-200">
              {entries.length} {entries.length === 1 ? 'RECORD' : 'RECORDS'} TROVATI
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-32 flex justify-center">
            <div className="w-12 h-12 border-4 border-dark-blue border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-32 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-slate-200" />
            </div>
            <p className="text-slate-400 font-medium text-lg">Nessun dato registrato questo mese.</p>
            <Link to="/worker/add" className="text-dark-blue font-bold mt-4 inline-block hover:underline">Inizia a registrare ora &rarr;</Link>
          </div>
        ) : isMaurizio ? (
          <div className="space-y-8">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
                    <th className="px-8 py-5">GIORNO</th>
                    <th className="px-8 py-5">TIMBRATURE</th>
                    <th className="px-8 py-5 text-center">TOTALE ORE</th>
                    <th className="px-8 py-5 text-right">AZIONI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => {
                    const dayEvents = clockEvents.filter(ce => ce.date === entry.date);
                    return (
                      <tr key={entry.id} onClick={() => setSelectedEntryDetail(entry)} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                        <td className="px-8 py-6">
                          <div className="text-2xl font-black text-slate-900 tracking-tighter leading-none">{format(new Date(entry.date), 'dd')}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{capitalizeFirst(format(new Date(entry.date), 'EEE', { locale: it }))}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-wrap gap-2">
                            {dayEvents.map((ev, idx) => (
                              <div key={idx} className={`px-3 py-1 rounded-lg font-bold text-[10px] flex items-center gap-1.5 ${
                                ev.type === 'ENTRATA' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                              }`}>
                                <Clock className="w-3 h-3" />
                                {ev.timestamp?.toDate ? format(ev.timestamp.toDate(), 'HH:mm') : '--:--'}
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-slate-400 mt-2 font-medium italic">{entry.cantiere} - {entry.intervento}</div>
                        </td>
                        <td className="px-8 py-6 text-center font-mono font-black text-xl text-dark-blue">
                          {formatNumber(entry.ordinaria || 0)}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(entry.id!);
                            }}
                            className="p-3 bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 border border-red-100 rounded-xl transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
                  <th className="px-8 py-5">GIORNO</th>
                  <th className="px-8 py-5">CANTIERE & INTERVENTO</th>
                  <th className="px-8 py-5 text-center">ORD</th>
                  <th className="px-8 py-5 text-center">STR</th>
                  <th className="px-8 py-5 text-center">VIA</th>
                  <th className="px-8 py-5 text-center">FER</th>
                  <th className="px-8 py-5 text-center text-slate-800">TOT.</th>
                  <th className="px-8 py-5 text-right">AZIONI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr 
                    key={entry.id} 
                    onClick={() => setSelectedEntryDetail(entry)}
                    className="hover:bg-slate-50 transition-colors group cursor-pointer"
                  >
                    <td className="px-8 py-6">
                      <div className="text-2xl font-black text-slate-900 tracking-tighter leading-none">{format(new Date(entry.date), 'dd')}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{capitalizeFirst(format(new Date(entry.date), 'EEE', { locale: it }))}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="font-extrabold text-slate-800 text-lg group-hover:text-dark-blue transition-colors tracking-tight">{entry.cantiere}</div>
                      <div className="text-sm text-slate-400 mt-1 font-medium italic truncate max-w-[200px]">{entry.intervento}</div>
                    </td>
                    <td className="px-8 py-6 text-center font-mono font-black text-lg text-dark-blue">{entry.ordinaria ? formatNumber(entry.ordinaria) : '-'}</td>
                    <td className="px-8 py-6 text-center font-mono font-black text-lg text-slate-400 group-hover:text-amber-500 transition-colors">{entry.straordinaria ? formatNumber(entry.straordinaria) : '-'}</td>
                    <td className="px-8 py-6 text-center font-mono font-black text-lg text-slate-400 group-hover:text-purple-500 transition-colors">{entry.viaggio ? formatNumber(entry.viaggio) : '-'}</td>
                    <td className="px-8 py-6 text-center font-mono font-black text-lg text-slate-400 group-hover:text-green-500 transition-colors">{entry.ferie ? formatNumber(entry.ferie) : '-'}</td>
                    <td className="px-8 py-6 text-center font-mono font-black text-lg text-slate-900 bg-slate-50/30">
                      {formatNumber((entry.ordinaria || 0) + (entry.straordinaria || 0) + (entry.viaggio || 0))}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(entry.id!);
                        }}
                        className="p-3 bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 border border-red-100 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-12 flex justify-center"
      >
        <Link 
          to="/worker/add"
          className="flex items-center gap-3 px-10 py-5 bg-dark-blue text-white font-black rounded-3xl hover:bg-dark-blue-hover hover:shadow-2xl hover:shadow-dark-blue/20 transition-all shadow-xl uppercase tracking-widest text-sm group"
        >
          <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
          Inserisci Nuove Ore
        </Link>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !deleting && setDeleteConfirmId(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="bg-white w-full max-w-md p-10 rounded-[2.5rem] shadow-2xl relative z-10 border border-white/20 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mx-auto mb-6">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Conferma Eliminazione</h3>
              <p className="text-slate-500 font-medium mb-8">
                Sei sicuro di voler eliminare questa voce? Questa azione non può essere annullata.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  disabled={deleting}
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="w-full py-4 bg-red-600 text-white font-black rounded-2xl tracking-widest uppercase text-xs hover:bg-red-700 transition-all shadow-xl active:scale-95 disabled:opacity-50"
                >
                  {deleting ? 'ELIMINAZIONE...' : 'SÌ, ELIMINA'}
                </button>
                <button 
                  disabled={deleting}
                  onClick={() => setDeleteConfirmId(null)}
                  className="w-full py-4 bg-slate-100 text-slate-500 font-black rounded-2xl tracking-widest uppercase text-xs hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
                >
                  ANNULLA
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Entry Detail Modal */}
      <AnimatePresence>
        {selectedEntryDetail && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEntryDetail(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="bg-white w-full max-w-3xl p-6 sm:p-12 rounded-[2.5rem] sm:rounded-[3.5rem] shadow-2xl relative z-10 border border-white/20 overflow-hidden"
            >
              <button 
                onClick={() => setSelectedEntryDetail(null)}
                className="absolute right-4 top-4 sm:right-10 sm:top-10 text-slate-300 hover:text-slate-500 transition-colors p-2 hover:bg-slate-50 rounded-full z-20"
              >
                <X className="w-8 h-8 sm:w-10 sm:h-10" />
              </button>

              <div className="mb-8 sm:mb-12 overflow-y-auto max-h-[70vh] sm:max-h-[75vh] pr-2 sm:pr-4 custom-scrollbar">
                <div className="flex items-center gap-4 sm:gap-6 mb-8 sm:mb-10">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-100 rounded-2xl sm:rounded-3xl flex items-center justify-center text-dark-blue overflow-hidden border-2 border-slate-200 shadow-inner shrink-0">
                    {worker.photoUrl ? (
                      <img src={worker.photoUrl} alt="worker" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-8 h-8 sm:w-10 sm:h-10" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tighter uppercase leading-tight">{worker.name}</h3>
                    <div className="flex items-center gap-2 sm:gap-3 text-slate-500 font-bold text-xs uppercase mt-1">
                      <Calendar className="w-4 h-4 sm:w-5 h-5" />
                      {capitalizeFirst(format(new Date(selectedEntryDetail.date), 'EEEE d MMMM yyyy', { locale: it }))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 mb-8 sm:mb-10">
                  <div className="flex-1 bg-slate-50 p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cantiere</span>
                    <span className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight break-words">{selectedEntryDetail.cantiere}</span>
                  </div>
                  <div className="bg-dark-blue p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-2xl shadow-dark-blue/20 flex flex-col justify-center shrink-0">
                    <span className="text-[10px] sm:text-[11px] font-black text-white/60 uppercase tracking-widest block mb-1">TOTALE ORE LAVORATE</span>
                    <span className="text-2xl sm:text-3xl font-black text-white tracking-tighter uppercase whitespace-nowrap">
                      {formatNumber((selectedEntryDetail.ordinaria || 0) + (selectedEntryDetail.straordinaria || 0) + (selectedEntryDetail.viaggio || 0))} ORE
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-10">
                  <div className="text-center p-4 sm:p-6 bg-white border border-slate-100 rounded-2xl sm:rounded-3xl shadow-sm">
                    <div className="text-[9px] sm:text-[11px] font-black text-slate-900 uppercase tracking-widest mb-1 leading-none">ORDINARIA</div>
                    <div className="text-xl sm:text-2xl font-black text-dark-blue">{formatNumber(selectedEntryDetail.ordinaria || 0)}</div>
                  </div>
                  <div className="text-center p-4 sm:p-6 bg-white border border-slate-100 rounded-2xl sm:rounded-3xl shadow-sm">
                    <div className="text-[9px] sm:text-[11px] font-black text-slate-900 uppercase tracking-widest mb-1 leading-none">STRAORDIN.</div>
                    <div className="text-xl sm:text-2xl font-black text-amber-500">{formatNumber(selectedEntryDetail.straordinaria || 0)}</div>
                  </div>
                  <div className="text-center p-4 sm:p-6 bg-white border border-slate-100 rounded-2xl sm:rounded-3xl shadow-sm">
                    <div className="text-[9px] sm:text-[11px] font-black text-slate-900 uppercase tracking-widest mb-1 leading-none">VIAGGIO</div>
                    <div className="text-xl sm:text-2xl font-black text-purple-500">{formatNumber(selectedEntryDetail.viaggio || 0)}</div>
                  </div>
                  <div className="text-center p-4 sm:p-6 bg-white border border-slate-100 rounded-2xl sm:rounded-3xl shadow-sm">
                    <div className="text-[9px] sm:text-[11px] font-black text-slate-900 uppercase tracking-widest mb-1 leading-none">FERIE</div>
                    <div className="text-xl sm:text-2xl font-black text-green-500">{formatNumber(selectedEntryDetail.ferie || 0)}</div>
                  </div>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <label className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest ml-4">DESCRIZIONE INTERVENTO</label>
                  <div className="w-full p-6 sm:p-10 bg-slate-50 border border-slate-200 rounded-[2rem] sm:rounded-[3rem] text-slate-700 font-medium text-lg sm:text-xl min-h-[120px] sm:min-h-[180px] leading-relaxed whitespace-pre-wrap">
                    {selectedEntryDetail.intervento || <span className="text-slate-300 italic">Nessuna descrizione inserita.</span>}
                  </div>
                </div>

                {selectedEntryDetail.notes && Object.values(selectedEntryDetail.notes).some(v => v) && (
                  <div className="mt-8 sm:mt-10 space-y-4 sm:space-y-6">
                    <label className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest ml-4">NOTE DETTAGLIATE</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      {Object.entries(selectedEntryDetail.notes).map(([key, val]) => val && (
                        <div key={key} className="p-5 sm:p-6 bg-white border border-slate-100 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-md">
                          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest border-b border-slate-100 pb-2">{key.toUpperCase()}</span>
                          <span className="font-bold text-slate-700 text-sm sm:text-base whitespace-pre-wrap leading-snug">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:flex sm:flex-row justify-end items-center gap-3 sm:gap-4 pt-6 sm:pt-8 border-t border-slate-100">
                <button 
                  onClick={() => {
                    navigate('/worker/add', { 
                      state: { 
                        entry: {
                          cantiere: selectedEntryDetail.cantiere,
                          intervento: selectedEntryDetail.intervento,
                          date: format(new Date(), 'yyyy-MM-dd'),
                        } 
                      } 
                    });
                    setSelectedEntryDetail(null);
                  }}
                  className="px-6 sm:px-10 py-4 sm:py-5 bg-dark-blue text-white font-black rounded-2xl sm:rounded-3xl tracking-widest uppercase text-[10px] sm:text-xs hover:bg-dark-blue-hover transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 sm:gap-3 order-2 sm:order-1"
                >
                  <Plus className="w-4 h-4 sm:w-5 h-5" />
                  DUPLICA
                </button>
                <button 
                  onClick={() => {
                    navigate('/worker/add', { state: { entry: selectedEntryDetail } });
                    setSelectedEntryDetail(null);
                  }}
                  className="px-6 sm:px-10 py-4 sm:py-5 bg-dark-blue text-white font-black rounded-2xl sm:rounded-3xl tracking-widest uppercase text-[10px] sm:text-xs hover:bg-dark-blue-hover transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 sm:gap-3 order-1 sm:order-2"
                >
                  <Edit2 className="w-4 h-4 sm:w-5 h-5" />
                  MODIFICA
                </button>
                <button 
                  onClick={() => setSelectedEntryDetail(null)}
                  className="px-6 sm:px-10 py-4 sm:py-5 bg-slate-900 text-white font-black rounded-2xl sm:rounded-3xl tracking-widest uppercase text-[10px] sm:text-xs hover:bg-slate-800 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 sm:gap-3 order-3"
                >
                  <X className="w-4 h-4 sm:w-5 h-5" />
                  Chiudi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
