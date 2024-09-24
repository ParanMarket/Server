var express = require('express');
const router = express.Router();
var db = require('../db.js');
var sql = require('../sql.js');
const fs = require('fs');
const path = require("path");
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
    console.log("로그인 검증 시작")
    const accessToken = request.body.token;

    try {
        const payload = await verifyToken(accessToken);
        console.log("페이로드", payload)
        const payload_email = payload.email;
        console.log("페이로드 이메일 ",payload_email)

        db.query(sql.email_check, [payload_email], function (error, results, fields) {
            if (error) {
                console.log("이메일 체크 시db 오류", error)
                return response.status(500).json({ message: 'DB_error' });
            }
            if (results.length > 0) {
                console.log('가입된 이메일 -> 바로 로그인 처리');
                const user = results[0];
                console.log(user)

                if (user.user_status === 1) {
                    return response.status(403).json({
                        message: "자발적으로 탈퇴한 회원입니다."
                    })
                }
                const token = jwt.sign({ no: user.User_no }, 'secret_key');

                db.query(sql.check_black, [user.User_no], function (error, blackResults) {
                    if (error) {
                        console.log("블랙 유저 확인 시 db 오류")
                        return response.status(500).json({ message: 'DB_error' });
                    }

                    // blackResults를 우선순위에 따라 정렬 (black_status가 큰 값이 우선)
                    const sortedResults = blackResults.sort((a, b) => b.Black_status - a.Black_status);

                    // 탈퇴 상태가 있는지 확인하고 탈퇴 사유 가져오기
                    const terminationReport = sortedResults.find((report) => report.Black_status === 3);
                    if (terminationReport) {
                        return response.status(403).json({
                            message: '탈퇴된 회원입니다.',
                            terminationReason: terminationReport.Black_reason // 탈퇴 사유 추가
                        });
                    }

                    // 탈퇴 상태가 없는 경우 가장 최근의 경고 메시지 확인
                    const warningReports = sortedResults.filter((report) => report.Black_status === 2);
                    console.log('warningReports:', warningReports); // Black_status === 2인 항목 확인

                    const latestWarning = warningReports.sort((a, b) => new Date(b.Black_sdd) - new Date(a.Black_sdd))[0];
                    console.log('latestWarning:', latestWarning); // 경고 상태 확인

                    const warningMessage = latestWarning ? latestWarning.Black_reason : null;

                    if (!user.User_nick) { // 닉네임이 null인 경우
                        console.log("닉네임 정보 없음")
                        return response.status(200).send({
                            userToken: token,
                            needsNickname: true,
                            warningMessage: warningMessage

                        });
                    }
                    response.status(200).send({ userToken: token, needsNickname: false, warningMessage: warningMessage  });
                })
            } else {
                console.log('가입 안 된 이메일 -> 회원 등록');
                db.query(sql.register_email, [payload.email], function (error, results, fields) {
                    db.query(sql.email_check, [payload.email], function (error, results, fields) {
                        if (error) {
                            console.log("회원 등록 중 db 오류")
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
    const token = request.headers.authorization.split(' ')[1];
    if (!token) {
        return response.status(401).json({ message: 'No token provided' });
    }
    console.log(token)

    let user_no;
    try {
        const decoded = jwt.verify(token, 'secret_key');
        user_no = decoded.no;
    } catch (err) {
        console.log("토큰이상")
        return response.status(401).json({ message: 'Invalid user token' });
    }

    db.query(sql.nick_check, [nick], function (error, results, fields) {
        if (error) {
            console.log("db 오류")
            return response.status(500).json({ message: 'DB_error' });
        }

        if (results.length > 0) {
            console.log("이미 존재하는 닉네임");
            return response.status(409).json({ message: 'already_exist_nick' });
        } else {
            db.query(sql.register_nick, [nick,  user_no], function (error, results, fields) {
                if (error) {
                    console.log("DB 오류 발생: ", error);
                    return response.status(500).json({ message: 'DB_error' });
                }
                console.log('닉네임 등록 성공');
                response.status(201).json({ message: 'success', nickname: nick });
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
