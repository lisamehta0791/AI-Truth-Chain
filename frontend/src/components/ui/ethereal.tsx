import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { buttonClass, type ButtonVariant } from "@/components/ui/Button";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

import "@/styles/landing.css";

gsap.registerPlugin(ScrollTrigger);

/**
 * ScrollHero — the "Ethereal" scroll-driven hero, ported to Chain of Truth.
 *
 * Technique (kept intact from the supplied component): a high-detail
 * icosahedron displaced by simplex/fbm domain warping plus a scroll-velocity
 * twist; GGX/Schlick microfacet lighting from three slowly moving lights;
 * a cosine-palette albedo that crossfades as the reader moves between
 * sections; EffectComposer → RenderPass → UnrealBloomPass → a cinematic
 * ShaderPass (ACES, temperature/tint, grain, vignette, chromatic
 * aberration, letterbox). Rotation is scroll-only; idle motion is a
 * breathing translation, not a spin.
 *
 * What makes it *ours*: the core is the evidence core — a sealed, breathing
 * record — wrapped by a single thin mint seal ring:
 * the item the system has flagged and an officer has not yet ruled on.
 */

export interface HeroCta {
  label: string;
  /** Router destination. */
  to?: string;
  /** Scroll to a hero section id or any element id on the page. */
  scrollTo?: string;
  variant?: ButtonVariant;
}

export interface HeroSection {
  id: string;
  headline: string;
  subheadline: string;
  body: string;
  /** Mono status line shown bottom-left while this section is active. */
  readout?: string;
  ctas?: HeroCta[];
}

export interface HeroPalette {
  primary: string;
  secondary: string;
  tertiary: string;
  accent: string;
  dark: string;
}

export interface HeroMenuItem {
  label: string;
  /** Hero section id or DOM element id. */
  target: string;
}

export interface ScrollHeroProps {
  sections?: HeroSection[];
  colorPalette?: HeroPalette;
  logo?: ReactNode;
  menuItems?: Array<string | HeroMenuItem>;
  /** Fired for every CTA click (in addition to navigation / scrolling). */
  onCta?: (cta: HeroCta, section: HeroSection) => void;
  /** The fixed nav's primary action. */
  signIn?: HeroCta;
  className?: string;
}

const DEFAULT_SECTIONS: HeroSection[] = [
  { id: "hero", headline: "Chain of Truth", subheadline: "Evidence · Intelligence · Justice", body: "Tamper-evident evidence. AI that cites what it says. Officers who decide." },
  { id: "integrity", headline: "Immutable", subheadline: "Hash-chained custody", body: "Every item is SHA-256 sealed on arrival and linked to the one before it." },
  { id: "intelligence", headline: "Reasoned", subheadline: "The case file reads itself", body: "Every claim carries its source excerpt and a confidence score." },
  { id: "authority", headline: "Accountable", subheadline: "Rank-aware. Human-decided.", body: "Nothing becomes fact until an officer confirms it." },
];

const DEFAULT_PALETTE: HeroPalette = {
  primary: "#a78bfa",
  secondary: "#6366f1",
  tertiary: "#ec4899",
  accent: "#06ffa5",
  dark: "#07060f",
};

/* ------------------------------------------------------------------ */
/* Shaders                                                              */
/* ------------------------------------------------------------------ */

const PALETTE_GLSL = /* glsl */ `
  vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d){
    return a + b*cos(6.28318*(c*t + d));
  }
`;

