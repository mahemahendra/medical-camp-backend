import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { nanoid } from 'nanoid';

// Resolve upload directory to absolute path
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage with absolute path
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Double-check directory exists before each upload
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-nanoid.extension
    const uniqueId = nanoid(10);
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    const filename = `${timestamp}-${uniqueId}${extension}`;
    cb(null, filename);
  }
});

// File filter (images only)
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, webp, gif) are allowed!'));
  }
};

// Export upload middleware
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

// Export upload directory for use in other modules
export { uploadDir };
