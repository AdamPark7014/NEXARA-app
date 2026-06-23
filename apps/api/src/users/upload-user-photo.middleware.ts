
import multer from 'multer';
import path from 'path';

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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s/g, ''));
  },
});

const upload = multer({ storage });

export const uploadUserPhoto = upload.single('avatar');
