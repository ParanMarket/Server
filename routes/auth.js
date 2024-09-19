var express = require('express');
const router = express.Router();
var db = require('../db.js');
var sql = require('../sql.js');
const fs = require('fs');
const path = require("path");
const bcrypt = require('bcrypt');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { Token } = require('aws-sdk');
// 로그인
const client = new OAuth2Client(process.env.REACT_APP_GOOGLE_CLIENT);

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

router.post('/login', async function(request, response) {
    const accessToken = request.body.token;

    try {
        const payload = await verifyToken(accessToken);
        const payload_email = payload.email;

        db.query(sql.email_check, [payload.email], function (error, results, fields) {
            if (error) {
                return response.status(500).json({ message: 'DB_error' });
            }
            if (results.length > 0) {
                console.log('가입된 이메일 -> 바로 로그인 처리');
                const user = results[0];
                console.log(user)
                const token = jwt.sign({ no: user.User_no }, 'secret_key');

                if (!user.User_nick) { // 닉네임이 null인 경우
                    console.log("닉네임 정보 없음")
                    return response.status(200).send({
                        userToken: token,
                        needsNickname: true

                    });
                }
                response.status(200).send({ userToken: token, needsNickname: false });

            } else {
                console.log('가입 안 된 이메일 -> 회원 등록');
                db.query(sql.register_email, [payload.email], function (error, results, fields) {
                    db.query(sql.email_check, [payload.email], function (error, results, fields) {
                        if (error) {
                            return response.status(500).json({ message: 'DB_error' });
                        } else {
                            console.log('이메일 등록 성공');
                            const user = results[0];
                            const token = jwt.sign({ no: user.User_no }, 'secret_key');
                            response.status(201).send({ userToken: token, needsNickname: true  });
                        }
                    });
                });
            }
        });

    } catch (error) {
        console.log(error);
        response.status(500).send('error');
    }
});

async function verifyToken(accessToken) {
    try {
        const ticket = await client.verifyIdToken({
            idToken: accessToken,
            audience: process.env.REACT_APP_GOOGLE_CLIENT,
        });
        return ticket.getPayload();
    } catch (error) {
        throw error;
    }
}

// 닉네임 설정 및 중복 확인
router.post('/nick_check', function(request, response) {
    const nick = request.body.nickname;
    const authHeader = request.headers.authorization;

    // 토큰 번호 없는 경우 오류
    if (!authHeader) {
        return response.status(401).json({ message: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
        decoded = jwt.verify(token, 'secret_key');
    } catch (error) {
        return response.status(401).json({ message: 'Invalid token' });
    }
    console.log(decoded)

    db.query(sql.nick_check, [nick], function (error, results, fields) {
        if (error) {
            return response.status(500).json({ message: 'DB_error' });
        }
        if (results.length > 0) {
            return response.status(200).json({ message: 'already_exist_nick' });
        } else {
            db.query(sql.register_nick, [nick, decoded.no], function (error, results, fields) {
                if (error) {
                    return response.status(500).json({ message: 'DB_error' });
                }
                console.log('닉네임 등록 성공');
                response.status(200).json({ message: 'success', nickname: nick });
            });
        }
    });
});

router.post('/verify_user', function (request, response) {// 사용자 인증
    const {post_user_no} = request.body;
    const authHeader = request.headers.authorization;
    console.log(request.body)

    if (!authHeader) {
        return response.status(401).json({message: '인증코드가 없습니다.'})
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
        decoded = jwt.verify(token, 'secret_key');
    } catch (error) {
        return response.status(401).json({message: '토큰 이상'});
    }
    console.log(decoded.no)
    console.log(post_user_no)

    if (decoded.no === post_user_no) {
        console.log("du")
        return response.status(200).json({ message: '게시자 인증 완료', verified: true });
    } else {
        console.log("dsdasffasafu")
        return response.status(200).json({ message: '게시자 불일치', verified: false });

    }
});

// 사용자 마이페이지
router.post('/authinfo', function (request, response) {
    const token = request.headers.authorization.split(' ')[1];
    let user_no;
    try {
        const decoded = jwt.verify(token, 'secret_key');
        user_no = decoded.no;
    } catch (err) {
        console.log('Invalid user token')
    }
    console.log(user_no)


    db.query(sql.user_info_get, [user_no], function (error, results, fields) {
        if (error) {
            return response.status(500).json({ message: 'DB_error' });
        }
        else {
            return response.status(200).json(results)
        }
    })

});

// 신고하기 9/19 ***
router.post('/report', function (request, response, next) {
    const data = request.body;

    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({ message: '인증코드가 없습니다.' })
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1) {
        return response.status(401).json({ message: '토큰 이상' })
    }

    // 이미 동일 신고가 접수된 적 있는지 확인
    db.query(sql.check_report, [data.post_no, user_no], function (error, results, fields) {
        if (error) {
            console.error(error);
            return response.status(500).json({ error: 'error' });
        }
        if (results.length > 0) {
            return response.status(500).json({
                message: '동일한 신고 이미 존재' });
        }
        db.query(sql.report_user, [user_no, data.post_no, data.user_no, data.black_con], function (error, results, fields) {
            if (error) {
                console.error(error);
                return response.status(500).json({ error: 'error' });
            }
            return response.status(200).json({
                message: 'success'
            });
        });
    });
});

// 유저 회원 탈퇴 9/15 ***
router.post('/deleteaccount', function (request, response, next) {

    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({ message: '인증코드가 없습니다.' })
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1) {
        return response.status(401).json({ message: '토큰 이상' })
    }

    db.query(sql.delete_account, [user_no], function (error, results, fields) {
        if (error) {
            console.error(error);
            return response.status(500).json({ error: 'error' });
        }
        return response.status(200).json({
            message: 'success'
        });
    });
});

// 닉네임 수정 9/15 ***
router.post('/nick_update', function (request, response) {

    const data = request.body;
    const token = data.token;

    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({ message: '인증코드가 없습니다.' })
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1) {
        return response.status(401).json({ message: '토큰 이상' })
    }

    db.query(sql.nick_check, [data.nickname], function (error, results, fields) {
        if (error) {
            return response.status(500).json({ message: 'DB_error' });
        }
        if (results.length > 0) {
            return response.status(200).json({ message: 'already_exist_nick' });
        } else {
            db.query(sql.nick_update, [data.nickname, user_no], function (error, results, fields) {
                if (error) {
                    return response.status(500).json({
                        message: 'DB_error'
                    })
                }
                return response.status(200).json({
                    message: 'success'
                });
            });
        }
    });


})

module.exports = router;