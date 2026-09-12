import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Landing-page hero: a slowly rotating lattice of evidence nodes joined by
 * chain links, with one node pulsing amber to stand for a flagged
 * contradiction.
 *
 * It is a metaphor for the product (discrete evidence, cryptographically
 * linked, with the AI surfacing the one link that disagrees) rather than
 * decoration — which is why the "contradiction" node is highlighted rather
 * than every node being identical.
 *
 * Everything is instanced//memoised and the whole canvas is skipped under
 * prefers-reduced-motion, so this never becomes the reason a mid-range
 * laptop drops frames during a live demo.
 */

const NODE_COUNT = 26;
const RADIUS = 3.1;
const CONTRADICTION_INDEX = 7;

interface NodeSpec {
  position: THREE.Vector3;
  isContradiction: boolean;
}

function useNodes(): NodeSpec[] {
  return useMemo(() => {
    // Fibonacci sphere — even distribution without clustering at the poles.
    const golden = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: NODE_COUNT }, (_, i) => {
      const y = 1 - (i / (NODE_COUNT - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      return {
        position: new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(RADIUS),
        isContradiction: i === CONTRADICTION_INDEX,
      };
    });
  }, []);
}

function Lattice({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const flagged = useRef<THREE.Mesh>(null);
  const nodes = useNodes();

  // Connect each node to its two nearest neighbours — a chain, not a mesh.
  const segments = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    nodes.forEach((node, i) => {
      const neighbours = nodes
        .map((other, j) => ({ j, d: node.position.distanceTo(other.position) }))
        .filter((n) => n.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2);
      neighbours.forEach((n) => {
        pts.push(node.position, nodes[n.j].position);
      });
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    return geometry;
  }, [nodes]);

  useFrame((state, delta) => {
    if (!animate) return;
    if (group.current) {
      group.current.rotation.y += delta * 0.12;
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.15) * 0.12;
    }
    if (flagged.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.28;
      flagged.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={group}>
      <lineSegments geometry={segments}>
        <lineBasicMaterial color="#a78bfa" transparent opacity={0.22} />
      </lineSegments>

      {nodes.map((node, i) =>
        node.isContradiction ? (
          <mesh key={i} ref={flagged} position={node.position}>
            <icosahedronGeometry args={[0.19, 0]} />
            <meshBasicMaterial color="#ffb547" />
          </mesh>
        ) : (
          <mesh key={i} position={node.position}>
            <icosahedronGeometry args={[0.11, 0]} />
            <meshBasicMaterial color={i % 4 === 0 ? "#f9a8d4" : "#c4b5fd"} transparent opacity={0.9} />
          </mesh>
        )
      )}
    </group>
  );
}

export function EvidenceLattice3D({ className = "" }: { className?: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div className={className} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 9], fov: 46 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
      >
        <Lattice animate={!prefersReducedMotion} />
      </Canvas>
    </div>
  );
}
