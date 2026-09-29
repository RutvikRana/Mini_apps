import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  Pin,
  RefreshCw,
  Search,
  User,
} from "lucide-react";

/**
 * Pinterest content viewer — browse pins and profiles in-app, no login wall.
 *
 * Data comes from the public widget API that powers Pinterest's own save
 * button (widgets.pinterest.com/v3/pidgets). It sends
 * `access-control-allow-origin: *` and needs no key, so the browser can
 * call it directly. The main pinterest.com site itself cannot be framed
 * (X-Frame-Options: SAMEORIGIN), so interactions (save/repin) link out.
 */

const API = "https://widgets.pinterest.com/v3/pidgets";

type PinImage = { url: string; width?: number; height?: number };
type VideoVariant = { url?: string; thumbnail?: string; width?: number; height?: number; duration?: number };
type VideoList = Record<string, VideoVariant | Record<string, VideoVariant>>;
type StoryPage = {
  image?: { images?: Record<string, PinImage> } | null;
  blocks?: { video_data?: { video_list?: VideoList } | null }[] | null;
};
type UserInfo = {
  id?: string;
  full_name?: string;
  username?: string;
  about?: string;
  follower_count?: number;
  pin_count?: number;
  profile_url?: string;
  image_small_url?: string;
  image_medium_url?: string;
};
type BoardInfo = {
  name?: string;
  url?: string;
  description?: string | null;
  pin_count?: number;
  follower_count?: number;
  image_thumbnail_url?: string;
};
type PinData = {
  id: string;
  description?: string | null;
  images: Record<string, PinImage>;
  repin_count?: number;
  dominant_color?: string | null;
  is_video?: boolean;
  link?: string | null;
  domain?: string | null;
  board?: BoardInfo | null;
  pinner?: UserInfo | null;
  native_creator?: UserInfo | null;
  aggregated_pin_data?: { aggregated_stats?: { saves?: number; done?: number } } | null;
  /** Idea/story pins (multi-page video format). */
  story_pin_data?: {
    page_count?: number;
    pages?: StoryPage[];
    metadata?: { pin_title?: string | null; canvas_aspect_ratio?: number | null } | null;
  } | null;
  /** Regular video pins. */
  videos?: { video_list?: VideoList } | null;
};
type UserData = {
  user?: UserInfo;
  pins?: PinData[];
};

type VideoInfo = { mp4: string; poster?: string; durationMs?: number };

/** Best-quality image URL for a pin, descending preference. */
function bestImage(pin: PinData, size: "grid" | "large"): string | undefined {
  if (size === "grid") return pin.images["236x"]?.url ?? pin.images["237x"]?.url;
  return (
    pin.images["564x"]?.url ??
    pin.images["237x"]?.url ??
    pin.images["236x"]?.url ??
    pin.images[Object.keys(pin.images)[0]]?.url
  );
}

/** The widget API returns HTML-escaped text (&#8217; …). Decode for display. */
function decodeEntities(text: string | null | undefined): string {
  if (!text) return "";
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value.trim();
}

