const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPEG, PNG, and WebP images are allowed.'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 20,
  },
});

module.exports = {
  uploadSingle: upload.single('image'),
  uploadMultiple: upload.array('images', 5),
  uploadFields: upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'document', maxCount: 1 },
    { name: 'beforePhotos', maxCount: 5 },
    { name: 'afterPhotos', maxCount: 5 },
    { name: 'evidencePhotos', maxCount: 10 },
  ]),
  uploadCompletionPhotos: upload.fields([
    { name: 'beforePhotos', maxCount: 5 },
    { name: 'afterPhotos', maxCount: 5 },
  ]),
  uploadAny: upload.any(),
  uploadAdditionalPayment: upload.array('evidencePhotos', 10),
};