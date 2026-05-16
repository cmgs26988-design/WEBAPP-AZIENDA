
export const formatNumber = (num: number | string): string => {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '0';
  
  // Use it-IT locale for comma as decimal separator
  // minimumFractionDigits: 0 ensures no .0 for integers
  return n.toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
};

export const capitalizeFirst = (str: string): string => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};
