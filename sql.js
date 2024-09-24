module.exports = {

// auth 회원
email_check: `SELECT * FROM tb_user WHERE user_email = ?`,
    nick_check: `SELECT * FROM tb_user WHERE user_nick = ?`,
    register_email: `INSERT INTO tb_user (user_email) VALUES (?)`,
    register_nick: `UPDATE tb_user SET user_nick = ? WHERE user_no = ?`,
    user_info_get: `SELECT user_nick, user_email, user_sdd, user_img, user_grade, user_tp FROM tb_user WHERE user_no = ?`,


    // 수정해야 함
    update_user_info: `UPDATE tb_post SET VALUES (), (?)
                       WHERE user_no = ?`,

    // auth 회원 구매 판매 이력
    // 이거 되는지 확인 해야 함 6/7 * 수정도 필요함!!!
    get_user_buy: `SELECT p1.* p2.* FROM tb_post p1, tb_post p2
                   WHERE (p1.post_user_no = ? and p1.post_type = 1)
                      OR (p2.post_user_no2 = ? and p2.post_type = 0);`,
    get_user_sell: `SELECT * from tb_post WHERE user_no = ?`,

    delete_account: `UPDATE tb_user SET user_status = 1 WHERE user_no = ?`,
    nick_update: `UPDATE tb_user SET user_nick = ? WHERE user_no = ?`,
    report_user: `INSERT INTO tb_black (user_no, post_no, black_user_no, black_con) VALUES (?, ?, ?, ?)`,
    check_report: `SELECT black_no FROM tb_black WHERE post_no = ? AND user_no = ?`,


    // post 게시글
    post_write: `INSERT INTO tb_post (post_user_no, post_title, post_cate, post_comment, post_price, post_type, post_way) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    post_img_insert: `INSERT INTO tb_post_img (post_img, post_no, post_img_main) VALUES (?, ?, ?)`,

    post_update: `UPDATE tb_post SET post_title = ?, post_cate = ?, post_comment = ?, post_price = ?, post_type = ?, post_way = ? WHERE post_no = ?`,
    post_delete: `DELETE FROM tb_post WHERE post_no = ?`,

    // 6/12 수정
    check_post_bump: `SELECT DATE(post_bump) = DATE(NOW()) AS bumb_check FROM tb_post WHERE post_no = ?`,
    post_bump: `UPDATE tb_post SET post_bump  = now() WHERE post_no = ?`,

    // 6/19 ***
    post_list_get: `SELECT ps.post_no, post_status, post_user_no, post_title, post_price, post_type, post_sdd, post_status, post_img,
                           (SELECT count(*) FROM tb_post_like lk
                            WHERE ps.post_no = lk.post_no GROUP BY ps.post_no) AS post_like_cnt,
                           (SELECT count(*) FROM tb_chat ct
                            WHERE ps.post_no = ct.post_no GROUP BY ps.post_no) AS post_chat_cnt
                    FROM tb_post ps, tb_post_img img
                    WHERE ps.post_no = img.post_no  AND img.post_img_main = 1
                      AND (SELECT user_status FROM tb_user WHERE post_user_no = user_no) = 0
                      AND ps.post_status IN (0, 1) ORDER BY post_bump DESC LIMIT ?, ?`,
    post_cate_list_get: `SELECT ps.post_no, post_status, post_user_no, post_title, post_price, post_type, post_sdd, post_status, post_img,
                                (SELECT count(*) FROM tb_post_like lk
                                 WHERE ps.post_no = lk.post_no
                                 GROUP BY ps.post_no) AS post_like_cnt,
                                (SELECT count(*) FROM tb_chat ct
                                 WHERE ps.post_no = ct.post_no
                                 GROUP BY ps.post_no) AS post_chat_cnt FROM tb_post ps, tb_post_img img
                         WHERE ps.post_no = img.post_no AND img.post_img_main = 1
                           AND (SELECT user_status FROM tb_user WHERE post_user_no = user_no) = 0
                           AND ps.post_cate = ?`,

    post_info_get: `SELECT ps.post_no, post_user_no, post_title, post_comment, post_price, post_sdd,
                           post_edd, post_type, post_way, post_status, post_cate, user_img, user_nick, user_grade, img.post_img,
                           (SELECT IFNULL(count(*), 0) FROM tb_post_like lk
                            WHERE ps.post_no = lk.post_no
                            GROUP BY ps.post_no) AS post_like_cnt,
                           (SELECT IFNULL(count(*), 0) FROM tb_post_like lk
                            WHERE ps.post_no = lk.post_no
                              AND lk.user_no = us.user_no) AS post_my_like
                    FROM tb_post ps, tb_user us, tb_post_img img
                    WHERE post_user_no = user_no AND img.post_no = ps.post_no
                      AND img.post_img_main = 1 AND ps.post_no = ?`,
    post_img_get: `SELECT post_img FROM tb_post_img WHERE post_no = ?`,

    // 6/13
    post_update_status: `UPDATE tb_post SET post_status = 1 WHERE post_no = ?`,
    post_update_user2: `SELECT User_no_2 FROM tb_chat WHERE Post_no = ? AND Chat_no = ? AND User_no_1 = ?`,
    post_update_finish: `UPDATE tb_post SET Post_status = 2, Post_user_no2 = ?, Post_edd = now() WHERE Post_no = ? AND Post_user_no = ?`,

    like_post: `INSERT INTO tb_post_like (post_no, user_no) VALUES (?, ?)`,
    dislike_post: `DELETE FROM tb_post_like WHERE post_no = ? AND user_no = ?`,
    post_update_status_no: `UPDATE tb_post SET post_status = ? WHERE post_no = ?`,


    // chat 채팅
    user_no_get:`SELECT user_no FROM tb_user WHERE user_nick = ?`,

    user_no_2_nick_get: `SELECT u.user_nick FROM tb_user u JOIN tb_chat c ON u.user_no = c.user_no_2 WHERE c.chat_no = ? AND c.user_no_1 = ?`,
    user_nick_get:`SELECT user_nick FROM tb_user WHERE user_no = ?`,
    chat_no_get:`SELECT chat_no FROM tb_chat WHERE (user_no_1 = ? or user_no_2 = ?) AND post_no = ?`,

    chat_check:`SELECT * FROM tb_chat WHERE chat_no = ?`,

    chat_set: `INSERT INTO tb_chat (Chat_no, Post_no, User_no_1, User_no_2) VALUES(?, ?, ?, ?)`,
    chat_text: `INSERT INTO tb_chat_msg (Chat_no, Chat_content, Chat_sender, Chat_read, Chat_sender_nick) VALUES(?, ?, ?, ?, ?)`,
    chat_img: `INSERT INTO tb_chat_msg (Chat_no, Chat_content, Chat_sender, Chat_read, Chat_img, Chat_sender_nick) VALUES(?, ?, ?, ?, ?,?)`,

    chat_list: `SELECT * FROM tb_chat WHERE User_no_1 = ? OR User_no_2 = ?`,
    last_chat:  `SELECT * FROM tb_chat_msg WHERE chat_no = ? ORDER BY Chat_time DESC LIMIT 1`,
    update_read: `UPDATE tb_chat_msg SET Chat_read = 1 WHERE Chat_no = ? AND Chat_read = 0`,
    get_unread: `SELECT COUNT(*) AS unread_count FROM tb_chat_msg WHERE (Chat_no = ? AND Chat_sender != ?) AND Chat_read = 0`,
    unread_total: `SELECT COUNT(*) AS unread_total FROM tb_chat_msg WHERE Chat_no IN (
                   SELECT chat_no 
                   FROM tb_chat 
                   WHERE user_no_1 = ? OR user_no_2 = ?) AND Chat_read = 0 AND Chat_sender != ?`,


    //GROUP BY, JOIN 과정에서 중복발생 -> CTE처리를 통해 세분화 필요
    /*
    WITH CTE_NAME AS (
      SELECT
      FROM
      WHERE
    ), CTE_NAME2 AS (
      ...
    )
    */
    //RecentMessages -> 채팅방에서 최신 메시지의 시간 추출
    //FinalMessages -> 최신 시간에 해당하는 최종 메시지 추출
    //SELECT문에서 DISTINCT를 이용해 데이터 중복 방지
    //IN연산자를 이용해 chat_status가 지정값과 일치하는 경우만 출력되도록 변경
    chatlist_send:`WITH RecentMessages AS ( 
    SELECT 
        chat_no,
        MAX(chat_time) AS recent_time
    FROM 
        tb_chat_msg
    GROUP BY 
        chat_no
),
FinalMessages AS (
    SELECT 
        msg.chat_no,
        msg.chat_sender_nick,
        msg.chat_time,
        msg.chat_content
    FROM 
        tb_chat_msg msg
    JOIN 
        RecentMessages rm 
    ON 
        msg.chat_no = rm.chat_no 
        AND msg.chat_time = rm.recent_time
)
SELECT 
    DISTINCT ps.post_title, 
    ps.post_no, 
    img.post_img, 
    fm.chat_sender_nick, 
    fm.chat_time, 
    fm.chat_content, 
    ch.chat_no
FROM 
    tb_chat ch
JOIN 
    tb_post ps ON ch.post_no = ps.post_no
JOIN 
    tb_post_img img ON ch.post_no = img.post_no AND img.Post_img_main = 1
JOIN 
    FinalMessages fm ON ch.chat_no = fm.chat_no
WHERE 
    (ch.user_no_1 = ? AND ch.chat_status IN (0, 2))
    OR (ch.user_no_2 = ? AND ch.chat_status IN (0, 1))`,

    get_history:`SELECT chat_no, chat_content as message, chat_sender as author, chat_read, chat_img as images, chat_time as time, chat_msg_status as status
  FROM tb_chat_msg
  WHERE chat_no = ?`,
    update_status_1:`UPDATE tb_chat SET Chat_status=1, last_leave_no=1 WHERE (chat_no=? AND user_no_1=?)`,
    update_status_2:`UPDATE tb_chat SET Chat_status=2, last_leave_no=2 WHERE (chat_no=? AND user_no_2=?)`,
    //update_status_3:`UPDATE tb_chat SET Chat_status=-1 WHERE chat_no=?`,
    status_check:`SELECT last_leave_no, user_no_1 FROM tb_chat WHERE Chat_no = ?`,
    chat_delete_room:`DELETE FROM tb_chat WHERE chat_no = ?`,
    update_msg_status_1_neg:`UPDATE tb_chat_msg SET chat_msg_status = -1 WHERE chat_no = ? AND chat_msg_status = 1`,
    update_msg_status_2_neg:`UPDATE tb_chat_msg SET chat_msg_status = -1 WHERE chat_no = ? AND chat_msg_status = 2`,
    //update_msg_status_3:`UPDATE tb_chat_msg SET chat_msg_status = -1 WHERE chat_no = ?`,
    //get_msg_status:`SELECT chat_msg_status FROM tb_chat_msg WHERE chat_no = ?`,
    check_all_status: `SELECT chat_msg_status FROM tb_chat_msg WHERE chat_no = ?`,
    update_msg_status_0_1: `UPDATE tb_chat_msg SET chat_msg_status = 1 WHERE chat_no = ? AND chat_msg_status = 0`,
    update_msg_status_0_2: `UPDATE tb_chat_msg SET chat_msg_status = 2 WHERE chat_no = ? AND chat_msg_status = 0`,
    update_last_update_no: 'UPDATE tb_chat SET last_leave_no = ? WHERE chat_no = ?',
    //update_system_msg: `UPDATE tb_chat_msg SET chat_msg_status = ? WHERE chat_no = ? AND chat_sender = 0`,


    // mypage 마이페이지 6/13
    get_like_list: `SELECT ps.post_no, post_status, post_user_no, post_title, post_price, post_type, post_sdd, post_status, post_img,
      (SELECT count(*) FROM tb_post_like lk
      WHERE ps.post_no = lk.post_no
        GROUP BY ps.post_no) AS post_like_cnt,
        (SELECT count(*) FROM tb_chat ct
        WHERE ps.post_no = ct.post_no
        GROUP BY ps.post_no) AS post_chat_cnt 
        FROM tb_post ps, tb_post_img img, tb_user us, tb_post_like lk
        WHERE ps.post_no = img.post_no AND img.post_img_main = 1
        AND lk.post_no = ps.post_no AND lk.user_no = us.user_no
        AND lk.user_no = ?`,

    get_user_info: `SELECT user_nick, user_img, user_email, user_sdd, user_tel, user_black, user_grade FROM tb_user WHERE user_no = ?`,
    update_user_info: `UPDATE tb_post SET VALUES (), (?)
    WHERE user_no = ?`,

    // mypage 회원 거래 이력
    get_user_post: `SELECT ps.post_no, post_status, post_user_no, post_title, post_price, post_type, post_sdd, post_status, post_img,
      (SELECT count(*) FROM tb_post_like lk  WHERE ps.post_no = lk.post_no
        GROUP BY ps.post_no) AS post_like_cnt,
        (SELECT count(*) FROM tb_chat ct WHERE ps.post_no = ct.post_no
        GROUP BY ps.post_no) AS post_chat_cnt FROM tb_post ps, tb_post_img img
        WHERE ps.post_no = img.post_no AND img.post_img_main = 1
        AND ps.post_user_no = ?`,

    get_user_join_post: `SELECT ps.post_no, ps.post_status, ps.post_user_no, ps.post_title, ps.post_price, ps.post_type, ps.post_sdd, ps.post_status, img.post_img,
                        (SELECT COUNT(*) FROM tb_post_like lk WHERE ps.post_no = lk.post_no) AS post_like_cnt,
                        (SELECT COUNT(*) FROM tb_chat ct WHERE ps.post_no = ct.post_no) AS post_chat_cnt FROM tb_post ps
                        JOIN tb_post_img img ON ps.post_no = img.post_no AND img.post_img_main = 1
                        JOIN tb_chat ct ON ps.post_no = ct.post_no
                        WHERE ct.user_no_2 = ?`,



    // manager 관리자 권한
    manager_check: `SELECT user_no, user_nick, user_email FROM tb_user WHERE user_tp = 0 AND user_no = ?`,

    report_list_get: `SELECT * FROM tb_black WHERE black_status = 0`,
    report_process: `UPDATE tb_black SET black_status = ?, Black_reason = ?, admin_no = ? WHERE black_no = ?`,
    //tb_user에 (강퇴, 경고) 업데이트 :``,
    user_kick: `UPDATE tb_user SET user_status = CASE WHEN user_status < 2 THEN 2 ELSE user_status END WHERE user_no = ?`,
    user_warning: `UPDATE tb_user SET user_black = user_black + 1 WHERE user_no = ?`,

    report_post: `SELECT post_no, post_title, post_comment, post_status FROM tb_post WHERE post_no = ?`,
    //kick_user: `DELETE tb_user WHERE user_no = ?`,
    // auth에서 로그인 할 때 확인
    check_black: `SELECT * FROM TB_BLACK WHERE Black_user_no = ? AND admin_no IS NOT NULL`,


    user_list_get: `SELECT * FROM tb_user ORDER BY user_no LIMIT ?, ?`,
    user_search_list_get: `SELECT * FROM tb_user WHERE user_nick LIKE ? ORDER BY user_no`,

    notice_list_get: `SELECT * FROM tb_notice ORDER BY notice_no DESC`,
    notice_write: `INSERT INTO tb_notice (notice_title, notice_con, user_no) VALUES (?, ?, ?)`,
    notice_delete: `DELETE FROM tb_notice WHERE notice_no = ?`,
}