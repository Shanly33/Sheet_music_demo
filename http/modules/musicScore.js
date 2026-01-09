import request from "../request";

// 随机曲谱
export const getRandomMusic = (data) => {
  return request({
    url: '/api/v1/auth/login',
    method: 'post',
    data
  })
}