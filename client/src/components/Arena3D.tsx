import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshReflectorMaterial, Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

export interface StageInfo {
  name: string; role: string; country: string; photo: string | null; set: string;
  bid: number | null; base: number; leader: { short: string; primary: string; secondary: string } | null;
  phase: string; result: { kind: string; team?: string; price?: number; color?: string } | null; rating: number; secs: number;
}

/* Soft radial glow texture shared by floodlight sprites. */
function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,255,255,.85)"); r.addColorStop(0.45, "rgba(200,225,255,.25)"); r.addColorStop(1, "rgba(200,225,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
}

/* Tiered stadium crowd rendered as points; phone-flash twinkles scale with bidding intensity. */
const crowdVert = /* glsl */ `
  attribute float aPhase; attribute float aTeam; attribute float aShade;
  uniform float uTime; uniform float uIntensity; uniform float uSize;
  varying float vFlash; varying float vTeam; varying float vShade;
  float h(float n){ return fract(sin(n) * 43758.5453); }
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float slot = floor(uTime * (2.0 + uIntensity * 6.0) + aPhase * 7.0);
    float r = h(aPhase * 91.7 + slot * 13.1);
    vFlash = step(1.0 - (0.012 + uIntensity * 0.11), r);
    vTeam = aTeam; vShade = aShade;
    float bounce = sin(uTime * (3.0 + uIntensity * 8.0) + aPhase * 6.28) * 0.06 * uIntensity;
    mv.y += bounce;
    gl_PointSize = uSize * (1.0 + vFlash * 1.6) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const crowdFrag = /* glsl */ `
  uniform vec3 uAccent; varying float vFlash; varying float vTeam; varying float vShade;
  void main(){
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    vec3 base = mix(vec3(0.10, 0.14, 0.30) * vShade, uAccent * 0.55, vTeam);
    vec3 col = mix(base, vec3(1.0, 0.97, 0.9), vFlash);
    gl_FragColor = vec4(col * soft * (0.7 + vFlash * 2.2), soft);
  }`;

function Crowd({ count, intensity, accent }: { count: number; intensity: number; accent: string }) {
  const geo = useMemo(() => {
    const pos: number[] = [], ph: number[] = [], team: number[] = [], shade: number[] = [];
    const rows = 26, perRow = Math.round(count / rows);
    for (let row = 0; row < rows; row++) {
      const r = 15 + row * 0.62;
      for (let k = 0; k < perRow; k++) {
        const a = -Math.PI * 0.92 + (k / (perRow - 1)) * Math.PI * 1.84 + (Math.random() - 0.5) * 0.01;
        pos.push(Math.sin(a) * r * 1.15, 0.6 + row * 0.46 + Math.random() * 0.08, -Math.cos(a) * r * 0.8 - 5);
        ph.push(Math.random() * 100); team.push(Math.random() < 0.28 ? 1 : 0); shade.push(0.6 + Math.random() * 0.8);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.Float32BufferAttribute(ph, 1));
    g.setAttribute("aTeam", new THREE.Float32BufferAttribute(team, 1));
    g.setAttribute("aShade", new THREE.Float32BufferAttribute(shade, 1));
    return g;
  }, [count]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: crowdVert, fragmentShader: crowdFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0.1 }, uSize: { value: 0.16 }, uAccent: { value: new THREE.Color(accent) } },
  }), []);
  const target = useRef(intensity); target.current = intensity;
  useEffect(() => { (mat.uniforms.uAccent.value as THREE.Color).set(accent); }, [accent, mat]);
  useFrame(({ clock }, dt) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uIntensity.value += (target.current - mat.uniforms.uIntensity.value) * Math.min(1, dt * 3);
  });
  return <points geometry={geo} material={mat} />;
}

/* Volumetric light beam: an open cone with additive gradient falloff. */
const beamVert = /* glsl */ `
  varying float vY; varying vec3 vN; varying vec3 vV;
  void main(){ vY = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const beamFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; varying float vY; varying vec3 vN; varying vec3 vV;
  void main(){ float edge = pow(abs(dot(vN, vV)), 2.0); float a = uOpacity * pow(vY, 2.2) * edge; gl_FragColor = vec4(uColor * a, a); }`;

function Beam({ from, to, color, opacity, sweep = 0, speed = 0.3, radius = 3.2 }: { from: [number, number, number]; to: [number, number, number]; color: string; opacity: number; sweep?: number; speed?: number; radius?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const len = useMemo(() => new THREE.Vector3(...from).distanceTo(new THREE.Vector3(...to)) * 1.15, []);
  const geo = useMemo(() => { const g = new THREE.ConeGeometry(radius, len, 40, 1, true); g.translate(0, -len / 2, 0); g.rotateX(-Math.PI / 2); return g; }, [len, radius]);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } } }), []);
  const tgt = useMemo(() => new THREE.Vector3(), []);
  const op = useRef(opacity); op.current = opacity;
  useEffect(() => { (mat.uniforms.uColor.value as THREE.Color).set(color); }, [color, mat]);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed;
    tgt.set(to[0] + Math.sin(t + from[0]) * sweep, to[1], to[2] + Math.cos(t * 0.7 + from[2]) * sweep * 0.5);
    ref.current.lookAt(tgt);
    mat.uniforms.uOpacity.value += (op.current - mat.uniforms.uOpacity.value) * Math.min(1, dt * 4);
  });
  return <mesh ref={ref} position={from} geometry={geo} material={mat} />;
}

function Tower({ position, glow }: { position: [number, number, number]; glow: THREE.Texture }) {
  const lamps = useMemo(() => { const out: [number, number][] = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) out.push([(c - 2) * 0.55, r * 0.5]); return out; }, []);
  return (
    <group position={position}>
      <mesh position={[0, -position[1] / 2 - 0.6, 0]}><cylinderGeometry args={[0.12, 0.22, position[1], 8]} /><meshStandardMaterial color="#0b1020" metalness={0.6} roughness={0.5} /></mesh>
      <mesh position={[0, 0.5, -0.1]}><boxGeometry args={[3.2, 1.7, 0.15]} /><meshStandardMaterial color="#0a0e1c" metalness={0.7} roughness={0.4} /></mesh>
      {lamps.map(([x, y], i) => (
        <sprite key={i} position={[x, y, 0.05]} scale={[0.7, 0.7, 1]}><spriteMaterial map={glow} color="#f2f6ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></sprite>
      ))}
      <sprite position={[0, 0.5, 0.2]} scale={[9, 7, 1]}><spriteMaterial map={glow} color="#bcd4ff" opacity={0.35} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></sprite>
    </group>
  );
}

/* Scrolling LED ribbon wrapped around the lower tier. */
function LedRibbon({ accent, text }: { accent: string; text: string }) {
  const canvas = useMemo(() => { const c = document.createElement("canvas"); c.width = 2048; c.height = 64; return c; }, []);
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(canvas); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); t.colorSpace = THREE.SRGBColorSpace; return t; }, [canvas]);
  useEffect(() => {
    const g = canvas.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 2048, 0);
    grad.addColorStop(0, "#050816"); grad.addColorStop(0.5, "#0a1030"); grad.addColorStop(1, "#050816");
    g.fillStyle = grad; g.fillRect(0, 0, 2048, 64);
    g.fillStyle = accent; g.fillRect(0, 0, 2048, 4); g.fillRect(0, 60, 2048, 4);
    g.font = "700 34px 'Clash Display', 'General Sans', sans-serif"; g.textBaseline = "middle";
    const chunk = `${text}   ◆   `;
    let x = 10; let i = 0;
    while (x < 2048) { g.fillStyle = i % 2 ? "#ffffff" : accent; g.fillText(chunk, x, 34); x += g.measureText(chunk).width; i++; }
    tex.needsUpdate = true;
  }, [accent, text, canvas, tex]);
  useFrame((_, dt) => { tex.offset.x = (tex.offset.x + dt * 0.03) % 1; });
  return (
    <mesh position={[0, 0.55, -5]} scale={[1.15, 1, 0.8]}>
      <cylinderGeometry args={[14.6, 14.6, 0.7, 96, 1, true, Math.PI * 0.6, Math.PI * 1.8]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

/* Hologram projector disc behind the player card. */
function Projector({ accent, flash }: { accent: string; flash: number }) {
  const r1 = useRef<THREE.Mesh>(null), r2 = useRef<THREE.Mesh>(null), pillar = useRef<THREE.ShaderMaterial>(null);
  const pillarMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uBoost; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (0.22 + uBoost * 0.5); a *= 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 4.0); gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(accent) }, uTime: { value: 0 }, uBoost: { value: 0 } },
  }), []);
  useEffect(() => { (pillarMat.uniforms.uColor.value as THREE.Color).set(accent); }, [accent, pillarMat]);
  const f = useRef(flash); f.current = flash;
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (r1.current) r1.current.rotation.z = t * 0.4;
    if (r2.current) r2.current.rotation.z = -t * 0.25;
    pillarMat.uniforms.uTime.value = t;
    pillarMat.uniforms.uBoost.value += (f.current - pillarMat.uniforms.uBoost.value) * Math.min(1, dt * 3);
  });
  void pillar;
  return (
    <group position={[0, 0, -3]}>
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[3.2, 3.5, 0.24, 64]} /><meshStandardMaterial color="#0c1430" metalness={0.95} roughness={0.2} /></mesh>
      <mesh ref={r1} position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.7, 2.85, 64, 1, 0, Math.PI * 1.6]} /><meshBasicMaterial color={accent} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh ref={r2} position={[0, 0.27, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.05, 3.12, 64, 1, 0, Math.PI * 1.2]} /><meshBasicMaterial color="#22E4FF" toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 3.3, 0]} material={pillarMat}><cylinderGeometry args={[2.6, 2.8, 6.4, 48, 1, true]} /></mesh>
    </group>
  );
}

function Rig({ strike }: { strike: number }) {
  const { camera } = useThree();
  const t0 = useRef(-10);
  useEffect(() => { if (strike) t0.current = performance.now() / 1000; }, [strike]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = performance.now() / 1000 - t0.current;
    const shake = k < 0.5 ? (0.5 - k) * 0.25 : 0;
    camera.position.set(Math.sin(t * 0.08) * 1.6 + (Math.random() - 0.5) * shake, 2.4 + Math.sin(t * 0.11) * 0.25 + (Math.random() - 0.5) * shake, 12.5);
    camera.lookAt(0, 3.2, -5);
  });
  return null;
}

function Scene({ info, high, strike, crowd }: { info: StageInfo; high: boolean; strike: number; crowd: number }) {
  const glow = useGlowTexture();
  const accent = info.result?.color || info.leader?.primary || "#22E4FF";
  const sold = info.result?.kind === "sold";
  const hot = Math.min(1, crowd + (sold ? 0.6 : 0));
  const ribbon = `IPL AUCTION ARENA   ◆   ${info.set.toUpperCase()}   ◆   ${info.leader ? `${info.leader.short} LEAD` : "BIDDING OPEN"}`;
  return (
    <>
      <color attach="background" args={["#02040c"]} />
      <fog attach="fog" args={["#02040c", 18, 46]} />
      <ambientLight intensity={0.18} />
      <hemisphereLight args={["#3550a0", "#05060c", 0.35]} />
      <pointLight position={[0, 5, 1]} intensity={30} color={accent} distance={16} />
      <Rig strike={strike} />
      <Tower position={[-17, 15, -16]} glow={glow} />
      <Tower position={[17, 15, -16]} glow={glow} />
      <Tower position={[-26, 13, -2]} glow={glow} />
      <Tower position={[26, 13, -2]} glow={glow} />
      <Beam from={[-17, 15.5, -15.8]} to={[0, 0, -3]} color="#dfe8ff" opacity={0.16 + hot * 0.12} sweep={1.5} />
      <Beam from={[17, 15.5, -15.8]} to={[0, 0, -3]} color="#dfe8ff" opacity={0.16 + hot * 0.12} sweep={1.5} speed={0.27} />
      <Beam from={[-26, 13.5, -1.8]} to={[-2, 0, -2]} color={accent} opacity={0.1 + hot * 0.2} sweep={4} speed={0.5} radius={2.6} />
      <Beam from={[26, 13.5, -1.8]} to={[2, 0, -2]} color={accent} opacity={0.1 + hot * 0.2} sweep={4} speed={0.45} radius={2.6} />
      {high && <Beam from={[0, 18, -20]} to={[0, 0, -3]} color="#B57BFF" opacity={0.08 + hot * 0.1} sweep={3} speed={0.35} radius={3.6} />}
      <Crowd count={high ? 7800 : 3200} intensity={hot} accent={accent} />
      <LedRibbon accent={accent} text={ribbon} />
      <Projector accent={accent} flash={sold ? 1 : crowd * 0.4} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[90, 90]} />
        {high ? (
          <MeshReflectorMaterial resolution={512} blur={[400, 120]} mixBlur={1} mixStrength={22} roughness={0.9} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.4} color="#04060f" metalness={0.7} mirror={0.7} />
        ) : (
          <meshStandardMaterial color="#05070f" metalness={0.8} roughness={0.35} />
        )}
      </mesh>
      <Sparkles count={high ? 120 : 50} scale={[20, 9, 14]} position={[0, 5, -4]} size={sold ? 6 : 2.5} speed={0.3 + hot} color={sold ? "#F5C542" : "#9bd7ff"} opacity={0.8} />
      {high && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.9} luminanceThreshold={0.25} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette eskil={false} offset={0.25} darkness={0.75} />
        </EffectComposer>
      )}
    </>
  );
}

/* Atmospheric stadium backdrop. Player card, bids and timer are crisp DOM layers drawn on top. */
export default function Arena3D({ info, level, strike, crowd }: { info: StageInfo; level: "high" | "low"; strike: number; crowd: number }) {
  return (
    <Canvas dpr={level === "high" ? [1, 1.6] : 1} camera={{ position: [0, 2.4, 12.5], fov: 50 }} gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}>
      <Scene info={info} high={level === "high"} strike={strike} crowd={crowd} />
    </Canvas>
  );
}
