// Scene lights for a (time-blended) mood. Only the key light casts shadows.
import { Environment, Lightformer } from "@react-three/drei";
import { pulsedKey, type Mood } from "./moods";

export const Lighting: React.FC<{ mood: Mood; t: number; shadowRadius?: number }> = ({ mood, t, shadowRadius = 4.5 }) => {
  const key = pulsedKey(mood, t);
  const e = mood.exposure;
  return (
    <>
      <color attach="background" args={[mood.background]} />
      {mood.fog ? <fog attach="fog" args={[mood.fog.color, mood.fog.near, mood.fog.far]} /> : null}
      <ambientLight color={mood.ambient.color} intensity={mood.ambient.intensity * e} />
      <hemisphereLight args={[mood.hemisphere.sky, mood.hemisphere.ground, mood.hemisphere.intensity * e]} />
      <directionalLight
        position={key.position}
        color={key.color}
        intensity={key.intensity * e}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-camera-near={0.5}
        shadow-camera-far={Math.max(20, Math.hypot(...key.position) + shadowRadius * 2)}
      />
      <directionalLight position={mood.fill.position} color={mood.fill.color} intensity={mood.fill.intensity * e} />
      <directionalLight position={mood.rim.position} color={mood.rim.color} intensity={mood.rim.intensity * e} />
      {/* Neutral studio reflections; rendered once (static), strength set per mood. */}
      <Environment resolution={128} environmentIntensity={mood.environment}>
        <Lightformer form="rect" intensity={2} position={[0, 4, 2]} scale={[6, 3, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1} position={[-4, 2, -2]} scale={[3, 3, 1]} color="#dfe8ff" />
        <Lightformer form="rect" intensity={0.8} position={[4, 1.5, 3]} scale={[3, 2, 1]} color="#fff1e0" />
      </Environment>
    </>
  );
};
