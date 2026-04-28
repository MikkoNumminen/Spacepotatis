import * as THREE from "three";

const NAME_FONT = "600 56px ui-monospace, 'JetBrains Mono', Menlo, monospace";
const STATUS_FONT = "500 36px ui-monospace, 'JetBrains Mono', Menlo, monospace";
const HEIGHT_PX_NAME_ONLY = 128;
const HEIGHT_PX_TWO_LINE = 188;
const PAD_PX = 56;

export interface LabelTexture {
  texture: THREE.CanvasTexture;
  aspect: number;
}

// Renders the planet/station label as a single canvas texture: name on top,
// optional status line below in `statusColor`. Returned aspect lets the
// caller scale the sprite so text proportions stay correct.
export function createLabelTexture(
  name: string,
  status: string | null,
  statusColor: string
): LabelTexture {
  const measure = document.createElement("canvas").getContext("2d");
  let nameWidth = 480;
  let statusWidth = 0;
  if (measure) {
    measure.font = NAME_FONT;
    nameWidth = measure.measureText(name).width;
    if (status) {
      measure.font = STATUS_FONT;
      statusWidth = measure.measureText(status).width;
    }
  }

  const canvasW = Math.max(256, Math.ceil(Math.max(nameWidth, statusWidth) + PAD_PX * 2));
  const canvasH = status ? HEIGHT_PX_TWO_LINE : HEIGHT_PX_NAME_ONLY;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#dceaff";
    ctx.font = NAME_FONT;
    if (status) {
      ctx.fillText(name, canvasW / 2, 56);
      ctx.font = STATUS_FONT;
      ctx.fillStyle = statusColor;
      ctx.fillText(status, canvasW / 2, 132);
    } else {
      ctx.fillText(name, canvasW / 2, canvasH / 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, aspect: canvasW / canvasH };
}
