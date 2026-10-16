// supabase/functions/pet-art — optional backup for pet drawings (Rootling v16).
//
// One POST endpoint, like the existing scan / oauth-start functions, called by
// RootlingApp.connected.call('pet-art', body) with the user's JWT.
//
//   { action: 'save',   clientId, species, label, source, mime, image, thumb }  -> { id, path }
//   { action: 'list' }                                                          -> { items: [{ id, clientId, species, label, createdAt, url, thumbUrl }] }
//   { action: 'delete', clientId }                                              -> { ok: true }
//
// image / thumb are base64 (no data: prefix). The function runs as the user
// (their JWT), so row level security and the storage folder policies in
// migrations/20261016000000_pet_art.sql decide what they can touch. No service
// role key is used. Deploy: supabase functions deploy pet-art
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = ["https://squirrel42072000-design.github.io"];
const MAX_FULL = 600 * 1024;
const MAX_THUMB = 120 * 1024;
const PER_HOUR = 20;

function cors(origin: string | null) {
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    // Same rule as the other functions: authorization + content-type only.
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Trust the bytes, not the claimed type (same check as pet-art.js sniffType).
function sniff(b: Uint8Array): string {
  if (b.length < 12) return "";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}
// PNG width/height live at bytes 16..23; WebP VP8X/VP8L/VP8 differ. We only
// need "is it the 512 square the device makes".
function dims(b: Uint8Array, type: string): [number, number] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (type === "image/png") return [dv.getUint32(16), dv.getUint32(20)];
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8X") return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
  if (chunk === "VP8L") { const v = dv.getUint32(21, true); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  if (chunk === "VP8 ") return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
  return [0, 0];
}
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").slice(0, n);
const safeId = (s: unknown) => String(s ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405, origin);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "sign in" }, 401, origin);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ error: "sign in" }, 401, origin);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400, origin); }
  const action = String(body.action ?? "");

  if (action === "list") {
    const { data, error } = await sb.from("pet_artworks")
      .select("id, client_id, species, label, source, created_at, path, thumb_path")
      .order("created_at", { ascending: false }).limit(48);
    if (error) return json({ error: "list failed" }, 500, origin);
    const items = await Promise.all((data ?? []).map(async (r: { id: string; client_id: string; species: string; label: string; source: string; created_at: string; path: string; thumb_path: string }) => {
      const [a, t] = await Promise.all([
        sb.storage.from("pet-art").createSignedUrl(r.path, 3600),
        sb.storage.from("pet-art").createSignedUrl(r.thumb_path, 3600),
      ]);
      return { id: r.id, clientId: r.client_id, species: r.species, label: r.label, source: r.source, createdAt: r.created_at, url: a.data?.signedUrl ?? "", thumbUrl: t.data?.signedUrl ?? "" };
    }));
    return json({ items }, 200, origin);
  }

  if (action === "delete") {
    const clientId = safeId(body.clientId);
    if (!clientId) return json({ error: "missing id" }, 400, origin);
    const { data: row } = await sb.from("pet_artworks").select("path, thumb_path").eq("client_id", clientId).maybeSingle();
    if (row) await sb.storage.from("pet-art").remove([row.path, row.thumb_path]);
    await sb.from("pet_artworks").delete().eq("client_id", clientId);
    return json({ ok: true }, 200, origin);
  }

  if (action === "save") {
    const clientId = safeId(body.clientId);
    if (!clientId) return json({ error: "missing id" }, 400, origin);
    let full: Uint8Array, thumb: Uint8Array;
    try { full = b64ToBytes(String(body.image ?? "")); thumb = b64ToBytes(String(body.thumb ?? "")); }
    catch { return json({ error: "bad image" }, 400, origin); }
    const type = sniff(full), ttype = sniff(thumb);
    if (!type || !ttype) return json({ error: "PNG or WebP only" }, 415, origin);
    if (full.length > MAX_FULL || thumb.length > MAX_THUMB) return json({ error: "too big" }, 413, origin);
    const [w, h] = dims(full, type);
    if (w !== 512 || h !== 512) return json({ error: "expected 512x512" }, 422, origin);

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await sb.from("pet_artworks").select("id", { count: "exact", head: true }).gte("created_at", since);
    if ((count ?? 0) >= PER_HOUR) return json({ error: "slow down" }, 429, origin);

    const ext = type === "image/png" ? "png" : "webp";
    const path = `${uid}/${clientId}.${ext}`;
    const thumbPath = `${uid}/${clientId}-sm.${ttype === "image/png" ? "png" : "webp"}`;
    const up1 = await sb.storage.from("pet-art").upload(path, full, { contentType: type, upsert: true });
    const up2 = await sb.storage.from("pet-art").upload(thumbPath, thumb, { contentType: ttype, upsert: true });
    if (up1.error || up2.error) return json({ error: "upload failed" }, 500, origin);

    const { data, error } = await sb.from("pet_artworks").upsert({
      user_id: uid, client_id: clientId,
      species: clean(body.species, 40), label: clean(body.label, 40),
      source: body.source === "upload" ? "upload" : "drawn",
      mime: type, bytes: full.length, thumb_bytes: thumb.length, width: w, height: h,
      path, thumb_path: thumbPath,
    }, { onConflict: "user_id,client_id" }).select("id").single();
    if (error) {
      await sb.storage.from("pet-art").remove([path, thumbPath]);
      return json({ error: /full/.test(error.message) ? "art shelf full" : "save failed" }, error.code === "P0001" ? 409 : 500, origin);
    }
    return json({ id: data.id, path }, 200, origin);
  }

  return json({ error: "unknown action" }, 400, origin);
});
