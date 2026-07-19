// middlewares/upload.js
const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

module.exports = {
  upload: upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'document', maxCount: 1 },
    { name: 'beforePhotos', maxCount: 5 },
    { name: 'afterPhotos', maxCount: 5 },
  ]),
  uploadSingle: upload.single('image'),
  uploadMultiple: upload.array('images', 5),
  uploadCompletionPhotos: upload.fields([
    { name: 'beforePhotos', maxCount: 5 },
    { name: 'afterPhotos', maxCount: 5 },
  ]),
  uploadAny: upload.any(),
};

