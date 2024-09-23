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
    const { chatNo } = req.body;

    const userToken = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(userToken, 'secret_key');
    const user_no = decoded.no;

    db.query(sql.update_read, [chatNo, user_no], (err, results) => {
            if (err) {
                console.error('chat_read 상태 error :', error);
                return res.status(500).send('error');
            }
        res.status(200).json({ message: 'success' });
        }
    );
});

// 채팅방 안 읽은 채팅 수 가져오기
router.get('/unread', (request, response) => {
    const chat_no = request.query.chat_no
    const userToken = request.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(userToken, 'secret_key');
    const user_no = decoded.no;

    db.query(sql.get_unread, [chat_no, user_no], (error, results) => {
        if (error) {
            console.error('show_unread 조회 오류 : ', error);
            return response.status(500).send('error')
        }
        response.status(200).json(results[0])
    })
})

// 하단바 용 채팅방 안 읽은 채팅 수 가져오기
router.get('/unread_total', (request, response) => {
    const userToken = request.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(userToken, 'secret_key');
    const user_no = decoded.no;

    db.query(sql.unread_total, [user_no, user_no, user_no], (error, results) => {
        if (error) {
            console.error('show_unread 조회 오류 : ', error);
            return response.status(500).send('error')
        }
        console.log("Total unread count:", results[0].unread_total);
        response.status(200).json({ unread_total: results[0].unread_total });
    })
})

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
        return res.status(401).json({ message: '토큰이 제공되지 않았습니다.' });
    }

    let user_no;
    try {
        const decoded = jwt.verify(token, 'secret_key');
        user_no = decoded.no;
    } catch (err) {
        return res.status(401).json({ message: '유효하지 않은 사용자 토큰입니다.' });
    }

    db.query(sql.status_check, [chatNo], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error checking chat status' });

        const last_leave_no = results[0].last_leave_no // 마지막으로 나간 사람 저장
        const user_no_1 = results[0].user_no_1;
        console.log('채팅 상태 정보 출력:', last_leave_no, user_no_1)

        if (last_leave_no == 0) {
                // 두 사용자가 모두 있는 경우, 현재 사용자를 나간 것으로 표시
                if (user_no_1 == user_no) { // user_no_1 나감
                // tb_chat테이블 stastus 1로 변경
                db.query(sql.update_status_1, [chatNo, user_no], (err) => {
                    if (err) return res.status(500).json({ error: 'Error updating user 1 status' });
                    console.log('user_no_1 나감 0')
                    // chat_msg_status = 0 인거 1로 변경
                    db.query(sql.update_msg_status_0_1, [chatNo], (err) => {
                        if (err) return res.status(500).json({ error: 'Error updating message status to 1' });
                        console.log('user_no_1 msg status 변경 0->1')
                        return res.status(200).json({ message: 'user_no_1 has left the chat', chat_msg_status: 1 });
                    });
                });
            } else { // user_no_2 나감
                // tb_chat테이블 stastus 2로 변경
                db.query(sql.update_status_2, [chatNo, user_no], (err) => {
                    if (err) return res.status(500).json({ error: 'Error updating user 2 status' });
                    console.log('user_no_2 나감 0')
                    // chat_msg_status=0 인거 2로 변경
                    db.query(sql.update_msg_status_0_2, [chatNo], (err) => {
                        if (err) return res.status(500).json({ error: 'Error updating message status to 2' });
                        console.log('user_no_1 msg status 변경 0->2')
                        return res.status(200).json({ message: 'user_no_2 has left the chat', chat_msg_status: 2 });
                    });
                });
            }
        }

        if (last_leave_no == 1) { // user_no_1이 이미 나간 상태
            if (user_no_1 == user_no) { //user_no_1가 나가는 경우
                db.query(sql.update_msg_status_0_1, [chatNo], (err) => {
                    if (err) return res.status(500).json({ error: 'Error updating user 1 status' });
                    console.log('1 나간 상태에서 msg상태변경 0->1');
                    db.query(sql.update_status_1, [chatNo, user_no], (err) => {
                        if (err) return res.status(500).json({ error: 'Error updating user 1 status' });
                        console.log('1 나간 상태에서 status 0->1');
                    })
                    return res.status(200).json({ message: 'user_no_1 has left the chat', chat_msg_status: 1 });
                });
            } else { //user_no_2가 나가는 경우
                // tb_chat테이블 stastus 2로 변경
                db.query(sql.update_status_2, [chatNo, user_no], (err) => {
                    if (err) return res.status(500).json({ error: 'Error updating user 1 status' });
                    console.log('status 상태변경 1->2');
                    // chat_msg_status=1인거 -1로 변경
                    db.query(sql.update_msg_status_1_neg, [chatNo], (err) => {
                        if (err) return res.status(500).json({ error: 'Error updating message status to -1' });
                        console.log('msg 상태변경 1->-1');
                        db.query(sql.update_msg_status_0_2, [chatNo], (err) => {
                            if (err) return res.status(500).json({ error: 'Error updating message status to 2' });
                            console.log('msg 상태변경 0-> 2');
                            return checkAndDeleteIfNecessary(chatNo, res);
                        })
                    });
                });
            }
        }

        if (last_leave_no == 2) { // user_no_2이 이미 나간 상태
            if (user_no_1 == user_no) { //user_no_1가 나가는 경우
                // tb_chat테이블 stastus 1로 변경
                db.query(sql.update_status_1, [chatNo, user_no], (err) => {
                    if (err) return res.status(500).json({ error: 'Error updating user 1 status' });
                    console.log('status 상태변경 2->1');
                    // chat_msg_status=2인거 -1로 변경
                    db.query(sql.update_msg_status_2_neg, [chatNo], (err) => {
                        if (err) return res.status(500).json({ error: 'Error updating message status to -1' });
                        console.log('msg 상태변경 2->-1');
                        db.query(sql.update_msg_status_0_1, [chatNo], (err) => {
                            if (err) return res.status(500).json({ error: 'Error updating message status to 1' });
                            console.log('msg 상태변경 0-> 1');
                            return checkAndDeleteIfNecessary(chatNo, res);
                        })
                    });
                });
            } else { // user_no_2 나감
                db.query(sql.update_msg_status_0_2, [chatNo], (err) => {
                    if (err) return res.status(500).json({ error: 'Error updating message status to 2' });
                    console.log('msg 상태변경 0->2');
                    db.query(sql.update_status_2, [chatNo, user_no],  (err) => {
                        if (err) return res.status(500).json({ error: 'Error updating user 1 status' });
                        console.log('2 나간 상태에서 status 0->2');
                    })
                    return res.status(200).json({ message: 'user_no_1 has left the chat', chat_msg_status: 1 });
                });
            }
        }

    });

});

// 모든 메시지 상태가 -1인지 확인 후 채팅방 삭제 함수
function checkAndDeleteIfNecessary(chatNo, res) {
    db.query(sql.check_all_status, [chatNo], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error checking all message statuses' });

        const allStatus = results.map(row => row.chat_msg_status);

        if (allStatus.every(status => status === -1)) {
            db.query(sql.chat_delete_room, [chatNo], (err) => {
                if (err) return res.status(500).json({ error: 'Error deleting chat room' });

                return res.status(200).json({ message: 'Chat room deleted successfully' });
            });
        } else {
// 이미 응답을 보냈다면 더 이상 응답을 보내지 않음
            if (!res.headersSent) {
                return res.status(200).json({ message: 'Chat room updated, but not deleted.', chat_msg_status: allStatus });
            }        }
    });
}

module.exports = router;