/** CSS-like portrait scaling inside a fixed window (never bleeds outside box). */
export type PortraitFitMode = "cover" | "contain";

export interface PortraitFitOptions {
  mode?: PortraitFitMode;
  /** Cover crop nudge in display px (+x shows more of the left side of the art). */
  offsetX?: number;
  offsetY?: number;
}

/**
 * cover  — fill box, keep aspect, crop overflow (object-fit: cover)
 * contain — fit whole image, letterbox
 */
export function fitPortraitImage(
  img: Phaser.GameObjects.Image,
  boxW: number,
  boxH: number,
  options: PortraitFitMode | PortraitFitOptions = "cover",
) {
  const opts: PortraitFitOptions =
    typeof options === "string" ? { mode: options } : options;
  const mode = opts.mode ?? "cover";
  const offsetX = opts.offsetX ?? 0;
  const offsetY = opts.offsetY ?? 0;

  const frame = img.frame;
  const tw = frame.width;
  const th = frame.height;
  img.setCrop();
  img.setPosition(0, 0);

  if (mode === "contain") {
    const scale = Math.min(boxW / tw, boxH / th);
    img.setDisplaySize(tw * scale, th * scale);
    img.setPosition(offsetX, offsetY);
    return;
  }

  const scale = Math.max(boxW / tw, boxH / th);
  const cropW = boxW / scale;
  const cropH = boxH / scale;
  const maxX = Math.max(0, tw - cropW);
  const maxY = Math.max(0, th - cropH);
  const cropX = Phaser.Math.Clamp(maxX / 2 - offsetX / scale, 0, maxX);
  const cropY = Phaser.Math.Clamp(maxY / 2 - offsetY / scale, 0, maxY);

  img.setCrop(cropX, cropY, cropW, cropH);
  img.setDisplaySize(boxW, boxH);
}
