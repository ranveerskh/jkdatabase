export async function compressProductImage(file) {
  if (!file) return "";
  if (!file.type?.startsWith("image/")) throw Error("Choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw Error("Product photos must be smaller than 12 MB.");
  const source = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    let side = 320, quality = .72, data = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = side; canvas.height = side;
      const scale = Math.min(side / source.width, side / source.height), w = source.width * scale, h = source.height * scale;
      ctx.clearRect(0, 0, side, side); ctx.drawImage(source, (side-w)/2, (side-h)/2, w, h);
      data = canvas.toDataURL("image/jpeg", quality);
      if (data.length < 48 * 1024) return data;
      side = Math.round(side * .82); quality = Math.max(.42, quality - .08);
    }
    if (data.length >= 70 * 1024) throw Error("Photo is too detailed to save. Choose a smaller image.");
    return data;
  } finally { source.close(); }
}
