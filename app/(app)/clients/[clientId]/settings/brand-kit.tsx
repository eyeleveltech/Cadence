"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClientBrandKit } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

export function BrandKit({
  clientId,
  toneOfVoice,
  brandColors,
}: {
  clientId: string;
  toneOfVoice: string;
  brandColors: string[];
}) {
  const router = useRouter();
  const [tone, setTone] = useState(toneOfVoice);
  const [colorsRaw, setColorsRaw] = useState(brandColors.join(", "));
  const [saving, setSaving] = useState(false);

  const parsedColors = colorsRaw.split(",").map((c) => c.trim()).filter(Boolean);
  const validColors = parsedColors.filter((c) => HEX_RE.test(c));

  async function handleSave() {
    if (parsedColors.length && parsedColors.length !== validColors.length) {
      toast.error("Every color needs to be a hex code, like #0F172A");
      return;
    }
    setSaving(true);
    try {
      await updateClientBrandKit({ clientId, toneOfVoice: tone, brandColors: validColors });
      toast.success("Saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tone-of-voice">Tone of voice</Label>
        <Textarea
          id="tone-of-voice"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          rows={4}
          placeholder="e.g. Warm, reassuring, plain-language healthcare communication."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="brand-colors">Brand colors (comma-separated hex)</Label>
        <Input
          id="brand-colors"
          value={colorsRaw}
          onChange={(e) => setColorsRaw(e.target.value)}
          placeholder="#0F172A, #22D3EE, #F8FAFC"
        />
        {parsedColors.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {parsedColors.map((color, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 om-mono text-xs">
                {HEX_RE.test(color) && (
                  <span className="size-3.5 rounded-sm border border-border" style={{ background: color }} />
                )}
                {color}
              </span>
            ))}
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save brand kit"}</Button>
    </div>
  );
}
