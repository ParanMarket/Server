const express = require('express')
const http = require('http')
const cors = require('cors')
const path = require("path");
const db = require('./db')
const { Server } = require('socket.io')
const sql = require('./sql.js');
const jwt = require('jsonwebtoken');
require('dotenv').config();


const PORT = process.env.PORT || 5001

const app = express()
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
}))

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const authRouter = require('./routes/auth');
const postRouter = require('./routes/post');
const mypageRouter = require('./routes/mypage');
const chatRouter = require('./routes/chat')

app.use('/auth', authRouter);
app.use('/post', postRouter);
app.use('/mypage', mypageRouter);
app.use('/chat', chatRouter)

//---------------------------------------------------------------------------------------

const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true  // 쿠키나 인증 정보를 함께 전송할 경우
    },
})


io.on("connection", (socket) => {
    console.log("켜짐")
    console.log(`User connected: ${socket.id}`)

    socket.currentRoom = null

    socket.on("join_room", (data) => {
        socket.join(data)
        socket.currentRoom = data
        console.log(`User with Id: ${socket.id} joined room: ${data}`)
    })

    // 방번호가 같을 때만 받을 수 있음
    socket.on("send_message", async (data) => {
        try {
            const decoded = jwt.verify(data.userToken, 'secret_key');
            const user_no = decoded.no;
            console.log("채팅방 데이터", data)

            // 1. 현재 채팅방 상태 확인
            db.query("SELECT chat_status FROM tb_chat WHERE chat_no = ?", [data.chat_no], (error, results) => {
                if (error) {
                    console.log('채팅방 상태 조회 오류:', error);
                    return;
                }

                const currentChatStatus = results[0].chat_status;
                console.log(`Current chat status for chat_no ${data.chat_no}: ${currentChatStatus}`);

                // 2. 만약 chat_status가 1 또는 2라면 다시 0으로 업데이트 (재활성화)
                if (currentChatStatus !== 0) {
                    db.query("UPDATE tb_chat SET chat_status = 0 WHERE chat_no = ?", [data.chat_no], (updateError) => {
                        if (updateError) {
                            console.log('채팅방 상태 업데이트 오류:', updateError);
                            return;
                        }
                        console.log(`Chat status updated to 0 for chat_no: ${data.chat_no}`);
                    });
                }

                // 3. 유저 닉네임 가져오기
                db.query(sql.user_nick_get, [user_no], function (error, results, fields) {
                    if (error) {
                        console.log('닉네임 조회 오류:', error);
                        return;
                    }

                    const userNick = results[0].user_nick;

                    // 4. 채팅방 번호 가져오기
                    db.query(sql.chat_no_get, [user_no, user_no, data.post_no], function (error, results, fields) {
                        if (error) {
                            console.log('채팅방 번호 조회 오류:', error);
                            return;
                        }

                        const roomNo = results[0].chat_no;

                        // 5. 텍스트 메시지 저장
                        if (typeof data.message === 'string' && data.message !== "") {
                            db.query(sql.chat_text, [roomNo, data.message, user_no, '1', userNick], function (error, results, fields) {
                                if (error) {
                                    console.log('메시지 저장 오류:', error);
                                    return;
                                }
                                console.log("Message saved to DB");
                            });
                        }

                        // 6. 이미지 메시지 저장
                        if (data.images && data.images.length > 0) {
                            const imageUrls = JSON.stringify(data.images);
                            console.log("Saving image to DB:", imageUrls);

                            // JSON 문자열로 변환된 값을 데이터베이스에 저장
                            db.query(sql.chat_img, [roomNo, user_no, '1', imageUrls, userNick], function (error) {
                                if (error) {
                                    console.log('이미지 저장 오류:', error);
                                } else {
                                    console.log("Img saved to DB.");
                                }

                                });
                        }

                        // 7. 메시지를 다른 사용자에게 전송
                        socket.to(data.chat_no).emit("receive_message", data);
                    });
                });
            });
        } catch (error) {
            console.log('jwt 인증 오류: ', error);
        }
    });

    socket.on("leave_room", (data) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit("user_left", {
                left: true,
                message: '상대방이 채팅방을 나갔어요.'
            });

            // chat_no를 이용해 tb_chat 테이블에서 chat_status를 불러옴
            db.query('SELECT chat_status FROM tb_chat WHERE chat_no = ?', [data.chatNo], (error, results) => {
                if (error) {
                    console.log('채팅 상태 조회 오류:', error);
                    return;
                }

                // chat_status가 존재할 경우 systemMessage에 저장
                const chatStatus = results[0]?.chat_status;
                if (chatStatus !== undefined) {
                    const systemMessage = {
                        chat_no: data.chatNo,
                        message: "상대방이 채팅방을 나갔어요.",
                        user_no: 0, // 시스템 메시지 표시
                        userNick: 'system',
                        chat_msg_status: chatStatus // chat_status를 chat_msg_status로 저장
                    };

                    // 시스템 메시지 저장
                    const query = `
                INSERT INTO tb_chat_msg (Chat_no, Chat_content, Chat_sender, Chat_read, Chat_sender_nick, chat_msg_status)
                VALUES(?, ?, ?, ?, ?, ?)`;

                    db.query(query, [
                        systemMessage.chat_no,
                        systemMessage.message,
                        systemMessage.user_no,
                        '1',
                        systemMessage.userNick,
                        systemMessage.chat_msg_status
                    ], function (error) {
                        if (error) {
                            console.log('4:', error);
                        }
                        console.log("SystemMessage saved to DB.");
                    });
                } else {
                    console.log('채팅 상태를 찾을 수 없습니다.');
                }
            });
        } else {
            console.log("disconnected");
        }

        console.log(`User disconnected: ${socket.id}`);

    })

})

server.listen(PORT, () => console.log(`서버가 ${PORT} 에서 시작되었어요`))