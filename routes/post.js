var express = require('express');
const router = express.Router();
var db = require('../db.js');
var sql = require('../sql.js');
const fs = require('fs');
const path = require("path");
// const { uploadImage } = require('./s3.js');
// const { deleteImage } = require('./s3.js');

const jwt = require('jsonwebtoken');

require('dotenv').config();
const aws = require('aws-sdk');
const multerS3 = require('multer-s3');
const multer = require('multer');

// 복호화 함수
function decode_user_no(authHeader) {
  const token = authHeader.split(' ')[1];
  let decoded;

  try {
    decoded = jwt.verify(token, 'secret_key');
  } catch (error) {
    console.log(error);
    return -1;
  }
  return decoded.no;
  // decoded.no에 저장됨
}


// AWS S3 세팅
const s3 = new aws.S3({
  region: process.env.AWS_S3_REGION,
  accessKeyId: process.env.AWS_S3_ACCESS_KEY,
  secretAccessKey: process.env.AWS_S3_SECRET_KEY
});

// 확장자 검사 목록
const allowedExtensions = ['.png', '.jpg', '.jpeg', '.bmp', '.gif'];

// 이미지 업로드를 위한 multer 설정
const uploadImage = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, callback) => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      const currentDate = today.getDate();
      const date = `${currentYear}-${currentMonth}-${currentDate}`;

      let randomNumber = '';
      for (let i = 0; i < 8; i++) {
        randomNumber += String(Math.floor(Math.random() * 10));
      }

      const extension = path.extname(file.originalname).toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        return callback(new Error('확장자 에러'));
      }

      callback(null, `post/${date}_${randomNumber}`);
    },
    acl: 'public-read-write'
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// 게시글 등록 6/13 파일 확장자 검사 추가
router.post('/post_write', (request, response) => {
  uploadImage.array('files', 10)(request, response, (err) => {
    if (err) {
      // multer 에러 처리
      if (err.message === '확장자 에러') {
        return response.status(400).json({ message: '지원하지 않는 파일 형식입니다.' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return response.status(400).json({ message: '파일 크기가 너무 큽니다. 최대 5MB까지 허용됩니다.' });
      }
      return response.status(500).json({ message: '파일 업로드 중 오류가 발생했습니다.' });
    }
    const data = request.body;
    const files = request.files;
    console.log("게시글 등록 테스트", data)

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return response.status(401).json({ message: '인증코드가 없습니다.' })
    }
    let user_no = decode_user_no(authHeader);
    if (user_no == -1) {
      return response.status(401).json({ message: '토큰 이상' })
    }

    if (!files || files.length === 0) {
      return response.status(400).send('No files were uploaded.');
    }
    const locations = request.files.location
    const imageUrl = []
    if (files) {
      files.forEach((v) => { imageUrl.push(v.location) })
    }

    // 첫 인덱스에 나중에 로그인 유저 번호 넣어야 함
    db.query(sql.post_write, [user_no, data.title, data.category, data.comment, data.price, data.type, data.way], function (error, results, fields) {
      if (error) {
        console.log(error);
        return response.status(500).json({ error: 'error' });
      }
      // 결과 post 번호 받아오기
      const post_no = results.insertId;

      // 이미지 개수만큼 반복하며 이미지 테이블에 값 추가
      imageUrl.forEach(function (imgUrl, index, array) {
        post_img_main = 0
        if (index == 0) {
          post_img_main = 1
        }
        db.query(sql.post_img_insert, [imgUrl, post_no, post_img_main], function (error, results, fields) {
          if (error) {
            console.log(error);
            return response.status(500).json({ error: 'error' });
          }
        });
      });

      return response.status(200).json({
        message: 'success'
      });
    });
  });
});

// 게시글 수정 9/19 ***
router.post('/post_update', uploadImage.array('files', 10), async (request, response) => {
  const data = request.body;
  const files = request.files;
  const deleteImages = JSON.parse(data.deletedImages || "[]"); // 삭제할 이미지 목록

  // 1. 게시글 업데이트 (텍스트 데이터)
  db.query(sql.post_update, [
    data.title,
    data.category,
    data.comment,
    data.price,
    data.type,
    data.way,
    data.post_no
  ], function (error, results) {
    if (error) {
      console.log('게시글 수정 실패', error);
      return response.status(500).json({ message: '게시글 수정 실패' });
    }

    const post_no = data.post_no;

    // 3. 삭제된 이미지 처리 (DB 및 S3에서 삭제)
    if (deleteImages.length > 0) {
      const s3 = new aws.S3({
        region: process.env.AWS_S3_REGION,
        accessKeyId: process.env.AWS_S3_ACCESS_KEY,
        secretAccessKey: process.env.AWS_S3_SECRET_KEY
      });

      // 삭제된 img의 url을 가진 행 삭제
      const deleteImgUrl = `DELETE FROM TB_POST_IMG WHERE post_img = ?`

      deleteImages.forEach((imageUrl) => {
        // DB에서 이미지 삭제
        db.query(deleteImgUrl, [imageUrl], function (error) {
          if (error) {
            console.log('이미지 삭제 실패', error);
            return response.status(500).json({ message: '이미지 삭제 실패' });
          }

          // S3에서 이미지 삭제 (S3 삭제 로직) <- 되긴 하는데 진짜 되는지 확인 안함
          const s3Params = {
            Bucket: process.env.AWS_BUCKET,
            Key: imageUrl.split(`${process.env.AWS_BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/`)[1], // S3 Key 추출
          };

          s3.deleteObject(s3Params, function (err, data) {
            if (err) {
              console.log('S3 이미지 삭제 실패', err);
            } else {
              console.log('S3 이미지 삭제 성공', data);
            }
          });
        });
      });
    }

    // 2. 이미지 추가 처리 (새로운 파일 업로드)
    if (files && files.length > 0) {
      const imageUrl = files.map(file => file.location);

      imageUrl.forEach(function (imgUrl, index) {

        // 전부 기본 이미지로 추가
        db.query(sql.post_img_insert, [imgUrl, post_no, 0], function (error) {
          if (error) {
            console.log('이미지 추가 실패', error);
            return response.status(500).json({ message: '이미지 추가 실패' });
          }
        });
      });
    }

    // 4. 대표 이미지가 없을 경우 가장 이전에 올라온 이미지를 대표 이미지로 설정
    const checkMainImage = `SELECT post_img_main FROM TB_POST_IMG WHERE post_no = ? AND post_img_main = 1`;

    db.query(checkMainImage, [data.post_no], function (error, results) {
      if (error) {
        console.log("메인 이미지 확인 실패", error);
        return response.status(500).json({ message: '메인 이미지 확인 실패' });
      }

      const hasMainImage = results.length > 0; // 대표 이미지 여부 확인

      const setMainImage = `UPDATE TB_POST_IMG SET Post_img_main = 1 
WHERE post_img_no = (SELECT min_no FROM (SELECT min(Post_img_no) min_no FROM TB_POST_IMG WHERE post_no = ?) tmp);`

      if (!hasMainImage) {
        // 대표 이미지가 없을 경우
        // 가장 앞 순서 이미지를 대표 이미지로 설정
        db.query(setMainImage, [data.post_no], function(error, results){
          if (error) {
            console.log("대표 이미지 설정 실패", error);
            return response.status(500).json({ message: '메인 이미지 확인 실패' });
          }
        })
      }

      return response.status(200).json({
        message: 'success'
      });
    });
  });
});


// 게시글 거래 중 상태 변경 6/12 (거래 <-> 거래중)
router.post('/post_update_status_no', function (request, response, next) {
  console.log("거래 상태 변경", request.body.post_status, request.body.post_no)
  db.query(sql.post_update_status_no, [request.body.post_status, request.body.post_no], function (error, results, fields) {
    if (error) {
      console.log(error);
      return response.status(500).json({ error: 'error' });
    }
    return response.status(200).json({
      message: 'success'
    });
  })
})


// 거래 종료 시 상태 변경 + 거래자 입력 6/13 ***
router.post('/post_update_finish', function (request, response, next) {
  const data = request.body;
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return response.status(401).json({message: '인증코드가 없습니다.'})
  }
  let user_no = decode_user_no(authHeader);


  if (user_no == -1){
    return response.status(401).json({message: '토큰 이상'})
  }

  // user_no_2 가져오기
   db.query(sql.post_update_user2, [data.post_no, data.chat_no, user_no], function (error, results, fields) {
     if (error) {
       console.error('Error fetching user_no_2:', error);
       return response.status(500).json({ error: 'error' });
     }

     const user_no_2 = results[0]?.User_no_2;

     if (user_no_2 === null || user_no_2 === undefined) {
       return response.status(404).json({ message: 'user_no_2 not found for the given chat_no and post_no' });
     }

     // 거래자 번호 받아서 insert 하고 거래 상태 2로 변경, 거래 완료일 설정
     db.query(sql.post_update_finish, [user_no_2 , data.post_no, user_no], function (error, results, fields) {
       if (error) {
         console.log(error);
         return response.status(500).json({ error: 'error' });
       }
       return response.status(200).json({
         message: 'success'
       });
     });
   });
});



