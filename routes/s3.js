require('dotenv').config();
const aws = require('aws-sdk');
const multerS3 = require('multer-s3');
const multer = require('multer');
// var multipart = require('connect-multiparty');
// var multipartMiddleware = multipart();

// aws s3 세팅
const s3 = new aws.S3({
    region: process.env.AWS_S3_REGION,
    accessKeyId: process.env.AWS_S3_ACCESS_KEY,
    secretAccessKey: process.env.AWS_S3_SECRET_KEY
});


// 확장자 검사 목록
const allowedExtensions = ['.png', '.jpg', '.jpeg', '.bmp', '.gif'];

// 이미지 업로그 멀터 생성
const uploadImage = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req, file, callback) => {

            // 오늘 날짜 구하기
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth() + 1;
            const currentDate = today.getDate();
            const date = `${currentYear}-${currentMonth}-${currentDate}`;

            // 임의번호 생성
            let randomNumber = '';
            for (let i = 0; i < 8; i++) {
                randomNumber += String(Math.floor(Math.random() * 10));
            }

            // 확장자 검사
            const extension = path.extname(file.originalname).toLowerCase();
            if (!allowedExtensions.includes(extension)) {
                return callback(new Error('확장자 에러'));
            }

            // folder라는 파일 내부에 업로드한 사용자에 따라 임의의 파일명으로 저장
            callback(null, `post/${date}_${randomNumber}`);
            //callback(null, `post/${userId}_${date}_${randomNumber}`);
        },
        acl: 'public-read-write'
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
})
;

// S3에서 이미지 삭제
const deleteImage = (fileKey) => {
    s3.deleteObject(
        {
            bucket: process.env.AWS_BUCKET,
            Key: fileKey,
        },
        (err, data) => {
            if (err) {
                throw err;
            } else {
                console.log('Image Deleted');
            }
        }
    );
};

module.exports = { uploadImage, deleteImage };