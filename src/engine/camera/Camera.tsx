// Applies a solved CameraFrame to the default R3F camera, plus the post stack whose depth of
// field follows the frame's focus distance.
import { PerspectiveCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode, type EffectComposer as Composer } from "postprocessing";
import { useLayoutEffect, useMemo, useRef } from "react";
import { cancelRender, getRemotionEnvironment, useCurrentFrame, useDelayRender } from "remotion";
import * as THREE from "three";
import type { CameraFrame } from "./solve";

const quaternionFor = (frame: CameraFrame): [number, number, number, number] => {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...frame.position), new THREE.Vector3(...frame.target), new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (frame.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (frame.roll * Math.PI) / 180));
  return [q.x, q.y, q.z, q.w];
};

export const CinematicCamera: React.FC<{ frame: CameraFrame }> = ({ frame }) => {
  const quaternion = useMemo(() => quaternionFor(frame), [frame]);
  return <PerspectiveCamera makeDefault position={frame.position} quaternion={quaternion} fov={frame.fov} near={0.03} far={80} />;
};

/**
 * EffectComposer builds its passes over several React updates after mounting. During a render,
 * Remotion would capture a tab's first frame before that finishes (blank image). This holds the
 * frame until the passes exist for the current camera, then renders once.
 */
const ComposerGate: React.FC<{ composer: React.RefObject<Composer | null> }> = ({ composer }) => {
  const frame = useCurrentFrame();
  const advance = useThree((s) => s.advance);
  const camera = useThree((s) => s.camera);
  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    const ready = () => {
      const c = composer.current;
      return !!c && c.passes.length >= 2 && (c.passes[0] as unknown as { camera: THREE.Camera }).camera === camera;
    };
    if (ready()) return;
    const handle = delayRender("Waiting for postprocessing passes");
    let raf = 0;
    let tries = 0;
    let done = false;
    const poll = () => {
      const ok = ready();
      if (!ok && tries > 600 && getRemotionEnvironment().isRendering) {
        // Never emit a frame without post (blank/ungraded): fail the render loudly instead.
        done = true;
        cancelRender(new Error(`Postprocessing passes were not ready for frame ${frame} after 600 polls`));
        return;
      }
      if (ok || tries++ > 600) {
        advance(performance.now());
        done = true;
        continueRender(handle);
        return;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf);
      if (!done) continueRender(handle);
    };
  }, [frame, camera, advance, composer, delayRender, continueRender]);
  return null;
};

export type PostFXProps = {
  focus: CameraFrame["focus"];
  bloom?: number;
  vignette?: number;
  /**
   * Chromatic-aberration glitch strength at this frame, or undefined when the episode never glitches.
   * Whether it is mounted must not change during a render (it is decided per episode).
   */
  chroma?: number;
};

/**
 * Deterministic post stack: no temporal or self-animating effects. Anti-aliasing is MSAA on the
 * composer buffers (synchronous); SMAA was dropped because its lookup textures load
 * asynchronously, which made the first frame of each render tab differ.
 */
export const PostFX: React.FC<PostFXProps> = ({ focus, bloom = 0.6, vignette = 0.55, chroma }) => {
  const composer = useRef<Composer | null>(null);
  return (
    <>
      <EffectComposer multisampling={4} ref={composer}>
        <DepthOfField focusDistance={focus?.distance ?? 10} focusRange={focus?.range ?? 100} bokehScale={focus ? focus.bokeh : 0} />
        <Bloom luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={bloom} mipmapBlur />
        {chroma !== undefined ? <ChromaticAberration offset={[chroma * 0.012, chroma * -0.006]} radialModulation={false} modulationOffset={0} /> : <></>}
        <Vignette offset={0.32} darkness={vignette} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
      <ComposerGate composer={composer} />
    </>
  );
};
