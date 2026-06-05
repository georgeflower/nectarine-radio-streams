export type GooseVariant = "white" | "brown";

const FRAMES: string[][] = [
  [
    "...KK...................",
    "..KGGK..................",
    "..KWWGK.................",
    "..KGWWGK................",
    "...KGWWGK...............",
    "....KGWWGK..............",
    ".....KWWWWKK....KKKK....",
    "....KWLLLLLLWKKKWEWWK...",
    "....KWLLLLLLLLWWWWWKKDO.",
    ".....KGLLLLLWKKKWWWWKKD.",
    "......KGGGGGK....KKKK...",
    ".......KKKKK............",
    "........O.O.............",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
  [
    "........................",
    "...KKK..................",
    "..KGGGK.................",
    "..KGWWGKK...............",
    "...KGWWWGK..............",
    "....KGGWWGK.............",
    ".....KWWWWKK....KKKK....",
    "....KWLLLLLLWKKKWEWWK...",
    "....KWLLLLLLLLWWWWWKKDO.",
    ".....KGLLLLLWKKKWWWWKKD.",
    "......KGGGGGK....KKKK...",
    ".......KKKKK............",
    "........O.O.............",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
  [
    "........................",
    "........................",
    "..KKK...................",
    ".KGGGK..................",
    "KGWWWGK.................",
    ".KGGWWGK................",
    ".....KWWWWKK....KKKK....",
    "....KWLLLLLLWKKKWEWWK...",
    "....KWLLLLLLLLWWWWWKKDO.",
    ".....KGLLLLLWKKKWWWWKKD.",
    "......KGGGGGK....KKKK...",
    ".......KKKKK............",
    "........O.O.............",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
  [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    ".....KWWWWKK....KKKK....",
    "....KWLLLLLLWKKKWEWWK...",
    "....KWLLLLLLLLWWWWWKKDO.",
    ".....KGLLLLLWKKKWWWWKKD.",
    "......KGGGGGK....KKKK...",
    ".......KKKKK............",
    "........O.O.............",
    "....KGWWGK..............",
    "...KGWWWWGK.............",
    "..KGWWWWWGK.............",
    "..KGWWWGK...............",
    "...KKKK.................",
  ],
  [
    "........KKKK............",
    ".......KWWWWK...........",
    ".......KWEWWWKKDO.......",
    ".......KWWWWWKD.........",
    "........KWWWK...........",
    "........KWWK............",
    "........KWWK............",
    ".........KWWK...........",
    ".........KWWK...........",
    "..........KWWK..........",
    "..........KWWWK.........",
    ".........KWWWWWK........",
    "........KWLLLLLWK.......",
    ".......KWLLLLLLLWK......",
    ".......KWLLLLLLLWK......",
    "........KGGGGGGGK.......",
    ".........KKKKKKK........",
    "........O.....O.........",
  ],
  [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "..........KWWK..........",
    ".........KWWWWWK........",
    "........KWLLLLLWK.......",
    ".......KWLLLLLLLWK......",
    ".......KWLLLLLLLWK......",
    "........KGGGGGGGK.......",
    ".........KKKKKKK........",
    "........O.....O.........",
  ],
  [
    "..........KKKK..........",
    ".........KWWWWK.........",
    ".........KWEWWWKKDO.....",
    ".........KWWWWWKD.......",
    "..........KWWWK.........",
    "..........KWWK..........",
    "..........KWWK..........",
    "..........KWWK..........",
    "..........KWWK..........",
    "..........KWWK..........",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
  ],
];

const PALETTES: Record<GooseVariant, Record<string, string>> = {
  white: {
    K: "#1a1a1a",
    W: "#ffffff",
    L: "#e8eaee",
    G: "#b8bcc2",
    O: "#ff8a1f",
    D: "#c95a00",
    E: "#1a1a1a",
  },
  brown: {
    K: "#2a1a0d",
    W: "#8a5a32",
    L: "#e6cfa8",
    G: "#5a3a1f",
    O: "#f2c542",
    D: "#a07020",
    E: "#0d0703",
  },
};

export const PIXEL = 3;
export const FRAME_W = 24;
export const FRAME_H = 18;
export const BASE_SPRITE_W = FRAME_W * PIXEL;
export const BASE_SPRITE_H = FRAME_H * PIXEL;
export const STAND_FRAME = 4;
export const STAND_BODY = 5;
export const STAND_HEAD = 6;
export const NECK_PIVOT_X_PX = 11.5 * PIXEL;
export const NECK_PIVOT_Y_PX = 10 * PIXEL;

function buildFrameSvgs(variant: GooseVariant): string[] {
  const colors = PALETTES[variant];
  return FRAMES.map((rows) => {
    const rects: string[] = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = colors[row[x]];
        if (!color) continue;
        rects.push(
          `<rect x="${x * PIXEL}" y="${y * PIXEL}" width="${PIXEL}" height="${PIXEL}" fill="${color}"/>`,
        );
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${BASE_SPRITE_W}" height="${BASE_SPRITE_H}" viewBox="0 0 ${BASE_SPRITE_W} ${BASE_SPRITE_H}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
  });
}

export function buildGooseFrameDataUrls(variant: GooseVariant = "white"): string[] {
  return buildFrameSvgs(variant).map(
    (svg) => "data:image/svg+xml;utf8," + encodeURIComponent(svg),
  );
}
