import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsRoot = path.resolve(__dirname, '../../uploads');
const qrDir = path.join(uploadsRoot, 'qrcodes');

export async function generateBookingQr(reference, payload) {
  await fs.mkdir(qrDir, { recursive: true });
  const filename = `${reference}.png`;
  await QRCode.toFile(path.join(qrDir, filename), JSON.stringify(payload), { width: 320, margin: 1 });
  return `/uploads/qrcodes/${filename}`;
}

export function qrAbsolutePath(qrCodePath) {
  if (!qrCodePath) return null;
  return path.join(uploadsRoot, qrCodePath.replace(/^\/uploads\/?/, ''));
}
