var express = require('express');
const router = express.Router();
var db = require('../db.js');
var sql = require('../sql.js');
const fs = require('fs');
const path = require("path");
const multer = require('multer');
const jwt = require('jsonwebtoken');
const socketio = require('socket.io')
const aws = require('aws-sdk');
const multerS3 = require('multer-s3');

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

            callback(null, `chat/${date}_${randomNumber}`);
        },
        acl: 'public-read-write'
    }),
    limits: { fileSize: 5 * 1024 * 1024 }
});



//채팅방 생성, 채팅방 정보 (게시글 작성자 -> Post_user_no = User_no_1)
router.post('/get_chat_details', async function (request, response, next) {
    const token = request.headers.authorization.split(' ')[1];
    let user_no;
    try {
        const decoded = jwt.verify(token, 'secret_key');
        user_no = decoded.no;
    } catch (err) {
        console.log('Invalid user token')
    }


    // 채팅방 번호 생성
    let chat_no;
    try {

        if (request.body.post_user_no != user_no) {
            chat_no = request.body.post_no * 100000 + request.body.post_user_no * 1000 + user_no;

            // 채팅방 있는지 확인
            const [chatResults] = await db.promise().query(sql.chat_check, [chat_no]);

            // 채팅방이 없으면 새로 생성
            if (chatResults.length === 0) {
                await db.promise().query(sql.chat_set, [chat_no, request.body.post_no, request.body.post_user_no, user_no]);
            }

        }

        // 정보 전달
        // 채팅방 정보 가져오기
        const [chatNoResults] = await db.promise().query(sql.chat_no_get, [user_no, user_no, request.body.post_no]);
        if (chatNoResults.length === 0) {
            return response.status(404).json({ message: 'Chat room not found' });
        }
        const chatNo = chatNoResults[0].chat_no;

        let other_nick;
        if (request.body.post_user_no === user_no) {
            // 게시글 작성자
            const [nickResults] = await db.promise().query(sql.user_no_2_nick_get, [chatNo, user_no]);
            if (nickResults.length === 0) {
                return response.status(404).json({ message: 'User nickname not found' });
            }
            other_nick = nickResults[0].user_nick;
        } else {
            // 게시글 참여자 (게시글 작성자 닉네임으로 그냥 셋팅)
            other_nick = request.body.post_user_nick;
        }

        return response.status(200).json({
            chat_no: chatNo,
            user_nick: other_nick,
        });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: 'Database error', error });
    }

});



//채팅방 목록
router.post('/chatlist', function (request, response, next) {
    const token = request.headers.authorization.split(' ')[1];
    if (!token) {
        return response.status(401).json({ message: 'No token provided' });
    }

    let user_no;
    try {
        const decoded = jwt.verify(token, 'secret_key');
        user_no = decoded.no;
    } catch (err) {
        return response.status(401).json({ message: 'Invalid user token' });
    }


    db.query(sql.chatlist_send, [user_no, user_no], function (error, results, fields) {
        if (error) {
            console.log(error)
            return response.status(500).json({
                message: 'DB_error'
            })
        }
        else {
            response.status(200).json(results)
        }
    })

});



//채팅 기록
router.get('/get_chat_history/:chatNo', (req, res) => {
    const { chatNo } = req.params; // 채팅방 정보
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, 'secret_key');
    const user_no = decoded.no; // 사용자 번호

    // chat_msg_status로 가져오는 정보 다르게 설정하기
    db.query('SELECT user_no_1 FROM tb_chat WHERE chat_no = ?', [chatNo], (err, userNo1) => {
        if (err) {
            return res.status(500).json({ error: '채팅방 정보 조회 오류'})
        }
        const user_no_1 = userNo1[0].user_no_1 // user_no_1 가져오기


        let query = '';

        if (user_no === user_no_1) {
            // user_no가 user_no_1과 같을 경우 : chat_msg_status가 1과 -1이 아닌 메시지 가져오기 (작성자 본인)
            query = 'SELECT chat_no, chat_content as message, chat_sender as author, chat_read, chat_img as images, chat_time as time FROM tb_chat_msg WHERE chat_no = ? AND chat_msg_status != 1 AND chat_msg_status != -1'
        } else {
            // user_no가 user_no_1과 다를 경우: chat_msg_status가 2와 -1가 아닌 메시지 가져오기 (채팅 건 사람)
            query = 'SELECT chat_no, chat_content as message, chat_sender as author, chat_read, chat_img as images, chat_time as time FROM tb_chat_msg WHERE chat_no = ? AND chat_msg_status != 2 AND chat_msg_status != -1'
        }

        // 필터링된 메시지 가져오기
        db.query(query, [chatNo], (err, results) => {
            if (err) {
                console.error('Failed to fetch chat history', err);
                return res.status(500).json({ error: 'Failed to fetch chat history' });
            }

            res.status(200).json(results);
        });
    });
});