// 게시글 삭제
router.delete('/post_delete/:post_no', function (request, response, next) {
  const post_no = request.params.post_no;
  console.log("delete 실행 확인")

  db.query(sql.post_delete, [post_no], function (error, results, fields) {
    if (error) {
      console.error(error);
      return response.status(500).json({ error: 'error' });
    }
    return response.status(200).json({
      message: 'success'
    });
  });
});

// 게시글 끌올 6/12 추가 *** 확인 필요
router.get('/post_bump/:post_no', function (request, response, next) {
  const post_no = request.params.post_no;

  db.query(sql.check_post_bump, [post_no], function (error, results, fields) {
    if (error) {
      console.error(error);
      return response.status(500).json({ error: 'error' });
    }
    // 마지막 끌올 날짜가 오늘이 아닌 경우 값 업데이트
    if (results[0].bumb_check == 0){
      db.query(sql.post_bump, [post_no], function (error, results, fields) {
        if (error) {
          console.error(error);
          return response.status(500).json({ error: 'error' });
        }
        return response.status(200).json({
          message: 'success'
        });
      });
    }
    // 마지막 끌올 날짜가 오늘인 경우
    else {
      return response.status(200).json({
        message: 'already_bumped'
      });
    }
  });


});




// 게시글 목록 불러오기 6/12 이미지 로드 추가
router.get('/post_list/:page', function (request, response, next) {
  const page = request.params.page;
  const onePageCnt = 12;  // 한 페이지 당 포스트 수

  db.query(sql.post_list_get, [page * onePageCnt, onePageCnt], function (error, results, fields) {
    if (error) {
      console.error(error);
      return response.status(500).json({ error: 'error' });
    }
    response.json(results);
  });
});

