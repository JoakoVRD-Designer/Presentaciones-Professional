import { useEditor } from '../store/editor';

const MAX_INLINE = 12 * 1024 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Sube un archivo al servidor. Sin servidor, las imágenes se incrustan como
 * data: URI y los videos usan una URL temporal de sesión.
 */
export async function uploadAsset(file: File): Promise<string> {
  const { serverMode, toast } = useEditor.getState();
  if (serverMode) {
    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-lumen-client': 'editor' },
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? 'No se pudo subir el archivo');
    }
    return (await res.json()).url as string;
  }
  if (file.type.startsWith('image/') && file.size <= MAX_INLINE) return readAsDataUrl(file);
  toast('Sin servidor: el video solo estará disponible en esta sesión. Inicia "npm run dev" para guardarlo.', 'info');
  return URL.createObjectURL(file);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function mediaSize(file: File): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const done = (w: number, h: number) => {
      URL.revokeObjectURL(url);
      resolve({ w: w || 1280, h: h || 720 });
    };
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done(1280, 720);
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done(1280, 720);
      img.src = url;
    }
  });
}
