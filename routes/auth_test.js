const { default: axios } = require('axios')
const express = require('express')
const url = require('url')
const router = express.Router();


const getOauthToken = () => {
  window.location.assign(oauth_url)
}

const getToken = async () => {
  const url = new URL(window.location.href)
  const hash = url.hash
  if (hash) {
    const accessToken = hash.split("=")[1].split("&")[0]

    await axios.get('https://www.googleapis.com/oauth2/v2/userinfo?access_token=' + accessToken, { 
      headers: { 
        authorization: `token ${accessToken}`,
        accept: 'application/json' 
      }
    })
      .then(data => {
        setData(data)
      })
        .catch(e => console.log('error'))

  }
}

const getUserInfo = async (accessToken) => {
  try {
    const userInfoApi = await axios.get(
      `https://www.googleapis.com/oauth2/v2/userinfo?alt=json`,
      {
        headers: {
          authorization: `user ${accessToken}`,
        },
      }
    )
    return userInfoApi
  } catch (err) {
    return err
  }
};

module.exports = router;