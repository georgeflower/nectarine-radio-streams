import type { ReactNode } from "react";

const BASE = "https://www.scenestream.net";

// Code → image URL. Sourced from https://www.scenestream.net/demovibes/smileys/
export const SMILEYS: Record<string, string> = {
  ":)": `${BASE}/static/emoticons/anim/ab.gif`,
  ":(": `${BASE}/static/emoticons/anim/ac.gif`,
  ";)": `${BASE}/static/emoticons/wink.gif`,
  ";(": `${BASE}/static/emoticons/tango/crying.png`,
  "d^^b": `${BASE}/static/emoticons/anim/ar.gif`,
  ":P": `${BASE}/static/emoticons/anim/ae.gif`,
  ":D": `${BASE}/static/emoticons/anim/ag.gif`,
  ":[": `${BASE}/static/emoticons/anim/ah.gif`,
  ":O": `${BASE}/static/emoticons/anim/ai.gif`,
  "=O": `${BASE}/static/emoticons/anim/ai.gif`,
  "o_o": `${BASE}/static/emoticons/anim/ai.gif`,
  "O_o": `${BASE}/static/emoticons/anim/ai.gif`,
  "o_O": `${BASE}/static/emoticons/anim/ai.gif`,
  "8)": `${BASE}/static/emoticons/anim/af.gif`,
  ":*": `${BASE}/static/emoticons/anim/aj.gif`,
  ":X": `${BASE}/static/emoticons/anim/al.gif`,
  ":help:": `${BASE}/static/emoticons/anim/bc.gif`,
  ":ok:": `${BASE}/static/emoticons/anim/bf.gif`,
  ":bravo:": `${BASE}/static/emoticons/anim/bi.gif`,
  ":|": `${BASE}/static/emoticons/tango/confused.png`,
  ":facepalm:": `${BASE}/static/emoticons/facepalm.gif`,
  ":beer:": `${BASE}/static/beer.gif`,
  ":dance:": `${BASE}/static/emoticons/anim/bp.gif`,
  ":necta:": `${BASE}/static/emoticons/support-our-fruits.gif`,
  ":sadnecta:": `${BASE}/static/emoticons/sadnecta.gif`,
  ":puke:": `${BASE}/static/emoticons/tango/puke.gif`,
  ":lol:": `${BASE}/static/emoticons/lol.gif`,
  ":rotfl:": `${BASE}/static/emoticons/anim/bj.gif`,
  ":rofl:": `${BASE}/static/emoticons/anim/bj.gif`,
  ":love:": `${BASE}/static/emoticons/heart.png`,
  ":heart:": `${BASE}/static/emoticons/heart.png`,
  "<3": `${BASE}/static/emoticons/heart.png`,
  ":heartbroken:": `${BASE}/static/emoticons/broken_heart.png`,
  "</3": `${BASE}/static/emoticons/broken_heart.png`,
  ":nectawall:": `${BASE}/static/emoticons/nectawall.gif`,
  ":mypony:": `${BASE}/static/emoticons/pony.gif`,
  ":mypinkpony:": `${BASE}/static/emoticons/pony2.gif`,
  ":clap:": `${BASE}/static/emoticons/clap.gif`,
  ":up:": `${BASE}/static/emoticons/anim/ay.gif`,
  ":dangerftw:": `${BASE}/static/emoticons/secret/1ow0fl.png`,
  ":coffee:": `${BASE}/static/emoticons/tango/coffee.png`,
  ":cake:": `${BASE}/static/emoticons/tango/cake.png`,
  ":silly:": `${BASE}/static/emoticons/tango/silly.png`,
  ":victory:": `${BASE}/static/emoticons/tango/victory.png`,
  ":slap:": `${BASE}/static/emoticons/tango/slap.gif`,
  ":crying:": `${BASE}/static/emoticons/tango/crying.png`,
  ":ass:": `${BASE}/static/emoticons/tango/ass.gif`,
  ":dupa:": `${BASE}/static/emoticons/tango/ass.gif`,
  ":gothpony:": `${BASE}/static/emoticons/goth_pony.png`,
  ":twisted:": `${BASE}/static/emoticons/tango/twisted.gif`,
  ":strongman:": `${BASE}/static/emoticons/tango/strongman.gif`,
  ":starving:": `${BASE}/static/emoticons/tango/starving.png`,
  ":sleepy:": `${BASE}/static/emoticons/tango/sleepy.png`,
  ":stop:": `${BASE}/static/emoticons/anim/av.gif`,
  ":angry:": `${BASE}/static/emoticons/tango/angry.png`,
  ":annoyed:": `${BASE}/static/emoticons/tango/annoy.gif`,
  ":he-man:": `${BASE}/static/emoticons/he-man.gif`,
  ":angry2:": `${BASE}/static/emoticons/angry.gif`,
  ":excited:": `${BASE}/static/emoticons/excited.gif`,
  ":faint:": `${BASE}/static/emoticons/faint.gif`,
  ":headbang:": `${BASE}/static/emoticons/headbang.gif`,
  ":scared:": `${BASE}/static/emoticons/scared.gif`,
  ":omgomg:": `${BASE}/static/emoticons/omgomg.gif`,
  "D:": `${BASE}/static/emoticons/onoes.gif`,
  ":onoes:": `${BASE}/static/emoticons/onoes.gif`,
  ":pokerface:": `${BASE}/static/emoticons/pokerface.gif`,
  ":facepalm2:": `${BASE}/static/emoticons/facepalm2.gif`,
  ":caramel:": `${BASE}/static/emoticons/caramel.gif`,
  ":typehappy:": `${BASE}/static/emoticons/typehappy.gif`,
  ":lick:": `${BASE}/static/emoticons/lick.gif`,
  ":artist:": `${BASE}/static/emoticons/artist.png`,
  ":pacman:": `${BASE}/static/emoticons/pacman.gif`,
  ":tard:": `${BASE}/static/emoticons/tard.png`,
  ":weekend:": `${BASE}/static/emoticons/weekend.gif`,
  ":lala:": `${BASE}/static/emoticons/lala.gif`,
  ":batman:": `${BASE}/static/emoticons/batman.gif`,
  ":meow:": `${BASE}/static/emoticons/meow.gif`,
  ":wizard:": `${BASE}/static/emoticons/gandalf.gif`,
  ":o)": `${BASE}/static/emoticons/clown.gif`,
  ":outrun:": `${BASE}/static/emoticons/outrun.png`,
  ":wine:": `${BASE}/static/emoticons/wine2.png`,
  ":olds:": `${BASE}/static/emoticons/2uiw74k.gif`,
  ":shoop:": `${BASE}/static/emoticons/viking.png`,
  ":allthethings:": `${BASE}/static/emoticons/meme/allthethings.png`,
  ":caruso:": `${BASE}/static/emoticons/meme/caruso.png`,
  ":cerealguy:": `${BASE}/static/emoticons/meme/cerealguy.png`,
  ":challengeaccepted:": `${BASE}/static/emoticons/meme/challengeaccepted.png`,
  ":farnsworth:": `${BASE}/static/emoticons/meme/farnsworth.png`,
  ":foreveralone:": `${BASE}/static/emoticons/meme/foreveralone.png`,
  ":fuxdat:": `${BASE}/static/emoticons/meme/fuxdat.png`,
  ":makesnosense:": `${BASE}/static/emoticons/meme/jackie.png`,
  ":troll:": `${BASE}/static/emoticons/meme/troll2.png`,
  ":yey:": `${BASE}/static/emoticons/meme/yey.png`,
  ":yuno:": `${BASE}/static/emoticons/meme/yuno.png`,
  ":ifyouknow:": `${BASE}/static/emoticons/meme/if-you-know-what-i-mean.png`,
  ":dolan:": `${BASE}/static/emoticons/meme/Dolan1.png`,
  ":gooby:": `${BASE}/static/emoticons/meme/Gooby1.png`,
  ":grinch:": `${BASE}/static/emoticons/xmas/grinch.gif`,
  ":xsmile:": `${BASE}/static/emoticons/xmas/smile.gif`,
  ":iamsmiling:": `${BASE}/static/emoticons/xmas/smiling.gif`,
  ":snowman:": `${BASE}/static/emoticons/xmas/snowman.gif`,
  ":xtard:": `${BASE}/static/emoticons/xmas/tard.gif`,
  ":xnecta:": `${BASE}/static/emoticons/xmas/support-our-fruits-xmucx3b.gif`,
  ":drunk:": `${BASE}/static/emoticons/s/anim_drunk.gif`,
  ":handshake:": `${BASE}/static/emoticons/s/anim_handshake.gif`,
  ":c0ffee:": `${BASE}/static/emoticons/s/coffee.gif`,
  ":grouphug:": `${BASE}/static/emoticons/s/grouphug.gif`,
  ":blbl:": `${BASE}/static/emoticons/s/anim_blbl.gif`,
  ":chill:": `${BASE}/static/emoticons/chill-pill-smiley.gif`,
  ":susanna:": `${BASE}/static/emoticons/smiley_singing_13213.gif`,
  ":lilyplay:": `${BASE}/static/emoticons/35bf78j.gif`,
  ":alien:": `${BASE}/static/emoticons/alien.png`,
  ":n1njacat:": `${BASE}/static/emoticons/ninja_kitten.png`,
  ":tdgc:": `${BASE}/static/emoticons/tdgc.gif`,
  ":glop:": `${BASE}/static/emoticons/glop.png`,
  ":motu:": `${BASE}/static/emoticons/he-man.png`,
  ":c64:": `${BASE}/static/emoticons/c64.png`,
  ":amiga:": `${BASE}/static/emoticons/amiga_01.png`,
  ":boing:": `${BASE}/static/emoticons/amigaball.png`,
  ":disk:": `${BASE}/static/emoticons/amigadisk.png`,
  ":zzz:": `${BASE}/static/emoticons/amigazz.png`,
  ":bomb:": `${BASE}/static/emoticons/ataribomb.png`,
  ":busybee:": `${BASE}/static/emoticons/ataribusy.png`,
  ":atari:": `${BASE}/static/emoticons/atarilogo.png`,
  ":scotty:": `${BASE}/static/emoticons/beam_me_up.gif`,
  ":rockband:": `${BASE}/static/emoticons/rockband.gif`,
  ":beer2:": `${BASE}/static/emoticons/beer2.gif`,
  ":eyeroll:": `${BASE}/static/emoticons/eyeroll.gif`,
  ":5*:": `${BASE}/static/emoticons/5star.gif`,
  ":1*:": `${BASE}/static/emoticons/1star.gif`,
};

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a single regex once, sorted longest-first so e.g. ":facepalm2:" wins over ":facepalm:"
const SMILEY_PATTERN = (() => {
  const codes = Object.keys(SMILEYS).sort((a, b) => b.length - a.length);
  return new RegExp(codes.map(escapeRegex).join("|"), "g");
})();

export function renderWithSmileys(text: string): ReactNode[] {
  if (!text) return [];
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  SMILEY_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SMILEY_PATTERN.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const code = m[0];
    out.push(
      <img
        key={`s-${key++}`}
        src={SMILEYS[code]}
        alt={code}
        title={code}
        loading="lazy"
        className="inline-block h-4 align-text-bottom mx-0.5"
      />,
    );
    last = m.index + code.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
