async function startPreview(){
  const source=new URLSearchParams(location.search).get('source')??'worldstudio-hybrid';
  if(source==='import-reference'){
    await import('./main.js');
  }else{
    const {startGeographicValidation}=await import('../world-validation/main');
    await startGeographicValidation(source);
  }
}
void startPreview().catch(error=>{
  console.error(error);
  const loading=document.querySelector('#loading');
  loading.hidden=false;
  loading.textContent=`No se pudo preparar la geografía: ${String(error)}`;
});
