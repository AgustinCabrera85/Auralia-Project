/** Organic cumulus silhouettes with stable depth and opaque front-to-back cores. */
export const NOISE_CLOUD_FUNCTIONS = `
uniform sampler2D uCloudField;
uniform float uCloudEnabled;
uniform float uCloudAmount;
uniform float uCloudStorm;
uniform float uCloudSteps;
uniform float uCloudSeconds;
uniform float uCloudWind;
uniform vec2 uCloudFlow;
uniform float uCloudDay;
uniform float uCloudNight;
uniform float uCloudTwilight;
float cloudSat(float x){return clamp(x,0.0,1.0);}
float cloudHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float cloudPuff(vec2 q,vec2 center,vec2 radius){vec2 v=(q-center)/radius;return 1.0-dot(v,v);}
float cloudMerge(float a,float b){
  float k=.28,t=clamp(.5+.5*(a-b)/k,0.0,1.0);return mix(b,a,t)+k*t*(1.0-t);
}
float cloudProfile(vec2 q,float seed){
  float phase=uCloudSeconds*.035+seed*31.0,motion=.018+.012*cloudSat(uCloudWind)+.020*uCloudStorm;
  vec4 s=fract(seed*vec4(5.3,19.7,43.1,91.3));
  float tilt=(seed-.5)*.48+sin(phase*.47)*.045;
  q=mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*q;
  // The compressed base supports several rounded towers, each with its own
  // height and breathing phase. Wind stretches the lower skirt, never the tops.
  float m=cloudPuff(q,vec2(0.0,-.035),vec2(.28+s.x*.045,.145+s.y*.025));
  m=cloudMerge(m,cloudPuff(q,vec2(-.22,.035+(s.z-.5)*.06),vec2(.17+s.y*.045,.16+s.w*.045)));
  m=cloudMerge(m,cloudPuff(q,vec2(-.07+s.z*.07,.14+sin(phase)*motion),vec2(.17+s.y*.035,.17+s.x*.055)));
  m=cloudMerge(m,cloudPuff(q,vec2(.17+s.x*.07,.065+cos(phase*.83)*motion),vec2(.17+s.z*.045,.17+s.w*.045)));
  m=cloudMerge(m,cloudPuff(q,vec2(.36,-.09+(s.y-.5)*.06),vec2(.16+s.w*.035,.105+s.x*.025)));
  m=cloudMerge(m,cloudPuff(q,vec2(-.36,-.085+(s.w-.5)*.05),vec2(.14+s.z*.04,.11+s.y*.025)));
  // Dense low lobes are shallow and offset: no straight cut or common flat edge.
  m=cloudMerge(m,cloudPuff(q,vec2(-.15,-.14),vec2(.25,.065+s.z*.025)));
  m=cloudMerge(m,cloudPuff(q,vec2(.15,-.15),vec2(.25,.06+s.y*.025)));
  vec2 skirt=q;skirt.x/=1.0+.12*cloudSat(uCloudWind);
  skirt.y+=sin(q.x*9.0+phase*.7)*(.010+.006*cloudSat(uCloudWind));
  m=cloudMerge(m,cloudPuff(skirt,vec2(.39,-.17+(s.z-.5)*.055),vec2(.22,.045+s.w*.015)));
  m=cloudMerge(m,cloudPuff(skirt,vec2(.59,-.19+(s.y-.5)*.055),vec2(.19+s.x*.08,.025+s.z*.012)));
  m=cloudMerge(m,cloudPuff(skirt,vec2(-.45,-.18+(s.w-.5)*.05),vec2(.19+s.z*.07,.025+s.y*.018)));
  return m;
}
// The PNG stores Worley lobes plus small erosion. Domain warp breaks the cellular grid.
float cloudRelief(vec2 p){
  vec2 life=vec2(uCloudSeconds*.0008,-uCloudSeconds*.0005);
  vec4 curl=texture2D(uCloudField,p+vec2(.61,.27)+life*.4);
  vec2 warp=vec2(curl.r-.5,curl.a-.5)*.25;
  float a=texture2D(uCloudField,p+warp).g;
  float b=texture2D(uCloudField,p*2.0+warp*1.4+vec2(.37,.19)+life).g;
  float c=texture2D(uCloudField,p*4.0+warp+vec2(.13,.61)-life*1.7).b;
  return smoothstep(.10,.94,a)*.60+smoothstep(.12,.91,b)*.32+c*.08;
}
struct CloudMass {vec4 form;vec2 center;float scale;float seed;float strength;};
CloudMass cloudEmpty(){return CloudMass(vec4(0.0,0.0,0.0,2.0),vec2(0.0),1.0,0.0,0.0);}
vec2 cloudLocal(CloudMass c,vec2 point){
  vec2 q=(point-c.center)/c.scale;q.x*=c.seed<.5?-1.0:1.0;return q;
}
void cloudClusters(vec2 point,vec4 detail,float weather,
  out CloudMass front,out CloudMass middle,out CloudMass back,out CloudMass caster){
  front=cloudEmpty();middle=cloudEmpty();back=cloudEmpty();caster=cloudEmpty();
  vec2 cell=floor(point);
  float cover=mix(.08,.99,smoothstep(.05,.90,weather));
  float size=mix(.85,1.40,smoothstep(.05,.95,weather));
  for(int y=-1;y<=1;y++)for(int x=-2;x<=2;x++){
    vec2 id=cell+vec2(float(x),float(y));
    vec2 key=vec2(mod(id.x+120.0,12.0),mod(id.y+120.0,4.0));
    float seed=cloudHash(key+vec2(7.3,2.1));
    float activation=smoothstep(seed-.045,seed+.045,cover);
    if(activation<.001)continue;
    vec2 center=id+.5+vec2(cloudHash(key+3.7)-.5,cloudHash(key+9.1)-.5)*.62;
    float scale=size*(.52+.60*cloudHash(key+5.8));
    float depth=.1+.8*cloudHash(key+vec2(11.9,4.2));
    CloudMass c=CloudMass(vec4(0.0,0.0,0.0,depth),center,scale,seed,activation);
    vec2 q=cloudLocal(c,point);
    // Retain one nearby caster even outside its visible contour: its shadow may
    // reach a rear cloud beyond the foreground silhouette.
    if(max(abs(q.x),abs(q.y))<1.45&&depth<caster.form.w)caster=c;
    if(max(abs(q.x),abs(q.y))>1.2)continue;
    q+=vec2(detail.a-.5,detail.g-.5)*.020;
    float mass=cloudProfile(q,seed);
    float eroded=mass+(detail.g-.5)*.035+(detail.b-.5)*.010;
    // Thin low wisps need a broader density transition than the tall lobes;
    // otherwise their steeper profile reads as a cut-out lower outline.
    float lowEdge=1.0-smoothstep(-.22,-.035,q.y);
    float mask=smoothstep(mix(-.23,-.70,lowEdge),mix(.34,.65,lowEdge),eroded)*activation;
    if(mask<.001)continue;
    c.form=vec4(mask,smoothstep(-.19,.29,q.y),cloudSat(mass),depth);
    // Persistent seed depth decides ownership. Never average two clouds' colours.
    if(depth<front.form.w){back=middle;middle=front;front=c;}
    else if(depth<middle.form.w){back=middle;middle=c;}
    else if(depth<back.form.w)back=c;
  }
}
float cloudShadow(CloudMass caster,float receiverDepth,vec2 point,vec2 towardLight){
  if(caster.form.w>=receiverDepth-.015)return 0.0;
  float gap=receiverDepth-caster.form.w;
  vec2 q=cloudLocal(caster,point+towardLight*gap);
  if(max(abs(q.x),abs(q.y))>1.2)return 0.0;
  // A softened analytic footprint, projected toward the sun/moon; no shadow map.
  float low=1.0-smoothstep(-.22,-.035,q.y);
  // The penumbra widens with separation, especially across the thin skirt.
  // Its density transition stays soft even when the light grazes the cloud.
  float softness=.60+gap*.70;
  return smoothstep(-softness*(1.0+low),softness,cloudProfile(q,caster.seed))*caster.strength;
}
vec3 cloudPaint(CloudMass c,vec2 point,vec2 reliefUV,vec3 dir,vec3 surfaceLight,float storm,float shadow){
  float top=c.form.y,thick=c.form.z;
  float relief=cloudRelief(reliefUV+vec2(.73,.37)*c.seed);
  // Finite differences of the puff profile create a cheap rounded surface.
  // Small isotropic noise adds billowing detail, while the denser base stays cool.
  vec2 q=cloudLocal(c,point);float h=sqrt(max(.02,cloudProfile(q,c.seed)));
  vec2 slope=vec2(sqrt(max(.02,cloudProfile(q+vec2(.012,0.0),c.seed)))-h,
    sqrt(max(.02,cloudProfile(q+vec2(0.0,.012),c.seed)))-h)/.012;
  vec3 normal=normalize(vec3(-slope*.16,.85));
  normal.x*=c.seed<.5?-1.0:1.0;
  // A height-field normal becomes singular at its silhouette. Fade that
  // lighting term before the contour so it cannot draw a dark pencil line.
  float interior=smoothstep(.04,.58,thick);
  float roundedTop=smoothstep(.10,.55,top);
  float roundLight=mix(.5,cloudSat(dot(normal,surfaceLight)*.5+.5),interior*roundedTop);
  float shade=cloudSat(.18+.27*top+(relief-.30)*.72+roundLight*.25-(1.0-top)*thick*.12);
  vec3 lit=mix(uCloudColor*vec3(.48,.68,.85),uCloudColor*1.10,shade);
  lit*=1.0-storm*.34;
  vec3 night=mix(vec3(.055,.075,.12),vec3(.22,.29,.41),.25+.55*top+relief*.20);
  vec3 pigment=mix(night,lit,uCloudDay);
  float sunward=pow(max(dot(dir,uSunDir),0.0),2.0);
  float warm=cloudSat(.12+.56*(1.0-top)+.15*(1.0-thick)+(.5-relief)*.24)*(.65+.35*sunward);
  vec3 coral=mix(vec3(1.0,.33,.25),vec3(1.0,.77,.42),sunward);
  vec3 dusk=mix(vec3(.26,.30,.46),coral*(.72+.32*shade),warm)*(.85+relief*.24);
  pigment=mix(pigment,dusk,uCloudTwilight*.86*(1.0-storm*.55));
  // Skylight fills projected shadows. Limit their energy instead of multiplying
  // the whole pigment by black: overcast skies scatter more light into them.
  // Fade the receiver's contour too, so a shadow cannot trace a grey outline.
  float receiver=smoothstep(.20,.85,thick)*smoothstep(.55,1.0,c.form.x);
  float diffuseFill=mix(1.0,.50,smoothstep(.45,.95,uCloudAmount));
  float shadowWeight=cloudSat(shadow)*receiver*mix(.18,.65,uCloudDay)*diffuseFill;
  pigment=mix(pigment,pigment*vec3(.78,.86,.96),shadowWeight);
  return pigment;
}
vec3 cloudField(vec3 skyDir,vec3 background){
  if(uCloudEnabled<.5||skyDir.y<=.015||uCloudAmount<.025)return background;
  float weather=cloudSat(uCloudAmount),storm=cloudSat(uCloudStorm);
  float azimuth=atan(skyDir.z, skyDir.x),altitude=asin(clamp(skyDir.y,-1.0,1.0));
  vec2 skyUV=vec2(azimuth/6.2831853+.5,altitude/1.5707963);
  vec2 flow=uCloudFlow;
  // Longitude covers 360 degrees, altitude 90: a 4:1 frequency ratio gives
  // round noise lobes instead of horizontally stretched, parallel ridges.
  vec2 uv=(skyUV+flow)*vec2(6.0,1.5);
  vec4 detail=texture2D(uCloudField,uv*3.0+vec2(.31,.17));
  vec2 field=(skyUV+flow)*vec2(12.0,4.0)+vec2(detail.a-.5,detail.r-.5)*.10;
  vec2 reliefUV=(skyUV+flow)*vec2(3.0,.75);
  vec3 light=uCloudDay>.2?uSunDir:-uSunDir;
  vec3 east=vec3(-sin(azimuth),0.0,cos(azimuth));
  vec3 up=vec3(-cos(azimuth)*sin(altitude),cos(altitude),-sin(azimuth)*sin(altitude));
  vec2 towardLight=vec2(dot(light,east),dot(light,up))*.32/max(.35,abs(light.y));
  float lightVisible=smoothstep(.035,.30,light.y);
  vec3 surfaceLight=normalize(vec3(dot(light,east),max(.32,dot(light,up)),.65));
  float horizon=smoothstep(.015,.18,skyDir.y);
  CloudMass a,b,c,caster;cloudClusters(field,detail,weather,a,b,c,caster);
  vec3 backdrop=background;
  float stormCover=smoothstep(.40,.92,storm);
  if(stormCover>.001){
    // Bounded 4/6/8 samples add depth to the continuous storm ceiling only.
    float body=0.0;
    for (int i = 0; i < 8; ++i) {
      if(float(i)>=uCloudSteps)break;
      float z=(float(i)+.5)/max(1.0,uCloudSteps);
      body+=texture2D(uCloudField,reliefUV*1.4+vec2(z*.05,z*.07)).g;
    }
    body/=max(1.0,uCloudSteps);
    float roll=cloudRelief(reliefUV);
    float shade=cloudSat(.17+roll*.60+body*.15);
    vec3 ceiling=mix(vec3(.025,.04,.075),vec3(.14,.21,.32),shade);
    // The distant ceiling is an unbroken cloud body, not a shadow receiver:
    // projecting complete silhouettes on it created body-less 'ghost clouds'.
    vec3 ceilingDay=uCloudColor*mix(vec3(.42,.55,.67),vec3(.96,1.02,1.08),shade)*(1.0-storm*.34);
    ceiling=mix(ceiling,ceilingDay,uCloudDay);
    backdrop=mix(backdrop,ceiling,stormCover*horizon);
  }
  vec3 scattered=vec3(0.0);float transmission=1.0;
  for(int layer=0;layer<3;layer++){
    CloudMass current=a;if(layer==1)current=b;else if(layer==2)current=c;
    if(current.form.x<.001)continue;
    float shadow=cloudShadow(caster,current.form.w,field,towardLight);
    if(layer>0)shadow=max(shadow,cloudShadow(a,current.form.w,field,towardLight));
    if(layer>1)shadow=max(shadow,cloudShadow(b,current.form.w,field,towardLight));
    vec3 pigment=cloudPaint(current,field,reliefUV,skyDir,surfaceLight,storm,shadow*lightVisible);
    // Only the outer feather is translucent; opaque cores fully hide rear clouds.
    float lowFeather=1.0-smoothstep(.08,.40,current.form.y);
    float alpha=mix(smoothstep(.015,.86,current.form.x),current.form.x,lowFeather)*horizon;
    float contribution=transmission*alpha;scattered+=pigment*contribution;
    transmission*=1.0-alpha;
    if(transmission<.001)break;
  }
  return scattered+backdrop*transmission;
}
`;
