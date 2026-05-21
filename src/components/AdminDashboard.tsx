import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, IS_LG_ENV, DEFAULT_AZIENDA_ID, IS_TEST_PROJECT, safeWaitForPendingWrites } from '../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, getDaysInMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Calendar, Filter, Plus, Trash2, Search, 
  FileBox, Download, LogOut, ChevronRight, X, Clock,
  CheckCircle2, AlertCircle, LayoutGrid, Edit2, Smartphone,
  ShoppingCart, Truck, Check, Cylinder, ArrowLeft, Save, Lock, UserPlus, Loader2,
  Eye, EyeOff, Headset, Shirt, ShieldCheck, Stethoscope, BadgeCheck
} from 'lucide-react';
import { Worker, TimeEntry, MaterialRequest, ClockEvent } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNumber } from '../lib/format';
import { FeedbackModule } from './FeedbackModule';
import { auth } from '../lib/firebase';

const QUALIFICHE_LIST = [
  'Patentino muletto',
  'PLE',
  'Lavoro in quota',
  'Addetto primo soccorso',
  'Preposto',
  'Addetto antincendio',
  'Luoghi confinati'
];

const VESTIARIO_CONFIG = {
  scarpe: Array.from({ length: 15 }, (_, i) => (i + 36).toString()),
  pantaloni: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  giacca: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  maglia: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  guanti: Array.from({ length: 7 }, (_, i) => (i + 6).toString()),
};

const PATEN_INIZIALI = ['A', 'B', 'C', 'D', 'E', 'CQC'];

