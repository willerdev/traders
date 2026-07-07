const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

/** Resize large chart screenshots before upload to cut transfer time on mobile. */
export async function compressSetupImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 400_000) {
    return file;
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width <= MAX_WIDTH) {
        resolve(file);
        return;
      }

      const width = MAX_WIDTH;
      const height = Math.round(img.height * (MAX_WIDTH / img.width));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}
