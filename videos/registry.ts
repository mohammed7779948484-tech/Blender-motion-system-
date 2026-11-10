// Every video folder registers here (the CLI's `new` command appends entries).
import type { VideoModule } from "../src/engine";
import itWorksOnMyMachine from "./it-works-on-my-machine";
import launchPromo from "./launch-promo";
import ctrlZ from "./ctrl-z";
import oneTake from "./one-take";
import ctrlZRemaster from "./ctrl-z-remaster";
import coAuthoredBy from "./co-authored-by";

export const VIDEOS: VideoModule[] = [itWorksOnMyMachine, launchPromo, ctrlZ, oneTake, ctrlZRemaster, coAuthoredBy];