function formatCount(n: number | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Total saves across all repins of this pin (falls back to direct repins). */
function savesOf(pin: PinData): number {
  return pin.aggregated_pin_data?.aggregated_stats?.saves ?? pin.repin_count ?? 0;
}

/** Times people marked the pin as "done"/tried. */
function doneOf(pin: PinData): number {
  return pin.aggregated_pin_data?.aggregated_stats?.done ?? 0;
}

/**
 * The API's person objects carry `profile_url` but (inconsistently) no
 * `username`, so derive the handle for in-app navigation.
 */
function usernameOf(person: UserInfo | null | undefined): string | null {
  if (!person) return null;
  if (person.username) return person.username;
  const fromUrl = person.profile_url?.match(/pinterest\.[a-z.]+\/([^/?]+)/i)?.[1];
  return fromUrl ?? null;
}

type PinKind = { label: string; icon: typeof Film };

function kindOf(pin: PinData): PinKind {
  if (pin.story_pin_data?.pages?.length) {
    return { label: `Idea Pin · ${pin.story_pin_data.page_count ?? pin.story_pin_data.pages.length} page${(pin.story_pin_data.page_count ?? pin.story_pin_data.pages.length) === 1 ? "" : "s"}`, icon: Layers };
  }
  if (pin.is_video || extractVideo(pin)) return { label: "Video", icon: Film };
  return { label: "Image", icon: ImageIcon };
}

/** Title: Idea Pin metadata title, else first line of the description. */
function titleOf(pin: PinData): string {
  const metaTitle = decodeEntities(pin.story_pin_data?.metadata?.pin_title);
  if (metaTitle) return metaTitle;
  return decodeEntities(pin.description).split("\n")[0] ?? "";
}

/**
 * Pinterest stores tags only as #hashtags inside the description text.
 * If the description ends with a contiguous hashtag block (the common
 * pattern), lift it out so it can render as chips instead of a text wall.
 */
function splitHashtags(text: string): { body: string; tags: string[] } {
  const tail = text.match(/(?:^|\n)[\s\u00a0]*((?:#[\p{L}\p{N}_]{2,50}[\s\u00a0]*)+)$/u);
  if (!tail || tail.index === undefined) return { body: text, tags: [] };
  const tags = [...new Set([...tail[1].matchAll(/#([\p{L}\p{N}_]{2,50})/gu)].map((m) => m[1]))];
  return { body: text.slice(0, tail.index).replace(/[\s\u00a0]+$/g, ""), tags };
}

/**
 * Pull a directly playable MP4 out of a pin, if it has one.
 *
 * The widget API exposes two shapes:
 *  - Idea/story pins: story_pin_data.pages[].blocks[].video_data.video_list
 *  - plain video pins: videos.video_list
 * Both are Maps keyed by variant (V_720P, V_HLSV4, …) and — annoyingly — the
 * variant entry is sometimes wrapped one level deeper in a same-named key.
 * We walk entries until we find a plain .url and prefer MP4 over HLS.
 */
function extractVideo(pin: PinData): VideoInfo | null {
  const pickFromList = (list: VideoList | undefined | null): VideoVariant | null => {
    if (!list) return null;
    const entries = Object.values(list);
    const flatten = (entry: VideoVariant | Record<string, VideoVariant>): VideoVariant | null =>
      "url" in entry && entry.url ? (entry as VideoVariant) : null;
    const candidates = [
      ...entries.map(flatten).filter(Boolean),
      ...entries.flatMap((e) => (e && typeof e === "object" && !("url" in e) ? Object.values(e).map(flatten).filter(Boolean) : [])),
    ] as VideoVariant[];
    return candidates.find((v) => v.url?.includes(".mp4")) ?? candidates[0] ?? null;
  };

  for (const page of pin.story_pin_data?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      const variant = pickFromList(block.video_data?.video_list);
      if (variant?.url) {
        const poster =
          page.image?.images?.["736x"]?.url ?? page.image?.images?.["236x"]?.url ?? variant.thumbnail;
        return { mp4: variant.url, poster, durationMs: variant.duration };
      }
    }
  }

  const plain = pickFromList(pin.videos?.video_list);
  if (plain?.url) return { mp4: plain.url, poster: bestImage(pin, "large"), durationMs: plain.duration };
  return null;
}

const openOnPinterest = (path: string) => {
  window.open(`https://www.pinterest.com${path}`, "_blank", "noopener,noreferrer");
};

/* ---------------------------------- types --------------------------------- */

type View =
  | { kind: "home" }
  | { kind: "pin"; pinId: string }
  | { kind: "profile"; username: string };

/* ------------------------------- data hooks ------------------------------- */

function usePin(pinId: string) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; pin: PinData | null }>({
    loading: true,
    error: null,
    pin: null,
  });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, pin: null });
    fetch(`${API}/pins/info/?pin_ids=${pinId}`)
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        const pin = json?.data?.[0] as PinData | undefined;
        if (!pin) throw new Error("Pin not found");
        setState({ loading: false, error: null, pin });
      })
      .catch(() => alive && setState({ loading: false, error: "Couldn't load this pin.", pin: null }));
    return () => {
      alive = false;
    };
  }, [pinId]);

  return state;
}

function useUserPins(username: string) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: UserData | null }>({
    loading: true,
    error: null,
    data: null,
  });
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetch(`${API}/users/${encodeURIComponent(username)}/pins/`)
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (json?.status !== "success") throw new Error(json?.message ?? "Not found");
        setState({ loading: false, error: null, data: json.data as UserData });
      })
      .catch((err: Error) => alive && setState({ loading: false, error: err.message, data: null }));
    return () => {
      alive = false;
    };
  }, [username, tick]);

  return { ...state, retry };
}

/* --------------------------------- pieces --------------------------------- */

function StatPill({ icon: Icon, value, label }: { icon: typeof Bookmark; value?: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
      <Icon className="h-3.5 w-3.5 text-rose-300" />
      {value !== undefined && <span className="font-semibold">{formatCount(value)}</span>}
      <span className="text-slate-500">{label}</span>
    </span>
  );
}

