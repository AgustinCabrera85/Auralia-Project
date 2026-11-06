/** Auralia: deterministic environmental clock and weather. No Babylon dependency. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'partlyCloudy' | 'overcast' | 'rain' | 'storm' | 'snow';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHERS: readonly Weather[] = ['clear', 'partlyCloudy', 'overcast', 'rain', 'storm', 'snow'];
export const SEASON_LABELS: Record<Season, string> = {
  spring:'Primavera', summer:'Verano', autumn:'Otoño', winter:'Invierno'
};
export const WEATHER_LABELS: Record<Weather, string> = {
  clear:'Despejado', partlyCloudy:'Parcialmente nublado', overcast:'Nublado',
  rain:'Lluvia', storm:'Tormenta', snow:'Nevada'
};
export const WEATHER_ICONS:Record<Weather,string> = {
  clear:'☀️', partlyCloudy:'🌤️', overcast:'☁️', rain:'🌧️', storm:'⛈️', snow:'❄️'
};
/** 36 real minutes per Auralia day; adjustable without touching rendering. */
export const REAL_SECONDS_PER_GAME_DAY = 36 * 60;
export const DAYS_PER_SEASON = 12;
export const START_HOUR = 9;

export type RGB = readonly [number,number,number];
export type WeatherMix = { cloud: number; rain: number; snow: number; fog: number; darken: number; wind: number };
export type ClimateFrame = {
  elapsedHours:number; hour:number; day:number; season:Season; weather:Weather;
  sunDirection:readonly [number,number,number]; sunHeight:number;
  dayLight:number; night:number; twilight:number;
  skyTop:RGB; skyHorizon:RGB; cloudColor:RGB; sunColor:RGB;
  weatherMix:WeatherMix;
};

const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const color=(a:RGB,b:RGB,t:number):RGB=>[
  lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)
];

const WEATHER_PROPERTIES:Record<Weather,WeatherMix>={
  clear:       {cloud:.05,rain:0,snow:0,fog:1,darken:0,wind:.22},
  partlyCloudy:{cloud:.43,rain:0,snow:0,fog:1.05,darken:.06,wind:.40},
  overcast:    {cloud:.83,rain:0,snow:0,fog:1.34,darken:.27,wind:.52},
  rain:        {cloud:.92,rain:.68,snow:0,fog:1.7,darken:.32,wind:.72},
  storm:       {cloud:1,rain:1,snow:0,fog:2.1,darken:.52,wind:1},
  snow:        {cloud:.92,rain:0,snow:.75,fog:1.65,darken:.28,wind:.52}
};
const DISTRIBUTION:Record<Season,readonly number[]> = {
  // clear, scattered, overcast, rain, storm, snow: normalized percentage weights
  spring:[27,26,21,20,6,0],
  summer:[43,31,12,8,6,0],
  autumn:[24,24,25,23,4,0],
  winter:[18,20,25,6,3,28]
};
/** Integer hash stable across reloads; no random weather changes every frame. */
function random01(x:number):number{
  let n=(x+0x6d2b79f5)|0;
  n=Math.imul(n^(n>>>15),n|1);
  n^=n+Math.imul(n^(n>>>7),n|61);
  return ((n^(n>>>14))>>>0)/4294967296;
}
export function getSeason(day:number):Season{
  const seasonIndex=((Math.floor(day/DAYS_PER_SEASON)%4)+4)%4;
  return SEASONS[seasonIndex];
}
function weatherBySlot(slot:number):Weather{
  const day=Math.max(0,Math.floor(slot/6));
  const weights=DISTRIBUTION[getSeason(day)];
  const value=random01(Math.imul(slot,1664525)+1013904223)*100;
  let cursor=0;
  for(let i=0;i<WEATHERS.length;i++){
    cursor+=weights[i];
    if(value<cursor)return WEATHERS[i];
  }
  return 'clear';
}
export function getWeatherForTime(elapsedHours:number):Weather{
  return weatherBySlot(Math.floor(Math.max(0,elapsedHours)/4));
}
function mixWeather(a:Weather,b:Weather,t:number):WeatherMix{
  const source=WEATHER_PROPERTIES[a],target=WEATHER_PROPERTIES[b];
  return {
    cloud:lerp(source.cloud,target.cloud,t),rain:lerp(source.rain,target.rain,t),
    snow:lerp(source.snow,target.snow,t),fog:lerp(source.fog,target.fog,t),
    darken:lerp(source.darken,target.darken,t),wind:lerp(source.wind,target.wind,t)
  };
}
const PALETTE:Record<Season,{top:RGB;horizon:RGB}>={
  spring:{top:[.16,.49,.88],horizon:[.74,.87,.98]},
  summer:{top:[.12,.47,.85],horizon:[.78,.88,.98]},
  autumn:{top:[.27,.49,.76],horizon:[.84,.79,.68]},
  winter:{top:[.25,.43,.68],horizon:[.75,.83,.91]}
};

