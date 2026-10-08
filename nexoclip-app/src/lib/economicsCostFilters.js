export const economicsCostFilters = [
  {value:'all',label:'Semua status biaya'},
  {value:'needs_reconciliation',label:'Perlu pencocokan bukti'},
  {value:'reconciled',label:'Semua request dicocokkan'},
  {value:'incomplete',label:'Data biaya belum lengkap'},
  {value:'estimated',label:'Ada estimasi dari usage'},
  {value:'provider_reported',label:'Dilaporkan, belum dicocokkan'},
];
export const isEconomicsCostFilter = value => economicsCostFilters.some(option=>option.value===value);
export const economicsCostFilterLabel = value => economicsCostFilters.find(option=>option.value===value)?.label || economicsCostFilters[0].label;