const CORE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDist;

  uniform float uTime;
  uniform vec2  uMouse;
  uniform float uScrollProgress;
  uniform float uScrollVelocity;
  uniform float uSectionT;

  vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
  vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

  float snoise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0);
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0*floor(p*ns.z*ns.z);
    vec4 x_ = floor(j*ns.z);
    vec4 y_ = floor(j - 7.0*x_);
    vec4 x = x_*ns.x + ns.yyyy;
    vec4 y = y_*ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m*m;
    return 42.0*dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  float fbm(vec3 p){
    float v = 0.0;
    float a = 0.5;
    for(int i=0;i<5;i++){
      v += a * snoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main(){
    vUv = uv;
    vec3 pos = position;

    // organic domain warping — breathing, never rotating
    vec3 p = pos * 1.1;
    float t = uTime * 0.25;
    float warp1 = fbm(p + vec3(t, -t, t*0.5));
    float warp2 = snoise(p*2.0 + vec3(-t*0.7, t*0.9, t*0.2));
    float warp = warp1*0.25 + warp2*0.1;

    // scroll-velocity twist: cinematic inertia while the reader moves
    float twist = uScrollVelocity * 0.6;
    float angle = pos.y * twist;
    mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    pos.xz = R * pos.xz;

    // sculpted ridges along the normal
    float ridge = max(0.0, 1.0 - abs(snoise(p*1.5)));
    float disp = warp + ridge*0.15;
    vDist = disp;
    pos += normal * disp;

    vec4 world = modelMatrix * vec4(pos,1.0);
    vWorldPos = world.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDist;

  uniform float uTime;
  uniform float uScrollProgress;
  uniform float uSectionIndex;
  uniform float uSectionCount;
  uniform vec2  uMouse;

  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uAccent;

  ${PALETTE_GLSL}

  float sat(float x){ return clamp(x,0.0,1.0); }

  // Geometric normal from derivatives — the displaced surface reads as cut obsidian
  vec3 normalFromDerivatives(vec3 p){
    vec3 dx = dFdx(p);
    vec3 dy = dFdy(p);
    return normalize(cross(dx,dy));
  }

  vec3 F_Schlick(float cosTheta, vec3 F0){
    return F0 + (1.0 - F0)*pow(1.0 - cosTheta, 5.0);
  }
  float D_GGX(float NdotH, float rough){
    float a = rough*rough;
    float a2 = a*a;
    float d = (NdotH*NdotH)*(a2 - 1.0) + 1.0;
    return a2 / (3.14159 * d * d);
  }
  float G_SchlickGGX(float NdotV, float rough){
    float r = rough + 1.0;
    float k = (r*r)/8.0;
    return NdotV / (NdotV*(1.0 - k) + k);
  }
  float G_Smith(float NdotV, float NdotL, float rough){
    return G_SchlickGGX(NdotV, rough) * G_SchlickGGX(NdotL, rough);
  }
  vec3 envGradient(vec3 r, vec3 skyA, vec3 skyB, vec3 ground){
    float h = r.y * 0.5 + 0.5;
    vec3 sky = mix(skyB, skyA, h);
    return mix(ground, sky, sat(h*1.2));
  }
  float gradParam(vec2 uv, float time){
    vec2 q = uv*2.0 - 1.0;
    q.x *= 1.2;
    float a = sin(q.x*2.5 + time*0.25);
    float b = cos(q.y*3.0 - time*0.2);
    return sat(0.5 + 0.5*(a*0.6 + b*0.4));
  }

  void main(){
    vec3 N = normalFromDerivatives(vWorldPos);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorldPos);

    // three cinematic lights drifting around the object (mouse nudges the key light)
    float t = uTime*0.6;
    vec3 L1pos = vec3( 6.0*sin(t*0.7) + (uMouse.x-0.5)*3.0,  4.0 - (uMouse.y-0.5)*2.0,  6.0*cos(t*0.7));
    vec3 L2pos = vec3(-5.0*cos(t*0.5), -3.5, 5.0*sin(t*0.45));
    vec3 L3pos = vec3( 0.0,  6.0*sin(t*0.25), -6.0);
    vec3 L1 = normalize(L1pos - vWorldPos);
    vec3 L2 = normalize(L2pos - vWorldPos);
    vec3 L3 = normalize(L3pos - vWorldPos);

    // cosine palettes: violet/indigo (integrity) → magenta/mint (intelligence, decision)
    float gp = gradParam(vUv, uTime) + vDist*0.6;
    float sectionMix = clamp(uSectionIndex / max(uSectionCount - 1.0, 1.0), 0.0, 1.0);

    vec3 palA = cosPalette(gp,
      vec3(0.40,0.34,0.62),
      vec3(0.36,0.30,0.38),
      vec3(1.00,0.80,0.90),
      vec3(0.55,0.45,0.75));
    vec3 palB = cosPalette(gp + 0.15*sin(uTime*0.25),
      vec3(0.50,0.38,0.58),
      vec3(0.46,0.38,0.36),
      vec3(0.90,0.70,0.60),
      vec3(0.85,0.20,0.55));

    vec3 baseAlbedo = mix(palA, palB, sectionMix);
    baseAlbedo = mix(baseAlbedo, uColor1, 0.18);
    baseAlbedo = mix(baseAlbedo, uColor2, 0.10);

    float metallic = 0.30 + 0.15*sin(uTime*0.2 + gp*3.0);
    float rough    = clamp(0.16 + 0.12*sin(gp*6.283 + uTime*0.35), 0.06, 0.6);
    vec3 F0 = mix(vec3(0.04), baseAlbedo, metallic);

    vec3 H1 = normalize(V + L1);
    vec3 H2 = normalize(V + L2);
    vec3 H3 = normalize(V + L3);

    float NdotV = sat(dot(N,V));
    float NdotL1= sat(dot(N,L1));
    float NdotL2= sat(dot(N,L2));
    float NdotL3= sat(dot(N,L3));
    float NdotH1= sat(dot(N,H1));
    float NdotH2= sat(dot(N,H2));
    float NdotH3= sat(dot(N,H3));

    float D1 = D_GGX(NdotH1, rough);
    float D2 = D_GGX(NdotH2, rough);
    float D3 = D_GGX(NdotH3, rough);
    float G1 = G_Smith(NdotV, NdotL1, rough);
    float G2 = G_Smith(NdotV, NdotL2, rough);
    float G3 = G_Smith(NdotV, NdotL3, rough);
    vec3  F1 = F_Schlick(sat(dot(V,H1)), F0);
    vec3  F2 = F_Schlick(sat(dot(V,H2)), F0);
    vec3  F3 = F_Schlick(sat(dot(V,H3)), F0);

    vec3 spec1 = (D1*G1*F1) / max(4.0*NdotV*NdotL1, 0.001);
    vec3 spec2 = (D2*G2*F2) / max(4.0*NdotV*NdotL2, 0.001);
    vec3 spec3 = (D3*G3*F3) / max(4.0*NdotV*NdotL3, 0.001);

    vec3 kS = F_Schlick(NdotV, F0);
    vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);
    vec3 diffuse = baseAlbedo / 3.14159;

    vec3 c1 = vec3(1.0, 0.96, 1.0);
    vec3 c2 = mix(uColor3, vec3(0.95,0.88,1.0), 0.5);
    vec3 c3 = mix(uAccent, vec3(0.9,1.0,0.95), 0.4);

    vec3 direct =
      (kD*diffuse + spec1) * c1 * NdotL1 * 0.95 +
      (kD*diffuse + spec2) * c2 * NdotL2 * 0.65 +
      (kD*diffuse + spec3) * c3 * NdotL3 * 0.55;

    // environment: violet zenith, obsidian ground — no sky blue
    vec3 R = reflect(-V, N);
    vec3 env = envGradient(R,
      vec3(0.18,0.11,0.30),
      vec3(0.06,0.04,0.12),
      vec3(0.012,0.008,0.02));
    vec3 Fenv = F_Schlick(sat(dot(N,V)), F0);
    vec3 envSpec = Fenv * env * (1.0 - rough) * 0.7;

    // rim: magenta/mint iris so the silhouette reads against the dark
    float rim = pow(1.0 - sat(dot(N,V)), 2.2);
    vec3 rimCol = mix(uAccent, uColor3, 0.55) * rim * 0.42;

    // ridges glow — the displacement is the light source
    vec3 glow = mix(uAccent, uColor3, 0.5) * abs(vDist) * 0.3;

    vec3 color = direct + envSpec + rimCol + glow;

    // faint holographic interference
    float pattern = sin(vUv.x*40.0 + uTime) * sin(vUv.y*38.0 - uTime);
    color += pattern * 0.015;

    color = clamp(color, 0.0, 4.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

interface CinematicUniforms {
  tDiffuse: { value: THREE.Texture | null };
  uTime: { value: number };
  uResolution: { value: THREE.Vector2 };
  uTemperature: { value: number };
  uTint: { value: number };
  uContrast: { value: number };
  uSaturation: { value: number };
  uVignette: { value: number };
  uAberration: { value: number };
  uGrain: { value: number };
  uLetterbox: { value: number };
  uScanlines: { value: number };
  uHazeA: { value: THREE.Color };
  uHazeB: { value: THREE.Color };
  uDark: { value: THREE.Color };
  uFocus: { value: THREE.Vector2 };
}

function makeCinematicShader(palette: HeroPalette) {
  const uniforms: CinematicUniforms = {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTemperature: { value: -0.02 },
    uTint: { value: -0.03 },
    uContrast: { value: 1.08 },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.42 },
    uAberration: { value: 0.0022 },
    uGrain: { value: 0.2 },
    uLetterbox: { value: 0.04 },
    uScanlines: { value: 0.05 },
    uHazeA: { value: new THREE.Color(palette.primary) },
    uHazeB: { value: new THREE.Color(palette.tertiary) },
    uDark: { value: new THREE.Color(palette.dark) },
    uFocus: { value: new THREE.Vector2(0.64, 0.5) },
  };
  return {
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec2  uResolution;
      uniform float uTemperature, uTint, uContrast, uSaturation, uVignette, uAberration, uGrain, uLetterbox, uScanlines;
      uniform vec3 uHazeA, uHazeB, uDark;
      uniform vec2 uFocus;

      float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }

      vec3 aces(vec3 x){
        float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
        return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
      }
      vec3 tempTint(vec3 c, float temp, float tint){
        c.r += temp*0.2;
        c.b -= temp*0.2;
        c.g += tint*0.15;
        return c;
      }
      vec3 satContrast(vec3 c, float s, float con){
        vec3 g = vec3(dot(c, vec3(0.299,0.587,0.114)));
        c = mix(g, c, s);
        c = (c - 0.5)*con + 0.5;
        return c;
      }

      void main(){
        vec2 p = vUv - 0.5;
        vec2 dir = normalize(p + 1e-6);
        float dist = length(p);
        vec2 off = dir * uAberration * dist;

        float r = texture2D(tDiffuse, vUv + off).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv - off).b;
        vec3 col = vec3(r,g,b);

        // atmospheric haze around the core + a magenta breath top-left (behind the copy)
        float aspect = uResolution.x / max(uResolution.y, 1.0);
        vec2 q = (vUv - uFocus) * vec2(aspect, 1.0);
        float core = exp(-dot(q,q) * 4.5);
        vec2 q2 = (vUv - vec2(0.12, 0.85)) * vec2(aspect, 1.0);
        float breath = exp(-dot(q2,q2) * 2.2) * (0.75 + 0.25*sin(uTime*0.6));
        col += uHazeA * core * 0.085 + uHazeB * breath * 0.035;

        // grain
        float n = rand(vUv*vec2(uResolution.x, uResolution.y) + uTime*60.0) - 0.5;
        col += n * uGrain * 0.08;

        col = tempTint(col, uTemperature, uTint);
        col = satContrast(col, uSaturation, uContrast);

        float vig = smoothstep(0.85, 0.2, dist);
        col *= mix(1.0, vig, uVignette);

        col = aces(col);
        col = pow(col, vec3(1.0/2.2));

        // lift blacks to the product's obsidian ground
        col = uDark + col * (1.0 - uDark);

        // hologram scanlines
        float scan = 1.0 - uScanlines * (0.5 + 0.5*sin(vUv.y * uResolution.y * 1.6));
        col *= scan;

        // letterbox
        float edge = 0.5 - uLetterbox;
        float bar = uLetterbox <= 0.0 ? 1.0 : 1.0 - smoothstep(edge - 0.004, edge + 0.004, abs(vUv.y - 0.5));
        col = mix(uDark * 0.6, col, bar);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

interface ScrollState {
  progress: number;
  velocity: number;
  rotation: { x: number; y: number };
  lastY: number;
  lastT: number;
}

function normaliseMenu(items: Array<string | HeroMenuItem>): HeroMenuItem[] {
  return items.map((it) => (typeof it === "string" ? { label: it, target: it.toLowerCase() } : it));
}

const HEX = "0123456789abcdef";
function randomHex(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

/** Live SHA-256 style ticker: the seal being recomputed. */
function HashTicker({ paused }: { paused: boolean }) {
  const [hash, setHash] = useState(() => randomHex(12));
  const [block, setBlock] = useState(1);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setHash(randomHex(12));
      setBlock((b) => (b % 35) + 1);
    }, 1400);
    return () => window.clearInterval(id);
  }, [paused]);
  return (
    <div className="eh-hash" aria-hidden="true">
      <div>
        sha256 <b>{hash.slice(0, 6)}…{hash.slice(6)}</b> · block <b>{String(block).padStart(4, "0")}</b>/0035 · <span className="ok">LINKED</span>
      </div>
    </div>
  );
}

