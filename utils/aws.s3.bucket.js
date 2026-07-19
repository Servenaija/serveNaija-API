const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');

dotenv.config();

const endpoint = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : undefined;
const publicUrl = process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL_BASE;

const s3Client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const uploadObject = async ({ Bucket, Key, Body, ContentType }) => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body,
      ContentType,
    })
  );

  return {
    Key,
    Location: publicUrl ? `${publicUrl}/${Key}` : undefined,
  };
};

module.exports = {
  s3Client,
  uploadObject,
};