function CopyChip({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => undefined,
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy"
      className="focus-ring group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-white/25"
    >
      <span className={`truncate ${mono ? "font-mono" : ""}`}>{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-slate-600 group-hover:text-slate-300" />
      )}
    </button>
  );
}

function PinCard({ pin, onOpen }: { pin: PinData; onOpen: (pinId: string) => void }) {
  const src = bestImage(pin, "grid");
  const description = decodeEntities(pin.description);
  const saves = savesOf(pin);

  return (
    <button
      type="button"
      onClick={() => onOpen(pin.id)}
      className="focus-ring group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition hover:border-rose-400/40"
      style={{ backgroundColor: pin.dominant_color ? `#${pin.dominant_color}` : undefined }}
    >
      {src ? (
        <img src={src} alt={description || "Pin"} loading="lazy" className="w-full object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center bg-ink-800 text-slate-600">
          <Pin className="h-6 w-6" />
        </div>
      )}
      {saves > 0 && (
        <span className="absolute bottom-12 left-3 inline-flex translate-y-0 items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          <Bookmark className="h-2.5 w-2.5" /> {formatCount(saves)}
        </span>
      )}
      {description && (
        <p className="line-clamp-2 bg-ink-900/90 px-3 py-2 text-xs leading-snug text-slate-300">{description}</p>
      )}
    </button>
  );
}

