// Renders any layout: the room shell plus every placed item at its world transform.
import type { Mood } from "../lighting/moods";
import { itemParamsAt, itemWorld, type Layout, type PropCue } from "./layout";
import { PROP_VIEWS, type PropViewProps } from "./props";
import type { DrawFn } from "./Screen";

export type SetViewProps = {
  layout: Layout;
  t: number;
  practicals: Mood["practicals"];
  cues?: PropCue[];
  /** Items currently hidden (e.g. picked up by an actor). */
  hidden?: Set<string>;
  /** Video-supplied components for custom item kinds. */
  components?: Record<string, React.FC<PropViewProps>>;
  screens?: Record<string, DrawFn>;
};

const Shell: React.FC<{ layout: Layout }> = ({ layout }) => {
  const s = layout.shell;
  return (
    <group name="shell">
      {s.floor === "none" ? null : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color={s.floor} roughness={0.9} />
        </mesh>
      )}
      {s.walls.back ? (
        <group>
          <mesh position={[0, s.height / 2, s.back - 0.05]} receiveShadow>
            <boxGeometry args={[40, s.height, 0.1]} />
            <meshStandardMaterial color={s.wall} roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.06, s.back + 0.01]} receiveShadow>
            <boxGeometry args={[40, 0.12, 0.03]} />
            <meshStandardMaterial color={s.trim} roughness={0.6} />
          </mesh>
        </group>
      ) : null}
      {s.walls.left ? (
        <group>
          <mesh position={[s.left - 0.05, s.height / 2, 0]} receiveShadow>
            <boxGeometry args={[0.1, s.height, 40]} />
            <meshStandardMaterial color={s.wall} roughness={0.95} />
          </mesh>
          <mesh position={[s.left + 0.01, 0.06, 0]} receiveShadow>
            <boxGeometry args={[0.03, 0.12, 40]} />
            <meshStandardMaterial color={s.trim} roughness={0.6} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
};

export const SetView: React.FC<SetViewProps> = ({ layout, t, practicals, cues = [], hidden, components, screens }) => (
  <group name={`set:${layout.env}`}>
    <Shell layout={layout} />
    {layout.items.map((item) => {
      if (hidden?.has(item.id)) return null;
      const View = components?.[item.kind] ?? PROP_VIEWS[item.kind];
      if (!View) return null;
      const w = itemWorld(layout, item.id);
      const { params, since } = itemParamsAt(item, cues, t);
      if (params.visible === false) return null;
      const own = cues.filter((c) => c.item === item.id);
      return (
        <group key={item.id} name={item.id} position={w.position} rotation={[0, w.yaw, 0]} scale={w.scale}>
          <View id={item.id} params={params} since={since} t={t} practicals={practicals} screens={screens} cues={own} />
        </group>
      );
    })}
  </group>
);
