# Characters: the free route

Gemini (concept art) → Tripo or Meshy free tier (3D model) → Mixamo (rig and motion-captured animation) → GitHub → Claude wires them in.

Total cost: $0. You need a Google account, a Tripo or Meshy account, and an Adobe account (Mixamo).

---

## 1. Concept turnarounds in Gemini

For each member, ask Gemini for one image with **three views side by side: front, side and back**. The body should be in an **A-pose**: arms slightly out, about 45°, and empty hands. A clean background and an even, flat light make the 3D step far more accurate.

Paste this, then change the description line for each member:

> Character turnaround sheet for a stylised 3D sports game in the style of a premium Nintendo-like sports game: friendly proportions (slightly large head, big expressive eyes), smooth clean shapes, soft pastel materials, no outlines. Three views side by side on a plain light grey background: front, left side, back. Full body, A-pose (arms 45° away from the body, palms down, empty hands), feet slightly apart, neutral expression, even studio lighting, no shadows, no props.
> **Character:** [description below]

| File name | Description line |
| --- | --- |
| `theo` | Young man, light tan skin, brown quiff, white sun visor, sage-green polo with cream trim, cream shorts, white trainers. |
| `lila` | Young woman, fair skin with freckles, auburn high ponytail with a lilac scrunchie, lilac tank top and lilac pleated tennis skirt, white wristband, white trainers. |
| `jasper` | Young man, light skin, wavy blond hair, powder-blue cardigan over a white tee, pale yellow shorts, white trainers. |
| `marcus` | Man, deep brown skin, rounded afro, short beard, broad build, terracotta polo with cream trim, cream trousers, white trainers. |
| `mei` | Young woman, light skin, black hair in a top bun, cream cropped top with sage trim, sage pleated skirt, white trainers. |
| `zara` | Young woman, brown skin, curly dark hair under a lilac cap, butter-yellow polo, lilac shorts, white trainers. |
| `crowd_a`, `crowd_b` | Two generic resort guests (one man, one woman) in simple pastel summer outfits, for the crowd. |
| `dj` | DJ, white tee and sage shorts, headphones around the neck. |

Save each image at the highest resolution Gemini gives you.

## 2. Image to 3D (Tripo or Meshy free tier)

- **Tripo** (tripo3d.ai): use Image to 3D. If it offers **multi-view**, give it the front, side and back views cropped from the sheet as separate images. That's much better than a single image.
- **Meshy** (meshy.ai): Image to 3D, the same idea.

Settings:
- textured, with **PBR** if offered;
- **A-pose** if there's a pose option;
- around 20–30k polygons if there's a limit option.

Export as **FBX**, because Mixamo can't read GLB. If only GLB is available, export GLB and tell me; I'll convert it.

Read the free tier's licence before you build on it. Some free tiers make your models public, ask for attribution, or don't allow commercial use. Paying for one month removes that if it matters for launch.

## 3. Rig and animate in Mixamo (mixamo.com, free)

1. **Upload Character** → choose the FBX → place the markers (chin, wrists, elbows, knees, groin). Use "Standard Skeleton" with **no** finger detail if the hands are mittens.
2. Check the preview, then go to **Animations**. Search for each term below, pick the best match, and adjust Overdrive (speed) and Character Arm-Space if the arms clip the body.
3. Download settings:
   - **The first file for each character:** FBX Binary, **With Skin**, 30 fps, Keyframe Reduction none. Name it `<member>.fbx`, e.g. `theo.fbx`.
   - **Every other animation:** FBX Binary, **Without Skin**, 30 fps. Name it as in the table. For anything that moves the character, tick **In Place**.

Animations are shared: download each one **once, on Theo**. Every member uses the same Mixamo skeleton, so I'll retarget them to everyone.

| Save as | Search Mixamo for | Used for |
| --- | --- | --- |
| `ready_idle.fbx` | "tennis idle" or "ready idle" / "fighting idle" | Waiting for the ball |
| `forehand.fbx` | "tennis forehand" | Forehand drive |
| `backhand.fbx` | "tennis backhand" | Backhand drive |
| `serve.fbx` | "tennis serve" (underarm is ideal; any serve works) | Serve |
| `volley.fbx` | "tennis volley" or a short "punch" | Dinks and net volleys |
| `strafe_left.fbx` / `strafe_right.fbx` | "left strafe" / "right strafe" (In Place) | Side-steps along the baseline |
| `run.fbx` | "running" or "jog forward" (In Place) | Running to the ball |
| `run_back.fbx` | "jog backward" (In Place) | Backing up for lobs |
| `split_step.fbx` | "jump" (a small hop) | Split step before the opponent hits |
| `celebrate.fbx` | "victory" or "cheering" | Winning a point |
| `fist_pump.fbx` | "fist pump" | Big point |
| `dejected.fbx` | "disappointed" or "defeated" | Losing a point |
| `clap.fbx` | "clapping" | Good-sportsmanship moments |
| `wave.fbx` | "waving" | Intro walk-on |
| `match_win.fbx` | "victory idle" or "happy" | Results screen |
| **Crowd** (download on `crowd_a`) | | |
| `sit_idle.fbx` | "sitting idle" / "sitting talking" | Watching |
| `sit_clap.fbx` | "sitting clap" | Applause |
| `sit_cheer.fbx` | "sitting cheer" / "sitting thumbs up" | Cheers |
| `stand_cheer.fbx` | "cheering" | Standing ovation |
| **DJ** (download on `dj`) | | |
| `dj_play.fbx` | "dj" / "playing dj" or a slow "hip hop dancing" | Booth loop |

If a search term finds nothing, the closest-looking clip is fine. Tell me what you picked.

## 4. Send them to me

Upload everything to GitHub (now connected) on the web:
1. Open the repository on github.com. Switch to the branch **`claude/new-session-b357gl`**.
2. Go to **`rally-club/web/public/models/`** (create it by typing the path in "Add file → Create new file" if it doesn't exist).
3. **Add file → Upload files**. Characters go in `models/characters/`; animations go in `models/anims/`. Commit.
4. Tell me "models are up". I'll pull them, convert them to compressed GLB, and wire them in:
   - blended animation states: idle → run/strafe → swing → follow-through;
   - swings synced to ball contact;
   - the paddle attached to the hand bone;
   - expressions kept on the face;
   - the crowd driven by the seated clips;
   - the DJ on the booth loop.

Until the files arrive, the game keeps using the current sculpted members, so nothing breaks in the meantime.
