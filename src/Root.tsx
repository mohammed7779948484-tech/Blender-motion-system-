import { Composition } from "remotion";
import { VIDEOS } from "../videos/registry";

// One composition per video folder (videos/registry.ts). Duration, size and props are filled in
// by each video's calculateMetadata from its episode.json + cached voice manifest.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {VIDEOS.map((v) => (
        <Composition
          key={v.id}
          id={v.id}
          component={v.component}
          durationInFrames={300}
          fps={v.fps}
          width={v.width}
          height={v.height}
          defaultProps={{ resolved: null }}
          calculateMetadata={v.calculateMetadata}
        />
      ))}
    </>
  );
};
