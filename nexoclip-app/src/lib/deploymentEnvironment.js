export function deploymentEnvironment(env=process.env) {
  const value=String(env.NEXOCLIP_ENVIRONMENT || '').trim();
  if (!value) return 'unclassified';
  if (!['development','production'].includes(value)) throw new Error('NEXOCLIP_ENVIRONMENT must be development or production');
  const account=String(env.BYTEPLUS_BILLING_ACCOUNT_ID || '').trim();
  const productionAccount=String(env.BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID || '').trim();
  for (const [name,id] of [['BYTEPLUS_BILLING_ACCOUNT_ID',account],['BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID',productionAccount]]) {
    if (id && !/^[0-9]{1,32}$/.test(id)) throw new Error(`${name} must be a numeric billing account ID`);
  }
  if (value==='production' && String(env.BYTEPLUS_API_KEY || '').trim()) {
    if (!account || !productionAccount) throw new Error('Production BytePlus requires BYTEPLUS_BILLING_ACCOUNT_ID and BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID');
    if (account!==productionAccount) throw new Error('BytePlus billing account does not match the configured production account');
  }
  if (value==='development' && account && account===productionAccount) throw new Error('Development must not use the configured production BytePlus billing account');
  return value;
}
