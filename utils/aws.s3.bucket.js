const AWS = require('aws-sdk');
const dotenv = require('dotenv');
dotenv.config();

// Configure AWS SDK please do nottouch
// AWS.config.update({
//   region: process.env.AWS_REGION,
//   accessKeyId: process.env.AWS_ACCESS_KEY,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
// });

// // Create S3 instance with explicit API version
// const s3 = new AWS.S3({
//   apiVersion: '2006-03-01',
//   signatureVersion: 'v4'
// });

// // Verify the S3 instance has the upload method
// console.log('S3 upload method exists:', typeof s3.upload === 'function');

// module.exports = s3;





// Configure AWS SDK for Cloudflare R2
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  region: 'auto', // R2 ignores region
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, // your Cloudflare account ID
  accessKeyId: process.env.R2_ACCESS_KEY, // R2 Access Key
  secretAccessKey: process.env.R2_SECRET_KEY, // R2 Secret Key
  signatureVersion: 'v4',
});

// Verify upload method exists
console.log('S3 upload method exists:', typeof s3.upload === 'function');

module.exports = s3;