interface AdminDashboardProps {
  onLogout: () => void;
  adminAziendaId: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout, adminAziendaId }) => {
  const [activeTab, setActiveTab] = useState<'entries' | 'workers' | 'material' | 'feedback'>('entries');
  const [filterMode, setFilterMode] = useState<'dipendente' | 'mese' | 'settimana' | 'giorno'>('dipendente');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([]);
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([]);
  const [companyName, setCompanyName] = useState('OPTIME RDM');
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [siteFilter, setSiteFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // New Worker Modal
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [deleteWorkerId, setDeleteWorkerId] = useState<string | null>(null);
  const [confirmDeleteLoading, setConfirmDeleteLoading] = useState(false);
  const [selectedEntryDetail, setSelectedEntryDetail] = useState<TimeEntry | null>(null);
  const [selectedMaterialDetail, setSelectedMaterialDetail] = useState<MaterialRequest | null>(null);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerCode, setNewWorkerCode] = useState('');
  const [newWorkerPhoto, setNewWorkerPhoto] = useState('');
  const [workerFormData, setWorkerFormData] = useState<Partial<Worker>>({});
  const [submittingWorker, setSubmittingWorker] = useState(false);
  const [resetWorkerId, setResetWorkerId] = useState<string | null>(null);
  const [resettingDevice, setResettingDevice] = useState(false);
  const [visibleCodes, setVisibleCodes] = useState<Record<string, boolean>>({});
  const [showWorkerFormCode, setShowWorkerFormCode] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  // New Profile Modals
  const [showVestiarioModal, setShowVestiarioModal] = useState(false);
  const [showQualificheModal, setShowQualificheModal] = useState(false);
  const [showSicurezzaModal, setShowSicurezzaModal] = useState(false);

  // Month select options
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2026, i, 1);
    return { value: i.toString(), label: format(d, 'MMMM', { locale: it }) };
  });
  const currentMonthIdx = new Date().getMonth().toString();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  useEffect(() => {
    setLoading(true);

    // Safety timeout for loading state
    const loadTimer = setTimeout(() => {
      setLoading(false);
    }, 8000);
    
    // Real-time workers
    const workersQuery = (adminAziendaId === 'SUPERADMIN' || IS_TEST_PROJECT)
      ? collection(db, 'workers')
      : query(collection(db, 'workers'), where('azienda_id', '==', adminAziendaId));

    const unsubWorkers = onSnapshot(workersQuery, (querySnapshot) => {
      setLoading(false);
      console.log('Dati estratti per PDF (IDs):', querySnapshot?.docs?.map(d => d.id));
      if (!querySnapshot || !querySnapshot.docs) return;
      if (querySnapshot.empty) {
        setWorkers([]);
        return;
      }
      const data: Worker[] = [];
      for (const d of querySnapshot.docs) {
        try {
          if (!d || !d.data || typeof d.data !== 'function') continue;
          const docData = d.data();
          if (!docData) continue;
          data.push({ id: d.id, ...docData } as Worker);
        } catch (e) {
          console.error("Error mapping worker doc:", e);
        }
      }
      setWorkers(data);
    }, (err) => {
      setLoading(false);
      handleFirestoreError(err, OperationType.GET, 'workers');
    });

    // Real-time entries
    const entriesQuery = (adminAziendaId === 'SUPERADMIN' || IS_TEST_PROJECT)
      ? query(collection(db, 'timeEntries'))
      : query(collection(db, 'timeEntries'), where('azienda_id', '==', adminAziendaId));

    const unsubEntries = onSnapshot(entriesQuery, (querySnapshot) => {
      console.log('Dati estratti per PDF (IDs):', querySnapshot?.docs?.map(d => d.id));
      if (!querySnapshot || !querySnapshot.docs) {
        setLoading(false);
        return;
      }
      if (querySnapshot.empty) {
        setEntries([]);
        setLoading(false);
        return;
      }
      const data: TimeEntry[] = [];
      for (const d of querySnapshot.docs) {
        try {
          if (!d || !d.data || typeof d.data !== 'function') continue;
          const docData = d.data();
          if (!docData) continue;
          data.push({ id: d.id, ...docData } as TimeEntry);
        } catch (e) {
          console.error("Error mapping entry doc:", e);
        }
      }
      const sortedData = data.sort((a, b) => (a.date && b.date) ? a.date.localeCompare(b.date) : 0);
      setEntries(sortedData);
      setLoading(false);
    }, (err) => {
      setLoading(false);
      handleFirestoreError(err, OperationType.GET, 'timeEntries');
    });

    // Real-time material requests
    const materialQuery = (adminAziendaId === 'SUPERADMIN' || IS_TEST_PROJECT)
      ? collection(db, 'materialRequests')
      : query(collection(db, 'materialRequests'), where('azienda_id', '==', adminAziendaId));

    const unsubMaterial = onSnapshot(materialQuery, (querySnapshot) => {
      console.log('Dati estratti per PDF (IDs):', querySnapshot?.docs?.map(d => d.id));
      if (!querySnapshot || !querySnapshot.docs) return;
      if (querySnapshot.empty) {
        setMaterialRequests([]);
        return;
      }
      const data: MaterialRequest[] = [];
      for (const d of querySnapshot.docs) {
        try {
          if (!d || !d.data || typeof d.data !== 'function') continue;
          const docData = d.data();
          if (!docData) continue;
          data.push({ id: d.id, ...docData } as MaterialRequest);
        } catch (e) {
          console.error("Error mapping material doc:", e);
        }
      }
      // Sort in-memory to avoid requiring a composite index
      const sortedData = data.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setMaterialRequests(sortedData);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'materialRequests');
    });

    const clockQuery = (adminAziendaId === 'SUPERADMIN' || IS_TEST_PROJECT)
      ? collection(db, 'clockEvents')
      : query(collection(db, 'clockEvents'), where('azienda_id', '==', adminAziendaId));

    const unsubClock = onSnapshot(clockQuery, (querySnapshot) => {
      console.log('Dati estratti per PDF (IDs):', querySnapshot?.docs?.map(d => d.id));
      if (!querySnapshot || !querySnapshot.docs) return;
      if (querySnapshot.empty) {
        setClockEvents([]);
        return;
      }
      const data: ClockEvent[] = [];
      for (const d of querySnapshot.docs) {
        try {
          if (!d || !d.data || typeof d.data !== 'function') continue;
          const docData = d.data();
          if (!docData) continue;
          data.push({ id: d.id, ...docData } as ClockEvent);
        } catch (e) {
          console.error("Error mapping clock doc:", e);
        }
      }
      setClockEvents(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'clockEvents');
    });

    let unsubCompany = () => {};
    if (adminAziendaId && adminAziendaId !== 'SUPERADMIN') {
      unsubCompany = onSnapshot(doc(db, 'companies', adminAziendaId), (snapshot) => {
        if (snapshot && typeof snapshot.exists === 'function' && snapshot.exists() && typeof snapshot.data === 'function') {
          const data = snapshot.data();
          if (data) {
            setCompanyName(data.name || 'LG INOX');
          }
        }
      }, (err) => {
        console.error("Error fetching company name:", err);
      });
    } else {
      setCompanyName('PANNELLO SUPERADMIN');
    }

    return () => {
      clearTimeout(loadTimer);
      unsubWorkers();
      unsubEntries();
      unsubMaterial();
      unsubClock();
      unsubCompany();
    };
  }, []);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const filteredEntries = entries.filter(e => {
    if (!e || !e.date) return false;
    const isDateMatch = e.date >= dateFrom && e.date <= dateTo;
    const isSiteMatch = siteFilter && e.cantiere ? e.cantiere.toLowerCase().includes(siteFilter.toLowerCase()) : true;
    const isWorkerMatch = workerFilter && e.workerName ? e.workerName.toLowerCase().includes(workerFilter.toLowerCase()) || e.workerCode === workerFilter : true;
    return isDateMatch && isSiteMatch && isWorkerMatch;
  });

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newWorkerName.trim();
    const trimmedCode = newWorkerCode.trim().toUpperCase();

    if (!trimmedName || !trimmedCode) return;
    if (submittingWorker) return;

    // Validate alphanumeric 6 chars
    const codeRegex = /^[a-zA-Z0-9]{6}$/;
    if (!codeRegex.test(trimmedCode)) {
      alert('Il codice deve essere di esattamente 6 caratteri alfanumerici (es. AB1234).');
      return;
    }

    setSubmittingWorker(true);
    try {
      console.log('Registering/Updating worker:', trimmedCode, trimmedName);
      
      // If we are editing and the ID changed, we need to delete the old document
      if (editingWorkerId && editingWorkerId !== trimmedCode) {
        await deleteDoc(doc(db, 'workers', editingWorkerId));
      }

      const existingWorker = workers.find(w => w.id === (editingWorkerId || trimmedCode));

      // Determiniamo l'azienda_id corretto:
      // Se siamo in LG INOX, forziamo 'lg_inox'.
      // Altrimenti usiamo l'ID dell'admin, a meno che non sia SUPERADMIN (in quel caso usiamo il default di test).
      const effectiveAziendaId = IS_LG_ENV 
        ? 'lg_inox' 
        : (adminAziendaId === 'SUPERADMIN' ? DEFAULT_AZIENDA_ID : adminAziendaId);

      const workerData = { 
        id: trimmedCode,
        name: trimmedName,
        photoUrl: newWorkerPhoto.trim(),
        deviceId: existingWorker?.deviceId || '',
        azienda_id: effectiveAziendaId,
        createdAt: editingWorkerId ? existingWorker?.createdAt || new Date().toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...workerFormData
      };

      await setDoc(doc(db, "workers", trimmedCode), workerData, { merge: true });
      
      await safeWaitForPendingWrites();
      
      console.log('Worker processed successfully');
      setShowAddWorker(false);
      setEditingWorkerId(null);
      setNewWorkerName('');
      setNewWorkerCode('');
      setNewWorkerPhoto('');
      setWorkerFormData({});
      showStatus('success', editingWorkerId ? 'Dipendente aggiornato.' : 'Dipendente aggiunto!');
    } catch (error: any) {
      alert("ERRORE REALE DI SCRITTURA FIRESTORE: " + error.message);
      console.error("Firestore Save Error:", error);
    } finally {
      setSubmittingWorker(false);
    }
  };

  const handleResetDeviceId = async (id: string) => {
    setResettingDevice(true);
    try {
      await setDoc(doc(db, 'workers', id), { 
        deviceId: '' 
      }, { merge: true });
      await safeWaitForPendingWrites();
      showStatus('success', 'Dispositivo resettato con successo.');
      setResetWorkerId(null);
    } catch (err) {
      console.error('Reset device error:', err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `workers/${id}`);
      } catch (e) {
        alert('Errore durante il reset del dispositivo.');
      }
    } finally {
      setResettingDevice(false);
    }
  };

  const handleDeleteWorker = async (id: string) => {
    setConfirmDeleteLoading(true);
    try {
      await deleteDoc(doc(db, 'workers', id));
      await safeWaitForPendingWrites();
      showStatus('success', 'Dipendente eliminato.');
      setDeleteWorkerId(null);
      if (editingWorkerId === id) {
        setShowAddWorker(false);
        setEditingWorkerId(null);
      }
    } catch (err) {
      console.error('Delete worker error:', err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `workers/${id}`);
      } catch (e) {
        showStatus('error', 'Errore durante l\'eliminazione.');
      }
    } finally {
      setConfirmDeleteLoading(false);
    }
  };

  const generateReportPDF = async () => {
    if (!filteredEntries || filteredEntries.length === 0) {
      alert("Nessun dato trovato per i filtri selezionati. Impossibile generare il PDF.");
      return;
    }

    const reportEntries = [...filteredEntries].sort((a, b) => (a.date && b.date) ? a.date.localeCompare(b.date) : 0);

    const doc = new jsPDF('l', 'mm', 'a4');
    const creationDate = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it });

    // Logo handling with aspect ratio preservation
    try {
      const logoUrl = 'https://i.ibb.co/5xkbm2kh/Gemini-Generated-Image-3yyt6f3yyt6f3yyt.png';
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
    doc.text(companyName, 72, 18);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('Via Degli Alpini, 2/1 – 31050 Povegliano (TV)', 72, 24);
    doc.text('PI: 04733180261 | CF: LRCGPP70M06B302J | T. 0422 770758 | Mail: cmgs26988@gmail.com | www.lginox.it', 72, 28);
    
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(14, 40, 283, 40);

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Riepilogo Amministrativo Ore Lavorate', 14, 55);
    
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    const dateFromStr = dateFrom ? format(new Date(dateFrom), 'dd/MM/yy') : '...';
    const dateToStr = dateTo ? format(new Date(dateTo), 'dd/MM/yy') : '...';
    doc.text(`Periodo: ${dateFromStr} - ${dateToStr}`, 14, 65);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Data Creazione: ${creationDate}`, 283, 65, { align: 'right' });

    console.log('Dati estratti per PDF (Report):', reportEntries);
    console.log('Dati estratti per PDF:', reportEntries);

    const totalOrd = reportEntries.reduce((acc, curr) => acc + (curr.ordinaria || 0), 0);
    const totalStr = reportEntries.reduce((acc, curr) => acc + (curr.straordinaria || 0), 0);
    const totalVia = reportEntries.reduce((acc, curr) => acc + (curr.viaggio || 0), 0);
    const totalFer = reportEntries.reduce((acc, curr) => acc + (curr.ferie || 0), 0);
    
    const tableData = reportEntries.map(e => [
      e.workerName || 'Dipendente',
      e.date ? format(new Date(e.date), 'dd/MM/yy') : '-',
      e.cantiere || '-',
      e.intervento || '-',
      e.ordinaria ? formatNumber(e.ordinaria) : '-',
      e.straordinaria ? formatNumber(e.straordinaria) : '-',
      e.viaggio ? formatNumber(e.viaggio) : '-',
      e.ferie ? formatNumber(e.ferie) : '-'
    ]);

    autoTable(doc, {
      startY: 72,
      head: [['Dipendente', 'Data', 'Cantiere', 'Intervento', 'ORD', 'STR', 'VIA', 'FER']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold' }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 18;
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('Sommario Ore Totali del Periodo:', 14, finalY);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ore Ordinarie: ${formatNumber(totalOrd)}`, 14, finalY + 10);
    doc.text(`Ore Straordinarie: ${formatNumber(totalStr)}`, 14, finalY + 18);
    doc.text(`Ore Viaggio: ${formatNumber(totalVia)}`, 14, finalY + 26);
    doc.text(`Ore Ferie: ${formatNumber(totalFer)}`, 14, finalY + 34);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTALE GENERALE (Lavoro + Viaggio): ${formatNumber(totalOrd + totalStr + totalVia)}`, 14, finalY + 46);

    doc.save(`report_amministrativo_${dateFrom}_${dateTo}.pdf`);
  };

  const generateWorkerPDF = async (worker: Worker, targetEntries: TimeEntry[]) => {
    if (!worker || !worker.id) {
      alert("Dati dipendente non validi. Impossibile generare il PDF.");
      return;
    }
    const workerEntries = targetEntries.filter(e => e && e.workerCode === worker.id && e.date && e.date >= dateFrom && e.date <= dateTo);
    if (!workerEntries || workerEntries.length === 0) {
      alert("Nessun dato trovato per i filtri selezionati. Impossibile generare il PDF.");
      return;
    }

    const finalEntries = [...workerEntries].sort((a, b) => (a.date && b.date) ? a.date.localeCompare(b.date) : 0);

    const doc = new jsPDF();
    const creationDate = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it });

    // Logo handling with aspect ratio preservation
    try {
      const logoUrl = 'https://i.ibb.co/5xkbm2kh/Gemini-Generated-Image-3yyt6f3yyt6f3yyt.png';
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
    doc.text(companyName, 72, 18);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('Via Degli Alpini, 2/1 – 31050 Povegliano (TV)', 72, 24);
    doc.text('PI: 04733180261 | CF: LRCGPP70M06B302J | T. 0422 770758 | Mail: cmgs26988@gmail.com | www.lginox.it', 72, 28);
    
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(14, 40, 196, 40);

    const dateFromWorker = dateFrom ? format(new Date(dateFrom), 'dd/MM/yy') : '...';
    const dateToWorker = dateTo ? format(new Date(dateTo), 'dd/MM/yy') : '...';
    const title = `Riepilogo Ore ${dateFromWorker} - ${dateToWorker}`;
    
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

    console.log('Dati estratti per PDF (Worker):', finalEntries);
    console.log('Dati estratti per PDF:', finalEntries);

    const totalOrd = finalEntries.reduce((acc, curr) => acc + (curr.ordinaria || 0), 0);
    const totalStr = finalEntries.reduce((acc, curr) => acc + (curr.straordinaria || 0), 0);
    const totalVia = finalEntries.reduce((acc, curr) => acc + (curr.viaggio || 0), 0);
    const totalFer = finalEntries.reduce((acc, curr) => acc + (curr.ferie || 0), 0);

    const isClockingWorker = (name: string) => name === 'Maurizio Grollo' || name === 'Giulio Timbro';

    const tableData = isClockingWorker(worker.name)
      ? finalEntries.map(e => {
          if (!e || !e.date) return ['-', '-', '-'];
          const dayEvents = (clockEvents || [])
            .filter(ce => ce && ce.workerId === e.workerCode && ce.date === e.date)
            .sort((a, b) => {
              if (!a) return 1;
              if (!b) return -1;
              const timeA = a.timestamp?.toDate?.()?.getTime() || a.timestamp?.seconds || 0;
              const timeB = b.timestamp?.toDate?.()?.getTime() || b.timestamp?.seconds || 0;
              return timeA - timeB;
            });

          return [
            format(new Date(e.date), 'dd/MM/yyyy'),
            dayEvents
              .map(ev => {
                const date = ev?.timestamp?.toDate?.() || (ev?.timestamp?.seconds ? new Date(ev.timestamp.seconds * 1000) : new Date());
                return `${(ev && ev.type) || 'EVENTO'}: ${format(date, 'HH:mm')}`;
              })
              .join('\n'),
            formatNumber(e.ordinaria || 0)
          ];
        })
      : finalEntries.map(e => {
          if (!e || !e.date) return ['-', '-', '-', '-', '-', '-', '-'];
          return [
            format(new Date(e.date), 'dd/MM/yyyy'),
            e.cantiere || '-',
            e.intervento || '-',
            e.ordinaria ? formatNumber(e.ordinaria) : '-',
            e.straordinaria ? formatNumber(e.straordinaria) : '-',
            e.viaggio ? formatNumber(e.viaggio) : '-',
            e.ferie ? formatNumber(e.ferie) : '-'
          ];
        });

    autoTable(doc, {
      startY: 72,
      head: isClockingWorker(worker.name)
        ? [['Data', 'Dettaglio Timbrature', 'Totale Ore']]
        : [['Data', 'Cantiere', 'Intervento', 'ORD', 'STR', 'VIA', 'FER']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: isClockingWorker(worker.name) ? {
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
    doc.text('Sommario Ore Dipendente:', 14, finalY);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    if (isClockingWorker(worker.name)) {
      doc.text(`Totale Ore Lavorate: ${formatNumber(totalOrd)}`, 14, finalY + 10);
    } else {
      doc.text(`Ore Ordinarie: ${formatNumber(totalOrd)}`, 14, finalY + 10);
      doc.text(`Ore Straordinarie: ${formatNumber(totalStr)}`, 14, finalY + 18);
      doc.text(`Ore Viaggio: ${formatNumber(totalVia)}`, 14, finalY + 26);
      doc.text(`Ore Ferie: ${formatNumber(totalFer)}`, 14, finalY + 34);
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    if (isClockingWorker(worker.name)) {
      doc.text(`TOTALE GENERALE: ${formatNumber(totalOrd)}`, 14, finalY + 22);
    } else {
      doc.text(`TOTALE ORE LAVORATE (Excl. Ferie): ${formatNumber(totalOrd + totalStr + totalVia)}`, 14, finalY + 46);
    }

    doc.save(`ore_${worker.name}_report.pdf`);
  };

  const generateWorkerProfilePDF = async (worker: any) => {
    console.log('Dati estratti per PDF (Worker Profile):', worker);
    
    if (!worker) {
      alert('Nessun dato trovato per i filtri selezionati');
      return;
    }

    const pdfDoc = new jsPDF();
    
    const safeFormatDate = (dateStr: string | undefined | null) => {
      if (!dateStr) return '-';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        return format(d, 'dd/MM/yyyy');
      } catch (e) {
        return '-';
      }
    };

    const workerName = worker?.name || 'Dipendente';
    
    // Logo
    try {
      const logoUrl = 'https://i.ibb.co/5xkbm2kh/Gemini-Generated-Image-3yyt6f3yyt6f3yyt.png';
      await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        const timeout = setTimeout(() => resolve(null), 2000); // Timeout logo load
        img.onload = () => {
          clearTimeout(timeout);
          const maxWidth = 55;
          const ratio = img.width / img.height;
          const height = maxWidth / ratio;
          pdfDoc.addImage(img, 'PNG', 14, 10, maxWidth, height);
          resolve(null);
        };
        img.onerror = () => {
          clearTimeout(timeout);
          resolve(null);
        };
        img.src = logoUrl;
      });
    } catch (e) {}

    // Header
    pdfDoc.setFontSize(14);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text(companyName, 72, 18);
    pdfDoc.setFontSize(8);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text('Via Degli Alpini, 2/1 – 31050 Povegliano (TV)', 72, 23);
    pdfDoc.text('PI: 04733180261 | CF: LRCGPP70M06B302J | www.lginox.it', 72, 27);
    
    pdfDoc.line(14, 35, 196, 35);

    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('SCHEDA ANAGRAFICA DIPENDENTE', 14, 48);

    const leftCol = 14;
    const rightCol = 110;
    let y = 65;

    const addSection = (title: string, data: { label: string, value: string }[]) => {
      // Check if we need a new page
      if (y > 250) {
        pdfDoc.addPage();
        y = 30;
      }

      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(30, 41, 59);
      pdfDoc.text(title.toUpperCase(), leftCol, y);
      pdfDoc.line(leftCol, y + 2, 196, y + 2);
      y += 10;

      data.forEach((item, i) => {
        const x = i % 2 === 0 ? leftCol : rightCol;
        pdfDoc.setFontSize(8);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text(item.label + ':', x, y);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.text(String(item.value || '-'), x + 35, y);
        if (i % 2 !== 0 || i === data.length - 1) y += 6;
      });
      y += 8;
    };

    addSection('Dati Personali', [
      { label: 'NOME E COGNOME', value: workerName },
      { label: 'DATA DI NASCITA', value: safeFormatDate(worker.dataNascita) },
      { label: 'CODICE FISCALE', value: worker.codiceFiscale || '-' },
      { label: 'LUOGO NASCITA', value: '-' }
    ]);

    addSection('Inquadramento Aziendale', [
      { label: 'CODICE DIPENDENTE', value: worker.codiceDipendente || '-' },
      { label: 'MANSIONE', value: worker.mansione || '-' },
      { label: 'LIVELLO', value: worker.livelloMansione || '-' },
      { label: 'POSIZIONE INAIL', value: worker.posizioneInail || '-' },
      { label: 'RETR. O/M', value: worker.retrOM || '-' }
    ]);

    addSection('Date e Scadenze', [
      { label: 'DATA ASSUNZIONE', value: safeFormatDate(worker.dataAssunzione) },
      { label: 'DATA CESSAZIONE', value: safeFormatDate(worker.dataCessazione) },
      { label: 'FINE T. DET.', value: safeFormatDate(worker.dataFineTempoDeterminato) },
      { label: 'PROSSIMO SCATTO', value: safeFormatDate(worker.dataProssimoScatto) },
      { label: 'N. SCATTI', value: String(worker.nScatti || '-') }
    ]);

    addSection('Informazioni Riservate', [
      { label: 'EMAIL', value: worker.email || '-' },
      { label: 'CELLULARE', value: worker.cellulare || '-' },
      { label: 'IBAN', value: worker.iban || '-' },
      { label: 'RESIDENZA', value: worker.residenza || '-' },
      { label: 'CARTA IDENTITÀ', value: worker.numeroCartaIdentita || '-' }
    ]);

    if (worker.vestiario) {
      addSection('Dettaglio Vestiario', [
        { label: 'SCARPE', value: worker.vestiario.scarpe || '-' },
        { label: 'PANTALONI', value: worker.vestiario.pantaloni || '-' },
        { label: 'GIACCA', value: worker.vestiario.giacca || '-' },
        { label: 'MAGLIA', value: worker.vestiario.maglia || '-' },
        { label: 'GUANTI', value: worker.vestiario.guanti || '-' },
        { label: 'ALTRO', value: worker.vestiario.altro || '-' }
      ]);
    }

    const sicurezzaData = [
      { label: 'IDONEITÀ (VISITA)', value: safeFormatDate(worker.idoneitaSanitaria) },
      { label: 'SICUREZZA GEN.', value: safeFormatDate(worker.sicurezzaNuova?.generale) },
      { label: 'SICUREZZA SPEC.', value: safeFormatDate(worker.sicurezzaNuova?.specifica) },
      { label: 'RISCHIO ATTESTATO', value: 'RISCHIO ALTO' }
    ];
    addSection('Sicurezza e Formazione', sicurezzaData);

    const patentiStr = worker.patentiGuida?.join(', ') || '-';
    addSection('Abilitazioni e Qualifiche', [
      { label: 'PATENTI DI GUIDA', value: patentiStr }
    ]);

    if (worker.qualificheNuove && worker.qualificheNuove.some(q => q.conseguita)) {
      const qData = worker.qualificheNuove
        .filter(q => q.conseguita)
        .map(q => ({
          label: q.nome,
          value: `${q.dataConseguimento ? safeFormatDate(q.dataConseguimento) : ''} ${q.dataScadenza ? '(Scad: ' + safeFormatDate(q.dataScadenza) + ')' : ''} ${q.enteFormatore ? '[' + q.enteFormatore + ']' : ''}`.trim() || 'SI'
        }));
      addSection('Certificazioni Tecniche', qData);
    }

    pdfDoc.setFontSize(7);
    pdfDoc.setTextColor(150);
    pdfDoc.text(`Documento generato il ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 285);

    pdfDoc.save(`Scheda_Dipendente_${workerName.replace(/\s+/g, '_')}.pdf`);
  };


  const generateMonthlyGroupedPDF = async () => {
    if (!workers || workers.length === 0) {
      alert('Nessun dipendente trovato per generare il PDF.');
      return;
    }

    const safeFormatDate = (dateStr: string | undefined | null) => {
      if (!dateStr) return '-';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        return format(d, 'dd/MM/yyyy');
      } catch (e) {
        return '-';
      }
    };

    const q = (adminAziendaId === 'SUPERADMIN' || IS_TEST_PROJECT)
      ? query(collection(db, 'timeEntries'))
      : query(collection(db, 'timeEntries'), where('azienda_id', '==', adminAziendaId));

    let querySnapshot;
    try {
      querySnapshot = await getDocs(q);
    } catch (e) {
      console.error("Error fetching grouped monthly data:", e);
    }

    if (!querySnapshot || querySnapshot.empty) {
        alert("Nessun dato trovato per i filtri selezionati. Impossibile generare il PDF.");
        return;
    }

    const fetchedEntries: TimeEntry[] = [];
    for (const d of querySnapshot.docs) {
      if (d && typeof d.data === 'function') {
        try {
          const docData = d.data();
          if (docData) {
            fetchedEntries.push({ id: d.id, ...docData } as TimeEntry);
          }
        } catch (e) {
          console.error("Error mapping entry:", e);
        }
      }
    }

    const mStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth)));
    const mEnd = endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth)));
    const sStr = format(mStart, 'yyyy-MM-dd');
    const eStr = format(mEnd, 'yyyy-MM-dd');

    const monthlyEntriesAll = fetchedEntries.filter(e => e && e.date && e.date >= sStr && e.date <= eStr);

    if (monthlyEntriesAll.length === 0) {
      alert("Nessun dato trovato per i filtri selezionati. Impossibile generare il PDF.");
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4');
    const creationDate = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it });

    try {
      const logoUrl = 'https://i.ibb.co/5xkbm2kh/Gemini-Generated-Image-3yyt6f3yyt6f3yyt.png';
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

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, 72, 18);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Via Degli Alpini, 2/1 – 31050 Povegliano (TV)', 72, 24);
    doc.text('PI: 04733180261 | CF: LRCGPP70M06B302J | T. 0422 770758 | Mail: cmgs26988@gmail.com | www.lginox.it', 72, 28);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 40, 283, 40);

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Riepilogo Mensile Ore Lavorate - Tutti i Dipendenti', 14, 55);
    
    const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label || '';
    
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Periodo: ${monthLabel.toUpperCase()} ${selectedYear}`, 14, 65);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Data Creazione: ${creationDate}`, 283, 65, { align: 'right' });

    const groupedData = workers.map(w => {
      const wEntries = monthlyEntriesAll.filter(e => e.workerCode === w.id);
      return {
        worker: w,
        entries: wEntries
      };
    }).filter(g => g.entries.length > 0);

    // Calculate days in month
    const daysInMonth = getDaysInMonth(mStart);

    groupedData.forEach((group, index) => {
      if (index > 0) {
        doc.addPage();
      }

      let currentY = index === 0 ? 80 : 50;

      // Header with Logo already added at the top of the first page, 
      // but for subsequent pages we might want to re-add it or just title.
      if (index > 0) {
        // Simple header for subsequent pages
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`${companyName} - Riepilogo Mensile`, 14, 15);
        doc.line(14, 18, 283, 18);
        currentY = 25;
      }

      const worker = group.worker;
      if (!worker || !worker.name) {
        console.warn('Skipping worker without data in grouped PDF');
        return;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(worker.name.toUpperCase(), 14, currentY);
      currentY += 8;

      // Worker Details in PDF header (Request 5 & 6)
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      
      const details = [
        { label: 'COD. DIP.:', value: group.worker.codiceDipendente || '-' },
        { label: 'MANSIONE:', value: group.worker.mansione || '-' },
        { label: 'POS. INAIL:', value: group.worker.posizioneInail || '-' },
        { label: 'LIVELLO:', value: group.worker.livelloMansione || '-' },
        { label: 'COD. FISCALE:', value: group.worker.codiceFiscale || '-' },
        { label: 'DATA NASCITA:', value: safeFormatDate(group.worker.dataNascita) },
        { label: 'DATA ASSUNZIONE:', value: safeFormatDate(group.worker.dataAssunzione) },
        { label: 'DATA CESSAZIONE:', value: safeFormatDate(group.worker.dataCessazione) },
        { label: 'FINE T. DET.:', value: safeFormatDate(group.worker.dataFineTempoDeterminato) },
        { label: 'PROSSIMO SCATTO:', value: safeFormatDate(group.worker.dataProssimoScatto) },
        { label: 'N. SCATTI:', value: group.worker.nScatti || '-' },
        { label: 'RETR. O/M:', value: group.worker.retrOM || '-' }
      ];

      let xPos = 14;
      const colWidth = 65;
      const rowHeight = 5;
      
      details.forEach((detail, i) => {
        if (i > 0 && i % 4 === 0) {
          xPos = 14;
          currentY += rowHeight;
        }
        
        doc.setFont('helvetica', 'bold');
        doc.text(detail.label, xPos, currentY);
        const labelWidth = doc.getTextWidth(detail.label);
        doc.setFont('helvetica', 'normal');
        doc.text(` ${detail.value}`, xPos + labelWidth, currentY);
        xPos += colWidth;
      });
      
      currentY += 10;

      // Prepare matrix rows
      const rows = {
        O: Array(daysInMonth).fill(0),
        S: Array(daysInMonth).fill(0),
        V: Array(daysInMonth).fill(0),
        F: Array(daysInMonth).fill(0)
      };

    group.entries.forEach(e => {
      if (!e || !e.date) return;
      try {
        const day = new Date(e.date).getDate();
        if (day >= 1 && day <= daysInMonth) {
          rows.O[day - 1] += (e.ordinaria || 0);
          rows.S[day - 1] += (e.straordinaria || 0);
          rows.V[day - 1] += (e.viaggio || 0);
          rows.F[day - 1] += (e.ferie || 0);
        }
      } catch (err) {
        console.warn('Error processing entry for grouped PDF:', e, err);
      }
    });

      const totals = {
        O: rows.O.reduce((a, b) => a + b, 0),
        S: rows.S.reduce((a, b) => a + b, 0),
        V: rows.V.reduce((a, b) => a + b, 0),
        F: rows.F.reduce((a, b) => a + b, 0)
      };

      const tableBody = [
        ['O', ...rows.O.map(v => v > 0 ? formatNumber(v) : ''), formatNumber(totals.O)],
        ['S', ...rows.S.map(v => v > 0 ? formatNumber(v) : ''), formatNumber(totals.S)],
        ['V', ...rows.V.map(v => v > 0 ? formatNumber(v) : ''), formatNumber(totals.V)],
        ['F', ...rows.F.map(v => v > 0 ? formatNumber(v) : ''), formatNumber(totals.F)]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [['TIP.', ...Array.from({ length: daysInMonth }, (_, i) => {
          const d = new Date(parseInt(selectedYear), parseInt(selectedMonth), i + 1);
          const initial = format(d, 'EEEEE', { locale: it }).toUpperCase();
          return `${initial}\n${i + 1}`;
        }), 'TOT']],
        body: tableBody,
        theme: 'grid',
        styles: { 
          fontSize: 6, 
          cellPadding: 0.8, 
          halign: 'center',
          font: 'helvetica',
          valign: 'middle',
          textColor: [30, 41, 59]
        },
        headStyles: { 
          fillColor: [241, 245, 249], 
          textColor: [30, 41, 59],
          fontStyle: 'bold',
          minCellHeight: 10,
          lineWidth: 0.1,
          lineColor: [203, 213, 225]
        },
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 8 },
          [daysInMonth + 1]: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 10 }
        },
        margin: { left: 14, right: 65 }, 
        pageBreak: 'avoid'
      });

      // RISERVATO ALLO STUDIO AREA
      const studioStartX = 237;
      const studioStartY = currentY;
      const tableHeight = (doc as any).lastAutoTable.finalY - currentY;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('RISERVATO ALLO STUDIO', studioStartX, studioStartY - 2);

      autoTable(doc, {
        startY: studioStartY,
        head: [['COD.', 'TEMPO', 'IMPORTO']],
        body: [['', '', '']], 
        theme: 'grid',
        styles: { 
          fontSize: 6, 
          cellPadding: 0.8, 
          halign: 'center',
          font: 'helvetica',
          textColor: [30, 41, 59]
        },
        headStyles: { 
          fillColor: [241, 245, 249], 
          textColor: [30, 41, 59],
          fontStyle: 'bold',
          minCellHeight: 6 // Thinner header row
        },
        bodyStyles: {
          minCellHeight: tableHeight > 24 ? tableHeight - 6 : 24 
        },
        margin: { left: studioStartX },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 15 },
          2: { cellWidth: 15 }
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
      
      // Legend (Moved to stay near each table if possible, or at bottom of each page)
      if (currentY > 185) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text('LEGENDA:', 14, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text('O = ORDINARIA | S = STRAORDINARIA | V = VIAGGIO | F = FERIE/PERMESSI', 30, currentY);
      
      currentY += 10;
    });

    doc.save(`Riepilogo_Mensile_Aziendale_${monthLabel}_${selectedYear}.pdf`);
  };

  const handleFilterModeChange = (mode: 'dipendente' | 'mese' | 'settimana' | 'giorno') => {
    setFilterMode(mode);
    const today = new Date();
    
    if (mode === 'mese') {
      const month = parseInt(selectedMonth);
      const year = parseInt(selectedYear);
      const start = startOfMonth(new Date(year, month));
      const end = endOfMonth(new Date(year, month));
      setDateFrom(format(start, 'yyyy-MM-dd'));
      setDateTo(format(end, 'yyyy-MM-dd'));
    } else if (mode === 'settimana') {
      const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday
      const end = endOfWeek(today, { weekStartsOn: 1 });
      setDateFrom(format(start, 'yyyy-MM-dd'));
      setDateTo(format(end, 'yyyy-MM-dd'));
    } else if (mode === 'giorno') {
      // Default to last entry date if available
      const lastDate = entries.length > 0 ? entries[entries.length - 1].date : format(today, 'yyyy-MM-dd');
      setDateFrom(lastDate);
      setDateTo(lastDate);
    } else {
      // Return to default (dipendente view)
      setDateFrom(format(startOfMonth(today), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(today), 'yyyy-MM-dd'));
      setWorkerFilter('');
      setSelectedWorkerId(null);
    }
  };

  useEffect(() => {
    if (filterMode === 'mese') {
      const month = parseInt(selectedMonth);
      const year = parseInt(selectedYear);
      const start = startOfMonth(new Date(year, month));
      const end = endOfMonth(new Date(year, month));
      setDateFrom(format(start, 'yyyy-MM-dd'));
      setDateTo(format(end, 'yyyy-MM-dd'));
    }
  }, [selectedMonth, selectedYear, filterMode]);

  useEffect(() => {
    if (filterMode === 'settimana' || filterMode === 'giorno') {
      // In these modes, dateTo follows dateFrom adjustment (for Day it's equal, for Week we calculate end)
      if (filterMode === 'giorno') {
        setDateTo(dateFrom);
      } else if (filterMode === 'settimana') {
        const start = startOfWeek(new Date(dateFrom), { weekStartsOn: 1 });
        const end = endOfWeek(new Date(dateFrom), { weekStartsOn: 1 });
        // Since we only have one date input, we ensure it's synced
        if (dateFrom !== format(start, 'yyyy-MM-dd')) {
          setDateFrom(format(start, 'yyyy-MM-dd'));
        }
        setDateTo(format(end, 'yyyy-MM-dd'));
      }
    }
  }, [dateFrom, filterMode]);

  const handleSelectWorker = (worker: Worker) => {
    setWorkerFilter(worker.name);
    setSelectedWorkerId(worker.id);
  };

  useEffect(() => {
    if (selectedMaterialDetail && selectedMaterialDetail.id && selectedMaterialDetail.status === 'INVIATA') {
      const markAsViewed = async () => {
        try {
          await setDoc(doc(db, 'materialRequests', selectedMaterialDetail.id!), { 
            status: 'IN VERIFICA', 
            updatedAt: serverTimestamp() 
          }, { merge: true });
          await safeWaitForPendingWrites();
          // Note: we don't need to manually update local state as the onSnapshot will trigger a refresh
          // but updating local state makes it feel faster
          setSelectedMaterialDetail(prev => prev ? { ...prev, status: 'IN VERIFICA' } : null);
        } catch (err) {
          console.error("Error marking as viewed:", err);
        }
      };
      markAsViewed();
    }
  }, [selectedMaterialDetail]);

  const updateMaterialStatus = async (id: string, newStatus: string) => {
    try {
      await setDoc(doc(db, 'materialRequests', id), { 
        status: newStatus, 
        updatedAt: serverTimestamp() 
      }, { merge: true });
      await safeWaitForPendingWrites();
      setSelectedMaterialDetail(prev => prev ? { ...prev, status: newStatus as any } : null);
      showStatus('success', `Stato ordine aggiornato a: ${newStatus}`);
    } catch (err) {
      console.error("Error updating status:", err);
      showStatus('error', "Errore nell'aggiornamento dello stato");
    }
  };

  const generateMaterialRequestPDF = async (req: MaterialRequest) => {
    console.log('Dati estratti per PDF (Material Request):', req);
    
    if (!req) {
      alert('Nessun dato trovato per i filtri selezionati');
      return;
    }

    const pdfDoc = new jsPDF();
    
    // Logo
    try {
      const logoUrl = 'https://i.ibb.co/5xkbm2kh/Gemini-Generated-Image-3yyt6f3yyt6f3yyt.png';
      await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          const maxWidth = 45;
          const ratio = img.width / img.height;
          const height = maxWidth / ratio;
          pdfDoc.addImage(img, 'PNG', 14, 10, maxWidth, height);
          resolve(null);
        };
        img.onerror = () => resolve(null);
        img.src = logoUrl;
      });
    } catch (e) {}

    pdfDoc.setFontSize(14);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text(companyName, 70, 18);
    pdfDoc.setFontSize(8);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text('Via Degli Alpini, 2/1 – 31050 Povegliano (TV)', 70, 23);
    pdfDoc.text('PI: 04733180261 | CF: LRCGPP70M06B302J | www.lginox.it', 70, 27);
    
    pdfDoc.line(14, 35, 196, 35);

    pdfDoc.setFontSize(16);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('RICHIESTA MATERIALE', 14, 45);
    
    pdfDoc.setFontSize(10);
    pdfDoc.text(`ORDINE #${req.id?.slice(-4).toUpperCase()}`, 196, 45, { align: 'right' });

    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('DIPENDENTE:', 14, 55);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(req.workerName, 45, 55);

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('DATA:', 14, 60);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(format(new Date(req.date), 'dd/MM/yyyy'), 45, 60);

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('CANTIERE:', 14, 65);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(req.cantiere, 45, 65);

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('INTERVENTO:', 14, 70);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(req.intervento, 45, 70);

    autoTable(pdfDoc, {
      startY: 80,
      head: [['ARTICOLO', 'QUANTITÀ', 'UNITÀ']],
      body: req.items.map(item => [
        item.name,
        item.quantity,
        item.unit
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 9 }
    });

    const finalY = (pdfDoc as any).lastAutoTable.finalY + 20;
    pdfDoc.setFontSize(8);
    pdfDoc.text('Firma Amministrazione:', 14, finalY);
    pdfDoc.line(14, finalY + 10, 80, finalY + 10);
    
    pdfDoc.text('Firma Dipendente:', 130, finalY);
    pdfDoc.line(130, finalY + 10, 196, finalY + 10);

    pdfDoc.save(`Ordine_Materiale_${req.id?.slice(-4).toUpperCase()}.pdf`);

    console.log('Generating Material Request PDF for Request ID:', req.id);

    if (!req || !req.items || req.items.length === 0) {
      alert('Impossibile generare il PDF: la richiesta è vuota o non valida.');
      return;
    }

    // Mark as PDF generated
    try {
      await setDoc(doc(db, 'materialRequests', req.id!), { 
        pdfGenerated: true,
        updatedAt: serverTimestamp() 
      }, { merge: true });
      await safeWaitForPendingWrites();
      setSelectedMaterialDetail(prev => prev ? { ...prev, pdfGenerated: true } : null);
    } catch (err) {
      console.error("Error updating pdfGenerated status:", err);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans relative">
      {/* Floating Status Messages */}
      <AnimatePresence>
        {statusMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={`fixed top-8 left-1/2 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              statusMsg.type === 'success' ? 'bg-green-600 text-white border-green-500' : 'bg-red-600 text-white border-red-500'
            }`}
          >
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold tracking-tight">{statusMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white flex flex-col hidden lg:flex shadow-2xl z-20">
        <div className="p-8 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-dark-blue rounded-xl flex items-center justify-center text-white shadow-lg">
              <img src="https://i.ibb.co/5xkbm2kh/Gemini-Generated-Image-3yyt6f3yyt6f3yyt.png" alt="Logo" className="w-8 h-8 object-contain bg-white rounded-lg p-0.5" />
            </div>
            <h1 className="text-xl font-black tracking-tighter uppercase italic">OPTIME <span className="text-dark-blue">RDM</span></h1>
          </div>
        </div>
        <nav className="flex-1 p-6 space-y-3">
          <button 
            onClick={() => setActiveTab('entries')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 font-bold uppercase tracking-widest text-xs ${activeTab === 'entries' ? 'bg-dark-blue text-white shadow-xl shadow-dark-blue/20' : 'text-slate-400 hover:bg-white/5'}`}
          >
            <FileBox className="w-5 h-5" />
            <span>Gestione Ore</span>
          </button>
          <button 
            onClick={() => setActiveTab('workers')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 font-bold uppercase tracking-widest text-xs ${activeTab === 'workers' ? 'bg-dark-blue text-white shadow-xl shadow-dark-blue/20' : 'text-slate-400 hover:bg-white/5'}`}
          >
            <Users className="w-5 h-5" />
            <span>Gestione Dipendenti</span>
          </button>
          <button 
            onClick={() => setActiveTab('material')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 font-bold uppercase tracking-widest text-xs ${activeTab === 'material' ? 'bg-dark-blue text-white shadow-xl shadow-dark-blue/20' : 'text-slate-400 hover:bg-white/5'}`}
          >
            <ShoppingCart className="w-5 h-5" />
            <span>Ordini Materiale</span>
          </button>
          <button 
            onClick={() => setActiveTab('feedback')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 font-bold uppercase tracking-widest text-xs ${activeTab === 'feedback' ? 'bg-dark-blue text-white shadow-xl shadow-dark-blue/20' : 'text-slate-400 hover:bg-white/5'}`}
          >
            <Headset className="w-5 h-5" />
            <span>Feedback</span>
          </button>
        </nav>
        <div className="p-6 border-t border-white/5">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-4 px-5 py-4 text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded-2xl transition-all font-bold uppercase tracking-widest text-xs"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout Sistema</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-10 flex items-center justify-between shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="lg:hidden w-8 h-8 bg-dark-blue rounded-lg flex items-center justify-center text-white mr-2">
              <img src="https://i.ibb.co/5xkbm2kh/Gemini-Generated-Image-3yyt6f3yyt6f3yyt.png" alt="Logo" className="w-6 h-6 object-contain bg-white rounded-md" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {activeTab === 'entries' ? 'Monitoraggio Ore Lavorative' : activeTab === 'material' ? 'Gestione Ordini Materiale' : 'Anagrafica Dipendenti'}
            </h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end hidden md:flex text-right">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{companyName}</span>
              <span className="text-sm font-bold text-slate-700">Amministratore</span>
            </div>
          </div>
        </header>

        {/* Mobile Navbar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/5 z-[60] flex items-center justify-around p-2">
          <button 
            onClick={() => setActiveTab('entries')}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${activeTab === 'entries' ? 'text-dark-blue' : 'text-slate-500'}`}
          >
            <FileBox className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-widest">Ore</span>
          </button>
          <button 
            onClick={() => setActiveTab('workers')}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${activeTab === 'workers' ? 'text-dark-blue' : 'text-slate-500'}`}
          >
            <Users className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-widest">Staff</span>
          </button>
          <button 
            onClick={() => setActiveTab('material')}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${activeTab === 'material' ? 'text-dark-blue' : 'text-slate-500'}`}
          >
            <ShoppingCart className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-widest">Ordini</span>
          </button>
          <button 
            onClick={() => setActiveTab('feedback')}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${activeTab === 'feedback' ? 'text-dark-blue' : 'text-slate-500'}`}
          >
            <Headset className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-widest">FB</span>
          </button>
          <button 
            onClick={onLogout}
            className="flex flex-col items-center gap-1 p-3 rounded-xl text-slate-500 hover:text-red-500 transition-all"
          >
            <LogOut className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-widest">Esci</span>
          </button>
        </div>

        {/* Content Box */}
        <div className="flex-1 overflow-auto p-4 sm:p-10 pb-24 lg:pb-10 bg-slate-50/50">
          {activeTab === 'feedback' ? (
            <FeedbackModule 
              onBack={() => setActiveTab('entries')} 
              userEmail={auth.currentUser?.email || 'admin'} 
              aziendaId={adminAziendaId} 
            />
          ) : activeTab === 'entries' ? (
            <div className="space-y-8 max-w-7xl mx-auto">
              {/* Existing entries content... */}
              
              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => handleFilterModeChange('dipendente')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${filterMode === 'dipendente' ? 'bg-dark-blue text-white shadow-lg shadow-dark-blue/20' : 'bg-white text-slate-500 border border-slate-200 hover:border-dark-blue/20'}`}
                >
                  <Users className="w-4 h-4" />
                  Dipendente
                </button>
                <button 
                  onClick={() => handleFilterModeChange('mese')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${filterMode === 'mese' ? 'bg-dark-blue text-white shadow-lg shadow-dark-blue/20' : 'bg-white text-slate-500 border border-slate-200 hover:border-dark-blue/20'}`}
                >
                  <FileBox className="w-4 h-4" />
                  Mese
                </button>
                <button 
                  onClick={() => handleFilterModeChange('settimana')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${filterMode === 'settimana' ? 'bg-dark-blue text-white shadow-lg shadow-dark-blue/20' : 'bg-white text-slate-500 border border-slate-200 hover:border-dark-blue/20'}`}
                >
                  <Calendar className="w-4 h-4" />
                  Settimana
                </button>
                <button 
                  onClick={() => handleFilterModeChange('giorno')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${filterMode === 'giorno' ? 'bg-dark-blue text-white shadow-lg shadow-dark-blue/20' : 'bg-white text-slate-500 border border-slate-200 hover:border-dark-blue/20'}`}
                >
                  <Clock className="w-4 h-4" />
                  Giorno
                </button>

                {(filterMode === 'mese' || filterMode === 'dipendente') && (
                   <button 
                    onClick={generateMonthlyGroupedPDF}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold tracking-widest text-xs uppercase ml-auto"
                  >
                    <Download className="w-4 h-4" />
                    PDF MENSILE
                  </button>
                )}
              </div>

              {/* Workers List View (Default) */}
              {filterMode === 'dipendente' && !selectedWorkerId && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {workers.map(w => (
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      key={w.id}
                      onClick={() => handleSelectWorker(w)}
                      className="bg-white p-6 rounded-[2rem] shadow-lg border border-slate-100 flex items-center gap-4 text-left hover:border-dark-blue/20 transition-all group cursor-pointer focus-visible:ring-2 focus-visible:ring-dark-blue"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectWorker(w);
                        }
                      }}
                    >
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-dark-blue overflow-hidden border border-slate-200 shrink-0">
                        {w.photoUrl ? (
                          <img src={w.photoUrl} alt={w.name} className="w-full h-full object-cover" />
                        ) : (
                          <Users className="w-6 h-6" />
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-black text-slate-900 text-sm uppercase flex flex-col leading-tight">
                          {w.name.split(' ').map((part, i) => (
                            <span key={i}>{part}</span>
                          ))}
                        </div>
                        <div className="text-[10px] font-mono text-dark-blue font-bold flex items-center gap-1.5 mt-0.5">
                          <span>{visibleCodes[w.id] ? `#${w.id}` : '******'}</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid selecting the card when clicking the eye icon
                              setVisibleCodes(prev => ({ ...prev, [w.id]: !prev[w.id] }));
                            }}
                            className="p-0.5 hover:bg-slate-100 rounded-md transition-all text-slate-400 hover:text-dark-blue"
                            title={visibleCodes[w.id] ? 'Nascondi codice' : 'Mostra codice'}
                          >
                            {visibleCodes[w.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {workers.length === 0 && !loading && (
                    <div className="col-span-full p-20 text-center bg-white rounded-[2rem] border border-dashed border-slate-200">
                      <Users className="w-20 h-20 text-slate-100 mx-auto mb-4" />
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Nessun dipendente trovato nel database</p>
                    </div>
                  )}
                </div>
              )}

              {/* Filters Panel */}
              {(filterMode !== 'dipendente' || selectedWorkerId) && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                  {filterMode === 'dipendente' && selectedWorkerId && (
                    <div className="flex items-center justify-between bg-white p-4 px-8 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-dark-blue overflow-hidden">
                          {workers.find(w => w.id === selectedWorkerId)?.photoUrl ? (
                            <img src={workers.find(w => w.id === selectedWorkerId)?.photoUrl} alt="worker" className="w-full h-full object-cover" />
                          ) : (
                            <Users className="w-5 h-5" />
                          )}
                        </div>
                        <span className="font-extrabold text-slate-800 uppercase tracking-tight">{companyName}: {workerFilter}</span>
                      </div>
                      <button 
                        onClick={() => setSelectedWorkerId(null)}
                        className="text-dark-blue hover:text-dark-blue-hover text-xs font-black uppercase tracking-widest flex items-center gap-2 px-4 py-2 hover:bg-slate-100 rounded-xl transition-all"
                      >
                        <X className="w-4 h-4" />
                        CAMBIA DIPENDENTE
                      </button>
                    </div>
                  )}

                  <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    {filterMode === 'dipendente' ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">DATA INIZIO</label>
                          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-dark-blue outline-none" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">DATA FINE</label>
                          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-dark-blue outline-none" />
                        </div>
                      </>
                    ) : filterMode === 'mese' ? (
                      <div className="md:col-span-2 grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">MESE</label>
                          <select 
                            value={selectedMonth} 
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-dark-blue outline-none appearance-none cursor-pointer uppercase"
                          >
                            {monthOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">ANNO</label>
                          <select 
                             value={selectedYear}
                             onChange={e => setSelectedYear(e.target.value)}
                             className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-dark-blue outline-none appearance-none cursor-pointer"
                          >
                            <option value="2024">2024</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
                          {filterMode === 'settimana' ? 'SETTIMANA (Scegli un giorno)' : 'DATA'}
                        </label>
                        <div className="relative group">
                          <input 
                            type="date" 
                            value={dateFrom} 
                            onChange={e => setDateFrom(e.target.value)} 
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-dark-blue outline-none uppercase cursor-pointer" 
                          />
                          {filterMode === 'settimana' && (
                            <div className="absolute right-12 top-1/2 -translate-y-1/2 bg-dark-blue text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-xl pointer-events-none uppercase tracking-tighter flex items-center gap-2">
                              <Calendar className="w-3 h-3" />
                              Settimana {format(new Date(dateFrom), 'w', { locale: it })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">CANTIERE</label>
                      <input type="text" value={siteFilter} onChange={e => setSiteFilter(e.target.value)} placeholder="Tutti i cantieri..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-dark-blue outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">RICERCA DIPENDENTE</label>
                      <input type="text" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)} placeholder="Nome o ID..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-dark-blue outline-none" />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-8 py-5">DIPENDENTE</th>
                            <th className="px-8 py-5">DATA</th>
                            <th className="px-8 py-5">CANTIERE / INTERVENTO</th>
                            <th className="px-8 py-5 text-center">ORD</th>
                            <th className="px-8 py-5 text-center">STR</th>
                            <th className="px-8 py-5 text-center">VIA</th>
                            <th className="px-8 py-5 text-center">FER</th>
                            <th className="px-8 py-5 text-center text-slate-800">TOT.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredEntries.map(e => (
                            <tr 
                              key={e.id} 
                              onClick={() => setSelectedEntryDetail(e)}
                              className="hover:bg-slate-50 transition-colors group cursor-pointer"
                            >
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-dark-blue font-bold text-xs uppercase overflow-hidden border border-slate-200">
                                    {workers.find(w => w.id === e.workerCode)?.photoUrl ? (
                                      <img 
                                        src={workers.find(w => w.id === e.workerCode)?.photoUrl} 
                                        alt={e.workerName} 
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      e.workerName.charAt(0)
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-extrabold text-slate-800 text-sm">{e.workerName}</div>
                                    <div className="text-[10px] font-mono text-slate-400 uppercase">ID: {e.workerCode}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-slate-500 text-xs font-bold uppercase tracking-tighter">{format(new Date(e.date), 'dd MMM yyyy', { locale: it })}</td>
                              <td className="px-8 py-6">
                                <div className="text-slate-800 font-bold text-xs tracking-tight">{e.cantiere}</div>
                                <div className="text-[10px] text-slate-400 font-medium italic mt-0.5">{e.intervento}</div>
                              </td>
                              <td className="px-8 py-6 text-center font-black text-dark-blue">{e.ordinaria ? formatNumber(e.ordinaria) : '-'}</td>
                              <td className="px-8 py-6 text-center font-black text-slate-400 group-hover:text-amber-500 transition-colors">{e.straordinaria ? formatNumber(e.straordinaria) : '-'}</td>
                              <td className="px-8 py-6 text-center font-black text-slate-400 group-hover:text-purple-500 transition-colors">{e.viaggio ? formatNumber(e.viaggio) : '-'}</td>
                              <td className="px-8 py-6 text-center font-black text-slate-400 group-hover:text-green-500 transition-colors">{e.ferie ? formatNumber(e.ferie) : '-'}</td>
                              <td className="px-8 py-6 text-center font-black text-slate-900 bg-slate-50/50">
                                {formatNumber((e.ordinaria || 0) + (e.straordinaria || 0) + (e.viaggio || 0))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {filteredEntries.length === 0 && (
                      <div className="p-20 text-center space-y-4">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto border border-dashed border-slate-200">
                          <Filter className="w-10 h-10" />
                        </div>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Nessuna registrazione trovata per questi filtri</p>
                      </div>
                    )}
                  </div>

                  {/* PDF Export Button at the bottom right */}
                  {filteredEntries.length > 0 && (
                    <div className="flex justify-end mt-4">
                      <button 
                        onClick={() => {
                          if (filterMode === 'dipendente' && selectedWorkerId) {
                            const worker = workers.find(w => w.id === selectedWorkerId);
                            if (worker) {
                              generateWorkerPDF(worker, filteredEntries);
                            } else {
                              alert("Errore: Dipendente selezionato non trovato nei registri per creare il PDF.");
                            }
                          } else {
                            generateReportPDF();
                          }
                        }}
                        className="flex items-center gap-3 px-8 py-4 bg-dark-blue text-white rounded-2xl hover:bg-dark-blue-hover hover:scale-[1.02] active:scale-[0.98] transition-all font-black shadow-xl shadow-dark-blue/20 uppercase tracking-widest text-sm"
                      >
                        <Download className="w-5 h-5" />
                        CREA PDF
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'material' ? (
            <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {materialRequests.map(req => (
                  <motion.div 
                    layout
                    key={req.id}
                    onClick={() => setSelectedMaterialDetail(req)}
                    className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 hover:border-dark-blue/20 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${req.status === 'INVIATA' ? 'bg-blue-600 shadow-blue-200' : req.status === 'pending' ? 'bg-amber-500 shadow-amber-200' : req.status === 'ready' ? 'bg-green-500 shadow-green-200' : (req.status === 'IN VERIFICA' ? 'bg-amber-500 shadow-amber-200' : 'bg-slate-400')}`}>
                          <Cylinder className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ORDINE #{req.id?.slice(-4).toUpperCase()}</span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${req.status === 'INVIATA' ? 'bg-blue-100 text-blue-600' : req.status === 'IN VERIFICA' ? 'bg-amber-100 text-amber-600' : req.status === 'APPROVATA' ? 'bg-emerald-100 text-emerald-600' : (req.status === 'RIFIUTATA' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600')}`}>
                        {req.status === 'INVIATA' ? 'NUOVO' : req.status === 'IN VERIFICA' ? 'IN VERIFICA' : req.status === 'APPROVATA' ? 'APPROVATA' : req.status === 'RIFIUTATA' ? 'RIFIUTATA' : 'RICEVUTO'}
                      </span>
                    </div>
                    
                    <h3 className="text-xl font-black text-slate-800 leading-tight mb-2 group-hover:text-dark-blue transition-colors">{req.cantiere}</h3>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-4">{req.intervento}</p>
                    
                    <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-dark-blue font-bold text-[10px] overflow-hidden">
                        {workers.find(w => w.id === req.workerId)?.photoUrl ? (
                          <img src={workers.find(w => w.id === req.workerId)?.photoUrl} alt="worker" className="w-full h-full object-cover" />
                        ) : (
                          req.workerName.charAt(0)
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-tight leading-none">RICHIESTO DA</div>
                        <div className="text-xs font-extrabold text-slate-700">{req.workerName}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-tight leading-none">DATA</div>
                        <div className="text-xs font-extrabold text-slate-700">
                          {req.date ? format(new Date(req.date), 'dd/MM/yy') : '-'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                
                {materialRequests.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200">
                    <ShoppingCart className="w-20 h-20 text-slate-100 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Nessuna richiesta materiale presente</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-8 max-w-7xl mx-auto">
              <div className="flex justify-between items-center bg-white p-8 rounded-[2rem] shadow-xl border border-slate-200">
                <div>
                  <h3 id="dipendenti-list-title" className="text-3xl font-extrabold text-slate-900 tracking-tight">Elenco Dipendenti</h3>
                  <p className="text-slate-500 font-medium mt-1">Gestisci i codici univoci di accesso dipendenti.</p>
                </div>
                <button 
                  id="add-employee-button"
                  onClick={() => {
                    setEditingWorkerId(null);
                    setNewWorkerName('');
                    setNewWorkerCode('');
                    setNewWorkerPhoto('');
                    setShowAddWorker(true);
                  }}
                  className="flex items-center gap-3 px-8 py-4 bg-dark-blue text-white rounded-2xl hover:bg-dark-blue-hover hover:scale-[1.02] active:scale-[0.98] transition-all font-black uppercase tracking-widest text-sm shadow-xl shadow-dark-blue/20"
                >
                  <Plus className="w-5 h-5" />
                  AGGIUNGI DIPENDENTE
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {workers.map(w => (
                  <motion.div 
                    layout
                    key={w.id} 
                    className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 group hover:border-dark-blue/20 transition-all relative"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-dark-blue overflow-hidden border-2 border-slate-200 shadow-inner shrink-0">
                          {w.photoUrl ? (
                            <img src={w.photoUrl} alt={w.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Users className="w-7 h-7" />
                          )}
                        </div>
                        <div className="font-black text-slate-900 text-lg leading-tight tracking-tight uppercase flex flex-col">
                          {w.name.split(' ').map((part, i) => (
                            <span key={i}>{part}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => setResetWorkerId(w.id)}
                          className="p-3 text-slate-200 hover:text-amber-500 hover:bg-amber-50 transition-all rounded-xl"
                          title="Reset Dispositivo"
                        >
                          <Smartphone className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => {
                  setEditingWorkerId(w.id);
                  setNewWorkerName(w.name);
                  setNewWorkerCode(w.id);
                  setNewWorkerPhoto(w.photoUrl || '');
                  const { id: _, name: __, photoUrl: ___, deviceId: ____, createdAt: _____, updatedAt: ______, ...rest } = w;
                  setWorkerFormData(rest);
                  setShowAddWorker(true);
                          }}
                          className="p-3 text-slate-200 hover:text-dark-blue hover:bg-slate-100 transition-all rounded-xl"
                          title="Modifica Dipendente"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => setDeleteWorkerId(w.id)}
                          className="p-3 text-slate-200 hover:text-red-500 hover:bg-red-50 transition-all rounded-xl"
                          title="Elimina Dipendente"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 group-hover:bg-dark-blue group-hover:text-white group-hover:border-dark-blue transition-all">CODICE ACCESSO</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-dark-blue font-mono">
                          {visibleCodes[w.id] ? `#${w.id}` : '******'}
                        </span>
                        <button 
                          onClick={() => setVisibleCodes(prev => ({ ...prev, [w.id]: !prev[w.id] }))}
                          className="p-1 hover:bg-slate-100 rounded-md transition-all text-slate-400 hover:text-dark-blue"
                        >
                          {visibleCodes[w.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal for adding worker */}
      <AnimatePresence>
        {deleteWorkerId && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !confirmDeleteLoading && setDeleteWorkerId(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="bg-white w-full max-w-md p-12 rounded-[3.5rem] shadow-2xl relative z-10 border border-white/20 text-center"
            >
              <div className="w-24 h-24 bg-red-50 rounded-[2rem] flex items-center justify-center text-red-500 mx-auto mb-8 shadow-inner border border-red-100">
                <Trash2 className="w-12 h-12" />
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight mb-3 uppercase italic">Elimina Profilo</h3>
              <p className="text-slate-500 font-medium mb-10 leading-relaxed">
                Stai per eliminare definitivamente il profilo di <span className="font-black text-slate-900">{workers.find(w => w.id === deleteWorkerId)?.name}</span>. 
                <br /><br />
                Tutti i dati anagrafici verranno rimossi. Questa operazione non è reversibile. Confermi?
              </p>
              <div className="flex flex-col gap-4">
                <button 
                  disabled={confirmDeleteLoading}
                  onClick={() => handleDeleteWorker(deleteWorkerId)}
                  className="w-full py-6 bg-red-600 text-white font-black rounded-2xl tracking-widest uppercase text-sm hover:bg-red-700 transition-all shadow-xl shadow-red-200 active:scale-95 disabled:opacity-50"
                >
                  {confirmDeleteLoading ? 'ELIMINAZIONE...' : 'SÌ, ELIMINA DEFINITIVAMENTE'}
                </button>
                <button 
                  disabled={confirmDeleteLoading}
                  onClick={() => setDeleteWorkerId(null)}
                  className="w-full py-6 bg-slate-100 text-slate-500 font-black rounded-2xl tracking-widest uppercase text-sm hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
                >
                  ANNULLA
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {resetWorkerId && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !resettingDevice && setResetWorkerId(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="bg-white w-full max-w-md p-12 rounded-[3.5rem] shadow-2xl relative z-10 border border-white/20 text-center"
            >
              <div className="w-24 h-24 bg-red-50 rounded-[2rem] flex items-center justify-center text-red-500 mx-auto mb-8 shadow-inner border border-red-100">
                <Smartphone className="w-12 h-12" />
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight mb-3 uppercase italic">Reset Dispositivo</h3>
              <p className="text-slate-500 font-medium mb-10 leading-relaxed">
                Stai per resettare l'associazione dispositivo per <span className="font-black text-slate-900">{workers.find(w => w.id === resetWorkerId)?.name}</span>. 
                <br /><br />
                Il dipendente potrà collegarsi con un nuovo dispositivo al prossimo accesso. Confermi?
              </p>
              <div className="flex flex-col gap-4">
                <button 
                  disabled={resettingDevice}
                  onClick={() => handleResetDeviceId(resetWorkerId)}
                  className="w-full py-6 bg-red-600 text-white font-black rounded-2xl tracking-widest uppercase text-sm hover:bg-red-700 transition-all shadow-xl shadow-red-200 active:scale-95 disabled:opacity-50"
                >
                  {resettingDevice ? 'RESET IN CORSO...' : 'SÌ, RESETTA DISPOSITIVO'}
                </button>
                <button 
                  disabled={resettingDevice}
                  onClick={() => setResetWorkerId(null)}
                  className="w-full py-6 bg-slate-100 text-slate-500 font-black rounded-2xl tracking-widest uppercase text-sm hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
                >
                  ANNULLA
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Worker Full-Screen Dashboard */}
      <AnimatePresence>
        {showAddWorker && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 bg-slate-50 flex flex-col"
          >
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between sticky top-0 z-10 shadow-sm">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    setShowAddWorker(false);
                    setEditingWorkerId(null);
                    setNewWorkerName('');
                    setNewWorkerCode('');
                    setNewWorkerPhoto('');
                    setWorkerFormData({});
                  }}
                  className="p-3 text-slate-400 hover:text-dark-blue hover:bg-slate-50 transition-all rounded-xl"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                    {editingWorkerId ? 'MODIFICA PROFILO DIPENDENTE' : 'REGISTRAZIONE NUOVO DIPENDENTE'}
                  </h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                    Anagrafica completa e dati amministrativi riservati
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {editingWorkerId && (
                  <button 
                    onClick={() => setDeleteWorkerId(editingWorkerId)}
                    className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all font-bold tracking-widest text-xs uppercase"
                    title="Elimina Profilo"
                  >
                    <Trash2 className="w-4 h-4" />
                    ELIMINA PROFILO
                  </button>
                )}
                {editingWorkerId && (
                  <button 
                    onClick={() => {
                      const currentWorker = workers.find(w => w.id === editingWorkerId)!;
                      generateWorkerProfilePDF({
                        ...currentWorker,
                        ...workerFormData,
                        name: newWorkerName,
                        id: editingWorkerId!
                      });
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all font-bold tracking-widest text-xs uppercase"
                  >
                    <Download className="w-4 h-4" />
                    SCARICA PDF ANAGRAFICA
                  </button>
                )}
                <button 
                  onClick={() => {
                    setShowAddWorker(false);
                    setEditingWorkerId(null);
                    setNewWorkerName('');
                    setNewWorkerCode('');
                    setNewWorkerPhoto('');
                    setWorkerFormData({});
                  }}
                  className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
                >
                  ANNULLA
                </button>
                <button 
                  onClick={() => {
                    const form = document.getElementById('worker-form') as HTMLFormElement;
                    form?.requestSubmit();
                  }}
                  disabled={submittingWorker}
                  className="px-10 py-4 bg-dark-blue text-white rounded-2xl font-black shadow-2xl shadow-blue-200 hover:scale-[1.03] active:scale-[0.97] transition-all flex items-center gap-3 disabled:opacity-50"
                >
                  {submittingWorker ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      {editingWorkerId ? 'SALVA MODIFICHE' : 'COMPLETA REGISTRAZIONE'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-50/50">
              <form id="worker-form" onSubmit={handleAddWorker} className="max-w-7xl mx-auto space-y-12 pb-20">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  
                  {/* Public Information Section */}
                  <div className="bg-white p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-8">
                    <div className="flex items-center gap-4 pb-4 border-b border-slate-50">
                      <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-dark-blue">
                        <Users className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Profilo Operativo & Anagrafica</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NOME E COGNOME</label>
                        <input type="text" value={newWorkerName} onChange={e => setNewWorkerName(e.target.value)} placeholder="Esempio: Mario Rossi" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-dark-blue/5 focus:border-dark-blue outline-none transition-all font-bold text-lg" required />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CODICE ACCESSO (6 CIFRE)</label>
                        <div className="relative">
                          <input 
                            type={showWorkerFormCode ? "text" : "password"} 
                            value={newWorkerCode} 
                            onChange={e => setNewWorkerCode(e.target.value.toUpperCase())} 
                            placeholder="AB1234" 
                            maxLength={6} 
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-dark-blue/5 focus:border-dark-blue outline-none transition-all font-mono font-bold tracking-[0.2em] text-lg pr-14" 
                            required 
                          />
                          <button 
                            type="button"
                            onClick={() => setShowWorkerFormCode(!showWorkerFormCode)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400"
                          >
                            {showWorkerFormCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CODICE DIPENDENTE AZIENDALE</label>
                        <input type="text" value={workerFormData.codiceDipendente || ''} onChange={e => setWorkerFormData({...workerFormData, codiceDipendente: e.target.value})} placeholder="P-001" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-dark-blue/5 focus:border-dark-blue outline-none transition-all font-bold text-lg" />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CODICE FISCALE</label>
                        <input type="text" value={workerFormData.codiceFiscale || ''} onChange={e => setWorkerFormData({...workerFormData, codiceFiscale: e.target.value.toUpperCase()})} placeholder="RSSMRA..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-dark-blue/5 focus:border-dark-blue outline-none transition-all font-mono font-bold text-lg" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DATA DI NASCITA</label>
                        <input type="date" value={workerFormData.dataNascita || ''} onChange={e => setWorkerFormData({...workerFormData, dataNascita: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-dark-blue/5" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DATA DI ASSUNZIONE</label>
                        <input type="date" value={workerFormData.dataAssunzione || ''} onChange={e => setWorkerFormData({...workerFormData, dataAssunzione: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-dark-blue/5" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MANSIONE</label>
                        <input type="text" value={workerFormData.mansione || ''} onChange={e => setWorkerFormData({...workerFormData, mansione: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">LIVELLO</label>
                        <input type="text" value={workerFormData.livelloMansione || ''} onChange={e => setWorkerFormData({...workerFormData, livelloMansione: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">POSIZIONE INAIL</label>
                        <input type="text" value={workerFormData.posizioneInail || ''} onChange={e => setWorkerFormData({...workerFormData, posizioneInail: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">RETR. O/M</label>
                        <input type="text" value={workerFormData.retrOM || ''} onChange={e => setWorkerFormData({...workerFormData, retrOM: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NUMERO SCATTI</label>
                        <input type="text" value={workerFormData.nScatti || ''} onChange={e => setWorkerFormData({...workerFormData, nScatti: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">PROSSIMO SCATTO</label>
                        <input type="date" value={workerFormData.dataProssimoScatto || ''} onChange={e => setWorkerFormData({...workerFormData, dataProssimoScatto: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">FINE TEMPO DETERMINATO</label>
                        <input type="date" value={workerFormData.dataFineTempoDeterminato || ''} onChange={e => setWorkerFormData({...workerFormData, dataFineTempoDeterminato: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DATA CESSAZIONE</label>
                        <input type="date" value={workerFormData.dataCessazione || ''} onChange={e => setWorkerFormData({...workerFormData, dataCessazione: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl" />
                      </div>
                    </div>
                  </div>

                  {/* Private / Admin Information Section */}
                  <div className="bg-white p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-8">
                    <div className="flex items-center gap-4 pb-4 border-b border-slate-50">
                      <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                        <Lock className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Informazioni Amministrative Riservate</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">CELLULARE CONTATTO</label>
                        <input type="text" value={workerFormData.cellulare || ''} onChange={e => setWorkerFormData({...workerFormData, cellulare: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all font-bold" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">INDIRIZZO E-MAIL</label>
                        <input type="email" value={workerFormData.email || ''} onChange={e => setWorkerFormData({...workerFormData, email: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all font-bold" />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">IBAN PER ACCREDITO</label>
                        <input type="text" value={workerFormData.iban || ''} onChange={e => setWorkerFormData({...workerFormData, iban: e.target.value.toUpperCase()})} placeholder="IT..." className="w-full px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all font-mono font-bold text-lg tracking-tighter" />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">RESIDENZA COMPLETA</label>
                        <input type="text" value={workerFormData.residenza || ''} onChange={e => setWorkerFormData({...workerFormData, residenza: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">VESTIARIO</label>
                        <button 
                          type="button"
                          onClick={() => setShowVestiarioModal(true)}
                          className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl hover:bg-red-50 transition-all font-bold group"
                        >
                          <span className="text-slate-700">GESTISCI TAGLIE</span>
                          <Shirt className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">N. CARTA IDENTITÀ</label>
                        <input type="text" value={workerFormData.numeroCartaIdentita || ''} onChange={e => setWorkerFormData({...workerFormData, numeroCartaIdentita: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">QUALIFICHE TECNICHE / PATENTI</label>
                        <button 
                          type="button"
                          onClick={() => setShowQualificheModal(true)}
                          className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl hover:bg-red-50 transition-all font-bold group"
                        >
                          <span className="text-slate-700">GESTISCI QUALIFICHE E PATENTI</span>
                          <BadgeCheck className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">IDONEITÀ SANITARIA (ULTIMA VISITA)</label>
                        <input type="date" value={workerFormData.idoneitaSanitaria || ''} onChange={e => setWorkerFormData({...workerFormData, idoneitaSanitaria: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">FORMAZIONE SICUREZZA</label>
                        <button 
                          type="button"
                          onClick={() => setShowSicurezzaModal(true)}
                          className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl hover:bg-red-50 transition-all font-bold group"
                        >
                          <span className="text-slate-700">GESTISCI FORMAZIONE</span>
                          <ShieldCheck className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform" />
                        </button>
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-red-600">URL FOTO PROFILO</label>
                        <input type="text" value={newWorkerPhoto} onChange={e => setNewWorkerPhoto(e.target.value)} placeholder="https://..." className="w-full px-5 py-4 bg-slate-50 border border-red-100 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all" />
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entry Detail Modal */}
      <AnimatePresence>
        {selectedMaterialDetail && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMaterialDetail(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="bg-white w-full max-w-2xl p-6 sm:p-10 rounded-[2.5rem] shadow-2xl relative z-10 border border-white/20 overflow-hidden"
            >
              <button 
                onClick={() => setSelectedMaterialDetail(null)}
                className="absolute right-6 top-6 text-slate-300 hover:text-slate-500 p-2"
              >
                <X className="w-8 h-8" />
              </button>

              <div className="mb-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-dark-blue overflow-hidden border-2 border-slate-200">
                    <Cylinder className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">{selectedMaterialDetail.cantiere}</h3>
                    <p className="text-slate-500 font-bold text-xs uppercase mt-1">{selectedMaterialDetail.intervento}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">RICHIESTO DA</span>
                    <span className="text-base font-bold text-slate-800">{selectedMaterialDetail.workerName}</span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">DATA RICHIESTA</span>
                    <span className="text-base font-bold text-slate-800">{format(new Date(selectedMaterialDetail.date), 'dd/MM/yyyy')}</span>
                  </div>
                </div>

                <div className="space-y-2 mb-8">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">LISTA MATERIALE</label>
                  <div className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
                          <th className="px-6 py-3">ARTICOLO</th>
                          <th className="px-6 py-3 text-right">QUANTITÀ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedMaterialDetail.items.map((item, idx) => (
                          <tr key={idx} className="text-sm font-bold text-slate-700">
                            <td className="px-6 py-3">
                              {item.name}
                              <div className="text-[10px] text-slate-400 uppercase">{item.category}</div>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <span className="text-dark-blue font-black text-base">{item.quantity}</span>
                              <span className="text-[10px] text-slate-400 ml-1">{item.unit}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center justify-between ml-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GESTIONE STATO</label>
                    <button 
                      onClick={() => generateMaterialRequestPDF(selectedMaterialDetail)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-all font-bold text-[10px] uppercase tracking-tighter"
                    >
                      <Download className="w-3.5 h-3.5" />
                      SCARICA LISTA PDF
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'IN VERIFICA', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200' },
                      { id: 'APPROVATA', color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200' },
                      { id: 'RIFIUTATA', color: 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' },
                      { id: 'IN ORDINE', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200' },
                      { id: 'CONSEGNATA', color: 'bg-slate-800 text-white hover:bg-slate-900 border-slate-900' }
                    ].map(st => (
                      <button
                        key={st.id}
                        onClick={() => updateMaterialStatus(selectedMaterialDetail.id!, st.id)}
                        className={`py-3 px-2 rounded-xl font-black uppercase text-[10px] tracking-tight border transition-all ${
                          selectedMaterialDetail.status === st.id 
                          ? 'ring-2 ring-offset-2 ring-dark-blue ' + st.color.split(' hover')[0]
                          : st.color
                        }`}
                      >
                        {st.id}
                      </button>
                    ))}
                    <button 
                      onClick={async () => {
                        if (!selectedMaterialDetail.pdfGenerated) {
                          alert('Per eliminare la lista devi prima generare il PDF.');
                          return;
                        }
                        if (confirm('Eliminare definitivamente questa richiesta materiale?')) {
                          try {
                            await deleteDoc(doc(db, 'materialRequests', selectedMaterialDetail.id!));
                            setSelectedMaterialDetail(null);
                            showStatus('success', 'Lista eliminata.');
                          } catch (err) {
                            showStatus('error', "Errore nell'eliminazione");
                          }
                        }
                      }}
                      className={`py-3 px-2 rounded-xl border font-black uppercase text-[10px] tracking-tight transition-all flex items-center justify-center gap-2 ${
                        selectedMaterialDetail.pdfGenerated 
                        ? 'bg-white text-red-600 border-red-200 hover:bg-red-50' 
                        : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-50'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      ELIMINA
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t border-slate-100">
                <button 
                  onClick={() => setSelectedMaterialDetail(null)}
                  className="px-8 py-4 bg-slate-100 text-slate-500 font-black rounded-xl uppercase text-[10px] tracking-widest"
                >
                  CHIUDI
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
              className="bg-white w-full max-w-2xl p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-2xl relative z-10 border border-white/20 overflow-hidden"
            >
              <button 
                onClick={() => setSelectedEntryDetail(null)}
                className="absolute right-4 top-4 sm:right-8 sm:top-8 text-slate-300 hover:text-slate-500 transition-colors p-2 hover:bg-slate-50 rounded-full z-20"
              >
                <X className="w-8 h-8" />
              </button>

              <div className="mb-6 sm:mb-10 overflow-auto max-h-[70vh] pr-2 sm:pr-4 custom-scrollbar">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-dark-blue overflow-hidden border-2 border-slate-200 shadow-inner shrink-0">
                    {workers.find(w => w.id === selectedEntryDetail.workerCode)?.photoUrl ? (
                      <img src={workers.find(w => w.id === selectedEntryDetail.workerCode)?.photoUrl} alt="worker" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-6 h-6 sm:w-8 sm:h-8" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">{selectedEntryDetail.workerName}</h3>
                    <div className="flex items-center gap-2 text-dark-blue font-bold text-[10px] sm:text-xs uppercase mt-1">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(selectedEntryDetail.date), 'EEEE d MMMM yyyy', { locale: it })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 mb-8">
                  <div className="flex-1 bg-slate-50 p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">CANTIERE</span>
                    <span className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight break-words">{selectedEntryDetail.cantiere}</span>
                  </div>
                  <div className="bg-dark-blue p-5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl shadow-dark-blue/20 flex flex-col justify-center shrink-0">
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest block mb-1">TOTALE ORE LAVORATE</span>
                    <span className="text-xl sm:text-2xl font-black text-white tracking-tighter uppercase whitespace-nowrap">
                      {formatNumber((selectedEntryDetail.ordinaria || 0) + (selectedEntryDetail.straordinaria || 0) + (selectedEntryDetail.viaggio || 0))} ORE
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
                  <div className="text-center p-3 sm:p-4 bg-white border border-slate-100 rounded-xl sm:rounded-2xl">
                    <div className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">ORD</div>
                    <div className="text-lg font-black text-dark-blue">{formatNumber(selectedEntryDetail.ordinaria || 0)}</div>
                  </div>
                  <div className="text-center p-3 sm:p-4 bg-white border border-slate-100 rounded-xl sm:rounded-2xl">
                    <div className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">STR</div>
                    <div className="text-lg font-black text-amber-500">{formatNumber(selectedEntryDetail.straordinaria || 0)}</div>
                  </div>
                  <div className="text-center p-3 sm:p-4 bg-white border border-slate-100 rounded-xl sm:rounded-2xl">
                    <div className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">VIA</div>
                    <div className="text-lg font-black text-purple-500">{formatNumber(selectedEntryDetail.viaggio || 0)}</div>
                  </div>
                  <div className="text-center p-3 sm:p-4 bg-white border border-slate-100 rounded-xl sm:rounded-2xl">
                    <div className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">FER</div>
                    <div className="text-lg font-black text-green-500">{formatNumber(selectedEntryDetail.ferie || 0)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">DESCRIZIONE INTERVENTO</label>
                  <div className="w-full p-6 sm:p-8 bg-slate-50 border border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] text-slate-700 font-medium text-base sm:text-lg min-h-[120px] sm:min-h-[150px] leading-relaxed whitespace-pre-wrap">
                    {selectedEntryDetail.intervento || <span className="text-slate-300 italic text-sm">Nessuna descrizione inserita.</span>}
                  </div>
                </div>

                {(selectedEntryDetail.workerName === 'Maurizio Grollo' || selectedEntryDetail.workerName === 'Giulio Timbro') && (
                  <div className="mt-8 space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">TIMBRATURE EFFETTUATE</label>
                    <div className="flex flex-wrap gap-2">
                      {(clockEvents || [])
                        .filter(ce => ce && ce.workerId === selectedEntryDetail.workerCode && ce.date === selectedEntryDetail.date)
                        .sort((a, b) => {
                          if (!a) return 1;
                          if (!b) return -1;
                          const timeA = a.timestamp?.toDate?.()?.getTime() || 0;
                          const timeB = b.timestamp?.toDate?.()?.getTime() || 0;
                          return timeA - timeB;
                        })
                        .map((ev, idx) => (
                          <div key={idx} className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 ${
                            ev && ev.type === 'ENTRATA' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'
                          }`}>
                            <Clock className="w-4 h-4" />
                            {ev && ev.type}: {ev?.timestamp?.toDate ? format(ev.timestamp.toDate(), 'HH:mm') : '--:--'}
                          </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEntryDetail.notes && Object.values(selectedEntryDetail.notes).some(v => v) && (
                  <div className="mt-6 sm:mt-8 space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">NOTE DETTAGLIATE ORE</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(selectedEntryDetail.notes).map(([key, val]) => val && (
                        <div key={key} className="p-4 sm:p-5 bg-white border border-slate-100 rounded-[1.25rem] sm:rounded-3xl shadow-sm">
                          <span className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest border-b border-slate-100 pb-1">{key}</span>
                          <span className="font-bold text-slate-700 text-xs sm:text-sm whitespace-pre-wrap leading-tight">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 sm:pt-6 border-t border-slate-100">
                <button 
                  onClick={() => setSelectedEntryDetail(null)}
                  className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-slate-900 text-white font-black rounded-xl sm:rounded-2xl tracking-widest uppercase text-[10px] sm:text-xs hover:bg-slate-800 transition-all shadow-xl active:scale-95"
                >
                  Chiudi Dettaglio
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Vestiario Modal */}
      <AnimatePresence>
        {showVestiarioModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVestiarioModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="bg-white w-full max-w-lg p-10 rounded-[3.5rem] shadow-2xl relative z-10 border border-white/20"
            >
              <div className="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                  <Shirt className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Vestiario</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taglie per ogni indumento</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-10">
                {['scarpe', 'pantaloni', 'giacca', 'maglia', 'guanti', 'altro'].map((item) => (
                  <div key={item} className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{item}</label>
                    {item === 'altro' ? (
                      <input 
                        type="text" 
                        value={workerFormData.vestiario?.[item as keyof typeof workerFormData.vestiario] || ''} 
                        onChange={e => setWorkerFormData({
                          ...workerFormData,
                          vestiario: {
                            ...(workerFormData.vestiario || {}),
                            [item]: e.target.value
                          }
                        })}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all font-bold"
                      />
                    ) : (
                      <select
                        value={workerFormData.vestiario?.[item as keyof typeof VESTIARIO_CONFIG] || ''}
                        onChange={e => setWorkerFormData({
                          ...workerFormData,
                          vestiario: {
                            ...(workerFormData.vestiario || {}),
                            [item]: e.target.value
                          }
                        })}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all font-bold appearance-none"
                      >
                        <option value="">SELEZIONA</option>
                        {VESTIARIO_CONFIG[item as keyof typeof VESTIARIO_CONFIG].map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setShowVestiarioModal(false)}
                className="w-full py-6 bg-dark-blue text-white font-black rounded-2xl tracking-widest uppercase text-sm hover:scale-[1.02] shadow-xl shadow-blue-200 transition-all active:scale-98"
              >
                CONFERMA E CHIUDI
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Qualifiche Modal */}
      <AnimatePresence>
        {showQualificheModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQualificheModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="bg-white w-full max-w-5xl p-10 rounded-[3.5rem] shadow-2xl relative z-10 border border-white/20"
            >
              <div className="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                  <BadgeCheck className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Qualifiche Tecniche / Patenti</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Abilitazioni e scadenze</p>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto pr-4 mb-10 space-y-8 custom-scrollbar">
                {/* PATENTI DI GUIDA SECTION */}
                <div className="p-8 bg-red-50/30 rounded-[2.5rem] border border-red-100/50">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                      <Smartphone className="w-5 h-5 rotate-90" />
                    </div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">PATENTI DI GUIDA</h4>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {PATEN_INIZIALI.map(lit => (
                      <label key={lit} className="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl border border-slate-200 cursor-pointer hover:bg-red-50 transition-all select-none">
                        <input 
                          type="checkbox"
                          checked={workerFormData.patentiGuida?.includes(lit) || false}
                          onChange={e => {
                            const current = [...(workerFormData.patentiGuida || [])];
                            if (e.target.checked) {
                              if (!current.includes(lit)) current.push(lit);
                            } else {
                              const idx = current.indexOf(lit);
                              if (idx >= 0) current.splice(idx, 1);
                            }
                            setWorkerFormData({ ...workerFormData, patentiGuida: current });
                          }}
                          className="w-6 h-6 appearance-none border-2 border-slate-300 rounded-lg checked:bg-red-600 checked:border-red-600 transition-all cursor-pointer"
                        />
                        <span className={`text-lg font-black ${workerFormData.patentiGuida?.includes(lit) ? 'text-red-600' : 'text-slate-400'}`}>{lit}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {QUALIFICHE_LIST.map((qName) => {
                    const q = workerFormData.qualificheNuove?.find(item => item.nome === qName) || { nome: qName, conseguita: false };
                    return (
                      <div key={qName} className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end p-6 bg-slate-50 rounded-[2rem] border border-slate-200/50 hover:bg-slate-100/50 transition-all">
                        <div className="md:col-span-3 border-r border-slate-200/50 pr-4">
                          <label className="flex items-center gap-4 cursor-pointer group">
                            <div className="relative">
                              <input 
                                type="checkbox" 
                                checked={q.conseguita} 
                                onChange={e => {
                                  const current = [...(workerFormData.qualificheNuove || [])];
                                  const idx = current.findIndex(item => item.nome === qName);
                                  if (idx >= 0) {
                                    current[idx] = { ...current[idx], conseguita: e.target.checked };
                                  } else {
                                    current.push({ nome: qName, conseguita: e.target.checked });
                                  }
                                  setWorkerFormData({ ...workerFormData, qualificheNuove: current });
                                }}
                                className="w-7 h-7 appearance-none border-2 border-slate-300 rounded-lg checked:bg-red-600 checked:border-red-600 transition-all cursor-pointer"
                              />
                              {q.conseguita && <Check className="w-4 h-4 text-white absolute top-1.5 left-1.5 pointer-events-none" />}
                            </div>
                            <span className={`text-xs font-black uppercase tracking-tight transition-all ${q.conseguita ? 'text-slate-900 scale-110' : 'text-slate-400'}`}>
                              {qName}
                            </span>
                          </label>
                        </div>
                        
                        <div className="md:col-span-3 space-y-1.5">
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">DATA CONSEGUIMENTO</label>
                          <input 
                            type="date" 
                            value={q.dataConseguimento || ''} 
                            onChange={e => {
                              const current = [...(workerFormData.qualificheNuove || [])];
                              const idx = current.findIndex(item => item.nome === qName);
                              if (idx >= 0) {
                                current[idx] = { ...current[idx], dataConseguimento: e.target.value };
                              } else {
                                current.push({ nome: qName, conseguita: false, dataConseguimento: e.target.value });
                              }
                              setWorkerFormData({ ...workerFormData, qualificheNuove: current });
                            }}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-500/5 outline-none font-bold text-xs"
                          />
                        </div>

                        <div className="md:col-span-3 space-y-1.5">
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">DATA SCADENZA</label>
                          <input 
                            type="date" 
                            value={q.dataScadenza || ''} 
                            onChange={e => {
                              const current = [...(workerFormData.qualificheNuove || [])];
                              const idx = current.findIndex(item => item.nome === qName);
                              if (idx >= 0) {
                                current[idx] = { ...current[idx], dataScadenza: e.target.value };
                              } else {
                                current.push({ nome: qName, conseguita: false, dataScadenza: e.target.value });
                              }
                              setWorkerFormData({ ...workerFormData, qualificheNuove: current });
                            }}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-500/5 outline-none font-bold text-xs"
                          />
                        </div>

                        <div className="md:col-span-3 space-y-1.5">
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">ENTE FORMATORE</label>
                          <input 
                            type="text" 
                            placeholder="..."
                            value={q.enteFormatore || ''} 
                            onChange={e => {
                              const current = [...(workerFormData.qualificheNuove || [])];
                              const idx = current.findIndex(item => item.nome === qName);
                              if (idx >= 0) {
                                current[idx] = { ...current[idx], enteFormatore: e.target.value };
                              } else {
                                current.push({ nome: qName, conseguita: false, enteFormatore: e.target.value });
                              }
                              setWorkerFormData({ ...workerFormData, qualificheNuove: current });
                            }}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-500/5 outline-none font-bold text-xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button 
                onClick={() => setShowQualificheModal(false)}
                className="w-full py-6 bg-dark-blue text-white font-black rounded-2xl tracking-widest uppercase text-sm hover:scale-[1.02] shadow-xl shadow-blue-200 transition-all active:scale-98"
              >
                CONFERMA E CHIUDI
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sicurezza Modal */}
      <AnimatePresence>
        {showSicurezzaModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSicurezzaModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="bg-white w-full max-w-lg p-10 rounded-[3.5rem] shadow-2xl relative z-10 border border-white/20"
            >
              <div className="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Formazione Sicurezza</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Corsi obbligatori</p>
                </div>
              </div>

              <div className="space-y-8 mb-10">
                <div className="mb-4">
                  <h4 className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1 italic">CORSI OBBLIGATORI - RISCHIO ALTO</h4>
                </div>

                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200/50 space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-800 uppercase tracking-tight italic">Parte Generale</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 font-black px-3 py-1.5 rounded-lg uppercase tracking-widest">Senza Scadenza</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DATA SVOLGIMENTO</label>
                    <input 
                      type="date" 
                      value={workerFormData.sicurezzaNuova?.generale || ''} 
                      onChange={e => setWorkerFormData({
                        ...workerFormData,
                        sicurezzaNuova: {
                          ...(workerFormData.sicurezzaNuova || {}),
                          generale: e.target.value
                        }
                      })}
                      className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-red-500/5 outline-none font-bold"
                    />
                  </div>
                </div>

                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200/50 space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-800 uppercase tracking-tight italic">Parte Specifica</span>
                    <span className="text-[9px] bg-red-100 text-red-700 font-black px-3 py-1.5 rounded-lg uppercase tracking-widest text-center">Aggiornamento ogni 5 anni</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DATA ULTIMO AGGIORNAMENTO</label>
                    <input 
                      type="date" 
                      value={workerFormData.sicurezzaNuova?.specifica || ''} 
                      onChange={e => setWorkerFormData({
                        ...workerFormData,
                        sicurezzaNuova: {
                          ...(workerFormData.sicurezzaNuova || {}),
                          specifica: e.target.value
                        }
                      })}
                      className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-red-500/5 outline-none font-bold"
                    />
                  </div>
                  {workerFormData.sicurezzaNuova?.specifica && (
                    <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-100 text-red-600 font-black uppercase text-[10px] tracking-tight">
                      <Calendar className="w-5 h-5 shrink-0" />
                      <div>
                        PROSSIMO AGGIORNAMENTO ENTRO:
                        <div className="text-sm font-black mt-0.5">
                          {format(new Date(new Date(workerFormData.sicurezzaNuova.specifica).setFullYear(new Date(workerFormData.sicurezzaNuova.specifica).getFullYear() + 5)), 'dd/MM/yyyy')}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={() => setShowSicurezzaModal(false)}
                className="w-full py-6 bg-dark-blue text-white font-black rounded-2xl tracking-widest uppercase text-sm hover:scale-[1.02] shadow-xl shadow-blue-200 transition-all active:scale-98"
              >
                CONFERMA E CHIUDI
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