//채팅 읽음 설정
router.post('/updateChatRead', (req, res) => {
    // 데이터베이스에서 메세지의 읽음 상태 업데이트 -> Chat_msg_no, 현재 유저번호 필요
    const { Chat_msg_no, userNo } = req.body;
    db.query('UPDATE tb_chat_msg SET chat_read = TRUE WHERE id IN (?) AND user_no != ?', [Chat_msg_no, userNo], (err, results) => {
            if (err) {
                console.error('error :', error);
                return res.status(500).send('error');
            }
            res.send('success');
        }
    );
});

//채팅방 이미지 업로드
router.post('/upload_images', uploadImage.array('images', 9), (req, res) => {
    console.log(req.files); // 파일 데이터 확인
    if (!req.files || req.files.length === 0) {
        console.error('No files received');
        return res.status(400).json({ message: 'files upload error' });
    }
    const imageUrls = req.files.map(file => file.location);
    res.json({ imageUrls });
});

//채팅방 나가기 -> 채팅내역 삭제
router.post('/leaveChatRoom', (req, res) => {
    const chatNo = req.body.chat_no;
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    let user_no;
    try {
        const decoded = jwt.verify(token, 'secret_key');
        user_no = decoded.no;
    } catch (err) {
        return res.status(401).json({ message: 'Invalid user token' });
    }

    db.query(sql.status_check, [chatNo], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'error1' });
        }

        const chatStatus = results[0].Chat_status;
        console.log('10: '+results[0].Chat_status)

        if (chatStatus == 0) {

            db.query(sql.update_status_1, [chatNo, user_no], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'error2' });
                }

                db.query(sql.update_msg_status_1, [chatNo, user_no], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'error7' });
                    }

                    db.query(sql.update_status_2, [chatNo, user_no], (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'error3' });
                        }

                        db.query(sql.status_check, [chatNo], (err, results) => {
                            if (err) {
                                return res.status(500).json({ error: 'error5' });
                            }

                            const chatStatus2 = results[0].Chat_status;
                            console.log('20: '+results[0].Chat_status)

                            if (chatStatus2 == 2) {
                                db.query(sql.update_msg_status_2, [chatNo, user_no], (err) => {
                                    if (err) {
                                        return res.status(500).json({ error: 'error8' });
                                    }

                                    db.query(sql.get_msg_status, [user_no], (err, results) => {
                                        if (err) {
                                            return res.status(500).json({ error: 'error9' });
                                        }
                                        const msg_status = results[0].chat_msg_status
                                        console.log('30: '+msg_status)

                                        res.status(200).json({ message: 'success', chat_msg_status: msg_status });
                                    });
                                });
                            } else {
                                db.query(sql.get_msg_status, [user_no], (err, results) => {
                                    if (err) {
                                        return res.status(500).json({ error: 'error9' });
                                    }
                                    const msg_status = results[0].chat_msg_status
                                    console.log('30-2: '+msg_status)

                                    res.status(200).json({ message: 'success', chat_msg_status: msg_status });
                                });
                            }
                        })
                    })
                })
            });

        } else if (chatStatus == 1 || chatStatus == 2) {
            const newStatus = chatStatus == 1 ? 2 : 1;

            db.query(sql[`update_status_${newStatus}`], [chatNo, user_no], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'error4' });
                }

                db.query(sql.status_check, [chatNo], (err, results) => {
                    if (err) {
                        return res.status(500).json({ error: 'error5' });
                    }

                    if (results.length === 0) {
                        return res.status(404).json({ error: 'Chat status not found' });
                    }

                    const updatedStatus = results[0].Chat_status;
                    console.log('40: ' + updatedStatus);

                    db.query(updatedStatus == 1 ? sql.update_msg_status_1 : sql.update_msg_status_2, [chatNo, user_no], (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'error7' });
                        }

                        db.query(sql.get_msg_status, [user_no], (err, results) => {
                            if (err) {
                                return res.status(500).json({ error: 'error9' });
                            }

                            if (results.length === 0) {
                                return res.status(404).json({ error: 'Message status not found' });
                            }

                            const msg_status = results[0].chat_msg_status;
                            console.log('50: ' + msg_status);

                            if ((chatStatus == 1 && updatedStatus == 2) || (chatStatus == 2 && updatedStatus == 1)) {
                                db.query(sql.chat_delete_room, [chatNo], (err) => {
                                    if (err) {
                                        return res.status(500).json({ error: 'error6' });
                                    }

                                    res.status(200).json({ message: 'success', chat_msg_status: msg_status });
                                });
                            } else {
                                // 상태가 업데이트 되었으나 삭제되지 않은 경우 -> 오류 확인용 없어도 됨
                                res.status(200).json({ message: 'updated, but not deleted', chat_msg_status: msg_status });
                            }
                        });
                    });
                });
            });
        } else {
            res.status(500).json({ error: 'error' });
        }
    })
});


module.exports = router;