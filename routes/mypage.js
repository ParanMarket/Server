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

// 복호화 함수
function decode_user_no(authHeader) {
    const token = authHeader.split(' ')[1];
    let decoded;

    try {
        decoded = jwt.verify(token, 'secret_key');
    } catch (error) {
        return -1;
    }
    return decoded.no;
    // decoded.no에 저장됨


    // 사용할 곳에 아래 코드 복붙
    /*
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({message: '인증코드가 없습니다.'})
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1){
        console.log("토큰 이상")
        return response.status(401).json({message: '토큰 이상'})
    }
        */

}



// 회원 정보 닉네임과 이미지만 가져오기 6/13 *
router.post('/get_user', function (request, response) {

    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({message: '인증코드가 없습니다.'})
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1){
        return response.status(401).json({message: '토큰 이상'})
    }

    db.query(sql.get_user, [user_no], function (error, results, fields) {
        if (error) {
            return response.status(500).json({
                message: 'DB_error'
            })
        }
        response.json(results);
    });
})

// 회원 정보 통째로 가져오기 6/13 ***
router.post('/get_user_info', function (request, response) {

    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({message: '인증코드가 없습니다.'})
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1){
        return response.status(401).json({message: '토큰 이상'})
    }

    db.query(sql.get_user_info, [user_no], function (error, results, fields) {
        if (error) {
            return response.status(500).json({
                message: 'DB_error'
            })
        }
        response.json(results);
    });
})

// 회원 정보 수정 6/13 *** 구현 안 할 수도
router.post('/update_user_info', function (request, response) {

    const data = request.body;

    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({message: '인증코드가 없습니다.'})
    }
    let user_no = decode_user_no(authHeader);

    if (user_no == -1){
        return response.status(401).json({message: '토큰 이상'})
    }

    db.query(sql.update_user_info, [user_no], function (error, results, fields) {
        if (error) {
            return response.status(500).json({
                message: 'DB_error'
            })
        }
        response.json(results);
    });
})

// 찜 목록 6/13
router.post('/get_like_list', function (request, response) {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return response.status(401).json({message: '인증코드가 없습니다.'})
    }
    let user_no = decode_user_no(authHeader);

    if (user_no === -1){
        return response.status(401).json({message: '토큰 이상'})
    }

    db.query(sql.get_like_list, [user_no], function (error, results, fields) {
        if (error) {
            return response.status(500).json({
                message: 'DB_error'
            })
        }
        response.json(results);
    });
})




// 나의 거래 이력 (내가 작성한 게시글) 이력 6/7 *** buy 먼저 체크해야 함
router.post('/get_user_post', function (request, response) {
    console.log(request.body)
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
    console.log(user_no)

    if (user_no == -1){
        return response.status(401).json({message: '토큰 이상'})
    }

    db.query(sql.get_user_post, [user_no], function (error, results, fields) {
        if (error) {
            return response.status(500).json({
                message: 'DB_error'
            })
        }
        response.json(results);
    });
})

// 나의 참여 거래 이력 (내가 참여한 게시글) 6/7 *
router.post('/get_user_join_post', function (request, response) {
    console.log(request.body)
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
    console.log(user_no)

    if (user_no == -1){
        return response.status(401).json({message: '토큰 이상'})
    }

    db.query(sql.get_user_join_post, [user_no], function (error, results, fields) {
        if (error) {
            return response.status(500).json({
                message: 'DB_error'
            })
        }
        response.json(results);
    });
})

module.exports = router;