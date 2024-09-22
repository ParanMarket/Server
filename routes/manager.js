var express = require('express');
const router = express.Router();
var db = require('../db.js');
var sql = require('../sql.js');
const jwt = require('jsonwebtoken');


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

// 관리자 체크
router.post('/manager_check', function (request, response, next) {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({ message: '인증코드가 없습니다.' })
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1) {
        return response.status(401).json({ message: '토큰 이상' })
    }

    db.query(sql.manager_check, [user_no], function (error, results, fields) {
        if (error) {
            console.error(error);
            return response.status(500).json({ error: 'error' });
        }
        if (results.length <= 0) {
            return response.status(403).json({ message: '관리자가 아님' });
        }
        return response.status(200).json({
            message: 'success',
            user_no: results[0].user_no,
            user_nick: results[0].user_nick,
            user_email: results[0].user_email
        });
    });
});



// 미처리된 신고 목록 가져오기
router.post('/report_list', function (request, response, next) {

    // const data = request.body;

    db.query(sql.report_list_get, function (error, results, fields) {
        if (error) {
            console.error(error);
            return response.status(500).json({ error: 'error' });
        }
        response.json(results);
    });
});

// 신고 당한 게시글 내용 불러오기
router.post('/report_post', async (request, response) => {
    const { post_no } = request.body;

    try {
        db.query(sql.report_post, [post_no], function (error, results, fields) {
            if (error) {
                console.error(error);
                return response.status(500).json({ error: 'error' });
            }

            // 결과가 비어있는지 확인
            if (results.length > 0) {
                response.status(200).json(results[0]);
            } else {
                response.status(404).json({ message: "게시글을 찾을 수 없습니다." });
            }
        });
    } catch (error) {
        console.error("게시글 불러오기 에러: ", error);
        response.status(500).json({ message: "게시글 불러오기 실패" });
    }
});

// 신고에 대한 경고 처리
router.post('/report_process', function (request, response, next) {
    const data = request.body;
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({ message: '인증코드가 없습니다.' })
    }
    let admin_no = decode_user_no(authHeader);

    if (admin_no == -1) {
        return response.status(401).json({ message: '토큰 이상' })
    }

    db.query(sql.report_process, [data.status, data.black_con, admin_no, data.black_no, ], function (error, results, fields) {
        if (error) {
            console.error(error);
            return response.status(500).json({ error: 'error' });
        }
    });

    // 회원 강제 탈퇴
    if (data.status === 3) { // 강퇴
        db.query(sql.user_kick, [data.user_no], function (error, results, fields) {
            if (error) {
                console.error(error);
                return response.status(500).json({ error: 'error' });
            }
            return response.status(200).json({ message: '탈퇴 처리 완료' });
        });
    } else if (data.status === 2) { // 경고처리
        db.query(sql.user_warning, [data.user_no], function (error, results, fields) {
            if (error) {
                console.error(error);
                return response.status(500).json({ error: 'error' });
            }
            return response.status(200).json({ message: '경고 처리 완료' });
        })
    } else {
        return response.status(200).json({ message: 'success' });
    }
});


// 회원 목록 불러오기
router.post('/user_list', function (request, response, next) {
    const onePageCnt = 15;  // 한 페이지 당 회원 수
    const data = request.body;

    // 검색이 있을 경우
    if (data.keyword && data.keyword.trim()) {
        // 한 단어라도 들어가면 검색 되도록
        // 키워드를 공백을 기준으로 분리하여 배열로 만듦
        const keywords = data.keyword.trim().split(/\s+/);
        let query = `SELECT * FROM tb_user WHERE `;
        let queryParams = [];

        // 각 키워드에 대해 LIKE 조건 추가
        keywords.forEach((keyword, index) => {
            if (index > 0) {
                query += ` OR `;  // OR 연산자로 연결
            }
            query += `user_nick LIKE ?`;
            queryParams.push(`%${keyword}%`);
        });

        query += ` ORDER BY user_no`;

        db.query(query, queryParams, function (error, results, fields) {
            if (error) {
                console.error(error);
                return response.status(500).json({ error: 'error' });
            }
            response.json(results);
        });
    } else {
        const offset = (data.page - 1) * onePageCnt;
        // 검색이 없을 경우
        db.query(sql.user_list_get, [(data.page - 1) * onePageCnt, onePageCnt], function (error, results, fields) {
            if (error) {
                console.error(error);
                return response.status(500).json({ error: 'error' });
            }
            response.json(results);
        });
    }
});



// 공지사항 목록 불러오기
router.post('/notice_list', function (request, response, next) {

    // const data = request.body;

    db.query(sql.notice_list_get, function (error, results, fields) {
        if (error) {
            console.error(error);
            return response.status(500).json({ error: 'error' });
        }
        response.json(results);
    });
});

// 공지사항 등록
router.post('/notice_write', function (request, response, next) {

    const data = request.body;

    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({ message: '인증코드가 없습니다.' })
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1) {
        return response.status(401).json({ message: '토큰 이상' })
    }

    db.query(sql.notice_write, [data.title, data.con, user_no], function (error, results, fields) {
        if (error) {
            console.error(error);
            return response.status(500).json({ error: '공지사항 등록 실패' });
        }
        return response.status(200).json({
            message: 'success'
        });
    });
});

// 공지사항 삭제
router.post('/notice_delete', function (request, response, next) {

    const data = request.body;
    db.query(sql.notice_delete, [data.notice_no], function (error, results, fields) {
        if (error) {
            console.error(error);
            return response.status(500).json({ error: '공지사항 삭제 실패' });
        }
        return response.status(200).json({
            message: 'success'
        });
    });
});



module.exports = router;