/** Stateless environment sample; all consumers see one clock and one weather state. */
export function sampleClimate(hoursElapsed:number,forcedWeather:Weather|null=null):ClimateFrame{
  const elapsedHours=Number.isFinite(hoursElapsed)?Math.max(0,hoursElapsed):START_HOUR;
  const day=Math.floor(elapsedHours/24);
  const hour=elapsedHours%24;
  const season=getSeason(day);
  const seasonProgress=((day%DAYS_PER_SEASON)+hour/24)/DAYS_PER_SEASON;
  const towardNext=smooth(.55,1,seasonProgress);
  const nextSeason=getSeason(day+DAYS_PER_SEASON);
  const currentPalette=PALETTE[season], nextPalette=PALETTE[nextSeason];
  const baseTop=color(currentPalette.top,nextPalette.top,towardNext);
  const baseHorizon=color(currentPalette.horizon,nextPalette.horizon,towardNext);
  // Summer sun rises earlier; winter has a lower, shorter arc.
  const seasonalTilt=Math.sin(elapsedHours/(24*DAYS_PER_SEASON*4)*Math.PI*2)*.20;
  const angle=(hour-6)*Math.PI/12;
  const rawHeight=Math.sin(angle)+seasonalTilt;
  const rawX=Math.cos(angle);
  const rawZ=.2*Math.cos(angle+.55);
  const length=Math.hypot(rawX,rawHeight,rawZ)||1;
  const sunDirection:[number,number,number]=[rawX/length,rawHeight/length,rawZ/length];
  const sunHeight=sunDirection[1];
  const dayLight=smooth(-.10,.23,sunHeight);
  const night=1-smooth(-.22,.13,sunHeight);
  const twilight=(1-smooth(.05,.48,Math.abs(sunHeight)))*smooth(-.24,-.03,sunHeight);

  const slot=Math.floor(elapsedHours/4);
  const progress=elapsedHours-slot*4;
  const prev=weatherBySlot(Math.max(0,slot-1));
  const next=weatherBySlot(slot);
  const transition=smooth(0,.65,progress);
  const weather=forcedWeather??(transition<.5?prev:next);
  const weatherMix=forcedWeather?WEATHER_PROPERTIES[forcedWeather]:mixWeather(prev,next,transition);

  let skyTop=color([.012,.03,.085],baseTop,dayLight);
  let skyHorizon=color([.06,.10,.17],baseHorizon,dayLight);
  const sunsetTint:RGB=[1,.40,.18];
  skyHorizon=color(skyHorizon,sunsetTint,twilight*.56);
  const rainHorizon:RGB=[.28,.35,.46];
  skyTop=color(skyTop,[.14,.18,.27],weatherMix.darken*.84);
  skyHorizon=color(skyHorizon,rainHorizon,weatherMix.darken*.72);
  const cloudColor=color([.22,.28,.36],[.96,.97,.99],dayLight*(1-weatherMix.darken*.82));
  const sunColor=color([1,.89,.72],[1,.62,.34],twilight);
  return {
    elapsedHours,hour,day,season,weather,sunDirection,sunHeight,dayLight,night,twilight,
    skyTop,skyHorizon,cloudColor,sunColor,weatherMix
  };
}
