import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, fetchWithRetry, IS_TEST_PROJECT } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Send, Home, Info, Search, 
  Plus, Minus, Trash2, Check, Cylinder, Wrench,
  ClipboardList, ListPlus, ArrowRight,
  History, Clock, LogOut
} from 'lucide-react';
import { Worker, MaterialRequest as MaterialRequestType, MaterialRequestItem } from '../types';
import { MATERIAL_CATEGORIES, MATERIAL_DATA, ALL_MATERIALS, PIPE_SIZES } from '../data/materials';

interface MaterialRequestProps {
  worker: Worker;
  onBack?: () => void;
  onLogout?: () => void;
}

export const MaterialRequest: React.FC<MaterialRequestProps> = ({ worker, onBack, onLogout }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0: Hub, 1: Form, 2: Selection, 3: Recap, 4: Success, 5: List
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRequests, setLastRequests] = useState<MaterialRequestType[]>([]);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [currentRequestStatus, setCurrentRequestStatus] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    cantiere: '',
    intervento: '',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [itemSpecs, setItemSpecs] = useState({ 
    measure: '', 
    quantity: 1,
    diameter: '21,3',
    diameter2: '17,2',
    thickness: '2mm',
    material: 'AISI 304L',
    angle: '90°',
    reductionType: 'CONCENTRICA',
    teeType: 'NORMALE', // 'NORMALE' | 'RIDOTTO'
    isSboccato: false,
    joiningType: 'MANDRINARE' as 'SALDARE' | 'MANDRINARE',
    lucidoJoiningType: 'MANDRINARE' as 'MANDRINARE' | 'PARITUBO' | 'MEDIO' | 'GROSSA',
    lucidoProcess: 'FORGIATO' as 'MICROFUSO' | 'FORGIATO',
    lucidoGasketMaterial: 'EPDM' as 'EPDM' | 'PTFE' | 'NBR' | 'VITON',
    lucidoGirellaMaterial: 'AISI 304L' as 'AISI 304L' | 'AISI 316L',
    height: '',
    pn: 'PN10',
    flangeProcess: 'EN 1092-1',
    schedula: '10S',
    radiusType: 'L.R.',
  });

  // When selecting specialized opaco, lucido, vapore or flange items, set initial state
  useEffect(() => {
    const isLucido = selectedItem?.category === 'LUCIDO' || selectedItem?.id?.startsWith('lucido-');
    const isOpaco = selectedItem?.category === 'OPACO' || selectedItem?.id?.startsWith('opaco-');
    const isVapore = selectedItem?.category === 'VAPORE' || selectedItem?.id?.startsWith('vapore-');
    const isFlange = selectedItem?.category === 'FLANGE' || selectedItem?.id?.startsWith('flangia-');
    const isSpecialized = isLucido || isOpaco || isVapore || isFlange;

    if (selectedItem?.id === 'opaco-collare' || selectedItem?.id === 'lucido-collare' || selectedItem?.id === 'vapore-collare') {
      const isLucido = selectedItem?.category === 'LUCIDO' || selectedItem?.id?.startsWith('lucido-');
      const isVapore = selectedItem?.category === 'VAPORE' || selectedItem?.id?.startsWith('vapore-');
      setItemSpecs(prev => ({ 
        ...prev, 
        diameter: isLucido ? '28' : (isVapore ? '21,3' : '21,3'),
        material: isLucido ? 'AISI 316L' : (isVapore ? 'AISI 316L' : 'AISI 304'),
        quantity: 1 
      }));
    } else if (selectedItem?.id === 'opaco-tubo' || selectedItem?.id === 'lucido-tubo' || selectedItem?.id === 'vapore-tubo') {
      const isLucido = selectedItem?.category === 'LUCIDO' || selectedItem?.id?.startsWith('lucido-');
      const isVapore = selectedItem?.category === 'VAPORE' || selectedItem?.id?.startsWith('vapore-');
      setItemSpecs(prev => ({ 
        ...prev, 
        diameter: isLucido ? '28' : '21,3',
        material: isLucido ? 'AISI 316L' : (isVapore ? 'AISI 316L' : 'AISI 304L'),
        quantity: 6,
        thickness: isVapore ? 'SCH. 10S' : prev.thickness,
        schedula: isVapore ? '10S' : prev.schedula
      }));
    } else if (isSpecialized && selectedItem) {
      const normalizedDiam = isLucido ? '28' : '21,3';
      const normalizedDiam2 = isLucido ? '18' : '17,2';
      
      setItemSpecs(prev => {
        let newSpecs = { 
          ...prev, 
          quantity: 1, 
          material: isLucido ? 'AISI 316L' : (isVapore ? 'AISI 316L' : 'AISI 304L'),
          schedula: isVapore ? '10S' : prev.schedula,
          radiusType: isVapore ? 'L.R.' : prev.radiusType
        };
        
        // Default process for connections
        if (isLucido && (selectedItem.id.includes('-femmina') || selectedItem.id.includes('-maschio') || selectedItem.id.includes('-girella') || selectedItem.id.includes('-bocchettone') || selectedItem.id.includes('-cieca'))) {
          newSpecs.lucidoProcess = 'FORGIATO';
          if (selectedItem.id.includes('-bocchettone')) {
            newSpecs.lucidoGirellaMaterial = 'AISI 304L';
            newSpecs.lucidoGasketMaterial = 'EPDM';
          }
        }

        if (isLucido && (selectedItem.id.includes('-curva') || selectedItem.id.includes('-riduzione'))) {
          newSpecs.joiningType = 'MANDRINARE';
        }

        if (isLucido && selectedItem.id.includes('-guarnizione')) {
          newSpecs.lucidoGasketMaterial = 'EPDM';
        }
        
        // General defaults when entering an item or changing tee type
        if (!prev.diameter || prev.diameter === '21,3' || (isLucido && !LUCIDO_SIZES.includes(prev.diameter))) {
           newSpecs.diameter = normalizedDiam;
        }
        if (isLucido && !LUCIDO_SIZES.includes(newSpecs.diameter2)) {
           newSpecs.diameter2 = normalizedDiam2;
        }

        // Specific constraints check
        const val = parseFloat(newSpecs.diameter.replace(',', '.'));
        const isTee = selectedItem.id.includes('-tee');
        const isFondo = selectedItem.id.includes('-fondo');
        const isRiduzione = selectedItem.id.includes('-riduzione');

        if (isLucido) {
          const val = parseFloat(newSpecs.diameter.replace(',', '.'));
          // For LUCIDO Tee, diameter starts from 22
          if (isTee && val < 22) newSpecs.diameter = '28';
          
          const valTarget = parseFloat(newSpecs.diameter.replace(',', '.'));
          const thick = valTarget <= 53 ? '1,5mm' : '2mm';
          newSpecs.thickness = thick;
        } else {
          const val = parseFloat(newSpecs.diameter.replace(',', '.'));
          if (isTee || isFondo) {
            if (val < 13.7) newSpecs.diameter = normalizedDiam;
          } else if (isRiduzione) {
            if (val < 17.2) newSpecs.diameter = normalizedDiam;
            const val2 = parseFloat(newSpecs.diameter2.replace(',', '.'));
            if (val2 < 13.7) newSpecs.diameter2 = normalizedDiam2;
          }
        }

        if (isRiduzione || (isTee && newSpecs.teeType === 'RIDOTTO')) {
          newSpecs.reductionType = 'CONCENTRICA';
        }

        return newSpecs;
      });
    }
  }, [selectedItem, itemSpecs.teeType]);

  // Ensure thickness is valid when diameter changes for Specialized tubo and curva
  useEffect(() => {
      const isTubo = selectedItem?.id?.includes('-tubo');
      const isCurva = selectedItem?.id?.includes('-curva');
      const isFondo = selectedItem?.id?.includes('-fondo');
      const isRiduzione = selectedItem?.id?.includes('-riduzione');
      const isLucido = selectedItem?.category === 'LUCIDO' || selectedItem?.id?.startsWith('lucido-');
      const isVapore = selectedItem?.category === 'VAPORE' || selectedItem?.id?.startsWith('vapore-');

        if (isLucido) {
          const val = parseFloat(itemSpecs.diameter.replace(',', '.'));
          const thick = val <= 53 ? '1,5mm' : '2mm';
          if (itemSpecs.thickness !== thick) {
            setItemSpecs(prev => ({ ...prev, thickness: thick }));
          }
          
          return;
        }

        if (isVapore) {
          const thick = `SCH. ${itemSpecs.schedula}`;
          if (itemSpecs.thickness !== thick) {
            setItemSpecs(prev => ({ ...prev, thickness: thick }));
          }
          return;
        }

      if (isTubo) {
        const normalizedDiam = itemSpecs.diameter.replace('.', ',');
        let allowed: string[] = [];
        
        if (TUBO_DIAMS_THIN.includes(normalizedDiam)) {
          allowed = ['1mm', '1,5mm'];
        } else {
          allowed = ['1mm', '1,5mm', '2mm', '3mm', '4mm'];
        }
        
        if (!allowed.includes(itemSpecs.thickness)) {
          // If current thickness not allowed, try to default to 2mm if allowed, else first allowed
          const defaultThick = allowed.includes('2mm') ? '2mm' : allowed[0];
          setItemSpecs(prev => ({ ...prev, thickness: defaultThick }));
        }
      } else if (isCurva) {
        let allowed = ['1,5mm', '2mm', '3mm', '4mm'];
        if (!allowed.includes(itemSpecs.thickness)) {
          setItemSpecs(prev => ({ ...prev, thickness: '2mm' }));
        }
      } else if (isFondo) {
        let allowed = ['2mm', '3mm'];
        if (!allowed.includes(itemSpecs.thickness)) {
          setItemSpecs(prev => ({ ...prev, thickness: '2mm' }));
        }
      } else if (isRiduzione) {
        let allowed = ['2mm', '3mm'];
        if (!allowed.includes(itemSpecs.thickness)) {
          setItemSpecs(prev => ({ ...prev, thickness: '2mm' }));
        }
      }
  }, [itemSpecs.diameter, selectedItem]);

  const [showAddedMsg, setShowAddedMsg] = useState(false);
  const [cart, setCart] = useState<MaterialRequestItem[]>([]);

  // Filter materials based on search
  const searchResults = useMemo(() => {
    if (searchQuery.length > 1) {
      return ALL_MATERIALS.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        m.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return [];
  }, [searchQuery]);

  const addToCart = () => {
    if (!selectedItem) return;
    
    let itemName = selectedItem.name;
    let itemId = selectedItem.id;
    let finalQuantity = itemSpecs.quantity;
    const isLucido = selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-');
    const isOpaco = selectedItem.category === 'OPACO' || selectedItem.id.startsWith('opaco-');
    const isVapore = selectedItem.category === 'VAPORE' || selectedItem.id.startsWith('vapore-');
    const isFlange = selectedItem.category === 'FLANGE' || selectedItem.id.startsWith('flangia-');
    const typeLabel = isLucido ? 'LUCIDO' : (isVapore ? 'VAPORE' : 'OPACO');

    if (selectedItem.id === 'opaco-tubo' || selectedItem.id === 'lucido-tubo' || selectedItem.id === 'vapore-tubo') {
      // Enforce multiples of 6 for Tubo OPACO/LUCIDO/VAPORE
      finalQuantity = Math.ceil(itemSpecs.quantity / 6) * 6;
    }

    if (isLucido || isOpaco || isVapore || isFlange) {
      const normalizedDiam = itemSpecs.diameter.replace('.', ',');
      const selectedSize = PIPE_SIZES.find(s => s.mm === normalizedDiam);
      const sizeInfo = selectedSize && selectedSize.inch !== '-' ? ` (${selectedSize.inch} - DN${selectedSize.dn})` : '';
      
      const isTubo = selectedItem.id.includes('-tubo');
      const isCurva = selectedItem.id.includes('-curva');
      const isTee = selectedItem.id.includes('-tee');
      const isFondo = selectedItem.id.includes('-fondo');
      const isRiduzione = selectedItem.id.includes('-riduzione');
      const isPortagomma = selectedItem.id.includes('-portagomma');
      const isCollare = selectedItem.id.includes('-collare');

      if (isFlange) {
        const dn = PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-';
        itemName = `Flangia ${selectedItem.name} DN${dn} ${itemSpecs.flangeProcess} ${itemSpecs.pn} ${itemSpecs.material}.`;
      } else if (isTubo) {
        if (isLucido) {
          itemName = `Tubo tondo DIN EN 10357 lucido alimentare - d.${itemSpecs.diameter}mm sp.${itemSpecs.thickness} ${itemSpecs.material}.`;
        } else if (isVapore) {
          itemName = `Tubo ASTM A312 - d.${itemSpecs.diameter}mm${sizeInfo} ${itemSpecs.thickness} ${itemSpecs.material} ${typeLabel}.`;
        } else {
          itemName = `TUBO TONDO ELETTROUNITO EN 10217-7 SPAZZOLATO - d.${itemSpecs.diameter}mm${sizeInfo} sp.${itemSpecs.thickness} ${itemSpecs.material}.`;
        }
      } else if (isCurva) {
        if (isLucido) {
          const joiningLabel = itemSpecs.joiningType === 'MANDRINARE' ? 'a mandrinare' : 'a saldare';
          itemName = `Curva DIN 11852 lucido alimentare ${joiningLabel} d.${itemSpecs.diameter}mm sp.${itemSpecs.thickness} a ${itemSpecs.angle} ${itemSpecs.material}.`;
        } else if (isVapore) {
          itemName = `Curva a saldare a ${itemSpecs.angle} raggio ${itemSpecs.radiusType} - d.${itemSpecs.diameter}mm${sizeInfo} ${itemSpecs.thickness} ${itemSpecs.material} ${typeLabel}.`;
        } else {
          itemName = `Curva a saldare 3D EN 10253 d.${itemSpecs.diameter}mm${sizeInfo} sp.${itemSpecs.thickness} a ${itemSpecs.angle} ${itemSpecs.material} ${typeLabel}.`;
        }
      } else if (isTee) {
        if (isLucido) {
          if (itemSpecs.teeType === 'RIDOTTO') {
            itemName = `Tee DIN 11852 mandrinare lucido alimentare d1 ${itemSpecs.diameter}mm - d2 ${itemSpecs.diameter2}mm sp.${itemSpecs.thickness}${itemSpecs.isSboccato ? ' SBOCCATO' : ''} ${itemSpecs.material}.`;
          } else {
            itemName = `Tee DIN 11852 mandrinare lucido alimentare d.${itemSpecs.diameter}mm sp.${itemSpecs.thickness}${itemSpecs.isSboccato ? ' SBOCCATO' : ''} ${itemSpecs.material}.`;
          }
        } else if (isVapore) {
          if (itemSpecs.teeType === 'RIDOTTO') {
            itemName = `Tee ridotto a saldare - d1 ${itemSpecs.diameter}mm - d2 ${itemSpecs.diameter2}mm ${itemSpecs.thickness} ${itemSpecs.material} ${typeLabel}.`;
          } else {
            itemName = `Tee a saldare - d.${itemSpecs.diameter}mm${sizeInfo} ${itemSpecs.thickness} ${itemSpecs.material} ${typeLabel}.`;
          }
        } else {
          if (itemSpecs.teeType === 'RIDOTTO') {
            itemName = `Tee ridotto a saldare EN 10253 d1 ${itemSpecs.diameter}mm - d2 ${itemSpecs.diameter2}mm sp.${itemSpecs.thickness}${itemSpecs.isSboccato ? ' SBOCCATO' : ''} ${itemSpecs.material} ${typeLabel}.`;
          } else {
            itemName = `Tee a saldare EN 10253 d.${itemSpecs.diameter}mm${sizeInfo} sp.${itemSpecs.thickness}${itemSpecs.isSboccato ? ' SBOCCATO' : ''} ${itemSpecs.material} ${typeLabel}.`;
          }
        }
      } else if (isFondo) {
        if (isLucido) {
          itemName = `Fondo bombato DIN lucido alimentare d.${itemSpecs.diameter}mm sp.${itemSpecs.thickness} ${itemSpecs.material}.`;
        } else if (isVapore) {
          itemName = `Fondo bombato a saldare - d.${itemSpecs.diameter}mm${sizeInfo} ${itemSpecs.thickness} ${itemSpecs.material} ${typeLabel}.`;
        } else {
          itemName = `Fondo bombato a saldare EN 10253 d.${itemSpecs.diameter}mm${sizeInfo} sp.${itemSpecs.thickness} ${itemSpecs.material} ${typeLabel}.`;
        }
      } else if (isRiduzione) {
        if (isLucido) {
          const joiningLabel = itemSpecs.joiningType === 'MANDRINARE' ? 'a mandrinare' : 'a saldare';
          const heightLabel = itemSpecs.height ? `H ${itemSpecs.height}mm ` : '';
          itemName = `Riduzione DIN 11852 lucido alimentare ${joiningLabel} d1 ${itemSpecs.diameter}mm - d2 ${itemSpecs.diameter2}mm ${heightLabel}sp.${itemSpecs.thickness} ${itemSpecs.reductionType} ${itemSpecs.material}.`;
        } else if (isVapore) {
          itemName = `Riduzione a saldare ${itemSpecs.reductionType.toLowerCase()} - d1 ${itemSpecs.diameter}mm - d2 ${itemSpecs.diameter2}mm ${itemSpecs.thickness} ${itemSpecs.material} ${typeLabel}.`;
        } else {
          itemName = `Riduzione a saldare EN 10253 d1 ${itemSpecs.diameter}mm - d2 ${itemSpecs.diameter2}mm sp.${itemSpecs.thickness} ${itemSpecs.reductionType} ${itemSpecs.material} ${typeLabel}.`;
        }
      } else if (selectedItem.id.includes('-maschio')) {
        const processLabel = itemSpecs.lucidoProcess;
        const joiningLabel = itemSpecs.lucidoJoiningType === 'GROSSA' ? 'GROSSO' : itemSpecs.lucidoJoiningType;
        const dn = PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-';
        itemName = `Maschio DIN 11851 lucido alimentare ${joiningLabel} ${processLabel} DN${dn} ${itemSpecs.material}.`;
      } else if (selectedItem.id.includes('-femmina')) {
        const processLabel = itemSpecs.lucidoProcess === 'MICROFUSO' ? 'MICROFUSA' : 'FORGIATA';
        const joiningLabel = itemSpecs.lucidoJoiningType === 'MEDIO' ? 'MEDIA' : itemSpecs.lucidoJoiningType;
        const dn = PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-';
        itemName = `Femmina DIN 11851 lucido alimentare ${joiningLabel} ${processLabel} DN${dn} ${itemSpecs.material}.`;
      } else if (selectedItem.id.includes('-bocchettone')) {
        const processLabel = itemSpecs.lucidoProcess === 'MICROFUSO' ? 'MICROFUSO' : 'FORGIATO';
        const joiningLabel = itemSpecs.lucidoJoiningType === 'GROSSA' ? 'GROSSO' : itemSpecs.lucidoJoiningType;
        const dn = PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-';
        itemName = `Bocchettone DIN 11851 lucido alimentare ${joiningLabel} ${processLabel} DN${dn} ${itemSpecs.material} (Girella: ${itemSpecs.lucidoGirellaMaterial}, Guarnizione: ${itemSpecs.lucidoGasketMaterial}).`;
      } else if (selectedItem.id.includes('-girella')) {
        const processLabel = itemSpecs.lucidoProcess;
        const dn = PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-';
        itemName = `Girella DIN 11851 lucido alimentare ${processLabel} DN${dn} ${itemSpecs.material}.`;
      } else if (selectedItem.id.includes('-cieca')) {
        const processLabel = itemSpecs.lucidoProcess;
        const dn = PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-';
        itemName = `Girella cieca c/ cat. DIN 11851 ${processLabel} DN${dn} ${itemSpecs.material}.`;
      } else if (selectedItem.id.includes('-guarnizione')) {
        const dn = PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-';
        itemName = `Guarnizione DIN 11851 DN${dn} ${itemSpecs.lucidoGasketMaterial}.`;
      } else if (selectedItem.id.includes('-tappo-') || selectedItem.id.includes('-specola') || selectedItem.id.includes('-reggitubo')) {
        const dn = PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-';
        itemName = `${selectedItem.name} lucido alimentare DN${dn} ${itemSpecs.material} ${typeLabel}.`;
      } else if (isPortagomma) {
        const pgThickness = getPortagommaThickness(itemSpecs.diameter);
        itemName = `Portagomma a saldare d.${itemSpecs.diameter}mm sp.${pgThickness} ${itemSpecs.material} ${typeLabel}.`;
      } else if (isCollare) {
        const dInfo = selectedSize?.inch !== '-' ? selectedSize?.inch : `${itemSpecs.diameter}mm`;
        itemName = `Collare d'appoggio ${typeLabel.toLowerCase()} EN 10253 - ${dInfo} AISI 304.`;
      } else {
        // Fallback for other items in category
        itemName = `${selectedItem.name} d.${itemSpecs.diameter}mm ${itemSpecs.material} ${typeLabel}.`;
      }
      
      if (isFlange) {
        itemId = `${selectedItem.id}-${itemSpecs.diameter}-${itemSpecs.pn}-${itemSpecs.flangeProcess}-${itemSpecs.material}`;
      } else if (isVapore) {
        itemId = `${selectedItem.id}-${itemSpecs.teeType}-${itemSpecs.diameter}-${itemSpecs.diameter2}-${itemSpecs.schedula}-${itemSpecs.angle}-${itemSpecs.radiusType}-${itemSpecs.reductionType}-${itemSpecs.material}`;
      } else {
        itemId = `${selectedItem.id}-${itemSpecs.teeType}-${itemSpecs.diameter}-${itemSpecs.diameter2}-${itemSpecs.thickness}-${itemSpecs.angle}-${itemSpecs.reductionType}-${itemSpecs.isSboccato}-${itemSpecs.material}-${itemSpecs.joiningType}-${itemSpecs.lucidoJoiningType}-${itemSpecs.lucidoProcess}`;
      }
    } else {
      itemName = `${selectedItem.name} ${itemSpecs.measure ? `(${itemSpecs.measure})` : ''}.`;
      itemId = `${selectedItem.id}-${itemSpecs.measure}`;
    }

    const newItem: MaterialRequestItem = {
      id: itemId,
      name: itemName,
      category: selectedItem.category,
      subcategory: selectedItem.subcategory,
      quantity: finalQuantity,
      unit: selectedItem.unit,
    };

    setCart(prev => {
      const existing = prev.find(i => i.id === newItem.id);
      if (existing) {
        return prev.map(i => i.id === newItem.id ? { ...i, quantity: i.quantity + newItem.quantity } : i);
      }
      return [...prev, newItem];
    });

    setShowAddedMsg(true);
    setTimeout(() => setShowAddedMsg(false), 2000);
    // Reset specific fields but stay on item
    setItemSpecs(prev => ({ ...prev, quantity: 1 }));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const step = (item.id.includes('opaco-tubo') || item.id.includes('lucido-tubo') || item.id.includes('vapore-tubo')) ? 6 : 1;
        const newQty = Math.max(step, item.quantity + (delta * step));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const resetSelection = () => {
    setSelectedItem(null);
    setSelectedSubcategory(null);
    setSelectedCategory(null);
    setSearchQuery('');
    setItemSpecs({ 
      measure: '', 
      quantity: 1,
      diameter: '21,3',
      diameter2: '17,2',
      thickness: '2mm',
      material: 'AISI 304L',
      angle: '90°',
      reductionType: 'CONCENTRICA',
      teeType: 'NORMALE',
      isSboccato: false,
      joiningType: 'MANDRINARE',
      lucidoJoiningType: 'MANDRINARE',
      lucidoProcess: 'MICROFUSO',
      lucidoGasketMaterial: 'EPDM',
      height: ''
    });
  };

  const getPortagommaThickness = (diameter: string) => {
    const pgThickness = parseFloat(diameter.replace(',', '.'));
    if (pgThickness <= 76.1) return '2mm';
    return '3mm';
  };

  const PORTAGOMMA_SIZES = [
    '20', '21.3', '25', '26.9', '30', '33.7', '35', '38', '40', '42.4', 
    '48.3', '50', '52', '60.3', '70', '76.1', '80', '88.9', '101.6', '114.3'
  ];

  const CURVA_SIZES = [
    '13,7', '17,2', '18', '20', '21,3', '22', '23', '25', '26,9', '28', 
    '30', '32', '33,7', '34', '35', '38', '40', '42,4', '44,5', '48,3', 
    '50', '50,8', '52', '53', '54', '57', '60,3', '63,5', '70', '73', 
    '76,1', '80', '84', '85', '88,9', '101,6', '104', '108', '114,3', 
    '129', '133', '139,7', '154', '159', '168,3', '204', '219,1', '254', 
    '256', '273', '304', '323.9', '355', '406,4', '455', '457', '458', 
    '508', '609', '711'
  ];

  const COLLARE_SIZES = PIPE_SIZES.filter(s => {
    const val = parseFloat(s.mm.replace(',', '.'));
    return val >= 13.7 && val <= 406.4;
  }).map(s => s.mm);

  const CURVA_DIAMS_WITH_1_5MM = [
    '13.7', '18', '20', '21.3', '22', '23', '25', '26.9', '28', '30', 
    '33.7', '34', '35', '38', '40', '42.4', '48.3', '50', '50.8', '52', 
    '53', '54', '60.3', '63.5', '70', '76.1'
  ];

  const TUBO_DIAMS_THIN = ['10', '12', '18', '20'];
  const TUBO_DIAMS_NORMAL = PIPE_SIZES.map(s => s.mm).filter(mm => !TUBO_DIAMS_THIN.includes(mm));

  const LUCIDO_SIZES = [
    '12', '18', '19,05', '22', '23', '28', '29', '34', '35', 
    '40', '41', '52', '53', '70', '85', '101,6', '104', '129', '154', '204'
  ];

  const LUCIDO_REDUCTION_HEIGHTS: Record<string, number> = {
    '20-15': 60,
    '25-15': 60,
    '25-20': 60,
    '32-20': 80,
    '32-25': 80,
    '40-20': 102,
    '40-25': 102,
    '40-32': 88,
    '50-25': 115,
    '50-32': 129,
    '50-40': 113,
    '65-25': 125,
    '65-32': 125,
    '65-40': 120,
    '65-50': 130,
    '80-40': 140,
    '80-50': 125,
    '80-65': 120,
    '100-50': 160,
    '100-65': 127,
    '100-80': 120
  };

  const getDN = (mm: string) => {
    return PIPE_SIZES.find(s => s.mm === mm.replace('.', ','))?.dn || '';
  };

  useEffect(() => {
    const isLucido = selectedItem?.category === 'LUCIDO' || selectedItem?.id?.startsWith('lucido-');
    const isRiduzione = selectedItem?.id?.includes('-riduzione');
    if (isLucido && isRiduzione) {
      const dn1 = getDN(itemSpecs.diameter);
      const dn2 = getDN(itemSpecs.diameter2);
      const key = `${dn1}-${dn2}`;
      const height = LUCIDO_REDUCTION_HEIGHTS[key] || '';
      if (itemSpecs.height !== height.toString()) {
        setItemSpecs(prev => ({ ...prev, height: height.toString() }));
      }
    }
  }, [itemSpecs.diameter, itemSpecs.diameter2, selectedItem]);

  const handleSubmit = async (status: 'INVIATA' | 'draft' = 'INVIATA') => {
    if (cart.length === 0) {
      setError('Aggiungi almeno un articolo al carrello');
      return;
    }

    if (!worker || !worker.id) {
      setError('Errore identificazione operatore. Effettua nuovamente il login.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create data object, explicitly filtering out undefined values
      const requestData: any = {
        date: formData.date || new Date().toISOString().split('T')[0],
        workerId: worker.id,
        azienda_id: worker.azienda_id,
        workerName: worker.name || 'Dipendente',
        cantiere: formData.cantiere || 'Senza Nome',
        intervento: formData.intervento || '-',
        items: cart.map(item => {
          const cleanedItem: any = {
            id: item.id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit
          };
          if (item.subcategory) cleanedItem.subcategory = item.subcategory;
          return cleanedItem;
        }),
        status,
        updatedAt: serverTimestamp(),
      };

      if (currentRequestId) {
        await setDoc(doc(db, 'materialRequests', currentRequestId), requestData, { merge: true });
      } else {
        requestData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'materialRequests'), requestData);
      }
      
      if (status === 'draft') {
        // Just go back to hub if draft
        setCart([]);
        setFormData({
          date: new Date().toISOString().split('T')[0],
          cantiere: '',
          intervento: '',
        });
        setCurrentRequestId(null);
        setCurrentRequestStatus(null);
        setStep(0);
      } else {
        setCurrentRequestId(null);
        setCurrentRequestStatus(null);
        setStep(4); // Success step for sent
      }
    } catch (err) {
      console.error('Error submitting material request:', err);
      setError('Errore durante l\'invio. Riprova.');
      handleFirestoreError(err, OperationType.WRITE, 'materialRequests');
    } finally {
      setLoading(false);
    }
  };

  const isEditable = (req: MaterialRequestType) => {
    if (!req) return false;
    if (req.status === 'draft') return true;
    if (req.status !== 'INVIATA') return false;
    
    // For sent requests, only editable if today
    try {
      const now = new Date();
      const createdDate = req.createdAt instanceof Timestamp ? req.createdAt.toDate() : new Date(req.createdAt || req.date);
      
      const isSameDay = now.getFullYear() === createdDate.getFullYear() &&
                        now.getMonth() === createdDate.getMonth() &&
                        now.getDate() === createdDate.getDate();
                        
      return isSameDay;
    } catch (e) {
      return true;
    }
  };

  const resumeRequest = (req: MaterialRequestType) => {
    setFormData({
      date: req.date,
      cantiere: req.cantiere,
      intervento: req.intervento,
    });
    setCart(req.items);
    setCurrentRequestId(req.id || null);
    setCurrentRequestStatus(req.status || null);
    
    setStep(3); // Go to recap
  };

  const startNewRequest = () => {
    setCart([]);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      cantiere: '',
      intervento: '',
    });
    setCurrentRequestId(null);
    setCurrentRequestStatus(null);
    resetSelection();
    setStep(1);
  };

  const deleteRequest = async (id: string | null) => {
    if (!id) {
      // If no ID, it's just clearing the current state
      setCart([]);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        cantiere: '',
        intervento: '',
      });
      setStep(0);
      return;
    }

    if (!confirm('Sei sicuro di voler eliminare questa lista materiale?')) return;
    
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'materialRequests', id));
      setCart([]);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        cantiere: '',
        intervento: '',
      });
      setCurrentRequestId(null);
      setCurrentRequestStatus(null);
      await fetchRequests();
    } catch (err) {
      console.error('Error deleting request:', err);
      setError('Errore durante l\'eliminazione.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    setLoading(true);
    setError('');
    try {
      let q = (IS_TEST_PROJECT)
        ? query(
            collection(db, 'materialRequests'),
            where('workerId', '==', worker.id),
            orderBy('createdAt', 'desc')
          )
        : query(
            collection(db, 'materialRequests'),
            where('workerId', '==', worker.id),
            where('azienda_id', '==', worker.azienda_id),
            orderBy('createdAt', 'desc')
          );
      
      let snapshot;
      try {
        snapshot = await fetchWithRetry(() => getDocs(q));
      } catch (innerErr: any) {
        // Fallback if index missing or other sort error
        console.warn('Sort query failed, falling back to simple query', innerErr);
        q = (IS_TEST_PROJECT)
          ? query(
              collection(db, 'materialRequests'),
              where('workerId', '==', worker.id)
            )
          : query(
              collection(db, 'materialRequests'),
              where('workerId', '==', worker.id),
              where('azienda_id', '==', worker.azienda_id)
            );
        snapshot = await fetchWithRetry(() => getDocs(q));
      }

      if (!snapshot || !snapshot.docs) {
        throw new Error("Impossibile recuperare le richieste materiali.");
      }

      const docs: MaterialRequestType[] = [];
      for (const doc of snapshot.docs) {
        try {
          if (!doc || !doc.data || typeof doc.data !== 'function') continue;
          const data = doc.data();
          if (!data) continue;
          docs.push({ id: doc.id, ...data } as MaterialRequestType);
        } catch (e) {
          console.error("Error mapping document in MaterialRequest:", e);
        }
      }
      
      // Sort manually if fallback was used
      if (docs.length > 0 && !docs[0].createdAt) {
         // Some might be missing createdAt
      } else {
        docs.sort((a, b) => {
          const timeA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const timeB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return timeB - timeA;
        });
      }

      setLastRequests(docs);
      setStep(5);
    } catch (err) {
      console.error('Error fetching requests:', err);
      setError('Errore nel caricamento delle liste. Verifica la connessione.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (selectedItem) setSelectedItem(null);
    else if (selectedSubcategory) setSelectedSubcategory(null);
    else if (selectedCategory) setSelectedCategory(null);
    else if (searchQuery) setSearchQuery('');
    else if (step === 2) setStep(1);
    else if (step === 1 || step === 5) setStep(0);
    else if (step === 3) {
      if (currentRequestId) {
        fetchRequests(); // Return to LISTE CREATE
      } else {
        setStep(2);
      }
    }
    else if (onBack) onBack();
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (step === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto px-4 py-12 space-y-12"
      >
        <div className="flex items-center justify-between mb-8 sm:mb-12">
          <div className="flex gap-4">
            <button 
              onClick={onBack}
              className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              INDIETRO
            </button>
            <button 
              onClick={onBack}
              className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              INIZIO
            </button>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">MATERIALE</h1>
          <p className="text-slate-500 font-medium mt-2">Gestione richieste e liste</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <button 
            onClick={startNewRequest}
            className="group bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-xl hover:border-dark-blue hover:shadow-2xl transition-all flex flex-col items-center gap-6 text-center"
          >
            <div className="w-24 h-24 bg-dark-blue/5 rounded-3xl flex items-center justify-center text-dark-blue group-hover:bg-dark-blue group-hover:text-white transition-all duration-500">
              <ListPlus className="w-12 h-12" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-wider">RICHIESTA MATERIALE</h2>
              <p className="text-slate-500 font-bold mt-2 text-sm uppercase tracking-widest opacity-60">Crea una nuova lista</p>
            </div>
          </button>

          <button 
            onClick={fetchRequests}
            className="group bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-xl hover:border-green-600 hover:shadow-2xl transition-all flex flex-col items-center gap-6 text-center"
          >
            <div className="w-24 h-24 bg-green-50 rounded-3xl flex items-center justify-center text-green-600 group-hover:bg-green-600 group-hover:text-white transition-all duration-500">
              {loading ? (
                <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <History className="w-12 h-12" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-wider">LISTE CREATE</h2>
              <p className="text-slate-500 font-bold mt-2 text-sm uppercase tracking-widest opacity-60">Visualizza lo storico</p>
            </div>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-6 rounded-2xl border border-red-100 text-center font-black uppercase tracking-widest text-sm animate-pulse">
            {error}
          </div>
        )}


      </motion.div>
    );
  }

  if (step === 5) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 pb-32">
        <div className="flex items-center justify-between mb-12">
          <button 
            onClick={handleBack}
            className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            INDIETRO
          </button>
          <button 
            onClick={onBack}
            className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            INIZIO
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="w-12 h-12 border-4 border-dark-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-black text-slate-400 uppercase tracking-widest">Caricamento...</p>
          </div>
        ) : lastRequests.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
            <Cylinder className="w-16 h-16 mx-auto mb-4 text-slate-200" />
            <p className="font-black text-slate-400 uppercase tracking-widest">Nessuna lista creata</p>
          </div>
        ) : (
          <div className="space-y-6">
            {lastRequests.map((req) => (
              <div 
                key={req.id}
                onClick={() => resumeRequest(req)}
                className="w-full bg-white p-6 sm:p-8 rounded-[2rem] border-2 border-slate-100 shadow-lg relative overflow-hidden text-left hover:border-dark-blue hover:scale-[1.01] transition-all group cursor-pointer"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-10 ${
                  req.status !== 'draft' ? 'bg-green-600' : 'bg-orange-500'
                } group-hover:scale-150 transition-transform duration-500`} />
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        req.status !== 'draft' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]'
                      }`} />
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight group-hover:text-dark-blue transition-colors">{req.cantiere}</h3>
                    </div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{req.intervento}</p>
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest pt-2">
                      <Clock className="w-3 h-3" />
                      {req.status !== 'draft' ? (req.status === 'INVIATA' ? 'Inviata il' : 'Ultimo aggiornamento') : 'Ultima modifica'}: {formatDate(req.updatedAt || req.createdAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 border-t sm:border-t-0 pt-4 sm:pt-0">
                    <div className="text-right">
                      <span className="block text-2xl font-black text-slate-900">{req.items.length}</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Articoli</span>
                    </div>
                    <div className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest ${
                      req.status === 'draft' 
                      ? 'bg-orange-50 text-orange-600 border border-orange-100' 
                      : req.status === 'INVIATA'
                      ? 'bg-blue-100 text-blue-600 border-blue-200'
                      : (req.status === 'PRESA IN CARICO' || req.status === 'IN VERIFICA')
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : (req.status === 'APPROVATA' || req.status === 'CONSEGNATA')
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : 'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                      {req.status === 'draft' ? 'DA COMPLETARE' : req.status === 'INVIATA' ? 'NUOVA' : (req.status === 'PRESA IN CARICO' || req.status === 'IN VERIFICA') ? 'IN VERIFICA' : req.status}
                    </div>
                    {isEditable(req) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRequest(req.id!);
                        }}
                        className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === 4) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto text-center py-20 px-6"
      >
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
          <Check className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-4 uppercase">RICHIESTA INVIATA!</h2>
        <p className="text-slate-500 mb-10 font-medium">L'ufficio ha ricevuto la tua lista e preparerà il materiale il prima possibile.</p>
        <button 
          onClick={() => {
            // Reset everything for next list
            setCart([]);
            setFormData({
              date: new Date().toISOString().split('T')[0],
              cantiere: '',
              intervento: '',
            });
            setStep(0);
            setCurrentRequestId(null);
          }}
          className="w-full py-5 bg-dark-blue text-white rounded-2xl font-bold shadow-xl shadow-dark-blue/20 uppercase tracking-widest"
        >
          TORNA AL MENU MATERIALE
        </button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 sm:mb-12">
        <div className="flex gap-4">
          <button 
            onClick={handleBack}
            className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            INDIETRO
          </button>
          <button 
            onClick={onBack}
            className="px-6 py-3 bg-dark-blue text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-dark-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            INIZIO
          </button>
        </div>
      </div>

      {step === 1 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="text-center">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">RICHIESTA MATERIALE</h1>
            <p className="text-slate-500 font-medium mt-2">Inserisci i dettagli per iniziare</p>
          </div>

          <div className="bg-white p-6 sm:p-10 rounded-[2rem] border border-slate-200 shadow-xl space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Data</label>
                <input 
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue outline-none font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Cantiere</label>
                <input 
                  type="text"
                  placeholder="Nome del cantiere"
                  value={formData.cantiere}
                  onChange={(e) => setFormData(prev => ({ ...prev, cantiere: e.target.value }))}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue outline-none font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Intervento</label>
                <textarea 
                  placeholder="Descrizione intervento"
                  value={formData.intervento}
                  onChange={(e) => setFormData(prev => ({ ...prev, intervento: e.target.value }))}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-dark-blue outline-none font-bold min-h-[100px]"
                />
              </div>
            </div>

            <button 
              onClick={() => {
                if (formData.cantiere && formData.intervento) setStep(2);
                else setError('Inserisci tutti i campi');
              }}
              className="w-full py-5 bg-dark-blue text-white rounded-2xl font-black shadow-xl shadow-dark-blue/20 uppercase tracking-widest text-lg"
            >
              {currentRequestId ? 'CONTINUA MODIFICA' : 'INIZIA'}
            </button>
            {error && <p className="text-red-500 text-center font-bold">{error}</p>}
          </div>
        </motion.div>
      )}

      {step === 2 && (
        <div className="space-y-8">
          {cart.length > 0 && (
            <div className="flex justify-end mb-2">
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setStep(3)}
                className="flex items-center gap-3 px-6 py-4 bg-green-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-600/30 hover:bg-green-700 transition-all active:scale-95 border-2 border-green-500/50"
              >
                <ClipboardList className="w-5 h-5" />
                LISTA MATERIALE ({cart.length})
              </motion.button>
            </div>
          )}

          {selectedItem ? (
            /* Individual Item Detail Screen */
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              {/* Header logic */}
              <div className="text-center">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">
                  {selectedItem.id.includes('-tubo') ? 'TUBO' : 
                   selectedItem.id.includes('-curva') ? 'CURVA' : 
                   selectedItem.id.includes('-tee') ? 'TEE' :
                   selectedItem.id.includes('-fondo') ? 'FONDO BOMBATO' :
                   selectedItem.id.includes('-riduzione') ? 'RIDUZIONE' :
                   selectedItem.id.includes('-portagomma') ? 'PORTAGOMMA' :
                   selectedItem.id.includes('-collare') ? 'COLLARE' :
                   selectedItem.name}
                </h2>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-2">
                  {selectedItem.category} {selectedItem.subcategory && `> ${selectedSubcategory}`}
                </p>
                {(selectedItem.category === 'OPACO' || selectedItem.category === 'LUCIDO' || selectedItem.category === 'VAPORE' || selectedItem.category === 'FLANGE' || selectedItem.id.startsWith('opaco-') || selectedItem.id.startsWith('lucido-') || selectedItem.id.startsWith('vapore-') || selectedItem.id.startsWith('flangia-')) && (
                  <p className="text-dark-blue font-black mt-4 text-lg">
                    {selectedItem.category === 'FLANGE' || selectedItem.id.startsWith('flangia-') 
                      ? `Configurazione flangia ${selectedItem.name}.`
                      : selectedItem.id.includes('-tubo') 
                      ? (selectedItem.category === 'LUCIDO' ? 'Tubo tondo DIN EN 10357 lucido alimentare.' : 'Tubo tondo elettrounito EN 10217-7 spazzolato.') 
                      : selectedItem.id.includes('-curva')
                      ? (selectedItem.category === 'LUCIDO' ? 'Curva DIN 11852 lucido alimentare.' : 'Curva a saldare 3D EN 10253.')
                      : selectedItem.id.includes('-tee')
                      ? (selectedItem.category === 'LUCIDO' ? 'Tee DIN 11852 mandrinare lucido alimentare.' : 'Tee a saldare EN 10253.')
                      : selectedItem.id.includes('-riduzione')
                      ? (selectedItem.category === 'LUCIDO' ? 'Riduzione DIN 11852 mandrinare lucido alimentare.' : 'Riduzione a saldare EN 10253.')
                      : selectedItem.id.includes('-fondo')
                      ? (selectedItem.category === 'LUCIDO' ? 'Fondo bombato DIN lucido alimentare.' : 'Fondo bombato a saldare EN 10253.')
                      : selectedItem.id.includes('-maschio')
                      ? 'Maschio DIN 11851 lucido alimentare.'
                      : selectedItem.id.includes('-femmina')
                      ? 'Femmina DIN 11851 lucido alimentare.'
                      : selectedItem.id.includes('-bocchettone')
                      ? 'Bocchettone DIN 11851 lucido alimentare.'
                      : selectedItem.id.includes('-girella')
                      ? 'Girella DIN 11851 lucido alimentare.'
                      : selectedItem.id.includes('-cieca')
                      ? 'Girella cieca c/ cat. DIN 11851.'
                      : selectedItem.id.includes('-guarnizione')
                      ? 'Guarnizione DIN lucido alimentare.'
                      : selectedItem.id.includes('-portagomma')
                      ? 'Portagomma a saldare.'
                      : selectedItem.id.includes('-collare')
                      ? `Collare d'appoggio ${selectedItem.category === 'LUCIDO' ? 'lucido' : (selectedItem.category === 'VAPORE' ? 'vapore' : 'opaco')} EN 10253.`
                      : 'Articolo a saldare EN 10253.'
                    }
                  </p>
                )}
              </div>

              <div className="bg-white p-8 sm:p-12 rounded-[2.5rem] border border-slate-200 shadow-2xl space-y-10">
                {(selectedItem.category === 'OPACO' || selectedItem.category === 'LUCIDO' || selectedItem.category === 'VAPORE' || selectedItem.category === 'FLANGE' || selectedItem.id.startsWith('opaco-') || selectedItem.id.startsWith('lucido-') || selectedItem.id.startsWith('vapore-') || selectedItem.id.startsWith('flangia-')) ? (
                  /* Specialized UI for Opaco/Lucido/Vapore/Flange items */
                  <div className="space-y-8">
                    {selectedItem.category === 'FLANGE' || selectedItem.id.startsWith('flangia-') ? (
                      <div className="space-y-8">
                        <div className="space-y-4">
                          <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <span className="text-lg">Ø</span> DN
                          </label>
                          <select 
                            value={itemSpecs.diameter}
                            onChange={(e) => setItemSpecs(prev => ({ ...prev, diameter: e.target.value }))}
                            className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-dark-blue outline-none font-bold text-xl appearance-none cursor-pointer"
                          >
                            {PIPE_SIZES.map(s => (
                              <option key={s.mm} value={s.mm}>DN{s.dn} ({s.mm} mm)</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Processo</label>
                            <select 
                              value={itemSpecs.flangeProcess}
                              onChange={(e) => setItemSpecs(prev => ({ ...prev, flangeProcess: e.target.value }))}
                              className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-dark-blue outline-none font-bold text-lg appearance-none cursor-pointer"
                            >
                              {['EN 1092-1', 'ASME B16.5', 'DIN 2576', 'UNI 2278'].map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-4">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">PN</label>
                            <select 
                              value={itemSpecs.pn}
                              onChange={(e) => setItemSpecs(prev => ({ ...prev, pn: e.target.value }))}
                              className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-dark-blue outline-none font-bold text-lg appearance-none cursor-pointer"
                            >
                              {['PN6', 'PN10', 'PN16', 'PN25', 'PN40', '150 lbs', '300 lbs'].map(pn => (
                                <option key={pn} value={pn}>{pn}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Materiale</label>
                          <div className="flex gap-2">
                            {['AISI 304L', 'AISI 316L'].map(m => (
                              <button
                                key={m}
                                onClick={() => setItemSpecs(prev => ({ ...prev, material: m }))}
                                className={`flex-1 py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                  itemSpecs.material === m 
                                  ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                  : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                }`}
                              >
                                {m.split(' ')[1]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-8">
                    {selectedItem.id.includes('-tee') && (
                      <div className="space-y-4">
                        <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Tipo TEE</label>
                        <div className="flex gap-4">
                          {['NORMALE', 'RIDOTTO'].map(t => (
                            <button
                              key={t}
                              onClick={() => setItemSpecs(prev => ({ 
                                ...prev, 
                                teeType: t as any,
                                diameter: (t === 'RIDOTTO' && prev.diameter === '17,2') ? '21,3' : prev.diameter
                              }))}
                              className={`flex-1 py-5 rounded-2xl font-black text-xs sm:text-sm tracking-widest transition-all border-2 ${
                                itemSpecs.teeType === t 
                                ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-8">
                      <div className="space-y-4">
                        <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2 flex items-center gap-2">
                          <span className="text-lg">Ø</span> {(selectedItem.id.includes('-riduzione') || (selectedItem.id.includes('-tee') && itemSpecs.teeType === 'RIDOTTO')) ? 'Diametro 1' : 'Diametro'}
                        </label>
                        <div className="flex items-center gap-4">
                          <select 
                            value={itemSpecs.diameter}
                            onChange={(e) => setItemSpecs(prev => ({ ...prev, diameter: e.target.value }))}
                            className="flex-1 px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-dark-blue outline-none font-bold text-xl appearance-none cursor-pointer"
                          >
                            {((selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-'))
                              ? LUCIDO_SIZES
                              : (selectedItem.category === 'VAPORE' || selectedItem.id.startsWith('vapore-'))
                                ? PIPE_SIZES.filter(s => {
                                    const val = parseFloat(s.mm.replace(',', '.'));
                                    return s.inch !== '-' && val >= 21.3 && val <= 323.9;
                                  }).map(s => s.mm)
                                : (selectedItem.id.includes('-portagomma') 
                                  ? PORTAGOMMA_SIZES 
                                  : selectedItem.id.includes('-collare')
                                    ? COLLARE_SIZES
                                  : selectedItem.id.includes('-curva')
                                    ? CURVA_SIZES
                                    : PIPE_SIZES.map(s => s.mm))
                              .filter(mm => {
                                const val = parseFloat(mm.replace(',', '.'));
                                const isLucid = selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-');
                                if (isLucid) {
                                  const isConn = selectedItem.id.includes('-femmina') || 
                                                selectedItem.id.includes('-maschio') || 
                                                selectedItem.id.includes('-girella') || 
                                                selectedItem.id.includes('-cieca') || 
                                                selectedItem.id.includes('-guarnizione') ||
                                                selectedItem.id.includes('-bocchettone') ||
                                                selectedItem.id.includes('-tappo-') ||
                                                selectedItem.id.includes('-specola') ||
                                                selectedItem.id.includes('-reggitubo');
                                  
                                  if (isConn) {
                                    const doublesToExclude = ['19,05', '23', '29', '35', '41', '53', '101,6'];
                                    if (doublesToExclude.includes(mm)) return false;
                                    if (selectedItem.id.includes('-tappo-m')) return val <= 154;
                                    if (selectedItem.id.includes('-tappo-f')) return val <= 104;
                                  }

                                  if (selectedItem.id.includes('-tee')) {
                                    if (itemSpecs.teeType === 'RIDOTTO' && mm === '12') return false;
                                    return val >= 22;
                                  }
                                  if (selectedItem.id.includes('-riduzione')) {
                                    if (mm === '12') return false;
                                    return val >= 22;
                                  }
                                  return true;
                                }
                                if (selectedItem.id.includes('-tee') || selectedItem.id.includes('-fondo')) return val >= 13.7;
                                if (selectedItem.id.includes('-riduzione')) return val >= 17.2;
                                return true;
                              })
                            ).map(mm => {
                              const dn = PIPE_SIZES.find(s => s.mm === mm.replace('.', ','))?.dn || mm;
                              const isDNOnly = selectedItem.id.includes('-girella') || 
                                              selectedItem.id.includes('-cieca') || 
                                              selectedItem.id.includes('-guarnizione') ||
                                              selectedItem.id.includes('-femmina') ||
                                              selectedItem.id.includes('-maschio') ||
                                              selectedItem.id.includes('-bocchettone') ||
                                              selectedItem.id.includes('-tappo-') ||
                                              selectedItem.id.includes('-specola') ||
                                              selectedItem.id.includes('-reggitubo');

                              return (
                                <option key={mm} value={mm}>
                                  {isDNOnly ? `DN${dn}` : `${mm} mm`}
                                </option>
                              );
                            })}
                          </select>
                          {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-') || !(selectedItem.id.includes('-riduzione') || (selectedItem.id.includes('-tee') && itemSpecs.teeType === 'RIDOTTO'))) && 
                            !selectedItem.id.includes('-guarnizione') && 
                            !selectedItem.id.includes('-cieca') && 
                            !selectedItem.id.includes('-femmina') && 
                            !selectedItem.id.includes('-maschio') && 
                            !selectedItem.id.includes('-bocchettone') && 
                            !selectedItem.id.includes('-tappo-') && 
                            !selectedItem.id.includes('-specola') && 
                            !selectedItem.id.includes('-reggitubo') && (
                            <div className="bg-dark-blue/5 px-6 py-5 rounded-2xl border-2 border-dark-blue/10 flex flex-col justify-center items-center min-w-[100px]">
                              {selectedItem.id.includes('-portagomma') ? (
                                <>
                                  <span className="text-dark-blue font-black text-lg">sp.{getPortagommaThickness(itemSpecs.diameter)}</span>
                                  <span className="text-[10px] font-black text-dark-blue/50 uppercase">SPESSORE</span>
                                </>
                              ) : (selectedItem.id.includes('-collare') || selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-')) ? (
                                <>
                                  <span className="text-[10px] font-black text-dark-blue/50 uppercase">
                                    {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-')) ? 'DIN' : 'POLLICI'}
                                  </span>
                                  <span className="text-dark-blue font-black text-lg">
                                    {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-')) 
                                      ? `DN${PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-'}`
                                      : PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.inch || '-'
                                    }
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-dark-blue font-black text-lg">
                                    {PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.inch || '-'}
                                  </span>
                                  <span className="text-[10px] font-black text-dark-blue/50 uppercase">
                                    DN{PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-'}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {(selectedItem.id.includes('-riduzione') || (selectedItem.id.includes('-tee') && itemSpecs.teeType === 'RIDOTTO')) && (
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">
                            {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-'))
                              ? `DN${PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-'}`
                              : `${PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.inch || '-'} - DN${PIPE_SIZES.find(s => s.mm === itemSpecs.diameter.replace('.', ','))?.dn || '-'}`
                            }
                          </p>
                        )}
                      </div>

                      {(selectedItem.id.includes('-riduzione') || (selectedItem.id.includes('-tee') && itemSpecs.teeType === 'RIDOTTO')) && (
                        <div className="space-y-4">
                          <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <span className="text-lg">Ø</span> Diametro 2
                          </label>
                          <div className="flex items-center gap-4">
                            <select 
                              value={itemSpecs.diameter2}
                              onChange={(e) => setItemSpecs(prev => ({ ...prev, diameter2: e.target.value }))}
                              className={`flex-1 px-8 py-5 bg-slate-50 border-2 rounded-2xl focus:border-dark-blue outline-none font-bold text-xl appearance-none cursor-pointer ${
                                parseFloat(itemSpecs.diameter.replace(',', '.')) <= parseFloat(itemSpecs.diameter2.replace(',', '.'))
                                ? 'border-red-200' : 'border-slate-100'
                              }`}
                            >
                              {((selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-')) 
                                ? LUCIDO_SIZES 
                                : (selectedItem.category === 'VAPORE' || selectedItem.id.startsWith('vapore-'))
                                  ? PIPE_SIZES.filter(s => {
                                      const val = parseFloat(s.mm.replace(',', '.'));
                                      return s.inch !== '-' && val >= 21.3 && val <= 273; // Riduzioni vapore tipicamente fino al diametro precedente
                                    }).map(s => s.mm)
                                  : PIPE_SIZES.map(s => s.mm))
                                .filter(mm => {
                                  const val = parseFloat(mm.replace(',', '.'));
                                  const isLucid = selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-');
                                  if (isLucid) {
                                    if (selectedItem.id.includes('-riduzione') || (selectedItem.id.includes('-tee') && itemSpecs.teeType === 'RIDOTTO')) {
                                      // Diameter 2 can be 12mm
                                      return val >= 12;
                                    }
                                  }
                                  if (selectedItem.id.includes('-riduzione') || (selectedItem.id.includes('-tee') && itemSpecs.teeType === 'RIDOTTO')) return val >= 13.7;
                                  return true;
                                }).map(mm => (
                                  <option key={mm} value={mm}>{mm} mm</option>
                              ))}
                            </select>
                            {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-')) && (
                              <div className="bg-dark-blue/5 px-6 py-5 rounded-2xl border-2 border-dark-blue/10 flex flex-col justify-center items-center min-w-[100px]">
                                <span className="text-[10px] font-black text-dark-blue/50 uppercase">DIN</span>
                                <span className="text-dark-blue font-black text-lg">
                                  DN{PIPE_SIZES.find(s => s.mm === itemSpecs.diameter2.replace('.', ','))?.dn || '-'}
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">
                            {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-'))
                              ? `DN${PIPE_SIZES.find(s => s.mm === itemSpecs.diameter2.replace('.', ','))?.dn || '-'}`
                              : `${PIPE_SIZES.find(s => s.mm === itemSpecs.diameter2.replace('.', ','))?.inch || '-'} - DN${PIPE_SIZES.find(s => s.mm === itemSpecs.diameter2.replace('.', ','))?.dn || '-'}`
                            }
                          </p>
                          {parseFloat(itemSpecs.diameter.replace(',', '.')) <= parseFloat(itemSpecs.diameter2.replace(',', '.')) && (
                            <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest ml-2">Il diametro 1 deve essere maggiore del 2</p>
                          )}
                        </div>
                      )}
                    </div>

                    {selectedItem.id.includes('-tee') && (
                      <div className="flex items-center gap-4 bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 cursor-pointer" onClick={() => setItemSpecs(prev => ({ ...prev, isSboccato: !prev.isSboccato }))}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${itemSpecs.isSboccato ? 'bg-dark-blue text-white' : 'bg-white border-2 border-slate-200'}`}>
                          {itemSpecs.isSboccato && <Check className="w-5 h-5" />}
                        </div>
                        <span className="font-black text-slate-700 uppercase tracking-widest text-sm">Richiedi versione SBOCCATO</span>
                      </div>
                    )}

                    {selectedItem.id.includes('-curva') && (
                      <div className="space-y-4">
                        {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-')) && (
                          <>
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Tipologia attacco</label>
                            <div className="flex gap-4 mb-4">
                              {['SALDARE', 'MANDRINARE'].map(t => (
                                <button
                                  key={t}
                                  onClick={() => setItemSpecs(prev => ({ ...prev, joiningType: t as any }))}
                                  className={`flex-1 py-5 rounded-2xl font-black text-xs sm:text-sm tracking-widest transition-all border-2 ${
                                    itemSpecs.joiningType === t 
                                    ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                    : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        {(selectedItem.category === 'VAPORE' || selectedItem.id.startsWith('vapore-')) && (
                          <>
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Tipo Raggio</label>
                            <div className="flex gap-4 mb-4">
                              {['L.R.', 'S.R.'].map(r => (
                                <button
                                  key={r}
                                  onClick={() => setItemSpecs(prev => ({ ...prev, radiusType: r }))}
                                  className={`flex-1 py-5 rounded-2xl font-black text-lg transition-all border-2 ${
                                    itemSpecs.radiusType === r 
                                    ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                    : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                  }`}
                                >
                                  {r === 'L.R.' ? 'Long Radius' : 'Short Radius'}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Grado</label>
                        <div className="flex gap-4">
                          {['90°', '45°'].map(g => (
                            <button
                              key={g}
                              onClick={() => setItemSpecs(prev => ({ ...prev, angle: g }))}
                              className={`flex-1 py-5 rounded-2xl font-black text-lg transition-all border-2 ${
                                itemSpecs.angle === g 
                                ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedItem.id.includes('-riduzione') && (
                      <div className="space-y-4">
                        {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-')) && (
                          <>
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Tipologia attacco</label>
                            <div className="flex gap-4 mb-4">
                              {['SALDARE', 'MANDRINARE'].map(t => (
                                <button
                                  key={t}
                                  onClick={() => setItemSpecs(prev => ({ ...prev, joiningType: t as any }))}
                                  className={`flex-1 py-5 rounded-2xl font-black text-xs sm:text-sm tracking-widest transition-all border-2 ${
                                    itemSpecs.joiningType === t 
                                    ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                    : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Tipo Riduzione</label>
                        <div className="flex gap-4">
                          {['CONCENTRICA', 'ECCENTRICA'].map(t => (
                            <button
                              key={t}
                              onClick={() => setItemSpecs(prev => ({ ...prev, reductionType: t }))}
                              className={`flex-1 py-5 rounded-2xl font-black text-xs sm:text-sm tracking-widest transition-all border-2 ${
                                itemSpecs.reductionType === t 
                                ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {(!selectedItem.id.includes('-portagomma')) && 
                     (!selectedItem.id.includes('-collare')) && 
                     (!selectedItem.id.includes('-femmina')) && 
                     (!selectedItem.id.includes('-maschio')) && 
                     (!selectedItem.id.includes('-girella')) && 
                     (!selectedItem.id.includes('-guarnizione')) && 
                     (!selectedItem.id.includes('-bocchettone')) && 
                     (!selectedItem.id.includes('-cieca')) && 
                     (!selectedItem.id.includes('-tappo-')) && 
                     (!selectedItem.id.includes('-specola')) && 
                     (!selectedItem.id.includes('-reggitubo')) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-')) && selectedItem.id.includes('-riduzione') ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-4">
                              <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Altezza (mm)</label>
                              <div className="px-4 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg text-dark-blue flex items-center justify-between">
                                <span>{itemSpecs.height || '-'}</span>
                                <span className="text-[10px] text-slate-400">mm</span>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Spessore</label>
                              <div className="px-4 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg text-dark-blue flex items-center justify-center">
                                {itemSpecs.thickness}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Spessore</label>
                            {(selectedItem.category === 'LUCIDO' || selectedItem.id.startsWith('lucido-') || selectedItem.category === 'VAPORE' || selectedItem.id.startsWith('vapore-')) ? (
                              <div className="px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl text-dark-blue">
                                {itemSpecs.thickness}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {(
                                  selectedItem.id.includes('-curva') 
                                    ? ['1,5mm', '2mm', '3mm', '4mm']
                                    : (selectedItem.id.includes('-tee') && itemSpecs.teeType === 'RIDOTTO')
                                      ? ['2mm', '3mm']
                                      : selectedItem.id.includes('-tee')
                                        ? ['1,5mm', '2mm', '3mm']
                                        : selectedItem.id.includes('-fondo')
                                          ? ['2mm', '3mm']
                                          : selectedItem.id.includes('-riduzione')
                                            ? ['2mm', '3mm']
                                            : selectedItem.id.includes('-tubo')
                                              ? TUBO_DIAMS_THIN.includes(itemSpecs.diameter.replace('.', ','))
                                                ? ['1mm', '1,5mm']
                                                : ['1mm', '1,5mm', '2mm', '3mm', '4mm']
                                              : ['1mm', '1,5mm', '2mm', '3mm', '4mm']
                                ).map(t => (
                                  <button
                                    key={t}
                                    onClick={() => setItemSpecs(prev => ({ ...prev, thickness: t }))}
                                    className={`flex-1 min-w-[60px] py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                      itemSpecs.thickness === t 
                                      ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                      : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                    }`}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-4">
                          <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Materiale</label>
                          <div className="flex gap-2">
                            {(
                              (selectedItem.category === 'VAPORE' || selectedItem.id.startsWith('vapore-')) 
                                ? ['AISI 316L'] 
                                : ['AISI 304L', 'AISI 316L']
                            ).map(m => (
                              <button
                                key={m}
                                onClick={() => setItemSpecs(prev => ({ ...prev, material: m }))}
                                className={`flex-1 py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                  itemSpecs.material === m 
                                  ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                  : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                }`}
                              >
                                {m.split(' ')[1]}
                              </button>
                            ))}
                          </div>
                        </div>

                        {(selectedItem.category === 'VAPORE' || selectedItem.id.startsWith('vapore-')) && (
                          <div className="space-y-4 col-span-full">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Schedula</label>
                            <div className="flex flex-wrap gap-2">
                              {['10S', '20S', '40S', '80S', '160S'].map(s => (
                                <button
                                  key={s}
                                  onClick={() => setItemSpecs(prev => ({ ...prev, schedula: s }))}
                                  className={`flex-1 min-w-[70px] py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                    itemSpecs.schedula === s 
                                    ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                    : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                  }`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {(selectedItem.id.includes('-portagomma') || selectedItem.id.includes('-collare') || selectedItem.id.includes('-femmina') || selectedItem.id.includes('-maschio') || selectedItem.id.includes('-girella') || selectedItem.id.includes('-guarnizione') || selectedItem.id.includes('-bocchettone') || selectedItem.id.includes('-cieca')) && (
                      <div className="space-y-8">
                        {selectedItem.id.includes('-bocchettone') ? (
                          <>
                            {/* Reordered for Bocchettone: Joining -> Girella -> Gasket -> Process -> Material */}
                            <div className="space-y-4">
                              <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Tipologia attacco</label>
                              <div className="flex flex-wrap gap-2">
                                {['MANDRINARE', 'PARITUBO', 'MEDIO', 'GROSSA'].map(t => (
                                  <button
                                    key={t}
                                    onClick={() => setItemSpecs(prev => ({ ...prev, lucidoJoiningType: t as any }))}
                                    className={`flex-1 min-w-[120px] py-4 rounded-xl font-black text-[10px] sm:text-xs transition-all border-2 ${
                                      itemSpecs.lucidoJoiningType === t 
                                      ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                      : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                    }`}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-4">
                              <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Materiale Girella Bocchettone</label>
                              <div className="flex gap-2">
                                {['AISI 304L', 'AISI 316L'].map(m => (
                                  <button
                                    key={m}
                                    onClick={() => setItemSpecs(prev => ({ ...prev, lucidoGirellaMaterial: m as any }))}
                                    className={`flex-1 py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                      itemSpecs.lucidoGirellaMaterial === m 
                                      ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                      : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                    }`}
                                  >
                                    {m.split(' ')[1]}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-4">
                              <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Materiale Guarnizione Bocchettone</label>
                              <div className="flex flex-wrap gap-2">
                                {['EPDM', 'PTFE', 'NBR', 'VITON'].map(m => (
                                  <button
                                    key={m}
                                    onClick={() => setItemSpecs(prev => ({ ...prev, lucidoGasketMaterial: m as any }))}
                                    className={`flex-1 min-w-[80px] py-4 rounded-xl font-black text-xs transition-all border-2 ${
                                      itemSpecs.lucidoGasketMaterial === m 
                                      ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                      : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                    }`}
                                  >
                                    {m}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-4">
                              <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Processo</label>
                              <div className="flex gap-2">
                                {['MICROFUSO', 'FORGIATO'].map(p => (
                                  <button
                                    key={p}
                                    onClick={() => setItemSpecs(prev => ({ ...prev, lucidoProcess: p as any }))}
                                    className={`flex-1 py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                      itemSpecs.lucidoProcess === p 
                                      ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                      : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-4">
                              <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Materiale</label>
                              <div className="flex gap-2">
                                {['AISI 304L', 'AISI 316L'].map(m => (
                                  <button
                                    key={m}
                                    onClick={() => setItemSpecs(prev => ({ ...prev, material: m }))}
                                    className={`flex-1 py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                      itemSpecs.material === m
                                      ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                      : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                    }`}
                                  >
                                    {m.split(' ')[1] || m}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Standard grouping for other connections */}
                            {(selectedItem.id.includes('-guarnizione') || selectedItem.id.includes('-bocchettone')) && (
                              <div className="space-y-4">
                                <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">
                                  {selectedItem.id.includes('-bocchettone') ? 'Materiale Guarnizione Bocchettone' : 'Materiale Guarnizione'}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  {['EPDM', 'PTFE', 'NBR', 'VITON'].map(m => (
                                    <button
                                      key={m}
                                      onClick={() => setItemSpecs(prev => ({ ...prev, lucidoGasketMaterial: m as any }))}
                                      className={`flex-1 min-w-[80px] py-4 rounded-xl font-black text-xs transition-all border-2 ${
                                        itemSpecs.lucidoGasketMaterial === m 
                                        ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                        : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                      }`}
                                    >
                                      {m}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {selectedItem.id.includes('-bocchettone') && (
                              <div className="space-y-4">
                                <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Materiale Girella Bocchettone</label>
                                <div className="flex gap-2">
                                  {['AISI 304L', 'AISI 316L'].map(m => (
                                    <button
                                      key={m}
                                      onClick={() => setItemSpecs(prev => ({ ...prev, lucidoGirellaMaterial: m as any }))}
                                      className={`flex-1 py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                        itemSpecs.lucidoGirellaMaterial === m 
                                        ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                        : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                      }`}
                                    >
                                      {m.split(' ')[1]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(selectedItem.id.includes('-femmina') || selectedItem.id.includes('-maschio') || selectedItem.id.includes('-girella') || selectedItem.id.includes('-bocchettone') || selectedItem.id.includes('-cieca')) && (
                              <>
                                {(selectedItem.id.includes('-femmina') || selectedItem.id.includes('-maschio') || selectedItem.id.includes('-bocchettone')) && (
                                  <div className="space-y-4">
                                    <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Tipologia attacco</label>
                                    <div className="flex flex-wrap gap-2">
                                      {['MANDRINARE', 'PARITUBO', 'MEDIO', 'GROSSA'].map(t => (
                                        <button
                                          key={t}
                                          onClick={() => setItemSpecs(prev => ({ ...prev, lucidoJoiningType: t as any }))}
                                          className={`flex-1 min-w-[120px] py-4 rounded-xl font-black text-[10px] sm:text-xs transition-all border-2 ${
                                            itemSpecs.lucidoJoiningType === t 
                                            ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                            : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                          }`}
                                        >
                                          {t}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="space-y-4">
                                  <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Processo</label>
                                  <div className="flex gap-2">
                                    {['MICROFUSO', 'FORGIATO'].map(p => {
                                      let label = p;
                                      if (selectedItem.id.includes('-femmina')) {
                                        label = p === 'MICROFUSO' ? 'MICROFUSA' : 'FORGIATA';
                                      }
                                      return (
                                        <button
                                          key={p}
                                          onClick={() => setItemSpecs(prev => ({ ...prev, lucidoProcess: p as any }))}
                                          className={`flex-1 py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                            itemSpecs.lucidoProcess === p 
                                            ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                            : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                          }`}
                                        >
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            )}
                            {(!selectedItem.id.includes('-guarnizione')) && (
                              <div className="space-y-4">
                                <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Materiale</label>
                                <div className="flex gap-2">
                                  {(selectedItem.id.includes('-collare') ? ['AISI 304'] : ['AISI 304L', 'AISI 316L']).map(m => (
                                    <button
                                      key={m}
                                      onClick={() => setItemSpecs(prev => ({ 
                                        ...prev, 
                                        material: m
                                      }))}
                                      className={`flex-1 py-4 rounded-xl font-black text-sm transition-all border-2 ${
                                        itemSpecs.material === m
                                        ? 'bg-dark-blue text-white border-dark-blue shadow-lg shadow-dark-blue/20' 
                                        : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                                      }`}
                                    >
                                      {m.split(' ')[1] || m}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Generic UI for other items */
              <div className="space-y-4">
                <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Caratteristiche / Diametro</label>
                <input 
                  type="text"
                  placeholder='es. DN25, 1", 104mm...'
                  value={itemSpecs.measure}
                  onChange={(e) => setItemSpecs(prev => ({ ...prev, measure: e.target.value }))}
                  className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-dark-blue outline-none font-bold text-xl"
                />
              </div>
            )}

                <div className="space-y-4">
                  <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2">Quantità ({selectedItem.unit})</label>
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-3xl border-2 border-slate-100">
                    <button 
                      onClick={() => setItemSpecs(prev => ({ 
                        ...prev, 
                        quantity: Math.max((selectedItem.id.includes('-tubo')) ? 6 : 1, prev.quantity - ((selectedItem.id.includes('-tubo')) ? 6 : 1)) 
                      }))}
                      className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg text-slate-600 hover:text-dark-blue active:scale-95 transition-all"
                    >
                      <Minus className="w-8 h-8" />
                    </button>
                    <div className="text-center flex flex-col items-center">
                      <input 
                        type="number"
                        min={(selectedItem.id.includes('-tubo')) ? "6" : "1"}
                        step={(selectedItem.id.includes('-tubo')) ? "6" : "1"}
                        value={itemSpecs.quantity}
                        onChange={(e) => setItemSpecs(prev => ({ ...prev, quantity: Number(e.target.value) || 0 }))}
                        className="w-24 bg-transparent text-4xl font-black text-slate-900 text-center outline-none"
                      />
                      <span className="block text-xs font-black text-slate-400 uppercase mt-1">{selectedItem.unit}</span>
                    </div>
                    <button 
                      onClick={() => setItemSpecs(prev => ({ 
                        ...prev, 
                        quantity: prev.quantity + ((selectedItem.id.includes('-tubo')) ? 6 : 1) 
                      }))}
                      className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg text-slate-600 hover:text-dark-blue active:scale-95 transition-all"
                    >
                      <Plus className="w-8 h-8" />
                    </button>
                  </div>
                </div>

                <div className="relative pt-4">
                  <AnimatePresence>
                    {showAddedMsg && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute -top-12 left-0 right-0 text-center"
                      >
                        <span className="bg-green-100 text-green-600 px-6 py-2 rounded-full font-black text-sm uppercase tracking-widest">
                          Articolo aggiunto!
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <div className="flex flex-col gap-4">
                    <button 
                      onClick={addToCart}
                      className="w-full py-6 bg-dark-blue text-white rounded-2xl font-black shadow-xl shadow-dark-blue/20 hover:scale-[1.02] transition-all uppercase tracking-widest text-lg flex items-center justify-center gap-3"
                    >
                      <ListPlus className="w-6 h-6" />
                      AGGIUNGI
                    </button>


                    <button 
                      onClick={() => setSelectedItem(null)}
                      className="w-full py-6 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      CHIUDI
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* Selection Screens */
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
                <input 
                  type="text"
                  placeholder="Cerca materiale..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-16 pr-6 py-5 bg-white border-2 border-slate-200 rounded-2xl focus:border-dark-blue outline-none font-bold text-lg shadow-lg"
                />
              </div>

              {/* Navigation path */}
              <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-400 uppercase tracking-widest px-2 overflow-x-auto whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <button onClick={resetSelection} className="hover:text-dark-blue">CATEGORIE</button>
                  {selectedCategory && (
                    <>
                      <ChevronLeft className="w-3 h-3 rotate-180" />
                      <button onClick={() => { setSelectedSubcategory(null); setSelectedItem(null); }} className="text-dark-blue">{selectedCategory}</button>
                    </>
                  )}
                  {selectedSubcategory && (
                    <>
                      <ChevronLeft className="w-3 h-3 rotate-180" />
                      <span className="text-dark-blue opacity-50">
                        {(() => {
                          if (selectedCategory && Array.isArray(MATERIAL_DATA[selectedCategory])) {
                            const parentItem = MATERIAL_DATA[selectedCategory].find((i: any) => i.id === selectedSubcategory);
                            return parentItem ? parentItem.name : selectedSubcategory;
                          }
                          return selectedSubcategory;
                        })()}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className={(searchQuery || (selectedCategory && Array.isArray(MATERIAL_DATA[selectedCategory])) || selectedSubcategory) ? "flex flex-wrap gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
                {searchQuery ? (
                  searchResults.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setSelectedItem(item); setSearchQuery(''); }}
                      className="bg-white px-6 py-4 rounded-2xl border-2 border-slate-100 shadow-md hover:border-dark-blue transition-all text-left group active:scale-95"
                    >
                      <h4 className="font-black text-slate-800 group-hover:text-dark-blue mb-1 uppercase">{item.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.category} {item.subcategory && `> ${item.subcategory}`}</p>
                    </button>
                  ))
                ) : !selectedCategory ? (
                  /* Primary Categories */
                  MATERIAL_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className="bg-white h-32 sm:h-40 p-8 rounded-[2rem] border-2 border-slate-100 shadow-lg hover:border-dark-blue hover:shadow-xl transition-all flex flex-col justify-center items-center gap-3 active:scale-95 group"
                    >
                      <div className="w-12 h-12 bg-slate-50 group-hover:bg-dark-blue/5 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-dark-blue transition-colors">
                        <Cylinder className="w-6 h-6" />
                      </div>
                      <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-widest uppercase">{cat}</span>
                    </button>
                  ))
                ) : !selectedSubcategory && MATERIAL_DATA[selectedCategory] ? (
                  Array.isArray(MATERIAL_DATA[selectedCategory]) ? (
                    MATERIAL_DATA[selectedCategory]
                      .filter((item: any) => !item.parentId)
                      .map((item: any) => {
                        const hasChildren = MATERIAL_DATA[selectedCategory].some((i: any) => i.parentId === item.id);
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              if (hasChildren) setSelectedSubcategory(item.id);
                              else setSelectedItem({ ...item, category: selectedCategory });
                            }}
                            className="bg-white px-8 py-5 rounded-2xl border-2 border-slate-100 shadow-lg hover:border-dark-blue transition-all flex items-center gap-4 group active:scale-95"
                          >
                            <span className="text-xl font-black text-slate-900 group-hover:text-dark-blue uppercase">{item.name}</span>
                            <ChevronLeft className="w-5 h-5 rotate-180 text-slate-300 group-hover:text-dark-blue" />
                          </button>
                        );
                      })
                  ) : (
                    Object.keys(MATERIAL_DATA[selectedCategory]).map(sub => (
                      <button
                        key={sub}
                        onClick={() => setSelectedSubcategory(sub)}
                        className="bg-white h-32 p-8 rounded-[2rem] border-2 border-slate-100 shadow-lg hover:border-dark-blue hover:shadow-xl transition-all flex flex-col justify-center items-center gap-3 active:scale-95 group"
                      >
                        <span className="text-xl font-black text-slate-900 tracking-widest uppercase text-center">{sub}</span>
                      </button>
                    ))
                  )
                ) : selectedSubcategory ? (
                  (() => {
                    const categoryData = MATERIAL_DATA[selectedCategory!];
                    if (!categoryData) return null;
                    
                    const items = Array.isArray(categoryData)
                      ? categoryData.filter((item: any) => item.parentId === selectedSubcategory || item.id === selectedSubcategory)
                      : categoryData[selectedSubcategory];
                    
                    if (!items || !Array.isArray(items)) return null;

                    return items.map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItem({ ...item, category: selectedCategory, subcategory: selectedSubcategory })}
                        className="bg-white px-8 py-5 rounded-2xl border-2 border-slate-100 shadow-lg hover:border-dark-blue transition-all flex items-center gap-4 group active:scale-95"
                      >
                        <span className="text-xl font-black text-slate-900 group-hover:text-dark-blue uppercase">{item.name}</span>
                        <ChevronLeft className="w-5 h-5 rotate-180 text-slate-300 group-hover:text-dark-blue" />
                      </button>
                    ));
                  })()
                ) : null}
              </div>

              {searchQuery && searchResults.length === 0 && (
                <div className="py-20 text-center opacity-50">
                  <Search className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="font-black uppercase tracking-widest">Nessun risultato</p>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Step 3: Recap */}
      {step === 3 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="text-center">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">RIEPILOGO LISTA</h1>
            <p className="text-slate-500 font-medium mt-2">Controlla i diametri e le quantità</p>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-8 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-dark-blue text-white rounded-xl flex items-center justify-center shadow-lg">
                  <Cylinder className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 leading-none text-xl">{formData.cantiere}</h3>
                  <p className="text-slate-500 text-xs font-bold mt-1 uppercase">{formData.intervento}</p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {cart.map(item => (
                <div key={item.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-black text-slate-800 text-lg uppercase leading-tight">{item.name}</h4>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.category}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center bg-slate-50 rounded-2xl p-1 border border-slate-100">
                      <button 
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-3 hover:bg-white rounded-xl transition-colors text-slate-600"
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <div className="w-16 text-center">
                        <span className="font-black text-slate-900 text-xl">{item.quantity}</span>
                        <span className="text-[10px] font-bold text-slate-400 ml-1 uppercase">{item.unit}</span>
                      </div>
                      <button 
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-3 hover:bg-white rounded-xl transition-colors text-slate-600"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="p-4 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                    >
                      <Trash2 className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-200 space-y-6">
              {error && <p className="text-red-600 text-center font-black uppercase text-sm">{error}</p>}
              <div className="flex flex-col gap-4">
                {currentRequestId && !isEditable(lastRequests.find(r => r.id === currentRequestId)!) ? (
                  <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700 font-bold text-center">
                    Questa lista non è più modificabile poiché è già stata visualizzata dall'ufficio o è trascorso il tempo limite.
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                      onClick={() => setStep(2)}
                      className="flex-1 py-6 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-slate-50 transition-all"
                    >
                      <ListPlus className="w-6 h-6" />
                      PIÙ ARTICOLI
                    </button>
                    <button 
                      onClick={() => handleSubmit('INVIATA')}
                      disabled={loading}
                      className="flex-[2] py-6 bg-dark-blue text-white rounded-2xl font-black shadow-2xl shadow-dark-blue/20 hover:scale-[1.01] transition-transform uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loading ? 'INVIO IN CORSO...' : (
                        <>
                          <Send className="w-6 h-6" />
                          INVIA LISTA
                        </>
                      )}
                    </button>
                  </div>
                )}
                
                {(!currentRequestId || (lastRequests.find(r => r.id === currentRequestId)?.status === 'draft')) && (
                  <button 
                    onClick={() => handleSubmit('draft')}
                    disabled={loading}
                    className="w-full py-4 bg-orange-50 text-orange-600 border border-orange-200 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-orange-100 transition-all disabled:opacity-50"
                  >
                    <Check className="w-5 h-5" />
                    SALVA BOZZA (COMPLETA DOPO)
                  </button>
                )}

                {(currentRequestId || cart.length > 0) && (
                  <button 
                    onClick={() => deleteRequest(currentRequestId)}
                    disabled={loading}
                    className="w-full py-4 bg-red-50 text-red-600 border border-red-200 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-red-100 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5" />
                    {currentRequestId ? 'ELIMINA LISTA' : 'SVUOTA LISTA'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

