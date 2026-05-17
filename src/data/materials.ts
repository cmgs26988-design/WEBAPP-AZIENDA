export interface MaterialItem {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  unit: string;
}

export const MATERIAL_CATEGORIES = [
  'OPACO',
  'FILETTATO',
  'LUCIDO',
  'VAPORE',
  'FLANGE',
  'VALVOLE',
  'PRESSARE',
  'ARIA',
  'PVC',
  'VITERIA',
  'ACCESSORI'
];

export const MATERIAL_DATA: Record<string, any> = {
  'OPACO': [
    { id: 'opaco-tubo', name: 'TUBO', unit: 'mt' },
    { id: 'opaco-curva', name: 'CURVA', unit: 'NR' },
    { id: 'opaco-tee', name: 'TEE', unit: 'NR' },
    { id: 'opaco-riduzione', name: 'RIDUZIONE', unit: 'NR' },
    { id: 'opaco-collare', name: 'COLLARE', unit: 'NR' },
    { id: 'opaco-portagomma', name: 'PORTAGOMMA', unit: 'NR' },
    { id: 'opaco-fondo', name: 'FONDO BOMBATO', unit: 'NR' },
  ],
  'FILETTATO': [
    { id: 'fil-manicotto', name: 'MANICOTTO', unit: 'pz' },
    { id: 'fil-gomito', name: 'GOMITO', unit: 'NR' },
    { id: 'fil-tee', name: 'TEE', unit: 'pz' },
    { id: 'fil-nipples', name: 'NIPPLES', unit: 'pz' },
    { id: 'fil-tappo', name: 'TAPPO', unit: 'pz' },
  ],
  'LUCIDO': [
    { id: 'lucido-tubo', name: 'TUBO', unit: 'mt' },
    { id: 'lucido-curva', name: 'CURVA', unit: 'pz' },
    { id: 'lucido-tee', name: 'TEE', unit: 'pz' },
    { id: 'lucido-riduzione', name: 'RIDUZIONE', unit: 'pz' },
    { id: 'lucido-fondo', name: 'FONDO BOMBATO', unit: 'pz' },
    { id: 'lucido-croce', name: 'CROCE', unit: 'pz' },
    { id: 'lucido-reggitubo', name: 'REGGITUBO', unit: 'pz' },
    { id: 'lucido-adattatore', name: 'ADATTATORE DIN/GAS', unit: 'pz' },
    { id: 'lucido-femmina', name: 'FEMMINA', unit: 'pz' },
    { id: 'lucido-maschio', name: 'MASCHIO', unit: 'pz' },
    { id: 'lucido-girella', name: 'GIRELLA', unit: 'pz' },
    { id: 'lucido-guarnizione', name: 'GUARNIZIONE', unit: 'pz' },
    { id: 'lucido-bocchettone', name: 'BOCCHETTONE', unit: 'pz' },
    { id: 'lucido-cieca', name: 'GIRELLA CIECA', unit: 'pz' },
    { id: 'lucido-tappo-m', name: 'TAPPO MASCHIO', unit: 'pz' },
    { id: 'lucido-tappo-f', name: 'TAPPO FEMMINA', unit: 'pz' },
    { id: 'lucido-specola', name: 'SPECOLA PIANA', unit: 'pz' },
    { id: 'lucido-specola-vetro', name: 'VETRO', unit: 'pz', parentId: 'lucido-specola' },
    { id: 'lucido-specola-guarnizione', name: 'GUARNIZIONE SPECOLA', unit: 'pz', parentId: 'lucido-specola' },
  ],
  'VAPORE': [
    { id: 'vapore-tubo', name: 'TUBO', unit: 'mt' },
    { id: 'vapore-curva', name: 'CURVA', unit: 'NR' },
    { id: 'vapore-tee', name: 'TEE', unit: 'pz' },
    { id: 'vapore-riduzione', name: 'RIDUZIONE', unit: 'pz' },
    { id: 'vapore-fondo', name: 'FONDO BOMBATO', unit: 'pz' },
  ],
  'FLANGE': [
    { id: 'flangia-piana', name: 'PIANA', unit: 'pz' },
    { id: 'flangia-gradino', name: 'GRADINO', unit: 'pz' },
    { id: 'flangia-collarino', name: 'COLLARINO', unit: 'pz' },
    { id: 'flangia-cieca', name: 'CIECA', unit: 'pz' },
    { id: 'flangia-alluminio', name: 'ALLUMINIO', unit: 'pz' },
    { id: 'flangia-cartella', name: 'CARTELLA', unit: 'pz' },
    { id: 'flangia-guarnizioni', name: 'GUARNIZIONI', unit: 'pz' },
  ],
  'VALVOLE': {
    'SFERA': [
      { id: 'valv-sfera-1', name: 'VALVOLA A SFERA 1"', unit: 'pz' },
      { id: 'valv-sfera-2', name: 'VALVOLA A SFERA 2"', unit: 'pz' },
    ],
    'FARFALLA': [
      { id: 'valv-farf-dn40', name: 'VALVOLA A FARFALLA DN40', unit: 'pz' },
      { id: 'valv-farf-dn50', name: 'VALVOLA A FARFALLA DN50', unit: 'pz' },
    ],
    'RITEGNO': [
      { id: 'valv-rit-1', name: 'VALVOLA DI RITEGNO 1"', unit: 'pz' },
    ]
  },
  'PRESSARE': [
    { id: 'press-tubo', name: 'TUBO', unit: 'mt' },
    { id: 'press-curva-ff', name: 'CURVA FF', unit: 'NR' },
    { id: 'press-curva-mf', name: 'CURVA MF', unit: 'NR' },
    { id: 'press-curva-90-m', name: 'CURVA 90° FIL. M', unit: 'NR' },
    { id: 'press-manic-ff', name: 'MANICOTTO FF', unit: 'pz' },
    { id: 'press-manic-pass', name: 'MANICOTTO PASSANTE', unit: 'pz' },
    { id: 'press-manic-sald', name: 'MANICOTTO A SALD.', unit: 'pz' },
    { id: 'press-manic-mist-m', name: 'MANICOTTO MISTO FIL. M', unit: 'pz' },
    { id: 'press-manic-mist-f', name: 'MANICOTTO MISTO FIL. F', unit: 'pz' },
    { id: 'press-guarnizione', name: 'GUARNIZIONE', unit: 'pz' },
    { id: 'press-gomito-90-f', name: 'GOMITO 90° FIL. F', unit: 'NR' },
    { id: 'press-tappo-f', name: 'TAPPO F', unit: 'pz' },
    { id: 'press-rid-mf', name: 'RIDUZIONE MF', unit: 'pz' },
    { id: 'press-tee', name: 'TEE', unit: 'pz' },
    { id: 'press-tee-rid', name: 'TEE RIDOTTO', unit: 'pz' },
    { id: 'press-tee-f', name: 'TEE FIL. F', unit: 'pz' },
    { id: 'press-bocc-m', name: 'BOCCHETTONE FIL. M', unit: 'pz' },
    { id: 'press-gomito-staffa', name: 'GOMITO 90° FIL. F STAFFA', unit: 'NR' },
    { id: 'press-gomito-90-m', name: 'GOMITO 90° FIL. M', unit: 'NR' },
  ],
  'ARIA': [
    { id: 'racc-rap-10-14', name: 'RACCORDO RAPIDO 10mm x 1/4"', unit: 'pz' },
    { id: 'tubo-rilsan-10', name: 'TUBO RILSAN 10mm', unit: 'mt' },
  ],
  'PVC': [
    { id: 'curva-pvc-dn50', name: 'CURVA d.50 ad incollaggio', unit: 'NR' },
    { id: 'tubo-pvc-dn50', name: 'TUBO d.50 ad incollaggio', unit: 'mt' },
  ],
  'VITERIA': [
    { id: 'vite-m8x30', name: 'VITE TE M8x30 INOX A2', unit: 'pz' },
    { id: 'vite-m10x40', name: 'VITE TE M10x40 INOX A2', unit: 'pz' },
    { id: 'dado-m8', name: 'DADO M8 INOX A2', unit: 'pz' },
    { id: 'dado-m10', name: 'DADO M10 INOX A2', unit: 'pz' },
    { id: 'rondella-m8', name: 'RONDELLA PIANA M8 INOX', unit: 'pz' },
    { id: 'rondella-m10', name: 'RONDELLA PIANA M10 INOX', unit: 'pz' },
  ],
  'ACCESSORI': [
    { id: 'collare-dn25', name: 'COLLARE REGGITUBO DN25 INOX', unit: 'pz' },
    { id: 'collare-dn40', name: 'COLLARE REGGITUBO DN40 INOX', unit: 'pz' },
    { id: 'barra-filettata-m8', name: 'BARRA FILETTATA M8 INOX 1mt', unit: 'pz' },
    { id: 'tassello-m8', name: 'TASSELLO M8 OTTONE/INOX', unit: 'pz' },
  ]
};