function PinView({
  pinId,
  onBack,
  onOpenProfile,
}: {
  pinId: string;
  onBack: () => void;
  onOpenProfile: (u: string) => void;
}) {
  const { loading, error, pin } = usePin(pinId);

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-white/5">
        <Loader2 className="h-7 w-7 animate-spin text-rose-300" />
      </div>
    );

  if (error || !pin)
    return (
      <div className="rounded-3xl border border-white/5 p-8 text-center">
        <p className="text-sm text-slate-400">{error ?? "Pin not found."}</p>
        <button type="button" onClick={onBack} className="focus-ring mt-4 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 hover:text-white">
          Back
        </button>
      </div>
    );

  const img = bestImage(pin, "large");
  const description = decodeEntities(pin.description);
  const title = titleOf(pin);
  const video = extractVideo(pin);
  const kind = kindOf(pin);
  const KindIcon = kind.icon;
  const creator = pin.native_creator ?? pin.pinner;
  const creatorHandle = usernameOf(creator);
  const board = pin.board;
  const largeImg = pin.images["564x"];
  const doneCount = doneOf(pin);
  const { body: descriptionBody, tags } = splitHashtags(description);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass overflow-hidden rounded-3xl">
      {video ? (
        <video
          src={video.mp4}
          poster={video.poster}
          controls
          autoPlay
          loop
          muted
          playsInline
          className="max-h-[70vh] w-full bg-ink-900 object-contain"
        />
      ) : img ? (
        <img src={img} alt={description || "Pin"} className="max-h-[70vh] w-full bg-ink-800 object-contain" />
      ) : null}

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-rose-300 uppercase">
            <KindIcon className="h-3 w-3" /> {kind.label}
          </span>
          {pin.domain && pin.domain !== "uploaded by user" && (
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] tracking-wider text-slate-500 uppercase">
              via {pin.domain}
            </span>
          )}
        </div>

        {title && <h2 className="text-lg font-bold leading-snug text-white">{title}</h2>}
        {descriptionBody && descriptionBody !== title && (
          <p className="text-sm leading-relaxed whitespace-pre-line text-slate-300">{descriptionBody}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <StatPill icon={Bookmark} value={savesOf(pin)} label="saves" />
          {doneCount > 0 && <StatPill icon={Check} value={doneCount} label="tried it" />}
        </div>

        {tags.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Tags</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.slice(0, 16).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => openOnPinterest(`/search/pins/?q=%23${encodeURIComponent(tag)}`)}
                  className="focus-ring rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-rose-400/40 hover:text-rose-200"
                >
                  #{tag}
                </button>
              ))}
              {tags.length > 16 && <span className="px-1 py-1 text-[11px] text-slate-600">+{tags.length - 16} more</span>}
            </div>
          </div>
        )}

        {creatorHandle && creator && (
          <button
            type="button"
            onClick={() => onOpenProfile(creatorHandle)}
            className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-rose-400/40"
          >
            {creator.image_medium_url || creator.image_small_url ? (
              <img src={creator.image_medium_url ?? creator.image_small_url} alt="" className="h-11 w-11 rounded-full bg-ink-800 object-cover" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-700 text-slate-400">
                <User className="h-5 w-5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{decodeEntities(creator.full_name) || creatorHandle}</span>
              <span className="block truncate text-xs text-slate-500">
                {creator.about ? decodeEntities(creator.about) : `@${creatorHandle}`}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-600">
                {formatCount(creator.follower_count)} followers · {formatCount(creator.pin_count)} pins · tap to browse
              </span>
            </span>
          </button>
        )}

        {board?.name && (
          <button
            type="button"
            onClick={() => board.url && openOnPinterest(board.url)}
            className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-rose-400/40"
          >
            {board.image_thumbnail_url && !board.image_thumbnail_url.includes("default_board_thumbnail") ? (
              <img src={board.image_thumbnail_url} alt="" className="h-11 w-11 rounded-xl bg-ink-800 object-cover" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-700 text-slate-400">
                <Layers className="h-5 w-5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{decodeEntities(board.name)}</span>
              <span className="block text-[11px] text-slate-600">
                Board · {formatCount(board.pin_count)} pins · {formatCount(board.follower_count)} followers
              </span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-600" />
          </button>
        )}

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-3 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Pin ID</p>
            <div className="mt-1"><CopyChip value={pin.id} /></div>
          </div>
          {pin.dominant_color && (
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Dominant color</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-4 w-4 shrink-0 rounded border border-white/20" style={{ backgroundColor: pin.dominant_color }} />
                <CopyChip value={pin.dominant_color} />
              </div>
            </div>
          )}
          {largeImg?.width && (
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Resolution</p>
              <p className="mt-1 font-mono text-xs text-slate-300">{largeImg.width}×{largeImg.height}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openOnPinterest(`/pin/${pin.id}/`)}
            className="focus-ring inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-400 to-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Open on Pinterest <ExternalLink className="h-3.5 w-3.5" />
          </button>
          {pin.link && (
            <button
              type="button"
              onClick={() => window.open(pin.link!, "_blank", "noopener,noreferrer")}
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              Source · {pin.domain ?? "link"} <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            Back
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ProfileView({
  username,
  onBack,
  onOpenPin,
}: {
  username: string;
  onBack: () => void;
  onOpenPin: (id: string) => void;
}) {
  const { loading, error, data, retry } = useUserPins(username);
  const user = data?.user;
  const pins = data?.pins ?? [];

  return (
    <div>
      <button type="button" onClick={onBack} className="focus-ring mb-4 inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {loading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-rose-300" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl border border-white/5 p-8 text-center">
          <p className="text-sm text-slate-400">{error}</p>
          <button type="button" onClick={retry} className="focus-ring mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 hover:text-white">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {!loading && !error && user && (
        <>
          <div className="glass mb-5 rounded-3xl p-5">
            <div className="flex items-center gap-4">
              {user.image_small_url ? (
                <img src={user.image_small_url.replace("60x60", "120x120")} alt="" className="h-16 w-16 rounded-full bg-ink-800 object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-700 text-slate-400">
                  <User className="h-7 w-7" />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{user.full_name || username}</h2>
                <p className="text-xs text-slate-500">@{username}</p>
                <div className="mt-1.5 flex gap-2">
                  <StatPill icon={User} value={user.follower_count} label="followers" />
                  <StatPill icon={Pin} value={user.pin_count} label="pins" />
                </div>
              </div>
            </div>
            {user.about && <p className="mt-3 text-sm leading-relaxed text-slate-400">{decodeEntities(user.about)}</p>}
            <button
              type="button"
              onClick={() => openOnPinterest(`/${username}/`)}
              className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              Open on Pinterest <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>

          {pins.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No public pins found for this user.</p>
          ) : (
            <div className="columns-2 gap-3 sm:columns-3">
              {pins.map((pin) => (
                <PinCard key={pin.id} pin={pin} onOpen={onOpenPin} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ link parsing ------------------------------ */

type Parsed =
  | { kind: "pin"; pinId: string }
  | { kind: "profile"; username: string }
  | { kind: "short"; code: string }
  | { kind: "external"; href: string; label: string }
  | { kind: "invalid" };

function parseLink(raw: string): Parsed {
  const value = raw.trim();
  if (!value) return { kind: "invalid" };

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { kind: "invalid" };
  }

  // Short links resolve server-side via /api/pin (the shortener sends no CORS
  // headers, so the browser can't follow them itself).
  if (/(^|\.)pin\.it$/i.test(url.hostname)) {
    const code = url.pathname.split("/").filter(Boolean).pop();
    if (code) return { kind: "short", code };
  }

  if (!/(^|\.)pinterest\.[a-z.]{2,}$/i.test(url.hostname)) return { kind: "invalid" };

  const segments = url.pathname.split("/").filter(Boolean);

  // Pin URLs come in several shapes:
  //   /pin/889179520179912128/
  //   /pin/aesthetic-wallpaper-pinterest--744008800962098502/   (slug form)
  //   /pin/889179520179912128/sent/?invite_code=…               (shared form)
  //   /in.pinterest.com/pin/…                                   (country domains)
  // The id is the long digit run in the segment right after /pin/.
  const pinIndex = segments.findIndex((segment) => segment.toLowerCase() === "pin");
  if (pinIndex !== -1) {
    const idMatch = segments[pinIndex + 1]?.match(/(\d{8,})/);
    if (idMatch) return { kind: "pin", pinId: idMatch[1] };
  }

  if (segments.length === 1 && /^[\w.-]{2,}$/.test(segments[0])) {
    return { kind: "profile", username: segments[0] };
  }

  // Boards and other surfaces stay on Pinterest proper.
  return { kind: "external", href: url.toString(), label: "On Pinterest" };
}

const TOPICS = ["Interior design", "Recipes", "Travel", "Outfit ideas", "DIY crafts", "Wall art", "Architecture", "Garden ideas"] as const;

/* ---------------------------------- app ----------------------------------- */

export default function PinterestApp() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const submit = async () => {
    const parsed = parseLink(value);
    setError(null);
    switch (parsed.kind) {
      case "pin":
        setValue("");
        setView({ kind: "pin", pinId: parsed.pinId });
        break;
      case "profile":
        setValue("");
        setView({ kind: "profile", username: parsed.username });
        break;
      case "short": {
        setValue("");
        setResolving(true);
        try {
          const res = await fetch(`/api/pin?code=${encodeURIComponent(parsed.code)}`);
          const json = (await res.json()) as { ok?: boolean; pinId?: string | null };
          if (json.ok && json.pinId) {
            setView({ kind: "pin", pinId: json.pinId });
          } else {
            setError("Pinterest couldn't resolve that short link — it may have expired.");
          }
          break;
        } catch {
          setError("Couldn't reach the link resolver. Try the full pin URL instead.");
        } finally {
          setResolving(false);
        }
        break;
      }
      case "external":
        window.open(parsed.href, "_blank", "noopener,noreferrer");
        break;
      case "invalid":
        setError("Enter a pinterest.com pin/profile link, or paste a username.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      {view.kind !== "home" && (
        <button type="button" onClick={() => setView({ kind: "home" })} className="focus-ring mb-4 inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </button>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={view.kind === "home" ? "home" : `${view.kind}:${"pinId" in view ? view.pinId : "username" in view ? view.username : ""}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {view.kind === "home" && (
            <div className="space-y-6">
              <div className="glass rounded-3xl p-5 sm:p-6">
                <label htmlFor="pin-input" className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
                  <Search className="h-3.5 w-3.5 text-rose-300" /> Watch a pin or profile — no login
                </label>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="pin-input"
                    value={value}
                    onChange={(event) => {
                      setValue(event.target.value);
                      setError(null);
                    }}
                    onKeyDown={(event) => event.key === "Enter" && void submit()}
                    placeholder="pinterest.com/pin/… · username · pin.it/…"
                    spellCheck={false}
                    className="focus-ring placeholder:text-slate-600 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-rose-400/50"
                  />
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={resolving}
                    className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-400 to-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pin className="h-4 w-4" />} Watch
                  </button>
                </div>
                {error && <p className="mt-2.5 text-xs text-rose-300">{error}</p>}
                <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                  Pins, profiles and short pin.it links all open right here.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Trending topics</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => openOnPinterest(`/search/pins/?q=${encodeURIComponent(topic)}&rs=typed`)}
                      className="focus-ring flex items-center justify-between gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-xs text-slate-300 transition hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-white"
                    >
                      <span className="truncate">{topic}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-slate-600" />
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-600">Topic search runs on Pinterest in a new tab.</p>
              </div>

              <div className="flex gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                <p className="text-xs leading-relaxed text-slate-500">
                  Content is fetched through Pinterest's public widget API — the same one their embed
                  button uses — so you browse without an account. Saving, repinning and following still
                  need one, so those actions link out.
                </p>
              </div>
            </div>
          )}

          {view.kind === "pin" && (
            <PinView
              pinId={view.pinId}
              onBack={() => setView({ kind: "home" })}
              onOpenProfile={(username) => setView({ kind: "profile", username })}
            />
          )}

          {view.kind === "profile" && (
            <ProfileView
              username={view.username}
              onBack={() => setView({ kind: "home" })}
              onOpenPin={(pinId) => setView({ kind: "pin", pinId })}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
