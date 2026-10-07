import { sumDecimals, subtractDecimals } from './byteplusBillingCsv.js';

const knownSum = (rows, key) => rows.some(row=>row[key] == null) ? null : sumDecimals(rows.map(row=>row[key]));

// Mapping reports classification of supplier evidence, not per-job allocation.
export function providerBillingSummary(groups, requests) {
  const mapped=groups.filter(group=>group.mapping?.model);
  const unmapped=groups.filter(group=>!group.mapping?.model);
  const models=[...new Set([...mapped.map(group=>group.mapping.model),...requests.map(row=>row.model)])].sort();
  return {
    mappedSkuCount:mapped.length,unmappedSkuCount:unmapped.length,totalSkuCount:groups.length,
    mappedPreTaxUsd:knownSum(mapped,'pre_tax_usd'),unmappedPreTaxUsd:knownSum(unmapped,'pre_tax_usd'),
    scope:'sku_model_classification',allocationStatus:'unallocated',
    rows:models.map(model=>{
      const skus=mapped.filter(group=>group.mapping.model===model);
      const usage=requests.filter(row=>row.model===model);
      const billedPreTaxUsd=skus.length ? knownSum(skus,'pre_tax_usd') : null;
      const knownRequestCostUsd=usage.length ? knownSum(usage,'known_cost_usd') : null;
      const unknownRequests=usage.reduce((n,row)=>n+Number(row.unknown_requests),0);
      return {model,skuCount:skus.length,billedPreTaxUsd,knownRequestCostUsd,
        requestCount:usage.reduce((n,row)=>n+Number(row.requests),0),unknownRequests,
        differenceUsd:billedPreTaxUsd != null && knownRequestCostUsd != null ? subtractDecimals(billedPreTaxUsd,knownRequestCostUsd) : null,
        hasPackageOrPlan:skus.some(group=>group.rate_status==='package_or_plan'),
        status:!skus.length ? 'no_mapped_sku' : !usage.length ? 'no_app_requests' : unknownRequests ? 'unknown_request_costs' : 'comparison_only'};
    }),
  };
}
