export function parseByteRange(value,size) {
  if(!value)return null;
  const invalid=()=>Object.assign(new Error('Requested range is not available'),{status:416,size});
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!match||!Number.isSafeInteger(size)||size<1||!match[1]&&!match[2])throw invalid();
  let start=match[1]?Number(match[1]):null,end=match[2]?Number(match[2]):size-1;
  if(start===null){if(!Number.isSafeInteger(end)||end<1)throw invalid();start=Math.max(0,size-end);end=size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw invalid();
  return {start,end:Math.min(end,size-1)};
}