export const PIPE_SIZES = [
  { mm: '10', inch: '-', dn: '-' },
  { mm: '12', inch: '-', dn: '10' },
  { mm: '13,7', inch: '1/4"', dn: '8' },
  { mm: '17,2', inch: '3/8"', dn: '10' },
  { mm: '18', inch: '-', dn: '15' },
  { mm: '19,05', inch: '3/4"', dn: '15' },
  { mm: '20', inch: '-', dn: '-' },
  { mm: '21,3', inch: '1/2"', dn: '15' },
  { mm: '22', inch: '-', dn: '20' },
  { mm: '23', inch: '-', dn: '20' },
  { mm: '25', inch: '-', dn: '-' },
  { mm: '25,4', inch: '1"', dn: '-' },
  { mm: '26,9', inch: '3/4"', dn: '20' },
  { mm: '28', inch: '-', dn: '25' },
  { mm: '29', inch: '-', dn: '25' },
  { mm: '30', inch: '-', dn: '-' },
  { mm: '32', inch: '-', dn: '-' },
  { mm: '33,7', inch: '1"', dn: '25' },
  { mm: '34', inch: '-', dn: '32' },
  { mm: '35', inch: '-', dn: '32' },
  { mm: '38', inch: '-', dn: '-' },
  { mm: '40', inch: '-', dn: '40' },
  { mm: '41', inch: '-', dn: '40' },
  { mm: '42,4', inch: '1" 1/4', dn: '32' },
  { mm: '48,3', inch: '1" 1/2', dn: '40' },
  { mm: '52', inch: '-', dn: '50' },
  { mm: '53', inch: '-', dn: '50' },
  { mm: '60,3', inch: '2"', dn: '50' },
  { mm: '70', inch: '-', dn: '65' },
  { mm: '76,1', inch: '2" 1/2', dn: '65' },
  { mm: '85', inch: '-', dn: '80' },
  { mm: '88,9', inch: '3"', dn: '80' },
  { mm: '101,6', inch: '3" 1/2', dn: '100' },
  { mm: '104', inch: '-', dn: '100' },
  { mm: '114,3', inch: '4"', dn: '100' },
  { mm: '129', inch: '-', dn: '125' },
  { mm: '133', inch: '-', dn: '-' },
  { mm: '139,7', inch: '5"', dn: '125' },
  { mm: '154', inch: '-', dn: '150' },
  { mm: '168,3', inch: '6"', dn: '150' },
  { mm: '204', inch: '-', dn: '200' },
  { mm: '219,1', inch: '8"', dn: '200' },
  { mm: '273', inch: '10"', dn: '250' },
  { mm: '323,9', inch: '12"', dn: '300' },
  { mm: '355', inch: '14"', dn: '350' },
  { mm: '406,4', inch: '16"', dn: '400' },
  { mm: '457', inch: '18"', dn: '450' },
  { mm: '508', inch: '20"', dn: '500' },
  { mm: '609', inch: '24"', dn: '600' },
  { mm: '711', inch: '28"', dn: '700' },
];

export const ALL_MATERIALS: MaterialItem[] = Object.entries(MATERIAL_DATA).flatMap(([cat, content]) => {
  if (Array.isArray(content)) {
    return content.map((item: any) => ({
      ...item,
      category: cat
    }));
  }
  return Object.entries(content).flatMap(([subcat, items]: [string, any]) => {
    return items.map((item: any) => ({
      ...item,
      category: cat,
      subcategory: subcat
    }));
  });
});