// 카테고리 게시글 목록 불러오기 6/12 추가
router.get('/post_cate_list/:cate', function (request, response, next) {
  const cate = request.params.cate;

  db.query(sql.post_cate_list_get, [cate], function (error, results, fields) {
    if (error) {
      console.error(error);
      return response.status(500).json({ error: 'error' });
    }
    response.json(results);
  });
});


// 게시글 상세 불러오기 6/12 (찜 개수, 유저 프로필 가져오기 추가)
router.get('/get_post/:post_no', function (request, response, next) {
  const post_no = request.params.post_no;
  console.log(post_no)

  db.query(sql.post_info_get, [post_no], function (error, results, fields) {
    if (error) {
      console.error(error);
      return response.status(500).json({ error: 'error' });
    }
    response.json(results);
  });
});

// 게시글 상세 전체 이미지 불러오기 6/12 추가
router.get('/get_post_img/:post_no', function (request, response, next) {
  const post_no = request.params.post_no;

  db.query(sql.post_img_get, [post_no], function (error, results, fields) {
    if (error) {
      console.error(error);
      return response.status(500).json({ error: 'error' });
    }
    response.json(results);
    console.log(results)
  });
});



// 게시글 찜 하기 6/13
router.post('/like_post/:post_no', function (request, response, next) {
  const post_no = request.params.post_no;

  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return response.status(401).json({ message: '인증코드가 없습니다.' })
  }
  let user_no = decode_user_no(authHeader);

  if (user_no == -1) {
    return response.status(401).json({ message: '토큰 이상' })
  }

  db.query(sql.like_post, [post_no, user_no], function (error, results, fields) {
    if (error) {
      console.error(error);
      return response.status(500).json({ error: 'error' });
    }
    return response.status(200).json({
      message: 'success'
    });
  });
});

