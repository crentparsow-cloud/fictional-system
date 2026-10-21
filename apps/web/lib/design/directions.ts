/**
 * The three design directions (plan 1.1 to 1.9), as data. This file and the
 * generated CSS in app/themes/ are the only places a colour value may be
 * written. Values are taken from the token strips of the three mock-ups; a
 * test keeps the CSS files in step with this file (pnpm design:themes
 * rewrites them). Choosing a direction is then one environment variable.
 *
 * Do not add a hex value anywhere else in the app. Components read tokens.
 */

export const SHELF_IDS = ["mind-and-mood","work-and-career","money","family-and-parenting","love-and-relationships","personal-growth","learning-and-skills","health-and-body","faith-and-spirituality","creativity-and-making"] as const;
export type ShelfId = (typeof SHELF_IDS)[number];

export const DIRECTION_IDS = ["paper-and-ink", "bright-editorial", "quiet-confidence"] as const;
export type DirectionId = (typeof DIRECTION_IDS)[number];
export const DEFAULT_DIRECTION: DirectionId = "bright-editorial";

export interface Palette {
  canvas: string;
  surface: string;
  "surface-2": string;
  line: string;
  /** Borders of controls. Reaches 3:1 against canvas, surface and surface-2. */
  "line-strong": string;
  ink: string;
  "ink-soft": string;
  /** The one reserved brand colour. Key actions and the logo only. */
  brand: string;
  "brand-ink": string;
  /** Brand colour that is safe as text on canvas and surface (links, small labels). */
  "brand-text": string;
  "brand-wash": string;
  highlight: string;
}

export interface ShelfPair {
  /** Tile background. */
  tint: string;
  /** Icon and rule colour on the tint. */
  accent: string;
}

export interface CoverStyle {
  /** Corner radius on a 120 by 160 unit cover. */
  radius: number;
  /** A hairline frame in the accent colour, or none. */
  frame: "hairline" | "none";
  /** One quiet shape behind the type. */
  motif: "none" | "circle" | "wave";
}

export interface Direction {
  id: DirectionId;
  label: string;
  /** CSS stacks. The family names match the @font-face rules in app/fonts.css. */
  serifStack: string;
  sansStack: string;
  /** The family name Satori uses (see lib/design/og-fonts). */
  serifName: string;
  sansName: string;
  radius: number;
  radiusSm: number;
  pill: number;
  cover: CoverStyle;
  /** Self-hosted files this direction loads, under /fonts. Budget in docs/FONTS.md. */
  fontFiles: readonly string[];
  light: Palette;
  dark: Palette;
  shelves: Record<ShelfId, { light: ShelfPair; dark: ShelfPair }>;
}

