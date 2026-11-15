// Custom shaders: voxel terrain, lake water, sky dome, sun/moon, clouds.
import * as THREE from 'three';

export const shared = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSkyAmb: { value: new THREE.Color(0.5, 0.55, 0.6) },
  uGroundAmb: { value: new THREE.Color(0.3, 0.28, 0.25) },
  uFogColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uSunGlow: { value: new THREE.Color(0, 0, 0) },
  uFogNear: { value: 80 },
  uFogFar: { value: 150 },
  uNight: { value: 0 },
  uTime: { value: 0 },
  uLampColor: { value: new THREE.Color(1.0, 0.62, 0.28) },
  uUnderwater: { value: 0 },
};

const fogChunk = /* glsl */ `
  float fd = length(vWorld - cameraPosition);
  vec3 fdir = normalize(vWorld - cameraPosition);
  float ff = smoothstep(uFogNear, uFogFar, fd);
  float sg = max(dot(fdir, uSunDir), 0.0);
  vec3 fogc = uFogColor + uSunGlow * (pow(sg, 6.0) * 0.55);
  col = mix(col, fogc, ff);
`;

const commonUniforms = `
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyAmb; uniform vec3 uGroundAmb;
  uniform vec3 uFogColor; uniform vec3 uSunGlow; uniform float uFogNear; uniform float uFogFar;
  uniform float uNight; uniform float uTime; uniform vec3 uLampColor;
`;

export function makeTerrainMaterial(atlas: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, map: { value: atlas } },
    vertexShader: /* glsl */ `
      attribute vec2 aLight;
      varying vec2 vUv; varying vec3 vNormal; varying vec2 vLight; varying vec3 vWorld;
      void main() {
        vUv = uv; vNormal = normal; vLight = aLight;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      ${commonUniforms}
      varying vec2 vUv; varying vec3 vNormal; varying vec2 vLight; varying vec3 vWorld;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.5) discard;
        vec3 n = normalize(vNormal);
        float ao = vLight.x;
        float emissive = step(1.5, vLight.y);
        float glow = min(vLight.y, 1.0) * (1.0 - emissive);
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
        vec3 light = amb * ao + uSunColor * ndl * (0.55 + 0.45 * ao);
        light += uLampColor * glow * (0.08 + 0.95 * uNight) * (0.6 + 0.4 * ao);
        vec3 col = t.rgb * light;
        col = mix(col, t.rgb * (1.05 + 0.35 * uNight), emissive);
        ${fogChunk}
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function makeWaterMaterial(waterTex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, waterMap: { value: waterTex } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aLight;
      uniform float uTime;
      varying vec3 vNormal; varying vec2 vLight; varying vec3 vWorld;
      void main() {
        vNormal = normal; vLight = aLight;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        if (normal.y > 0.5) wp.y += sin(wp.x * 0.7 + uTime * 1.3) * 0.035 + cos(wp.z * 0.6 + uTime * 1.1) * 0.035 - 0.05;
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D waterMap;
      uniform float uUnderwater;
      ${commonUniforms}
      varying vec3 vNormal; varying vec2 vLight; varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        if (abs(vNormal.y) < 0.5) p = vec2(vWorld.x + vWorld.z, vWorld.y);
        float r1 = texture2D(waterMap, p / 2.0 + vec2(uTime * 0.05, uTime * 0.03)).r;
        float r2 = texture2D(waterMap, p / 3.0 - vec2(uTime * 0.04, -uTime * 0.02)).r;
        float rip = (r1 + r2) * 0.5;
        vec3 n = normalize(vNormal + vec3((r1 - 0.5) * 0.25, 0.0, (r2 - 0.5) * 0.25));
        vec3 vdir = normalize(vWorld - cameraPosition);
        float fres = pow(1.0 - abs(dot(-vdir, n)), 3.0);
        vec3 deep = vec3(0.07, 0.30, 0.38);
        vec3 shallow = vec3(0.20, 0.52, 0.55);
        vec3 amb = mix(uGroundAmb, uSkyAmb, 0.8);
        vec3 base = mix(deep, shallow, rip) * (amb * 1.1 + uSunColor * max(uSunDir.y, 0.0) * 0.6);
        vec3 sky = mix(uFogColor, vec3(0.32, 0.5, 0.72) * (1.0 - uNight * 0.85), 0.45) + uSunGlow * pow(max(dot(reflect(vdir, n), uSunDir), 0.0), 4.0) * 0.6;
        vec3 col = mix(base, sky, clamp(fres * 0.7 + 0.08, 0.0, 0.85));
        float spec = pow(max(dot(reflect(vdir, n), uSunDir), 0.0), 120.0);
        col += uSunColor * spec * 1.6 * (1.0 - uNight);
        col += uLampColor * vLight.y * (0.15 + 0.9 * uNight) * (0.5 + rip);
        float alpha = mix(0.72, 0.92, fres);
        if (uUnderwater > 0.5) alpha = 0.55;
        ${fogChunk}
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunGlow: shared.uSunGlow,
      uSunDir: shared.uSunDir,
      uNight: shared.uNight,
      uAnti: { value: new THREE.Color(0, 0, 0) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunGlow; uniform vec3 uSunDir; uniform vec3 uAnti;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
        if (h < 0.0) c = mix(uHorizon, uHorizon * 0.55, clamp(-h * 4.0, 0.0, 1.0));
        float s = max(dot(d, uSunDir), 0.0);
        float low = 1.0 - clamp(abs(h) * 1.6, 0.0, 1.0);
        c += uSunGlow * (pow(s, 5.0) * 0.6 * (0.4 + 0.6 * low) + pow(s, 40.0) * 0.5);
        // belt of Venus opposite the sun
        float a = max(dot(d, -uSunDir), 0.0);
        c += uAnti * pow(a, 2.0) * smoothstep(0.35, 0.0, h) * smoothstep(-0.05, 0.05, h);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function makeDiscMaterial(color: THREE.Color, moon = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float sq = max(abs(p.x), abs(p.y));
        float core = step(sq, 0.28);
        ${moon ? `vec2 g = floor((vUv-0.5)*12.0); float crater = step(0.85, fract(sin(dot(g, vec2(12.9,78.2)))*43758.5)); core *= 1.0 - crater*0.35;` : ''}
        float halo = pow(max(0.0, 1.0 - length(p)), ${moon ? '3.0' : '2.2'}) * ${moon ? '0.35' : '0.75'};
        vec3 c = uColor * (core * 1.2 + halo);
        gl_FragColor = vec4(c * uOpacity, 1.0);
      }`,
  });
}

export function makeCloudMaterial(tex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, map: { value: tex }, uCloudColor: { value: new THREE.Color(1, 1, 1) }, uOffset: { value: new THREE.Vector2() } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vWorld; varying vec2 vUv; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; vUv = wp.xz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform vec3 uCloudColor; uniform vec2 uOffset;
      ${commonUniforms}
      varying vec3 vWorld; varying vec2 vUv;
      void main(){
        float a = texture2D(map, (vUv + uOffset) / 640.0).a;
        if (a < 0.5) discard;
        vec3 col = uCloudColor;
        float d = length(vWorld.xz - cameraPosition.xz);
        float fade = 1.0 - smoothstep(380.0, 700.0, d);
        vec3 vdir = normalize(vWorld - cameraPosition);
        col += uSunGlow * pow(max(dot(vdir, uSunDir), 0.0), 4.0) * 0.6;
        gl_FragColor = vec4(col, 0.6 * fade);
      }`,
  });
}
