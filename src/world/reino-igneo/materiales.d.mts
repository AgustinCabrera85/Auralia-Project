import type * as B from '@babylonjs/core';
import type {IgneousMetadata} from '../IgneousRealm';
export function aplicarMaterialesReino(namespace:Pick<typeof B,'Vector3'|'PBRMaterial'|'MaterialPluginBase'|'ReflectionProbe'|'RenderTargetTexture'|'Constants'>,scene:B.Scene,container:B.AssetContainer,
  meta:IgneousMetadata,point:(p:[number,number,number])=>B.Vector3,
  direction:(p:[number,number,number])=>B.Vector3,worldScale?:number):{
    setActive(active:boolean):void;dispose():void;
  };
