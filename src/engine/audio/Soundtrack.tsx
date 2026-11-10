// Places dialogue clips, sound effects and an optional ducked music bed on the timeline.
import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import type { ResolvedEpisode } from "../core/timeline";
import { musicVolumeAt } from "./musicGain";

const srcOf = (s: string) => (/^https?:\/\//.test(s) ? s : staticFile(s.replace(/^public\//, "")));

export const Soundtrack: React.FC<{ resolved: ResolvedEpisode }> = ({ resolved }) => {
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <>
      {resolved.lines.map((l) =>
        !l.file ? null : l.clip || l.gain ? (
          // Trimmed/levelled line: play its window of the untouched file at its gain.
          <Sequence key={l.id} from={Math.round(l.start * fps)} durationInFrames={Math.max(1, Math.ceil((l.end - l.start) * fps))} name={`voice ${l.id}`} layout="none">
            <Audio src={staticFile(l.file)} trimBefore={Math.round((l.clip?.from ?? 0) * fps)} volume={10 ** ((l.gain ?? 0) / 20)} />
          </Sequence>
        ) : (
          <Sequence key={l.id} from={Math.round(l.start * fps)} name={`voice ${l.id}`} layout="none">
            <Audio src={staticFile(l.file)} />
          </Sequence>
        ),
      )}
      {resolved.sfx.map((s, i) => (
        <Sequence key={i} from={Math.round(s.at * fps)} name={`sfx ${i}`} layout="none">
          <Audio src={srcOf(s.src)} volume={s.volume} />
        </Sequence>
      ))}
      {resolved.music ? (
        <Audio
          src={srcOf(resolved.music.src)}
          loop
          // The duck follows the episode timeline, not each pass of the loop.
          loopVolumeCurveBehavior="extend"
          volume={(f) => musicVolumeAt(f / fps, resolved.music!, resolved.lines, durationInFrames / fps)}
        />
      ) : null}
    </>
  );
};