function SplitHeadline({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, wi) => (
        <span className="eh-word" key={`${word}-${wi}`}>
          {Array.from(word).map((ch, ci) => (
            <span className="eh-char" key={ci}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

function SubHeadline({ text }: { text: string }) {
  const parts = text.split(" · ");
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="eh-dot">·</span>}
        </span>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function ScrollHero({
  sections = DEFAULT_SECTIONS,
  colorPalette = DEFAULT_PALETTE,
  logo = "CHAIN OF TRUTH",
  menuItems = ["Integrity", "Intelligence", "Authority"],
  onCta,
  signIn = { label: "Sign in", to: "/login", variant: "primary" },
  className = "",
}: ScrollHeroProps) {
  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blockRefs = useRef<Array<HTMLDivElement | null>>([]);
  const railFillRef = useRef<HTMLDivElement>(null);
  const railPctRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef(0);
  const dirtyRef = useRef(true);
  const sectionUniformRef = useRef<{ value: number } | null>(null);

  const scrollRef = useRef<ScrollState>({ progress: 0, velocity: 0, rotation: { x: 0, y: 0 }, lastY: 0, lastT: 0 });
  const mouseRef = useRef({ x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 });

  const [isLoaded, setIsLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [navSolid, setNavSolid] = useState(false);

  const count = sections.length;
  const paletteKey = `${colorPalette.primary}|${colorPalette.secondary}|${colorPalette.tertiary}|${colorPalette.accent}|${colorPalette.dark}`;
  const menu = useMemo(() => normaliseMenu(menuItems), [menuItems]);

  /* ---------------------------------------------------------- three */
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const palette = colorPalette;
    const isMobile = () => window.innerWidth < 768;
    const size = () => ({ w: stage.clientWidth || window.innerWidth, h: stage.clientHeight || window.innerHeight });

    const scene = new THREE.Scene();
    const { w, h } = size();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // ACES lives in the cinematic pass
    renderer.setClearColor(0x000000, 1);

    // ---- the core -------------------------------------------------
    const rig = new THREE.Group();
    scene.add(rig);

    const coreGeometry = new THREE.IcosahedronGeometry(1.75, isMobile() ? 4 : 5);
    const coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uScrollProgress: { value: 0 },
        uScrollVelocity: { value: 0 },
        uSectionT: { value: 0 },
        uSectionIndex: { value: 0 },
        uSectionCount: { value: count },
        uColor1: { value: new THREE.Color(palette.primary) },
        uColor2: { value: new THREE.Color(palette.secondary) },
        uColor3: { value: new THREE.Color(palette.tertiary) },
        uAccent: { value: new THREE.Color(palette.accent) },
      },
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      side: THREE.DoubleSide,
    });
    sectionUniformRef.current = coreMaterial.uniforms.uSectionIndex as { value: number };
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    rig.add(core);

    // ---- the evidence chain: hash-block rings + seal ---------------
    const orbit = new THREE.Group();
    rig.add(orbit);

    const blockGeometry = new THREE.CylinderGeometry(0.095, 0.095, 0.05, 6);
    const chainMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.primary),
      emissive: new THREE.Color(palette.primary),
      emissiveIntensity: 0.55,
      metalness: 0.7,
      roughness: 0.28,
    });
    const aiMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.tertiary),
      emissive: new THREE.Color(palette.tertiary),
      emissiveIntensity: 0.5,
      metalness: 0.7,
      roughness: 0.3,
    });

    // The hash-block rings were removed at the owner's request ("remove the
    // round chain") — the core and the single mint seal ring remain.
    const FLAG = -1;
    void FLAG;
    const flagMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb547") });
    const flag = new THREE.Mesh(blockGeometry, flagMaterial);
    flag.visible = false;

    // integrity seal (mint hairline torus)
    const sealGeometry = new THREE.TorusGeometry(2.2, 0.011, 6, 200);
    const sealMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.accent), transparent: true, opacity: 0.55 });
    const seal = new THREE.Mesh(sealGeometry, sealMaterial);
    seal.rotation.set(1.35, 0.35, 0);
    orbit.add(seal);

    // lights for the standard-material blocks (the core lights itself)
    const keyLight = new THREE.PointLight(new THREE.Color(palette.primary), 60, 0, 2);
    keyLight.position.set(4, 3, 4);
    const fillLight = new THREE.PointLight(new THREE.Color(palette.tertiary), 40, 0, 2);
    fillLight.position.set(-4, -2, 3);
    const ambient = new THREE.AmbientLight(new THREE.Color("#2a1f4a"), 1.4);
    scene.add(keyLight, fillLight, ambient);

    // ---- composer ---------------------------------------------------
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    const renderPass = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.42, 0.8);
    const cineShader = makeCinematicShader(palette);
    const cinePass = new ShaderPass(cineShader);
    const cineUniforms = cinePass.uniforms as unknown as CinematicUniforms;
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(cinePass);

    // ---- layout (object right of the copy on desktop, above it on mobile)
    const layout = () => {
      const { w, h } = size();
      const mobile = isMobile();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      composer.setPixelRatio(renderer.getPixelRatio());
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      cineUniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
      cineUniforms.uLetterbox.value = mobile || h < 640 ? 0 : 0.038;
      cineUniforms.uScanlines.value = mobile ? 0.03 : 0.05;
      if (mobile) {
        rig.position.set(0, 1.05, 0);
        rig.scale.setScalar(0.5);
        cineUniforms.uFocus.value.set(0.5, 0.3);
      } else if (w < 1100) {
        rig.position.set(0.9, 0.15, 0);
        rig.scale.setScalar(0.78);
        cineUniforms.uFocus.value.set(0.62, 0.48);
      } else {
        rig.position.set(1.45, 0.05, 0);
        rig.scale.setScalar(1);
        cineUniforms.uFocus.value.set(0.66, 0.5);
      }
      dirtyRef.current = true;
    };
    layout();

    const ro = new ResizeObserver(() => layout());
    ro.observe(stage);
    window.addEventListener("resize", layout);

    const onPointerMove = (e: PointerEvent) => {
      mouseRef.current.x = e.clientX / window.innerWidth;
      mouseRef.current.y = e.clientY / window.innerHeight;
      dirtyRef.current = true;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    // ---- loop -------------------------------------------------------
    const clock = new THREE.Clock();
    let frameId = 0;
    let lastT = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      frameId = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const dt = Math.min(0.05, t - lastT);
      lastT = t;

      const s = scrollRef.current;
      const m = mouseRef.current;

      // velocity decays every frame; ScrollTrigger tops it up while scrolling
      s.velocity *= Math.pow(0.02, dt); // ~0.9 per 16 ms
      if (Math.abs(s.velocity) < 1e-4) s.velocity = 0;

      m.sx += (m.x - m.sx) * 0.08;
      m.sy += (m.y - m.sy) * 0.08;

      // render on demand when motion is reduced; always for the first 2 s
      const settled = Math.abs(m.x - m.sx) < 1e-3 && Math.abs(s.velocity) < 1e-3;
      if (reducedRef.current && !dirtyRef.current && settled && t > 2) return;
      dirtyRef.current = false;

      const u = coreMaterial.uniforms;
      u.uTime.value = reducedRef.current ? t * 0.35 : t;
      (u.uMouse.value as THREE.Vector2).set(m.sx, m.sy);
      u.uScrollProgress.value = s.progress;
      u.uScrollVelocity.value = s.velocity;

      // scroll-only rotation (+ a whisper of mouse parallax)
      core.rotation.x = s.rotation.x + (m.sy - 0.5) * 0.22;
      core.rotation.y = s.rotation.y + (m.sx - 0.5) * 0.3;

      // idle breathing — translation, never rotation
      if (Math.abs(s.velocity) < 0.01) core.position.y = Math.sin(t * 0.45) * 0.06;
      else core.position.y *= 0.9;

      // the seal keeps time: slow turn, a touch faster while the reader scrolls
      const boost = 1 + Math.min(1.5, Math.abs(s.velocity)) * 2.2;
      seal.rotation.z = t * 0.05 * boost;
      void dt;
      orbit.rotation.y = Math.sin(t * 0.12) * 0.12;

      camera.position.x = (m.sx - 0.5) * 0.35;
      camera.position.y = -(m.sy - 0.5) * 0.25;
      camera.lookAt(0, 0, 0);

      cineUniforms.uTime.value = t;
      composer.render();
    };

    tick();
    setIsLoaded(true);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("resize", layout);
      window.removeEventListener("pointermove", onPointerMove);
      sectionUniformRef.current = null;
      blockGeometry.dispose();
      chainMaterial.dispose();
      aiMaterial.dispose();
      flagMaterial.dispose();
      sealGeometry.dispose();
      sealMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      bloom.dispose();
      cinePass.dispose();
      renderPass.dispose();
      composer.dispose();
      renderer.dispose();
    };
    // palette is consumed by value; the key keeps object identity out of the deps
  }, [paletteKey, count]);

  /* ---------------------------------------------------- scroll logic */
  useEffect(() => {
    const track = trackRef.current;
    if (!isLoaded || !track) return;

    scrollRef.current.lastY = window.scrollY;
    scrollRef.current.lastT = performance.now();

    const trigger = ScrollTrigger.create({
      trigger: track,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const s = scrollRef.current;
        s.progress = self.progress;

        const now = performance.now();
        const y = window.scrollY;
        const dy = y - s.lastY;
        const dtms = Math.max(8, now - s.lastT);
        const v = (dy / dtms) * (1000 / Math.max(1, window.innerHeight)) * 0.9;
        s.velocity = THREE.MathUtils.clamp(s.velocity * 0.5 + v * 0.5, -1.6, 1.6);
        s.lastY = y;
        s.lastT = now;

        // one full turn over the whole hero, with a slow nod
        s.rotation.y = self.progress * Math.PI * 2;
        s.rotation.x = Math.sin(self.progress * Math.PI * 2) * 0.28;
        dirtyRef.current = true;

        if (railFillRef.current) railFillRef.current.style.transform = `scaleY(${self.progress})`;
        if (railPctRef.current) railPctRef.current.textContent = `${String(Math.round(self.progress * 100)).padStart(2, "0")}%`;

        const idx = Math.min(count - 1, Math.max(0, Math.round(self.progress * (count - 1))));
        if (idx !== activeRef.current) {
          activeRef.current = idx;
          setActiveSection(idx);
        }
      },
    });

    const onScroll = () => setNavSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    ScrollTrigger.refresh();

    return () => {
      trigger.kill();
      window.removeEventListener("scroll", onScroll);
    };
  }, [isLoaded, count]);

  /* -------------------------------------------- section transitions */
  useEffect(() => {
    const quick = reducedRef.current;
    const tweens: gsap.core.Tween[] = [];

    // palette crossfade in the shader
    const uniform = sectionUniformRef.current;
    if (uniform) tweens.push(gsap.to(uniform, { value: activeSection, duration: quick ? 0.4 : 1.4, ease: "power2.inOut" }));

    blockRefs.current.forEach((el, i) => {
      if (!el) return;
      const chars = el.querySelectorAll<HTMLElement>(".eh-char");
      const rest = el.querySelectorAll<HTMLElement>(".eh-rise");
      gsap.killTweensOf([el, chars, rest]);
      if (i === activeSection) {
        tweens.push(gsap.to(el, { opacity: 1, y: 0, duration: quick ? 0.2 : 0.4, ease: "power2.out", overwrite: true }));
        tweens.push(
          gsap.fromTo(
            chars,
            { yPercent: 110, opacity: 0, rotateX: -55 },
            { yPercent: 0, opacity: 1, rotateX: 0, duration: quick ? 0.25 : 0.7, stagger: quick ? 0.006 : 0.028, ease: "power4.out", overwrite: true },
          ),
        );
        tweens.push(
          gsap.fromTo(
            rest,
            { y: 26, opacity: 0, filter: "blur(6px)" },
            { y: 0, opacity: 1, filter: "blur(0px)", duration: quick ? 0.25 : 0.6, stagger: quick ? 0.03 : 0.09, delay: quick ? 0.05 : 0.18, ease: "power3.out", overwrite: true },
          ),
        );
      } else {
        tweens.push(gsap.to(el, { opacity: 0, y: -18, duration: quick ? 0.12 : 0.32, ease: "power2.in", overwrite: true }));
      }
    });

    return () => {
      tweens.forEach((tw) => tw.kill());
    };
  }, [activeSection]);

  /* ---------------------------------------------------------- nav */
  const scrollToTarget = useCallback(
    (target: string) => {
      const track = trackRef.current;
      const idx = sections.findIndex((s) => s.id === target);
      const behavior: ScrollBehavior = reducedRef.current ? "auto" : "smooth";
      if (idx >= 0 && track) {
        const top = track.getBoundingClientRect().top + window.scrollY;
        const travel = Math.max(0, track.offsetHeight - window.innerHeight);
        window.scrollTo({ top: top + (travel * idx) / Math.max(1, count - 1) + (idx === 0 ? 0 : 2), behavior });
        return;
      }
      const el = document.getElementById(target);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 64;
        window.scrollTo({ top, behavior });
      }
    },
    [sections, count],
  );

  const activeMenuTarget = sections[activeSection]?.id;

  const renderCta = (cta: HeroCta, section: HeroSection, key: string) => {
    const cls = buttonClass(cta.variant ?? "default", "lg");
    if (cta.to) {
      return (
        <Link key={key} to={cta.to} className={`${cls} eh-rise`} onClick={() => onCta?.(cta, section)}>
          {cta.label}
        </Link>
      );
    }
    return (
      <button
        key={key}
        type="button"
        className={`${cls} eh-rise`}
        onClick={() => {
          onCta?.(cta, section);
          if (cta.scrollTo) scrollToTarget(cta.scrollTo);
        }}
      >
        {cta.label}
      </button>
    );
  };

  const active = sections[activeSection] ?? sections[0];

  return (
    <div className={`eh-track ${className}`} ref={trackRef} style={{ height: `${count * 100}vh` }}>
      {/* fixed nav */}
      <header className={`eh-nav ${navSolid ? "is-solid" : ""}`}>
        <Link to="/" className="eh-brand" aria-label="Chain of Truth — home">
          {typeof logo === "string" ? (
            <span>
              <span className="eh-brand__name">{logo}</span>
              <span className="eh-brand__tag">EVIDENCE · INTELLIGENCE · JUSTICE</span>
            </span>
          ) : (
            logo
          )}
        </Link>
        <nav className="eh-menu" aria-label="Sections">
          {menu.map((item) => (
            <button key={item.target} type="button" className={item.target === activeMenuTarget ? "is-active" : ""} onClick={() => scrollToTarget(item.target)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="eh-nav__right">
          <span className="eh-nav__status">
            <span className="eh-readout__dot" /> LEDGER ANCHORED
          </span>
          {signIn.to ? (
            <Link to={signIn.to} className={buttonClass(signIn.variant ?? "primary", "md")}>
              {signIn.label}
            </Link>
          ) : (
            <button type="button" className={buttonClass(signIn.variant ?? "primary", "md")} onClick={() => signIn.scrollTo && scrollToTarget(signIn.scrollTo)}>
              {signIn.label}
            </button>
          )}
        </div>
      </header>

      <div className="eh-stage" ref={stageRef}>
        <canvas ref={canvasRef} className={`eh-canvas ${isLoaded ? "is-ready" : ""}`} aria-hidden="true" />
        <div className="eh-scrim" aria-hidden="true" />

        <span className="eh-corner eh-corner--tl" aria-hidden="true" />
        <span className="eh-corner eh-corner--tr" aria-hidden="true" />
        <span className="eh-corner eh-corner--bl" aria-hidden="true" />
        <span className="eh-corner eh-corner--br" aria-hidden="true" />

        {/* copy */}
        <div className="eh-copy">
          {sections.map((section, i) => (
            <div
              key={section.id}
              id={`hero-${section.id}`}
              className={`eh-block ${i === activeSection ? "is-active" : ""}`}
              ref={(el) => {
                blockRefs.current[i] = el;
              }}
              aria-hidden={i !== activeSection}
            >
              <div className="eh-block__inner">
              <div className="eh-index eh-rise">
                <em>{String(i + 1).padStart(2, "0")}</em> / {String(count).padStart(2, "0")} — {section.id.toUpperCase()}
              </div>
              {i === 0 ? (
                <h1 className="eh-headline">
                  <SplitHeadline text={section.headline} />
                </h1>
              ) : (
                <h2 className="eh-headline">
                  <SplitHeadline text={section.headline} />
                </h2>
              )}
              <p className="eh-sub eh-rise">
                <SubHeadline text={section.subheadline} />
              </p>
              <p className="eh-body eh-rise">{section.body}</p>
              {section.ctas && section.ctas.length > 0 && (
                <div className="eh-ctas">{section.ctas.map((cta, ci) => renderCta(cta, section, `${section.id}-${ci}`))}</div>
              )}
              </div>
            </div>
          ))}
        </div>

        {/* progress rail */}
        <div className="eh-rail" aria-hidden="true">
          <span className="eh-rail__pct" ref={railPctRef}>
            00%
          </span>
          <div className="eh-rail__line">
            <div className="eh-rail__fill" ref={railFillRef} />
          </div>
          <div className="eh-rail__dots">
            {sections.map((section, i) => (
              <button key={section.id} type="button" className={`eh-rail__dot ${i === activeSection ? "is-active" : ""}`} onClick={() => scrollToTarget(section.id)} tabIndex={-1}>
                <span>{section.id}</span>
              </button>
            ))}
          </div>
        </div>

        {/* bottom HUD */}
        <div className="eh-hud">
          <div className="eh-readout" key={active.id}>
            <span className="eh-readout__dot" />
            <span className="materialise">
              <strong>{active.readout ?? `${active.id.toUpperCase()} · SECTION ${activeSection + 1}`}</strong>
            </span>
          </div>
          <div>
            <HashTicker paused={reduced} />
            {activeSection === 0 && (
              <div className="eh-scrollhint">
                Scroll to explore <i />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScrollHero;