export const DIRECTIONS: Record<DirectionId, Direction> = {
  "paper-and-ink": {
    id: "paper-and-ink",
    label: "Paper and ink",
    serifStack: "\"Literata\", Georgia, serif",
    sansStack: "\"Akana Sans\", system-ui, sans-serif",
    serifName: "Literata",
    sansName: "Akana Sans",
    radius: 6,
    radiusSm: 4,
    pill: 6,
    cover: {radius: 4, frame: "hairline", motif: "none"},
    fontFiles: ["literata-latin-wght-normal.woff2","literata-latin-wght-italic.woff2","akana-sans-latin-wght-normal.woff2"],
    light: {
      "canvas": "#f6f1e7",
      "surface": "#fdfbf6",
      "surface-2": "#efe8da",
      "line": "#d9d0bf",
      "line-strong": "#868179",
      "ink": "#1f1a14",
      "ink-soft": "#5b5347",
      "brand": "#27496d",
      "brand-ink": "#ffffff",
      "brand-text": "#27496d",
      "brand-wash": "#e6ecf3",
      "highlight": "#fbda83"
    },
    dark: {
      "canvas": "#171511",
      "surface": "#201d18",
      "surface-2": "#2a261f",
      "line": "#3a352c",
      "line-strong": "#76726a",
      "ink": "#efe9dc",
      "ink-soft": "#b3aa99",
      "brand": "#9cc0e6",
      "brand-ink": "#10202e",
      "brand-text": "#9cc0e6",
      "brand-wash": "#22303f",
      "highlight": "#5e4a14"
},
    shelves: {
      "mind-and-mood": {
            "light": {
                  "tint": "#dfe6e3",
                  "accent": "#2a5a52"
            },
            "dark": {
                  "tint": "#1f302d",
                  "accent": "#9ccfc4"
            }
      },
      "work-and-career": {
            "light": {
                  "tint": "#e0e3e8",
                  "accent": "#33465c"
            },
            "dark": {
                  "tint": "#262d36",
                  "accent": "#b6c6d8"
            }
      },
      "money": {
            "light": {
                  "tint": "#ece6cf",
                  "accent": "#5c4a0a"
            },
            "dark": {
                  "tint": "#332e1b",
                  "accent": "#e3cf85"
            }
      },
      "family-and-parenting": {
            "light": {
                  "tint": "#e9e4d2",
                  "accent": "#4f5a1a"
            },
            "dark": {
                  "tint": "#2e301c",
                  "accent": "#d3d58c"
            }
      },
      "love-and-relationships": {
            "light": {
                  "tint": "#f1dfe0",
                  "accent": "#7d2f3e"
            },
            "dark": {
                  "tint": "#3a2328",
                  "accent": "#f0a9b4"
            }
      },
      "personal-growth": {
            "light": {
                  "tint": "#e2e8d9",
                  "accent": "#3b5a22"
            },
            "dark": {
                  "tint": "#28321f",
                  "accent": "#b7d49a"
            }
      },
      "learning-and-skills": {
            "light": {
                  "tint": "#e3e6ea",
                  "accent": "#2f4a63"
            },
            "dark": {
                  "tint": "#232d38",
                  "accent": "#a9c4de"
            }
      },
      "health-and-body": {
            "light": {
                  "tint": "#dfe9dd",
                  "accent": "#1f5a3a"
            },
            "dark": {
                  "tint": "#1f3127",
                  "accent": "#9bd3b0"
            }
      },
      "faith-and-spirituality": {
            "light": {
                  "tint": "#ece5d3",
                  "accent": "#5b4a12"
            },
            "dark": {
                  "tint": "#332d1d",
                  "accent": "#e6cf8a"
            }
      },
      "creativity-and-making": {
            "light": {
                  "tint": "#f3e2d9",
                  "accent": "#7a3b1e"
            },
            "dark": {
                  "tint": "#3a2a22",
                  "accent": "#f0b79c"
            }
      }
},
  },
  "bright-editorial": {
    id: "bright-editorial",
    label: "Bright editorial",
    serifStack: "\"Akana Serif\", Georgia, serif",
    sansStack: "\"Bricolage Grotesque\", system-ui, sans-serif",
    serifName: "Akana Serif",
    sansName: "Bricolage Grotesque",
    radius: 16,
    radiusSm: 10,
    pill: 18,
    cover: {radius: 10, frame: "none", motif: "circle"},
    fontFiles: ["akana-serif-latin-wght-normal.woff2","akana-serif-latin-wght-italic.woff2","bricolage-grotesque-latin-wght-normal.woff2"],
    light: {
      "canvas": "#fbf6ec",
      "surface": "#fffdf8",
      "surface-2": "#f3ebdb",
      "line": "#e7dac2",
      "line-strong": "#8a7762",
      "ink": "#2a1e18",
      "ink-soft": "#5b4a40",
      "brand": "#c2360f",
      "brand-ink": "#ffffff",
      "brand-text": "#a82e0b",
      "brand-wash": "#fbeae4",
      "highlight": "#e3aa45"
    },
    dark: {
      "canvas": "#121212",
      "surface": "#1b1b1b",
      "surface-2": "#242423",
      "line": "#333331",
      "line-strong": "#71716f",
      "ink": "#f3f3f0",
      "ink-soft": "#b5b5ad",
      "brand": "#ff8a62",
      "brand-ink": "#2a0e04",
      "brand-text": "#ff9b78",
      "brand-wash": "#3a1d12",
      "highlight": "#8a6b12"
},
    shelves: {
      "mind-and-mood": {
            "light": {
                  "tint": "#cdeef0",
                  "accent": "#0f5a5e"
            },
            "dark": {
                  "tint": "#133f42",
                  "accent": "#9fe0e3"
            }
      },
      "work-and-career": {
            "light": {
                  "tint": "#dde4ee",
                  "accent": "#2a3d5c"
            },
            "dark": {
                  "tint": "#263345",
                  "accent": "#c4d2e6"
            }
      },
      "money": {
            "light": {
                  "tint": "#fff0b8",
                  "accent": "#5a4500"
            },
            "dark": {
                  "tint": "#433a0e",
                  "accent": "#ffe28a"
            }
      },
      "family-and-parenting": {
            "light": {
                  "tint": "#dff0c8",
                  "accent": "#2f5a0c"
            },
            "dark": {
                  "tint": "#283f12",
                  "accent": "#c6e69a"
            }
      },
      "love-and-relationships": {
            "light": {
                  "tint": "#ffd6e0",
                  "accent": "#8a1f3d"
            },
            "dark": {
                  "tint": "#4a1c2b",
                  "accent": "#ffb9c9"
            }
      },
      "personal-growth": {
            "light": {
                  "tint": "#e2e0ff",
                  "accent": "#3b2f8a"
            },
            "dark": {
                  "tint": "#2a2552",
                  "accent": "#cbc6ff"
            }
      },
      "learning-and-skills": {
            "light": {
                  "tint": "#d4e6ff",
                  "accent": "#1e3f80"
            },
            "dark": {
                  "tint": "#1c2f4f",
                  "accent": "#b7d0ff"
            }
      },
      "health-and-body": {
            "light": {
                  "tint": "#c9f0dc",
                  "accent": "#0d5a39"
            },
            "dark": {
                  "tint": "#143f2c",
                  "accent": "#9fe3c0"
            }
      },
      "faith-and-spirituality": {
            "light": {
                  "tint": "#f3e7c3",
                  "accent": "#5a4600"
            },
            "dark": {
                  "tint": "#433a14",
                  "accent": "#f3dd8a"
            }
      },
      "creativity-and-making": {
            "light": {
                  "tint": "#ffd9c7",
                  "accent": "#7a2e0e"
            },
            "dark": {
                  "tint": "#4a2615",
                  "accent": "#ffc7ad"
            }
      }
},
  },
  "quiet-confidence": {
    id: "quiet-confidence",
    label: "Quiet confidence",
    serifStack: "\"Literata\", Georgia, serif",
    sansStack: "\"Lexend\", system-ui, sans-serif",
    serifName: "Literata",
    sansName: "Lexend",
    radius: 14,
    radiusSm: 10,
    pill: 14,
    cover: {radius: 10, frame: "none", motif: "wave"},
    fontFiles: ["literata-latin-wght-normal.woff2","literata-latin-wght-italic.woff2","lexend-latin-wght-normal.woff2"],
    light: {
      "canvas": "#f2f4f8",
      "surface": "#ffffff",
      "surface-2": "#e9edf3",
      "line": "#d6dce6",
      "line-strong": "#7f848d",
      "ink": "#141c2b",
      "ink-soft": "#4f5a6e",
      "brand": "#e3a73a",
      "brand-ink": "#1d1405",
      "brand-text": "#7a5200",
      "brand-wash": "#fbf0da",
      "highlight": "#ffe29a"
    },
    dark: {
      "canvas": "#0e1a2e",
      "surface": "#172540",
      "surface-2": "#1f2f4d",
      "line": "#2d3f61",
      "line-strong": "#757d8b",
      "ink": "#eef2f8",
      "ink-soft": "#aab6c9",
      "brand": "#f0b64a",
      "brand-ink": "#1d1405",
      "brand-text": "#f3c66c",
      "brand-wash": "#2e2a1c",
      "highlight": "#7a5a14"
},
    shelves: {
      "mind-and-mood": {
            "light": {
                  "tint": "#dbe7ea",
                  "accent": "#23545f"
            },
            "dark": {
                  "tint": "#1e3845",
                  "accent": "#9fd3dd"
            }
      },
      "work-and-career": {
            "light": {
                  "tint": "#dfe3ec",
                  "accent": "#2f4160"
            },
            "dark": {
                  "tint": "#273553",
                  "accent": "#bfd0ea"
            }
      },
      "money": {
            "light": {
                  "tint": "#ece7d2",
                  "accent": "#5a4a10"
            },
            "dark": {
                  "tint": "#3a3420",
                  "accent": "#e6cf8a"
            }
      },
      "family-and-parenting": {
            "light": {
                  "tint": "#e6ebdb",
                  "accent": "#44561c"
            },
            "dark": {
                  "tint": "#2d3826",
                  "accent": "#c9d99a"
            }
      },
      "love-and-relationships": {
            "light": {
                  "tint": "#f3dfe6",
                  "accent": "#7a2e48"
            },
            "dark": {
                  "tint": "#432736",
                  "accent": "#f3b0c6"
            }
      },
      "personal-growth": {
            "light": {
                  "tint": "#e2e7e0",
                  "accent": "#375a2c"
            },
            "dark": {
                  "tint": "#263a2e",
                  "accent": "#b5d6a8"
            }
      },
      "learning-and-skills": {
            "light": {
                  "tint": "#dde5f2",
                  "accent": "#2b4a78"
            },
            "dark": {
                  "tint": "#213354",
                  "accent": "#b3cbf0"
            }
      },
      "health-and-body": {
            "light": {
                  "tint": "#dcebe3",
                  "accent": "#1f5a40"
            },
            "dark": {
                  "tint": "#1d3a33",
                  "accent": "#9fd9bd"
            }
      },
      "faith-and-spirituality": {
            "light": {
                  "tint": "#efe8d8",
                  "accent": "#5f4b16"
            },
            "dark": {
                  "tint": "#3a3324",
                  "accent": "#e8d08f"
            }
      },
      "creativity-and-making": {
            "light": {
                  "tint": "#f6e3dc",
                  "accent": "#7a3a22"
            },
            "dark": {
                  "tint": "#3f2a2a",
                  "accent": "#f3b9a2"
            }
      }
},
  },
};

export function isDirectionId(v: unknown): v is DirectionId {
  return typeof v === "string" && (DIRECTION_IDS as readonly string[]).includes(v);
}
