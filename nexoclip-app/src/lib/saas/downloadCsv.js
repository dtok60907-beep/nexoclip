export async function downloadCsv(path,{signal,filename}={}){
 if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))throw new Error('URL unduhan tidak valid');
 const response=await fetch(path,{credentials:'include',headers:{accept:'text/csv'},signal});
 if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error||'Ekspor tidak dapat diproses');}
 if(!response.headers.get('content-type')?.startsWith('text/csv'))throw new Error('Format ekspor tidak valid');
 const blob=await response.blob();if(signal?.aborted)return;
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 try{link.href=url;link.download=filename;document.body.appendChild(link);link.click();}
 finally{link.remove();URL.revokeObjectURL(url);}
}
