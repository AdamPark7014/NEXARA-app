
import multer from 'multer';
import path from 'path';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function safeUploadFilename(originalName: string, mimetype: string): string {
  const base = path.basename(String(originalName || 'upload')).replace(/[^\w.\-]+/g, '');
  const extFromName = path.extname(base).toLowerCase();
  const ext =
    extFromName === '.jpg' || extFromName === '.jpeg' || extFromName === '.png' || extFromName === '.webp'
      ? extFromName === '.jpeg'
        ? '.jpg'
        : extFromName
      : mimetype === 'image/png'
        ? '.png'
        : mimetype === 'image/webp'
          ? '.webp'
          : '.jpg';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

const storage = multer.diskStorage({
  destination: function (
    _req: any,
    _file: any,
    cb: (error: Error | null, destination: string) => void
  ) {
    cb(null, path.join(__dirname, '../../uploads/users'));
  },
  filename: function (
    _req: any,
    file: any,
    cb: (error: Error | null, filename: string) => void
  ) {
    cb(null, safeUploadFilename(file.originalname, file.mimetype));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env['MAX_FILE_SIZE'] || 5_242_880) },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(String(file.mimetype || '').toLowerCase())) {
      cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'));
      return;
    }
    cb(null, true);
  },
});

export const uploadUserPhoto = upload.single('avatar');