// 게시글 찜 취소하기 6/13
router.post('/dislike_post/:post_no', function (request, response, next) {
  const post_no = request.params.post_no;
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return response.status(401).json({ message: '인증코드가 없습니다.' })
  }
  let user_no = decode_user_no(authHeader);

  if (user_no == -1) {
    return response.status(401).json({ message: '토큰 이상' })
  }
  db.query(sql.dislike_post, [post_no, user_no], function (error, results, fields) {
    if (error) {
      console.error(error);
      return response.status(500).json({ error: 'error' });
    }
    return response.status(200).json({
      message: 'success'
    });
  });
});

// // 게시글 신고하기 6/13 ***
// router.post('/post_black/:post_no', function (request, response, next) {
//   const post_no = request.params.post_no;
//
//   const authHeader = request.headers.authorization;
//   if (!authHeader) {
//     return response.status(401).json({message: '인증코드가 없습니다.'})
//   }
//   let user_no = decode_user_no(authHeader);
//
//   if (user_no == -1){
//     return response.status(401).json({message: '토큰 이상'})
//   }
//
//   db.query(sql.post_black, [post_no, user_no], function (error, results, fields) {
//     if (error) {
//       console.error(error);
//       return response.status(500).json({ error: 'error' });
//     }
//     return response.status(200).json({
//       message: 'success'
//     });
//   });
// });



// 게시글 검색하기 6/13 ***
router.post('/search_post', function (request, response, next) {
  const user_no = request.body.user_no;

  const { page, keyword, type } = request.body;
  const itemsPerPage = 10;
  const offset = (page - 1) * itemsPerPage;

  let sqlQuery = `
    SELECT
      post_user_no, post_title, post_price, post_type, post_status, ps.post_no, post_sdd, post_img,
      (SELECT count(*) FROM TB_POST_LIKE lk WHERE ps.post_no = lk.post_no) AS post_like_cnt,
      (SELECT count(*) FROM TB_CHAT ct WHERE ps.post_no = ct.post_no) AS post_chat_cnt
    FROM
      TB_POST ps, TB_POST_IMG img
    WHERE
      ps.post_title LIKE ?
      AND ps.post_no = img.post_no
      AND img.post_img_main = 1
      AND ps.post_status IN (0, 1)`;

  let placeholders = [`%${keyword}%`];

  if (type !== null) {
    sqlQuery += " AND ps.post_type = ?";
    placeholders.push(type);
  }

  sqlQuery += " ORDER BY post_bump DESC LIMIT ? OFFSET ?";
  placeholders.push(itemsPerPage, offset);

  db.query(sqlQuery, placeholders, (error, results) => {
    if (error) {
      console.error('Error executing query:', error);
      return response.status(500).json({ error: 'Database query error' });
    }
    response.json({ results });
  });
});




const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, 'uploads/');
    },
    filename(req, file, cb) {
      cb(null, file.originalname);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});





module.exports = router;