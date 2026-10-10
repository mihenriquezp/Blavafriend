/** Crops a picture to width:height around its centre, shrinks it to at most that size and saves it as JPEG. */
export async function resizeImage(file: Blob, width: number, height: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const ratio = width / height
  const sw = Math.min(bitmap.width, bitmap.height * ratio)
  const sh = sw / ratio
  const outW = Math.round(Math.min(width, sw))
  const outH = Math.round(outW / ratio)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, outW, outH)
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', 0.85),
  )
}
