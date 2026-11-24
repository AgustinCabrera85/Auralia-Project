import { LoadingScreen, paintLoadingScreen } from './ui/LoadingScreen';

const loading=new LoadingScreen();
async function boot():Promise<void>{
  await paintLoadingScreen();
  loading.update(3,'Abriendo el libro de viaje…','modules');
  const {start}=await import('./main');
  performance.mark('auralia:modules-ready');
  await start(loading);
}
void boot().catch(error=>loading.fail(error));
