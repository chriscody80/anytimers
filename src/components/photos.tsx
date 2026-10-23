"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addPhotoRecord, deletePhotoRecord } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "drink-photos";

/** Shrinks a phone photo to a ~1600px JPEG, keeping its rotation. */
async function shrink(file: File, max = 1600): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  let w: number, h: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bmp; w = bmp.width; h = bmp.height;
  } catch {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("unreadable"));
      el.src = URL.createObjectURL(file);
    });
    source = img; w = img.naturalWidth; h = img.naturalHeight;
  }
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new Error("unreadable");
  return blob;
}

export function PhotoUpload({ crewId, anytimerId, label = "Add photo", variant = "ghost" }: {
  crewId: string; anytimerId: string; label?: string; variant?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setErr("");
    try {
      let blob: Blob;
      try { blob = await shrink(file); } catch { setErr("Couldn't read that photo. Try a different one."); return; }
      const path = `${crewId}/${anytimerId}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) { setErr("Upload failed. Check your connection and try again."); return; }
      const res = await addPhotoRecord(crewId, anytimerId, path);
      if (res?.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        setErr(res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="act">
      <input ref={input} type="file" accept="image/*" hidden onChange={onPick} />
      <button className={`btn btn-${variant}`} type="button" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : label}
      </button>
      {err && <span className="err" role="alert">{err}</span>}
    </span>
  );
}

export function DeletePhoto({ crewId, photoId, path }: { crewId: string; photoId: string; path: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span className="act">
      <button
        className={`btn ${armed ? "btn-danger" : "btn-text"}`}
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
          setBusy(true); setErr("");
          await createClient().storage.from(BUCKET).remove([path]);
          const res = await deletePhotoRecord(crewId, photoId);
          setBusy(false);
          if (res?.error) { setErr(res.error); return; }
          router.refresh();
        }}
      >
        {busy ? "Removing…" : armed ? "Tap again to remove" : "Remove"}
      </button>
      {err && <span className="err" role="alert">{err}</span>}
    </span>
  );
}
